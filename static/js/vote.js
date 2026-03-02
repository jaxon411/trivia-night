/**
 * Voting System for Trivia Night
 * Handles vote display on TV and voting interface for players
 */

// Category definitions (matching server)
const CATEGORIES = {
    'arts_and_literature': {name: 'Arts & Literature', color: '#9b59b6'},
    'film_and_tv': {name: 'Film & TV', color: '#e74c3c'},
    'food_and_drink': {name: 'Food & Drink', color: '#e67e22'},
    'general_knowledge': {name: 'General Knowledge', color: '#3498db'},
    'geography': {name: 'Geography', color: '#2ecc71'},
    'history': {name: 'History', color: '#f39c12'},
    'music': {name: 'Music', color: '#1abc9c'},
    'science': {name: 'Science', color: '#8e44ad'},
    'society_and_culture': {name: 'Society & Culture', color: '#e91e63'},
    'sport_and_leisure': {name: 'Sport & Leisure', color: '#ff9800'}
};

// Vote state
let voteState = {
    timer: 0,
    voteCategories: [],
    votes: {},
    currentBlock: 1,
    hasVoted: false,
    selectedCategory: null
};

// WebSocket connection
let ws = null;

/**
 * Initialize the vote system with WebSocket connection
 * @param {WebSocket} websocket - The player WebSocket connection
 */
function initVoteSystem(websocket) {
    ws = websocket;
    
    // Set up message handlers
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleVoteMessage(message);
    };
}

/**
 * Handle incoming vote-related messages
 */
function handleVoteMessage(message) {
    const type = message.type;
    
    switch (type) {
        case 'vote':
            handleVoteStart(message);
            break;
        case 'block_start':
            // Block has started, hide vote UI
            hideVoteScreen();
            break;
        case 'wheel':
            // Wheel animation should be handled by wheel.js
            initAndSpinWheel(message.categories, message.weights, message.winner_index);
            break;
        case 'update_vote_counts':
            updateVoteCounts(message.votes);
            break;
    }
}

/**
 * Handle the start of a voting phase
 */
function handleVoteStart(data) {
    voteState.timer = data.timer || 10;
    voteState.voteCategories = data.categories || [];
    voteState.currentBlock = data.block || 1;
    voteState.votes = data.votes || {};
    voteState.hasVoted = false;
    voteState.selectedCategory = null;
    
    // Show vote screen
    showVoteScreen(voteState.voteCategories, voteState.timer, voteState.currentBlock);
}

/**
 * Show the vote screen on TV
 * @param {Array} categories - Array of category objects with id, name, color
 * @param {number} timer - Vote countdown timer in seconds
 * @param {number} blockNum - Current block number (1, 2, or 3)
 */
function showVoteScreen(categories, timer, blockNum) {
    // Create or update vote container
    let container = document.getElementById('voteContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'voteContainer';
        container.style.cssText = `
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 20px;
        `;
        document.body.appendChild(container);
    }
    
    // Show container
    container.style.display = 'flex';
    
    // Create header
    let header = document.createElement('div');
    header.innerHTML = `
        <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 10px;">
            🗳️ Block ${blockNum} Vote
        </h1>
        <p style="color: #bdc3c7; font-size: 1.2rem;">
            Vote for your favorite category!
        </p>
        <div style="color: #e74c3c; font-size: 2rem; font-weight: bold; margin-top: 20px;">
            ⏱️ ${timer}s
        </div>
    `;
    
    // Create categories grid
    let categoriesGrid = document.createElement('div');
    categoriesGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 20px;
        width: 100%;
        max-width: 900px;
        margin-top: 30px;
    `;
    
    categories.forEach((cat, index) => {
        let categoryCard = document.createElement('div');
        categoryCard.id = `vote-card-${cat.id}`;
        categoryCard.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            border: 2px solid ${cat.color};
            transition: all 0.3s ease;
            cursor: pointer;
        `;
        
        // Add vote count display
        let voteCount = voteState.votes[cat.id] || 0;
        categoryCard.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px;">
                🏷️
            </div>
            <h2 style="color: ${cat.color}; font-size: 1.5rem; margin: 10px 0;">
                ${cat.name}
            </h2>
            <div style="color: #fff; font-size: 1.2rem; font-weight: bold;">
                📊 ${voteCount} votes
            </div>
        `;
        
        // Hover effect (TV only - not interactive)
        categoryCard.addEventListener('mouseenter', () => {
            categoryCard.style.transform = 'scale(1.05)';
            categoryCard.style.boxShadow = `0 10px 30px ${cat.color}40`;
        });
        
        categoryCard.addEventListener('mouseleave', () => {
            categoryCard.style.transform = 'scale(1)';
            categoryCard.style.boxShadow = 'none';
        });
        
        categoriesGrid.appendChild(categoryCard);
    });
    
    // Update container
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(categoriesGrid);
}

/**
 * Update vote counts display on TV
 * @param {Object} votes - Object mapping category_id to vote count
 */
function updateVoteCounts(votes) {
    voteState.votes = votes;
    
    const container = document.getElementById('voteContainer');
    if (!container) return;
    
    const cards = container.querySelectorAll('[id^="vote-card-"]');
    cards.forEach(card => {
        const catId = card.id.replace('vote-card-', '');
        const voteCount = votes[catId] || 0;
        const color = voteState.voteCategories.find(c => c.id === catId)?.color || '#fff';
        
        // Update the vote count in the card
        const voteDiv = card.querySelector('div:last-child');
        if (voteDiv) {
            voteDiv.innerHTML = `📊 ${voteCount} votes`;
            voteDiv.style.color = color;
        }
    });
}

/**
 * Hide the vote screen
 */
function hideVoteScreen() {
    const container = document.getElementById('voteContainer');
    if (container) {
        container.style.display = 'none';
    }
}

/**
 * Show the player voting interface
 * @param {Array} categories - Array of category objects with id, name, color
 */
function showPlayerVote(categories) {
    voteState.voteCategories = categories;
    voteState.hasVoted = false;
    voteState.selectedCategory = null;
    
    // Create or update player vote container
    let container = document.getElementById('playerVoteContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'playerVoteContainer';
        container.style.cssText = `
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 20px;
        `;
        document.body.appendChild(container);
    }
    
    // Show container
    container.style.display = 'flex';
    
    // Create header
    let header = document.createElement('div');
    header.innerHTML = `
        <h1 style="color: #fff; font-size: 2rem; margin-bottom: 20px;">
            🗳️ Vote for the next category!
        </h1>
        <p style="color: #bdc3c7;">
            Tap a category to cast your vote
        </p>
    `;
    
    // Create categories grid
    let categoriesGrid = document.createElement('div');
    categoriesGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
        width: 100%;
        max-width: 500px;
        margin-top: 20px;
    `;
    
    categories.forEach((cat, index) => {
        let categoryBtn = document.createElement('button');
        categoryBtn.id = `player-vote-${cat.id}`;
        categoryBtn.style.cssText = `
            background: ${cat.color};
            border: none;
            border-radius: 12px;
            padding: 20px;
            color: #fff;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px ${cat.color}40;
        `;
        categoryBtn.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 10px;">
                ${getCategoryIcon(cat.id)}
            </div>
            ${cat.name}
        `;
        
        categoryBtn.addEventListener('click', () => castVote(cat.id));
        
        categoriesGrid.appendChild(categoryBtn);
    });
    
    // Update container
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(categoriesGrid);
}

/**
 * Get an appropriate emoji icon for a category
 */
function getCategoryIcon(categoryId) {
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
    return icons[categoryId] || '❓';
}

/**
 * Cast a vote
 * @param {string} categoryId - The ID of the category to vote for
 */
function castVote(categoryId) {
    if (voteState.hasVoted) return;
    
    voteState.hasVoted = true;
    voteState.selectedCategory = categoryId;
    
    // Visual feedback
    const btn = document.getElementById(`player-vote-${categoryId}`);
    if (btn) {
        btn.style.transform = 'scale(1.1)';
        btn.innerHTML = '<div style="font-size: 2.5rem; margin-bottom: 10px;">✅</div> Voted!';
        setTimeout(() => {
            btn.innerHTML = btn.innerHTML.replace('✅', '⭐');
        }, 1000);
    }
    
    // Send vote to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'vote',
            category_id: categoryId
        }));
    }
}

/**
 * Update vote counts for player view
 * @param {Object} votes - Object mapping category_id to vote count
 */
function updatePlayerVoteCounts(votes) {
    voteState.votes = votes;
    
    const container = document.getElementById('playerVoteContainer');
    if (!container) return;
    
    const buttons = container.querySelectorAll('[id^="player-vote-"]');
    buttons.forEach(btn => {
        const catId = btn.id.replace('player-vote-', '');
        const voteCount = votes[catId] || 0;
        const cat = voteState.voteCategories.find(c => c.id === catId);
        
        // Only update if not already voted
        if (!voteState.hasVoted && cat) {
            btn.innerHTML = `
                <div style="font-size: 2rem; margin-bottom: 10px;">
                    ${getCategoryIcon(catId)}
                </div>
                ${cat.name}
                <div style="font-size: 0.9rem; margin-top: 5px;">
                    ${voteCount} votes
                </div>
            `;
        }
    });
}

/**
 * Hide the player vote screen
 */
function hidePlayerVoteScreen() {
    const container = document.getElementById('playerVoteContainer');
    if (container) {
        container.style.display = 'none';
    }
}

/**
 * Update vote count display on player screen
 * @param {string} categoryId - The category ID that received a vote
 * @param {number} count - The new vote count
 */
function updatePlayerVoteCount(categoryId, count) {
    const btn = document.getElementById(`player-vote-${categoryId}`);
    if (btn && !voteState.hasVoted) {
        btn.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 10px;">
                ${getCategoryIcon(categoryId)}
            </div>
            ${voteState.voteCategories.find(c => c.id === categoryId)?.name || categoryId}
            <div style="font-size: 0.9rem; margin-top: 5px;">
                ${count} votes
            </div>
        `;
    }
}
