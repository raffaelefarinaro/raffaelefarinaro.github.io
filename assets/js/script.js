const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');

const HEAD_SIZE = 48;
const GRID_SPACING = 80;
const MAX_HEADS = 100;

let heads = [];
let particles = [];
let cursorTrail = []; // Stores {x, y, life}
let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let audioCtx = null;
let isUnlocked = false;

let scareTimer = 0;
const SCARE_DURATION = 40;

const colors = [null, '#111111', '#ffccaa', '#ffffff', '#333333'];

// --- IMAGES ---
const headImage = new Image();
headImage.src = 'assets/face.png';

const scaredImage = new Image();
scaredImage.src = 'assets/face_scared.png';

// --- BUTTON TRACKING ---
let buttons = [];

function updateButtonPositions() {
    // Cache button bounding boxes to avoid layout thrashing
    const btns = document.querySelectorAll('.pixel-btn');
    buttons = Array.from(btns).map(btn => ({
        element: btn,
        rect: btn.getBoundingClientRect()
    }));
}

function playExplosionSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) { }
}

class Head {
    constructor(x, y) {
        this.size = HEAD_SIZE;
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
    }

    update() {
        if (scareTimer > 0) {
            this.x = this.baseX + (Math.random() * 6 - 3);
            this.y = this.baseY + (Math.random() * 6 - 3);
        } else {
            this.x = this.baseX;
            this.y = this.baseY;
        }
    }

    draw() {
        ctx.imageSmoothingEnabled = false;

        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const angle = Math.atan2(mouse.y - cy, mouse.x - cx);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        const img = (scareTimer > 0) ? scaredImage : headImage;
        if (img.complete) {
            ctx.drawImage(img, -this.size / 2, -this.size / 2, this.size, this.size);
        }
        ctx.restore();
    }

    isHit(mx, my) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
        return dist < (this.size / 2) + 5;
    }

    getRect() {
        return {
            left: this.x,
            right: this.x + this.size,
            top: this.y,
            bottom: this.y + this.size
        };
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = (Math.random() * 6 + 4);
        this.speedX = (Math.random() - 0.5) * 15;
        this.speedY = (Math.random() - 0.5) * 15;
        this.color = color;
        this.life = 1.0;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.05;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

function init() {
    resize();
    createGrid();
    updateButtonPositions();
    animate();
}

function createGrid() {
    if (isUnlocked) return;

    heads = [];
    const area = canvas.width * canvas.height;
    const maxSpacing = Math.sqrt(area / MAX_HEADS);
    const spacing = Math.max(GRID_SPACING, maxSpacing);
    const cols = Math.ceil(canvas.width / spacing);
    const rows = Math.ceil(canvas.height / spacing);

    const offsetX = (canvas.width - (cols * spacing)) / 2 + (spacing / 2) - (HEAD_SIZE / 2);
    const offsetY = (canvas.height - (rows * spacing)) / 2 + (spacing / 2) - (HEAD_SIZE / 2);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = offsetX + c * spacing;
            const y = offsetY + r * spacing;

            if (x > -spacing && x < canvas.width && y > -spacing && y < canvas.height) {
                heads.push(new Head(x, y));
            }
        }
    }

    // Slight delay to ensure DOM is ready for updateButtonPositions if called early
    setTimeout(updateButtonPositions, 100);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateButtonPositions();
    if (!isUnlocked) createGrid();
}

function checkCollisions() {
    if (isUnlocked) return;

    buttons.forEach(btnObj => {
        let isBlocked = false;

        // Simple AABB collision check
        // Expand face rect slightly for "safety margin"
        for (let head of heads) {
            const h = head.getRect();
            const b = btnObj.rect;

            // Check intersection (with some padding on heads)
            if (h.left < b.right && h.right > b.left &&
                h.top < b.bottom && h.bottom > b.top) {
                isBlocked = true;
                break;
            }
        }

        if (isBlocked) {
            btnObj.element.classList.add('is-locked');
        } else {
            btnObj.element.classList.remove('is-locked');
        }
    });
}

function drawCursor() {
    // Draw Trail
    for (let i = 0; i < cursorTrail.length; i++) {
        const point = cursorTrail[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 * point.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(231, 76, 60, ${point.life * 0.5})`; // Red trail
        ctx.fill();
        point.life -= 0.1;
    }
    // Cleanup trail
    cursorTrail = cursorTrail.filter(p => p.life > 0);

    // Add new point
    cursorTrail.push({ x: mouse.x, y: mouse.y, life: 1.0 });

    // Draw Laser Pointer
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0000';
    ctx.fill();

    // Glow
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fill();
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (scareTimer > 0) scareTimer--;

    checkCollisions();

    for (let i = heads.length - 1; i >= 0; i--) {
        heads[i].update();
        heads[i].draw();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    drawCursor();

    requestAnimationFrame(animate);
}

function handleInput(e, isClick) {
    let cx, cy;

    if (e.type === 'touchend') {
        // For touchend, use changedTouches because touches is empty
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
    } else if (e.type.includes('touch')) {
        // touchstart / touchmove
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
    } else {
        cx = e.clientX;
        cy = e.clientY;
    }

    mouse.x = cx;
    mouse.y = cy;

    // isClick is true for mousedown and touchend
    if (isClick && !isUnlocked) {
        // Prevent default on touchend to avoid ghost mouse clicks
        if (e.type === 'touchend') {
            e.preventDefault();
        }

        let hit = false;
        // Priority 1: Click on a Face
        for (let i = heads.length - 1; i >= 0; i--) {
            if (heads[i].isHit(cx, cy)) {
                explode(heads[i]);
                heads.splice(i, 1);
                playExplosionSound();
                scareTimer = SCARE_DURATION;
                hit = true;
                break;
            }
        }

        if (hit) {
            // Face exploded. Done.
        } else {
            // Priority 2: Check buttons below
            // But ONLY if the button is NOT locked
            canvas.style.visibility = 'hidden';
            const elementBelow = document.elementFromPoint(cx, cy);
            canvas.style.visibility = 'visible';

            if (elementBelow && (elementBelow.closest('a') || elementBelow.closest('button'))) {
                const target = elementBelow.closest('a') || elementBelow.closest('button');
                // Check if this specific target is locked
                if (!target.classList.contains('is-locked')) {
                    target.click();
                }
            }
        }

        checkWinCondition();
    }
}

function checkWinCondition() {
    if (heads.length === 0) {
        isUnlocked = true;
        ui.style.display = 'none'; // Hide the bottom UI text
        // Show the banner
        const banner = document.getElementById('win-banner');
        banner.classList.remove('hidden');

        // Let user use system cursor now
        canvas.style.cursor = 'auto';
        // Remove locked classes
        buttons.forEach(b => b.element.classList.remove('is-locked'));
    } else {
        ui.innerHTML = `TARGETS LEFT: ${heads.length}`;
    }
}

function explode(head) {
    const centerX = head.x + head.size / 2;
    const centerY = head.y + head.size / 2;
    for (let i = 0; i < 20; i++) {
        const c = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(centerX, centerY, c || '#fff'));
    }
}

window.addEventListener('resize', resize);
window.addEventListener('scroll', updateButtonPositions); // Scroll might shift relative positions
window.addEventListener('mousemove', e => handleInput(e, false));
window.addEventListener('mousedown', e => handleInput(e, true));
window.addEventListener('touchmove', e => {
    // Prevent scrolling or zooming while playing
    if (!isUnlocked) e.preventDefault();
    handleInput(e, false);
}, { passive: false });
// Switch to touchend for clicking
window.addEventListener('touchend', e => {
    handleInput(e, true);
}, { passive: false });

init();
