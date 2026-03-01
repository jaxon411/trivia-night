# Trivia Night

A Jackbox-style local multiplayer trivia game for Raspberry Pi connected to a TV.

## Features

- 🎮 **Local Multiplayer** - Players join from their phones via WiFi
- 📺 **TV Display** - Full-screen game board with animations
- ⏱️ **15-Second Timer** - Fast-paced gameplay
- 🏆 **Scoring System** - Base points + speed bonuses
- 📱 **Mobile Controllers** - Easy-to-use phone interface
- 🤖 **AI Questions** - Questions fetched from multiple APIs
- 🔌 **Offline Mode** - Fallback questions for offline play
- 📋 **Live Scoreboard** - Real-time score tracking
- 🎉 **Winner Celebration** - Fun final screen with confetti

## Requirements

- Raspberry Pi 3/4/5 (or any Linux machine)
- Python 3.9+
- Internet connection (for first-time setup)
- HDMI display connected to Raspberry Pi
- WiFi network for player connections

## Installation

### On Raspberry Pi

1. **Update your system:**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Python dependencies:**
   ```bash
   sudo apt install python3 python3-pip -y
   sudo apt install chromium-browser -y
   ```

3. **Clone or copy the project:**
   ```bash
   cd ~
   # Copy the trivia-night folder to your Pi
   ```

4. **Make the launch script executable:**
   ```bash
   cd ~/trivia-night
   chmod +x start.sh
   ```

5. **Install Python packages:**
   ```bash
   pip3 install -r requirements.txt
   ```

## Usage

### Starting the Game

1. **Launch the game:**
   ```bash
   ./start.sh
   ```

2. **On the TV:**
   - Chromium will open in kiosk mode
   - Wait for the host to start the game

3. **On players' phones:**
   - Open the join URL shown in the terminal
   - Enter your name
   - Scan the QR code if preferred

### Playing the Game

1. **Host starts the game:**
   - Click "START GAME" on the TV
   - Players can join via phones

2. **Each round:**
   - Question appears on TV and phones
   - 15-second countdown timer
   - Players tap answers on phones
   - Correct answer revealed on TV
   - Scores update

3. **End of game:**
   - Winner announced on TV
   - Final scoreboard displayed
   - "Play Again" to restart

## Scoring

- **1000 points** for correct answer
- **1500 points** if answered in first 5 seconds
- **1250 points** if answered in 5-10 seconds
- **1000 points** if answered in 10-15 seconds
- **0 points** for wrong answers

## Game Settings

- **Questions per game:** 10
- **Timer per question:** 15 seconds
- **Minimum players:** 1
- **Maximum players:** Unlimited (practical limit depends on WiFi)

## Troubleshooting

### Server won't start
```bash
# Check if port 8080 is already in use
sudo lsof -i :8080

# Kill any process using port 8080
sudo kill $(lsof -t -i:8080)
```

### Players can't connect
- Make sure all devices are on the same WiFi network
- Check that the Raspberry Pi's firewall allows port 8080
- Verify the join URL is correct

### No questions available
The game will try multiple APIs in this order:
1. The Trivia API (primary)
2. Open Trivia DB (backup)
3. Local questions.json (fallback)

If all fail, check your internet connection.

### Browser won't open
```bash
# Manual launch
chromium-browser --kiosk http://localhost:8080/tv
```

### Audio issues
The game is visual-only. For sound effects, you can add them later.

## Customization

### Adding Custom Questions

Edit `questions.json` to add your own questions:

```json
{
    "category": "Science",
    "question": "What is the chemical symbol for water?",
    "answers": ["H2O", "CO2", "O2", "NaCl"],
    "correct": 0
}
```

### Changing Game Settings

Edit `server.py` and modify these constants:

```python
NUM_QUESTIONS_PER_GAME = 10  # Change number of questions
QUESTION_TIMER_SECONDS = 15   # Change timer duration
```

### Styling

Edit `static/css/style.css` to customize colors and fonts.

## API References

- The Trivia API: https://the-trivia-api.com/
- Open Trivia DB: https://opentdb.com/

## Troubleshooting

### Error: "No module named 'qrcode'"
```bash
pip3 install qrcode Pillow
```

### Error: "Address already in use"
```bash
# Kill existing server
pkill -f "python3 server.py"

# Or kill on port 8080
sudo kill $(lsof -t -i:8080)
```

### Chromium won't start
```bash
# Run with display
export DISPLAY=:0
chromium-browser --kiosk http://localhost:8080/tv
```

## Development

### Running in Development Mode

```bash
# Start server
python3 server.py

# Or use uvicorn with auto-reload
uvicorn server:app --reload --host 0.0.0.0 --port 8080
```

### Project Structure

```
trivia-night/
├── server.py              # FastAPI server + WebSocket
├── questions.json         # Question bank
├── start.sh              # Launch script
├── requirements.txt      # Python dependencies
├── README.md             # This file
└── static/
    ├── css/
    │   └── style.css     # All styles
    ├── js/
    │   ├── tv.js         # TV game logic
    │   └── player.js     # Phone logic
    ├── tv.html           # TV display
    ├── player.html       # Phone controller
    └── join.html         # Join page
```

## License

This project is provided as-is for educational and entertainment purposes.

## Credits

- Built with FastAPI, WebSocket, and HTML5
- Question APIs: The Trivia API, Open Trivia DB
- Icon set: Font Awesome
- Designed for Raspberry Pi

---

**Enjoy Trivia Night! 🎉**
