#!/usr/bin/env python3
"""
Trivia Night - FastAPI + WebSocket Game Server
A Jackbox-style local multiplayer trivia game for Raspberry Pi connected to a TV.
"""

import asyncio
import json
import random
import qrcode
import base64
import io
import os
import re
import html
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.websockets import WebSocket, WebSocketDisconnect
from typing import Dict, List, Set, Optional, Any
from contextlib import asynccontextmanager
import urllib.request
import urllib.error

# Game constants
NUM_QUESTIONS_PER_GAME = 10
QUESTION_TIMER_SECONDS = 15
BASE_POINTS = 1000
SPEED_BONUS_1 = 1500  # First 5 seconds
SPEED_BONUS_2 = 1250  # 5-10 seconds
SPEED_BONUS_3 = 1000  # 10-15 seconds

# Game states
STATE_LOBBY = "lobby"
STATE_QUESTION = "question"
STATE_REVEAL = "reveal"
STATE_SCOREBOARD = "scoreboard"
STATE_FINAL = "final"

# Game state
class GameState:
    def __init__(self):
        self.state = STATE_LOBBY
        self.players: Dict[str, dict] = {}  # player_id -> {name, score, last_answer_time}
        self.questions: List[dict] = []
        self.current_question_index = 0
        self.current_question: Optional[dict] = None
        self.timer = QUESTION_TIMER_SECONDS
        self.answers: Dict[str, tuple] = {}  # player_id -> (answer_index, time_remaining)
        self.question_start_time: Optional[float] = None
        self.players_who_answered: Set[str] = set()
        self.game_over = False
        self.timer_generation = 0  # Incremented each question to cancel stale timers

game_state = GameState()

# API URLs
TRIVIA_API_URL = "https://the-trivia-api.com/v2/questions?limit=50&types=text_choice"
OPENTDB_API_URL = "https://opentdb.com/api.php?amount=50&type=multiple"
QUESTIONS_FILE = Path(__file__).parent / "questions.json"

app = FastAPI(title="Trivia Night")

# Mount static files
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")

templates = Jinja2Templates(directory=Path(__file__).parent / "static")

# WebSocket connections
tv_connections: List[WebSocket] = []
player_connections: List[WebSocket] = []

# Load questions from file
def load_questions_from_file() -> List[dict]:
    """Load questions from the fallback JSON file."""
    if not QUESTIONS_FILE.exists():
        return []
    
    with open(QUESTIONS_FILE, 'r') as f:
        questions = json.load(f)
    
    # Normalize format
    normalized = []
    for q in questions:
        normalized.append({
            "category": q.get("category", "General"),
            "question": q["question"],
            "answers": q["answers"],
            "correct_index": q["correct"]
        })
    
    return normalized

# Fetch questions from The Trivia API
def fetch_trivia_api_questions() -> List[dict]:
    """Fetch questions from the primary API."""
    try:
        with urllib.request.urlopen(TRIVIA_API_URL, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        # Normalize format
        normalized = []
        for q in data:
            # Get all answers
            all_answers = [q["correctAnswer"]] + q["incorrectAnswers"]
            # Shuffle answers
            random.shuffle(all_answers)
            # Find correct index
            correct_index = all_answers.index(q["correctAnswer"])
            
            normalized.append({
                "category": q["category"],
                "question": q["question"]["text"],
                "answers": all_answers,
                "correct_index": correct_index
            })
        
        return normalized
    except Exception as e:
        print(f"Error fetching from The Trivia API: {e}")
        return []

# Fetch questions from Open Trivia DB
def fetch_opentdb_questions() -> List[dict]:
    """Fetch questions from the backup API."""
    try:
        with urllib.request.urlopen(OPENTDB_API_URL, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        if data.get("response_code", 1) != 0:
            return []
        
        results = data.get("results", [])
        normalized = []
        
        for q in results:
            # Decode HTML entities
            question = html.unescape(q["question"])
            correct_answer = html.unescape(q["correct_answer"])
            incorrect_answers = [html.unescape(a) for a in q["incorrect_answers"]]
            
            # Get all answers
            all_answers = [correct_answer] + incorrect_answers
            # Shuffle answers
            random.shuffle(all_answers)
            # Find correct index
            correct_index = all_answers.index(correct_answer)
            
            normalized.append({
                "category": html.unescape(q["category"]),
                "question": question,
                "answers": all_answers,
                "correct_index": correct_index
            })
        
        return normalized
    except Exception as e:
        print(f"Error fetching from Open Trivia DB: {e}")
        return []

# Fetch questions from all sources
def fetch_questions() -> List[dict]:
    """Fetch questions from APIs with fallback to local file."""
    # Try primary API first
    questions = fetch_trivia_api_questions()
    if questions:
        print(f"Fetched {len(questions)} questions from The Trivia API")
        return questions
    
    # Try backup API
    questions = fetch_opentdb_questions()
    if questions:
        print(f"Fetched {len(questions)} questions from Open Trivia DB")
        return questions
    
    # Fall back to local file
    questions = load_questions_from_file()
    if questions:
        print(f"Loaded {len(questions)} questions from fallback file")
        return questions
    
    print("No questions available!")
    return []

# WebSocket helper functions
async def send_to_tv(message: dict):
    """Send a message to all TV clients."""
    for connection in tv_connections[:]:
        try:
            await connection.send_json(message)
        except Exception:
            tv_connections.remove(connection)

async def send_to_player(player_id: str, message: dict):
    """Send a message to a specific player."""
    for connection in player_connections:
        try:
            if connection.state == "open":
                await connection.send_json(message)
        except Exception:
            pass

async def broadcast_player_update():
    """Send updated player list to all clients."""
    player_list = [{"id": pid, "name": p["name"], "score": p["score"]} 
                   for pid, p in game_state.players.items()]
    await send_to_tv({
        "type": "lobby_update",
        "players": player_list,
        "state": game_state.state
    })

async def send_question_to_all():
    """Send current question to TV and all players."""
    question = game_state.current_question
    if not question:
        return
    
    # Send to TV (includes correct_index for display)
    tv_msg = {
        "type": "question",
        "question": {
            "category": question["category"],
            "question": question["question"],
            "answers": question["answers"],
            "correct_index": question["correct_index"]
        },
        "timer": game_state.timer,
        "question_num": game_state.current_question_index + 1,
        "total_questions": NUM_QUESTIONS_PER_GAME
    }
    await send_to_tv(tv_msg)
    
    # Send to players (WITHOUT correct_index to prevent cheating)
    player_msg = {
        "type": "question",
        "question": {
            "category": question["category"],
            "question": question["question"],
            "answers": question["answers"]
        },
        "timer": game_state.timer,
        "question_num": game_state.current_question_index + 1,
        "total_questions": NUM_QUESTIONS_PER_GAME
    }
    for connection in player_connections[:]:
        try:
            await connection.send_json(player_msg)
        except Exception:
            pass

async def send_reveal_to_all():
    """Send reveal information to all clients."""
    question = game_state.current_question
    if not question:
        return
    
    # Calculate scores
    scores = {}
    for player_id, (answer_index, time_remaining) in game_state.answers.items():
        if answer_index == question["correct_index"]:
            # Calculate points based on speed
            # time_remaining = seconds LEFT on clock (15 = just started, 0 = time's up)
            # Higher time_remaining = faster answer = more points
            if time_remaining > 10:  # Answered in first 5 sec
                points = SPEED_BONUS_1  # 1500
            elif time_remaining > 5:  # Answered in 5-10 sec
                points = SPEED_BONUS_2  # 1250
            else:  # Answered in last 5 sec
                points = SPEED_BONUS_3  # 1000
        else:
            points = 0
        
        game_state.players[player_id]["score"] += points
        scores[player_id] = {"points": points}
    
    await send_to_tv({
        "type": "reveal",
        "correct_index": question["correct_index"],
        "answers": question["answers"],
        "scores": scores
    })
    
    # Update player scores
    for connection in player_connections:
        try:
            await connection.send_json({
                "type": "reveal",
                "correct_index": question["correct_index"],
                "answers": question["answers"],
                "scores": scores
            })
        except Exception:
            pass

async def send_scoreboard_to_all():
    """Send scoreboard to TV and all players."""
    player_list = [{"id": pid, "name": p["name"], "score": p["score"]} 
                   for pid, p in sorted(game_state.players.items(), 
                                       key=lambda x: x[1]["score"], reverse=True)]
    
    msg = {
        "type": "scoreboard",
        "players": player_list,
        "next_question_index": game_state.current_question_index + 1
    }
    await send_to_tv(msg)
    for connection in player_connections[:]:
        try:
            await connection.send_json(msg)
        except Exception:
            pass

async def send_final_results():
    """Send final results to TV and all players."""
    player_list = [{"id": pid, "name": p["name"], "score": p["score"]} 
                   for pid, p in sorted(game_state.players.items(), 
                                       key=lambda x: x[1]["score"], reverse=True)]
    
    winner = player_list[0] if player_list else None
    
    msg = {
        "type": "final_results",
        "players": player_list,
        "winner": winner
    }
    await send_to_tv(msg)
    for connection in player_connections[:]:
        try:
            await connection.send_json(msg)
        except Exception:
            pass

# WebSocket endpoints
@app.websocket("/ws/tv")
async def tv_websocket(websocket: WebSocket):
    """WebSocket endpoint for TV display."""
    await websocket.accept()
    tv_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # Block until message or disconnect
    except WebSocketDisconnect:
        if websocket in tv_connections:
            tv_connections.remove(websocket)

@app.websocket("/ws/player")
async def player_websocket(websocket: WebSocket):
    """WebSocket endpoint for player controllers."""
    await websocket.accept()
    player_connections.append(websocket)
    player_id = None
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "join":
                    name = message.get("name", "Player")
                    player_id = name  # Use name as ID (simple, works for small groups)
                    game_state.players[player_id] = {
                        "name": name,
                        "score": 0
                    }
                    await broadcast_player_update()
                    
                    # Send join confirmation
                    await websocket.send_json({
                        "type": "joined",
                        "player_id": player_id,
                        "state": game_state.state
                    })
                    
                    # Send current game state
                    if game_state.state == STATE_QUESTION:
                        await send_question_to_all()
                    elif game_state.state == STATE_REVEAL:
                        await send_reveal_to_all()
                    elif game_state.state == STATE_SCOREBOARD:
                        await send_scoreboard_to_all()
                    
                elif msg_type == "answer":
                    if game_state.state != STATE_QUESTION or player_id is None:
                        continue
                    
                    answer_index = message.get("index", 0)
                    time_remaining = game_state.timer
                    game_state.answers[player_id] = (answer_index, time_remaining)
                    game_state.players_who_answered.add(player_id)
                    
                    # Send answer confirmation to player
                    await websocket.send_json({
                        "type": "answer_received",
                        "index": answer_index
                    })
                    
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        # Clean up player if they joined with name-based ID
        if player_id and player_id in game_state.players:
            del game_state.players[player_id]
        if player_id in game_state.answers:
            del game_state.answers[player_id]
        if player_id in game_state.players_who_answered:
            game_state.players_who_answered.discard(player_id)
        if websocket in player_connections:
            player_connections.remove(websocket)
        await broadcast_player_update()

# HTTP endpoints
@app.get("/")
async def root_page(request: Request):
    """Root URL redirects to player page (single join experience)."""
    return templates.TemplateResponse("player.html", {"request": request})

@app.get("/tv")
async def tv_page(request: Request):
    """Serve the TV page."""
    return templates.TemplateResponse("tv.html", {"request": request})

@app.get("/play")
async def player_page(request: Request):
    """Serve the player page."""
    return templates.TemplateResponse("player.html", {"request": request})

@app.get("/qrcode")
async def get_qrcode():
    """Generate and return QR code for join URL."""
    # Get local IP
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = "127.0.0.1"
    finally:
        s.close()
    
    join_url = f"http://{local_ip}:8080"
    
    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(join_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return {"qr_code": qr_base64, "url": join_url}

# Game control endpoints
@app.post("/api/start")
async def start_game():
    """Start a new game."""
    global game_state
    
    # Save current players
    current_players = {pid: {"name": p["name"], "score": 0} for pid, p in game_state.players.items()}
    
    # Reset game state
    game_state = GameState()
    game_state.players = current_players
    game_state.questions = fetch_questions()[:NUM_QUESTIONS_PER_GAME]
    
    if not game_state.questions:
        raise HTTPException(status_code=500, detail="No questions available")
    
    game_state.state = STATE_LOBBY
    
    # Broadcast lobby state
    await broadcast_player_update()
    
    return {"status": "started", "questions_count": len(game_state.questions)}

@app.post("/api/next_question")
async def next_question():
    """Start the next question."""
    global game_state
    
    if game_state.current_question_index >= len(game_state.questions):
        return {"status": "no_more_questions"}
    
    question = game_state.questions[game_state.current_question_index]
    game_state.current_question = question
    game_state.timer = QUESTION_TIMER_SECONDS
    game_state.answers = {}
    game_state.players_who_answered = set()
    game_state.question_start_time = None
    game_state.timer_generation += 1  # Cancel any previous timer
    
    game_state.state = STATE_QUESTION
    await send_question_to_all()
    
    # Start timer as a background task (don't await — let the endpoint return)
    asyncio.create_task(start_timer(game_state.timer_generation))
    
    return {"status": "question_started", "question_index": game_state.current_question_index}

async def start_timer(generation: int):
    """Start the question timer. Stops if generation changes (new question started)."""
    global game_state
    
    while (game_state.state == STATE_QUESTION 
           and game_state.timer > 0 
           and game_state.timer_generation == generation):
        await asyncio.sleep(1)
        if game_state.timer_generation != generation:
            return  # Stale timer, bail
        game_state.timer -= 1
        
        # Send timer update to TV and all players
        timer_msg = {
            "type": "timer",
            "timer": game_state.timer,
            "question_num": game_state.current_question_index + 1
        }
        await send_to_tv(timer_msg)
        for connection in player_connections[:]:
            try:
                await connection.send_json(timer_msg)
            except Exception:
                pass
    
    if game_state.state == STATE_QUESTION and game_state.timer_generation == generation:
        # Timer expired, move to reveal
        await move_to_reveal()

@app.post("/api/reveal")
async def reveal_answer():
    """Manually reveal the answer (if all players answer or timeout)."""
    await move_to_reveal()
    return {"status": "revealed"}

async def move_to_reveal():
    """Move to reveal state."""
    global game_state
    
    game_state.state = STATE_REVEAL
    await send_reveal_to_all()
    
    # Wait 5 seconds then move to scoreboard
    await asyncio.sleep(5)
    await move_to_scoreboard()

@app.post("/api/scoreboard")
async def show_scoreboard():
    """Show the scoreboard."""
    await move_to_scoreboard()
    return {"status": "scoreboard_shown"}

async def move_to_scoreboard():
    """Move to scoreboard state."""
    global game_state
    
    game_state.state = STATE_SCOREBOARD
    game_state.current_question_index += 1
    
    await send_scoreboard_to_all()
    
    # Wait 5 seconds then start next question or end game
    await asyncio.sleep(5)
    
    if game_state.current_question_index >= len(game_state.questions):
        await end_game()
    else:
        await next_question()

@app.post("/api/end")
async def end_game():
    """End the current game."""
    global game_state
    
    game_state.state = STATE_FINAL
    game_state.game_over = True
    
    await send_final_results()
    await broadcast_player_update()
    
    return {"status": "game_ended"}

@app.post("/api/reset")
async def reset_game():
    """Reset to lobby state."""
    global game_state
    
    game_state = GameState()
    game_state.state = STATE_LOBBY
    
    await broadcast_player_update()
    
    return {"status": "reset"}

@app.get("/api/status")
async def get_status():
    """Get current game status."""
    player_list = [{"id": pid, "name": p["name"], "score": p["score"]} 
                   for pid, p in game_state.players.items()]
    
    return {
        "state": game_state.state,
        "players": player_list,
        "current_question_index": game_state.current_question_index,
        "total_questions": len(game_state.questions)
    }

# Additional helper endpoints
@app.get("/api/questions")
async def get_questions():
    """Get all available questions."""
    questions = fetch_questions()[:NUM_QUESTIONS_PER_GAME]
    return {"questions": questions}

@app.get("/api/players")
async def get_players():
    """Get current players."""
    player_list = [{"id": pid, "name": p["name"], "score": p["score"]} 
                   for pid, p in game_state.players.items()]
    return {"players": player_list}

# Run the server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
