// Player Controller - Game Interface

let ws;
let playerId = null;
let playerName = '';
let currentScore = 0;
let currentQuestion = null;
let screens = {};  // Populated after DOM loads

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Get screen elements AFTER DOM is ready
    screens = {
        name: document.getElementById('screen-name'),
        waiting: document.getElementById('screen-waiting'),
        vote: document.getElementById('screen-vote'),
        game: document.getElementById('screen-game'),
        results: document.getElementById('screen-results')
    };

    // Check if we have an active session (page refresh during game)
    const savedName = sessionStorage.getItem('playerName');
    if (savedName) {
        playerName = savedName;
        document.getElementById('player-name-display').textContent = playerName;
        showScreen('waiting');
        connectWebSocket();
    }

    // Join button
    document.getElementById('join-btn').addEventListener('click', joinGame);

    // Enter key on name input
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });
});

// Screen management
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
}

// WebSocket Connection
let wsRetryTimeout = null;

function connectWebSocket() {
    // Guard against duplicate connections
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    // Clear any pending retry
    if (wsRetryTimeout) { clearTimeout(wsRetryTimeout); wsRetryTimeout = null; }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/player`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        if (playerName) {
            ws.send(JSON.stringify({ type: 'join', name: playerName }));
        }
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
    };

    ws.onclose = () => {
        ws = null;
        // Only auto-reconnect if we were already in the game
        if (playerId) {
            wsRetryTimeout = setTimeout(connectWebSocket, 2000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    // Timeout: if not joined within 8 seconds, show error and let them retry
    setTimeout(() => {
        if (!playerId) {
            showJoinError();
        }
    }, 8000);
}

function showJoinError() {
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerHTML = '<i class="fas fa-paper-plane"></i> JOIN';
    }
    const msgEl = document.getElementById('join-message');
    if (msgEl) {
        msgEl.textContent = 'Connection failed — try again!';
        msgEl.style.color = '#e74c3c';
    }
    // Close stale WS
    if (ws) { try { ws.close(); } catch(e) {} ws = null; }
    showScreen('name');
}

// Handle Server Messages
function handleServerMessage(message) {
    switch (message.type) {
        case 'joined':
            handleJoined(message);
            break;
        case 'question':
            handleQuestion(message);
            break;
        case 'timer':
            handleTimer(message);
            break;
        case 'answer_received':
            // Answer was accepted, buttons already disabled
            break;
        case 'reveal':
            handleReveal(message);
            break;
        case 'scoreboard':
            handleScoreboard(message);
            break;
        case 'final_results':
            handleFinalResults(message);
            break;
        case 'vote':
            showPlayerVoteScreen(message);
            break;
        case 'vote_update':
            // Optional: update vote counts on player screen
            break;
        case 'vote_received':
            // Vote confirmed
            break;
        case 'wheel':
            showScreen('waiting'); // Show waiting while wheel spins on TV
            document.querySelector('#screen-waiting .waiting-text').textContent = 'Watch the wheel on TV! 🎰';
            break;
        case 'block_start':
            // Next question coming
            break;
        case 'lobby_update':
            // Stay on waiting screen
            break;
    }
}

// Join Game
function joinGame() {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();

    if (!name) {
        document.getElementById('join-message').textContent = 'Please enter your name!';
        document.getElementById('join-message').style.color = '#e74c3c';
        return;
    }

    playerName = name;
    sessionStorage.setItem('playerName', name);

    const joinBtn = document.getElementById('join-btn');
    joinBtn.disabled = true;
    joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> JOINING...';

    connectWebSocket();
}

function handleJoined(message) {
    playerId = message.player_id;

    document.getElementById('player-name-display').textContent = playerName;
    showScreen('waiting');
}

// Question Handling
function handleQuestion(message) {
    currentQuestion = message.question;

    showScreen('game');

    // Category
    const categoryEl = document.getElementById('game-category');
    categoryEl.innerHTML = `<i class="fas fa-tag"></i> ${escapeHtml(currentQuestion.category)}`;

    // Question
    document.getElementById('game-question').textContent = currentQuestion.question;

    // Question number
    const counterEl = document.getElementById('game-question-counter');
    if (counterEl) counterEl.textContent = `${message.question_num} / ${message.total_questions}`;

    // Timer
    updateTimerDisplay(message.timer);

    // Answer buttons
    const answersGrid = document.getElementById('answers-grid');
    answersGrid.innerHTML = '';

    currentQuestion.answers.forEach((answer, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = answer;
        btn.onclick = () => submitAnswer(index, btn);
        answersGrid.appendChild(btn);
    });
}

function handleTimer(message) {
    updateTimerDisplay(message.timer);
}

function updateTimerDisplay(seconds) {
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;
    timerEl.textContent = seconds;

    if (seconds <= 5) {
        timerEl.style.color = '#e74c3c';
    } else if (seconds <= 10) {
        timerEl.style.color = '#f1c40f';
    } else {
        timerEl.style.color = '#3498db';
    }
}

// Answer Submission
function submitAnswer(answerIndex, clickedBtn) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: 'answer',
        index: answerIndex
    }));

    // Highlight selected, dim others (but keep them tappable to change answer)
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach(btn => {
        btn.style.opacity = '0.5';
        btn.style.border = '3px solid rgba(255,255,255,0.15)';
    });
    clickedBtn.style.opacity = '1';
    clickedBtn.style.border = '3px solid #3498db';
}

// Reveal — show correct/wrong on the game screen itself (no separate overlay)
function handleReveal(message) {
    const correctIndex = message.correct_index;
    const scores = message.scores || {};

    // Color the answer buttons
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach((btn, index) => {
        btn.disabled = true;
        if (index === correctIndex) {
            btn.style.background = 'rgba(46, 204, 113, 0.4)';
            btn.style.border = '3px solid #2ecc71';
            btn.style.opacity = '1';
        } else {
            btn.style.background = 'rgba(231, 76, 60, 0.2)';
            btn.style.border = '3px solid rgba(231, 76, 60, 0.4)';
            btn.style.opacity = '0.6';
        }
    });

    // Show points earned in timer area
    let pointsEarned = 0;
    if (scores[playerId]) {
        pointsEarned = scores[playerId].points;
    }
    currentScore += pointsEarned;

    const timerEl = document.getElementById('game-timer');
    if (pointsEarned > 0) {
        timerEl.textContent = `+${pointsEarned}`;
        timerEl.style.color = '#2ecc71';
    } else {
        timerEl.textContent = '+0';
        timerEl.style.color = '#e74c3c';
    }

    // Server will auto-advance to scoreboard then next question
}

// Scoreboard — just update score, stay on game screen or show waiting
function handleScoreboard(message) {
    const player = message.players.find(p => p.name === playerName);
    if (player) {
        currentScore = player.score;
    }

    // Show results screen briefly
    showScreen('results');
    document.getElementById('results-score').textContent = currentScore;

    // Find our rank
    const rank = message.players.findIndex(p => p.name === playerName) + 1;
    const rankEl = document.getElementById('results-rank');
    if (rankEl) rankEl.textContent = rank > 0 ? `#${rank}` : '';
}

// Final Results
function handleFinalResults(message) {
    const player = message.players.find(p => p.name === playerName);
    if (player) currentScore = player.score;

    showScreen('results');
    document.getElementById('results-score').textContent = currentScore;

    const rank = message.players.findIndex(p => p.name === playerName) + 1;
    const rankEl = document.getElementById('results-rank');
    if (rankEl) {
        if (rank === 1) {
            rankEl.textContent = '🏆 WINNER!';
            rankEl.style.color = '#f1c40f';
        } else {
            rankEl.textContent = `#${rank}`;
        }
    }

    const msgEl = document.getElementById('results-message');
    if (msgEl) msgEl.textContent = 'Game Over! Check the TV for standings.';
}

// Vote Screen Functions
const CATEGORY_ICONS = {
    'arts_and_literature': '🎨',
    'film_and_tv': '🎬',
    'food_and_drink': '🍽️',
    'general_knowledge': '💡',
    'geography': '🌍',
    'history': '📜',
    'music': '🎵',
    'science': '🔬',
    'society_and_culture': '👥',
    'sport_and_leisure': '⚽'
};
let playerVoteTimerInterval = null;

function showPlayerVoteScreen(message) {
    showScreen('vote');
    document.getElementById('player-vote-block').textContent = message.block;
    
    const grid = document.getElementById('player-vote-grid');
    grid.innerHTML = '';
    
    message.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.id = 'pvote-' + cat.id;
        btn.style.background = cat.color;
        btn.style.border = '3px solid ' + cat.color;
        btn.style.opacity = '1';
        btn.innerHTML = '<div style="font-size:1.8rem;margin-bottom:0.3rem;">' + (CATEGORY_ICONS[cat.id]||'❓') + '</div>' + cat.name;
        btn.onclick = () => castPlayerVote(cat.id, message.categories);
        grid.appendChild(btn);
    });
    
    let remaining = message.timer;
    const timerEl = document.getElementById('player-vote-timer');
    timerEl.textContent = remaining + 's';
    if (playerVoteTimerInterval) clearInterval(playerVoteTimerInterval);
    playerVoteTimerInterval = setInterval(() => {
        remaining--;
        timerEl.textContent = remaining + 's';
        if (remaining <= 0) clearInterval(playerVoteTimerInterval);
    }, 1000);
}

function castPlayerVote(categoryId, categories) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'vote', category_id: categoryId }));
    
    // Highlight selected, dim others
    categories.forEach(cat => {
        const btn = document.getElementById('pvote-' + cat.id);
        if (btn) {
            if (cat.id === categoryId) {
                btn.style.opacity = '1';
                btn.style.border = '3px solid white';
                btn.style.transform = 'scale(1.05)';
            } else {
                btn.style.opacity = '0.5';
                btn.style.border = '3px solid transparent';
                btn.style.transform = 'scale(1)';
            }
        }
    });
}

// Utility
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
