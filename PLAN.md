# Trivia Night — Project Plan

## Overview
A Jackbox-style local multiplayer trivia game for Raspberry Pi connected to a TV. Host runs on the Pi, players join via phones on the local network.

## Architecture

### Backend (Python)
- **Framework:** FastAPI + uvicorn
- **WebSockets:** Real-time game state sync to TV and phone clients
- **Game engine:** Manages rounds, timers, scoring, game flow
- **Question sources (priority order):**
  1. **The Trivia API** (`the-trivia-api.com/v2/questions`) — free, no auth, clean format
  2. **Open Trivia DB** (`opentdb.com/api.php`) — free, no auth, 4000+ questions
  3. **Fallback:** bundled `questions.json` for offline play
- Fetch a batch of 50 questions at game start, serve from memory. If both APIs fail, use fallback file.

### Frontend
- **TV Display** (`/tv`): Full-screen game board — shows question, answers, timer, scoreboard, animations
- **Player Controller** (`/play`): Phone-optimized — enter name, select answers, see results
- **Join Screen** (`/`): Landing page showing game code / join instructions

### Game Flow
1. Pi starts server → TV opens `/tv` in fullscreen browser
2. Players scan QR code or type URL on phones → enter name
3. Host (any player or auto) starts game
4. Each round: category shown → question + 4 answers on TV → players answer on phones → reveal correct answer + scores
5. After 10-15 questions → final scoreboard + winner

### Features (MVP)
- [x] Player join via phone browser
- [x] 4-choice multiple choice questions
- [x] 15-second countdown timer per question
- [x] Live scoreboard
- [x] 10 questions per game
- [x] Category selection (random or pick)
- [x] Fun reveal animations (correct/wrong)
- [x] QR code on join screen for easy phone access
- [x] Works offline (all questions bundled)

### Features (Polish — Later Iterations)
- [ ] Sound effects
- [ ] Streak bonuses (answer faster = more points)
- [ ] "Sudden Death" final round
- [ ] Custom question import
- [ ] Themes/skins

## File Structure
```
trivia-night/
├── server.py              # FastAPI app + WebSocket + game engine
├── questions.json          # Question bank
├── start.sh               # Launch script
├── requirements.txt        # Python deps
├── static/
│   ├── tv.html            # TV display
│   ├── player.html        # Phone controller
│   ├── join.html          # Landing/join page
│   ├── css/
│   │   └── style.css      # All styles (TV + phone)
│   └── js/
│       ├── tv.js          # TV game logic
│       ├── player.js      # Phone controller logic
│       └── join.js        # Join page logic
└── README.md
```

## Tech Requirements
- Python 3.9+
- Packages: fastapi, uvicorn, websockets, qrcode, Pillow
- Browser: Chromium (pre-installed on Pi OS)
- No internet needed to play

## Design Notes
- TV UI: Dark theme, large text (readable from couch), vibrant colors per category
- Phone UI: Big tap targets, minimal scrolling, instant feedback
- Timer: Visible countdown bar on both TV and phones
- Scoring: 1000 base points, bonus for speed (first 5 sec = 1.5x, etc.)

## Launch Script (start.sh)
```bash
#!/bin/bash
cd "$(dirname "$0")"
pip install -r requirements.txt --quiet
echo "Starting Trivia Night on port 8080..."
echo "Players join at: http://$(hostname -I | awk '{print $1}'):8080"
python3 server.py &
sleep 2
chromium-browser --kiosk http://localhost:8080/tv &
```
