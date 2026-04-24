# PartyOn

Stream your Windows system audio over LAN to any device via browser in real-time.

[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.x-3776ab?style=flat-square)](https://www.python.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

⭐ If you like this project, consider starring it on GitHub!

[Overview](#overview) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Development](#development) • [Troubleshooting](#troubleshooting)

## Overview

PartyOn is a lightweight, real-time audio streaming application that captures Windows system audio and streams it to connected clients via WebSocket. Stream to multiple devices simultaneously—phone, tablet, or another PC—all from a simple browser interface. No installation required on clients, no drivers to configure.

### Features

- **Real-time PC audio streaming** over LAN to any device
- **Browser-based client** – works in any modern browser (WebAudio API + WebSocket)
- **Zero client installation** – just open a web page
- **WASAPI loopback support** – captures system audio directly from the sound card
- **Multi-client streaming** – stream to unlimited devices simultaneously
- **Beautiful, responsive UI** – clean player with visualization
- **Robust connection handling** – automatic reconnection and buffer management
- **Lightweight** – minimal dependencies, runs on Python + Node.js

## Quick Start

### Prerequisites

- **Python 3.x** (for backend audio capture and streaming)
- **Windows OS** (required for WASAPI loopback functionality)
- **Node.js 20+** (for development/testing)
- Modern web browser on client device

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mayurkoli8/PartyOn.git
   cd PartyOn
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Enable WASAPI Loopback (Optional but Recommended):**
   - Open Windows **Sound Settings** (Control Panel → Sound → Recording tab)
   - Check **"Show Disabled Devices"**
   - Enable **"Stereo Mix"** if available
   - Alternatively, configure your audio device's loopback functionality in your audio driver settings

### Running the Application

**Option 1: Standard Python command**
```bash
python server.py
```

**Option 2: Windows auto-restart script (recommended)**
```bash
./sexy-audio.bat
```

**Option 3: Bash auto-restart script (Linux/macOS friendly)**
```bash
bash sexy_audio.sh
```

The server will start and display:
```
[timestamp] | audio_streamer | INFO | Starting Audio Streamer Server
[timestamp] | audio_streamer | INFO | HTTP server: http://192.168.x.x:5000
[timestamp] | audio_streamer | INFO | WebSocket server: ws://192.168.x.x:8765
```

### Connecting from a Client Device

1. Find your PC's local IP address (or use `localhost:5000` if on same machine)
2. Open a browser and navigate to:
   ```
   http://YOUR-PC-IP:5000
   ```
3. Click **"Play Stream"** to start listening
4. Adjust volume with the slider
5. Use **Pause**, **Stop**, and **Mute** buttons as needed

## Architecture

PartyOn is built on a hybrid Python/JavaScript stack optimized for real-time audio streaming:

### Backend (Python)

| Component | Role |
|-----------|------|
| `server.py` | Main entry point; orchestrates all services |
| `src/audio_capture.py` | WASAPI loopback audio capture and buffering |
| `src/ws_server.py` | WebSocket server for streaming audio frames |
| `src/http_server.py` | Flask HTTP server serving client HTML and static assets |
| `src/connection_manager.py` | Manages client connections and lifecycle |
| `src/config.py` | Configuration loading and validation |

### Frontend (JavaScript)

| Module | Purpose |
|--------|---------|
| `static/js/ui.js` | Main UI controller and event handling |
| `static/js/connection.js` | WebSocket client and connection management |
| `static/js/audio.js` | Web Audio API integration and playback |

### Communication Flow

```
Windows Audio Output
    ↓
WASAPI Loopback (src/audio_capture.py)
    ↓
Audio Frames (PCM, 44.1kHz, 16-bit)
    ↓
WebSocket Server (src/ws_server.py)
    ↓
Connected Clients (WebSocket)
    ↓
Web Audio API (static/js/audio.js)
    ↓
Browser Speaker Output
```

## Configuration

Edit `config.json` to customize server behavior:

```json
{
  "http_port": 5000,           // HTTP server port
  "ws_port": 8765,             // WebSocket server port
  "sample_rate": 44100,        // Audio sample rate (Hz)
  "channels": 2,               // Audio channels (1=mono, 2=stereo)
  "block_size": 1024,          // Audio frame size in samples
  "log_level": "INFO",         // Logging level (DEBUG, INFO, WARNING, ERROR)
  "max_reconnect_attempts": 10, // Client reconnection attempts
  "client_timeout_seconds": 30  // Client idle timeout
}
```

## Development

### Running Tests

**Python tests (pytest):**
```bash
pytest                    # Run all Python tests
pytest -v               # Verbose output
pytest --cov           # With coverage report
```

**JavaScript tests (Jest):**
```bash
npm test                # Run all JavaScript tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

> [!TIP]
> Tests are organized in language-specific directories: `tests/python/` and `tests/javascript/`. Use the appropriate test runner for each.

### Project Structure

```
PartyOn/
├── server.py                 # Main entry point
├── client.html               # Client UI (served by HTTP)
├── config.json               # Application configuration
├── requirements.txt          # Python dependencies
├── package.json              # Node.js/Jest config
├── sexy-audio.bat            # Windows auto-restart script
├── sexy_audio.sh             # Bash auto-restart script
│
├── src/                      # Python backend modules
│   ├── audio_capture.py      # WASAPI audio capture
│   ├── ws_server.py          # WebSocket streaming server
│   ├── http_server.py        # Flask HTTP server
│   ├── connection_manager.py # Client connection lifecycle
│   └── config.py             # Configuration management
│
├── static/js/                # Frontend JavaScript modules
│   ├── ui.js                 # UI controller
│   ├── connection.js         # WebSocket client
│   └── audio.js              # Audio playback
│
├── tests/
│   ├── python/               # Python tests (pytest)
│   └── javascript/           # JavaScript tests (Jest)
│
└── sound/                    # Test audio files
```

### Key Implementation Details

- **Audio Format:** PCM 16-bit, configurable sample rate (default 44.1kHz), stereo
- **Streaming Protocol:** Binary WebSocket messages with audio frames
- **No Build Step:** Frontend JS is served directly (no bundler like Webpack)
- **Connection Management:** Automatic reconnection with exponential backoff
- **Buffer Strategy:** Circular buffers for smooth playback without stuttering

## Troubleshooting

### No Sound on Client

**Problem:** Client connects but no audio plays.

**Solutions:**
1. Verify WASAPI Loopback is enabled:
   - Open Windows Sound Settings → Recording tab
   - Check that "Stereo Mix" or loopback device is enabled
   - Try right-clicking the device and selecting "Enable"

2. Ensure Windows playback audio is active:
   - Play music/video while testing to confirm audio is being captured

3. Check browser console for errors:
   - Open DevTools (F12) → Console tab
   - Look for WebSocket or audio API errors

### Connection Refused

**Problem:** `Failed to connect to ws://...`

**Solutions:**
1. Verify server is running:
   ```bash
   python server.py
   ```

2. Check firewall settings:
   - Windows Firewall may be blocking ports 5000 or 8765
   - Add `server.py` to Windows Defender Firewall allowed apps
   - Or temporarily disable firewall for testing

3. Verify correct IP address:
   - Use the IP address shown in server output, not `localhost` from a different device
   - Ensure both devices are on the same LAN

4. Check port availability:
   - If port 5000/8765 is in use, modify `config.json` and restart

### High Latency or Stuttering

**Problem:** Audio playback has noticeable delay or drops out frequently.

**Solutions:**
1. Check network quality:
   - Ensure good WiFi signal or use wired connection
   - Run `ping YOUR-PC-IP` from client to check latency (<100ms ideal)

2. Reduce buffer pressure:
   - Confirm no CPU-intensive tasks running on server
   - Close unnecessary applications

3. Adjust configuration:
   - Increase `block_size` in `config.json` for more buffering
   - Reduce other network traffic on the LAN

### Server Crashes on Startup

**Problem:** `Failed to initialize audio capture`

**Solutions:**
1. Ensure audio device is available:
   - Check Windows Sound Settings
   - Verify no other app has exclusive audio access

2. Reinstall audio drivers:
   - Check your audio driver manufacturer's website
   - Update to the latest version

3. Check logs for details:
   - Set `log_level` to `DEBUG` in `config.json`
   - Restart and look for detailed error messages

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Server** | Python 3, Flask, sounddevice, websockets, numpy | Audio capture, real-time streaming, connection management |
| **Frontend Client** | HTML5, CSS3, JavaScript (ES6+) | Browser UI, playback, visualization |
| **Audio Pipeline** | WASAPI Loopback, PCM 16-bit | Windows system audio capture |
| **Testing** | pytest (Python), Jest (JavaScript) | Quality assurance |

## Platform Support

- **Server:** Windows only (WASAPI requirement)
- **Clients:** Any device with a modern web browser (Chrome, Firefox, Safari, Edge)

## Performance

- **Latency:** 50-200ms typical (depends on network)
- **CPU Usage:** 2-5% on server (Intel i5/Ryzen 5 or better)
- **Memory:** ~50-100MB server process
- **Bandwidth:** ~350 kbps for stereo 44.1kHz 16-bit audio
- **Concurrent Clients:** Tested up to 10+ simultaneous connections

## Known Limitations

- **Windows Only:** Backend requires Windows WASAPI API
- **LAN Only:** Not optimized for internet streaming (no compression)
- **No Encryption:** WebSocket traffic is unencrypted (use on trusted networks only)
- **No Pause on Server:** Pauses only client playback, doesn't pause capture

## Getting Help

Experiencing issues? Check the [Troubleshooting](#troubleshooting) section first, then:

- **Open an issue:** [GitHub Issues](https://github.com/Mayurkoli8/PartyOn/issues)
- **Review the code:** Check `src/` and `static/js/` for implementation details

## Contributing

We welcome contributions! Here's how to help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Commit your work (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

For major changes, please open an issue first to discuss proposed changes.

## Author

**Mayur Koli** – Building AI, automation, and networking tools

<div align="left">

<a href="https://github.com/mayurkoli8" target="_blank">
<img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
</a>

<a href="https://www.linkedin.com/in/mayur-koli-484603215/" target="_blank">
<img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"/>
</a>

<a href="https://instagram.com/mentesa.live" target="_blank">
<img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"/>
</a>

<a href="mailto:kolimohit9595@gmail.com">
<img src="https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"/>
</a>

</div>

## License

MIT License – See [LICENSE](LICENSE) file for details

---

**Made with ❤️ by Mayur Koli**
