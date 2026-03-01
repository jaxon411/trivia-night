// Player Controller - Game Interface

let ws;
let playerId = null;
let playerName = '';
let currentScore = 0;
let timerInterval;
let currentQuestion = null;

// DOM Elements
const screens = {
    name: document.getElementById('screen-name'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    feedback: document.getElementById('screen-feedback'),
    score: document.getElementById('screen-score')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if player already joined
    const savedPlayerId = localStorage.getItem('playerId');
    const savedName = localStorage.getItem('playerName');
    
    if (savedPlayerId && savedName) {
        playerId = savedPlayerId;
        playerName = savedName;
        document.getElementById('player-name-display').textContent = playerName;
        showScreen('waiting');
        connectWebSocket();
    }
    
    // Join button
    document.getElementById('join-btn').addEventListener('click', joinGame);
    
    // Enter key on name input
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinGame();
        }
    });
    
    // Feedback button
    document.getElementById('feedback-btn').addEventListener('click', hideFeedback);
    
    // Handle window resize
    window.addEventListener('resize', () => {
        adjustQuestionFontSize();
    });
});

// WebSocket Connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/player`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        if (playerId) {
            // Reconnect with existing player ID
            ws.send(JSON.stringify({
                type: 'join',
                name: playerName
            }));
        }
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 2000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // showScreen('name');
    };
}

// Handle Server Messages
function handleServerMessage(message) {
    switch (message.type) {
        case 'joined':
            handleJoined(message);
            break;
        case 'lobby_update':
            handleLobbyUpdate(message);
            break;
        case 'question':
            handleQuestion(message);
            break;
        case 'timer':
            handleTimer(message);
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
    }
}

// Join Game
function joinGame() {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        showMessage('Please enter your name!', 'error');
        return;
    }
    
    playerName = name;
    
    // Show loading state
    const joinBtn = document.getElementById('join-btn');
    joinBtn.disabled = true;
    joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> JOINING...';
    
    // Connect to WebSocket
    connectWebSocket();
}

function handleJoined(message) {
    playerId = message.player_id;
    localStorage.setItem('playerId', playerId);
    localStorage.setItem('playerName', playerName);
    
    // Update header
    document.getElementById('player-name-display').textContent = playerName;
    
    // Show waiting screen
    showMessage(`Welcome, ${playerName}!`, 'success');
    
    setTimeout(() => {
        showScreen('waiting');
    }, 1000);
    
    // Start countdown
    startWaitingCountdown();
}

function startWaitingCountdown() {
    let count = 3;
    const countdownEl = document.getElementById('waiting-countdown');
    
    countdownEl.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        countdownEl.textContent = count;
        
        if (count <= 0) {
            clearInterval(interval);
        }
    }, 1000);
}

function handleLobbyUpdate(message) {
    console.log('Lobby update:', message);
    // Update lobby display if needed
}

// Question Handling
function handleQuestion(message) {
    currentQuestion = message.question;
    const timer = message.timer;
    
    showScreen('game');
    
    // Update question info
    const categoryEl = document.getElementById('game-category');
    categoryEl.innerHTML = `<i class="fas fa-tag"></i> ${escapeHtml(currentQuestion.category)}`;
    categoryEl.className = `game-category cat-${currentQuestion.category.toLowerCase().replace(/ /g, '-')}`;
    
    document.getElementById('game-question').textContent = currentQuestion.question;
    adjustQuestionFontSize();
    
    // Update answers
    const answersGrid = document.getElementById('answers-grid');
    answersGrid.innerHTML = '';
    
    currentQuestion.answers.forEach((answer, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = answer;
        btn.onclick = () => submitAnswer(index);
        answersGrid.appendChild(btn);
    });
    
    // Update timer
    updateTimerDisplay(timer);
    
    // Start timer
    startTimer(timer);
}

function startTimer(seconds) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    let remaining = seconds;
    updateTimerDisplay(remaining);
    
    timerInterval = setInterval(() => {
        remaining--;
        updateTimerDisplay(remaining);
        
        if (remaining <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

function updateTimerDisplay(seconds) {
    document.getElementById('game-timer').textContent = seconds;
    
    // Visual feedback for low time
    const timerEl = document.getElementById('game-timer');
    if (seconds <= 5) {
        timerEl.style.color = '#e74c3c';
    } else if (seconds <= 10) {
        timerEl.style.color = '#f1c40f';
    } else {
        timerEl.style.color = '#3498db';
    }
}

// Answer Submission
function submitAnswer(answerIndex) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // Send answer
    ws.send(JSON.stringify({
        type: 'answer',
        index: answerIndex,
        time_remaining: document.getElementById('game-timer').textContent
    }));
    
    // Disable all buttons
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
}

function handleTimer(message) {
    updateTimerDisplay(message.timer);
}

// Reveal Handling
function handleReveal(message) {
    const correctIndex = message.correct_index;
    const answers = message.answers;
    const scores = message.scores || {};
    
    // Calculate points
    let pointsEarned = 0;
    if (scores[playerId]) {
        pointsEarned = scores[playerId].points;
    }
    
    // Show feedback
    if (pointsEarned > 0) {
        showFeedback(true, pointsEarned);
    } else {
        showFeedback(false, 0);
    }
    
    // Update total score
    currentScore += pointsEarned;
    document.getElementById('total-score').textContent = currentScore;
}

function showFeedback(isCorrect, points) {
    showScreen('feedback');
    
    const iconEl = document.getElementById('feedback-icon');
    const titleEl = document.getElementById('feedback-title');
    const pointsEl = document.getElementById('feedback-points');
    
    if (isCorrect) {
        iconEl.innerHTML = '<i class="fas fa-check-circle" style="color: #2ecc71;"></i>';
        titleEl.textContent = 'Correct!';
        titleEl.style.color = '#2ecc71';
        pointsEl.textContent = `+${points} points`;
    } else {
        iconEl.innerHTML = '<i class="fas fa-times-circle" style="color: #e74c3c;"></i>';
        titleEl.textContent = 'Wrong!';
        titleEl.style.color = '#e74c3c';
        pointsEl.textContent = '+0 points';
    }
}

function hideFeedback() {
    showScreen('score');
    
    // Check if round is complete
    // In production, we'd check the game state from the server
    setTimeout(() => {
        showScreen('waiting');
    }, 3000);
}

// Scoreboard Handling
function handleScoreboard(message) {
    const player = message.players.find(p => p.name === playerName);
    if (player) {
        currentScore = player.score;
        document.getElementById('total-score').textContent = currentScore;
    }
}

// Final Results Handling
function handleFinalResults(message) {
    const player = message.players.find(p => p.name === playerName);
    
    if (player) {
        document.getElementById('total-score').textContent = player.score;
    }
    
    // Show final results
    alert('Game Over! Check the TV for final results.');
    
    // Reset for new game
    resetGame();
}

// Utility Functions
function showMessage(text, type) {
    const messageEl = document.getElementById('join-message');
    messageEl.textContent = text;
    messageEl.style.color = type === 'error' ? '#e74c3c' : '#2ecc71';
}

function showScreen(screenName) {
    // Hide all screens
    Object.values(screens).forEach(screen => {
        screen.classList.add('hidden');
    });
    
    // Show requested screen
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
}

function adjustQuestionFontSize() {
    const questionEl = document.getElementById('game-question');
    if (questionEl) {
        const width = questionEl.offsetWidth;
        const charCount = questionEl.textContent.length;
        const fontSize = Math.min(2, Math.max(1.2, width / charCount * 2));
        questionEl.style.fontSize = `${fontSize}rem`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function resetGame() {
    playerId = null;
    playerName = '';
    currentScore = 0;
    localStorage.removeItem('playerId');
    localStorage.removeItem('playerName');
    showScreen('name');
}

// Auto-start timer when page loads
window.addEventListener('load', () => {
    adjustQuestionFontSize();
});
