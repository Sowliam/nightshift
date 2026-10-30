using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Global push-to-talk listener.
// GetAsyncKeyState and low-level hooks are blocked by Windows UIPI while an
// elevated game is in front, which is why PTT only worked as Administrator.
// Raw Input with RIDEV_INPUTSINK is delivered to our own hidden window, so it
// still arrives when a higher-integrity game has focus, without consuming the key.
class Program
{
    const int WM_INPUT = 0x00FF;
    const int WM_CLOSE = 0x0010;
    const int WM_APP_QUIT = 0x8001;
    const uint RID_INPUT = 0x10000003;
    const uint RIDEV_INPUTSINK = 0x00000100;
    const uint RIM_TYPEMOUSE = 0;
    const uint RIM_TYPEKEYBOARD = 1;
    const ushort RI_KEY_BREAK = 1;

    const ushort RI_MOUSE_LEFT_BUTTON_DOWN = 0x0001;
    const ushort RI_MOUSE_LEFT_BUTTON_UP = 0x0002;
    const ushort RI_MOUSE_RIGHT_BUTTON_DOWN = 0x0004;
    const ushort RI_MOUSE_RIGHT_BUTTON_UP = 0x0008;
    const ushort RI_MOUSE_MIDDLE_BUTTON_DOWN = 0x0010;
    const ushort RI_MOUSE_MIDDLE_BUTTON_UP = 0x0020;
    const ushort RI_MOUSE_BUTTON_4_DOWN = 0x0040;
    const ushort RI_MOUSE_BUTTON_4_UP = 0x0080;
    const ushort RI_MOUSE_BUTTON_5_DOWN = 0x0100;
    const ushort RI_MOUSE_BUTTON_5_UP = 0x0200;

    const int VK_LBUTTON = 0x01;
    const int VK_RBUTTON = 0x02;
    const int VK_MBUTTON = 0x04;
    const int VK_XBUTTON1 = 0x05;
    const int VK_XBUTTON2 = 0x06;
    const int VK_SHIFT = 0x10;
    const int VK_LSHIFT = 0xA0;
    const int VK_RSHIFT = 0xA1;
    const int VK_CONTROL = 0x11;
    const int VK_LCONTROL = 0xA2;
    const int VK_RCONTROL = 0xA3;
    const int VK_MENU = 0x12;
    const int VK_LMENU = 0xA4;
    const int VK_RMENU = 0xA5;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASSEX
    {
        public int cbSize;
        public int style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

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
    struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern ushort RegisterClassEx(ref WNDCLASSEX lpwcx);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateWindowEx(
        uint dwExStyle, string lpClassName, string lpWindowName, uint dwStyle,
        int x, int y, int nWidth, int nHeight,
        IntPtr hWndParent, IntPtr hMenu, IntPtr hInstance, IntPtr lpParam);

    [DllImport("user32.dll")]
    static extern IntPtr DefWindowProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool DestroyWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    static extern short GetAsyncKeyState(int vKey);

    private static readonly WndProcDelegate WndProcKeeper = WndProc;
    private static IntPtr hwnd = IntPtr.Zero;
    private static readonly object consoleLock = new object();

    private static volatile int currentVKey = 32;
    private static volatile bool isEnabled = false;
    private static volatile bool isDown = false;
    private static volatile bool isRecording = false;
    private static bool rawInputReady = false;

    private static readonly string logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ptt_debug.log");

    private static void Log(string msg)
    {
        try
        {
            string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] [PTT-Helper PID:{1}] {2}\r\n",
                DateTime.Now, System.Diagnostics.Process.GetCurrentProcess().Id, msg);
            File.AppendAllText(logFile, line);
        }
        catch { }
    }

    private static long CurrentTimestamp()
    {
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    private static void WriteLine(string line)
    {
        lock (consoleLock)
        {
            Console.WriteLine(line);
            Console.Out.Flush();
        }
    }

    private static bool SameKey(int incoming, int target)
    {
        if (incoming == target) return true;
        if (target == VK_SHIFT && (incoming == VK_LSHIFT || incoming == VK_RSHIFT)) return true;
        if (target == VK_LSHIFT && (incoming == VK_SHIFT || incoming == VK_RSHIFT)) return true;
        if (target == VK_RSHIFT && (incoming == VK_SHIFT || incoming == VK_LSHIFT)) return true;
        if (target == VK_CONTROL && (incoming == VK_LCONTROL || incoming == VK_RCONTROL)) return true;
        if (target == VK_LCONTROL && (incoming == VK_CONTROL || incoming == VK_RCONTROL)) return true;
        if (target == VK_RCONTROL && (incoming == VK_CONTROL || incoming == VK_LCONTROL)) return true;
        if (target == VK_MENU && (incoming == VK_LMENU || incoming == VK_RMENU)) return true;
        if (target == VK_LMENU && (incoming == VK_MENU || incoming == VK_RMENU)) return true;
        if (target == VK_RMENU && (incoming == VK_MENU || incoming == VK_LMENU)) return true;
        return false;
    }

    private static void EmitPtt(bool active, string source)
    {
        if (active == isDown) return;
        isDown = active;
        string pttLine = string.Format("PTT:{0}:{1}", active ? "1" : "0", CurrentTimestamp());
        WriteLine(pttLine);
        Log(string.Format("PTT changed -> {0} via {1}: {2}", active ? "DOWN" : "UP", source, pttLine));
    }

    private static void ConsiderKey(int vk, bool down, string source)
    {
        if (vk <= 0 || vk == 255) return;

        if (isRecording)
        {
            if (vk == VK_LBUTTON) return;
            isRecording = false;
            string recLine = string.Format("RECORDED:{0}:{1}", vk, CurrentTimestamp());
            WriteLine(recLine);
            Log("Recorded key: " + recLine);
            return;
        }

        if (!isEnabled || currentVKey <= 0) return;
        if (!SameKey(vk, currentVKey)) return;
        EmitPtt(down, source);
    }

    private static void ConsiderMouseFlags(ushort flags)
    {
        if ((flags & RI_MOUSE_LEFT_BUTTON_DOWN) != 0) ConsiderKey(VK_LBUTTON, true, "raw-mouse");
        if ((flags & RI_MOUSE_LEFT_BUTTON_UP) != 0) ConsiderKey(VK_LBUTTON, false, "raw-mouse");
        if ((flags & RI_MOUSE_RIGHT_BUTTON_DOWN) != 0) ConsiderKey(VK_RBUTTON, true, "raw-mouse");
        if ((flags & RI_MOUSE_RIGHT_BUTTON_UP) != 0) ConsiderKey(VK_RBUTTON, false, "raw-mouse");
        if ((flags & RI_MOUSE_MIDDLE_BUTTON_DOWN) != 0) ConsiderKey(VK_MBUTTON, true, "raw-mouse");
        if ((flags & RI_MOUSE_MIDDLE_BUTTON_UP) != 0) ConsiderKey(VK_MBUTTON, false, "raw-mouse");
        if ((flags & RI_MOUSE_BUTTON_4_DOWN) != 0) ConsiderKey(VK_XBUTTON1, true, "raw-mouse");
        if ((flags & RI_MOUSE_BUTTON_4_UP) != 0) ConsiderKey(VK_XBUTTON1, false, "raw-mouse");
        if ((flags & RI_MOUSE_BUTTON_5_DOWN) != 0) ConsiderKey(VK_XBUTTON2, true, "raw-mouse");
        if ((flags & RI_MOUSE_BUTTON_5_UP) != 0) ConsiderKey(VK_XBUTTON2, false, "raw-mouse");
    }

    private static void HandleRawInput(IntPtr lParam)
    {
        uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
        uint size = 0;
        GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        if (size == 0 || size > 1024) return;

        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            uint filled = size;
            uint read = GetRawInputData(lParam, RID_INPUT, buffer, ref filled, headerSize);
            if (read == uint.MaxValue || read == 0) return;

            uint type = (uint)Marshal.ReadInt32(buffer);
            int data = Marshal.SizeOf(typeof(RAWINPUTHEADER));
            if (type == RIM_TYPEKEYBOARD)
            {
                ushort flags = (ushort)Marshal.ReadInt16(buffer, data + 2);
                ushort vkey = (ushort)Marshal.ReadInt16(buffer, data + 6);
                bool up = (flags & RI_KEY_BREAK) != 0;
                ConsiderKey(vkey, !up, "raw-keyboard");
            }
            else if (type == RIM_TYPEMOUSE)
            {
                ushort buttonFlags = (ushort)Marshal.ReadInt16(buffer, data + 4);
                if (buttonFlags != 0) ConsiderMouseFlags(buttonFlags);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_INPUT)
        {
            try { HandleRawInput(lParam); }
            catch (Exception ex) { Log("WM_INPUT exception: " + ex.Message); }
            return IntPtr.Zero;
        }
        if (msg == WM_APP_QUIT || msg == WM_CLOSE)
        {
            DestroyWindow(hWnd);
            return IntPtr.Zero;
        }
        if (msg == 0x0002) // WM_DESTROY
        {
            PostQuit();
            return IntPtr.Zero;
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    [DllImport("user32.dll")]
    static extern void PostQuitMessage(int nExitCode);

    private static void PostQuit()
    {
        PostQuitMessage(0);
    }

    private static bool StartRawInputWindow()
    {
        IntPtr hInstance = GetModuleHandle(null);
        WNDCLASSEX wc = new WNDCLASSEX();
        wc.cbSize = Marshal.SizeOf(typeof(WNDCLASSEX));
        wc.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(WndProcKeeper);
        wc.hInstance = hInstance;
        wc.lpszClassName = "NightshiftPttRawInput";

        ushort atom = RegisterClassEx(ref wc);
        if (atom == 0)
        {
            Log("RegisterClassEx failed: " + Marshal.GetLastWin32Error());
            return false;
        }

        // Hidden real window. Message-only windows do not receive RIDEV_INPUTSINK.
        hwnd = CreateWindowEx(
            0x00000080, // WS_EX_TOOLWINDOW
            wc.lpszClassName,
            "Nightshift PTT",
            0,
            0, 0, 0, 0,
            IntPtr.Zero, IntPtr.Zero, hInstance, IntPtr.Zero);

        if (hwnd == IntPtr.Zero)
        {
            Log("CreateWindowEx failed: " + Marshal.GetLastWin32Error());
            return false;
        }

        RAWINPUTDEVICE[] devices = new RAWINPUTDEVICE[2];
        devices[0].usUsagePage = 0x01;
        devices[0].usUsage = 0x06; // keyboard
        devices[0].dwFlags = RIDEV_INPUTSINK;
        devices[0].hwndTarget = hwnd;
        devices[1].usUsagePage = 0x01;
        devices[1].usUsage = 0x02; // mouse
        devices[1].dwFlags = RIDEV_INPUTSINK;
        devices[1].hwndTarget = hwnd;

        bool ok = RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)));
        if (!ok)
        {
            Log("RegisterRawInputDevices failed: " + Marshal.GetLastWin32Error());
            return false;
        }

        rawInputReady = true;
        Log("Raw Input sink registered. PTT works in foreground games without administrator.");
        return true;
    }

    private static void PollFallback()
    {
        while (true)
        {
            try
            {
                if (isRecording)
                {
                    for (int vk = 1; vk <= 254; vk++)
                    {
                        if (vk == VK_LBUTTON) continue;
                        short state = GetAsyncKeyState(vk);
                        if ((state & 0x8000) != 0)
                        {
                            ConsiderKey(vk, true, "fallback-poll");
                            Thread.Sleep(200);
                            break;
                        }
                    }
                }
                else if (isEnabled && currentVKey > 0)
                {
                    short rawState = GetAsyncKeyState(currentVKey);
                    ConsiderKey(currentVKey, (rawState & 0x8000) != 0, "fallback-poll");
                }
            }
            catch (Exception ex)
            {
                Log("Fallback poll exception: " + ex.Message);
            }
            Thread.Sleep(10);
        }
    }

    static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding = Encoding.UTF8;
        Log(string.Format("Native PTT helper started. BaseDirectory: {0}", AppDomain.CurrentDomain.BaseDirectory));

        Thread readerThread = new Thread(() =>
        {
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    line = line.Trim();
                    Log("Stdin received: " + line);

                    if (line.StartsWith("SET_KEY:", StringComparison.OrdinalIgnoreCase))
                    {
                        int vk;
                        if (int.TryParse(line.Substring(8).Trim(), out vk))
                        {
                            currentVKey = vk;
                            Log(string.Format("Configured VK: {0}", vk));
                        }
                    }
                    else if (line.StartsWith("ENABLE:", StringComparison.OrdinalIgnoreCase))
                    {
                        bool en;
                        if (bool.TryParse(line.Substring(7).Trim(), out en))
                        {
                            isEnabled = en;
                            Log(string.Format("Enabled state: {0}", en));
                            if (!en && isDown)
                            {
                                isDown = false;
                                string outLine = string.Format("PTT:0:{0}", CurrentTimestamp());
                                WriteLine(outLine);
                                Log("PTT forced off: " + outLine);
                            }
                        }
                    }
                    else if (line.Equals("START_RECORD", StringComparison.OrdinalIgnoreCase))
                    {
                        isRecording = true;
                        Log("Recording mode started");
                    }
                    else if (line.Equals("STOP_RECORD", StringComparison.OrdinalIgnoreCase))
                    {
                        isRecording = false;
                        Log("Recording mode stopped");
                    }
                    else if (line.Equals("PING", StringComparison.OrdinalIgnoreCase))
                    {
                        WriteLine("PONG");
                        Log("Responded PONG");
                    }
                    else if (line.Equals("GET_STATE", StringComparison.OrdinalIgnoreCase))
                    {
                        string st = string.Format("STATE:vk={0}:enabled={1}:down={2}:rec={3}:raw={4}",
                            currentVKey, isEnabled, isDown, isRecording, rawInputReady);
                        WriteLine(st);
                        Log("Responded: " + st);
                    }
                    else if (line.Equals("QUIT", StringComparison.OrdinalIgnoreCase))
                    {
                        Log("Exiting on QUIT command");
                        if (hwnd != IntPtr.Zero) PostMessage(hwnd, WM_APP_QUIT, IntPtr.Zero, IntPtr.Zero);
                        else Environment.Exit(0);
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Reader thread exception: " + ex.Message);
            }
        });
        readerThread.IsBackground = true;
        readerThread.Start();

        if (!StartRawInputWindow())
        {
            Log("Raw Input unavailable. Falling back to GetAsyncKeyState. Elevated games will not receive PTT unless Nightshift is run as administrator.");
            PollFallback();
            return;
        }

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }
}
