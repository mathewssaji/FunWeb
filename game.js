const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const uiLayer = document.getElementById('uiLayer');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreDisplay = document.getElementById('scoreDisplay');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl = document.getElementById('bestScore');

document.getElementById('backToMenuBtnStart').addEventListener('click', () => window.location.href = './index.html');
document.getElementById('backToMenuBtnEnd').addEventListener('click', () => window.location.href = './index.html');

let frames = 0;
let score = 0;
let bestScore = localStorage.getItem('bestScore') || 0;
bestScoreEl.innerText = bestScore;
let gameState = 'START';
let reqAnimFrame;

// Update instructional text upon load based on mode
const instructionText = startScreen.querySelector('p');
if (localStorage.getItem('voiceMode') === 'true') {
    instructionText.innerHTML = "Make Noise to Play!";
} else {
    instructionText.innerHTML = "Press <kbd>Space</kbd> or Tap!";
}

let birdImage = null;
let pipeImage = null;
let bgImage = null;
let flapSound = null;
let crashSound = null;

let birdColor = localStorage.getItem('birdColor') || '#fce205';
let birdSizeMultiplier = parseFloat(localStorage.getItem('birdSize')) || 1.0;
let pipeColor = localStorage.getItem('pipeColor') || '#54b256';
let bgColor = localStorage.getItem('bgColor') || '#70c5ce';
let voiceMode = localStorage.getItem('voiceMode') === 'true';

function loadAsset(key, isAudio = false) {
    const dataUrl = localStorage.getItem(key);
    if (!dataUrl) return null;
    if (isAudio) {
        return new Audio(dataUrl);
    } else {
        const img = new Image();
        img.src = dataUrl;
        return img;
    }
}

birdImage = loadAsset('birdImage');
pipeImage = loadAsset('pipeImage');
bgImage = loadAsset('bgImage');
flapSound = loadAsset('flapSound', true);
crashSound = loadAsset('crashSound', true);

let audioContext;
let analyser;
let microphone;
let lastFlapTime = 0;
const flapCooldown = 300;
let currentVolume = 0; // Expose volume for drawing

async function initMicrophone() {
    if (!voiceMode) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        console.log("Microphone initialized for voice controls");
    } catch (err) {
        console.error("Microphone access denied or error:", err);
        alert("Microphone access is required for Voice Mode to work!");
        voiceMode = false;
    }
}

function checkVoiceInput() {
    if (!voiceMode || !analyser || gameState !== 'PLAYING') return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    currentVolume = sum / dataArray.length;

    if (currentVolume > 25) {
        const now = Date.now();
        if (now - lastFlapTime > flapCooldown) {
            bird.flap(getRelativeSizes());
            lastFlapTime = now;
        }
    }
}

function playSound(audioEl) {
    if (audioEl && audioEl.readyState >= 2) {
        audioEl.currentTime = 0;
        audioEl.play().catch(e => console.log('Audio play failed:', e));
    }
}

const getRelativeSizes = () => {
    const isVoice = voiceMode;
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Calculate a difficulty multiplier based on the current score
    // Caps at a max 1.6x multiplier around 50 points to prevent impossible speeds
    let diffScale = 1 + (score * 0.012);
    
    // Add a sudden baseline speed increase at score 5
    if (score >= 5) {
        diffScale += 0.15; // Suddenly speeds up and gap closes slightly
    }
    
    diffScale = Math.min(1.6, diffScale); // Max cap

    return {
        gravity: ch * (isVoice ? 0.00025 : 0.0003),
        jump: ch * (isVoice ? -0.007 : -0.0075),
        pipeWidth: Math.max(50, cw * 0.12), 
        // Gap gets smaller as score increases
        pipeGap: Math.max(isVoice ? 220 : 130, ch * (isVoice ? 0.45 : 0.28) / diffScale),
        // Speed gets faster as score increases
        pipeSpeed: cw * (isVoice ? 0.003 : 0.004) * diffScale, 
        birdRadius: Math.max(12, ch * 0.015) * birdSizeMultiplier
    };
};

const bird = {
    x: canvas.width * 0.2,
    y: canvas.height / 2,
    velocity: 0,

    draw: function(s) {
        if (birdImage && birdImage.complete) {
            const size = s.birdRadius * 2.5; 
            ctx.drawImage(birdImage, this.x - size/2, this.y - size/2, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, s.birdRadius, 0, Math.PI * 2);
            ctx.fillStyle = birdColor;
            ctx.fill();
            
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#000';
            ctx.stroke();
        }
    },

    update: function(s) {
        this.velocity += s.gravity;
        this.y += this.velocity;

        if (this.y + s.birdRadius >= canvas.height) {
            this.y = canvas.height - s.birdRadius;
            gameOver(s);
        }
        
        if (this.y - s.birdRadius <= 0) {
            this.y = s.birdRadius;
            this.velocity = 0;
        }
    },

    flap: function(s) {
        this.velocity = s.jump;
        playSound(flapSound);
    },

    reset: function() {
        this.y = canvas.height / 2;
        this.velocity = 0;
    }
};

const pipes = {
    items: [],

    draw: function(s) {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            if (pipeImage && pipeImage.complete) {
                ctx.drawImage(pipeImage, p.x, 0, s.pipeWidth, p.top);
                ctx.drawImage(pipeImage, p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
            } else {
                ctx.fillStyle = pipeColor;
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#000';
                
                ctx.fillRect(p.x, 0, s.pipeWidth, p.top);
                ctx.strokeRect(p.x, 0, s.pipeWidth, p.top);
                ctx.fillRect(p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
                ctx.strokeRect(p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
            }
        }
    },

    update: function(s) {
        // Frequency of spawned pipes scales with the pipe speed, ensuring pipes aren't drawn on top of each other
        // Calculate dynamic frequency so the gap between pipes decreases slightly but safely as it gets harder
        let baseFreq = voiceMode ? 140 : 110;
        let diffScale = 1 + (score * 0.012);
        if (score >= 5) diffScale += 0.15;
        diffScale = Math.min(1.6, diffScale);
        
        let freq = Math.floor(baseFreq / diffScale); 

        if (frames % freq === 0 && frames > 0) {
            let minPipeHeight = canvas.height * 0.1; 
            let maxTopHeight = canvas.height - s.pipeGap - minPipeHeight;
            let topHeight = Math.max(minPipeHeight, Math.random() * maxTopHeight);
            
            this.items.push({
                x: canvas.width,
                top: topHeight,
                bottom: canvas.height - (topHeight + s.pipeGap),
                passed: false
            });
        }

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            p.x -= s.pipeSpeed;

            let bxLeft = bird.x - s.birdRadius;
            let bxRight = bird.x + s.birdRadius;
            let byTop = bird.y - s.birdRadius;
            let byBottom = bird.y + s.birdRadius;

            let pxLeft = p.x;
            let pxRight = p.x + s.pipeWidth;

            if (bxRight > pxLeft * 1.05 && bxLeft < pxRight * 0.95) {
                if (byTop < p.top || byBottom > canvas.height - p.bottom) {
                    gameOver(s);
                }
            }

            if (p.x + s.pipeWidth < bird.x && !p.passed) {
                score++;
                scoreDisplay.innerText = score;
                p.passed = true;
            }

            if (p.x + s.pipeWidth < 0) {
                this.items.shift();
                i--;
            }
        }
    },

    reset: function() {
        this.items = [];
    }
};

function drawBackground() {
    if (bgImage && bgImage.complete) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawMicFeedback() {
    if (!voiceMode || gameState !== 'PLAYING') return;

    // Draw the "MAKE NOISE!" warning text center top if score >= 5
    if (score >= 5) {
        ctx.fillStyle = '#fce205'; // Retro yellow warning
        // Scale font slightly based on screen
        const fontSize = Math.max(16, canvas.width * 0.03); 
        ctx.font = `${fontSize}px "Press Start 2P"`;
        ctx.textAlign = 'center';
        
        // Add shadow for readability
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        
        // Pulsing effect based on frame count
        if (frames % 40 < 20) {
            ctx.fillText('MAKE NOISE!', canvas.width / 2, canvas.height * 0.15);
        }
        
        ctx.shadowColor = 'transparent'; // Reset shadow
    }

    const barWidth = 30;
    const maxBarHeight = 150;
    const margin = 20;
    
    // Draw background container
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(margin, canvas.height - margin - maxBarHeight, barWidth, maxBarHeight);
    
    // Map volume to height (assuming 0-100 is normal range, cap at 100)
    let fillHeight = (Math.min(currentVolume, 100) / 100) * maxBarHeight;
    
    // Color logic: Red if below threshold, Green if above threshold
    if (currentVolume > 25) {
        ctx.fillStyle = '#54b256'; // Green
    } else {
        ctx.fillStyle = '#e43b44'; // Red
    }
    
    // Draw volume fill
    ctx.fillRect(margin, canvas.height - margin - fillHeight, barWidth, fillHeight);
    
    // Draw threshold line
    const thresholdY = canvas.height - margin - (25 / 100) * maxBarHeight;
    ctx.fillStyle = 'white';
    ctx.fillRect(margin - 5, thresholdY, barWidth + 10, 4);
    
    // Text label
    ctx.fillStyle = 'white';
    ctx.font = '12px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText('MIC', margin - 5, canvas.height - margin - maxBarHeight - 10);
}

let lastTime = 0;
let accumulator = 0;
const timeStep = 1000 / 60; // 60 physics updates per physical second

function loop(timestamp) {
    if (gameState !== 'PLAYING') return;
    
    reqAnimFrame = requestAnimationFrame(loop);

    if (!timestamp) timestamp = performance.now();
    let deltaTime = timestamp - lastTime;
    if (deltaTime > 250) deltaTime = 250; // Cap to prevent death spiral if tab inactive
    lastTime = timestamp;

    accumulator += deltaTime;

    const sizes = getRelativeSizes();

    // Fixed timestep guarantees logic executes consistently regardless of fps lag
    while (accumulator >= timeStep) {
        bird.update(sizes);
        pipes.update(sizes);
        frames++;
        accumulator -= timeStep;
    }

    // Always draw once per screen refresh
    drawBackground();
    pipes.draw(sizes);
    bird.draw(sizes);
    drawMicFeedback();
    
    checkVoiceInput();
}

function resetGame() {
    bird.reset();
    pipes.reset();
    score = 0;
    frames = 0;
    accumulator = 0;
    lastTime = performance.now(); // Reset loop timing
    scoreDisplay.innerText = score;
    scoreDisplay.classList.remove('hidden');
    
    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');
    uiLayer.style.pointerEvents = 'none';

    gameState = 'PLAYING';
    
    if (voiceMode && !audioContext) {
        initMicrophone().then(loop);
    } else {
        loop();
    }
}

function gameOver(sizes) {
    gameState = 'GAMEOVER';
    cancelAnimationFrame(reqAnimFrame);
    playSound(crashSound);

    drawBackground();
    pipes.draw(sizes);
    bird.draw(sizes);

    finalScoreEl.innerText = score;
    bestScore = Math.max(score, bestScore);
    localStorage.setItem('bestScore', bestScore);
    bestScoreEl.innerText = bestScore;

    scoreDisplay.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    setTimeout(() => {
        gameOverScreen.classList.add('active');
        uiLayer.style.pointerEvents = 'auto'; 
    }, 50);
}

function drawInitialState() {
    const sizes = getRelativeSizes();
    bird.x = canvas.width * 0.2;
    drawBackground();
    bird.draw(sizes);
}

function inputHandler(e) {
    if (voiceMode) return; // Disable tapping and spacebar when using voice controls
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.target.closest('.btn-group') || e.target.tagName === 'BUTTON') return;

    if (gameState === 'START') {
        resetGame();
        bird.flap(getRelativeSizes());
    } else if (gameState === 'PLAYING') {
        bird.flap(getRelativeSizes());
    }
}

window.addEventListener('keydown', inputHandler);
canvas.addEventListener('mousedown', inputHandler);
canvas.addEventListener('touchstart', (e) => {
    if (e.target.tagName !== 'BUTTON') {
        e.preventDefault(); 
        inputHandler(e);
    }
}, {passive: false});

startBtn.addEventListener('click', () => {
    resetGame();
    bird.flap(getRelativeSizes());
});

restartBtn.addEventListener('click', () => {
    resetGame();
    bird.flap(getRelativeSizes());
});

if(birdImage) birdImage.onload = drawInitialState;
if(bgImage) bgImage.onload = drawInitialState;
drawInitialState();
