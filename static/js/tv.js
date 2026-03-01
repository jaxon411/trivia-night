// TV Controller - Game Display

let ws;
let currentQuestionIndex = 0;
let totalQuestions = 10;
let timerInterval;
let questions = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        adjustFontSize();
    });
});

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
            showScoreboard(message.players);
            break;
        case 'final_results':
            showFinalResults(message.players, message.winner);
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
    
    // Update timer
    document.getElementById('timer-text').textContent = timer;
    document.getElementById('timer-bar').style.width = '100%';
    
    // Start timer
    startTimer(timer);
}

function startTimer(seconds) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    let remaining = seconds;
    document.getElementById('timer-text').textContent = remaining;
    document.getElementById('timer-bar').style.width = '100%';
    
    timerInterval = setInterval(() => {
        remaining--;
        document.getElementById('timer-text').textContent = remaining;
        document.getElementById('timer-bar').style.width = `${(remaining / seconds) * 100}%`;
        
        if (remaining <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
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
    
    // Auto-advance to scoreboard after 5 seconds
    setTimeout(() => {
        showScoreboard();
    }, 5000);
}

// Scoreboard View Functions
function showScoreboard(players) {
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
    
    // Auto-advance to next question after 5 seconds
    setTimeout(() => {
        nextQuestion();
    }, 5000);
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
