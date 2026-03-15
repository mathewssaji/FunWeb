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
    let vol = sum / dataArray.length;

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

const getRelativeSizes = () => {
    const isVoice = voiceMode;
    // Base scale strictly on height to maintain consistent physical proportions across devices
    // instead of tying movement logic to width which varies wildly between desktop and mobile.
    const baseScale = canvas.height;
    
    return {
        gravity: baseScale * (isVoice ? 0.00025 : 0.0003),
        jump: baseScale * (isVoice ? -0.007 : -0.0075),
        pipeWidth: Math.max(50, baseScale * 0.12), // 12% of screen height
        pipeGap: Math.max(isVoice ? 250 : 140, baseScale * (isVoice ? 0.45 : 0.22)),
        pipeSpeed: baseScale * (isVoice ? 0.004 : 0.0045), // consistent speed across screens
        birdRadius: Math.max(12, baseScale * 0.015) * birdSizeMultiplier
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
        // Frequency of pipes based purely on the consistent size scale
        let freq = Math.floor(canvas.height / s.pipeSpeed * 0.5); 
        if (freq < 45) freq = 45;

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

let lastTime = 0;
const frameInterval = 1000 / 60; // Hard cap at 60 FPS

function loop(timestamp) {
    if (gameState !== 'PLAYING') return;
    
    reqAnimFrame = requestAnimationFrame(loop);

    if (!timestamp) timestamp = performance.now();
    let deltaTime = timestamp - lastTime;

    // Throttle rendering and logic to exactly 60 updates per second
    if (deltaTime >= frameInterval) {
        lastTime = timestamp - (deltaTime % frameInterval);

        const sizes = getRelativeSizes();

        drawBackground();
        pipes.draw(sizes);
        bird.draw(sizes);

        bird.update(sizes);
        pipes.update(sizes);
        
        checkVoiceInput();

        frames++;
    }
}

function resetGame() {
    bird.reset();
    pipes.reset();
    score = 0;
    frames = 0;
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
