// Fullscreen Canvas Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set initially

// UI Elements
const uiLayer = document.getElementById('uiLayer');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreDisplay = document.getElementById('scoreDisplay');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl = document.getElementById('bestScore');

// Navigation Buttons
document.getElementById('backToMenuBtnStart').addEventListener('click', () => window.location.href = './index.html');
document.getElementById('backToMenuBtnEnd').addEventListener('click', () => window.location.href = './index.html');

// Game Metrics
let frames = 0;
let score = 0;
let bestScore = localStorage.getItem('bestScore') || 0;
bestScoreEl.innerText = bestScore;
let gameState = 'START'; // START, PLAYING, GAMEOVER
let reqAnimFrame;

// Assets (User customized or defaults)
let birdImage = null;
let pipeImage = null;
let bgImage = null;
let flapSound = null;
let crashSound = null;

let birdColor = localStorage.getItem('birdColor') || '#fce205'; // Retro yellow
let birdSizeMultiplier = parseFloat(localStorage.getItem('birdSize')) || 1.0;
let pipeColor = localStorage.getItem('pipeColor') || '#54b256'; // Retro green
let bgColor = localStorage.getItem('bgColor') || '#70c5ce'; // Retro sky blue
let voiceMode = localStorage.getItem('voiceMode') === 'true';

// Load Assets from localStorage
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

// --- Audio Input (Voice Mode) ---
let audioContext;
let analyser;
let microphone;
let lastFlapTime = 0;
const flapCooldown = 300; // ms

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
        voiceMode = false; // fallback to tap
    }
}

function checkVoiceInput() {
    if (!voiceMode || !analyser || gameState !== 'PLAYING') return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    let vol = sum / dataArray.length;

    // Threshold can be adjusted; 25 is easier for voice play without shouting
    if (vol > 25) {
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

// Relative sizes based on canvas height for responsiveness
const getRelativeSizes = () => {
    // Make the game a bit easier if using voice controls
    const isVoice = voiceMode;
    return {
        gravity: canvas.height * (isVoice ? 0.00025 : 0.00035), // Reduce gravity for voice
        jump: canvas.height * (isVoice ? -0.007 : -0.008), // Softer jump for voice
        pipeWidth: Math.max(50, canvas.width * 0.1),
        pipeGap: Math.max(isVoice ? 250 : 140, canvas.height * (isVoice ? 0.45 : 0.22)), // Even wider gap for voice
        pipeSpeed: canvas.width * (isVoice ? 0.0035 : 0.005), // Slower pipes for voice
        birdRadius: Math.max(12, canvas.height * 0.015) * birdSizeMultiplier
    };
};

const bird = {
    x: canvas.width * 0.2, // 20% in from left
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

        // Floor collision
        if (this.y + s.birdRadius >= canvas.height) {
            this.y = canvas.height - s.birdRadius;
            gameOver(s);
        }
        
        // Ceiling
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
                // Top pipe
                ctx.drawImage(pipeImage, p.x, 0, s.pipeWidth, p.top);
                // Bottom pipe
                ctx.drawImage(pipeImage, p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
            } else {
                ctx.fillStyle = pipeColor;
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#000';
                
                // Top
                ctx.fillRect(p.x, 0, s.pipeWidth, p.top);
                ctx.strokeRect(p.x, 0, s.pipeWidth, p.top);
                // Bottom
                ctx.fillRect(p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
                ctx.strokeRect(p.x, canvas.height - p.bottom, s.pipeWidth, p.bottom);
            }
        }
    },

    update: function(s) {
        // Frequency of pipes relative to width/speed
        let freq = Math.floor(canvas.width / s.pipeSpeed / 2.5);
        if (freq < 40) freq = 40; // minimum frames between pipes

        if (frames % freq === 0) {
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

            // Collision
            let bxLeft = bird.x - s.birdRadius;
            let bxRight = bird.x + s.birdRadius;
            let byTop = bird.y - s.birdRadius;
            let byBottom = bird.y + s.birdRadius;

            let pxLeft = p.x;
            let pxRight = p.x + s.pipeWidth;

            // Hitbox
            if (bxRight > pxLeft * 1.05 && bxLeft < pxRight * 0.95) { // mild forgiving hitbox
                if (byTop < p.top || byBottom > canvas.height - p.bottom) {
                    gameOver(s);
                }
            }

            // Score
            if (p.x + s.pipeWidth < bird.x && !p.passed) {
                score++;
                scoreDisplay.innerText = score;
                p.passed = true;
            }

            // Remove off screen
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

// --- Engine ---

function drawBackground() {
    if (bgImage && bgImage.complete) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    } else {
        // Base color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function loop() {
    if (gameState !== 'PLAYING') return;
    
    // Obtain dynamic sizes for robust resizing support during play
    const sizes = getRelativeSizes();

    drawBackground();
    pipes.draw(sizes);
    bird.draw(sizes);

    bird.update(sizes);
    pipes.update(sizes);
    
    checkVoiceInput();

    frames++;
    reqAnimFrame = requestAnimationFrame(loop);
}

function resetGame() {
    bird.reset();
    pipes.reset();
    score = 0;
    frames = 0;
    scoreDisplay.innerText = score;
    scoreDisplay.classList.remove('hidden');
    
    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');
    uiLayer.style.pointerEvents = 'none';

    gameState = 'PLAYING';
    
    // Initialize mic if voice mode on first play attempt
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
    bird.x = canvas.width * 0.2; // reset X just in case Resize happened
    drawBackground();
    bird.draw(sizes);
}

function inputHandler(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.target.closest('.btn-group') || e.target.tagName === 'BUTTON') return; // Ignore if clicking button

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

// Update draw if image lazy loads
if(birdImage) birdImage.onload = drawInitialState;
if(bgImage) bgImage.onload = drawInitialState;
drawInitialState();
