// TV Controller - Game Display

let ws;
let currentQuestionIndex = 0;
let totalQuestions = 10;
let timerInterval;
let questions = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    fetchQRCode();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        adjustFontSize();
    });
});

function fetchQRCode() {
    fetch('/qrcode')
        .then(res => res.json())
        .then(data => {
            const qrImg = document.getElementById('tv-qr-code');
            if (qrImg) qrImg.src = 'data:image/png;base64,' + data.qr_code;
            const urlEl = document.getElementById('tv-join-url');
            if (urlEl) urlEl.textContent = data.url;
        })
        .catch(err => console.error('Error fetching QR:', err));
}

// Difficulty selection
function setDifficulty(difficulty) {
    fetch('/api/set_difficulty', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({difficulty: difficulty})
    });
    // Update button styles
    document.querySelectorAll('.diff-btn').forEach(btn => btn.classList.remove('active'));
    const id = difficulty ? 'diff-' + difficulty : 'diff-mixed';
    document.getElementById(id).classList.add('active');
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tv`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to game server');
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
    };
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'lobby_update':
            updateLobbyView(message.players);
            break;
        case 'question':
            showQuestion(message.question, message.timer, message.question_num, message.total_questions);
            break;
        case 'timer':
            updateTimer(message.timer);
            break;
        case 'reveal':
            showReveal(message.correct_index, message.answers, message.scores);
            break;
        case 'scoreboard':
            displayScoreboard(message.players);
            break;
        case 'final_results':
            showFinalResults(message.players, message.winner);
            break;
        case 'vote':
            showVoteView(message);
            break;
        case 'vote_update':
            updateVoteDisplay(message.votes);
            break;
        case 'wheel':
            showWheelView(message);
            break;
        case 'block_start':
            // Wheel done, next question will come automatically
            break;
    }
}

// Lobby View Functions
function updateLobbyView(players) {
    const container = document.getElementById('lobby-players');
    container.innerHTML = '';
    
    if (players.length === 0) {
        container.innerHTML = '<p style="color: #a0a0b0; font-size: 1.2rem;">No players yet</p>';
        return;
    }
    
    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'lobby-player-card';
        card.innerHTML = `
            <div class="lobby-player-name">
                <i class="fas fa-user"></i> ${escapeHtml(player.name)}
            </div>
            <div class="lobby-player-score">
                ${player.score} pts
            </div>
        `;
        container.appendChild(card);
    });
    
    // Check if we have enough players to start
    if (players.length >= 1) {
        document.getElementById('start-btn').classList.remove('hidden');
    }
}

function adjustFontSize() {
    const questionText = document.getElementById('question-text');
    if (questionText) {
        const width = questionText.offsetWidth;
        const charCount = questionText.textContent.length;
        const fontSize = Math.min(4, Math.max(1.5, width / charCount * 2.5));
        questionText.style.fontSize = `${fontSize}rem`;
    }
}

// Game Control Functions
function startGame() {
    fetch('/api/start', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'started') {
                // Fetch first question
                fetch('/api/next_question', { method: 'POST' });
            }
        });
    document.getElementById('start-btn').classList.add('hidden');
}

function nextQuestion() {
    fetch('/api/next_question', { method: 'POST' })
        .then(res => res.json())
        .then(data => console.log(data));
}

function revealAnswer() {
    fetch('/api/reveal', { method: 'POST' })
        .then(res => res.json())
        .then(data => console.log(data));
}

function showScoreboard() {
    fetch('/api/scoreboard', { method: 'POST' })
        .then(res => res.json())
        .then(data => console.log(data));
}

function resetGame() {
    fetch('/api/reset', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'reset') {
                window.location.reload();
            }
        });
}

// Question View Functions
function showQuestion(question, timer, questionNum, totalQuestions) {
    currentQuestionIndex = questionNum - 1;
    totalQuestions = totalQuestions;
    
    // Hide difficulty selector when game starts
    const diffSelector = document.getElementById('difficulty-selector');
    if (diffSelector) diffSelector.style.display = 'none';
    
    document.getElementById('view-question').classList.add('active');
    document.getElementById('view-lobby').classList.remove('active');
    document.getElementById('view-reveal').classList.remove('active');
    document.getElementById('view-scoreboard').classList.remove('active');
    document.getElementById('view-final').classList.remove('active');
    
    // Show controls
    document.getElementById('next-btn').classList.remove('hidden');
    document.getElementById('reveal-btn').classList.remove('hidden');
    
    // Update question info
    document.getElementById('question-num').textContent = questionNum;
    document.getElementById('total-questions').textContent = totalQuestions;
    
    const categoryEl = document.getElementById('question-category');
    categoryEl.innerHTML = `<i class="fas fa-tag"></i> ${escapeHtml(question.category)}`;
    categoryEl.className = `question-category cat-${question.category.toLowerCase().replace(/ /g, '-')}`;
    
    document.getElementById('question-text').textContent = question.question;
    
    // Update answers grid
    const answersGrid = document.getElementById('answers-grid');
    answersGrid.innerHTML = '';
    
    question.answers.forEach((answer, index) => {
        const card = document.createElement('div');
        card.className = 'answer-card';
        card.id = `answer-${index}`;
        card.textContent = answer;
        answersGrid.appendChild(card);
    });
    
    // Update timer (server drives the countdown via WS messages)
    document.getElementById('timer-text').textContent = timer;
    document.getElementById('timer-bar').style.width = '100%';
}

function updateTimer(timer) {
    document.getElementById('timer-text').textContent = timer;
    const totalSeconds = 15;
    document.getElementById('timer-bar').style.width = `${(timer / totalSeconds) * 100}%`;
}

// Reveal View Functions
function showReveal(correctIndex, answers, scores) {
    document.getElementById('view-reveal').classList.add('active');
    document.getElementById('view-question').classList.remove('active');
    
    // Hide controls
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('reveal-btn').classList.add('hidden');
    
    // Update correct answer display
    const correctAnswerEl = document.getElementById('correct-answer');
    correctAnswerEl.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(answers[correctIndex])}`;
    
    // Update answer cards
    const revealAnswers = document.getElementById('reveal-answers');
    revealAnswers.innerHTML = '';
    
    answers.forEach((answer, index) => {
        const card = document.createElement('div');
        card.className = 'answer-card';
        if (index === correctIndex) {
            card.classList.add('correct');
        } else {
            card.classList.add('wrong');
        }
        card.textContent = answer;
        revealAnswers.appendChild(card);
    });
    
    // Update scores in lobby view
    if (scores) {
        const lobbyPlayers = document.getElementById('lobby-players');
        lobbyPlayers.innerHTML = '';
        
        // Sort players by score
        const sortedPlayers = Object.entries(scores)
            .map(([playerId, data]) => ({
                id: playerId,
                points: data.points
            }))
            .sort((a, b) => b.points - a.points);
        
        // We need the actual player objects from the lobby
        // This is a simplified version - in production, we'd fetch full player data
    }
    
    // Server auto-advances to scoreboard after 5 seconds
}

// Scoreboard View Functions
function displayScoreboard(players) {
    document.getElementById('view-scoreboard').classList.add('active');
    document.getElementById('view-reveal').classList.remove('active');
    
    // Hide controls
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('reveal-btn').classList.add('hidden');
    document.getElementById('scoreboard-btn').classList.add('hidden');
    
    // Sort players by score
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    
    // Update scoreboard list
    const scoreboardList = document.getElementById('scoreboard-list');
    scoreboardList.innerHTML = '';
    
    sortedPlayers.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'scoreboard-row';
        
        let rankClass = '';
        if (index === 0) rankClass = 'gold';
        else if (index === 1) rankClass = 'silver';
        else if (index === 2) rankClass = 'bronze';
        
        row.innerHTML = `
            <div class="scoreboard-rank ${rankClass}">${index + 1}</div>
            <div class="scoreboard-name">${escapeHtml(player.name)}</div>
            <div class="scoreboard-score">${player.score}</div>
        `;
        scoreboardList.appendChild(row);
    });
    
    // Server auto-advances to next question after 5 seconds
}

// Final Results Functions
function showFinalResults(players, winner) {
    document.getElementById('view-final').classList.add('active');
    document.getElementById('view-scoreboard').classList.remove('active');
    
    // Hide controls
    document.getElementById('play-again-btn').classList.remove('hidden');
    
    if (winner) {
        document.getElementById('winner-name').textContent = winner.name;
        document.getElementById('winner-score').textContent = `${winner.score} points`;
    }
    
    // Update final scoreboard
    const finalScoreboardList = document.getElementById('final-scoreboard-list');
    finalScoreboardList.innerHTML = '';
    
    players.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'scoreboard-row';
        
        let rankClass = '';
        if (index === 0) rankClass = 'gold';
        else if (index === 1) rankClass = 'silver';
        else if (index === 2) rankClass = 'bronze';
        
        row.innerHTML = `
            <div class="scoreboard-rank ${rankClass}">${index + 1}</div>
            <div class="scoreboard-name">${escapeHtml(player.name)}</div>
            <div class="scoreboard-score">${player.score}</div>
        `;
        finalScoreboardList.appendChild(row);
    });
    
    // Play again button
    const playAgainBtn = document.getElementById('play-again-btn');
    playAgainBtn.onclick = resetGame;
}

// Utility Functions
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Auto-start timer when page loads (if game is in progress)
window.addEventListener('load', () => {
    fetch('/api/status')
        .then(res => res.json())
        .then(data => {
            console.log('Current status:', data);
            // Would need to update UI based on current state
        })
        .catch(err => console.error('Error fetching status:', err));
});

// Vote View Functions
function showVoteView(message) {
    // Hide all views, show view-vote
    document.querySelectorAll('.tv-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-vote').classList.add('active');
    
    document.getElementById('vote-block-num').textContent = message.block;
    document.getElementById('vote-timer').textContent = message.timer + 's';
    
    const grid = document.getElementById('vote-categories');
    grid.innerHTML = '';
    
    const icons = {
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
    
    message.categories.forEach(cat => {
        const card = document.createElement('div');
        card.id = 'tv-vote-' + cat.id;
        card.style.cssText = 'background:rgba(255,255,255,0.08); border:3px solid ' + cat.color + '; border-radius:16px; padding:2rem; text-align:center; transition:all 0.3s;';
        card.innerHTML = '<div style="font-size:3rem;margin-bottom:1rem;">' + (icons[cat.id]||'❓') + '</div>'
            + '<div style="font-size:1.5rem;font-weight:bold;color:' + cat.color + ';margin-bottom:0.5rem;">' + cat.name + '</div>'
            + '<div class="vote-count" style="font-size:1.8rem;font-weight:bold;">0 votes</div>';
        grid.appendChild(card);
    });
    
    // Start countdown display
    let remaining = message.timer;
    const timerEl = document.getElementById('vote-timer');
    const voteTimerInterval = setInterval(() => {
        remaining--;
        timerEl.textContent = remaining + 's';
        if (remaining <= 0) clearInterval(voteTimerInterval);
    }, 1000);
}

function updateVoteDisplay(votes) {
    Object.entries(votes).forEach(([catId, count]) => {
        const card = document.getElementById('tv-vote-' + catId);
        if (card) {
            const countEl = card.querySelector('.vote-count');
            if (countEl) countEl.textContent = (count - 1) + ' votes'; // subtract base weight of 1
        }
    });
}

// Wheel View Functions
function showWheelView(message) {
    document.querySelectorAll('.tv-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-wheel').classList.add('active');
    document.getElementById('wheel-result').textContent = '';
    
    // Use wheel.js
    const wheel = new SpinWheel('wheelCanvas', message.categories, message.weights);
    wheel.spin(message.winner_index, 4000).then(() => {
        document.getElementById('wheel-result').textContent = '🎉 ' + message.categories[message.winner_index].name + '!';
    });
}
