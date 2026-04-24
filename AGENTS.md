# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-04
**Commit:** 7353da1
**Branch:** main

## OVERVIEW
PartyOn is a real-time web audio streaming application with a Python backend and JavaScript frontend. It captures audio from the server and streams it to connected clients via WebSockets for playback and visualization.

## STRUCTURE
```
.
├── src/        # Python backend modules (WebSocket, HTTP server, audio capture)
├── static/     # Static web assets
│   └── js/     # Frontend JavaScript modules (audio playback, UI, WebSocket client)
├── tests/      # Dual-language testing structure
│   ├── javascript/ # Jest tests for frontend
│   └── python/     # pytest tests for backend
├── server.py   # Main backend entry point
├── client.html # Main frontend entry point (served by HTTP server)
├── config.json # Application configuration
└── pytest.ini  # Python test configuration
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Backend server startup | `server.py` | Initializes HTTP, WebSocket, and audio capture components |
| Client-side logic | `static/js/*.js` | Audio decoding (`audio.js`), WebSocket (`connection.js`), UI (`ui.js`) |
| Backend API/logic | `src/*.py` | `ws_server.py`, `http_server.py`, `audio_capture.py` |
| Application settings | `config.json` | Port numbers, audio format, logging levels |
| Python tests | `tests/python/` | Uses `pytest` |
| JavaScript tests | `tests/javascript/` | Uses `jest` (configured in `package.json`) |

## CONVENTIONS
- **Language Separation:** Python for backend (in `src/`), JS for frontend (in `static/js/`). Note: `src/` is unusually used for Python, while JS is in `static/`.
- **Testing:** Dual-framework setup. Python uses `pytest` (`test_*.py`), JS uses `jest` with JSDOM. Tests are explicitly split into `tests/python` and `tests/javascript`.
- **No Build Step:** Frontend JS currently uses no bundler (no Webpack/Vite). Files are served directly as static assets.
- **Entry Points:** Backend is `server.py` (not app.py/main.py), frontend is `client.html` (not index.html).

## ANTI-PATTERNS (THIS PROJECT)
- Do not add JavaScript files to `src/`. `src/` is strictly for Python backend modules in this project.
- Do not mix Python and JavaScript tests; keep them in their respective `tests/python` and `tests/javascript` folders.
- Do not rely on CI/CD; no automated workflows are currently configured.

## COMMANDS
```bash
# Run the application
python server.py

# Run Python tests
pytest

# Run JavaScript tests
npm test
```
