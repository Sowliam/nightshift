import os
import sys
import json
import subprocess
import urllib.request
import urllib.parse
import mimetypes

def get_github_token():
    # Retrieve token from git credential manager
    p = subprocess.Popen(
        ['git', 'credential', 'fill'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    out, err = p.communicate(input="protocol=https\nhost=github.com\n")
    for line in out.splitlines():
        if line.startswith('password='):
            return line.split('password=', 1)[1].strip()
    return None

def main():
    token = get_github_token()
    if not token:
        print("ERROR: Could not retrieve GitHub token from git credentials.", file=sys.stderr)
        sys.exit(1)

    owner = "Sowliam"
    repo = "nightshift"
    tag = "v0.1.0"
    title = "NIGHTSHIFT v0.1.0 - Ultra-Low Latency Voice & Gaming Client"
    
    body = """# 🚀 NIGHTSHIFT v0.1.0 - Ultra-Low Latency Voice Platform

Welcome to the first official desktop release of **NIGHTSHIFT**! 
Built for competitive gamers, teams, and night owls demanding crisp WebRTC audio and lowest possible ping.

---

### 📦 Available Downloads

| Asset | Description | Size |
|---|---|---|
| **[NIGHTSHIFT-Setup-0.1.0.exe](https://github.com/Sowliam/nightshift/releases/download/v0.1.0/NIGHTSHIFT-Setup-0.1.0.exe)** | Interactive Windows Installer with custom drive & folder selection, desktop shortcuts, and modern UI. | ~80 MB |
| **[NIGHTSHIFT-Portable-0.1.0.exe](https://github.com/Sowliam/nightshift/releases/download/v0.1.0/NIGHTSHIFT-Portable-0.1.0.exe)** | Zero-install standalone executable. Run directly from anywhere without admin rights. | ~79 MB |

---

### ✨ Key Features in v0.1.0

- 🎙️ **LiveKit SFU Mesh (Frankfurt EU Core):** High-definition Opus voice channels with sub-80ms routing.
- ⚡ **Accurate Voice Activity Detection:** Calibrated microphone threshold to prevent ambient noise triggers; speaking indicator glows only during real speech.
- 🌐 **Real-Time Network Ping Router:** Automatic low-latency gateway switching between Render Core EU and Cloudflare Anti-Filter Proxy.
- 🎮 **Global In-Game Push-To-Talk (PTT):** Native low-level Windows keyboard & mouse hooks that function seamlessly while running full-screen games.
- 🔊 **Integrated Interactive Soundboard:** Play local MP3/WAV/OGG sound effects directly inside voice channels with individual volume sliders.
- 🛡️ **Clean Authentication:** Secure password management compliant with modern browser and security standards.
- 💻 **Cross-Platform:** Available both as a native Windows desktop app and via the web app.

---

### 🛠️ Verification & Checksums
- Windows 10 / 11 64-bit (`x64`)
- Architecture: Electron 32 + React 18 + LiveKit Client SDK
"""

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "NIGHTSHIFT-Release-Bot",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    # 1. Check if release already exists
    release_url = f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}"
    req = urllib.request.Request(release_url, headers=headers)
    release = None
    try:
        with urllib.request.urlopen(req) as response:
            release = json.loads(response.read().decode('utf-8'))
            print(f"Found existing release ID {release['id']} for tag {tag}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"No existing release for tag {tag}. Creating new release...")
        else:
            print(f"Error checking release: {e.code} {e.reason}", file=sys.stderr)
            sys.exit(1)

    # 2. Create release if not found
    if not release:
        create_url = f"https://api.github.com/repos/{owner}/{repo}/releases"
        payload = json.dumps({
            "tag_name": tag,
            "target_commitish": "main",
            "name": title,
            "body": body,
            "draft": False,
            "prerelease": False
        }).encode('utf-8')

        req = urllib.request.Request(create_url, data=payload, headers={**headers, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as response:
                release = json.loads(response.read().decode('utf-8'))
                print(f"Created release {release['id']}: {release['html_url']}")
        except urllib.error.HTTPError as e:
            print(f"Error creating release: {e.code} - {e.read().decode('utf-8')}", file=sys.stderr)
            sys.exit(1)

    release_id = release['id']
    existing_assets = {a['name']: a for a in release.get('assets', [])}

    # 3. Upload assets
    files_to_upload = [
        "NIGHTSHIFT-Setup-0.1.0.exe",
        "NIGHTSHIFT-Portable-0.1.0.exe"
    ]

    for filename in files_to_upload:
        filepath = os.path.join(os.getcwd(), filename)
        if not os.path.exists(filepath):
            # Fallback to apps/desktop/release
            filepath = os.path.join(os.getcwd(), "apps", "desktop", "release", filename)
        
        if not os.path.exists(filepath):
            print(f"WARNING: File {filename} not found at {filepath}! Skipping.")
            continue

        file_size = os.path.getsize(filepath)
        print(f"\nProcessing {filename} ({file_size / (1024*1024):.2f} MB)...")

        # If asset already exists and matches size, skip
        if filename in existing_assets:
            remote_asset = existing_assets[filename]
            if remote_asset.get('size') == file_size:
                print(f"Asset {filename} already exists on GitHub with matching size ({file_size} bytes). Skipping re-upload.")
                continue
            else:
                del_asset_id = remote_asset['id']
                print(f"Deleting older/partial asset ID {del_asset_id}...")
                del_req = urllib.request.Request(
                    f"https://api.github.com/repos/{owner}/{repo}/releases/assets/{del_asset_id}",
                    headers=headers,
                    method='DELETE'
                )
                with urllib.request.urlopen(del_req) as del_resp:
                    pass

        # Upload asset
        upload_url = f"https://uploads.github.com/repos/{owner}/{repo}/releases/{release_id}/assets?name={urllib.parse.quote(filename)}"
        print(f"Uploading {filename} to GitHub Releases...")

        with open(filepath, 'rb') as f:
            file_data = f.read()

        upload_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(file_size),
            "User-Agent": "NIGHTSHIFT-Release-Bot",
            "Accept": "application/vnd.github+json"
        }

        up_req = urllib.request.Request(upload_url, data=file_data, headers=upload_headers)
        with urllib.request.urlopen(up_req) as up_resp:
            res_data = json.loads(up_resp.read().decode('utf-8'))
            print(f"Successfully uploaded: {res_data.get('browser_download_url')}")

    print("\nAll assets published successfully!")
    print(f"Release URL: {release['html_url']}")

if __name__ == '__main__':
    main()

