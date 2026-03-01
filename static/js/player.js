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
        game: document.getElementById('screen-game'),
        results: document.getElementById('screen-results')
    };

    // Check if we have a saved name (from join page redirect)
    const savedName = localStorage.getItem('playerName');
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
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

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
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
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
    localStorage.setItem('playerName', name);

    const joinBtn = document.getElementById('join-btn');
    joinBtn.disabled = true;
    joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> JOINING...';

    connectWebSocket();
}

function handleJoined(message) {
    playerId = message.player_id;
    localStorage.setItem('playerId', playerId);

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

    // Disable all buttons, highlight selected
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
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
