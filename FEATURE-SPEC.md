# Feature Spec: Difficulty Selection + Category Voting

## Part 1: Difficulty Selection (Lobby)

Before starting the game, the host selects a difficulty on the TV:
- **Easy** / **Medium** / **Hard** / **Mixed** (default)
- Show as 4 big buttons on the lobby screen below the QR code
- Selected difficulty is sent to the API: `?difficulties=easy` (or omitted for mixed)
- Store in `game_state.difficulty`

### API Details
- The Trivia API: `https://the-trivia-api.com/v2/questions?limit=50&difficulties=easy&types=text_choice`
- Valid values: `easy`, `medium`, `hard` (omit param for mixed)
- Open Trivia DB: `https://opentdb.com/api.php?amount=50&type=multiple&difficulty=easy`
- Valid values: `easy`, `medium`, `hard` (omit for mixed)

## Part 2: Category Voting with Weighted Wheel

### Game Flow Change
Instead of 10 random questions, the game is split into **3 blocks** of questions:
- Block 1: 3 questions
- Block 2: 3 questions  
- Block 3: 4 questions (total = 10)

Before each block, a **category vote** happens:

### Vote Phase
1. Server picks 5 random categories from the available pool
2. TV shows "Vote for the next category!" with 5 category cards
3. Players see the same 5 categories on their phones as vote buttons
4. Each player gets ONE vote (10-second vote timer)
5. Votes increase that category's odds but DON'T guarantee it

### Weighted Selection
- Base weight: each category starts at weight = 1 (equal chance)
- Each vote adds +2 to that category's weight
- Example: 5 categories, 2 players both vote "Science"
  - Science: 1 + 2 + 2 = 5
  - Others: 1 each
  - Science has 5/9 = 55% chance, others each 1/9 = 11%
- Selection is random using these weights

### Wheel Animation (TV only)
After votes are tallied:
1. TV shows a spinning wheel divided into 5 colored segments
2. Segment sizes proportional to weights
3. Wheel spins for ~4 seconds with easing deceleration
4. Lands on the winning category
5. Category name displayed big with a flash animation
6. Then first question of that block begins

### Available Categories (from The Trivia API)
```
Arts & Literature  → arts_and_literature
Film & TV         → film_and_tv
Food & Drink      → food_and_drink
General Knowledge → general_knowledge
Geography         → geography
History           → history
Music             → music
Science           → science
Society & Culture → society_and_culture
Sport & Leisure   → sport_and_leisure
```

### API Fetching Strategy
- Fetch questions PER BLOCK (not all at once) since category is chosen per block
- After wheel lands: `GET /v2/questions?limit=4&categories=science&difficulties=easy`
- Fetch 1 extra as buffer in case of duplicates

### New Game States
```
lobby → vote → wheel → question → reveal → scoreboard → vote → wheel → ... → final
```

### WebSocket Messages
**Server → TV + Players:**
```json
{"type": "vote", "categories": [{"id": "science", "name": "Science", "color": "#3498db"}, ...], "timer": 10, "block": 1}
```

**Player → Server:**
```json
{"type": "vote", "category_id": "science"}
```

**Server → TV:**
```json
{"type": "wheel", "categories": [...], "weights": [5, 1, 1, 1, 1], "winner_index": 2}
```

**Server → TV + Players:**
```json
{"type": "block_start", "category": "Science", "block": 1, "questions_in_block": 3}
```

### Category Colors (consistent)
```
Arts & Literature  → #9b59b6 (purple)
Film & TV         → #e74c3c (red)
Food & Drink      → #e67e22 (orange)
General Knowledge → #3498db (blue)
Geography         → #2ecc71 (green)
History           → #f39c12 (amber)
Music             → #1abc9c (teal)
Science           → #8e44ad (deep purple)
Society & Culture → #e91e63 (pink)
Sport & Leisure   → #ff9800 (yellow-orange)
```
