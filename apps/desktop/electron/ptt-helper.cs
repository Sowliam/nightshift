using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

class PttRawInputForm : Form
{
    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct RAWMOUSE
    {
        [FieldOffset(0)]
        public ushort usFlags;
        [FieldOffset(4)]
        public uint ulButtons;
        [FieldOffset(4)]
        public ushort usButtonFlags;
        [FieldOffset(6)]
        public ushort usButtonData;
        [FieldOffset(8)]
        public uint ulRawButtons;
        [FieldOffset(12)]
        public int lLastX;
        [FieldOffset(16)]
        public int lLastY;
        [FieldOffset(20)]
        public uint ulExtraInformation;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

    const int RIDEV_INPUTSINK = 0x00000100;
    const int WM_INPUT = 0x00FF;
    const uint RID_INPUT = 0x10000003;

    // Mouse raw input flags
    const ushort RI_MOUSE_RIGHT_BUTTON_DOWN = 0x0004;
    const ushort RI_MOUSE_RIGHT_BUTTON_UP   = 0x0008;
    const ushort RI_MOUSE_MIDDLE_BUTTON_DOWN = 0x0010;
    const ushort RI_MOUSE_MIDDLE_BUTTON_UP   = 0x0020;
    const ushort RI_MOUSE_BUTTON_4_DOWN     = 0x0040;
    const ushort RI_MOUSE_BUTTON_4_UP       = 0x0080;
    const ushort RI_MOUSE_BUTTON_5_DOWN     = 0x0100;
    const ushort RI_MOUSE_BUTTON_5_UP       = 0x0200;

    public static volatile int targetVKey = 32; // Default VK_SPACE (32)
    public static volatile bool isEnabled = false;
    public static volatile bool isRecording = false;
    public static volatile bool isPttActive = false;

    private static readonly object lockObj = new object();

    private static readonly string logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ptt_debug.log");

    public static void Log(string msg)
    {
        try
        {
            string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] [PTT-RawInput PID:{1}] {2}\r\n",
                DateTime.Now, System.Diagnostics.Process.GetCurrentProcess().Id, msg);
            File.AppendAllText(logFile, line);
        }
        catch { }
    }

    private static long CurrentTimestamp()
    {
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public PttRawInputForm()
    {
        this.WindowState = FormWindowState.Minimized;
        this.ShowInTaskbar = false;
        this.FormBorderStyle = FormBorderStyle.None;
        this.Opacity = 0;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);

        // Register both Keyboard and Mouse for background Raw Input (RIDEV_INPUTSINK)
        RAWINPUTDEVICE[] rid = new RAWINPUTDEVICE[2];

        // 1. Keyboard
        rid[0].usUsagePage = 0x01; // Generic Desktop Controls
        rid[0].usUsage = 0x06;     // Keyboard
        rid[0].dwFlags = RIDEV_INPUTSINK;
        rid[0].hwndTarget = this.Handle;

        // 2. Mouse
        rid[1].usUsagePage = 0x01; // Generic Desktop Controls
        rid[1].usUsage = 0x02;     // Mouse
        rid[1].dwFlags = RIDEV_INPUTSINK;
        rid[1].hwndTarget = this.Handle;

        bool success = RegisterRawInputDevices(rid, (uint)rid.Length, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)));
        Log(string.Format("RegisterRawInputDevices result: {0}, Handle: 0x{1:X}", success, this.Handle.ToInt64()));
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_INPUT)
        {
            uint dwSize = 0;
            uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
            GetRawInputData(m.LParam, RID_INPUT, IntPtr.Zero, ref dwSize, headerSize);

            if (dwSize > 0)
            {
                IntPtr buffer = Marshal.AllocHGlobal((int)dwSize);
                try
                {
                    if (GetRawInputData(m.LParam, RID_INPUT, buffer, ref dwSize, headerSize) == dwSize)
                    {
                        RAWINPUTHEADER header = (RAWINPUTHEADER)Marshal.PtrToStructure(buffer, typeof(RAWINPUTHEADER));
                        IntPtr dataPtr = new IntPtr(buffer.ToInt64() + headerSize);

                        if (header.dwType == 1) // RIM_TYPEKEYBOARD
                        {
                            RAWKEYBOARD kb = (RAWKEYBOARD)Marshal.PtrToStructure(dataPtr, typeof(RAWKEYBOARD));
                            ushort vkey = kb.VKey;
                            bool isUp = (kb.Flags & 1) != 0; // RI_KEY_BREAK = 1 (KeyUp), RI_KEY_MAKE = 0 (KeyDown)
                            HandleRawKeyEvent(vkey, !isUp);
                        }
                        else if (header.dwType == 0) // RIM_TYPEMOUSE
                        {
                            RAWMOUSE mouse = (RAWMOUSE)Marshal.PtrToStructure(dataPtr, typeof(RAWMOUSE));
                            HandleRawMouseEvent(mouse.usButtonFlags);
                        }
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(buffer);
                }
            }
        }
        base.WndProc(ref m);
    }

    private static void HandleRawKeyEvent(int vk, bool isDown)
    {
        if (vk <= 0 || vk > 255) return;

        // 1. Key Recording Mode
        if (isRecording && isDown)
        {
            if (vk == 1) return; // Skip Left Click
            isRecording = false;
            string recLine = string.Format("RECORDED:{0}:{1}", vk, CurrentTimestamp());
            Console.WriteLine(recLine);
            Console.Out.Flush();
            Log("Key recorded (RawInput): " + recLine);
            return;
        }

        // 2. Push to Talk Active Monitoring
        if (!isEnabled || targetVKey <= 0) return;

        if (vk == targetVKey)
        {
            SetPttPhysicalState(isDown, "Keyboard VK=" + vk);
        }
    }

    private static void HandleRawMouseEvent(ushort btnFlags)
    {
        if (btnFlags == 0) return;

        int vk = 0;
        bool isDown = false;
        bool hasEvent = false;

        if ((btnFlags & RI_MOUSE_BUTTON_4_DOWN) != 0) { vk = 5; isDown = true; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_BUTTON_4_UP) != 0) { vk = 5; isDown = false; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_BUTTON_5_DOWN) != 0) { vk = 6; isDown = true; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_BUTTON_5_UP) != 0) { vk = 6; isDown = false; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_MIDDLE_BUTTON_DOWN) != 0) { vk = 4; isDown = true; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_MIDDLE_BUTTON_UP) != 0) { vk = 4; isDown = false; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_RIGHT_BUTTON_DOWN) != 0) { vk = 2; isDown = true; hasEvent = true; }
        else if ((btnFlags & RI_MOUSE_RIGHT_BUTTON_UP) != 0) { vk = 2; isDown = false; hasEvent = true; }

        if (!hasEvent) return;

        // 1. Key Recording Mode
        if (isRecording && isDown)
        {
            isRecording = false;
            string recLine = string.Format("RECORDED:{0}:{1}", vk, CurrentTimestamp());
            Console.WriteLine(recLine);
            Console.Out.Flush();
            Log("Mouse button recorded (RawInput): " + recLine);
            return;
        }

        // 2. Push to Talk Active Monitoring
        if (!isEnabled || targetVKey <= 0) return;

        if (vk == targetVKey)
        {
            SetPttPhysicalState(isDown, "Mouse VK=" + vk);
        }
    }

    private static void SetPttPhysicalState(bool isDown, string source)
    {
        lock (lockObj)
        {
            if (isDown)
            {
                if (!isPttActive)
                {
                    isPttActive = true;
                    string pttLine = string.Format("PTT:1:{0}", CurrentTimestamp());
                    Console.WriteLine(pttLine);
                    Console.Out.Flush();
                    Log(string.Format("PTT ACTIVATED ({0}) -> {1}", source, pttLine));
                }
            }
            else if (isPttActive)
            {
                isPttActive = false;
                string pttLine = string.Format("PTT:0:{0}", CurrentTimestamp());
                Console.WriteLine(pttLine);
                Console.Out.Flush();
                Log("PTT DEACTIVATED (" + source + ") -> " + pttLine);
            }
        }
    }

    public static void ForceDeactivate()
    {
        lock (lockObj)
        {
            if (isPttActive)
            {
                isPttActive = false;
                string pttLine = string.Format("PTT:0:{0}", CurrentTimestamp());
                Console.WriteLine(pttLine);
                Console.Out.Flush();
                Log("PTT FORCE DEACTIVATED -> " + pttLine);
            }
        }
    }
}

class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding = Encoding.UTF8;
        PttRawInputForm.Log(string.Format("RawInput PTT helper started. BaseDirectory: {0}", AppDomain.CurrentDomain.BaseDirectory));

        // Background thread to read commands from Electron Main via stdin
        Thread readerThread = new Thread(() =>
        {
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    line = line.Trim();
                    PttRawInputForm.Log("Stdin command: " + line);

                    if (line.StartsWith("SET_KEY:", StringComparison.OrdinalIgnoreCase))
                    {
                        int vk;
                        if (int.TryParse(line.Substring(8).Trim(), out vk))
                        {
                            PttRawInputForm.targetVKey = vk;
                            PttRawInputForm.Log(string.Format("Configured target VK: {0}", vk));
                        }
                    }
                    else if (line.StartsWith("ENABLE:", StringComparison.OrdinalIgnoreCase))
                    {
                        bool en;
                        if (bool.TryParse(line.Substring(7).Trim(), out en))
                        {
                            PttRawInputForm.isEnabled = en;
                            PttRawInputForm.Log(string.Format("Enabled state: {0}", en));
                            if (!en)
                            {
                                PttRawInputForm.ForceDeactivate();
                            }
                        }
                    }
                    else if (line.Equals("START_RECORD", StringComparison.OrdinalIgnoreCase))
                    {
                        PttRawInputForm.isRecording = true;
                        PttRawInputForm.Log("Recording mode started");
                    }
                    else if (line.Equals("STOP_RECORD", StringComparison.OrdinalIgnoreCase))
                    {
                        PttRawInputForm.isRecording = false;
                        PttRawInputForm.Log("Recording mode stopped");
                    }
                    else if (line.Equals("PING", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine("PONG");
                        Console.Out.Flush();
                        PttRawInputForm.Log("Responded PONG");
                    }
                    else if (line.Equals("GET_STATE", StringComparison.OrdinalIgnoreCase))
                    {
                        string st = string.Format("STATE:vk={0}:enabled={1}:down={2}:rec={3}",
                            PttRawInputForm.targetVKey, PttRawInputForm.isEnabled, PttRawInputForm.isPttActive, PttRawInputForm.isRecording);
                        Console.WriteLine(st);
                        Console.Out.Flush();
                        PttRawInputForm.Log("Responded: " + st);
                    }
                    else if (line.Equals("QUIT", StringComparison.OrdinalIgnoreCase))
                    {
                        PttRawInputForm.Log("Exiting on QUIT command");
                        Application.Exit();
                        Environment.Exit(0);
                    }
                }
            }
            catch (Exception ex)
            {
                PttRawInputForm.Log("Stdin reader exception: " + ex.Message);
            }
        });
        readerThread.IsBackground = true;
        readerThread.Start();

        // Run Windows message pump on main STA thread for Raw Input
        Application.Run(new PttRawInputForm());
    }
}
