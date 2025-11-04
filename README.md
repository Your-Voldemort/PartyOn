# Sexy Audio Streamer

**Stream your Windows system audio over LAN to any device via browser. No apps. No drivers. WASAPI loopback.**

## Features

* **Real-time PC audio streaming** to your phone, tablet, or another PC.
* **Browser-based:** Works instantly inside any modern browser (WebAudio + WebSocket).
* **Zero-installation on Client:** Just a web page!
* **WASAPI Loopback:** Captures system audio output directly from the sound card, requiring **no microphone** (Stereo Mix is also supported).
* **Multi-Client Streaming:** Stream to multiple devices simultaneously.
* **Beautiful UI:** Clean, responsive player interface.
* **Robust Connection:** Features auto-reconnect and queue buffering.

---

## Installation

### Prerequisites

* Python 3.x
* Windows OS (Required for WASAPI functionality).

### Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Mayurkoli8/PartyOn.git
    cd partyon
    ```
2.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Enable WASAPI Loopback (Recommended):**
    * Open your **Windows Sound Panel** (Recording tab).
    * Ensure **"Show Disabled Devices"** is checked.
    * Enable **"Stereo Mix,"** or verify that the main playback device's loopback functionality is accessible by the application.

---

##  Usage

### Starting the Server

Use the standard command or the auto-restart script:

1.  **Standard Python Command:**
    ```bash
    python server.py
    ```
2.  **Windows Auto-Restart Script (Recommended):**
    ```bash
    sexy-audio.bat
    ```

### Connecting from a Client Device

1.  Find your PC's **local IP Address**.
2.  Open a browser (on any device) and navigate to:
    ```
    http://YOUR-PC-IP:5000
    ```
3.  Click the **"Play Stream"** button on the page.

---

## Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Backend** | Python (Flask, WebSockets, sounddevice) | Audio capture, web hosting, and stream management. |
| **Frontend** | WebAudio API, HTML/CSS/JS | Audio decoding and playback in the client browser. |

---

## File Structure
```bash
    client.html     # Player UI
    server.py       # Audio capture + stream server
    sexy-audio.bat  # Auto restart batch
    requirements.txt
    README.md
    LICENSE
```

---

## Windows Setup Tips

* **No Sound:** Confirm that a loopback device (like Stereo Mix) is **Enabled** in the Windows Sound Recording panel.
* **Connection Errors:** Check your **Windows Firewall** settings to ensure port **5000** is open for `server.py`.

## License

MIT — Free to use and modify.