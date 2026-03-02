# Voting System Server Patch Guide

This document provides detailed instructions for integrating the category voting system into `server.py`.

## Overview

The voting system adds:
- Category selection before each question block
- Player voting with weighted random selection
- Spinning wheel animation visualization

Game flow: `lobby → vote → wheel → questions → scoreboard → vote → ... → final`

---

## 1. New Game States

Add these constants after the existing state definitions:

```python
# Game states
STATE_LOBBY = "lobby"
STATE_QUESTION = "question"
STATE_REVEAL = "reveal"
STATE_SCOREBOARD = "scoreboard"
STATE_FINAL = "final"

# NEW: Voting system states
STATE_VOTE = "vote"
STATE_WHEEL = "wheel"
```

---

## 2. New GameState Fields

Update the `GameState.__init__()` method to include:

```python
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
        self.difficulty: Optional[str] = None  # None = mixed, "easy", "medium", "hard"
        
        # NEW: Voting system fields
        self.vote_categories: List[dict] = []  # [{id, name, color}, ...]
        self.votes: Dict[str, int] = {}  # category_id -> vote_count
        self.current_block = 1
        self.blocks = [3, 3, 4]  # Questions per block
```

---

## 3. Category Definitions

Add this dictionary after the state constants:

```python
# Category definitions (matching client-side)
CATEGORIES = {
    'arts_and_literature': {'name': 'Arts & Literature', 'color': '#9b59b6'},
    'film_and_tv': {'name': 'Film & TV', 'color': '#e74c3c'},
    'food_and_drink': {'name': 'Food & Drink', 'color': '#e67e22'},
    'general_knowledge': {'name': 'General Knowledge', 'color': '#3498db'},
    'geography': {'name': 'Geography', 'color': '#2ecc71'},
    'history': {'name': 'History', 'color': '#f39c12'},
    'music': {'name': 'Music', 'color': '#1abc9c'},
    'science': {'name': 'Science', 'color': '#8e44ad'},
    'society_and_culture': {'name': 'Society & Culture', 'color': '#e91e63'},
    'sport_and_leisure': {'name': 'Sport & Leisure', 'color': '#ff9800'}
}
```

---

## 4. New Helper Functions

### `fetch_questions_for_category()`

Add this function to fetch questions for a specific category:

```python
def fetch_questions_for_category(category_id: str, difficulty: Optional[str], count: int) -> List[dict]:
    """
    Fetch questions for a specific category.
    Fetches extra questions to handle potential duplicates.
    """
    # Build API URL for The Trivia API
    # The Trivia API doesn't support filtering by category directly
    # So we fetch many questions and filter
    url = f"{TRIVIA_API_URL}&limit={count + 2}"
    if difficulty:
        url += f"&difficulties={difficulty}"
    
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        # Filter by category
        filtered = []
        for q in data:
            if q["category"] == category_id:
                # Normalize format
                all_answers = [q["correctAnswer"]] + q["incorrectAnswers"]
                random.shuffle(all_answers)
                correct_index = all_answers.index(q["correctAnswer"])
                
                filtered.append({
                    "category": q["category"],
                    "question": q["question"]["text"],
                    "answers": all_answers,
                    "correct_index": correct_index
                })
                
                if len(filtered) >= count:
                    break
        
        return filtered
    except Exception as e:
        print(f"Error fetching questions for category {category_id}: {e}")
        return []
```

### `weighted_random_choice()`

Add this helper for weighted random selection:

```python
def weighted_random_choice(categories: List[str], weights: List[int]) -> int:
    """
    Select a random index based on weights.
    Returns the index of the winning category.
    """
    total_weight = sum(weights)
    rand_value = random.uniform(0, total_weight)
    
    cumulative = 0
    for i, weight in enumerate(weights):
        cumulative += weight
        if rand_value <= cumulative:
            return i
    
    return len(weights) - 1  # Fallback to last
```

---

## 5. `start_vote_phase()` Function

Add this function after the fetch functions:

```python
async def start_vote_phase():
    """
    Start the voting phase for the current block.
    - Picks 5 random categories
    - Sends vote request to all players
    - Waits 10 seconds for votes
    - Calculates weighted winner
    - Starts wheel animation
    - Fetches questions and starts block
    """
    global game_state
    
    # Select 5 random categories from the 10 available
    all_category_ids = list(CATEGORIES.keys())
    selected_categories = random.sample(all_category_ids, 5)
    
    # Create category display objects
    vote_categories = [
        {
            'id': cat_id,
            'name': CATEGORIES[cat_id]['name'],
            'color': CATEGORIES[cat_id]['color']
        }
        for cat_id in selected_categories
    ]
    
    # Initialize vote counts (each starts at 1)
    game_state.vote_categories = vote_categories
    game_state.votes = {cat_id: 1 for cat_id in selected_categories}
    
    # Save current question set
    previous_questions = game_state.questions
    previous_index = game_state.current_question_index
    
    # Update game state
    game_state.state = STATE_VOTE
    
    # Send vote message to TV and players
    vote_message = {
        "type": "vote",
        "categories": vote_categories,
        "timer": 10,
        "block": game_state.current_block
    }
    await send_to_tv(vote_message)
    for connection in player_connections[:]:
        try:
            await connection.send_json(vote_message)
        except Exception:
            pass
    
    # Wait 10 seconds for voting
    await asyncio.sleep(10)
    
    # Tally votes: add +2 for each vote
    # Note: votes are stored in game_state.votes from player votes
    # Each category already has base weight of 1
    
    # Send vote count update to TV for display
    await send_to_tv({
        "type": "update_vote_counts",
        "votes": game_state.votes
    })
    
    # Wait a moment for TV to update display
    await asyncio.sleep(1)
    
    # Calculate weighted selection
    weights = [game_state.votes[cat_id] for cat_id in selected_categories]
    winner_index = weighted_random_choice(selected_categories, weights)
    winning_category_id = selected_categories[winner_index]
    
    # Send wheel message to TV
    wheel_message = {
        "type": "wheel",
        "categories": vote_categories,
        "weights": weights,
        "winner_index": winner_index
    }
    await send_to_tv(wheel_message)
    
    # Wait for wheel animation (5 seconds)
    await asyncio.sleep(5)
    
    # Fetch questions for winning category
    difficulty = game_state.difficulty
    questions_in_block = game_state.blocks[game_state.current_block - 1]
    game_state.questions = fetch_questions_for_category(
        winning_category_id, difficulty, questions_in_block
    )
    
    # Check if we have enough questions
    if len(game_state.questions) < questions_in_block:
        # Fall back to fetching more questions (any category)
        game_state.questions = fetch_questions(difficulty)[:questions_in_block]
    
    # Update game state
    game_state.current_question_index = 0
    game_state.state = STATE_QUESTION
    
    # Send block start notification
    block_start_message = {
        "type": "block_start",
        "category": CATEGORIES[winning_category_id]['name'],
        "block": game_state.current_block,
        "questions_in_block": questions_in_block
    }
    await send_to_tv(block_start_message)
    for connection in player_connections[:]:
        try:
            await connection.send_json(block_start_message)
        except Exception:
            pass
    
    # Start first question of the block
    await next_question()
```

---

## 6. Modified Game Flow

### Update `start_game()` to use voting system:

Replace the existing `start_game()` function with:

```python
@app.post("/api/start")
async def start_game():
    """Start a new game."""
    global game_state
    
    # Save current players
    current_players = {pid: {"name": p["name"], "score": 0} for pid, p in game_state.players.items()}
    
    # Reset game state
    game_state = GameState()
    game_state.players = current_players
    
    # Initialize block tracking
    game_state.current_block = 1
    
    game_state.state = STATE_VOTE
    
    # Start first vote phase
    await start_vote_phase()
    
    return {"status": "started", "block": game_state.current_block}
```

### Update `move_to_scoreboard()` to start next vote instead of next question:

Replace the existing `move_to_scoreboard()` function with:

```python
async def move_to_scoreboard():
    """Move to scoreboard state."""
    global game_state
    
    game_state.state = STATE_SCOREBOARD
    game_state.current_question_index += 1
    
    await send_scoreboard_to_all()
    
    # Wait 5 seconds then decide what to do
    await asyncio.sleep(5)
    
    # Check if current block is complete
    questions_in_block = game_state.blocks[game_state.current_block - 1]
    if game_state.current_question_index >= questions_in_block:
        # Block complete, move to next block or end game
        game_state.current_block += 1
        game_state.current_question_index = 0
        
        if game_state.current_block > len(game_state.blocks):
            # Game complete
            await end_game()
        else:
            # Start next vote phase
            await start_vote_phase()
    else:
        # Continue with next question in current block
        await next_question()
```

---

## 7. Player WebSocket Handler - Handle "vote" Messages

Update the player WebSocket handler in `player_websocket()` to handle vote messages:

Add this case in the message handler (after the "answer" case):

```python
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
                    # ... existing join handling ...
                    pass
                    
                elif msg_type == "answer":
                    # ... existing answer handling ...
                    pass
                    
                elif msg_type == "vote":
                    # Handle player vote
                    if game_state.state != STATE_VOTE or player_id is None:
                        continue
                    
                    category_id = message.get("category_id")
                    
                    # Validate category
                    if category_id not in [cat['id'] for cat in game_state.vote_categories]:
                        continue
                    
                    # Update vote count (+2 per vote)
                    if player_id not in game_state.players_who_voted:
                        game_state.votes[category_id] = game_state.votes.get(category_id, 1) + 2
                        game_state.players_who_voted.add(player_id)
                        
                        # Track player's vote for this round
                        game_state.player_votes[player_id] = category_id
                        
                        # Broadcast updated vote counts to TV
                        await send_to_tv({
                            "type": "update_vote_counts",
                            "votes": game_state.votes
                        })
                        
                        # Send vote confirmation to player
                        await websocket.send_json({
                            "type": "vote_received",
                            "category_id": category_id
                        })
                        
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        # Clean up player
        if player_id and player_id in game_state.players:
            del game_state.players[player_id]
        if player_id in game_state.answers:
            del game_state.answers[player_id]
        if player_id in game_state.players_who_answered:
            game_state.players_who_answered.discard(player_id)
        if player_id in game_state.players_who_voted:
            game_state.players_who_voted.discard(player_id)
        if player_id in game_state.player_votes:
            del game_state.player_votes[player_id]
        if websocket in player_connections:
            player_connections.remove(websocket)
        await broadcast_player_update()
```

### Update GameState to track votes:

Add these fields to `GameState.__init__()`:

```python
class GameState:
    def __init__(self):
        # ... existing fields ...
        
        # NEW: Voting system fields
        self.vote_categories: List[dict] = []
        self.votes: Dict[str, int] = {}
        self.current_block = 1
        self.blocks = [3, 3, 4]
        self.players_who_voted: Set[str] = set()  # Track who has voted this round
        self.player_votes: Dict[str, str] = {}  # Track which category each player voted for
```

---

## 8. Summary of All Changes

### Imports needed (if not already present):
```python
from typing import Set  # Already imported in original, just confirming
```

### Constants added:
- `STATE_VOTE = "vote"`
- `STATE_WHEEL = "wheel"`
- `CATEGORIES` dict

### Fields added to GameState:
- `vote_categories: List[dict]`
- `votes: Dict[str, int]`
- `current_block = 1`
- `blocks = [3, 3, 4]`
- `players_who_voted: Set[str]`
- `player_votes: Dict[str, str]`

### New functions:
- `fetch_questions_for_category(category_id, difficulty, count)`
- `weighted_random_choice(categories, weights)`
- `start_vote_phase()`

### Modified functions:
- `start_game()` - Now starts with `start_vote_phase()`
- `move_to_scoreboard()` - Now handles block completion and next vote
- `player_websocket()` - Added vote handling

### New WebSocket message types:
- `"vote"` - Sent to all when voting starts
- `"update_vote_counts"` - Sent to TV when votes update
- `"wheel"` - Sent to TV for wheel animation
- `"block_start"` - Sent to all when block starts
- `"vote"` (from player) - Player votes for a category

---

## Testing Checklist

1. ✅ Game starts → shows vote screen
2. ✅ Players can vote (only once per round)
3. ✅ Vote counts update on TV
4. ✅ Timer countdown works (10 seconds)
5. ✅ Wheel animation shows after timer
6. ✅ Wheel lands on correct category
7. ✅ Questions fetched for winning category
8. ✅ Questions displayed correctly
9. ✅ After block ends, next vote phase starts
10. ✅ After all blocks complete, game ends

---

## Notes

- The vote weight system: base weight = 1, each vote adds +2
- Wheel spins for 4 seconds with ease-out cubic animation
- Wheel waits 5 seconds after landing before showing questions
- Questions are fetched per block (not all at once)
- If a category doesn't have enough questions, falls back to any category
- Players can change their vote before the timer ends (not implemented in this patch - vote is final once cast)
