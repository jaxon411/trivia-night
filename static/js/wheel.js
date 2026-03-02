/**
 * Spinning Wheel Animation for Trivia Night
 * Visualizes the weighted random category selection
 */

class SpinWheel {
    constructor(canvasId, categories, weights) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.categories = categories; // [{name, color}]
        this.weights = weights; // [5, 1, 1, 1, 1]
        this.angle = 0;
        this.winnerIndex = null;
        this.isSpinning = false;
        
        // Setup canvas
        this.canvas.width = 500;
        this.canvas.height = 500;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = 200;
        
        // Calculate total weight
        this.totalWeight = this.weights.reduce((a, b) => a + b, 0);
        
        // Calculate each segment's angle (proportional to weight)
        this.segmentAngles = this.weights.map(w => (w / this.totalWeight) * 2 * Math.PI);
        
        // Initialize drawing
        this.draw(0);
    }
    
    /**
     * Calculate which category is at a given angle
     * The wheel starts at -PI/2 (top), so we need to account for that
     */
    getCategoryAtAngle(angle) {
        // Normalize angle to 0-2PI
        let normalizedAngle = (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        // Add PI/2 to account for starting at top
        normalizedAngle = (normalizedAngle + Math.PI / 2) % (2 * Math.PI);
        
        // We want the angle *pointed to* by the top pointer
        // Since wheel rotates clockwise, we subtract from 2PI
        const pointerAngle = (2 * Math.PI - normalizedAngle) % (2 * Math.PI);
        
        let sum = 0;
        for (let i = 0; i < this.segmentAngles.length; i++) {
            sum += this.segmentAngles[i];
            if (pointerAngle <= sum) {
                return i;
            }
        }
        return 0;
    }
    
    /**
     * Draw the wheel at the given rotation angle
     */
    draw(angle) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw outer border
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius + 15, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.fill();
        
        // Draw each segment
        let startAngle = angle - Math.PI / 2; // Start at top
        
        for (let i = 0; i < this.categories.length; i++) {
            const endAngle = startAngle + this.segmentAngles[i];
            
            // Draw segment
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX, this.centerY);
            this.ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = this.categories[i].color;
            this.ctx.fill();
            
            // Draw text in segment
            const midAngle = (startAngle + endAngle) / 2;
            this.ctx.save();
            this.ctx.translate(this.centerX, this.centerY);
            this.ctx.rotate(midAngle);
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText(this.categories[i].name, this.radius - 20, 5);
            this.ctx.restore();
            
            startAngle = endAngle;
        }
        
        // Draw inner circle (center hub)
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 30, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.fill();
        
        // Draw pointer (triangle at top)
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX - 10, this.centerY - this.radius - 15);
        this.ctx.lineTo(this.centerX + 10, this.centerY - this.radius - 15);
        this.ctx.lineTo(this.centerX, this.centerY - this.radius - 30);
        this.ctx.closePath();
        this.ctx.fillStyle = '#e74c3c';
        this.ctx.fill();
        
        // Draw winning flash if spinning is done
        if (this.winnerIndex !== null && !this.isSpinning) {
            this.drawWinnerFlash();
        }
    }
    
    /**
     * Draw a pulsing flash effect on the winning segment
     */
    drawWinnerFlash() {
        const winnerAngleStart = this.getWinnerAngleRange();
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2; // 0 to 1
        
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY);
        this.ctx.arc(this.centerX, this.centerY, this.radius, 
                    winnerAngleStart[0], winnerAngleStart[1]);
        this.ctx.closePath();
        
        // Blend with winner color at 50% opacity
        this.ctx.fillStyle = this.categories[this.winnerIndex].color + Math.floor(0.8 * 255).toString(16).padStart(2, '0');
        this.ctx.fill();
        this.ctx.restore();
    }
    
    /**
     * Get the angle range for the winning category
     */
    getWinnerAngleRange() {
        // The wheel has rotated, so we need to calculate where each category is now
        const rotation = this.angle % (2 * Math.PI);
        let startAngle = rotation - Math.PI / 2;
        
        for (let i = 0; i < this.winnerIndex; i++) {
            startAngle += this.segmentAngles[i];
        }
        
        const endAngle = startAngle + this.segmentAngles[this.winnerIndex];
        return [startAngle, endAngle];
    }
    
    /**
     * Ease-out cubic function for smooth deceleration
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    /**
     * Spin the wheel to land on the specified category
     * @param {number} winnerIndex - The index of the winning category
     * @param {number} duration - Animation duration in milliseconds (default: 4000)
     * @returns {Promise<void>} - Resolves when animation completes
     */
    spin(winnerIndex, duration = 4000) {
        return new Promise((resolve) => {
            this.winnerIndex = winnerIndex;
            this.isSpinning = true;
            
            // Calculate total rotation: at least 3 full rotations + landing position
            const minRotations = 3;
            const baseAngle = minRotations * 2 * Math.PI;
            
            // Calculate the angle to land on the winner
            // The pointer is at the top (-PI/2), so we need to calculate where winner should be
            let winnerTargetAngle = 0;
            for (let i = 0; i < winnerIndex; i++) {
                winnerTargetAngle += this.segmentAngles[i];
            }
            // Center of the winning segment
            winnerTargetAngle += this.segmentAngles[winnerIndex] / 2;
            
            // We want the center of the winning segment to point to the top
            // So the wheel should stop at: -PI/2 - winnerTargetAngle
            // Normalized to positive:
            const stopAngle = (3 * Math.PI / 2 - winnerTargetAngle) % (2 * Math.PI);
            
            // Total rotation: current + base rotations + adjustment to land on winner
            let startAngle = this.angle % (2 * Math.PI);
            let totalRotation = baseAngle + (stopAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
            
            // If totalRotation is less than base, add full rotations
            while (totalRotation < baseAngle) {
                totalRotation += 2 * Math.PI;
            }
            
            const finalAngle = this.angle + totalRotation;
            
            const startTime = performance.now();
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = this.easeOutCubic(progress);
                
                this.angle = startAngle + totalRotation * easedProgress;
                this.draw(this.angle);
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.isSpinning = false;
                    this.draw(this.angle);
                    resolve();
                }
            };
            
            requestAnimationFrame(animate);
        });
    }
    
    /**
     * Update the wheel with new categories/weights
     */
    update(categories, weights) {
        this.categories = categories;
        this.weights = weights;
        this.totalWeight = weights.reduce((a, b) => a + b, 0);
        this.segmentAngles = weights.map(w => (w / this.totalWeight) * 2 * Math.PI);
        this.draw(this.angle);
    }
}

// Global instance
let spinWheel = null;

/**
 * Initialize the wheel for a voting round
 * @param {Array} categories - Array of {id, name, color}
 * @param {Array} weights - Array of weights corresponding to each category
 * @param {number} winnerIndex - The index of the winning category
 * @returns {Promise<void>}
 */
async function initAndSpinWheel(categories, weights, winnerIndex) {
    const canvasId = 'wheelCanvas';
    let canvas = document.getElementById(canvasId);
    
    // Create canvas if it doesn't exist
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = canvasId;
        canvas.width = 500;
        canvas.height = 500;
        
        // Find the wheel container or create one
        let container = document.getElementById('wheelContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'wheelContainer';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.gap = '20px';
            document.body.appendChild(container);
        }
        container.appendChild(canvas);
    }
    
    spinWheel = new SpinWheel(canvasId, categories, weights);
    await spinWheel.spin(winnerIndex);
    return spinWheel;
}

/**
 * Get the current wheel instance
 */
function getWheel() {
    return spinWheel;
}
