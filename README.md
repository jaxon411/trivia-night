# 🎮 Trivia Night

A Jackbox-style local multiplayer trivia game designed for Raspberry Pi + TV. Players join on their phones by scanning a QR code, and the TV displays the game board.

## How It Works

1. **Pi runs the server** → TV shows the game board in fullscreen Chromium
2. **Players scan the QR code** on the TV with their phones
3. **Enter a name, tap Join** → you're in the lobby
4. **Host hits Start Game** → 10 questions, 15-second timer each
5. **Answer on your phone** → results show on the TV
6. **Winner announced** at the end → Play Again to go another round

## Quick Start

```bash
git clone https://github.com/jaxon411/trivia-night.git
cd trivia-night
chmod +x start.sh
./start.sh
```

That's it. The script installs dependencies, starts the server, and opens Chromium in kiosk mode.

**Manual start** (if you don't want kiosk mode):
```bash
pip install -r requirements.txt
python3 server.py
# Open http://localhost:8080/tv in a browser
```

Players join at `http://<your-pi-ip>:8080` (shown on the TV screen with a QR code).

## Requirements

- Python 3.9+
- Chromium browser (pre-installed on Pi OS)
- All players on the same local network (WiFi)
- Internet connection for fetching trivia questions (falls back to bundled questions if offline)

## Scoring

| Speed | Points |
|-------|--------|
| Answer in first 5 seconds | 1,500 |
| Answer in 5–10 seconds | 1,250 |
| Answer in last 5 seconds | 1,000 |
| Wrong answer | 0 |

You can change your answer before the timer runs out — your speed bonus is based on your final answer.

## Question Sources

Questions are fetched fresh every game so it never gets stale:

1. **[The Trivia API](https://the-trivia-api.com/)** (primary) — free, no API key
2. **[Open Trivia DB](https://opentdb.com/)** (backup) — free, no API key
3. **Bundled `questions.json`** (offline fallback) — 160+ questions

## Architecture

```
trivia-night/
├── server.py           # FastAPI + WebSocket game engine
├── questions.json      # Offline fallback questions
├── requirements.txt    # Python dependencies
├── start.sh            # One-click launch script
├── static/
│   ├── css/style.css   # TV display styles
│   ├── js/
│   │   ├── tv.js       # TV game display logic
│   │   └── player.js   # Phone controller logic
│   ├── tv.html         # TV display page
│   ├── player.html     # Phone join + game page
│   └── join.html       # (legacy, unused)
└── README.md
```

**Server** (`server.py`): FastAPI app with WebSocket connections for real-time sync. The server is the single source of truth — it drives the timer, auto-advances between rounds, and manages all game state.

**TV Display** (`/tv`): Full-screen game board showing lobby with QR code, questions with countdown bar, answer reveals, scoreboard, and final results.

**Player Controller** (`/` or `/play`): Mobile-optimized phone interface. Enter name → waiting room → answer questions → see scores. No app install needed, just a browser.

## Configuration

Edit the constants at the top of `server.py`:

```python
NUM_QUESTIONS_PER_GAME = 10
QUESTION_TIMER_SECONDS = 15
BASE_POINTS = 1000
SPEED_BONUS_1 = 1500  # First 5 seconds
SPEED_BONUS_2 = 1250  # 5-10 seconds
SPEED_BONUS_3 = 1000  # 10-15 seconds
```

## Future Feature Ideas

### Gameplay
- 🔊 **Sound effects** — correct/wrong buzzes, countdown ticking, winner fanfare
- 🏃 **Speed streaks** — bonus multiplier for consecutive correct answers
- 💀 **Sudden Death round** — final round where wrong = eliminated
- 🎯 **Difficulty progression** — questions get harder as the game goes on
- 🎰 **Category voting** — players vote on the next category between rounds
- ⚡ **Wager rounds** — bet your points on how confident you are
- 🧊 **Power-ups** — freeze someone's screen, 50/50 eliminate two answers, extra time
- 👻 **Elimination mode** — lowest scorer each round gets knocked out

### Content
- 📝 **Custom question packs** — import your own questions via JSON or CSV
- 🎭 **Themed nights** — movie night, sports night, science night, etc.
- 📊 **Difficulty filters** — easy/medium/hard from the API
- 🌍 **Category selection** — pick specific categories before starting

### Technical
- 🎨 **Themes/skins** — different visual styles (retro, neon, minimal)
- 📱 **PWA support** — installable on phones for quick access
- 💾 **Game history** — track wins/losses across sessions
- 🏆 **Leaderboard** — persistent hall of fame
- 🖼️ **Player avatars** — pick an emoji or icon for your player card
- 🔄 **Hot join** — join mid-game (start at 0 points)
- 🎙️ **Host mode** — one player controls game flow from their phone

### Party Features
- 👥 **Team mode** — 2v2 or team-based scoring
- 🍻 **Drinking game rules** — optional rule overlays (wrong answer = drink)
- 📸 **Photo round** — identify things from pictures
- 🎵 **Music round** — "name that tune" with audio clips

## License

MIT — do whatever you want with it.
