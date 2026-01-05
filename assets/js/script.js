const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');

const HEAD_SIZE = 48;
const GRID_SPACING = 80;
const TARGET_TAPS = 50;
const EXPLOSION_RADIUS = HEAD_SIZE * 2.2;

let heads = [];
let particles = [];
let clickEffects = [];
let slices = [];
let cursorTrail = []; // Stores {x, y, life}
let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let prevMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let audioCtx = null;
let isUnlocked = false;

let scareTimer = 0;
const SCARE_DURATION = 40;
const SLICE_INTERVAL = 60;
let pointerDown = false;
let lastSliceTime = 0;
let hadSliceSinceDown = false;
let touchStart = null;
const SWIPE_THRESHOLD = 18;

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

function playSliceSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
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

class ClickEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.radius = 10;
    }

    update() {
        this.radius += 6;
        this.life -= 0.06;
    }

    draw() {
        const outerRadius = this.radius + 18;
        const gradient = ctx.createRadialGradient(
            this.x,
            this.y,
            this.radius * 0.2,
            this.x,
            this.y,
            outerRadius
        );
        gradient.addColorStop(0, `rgba(255, 230, 120, ${this.life * 0.9})`);
        gradient.addColorStop(0.6, `rgba(255, 120, 40, ${this.life * 0.8})`);
        gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');

        ctx.beginPath();
        ctx.arc(this.x, this.y, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 80, ${this.life})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

class SlicePiece {
    constructor(cx, cy, size, faceAngle, sliceAngle, side) {
        this.cx = cx;
        this.cy = cy;
        this.size = size;
        this.faceAngle = faceAngle;
        this.sliceAngle = sliceAngle;
        this.side = side;
        this.life = 1.0;

        const normal = sliceAngle + Math.PI / 2;
        const speed = 3 + Math.random() * 2;
        this.vx = Math.cos(normal) * speed * side + (Math.random() - 0.5) * 1.2;
        this.vy = Math.sin(normal) * speed * side + 1.2;
        this.rot = (Math.random() * 0.4 + 0.2) * side;
    }

    update() {
        this.cx += this.vx;
        this.cy += this.vy;
        this.rot += 0.02 * this.side;
        this.life -= 0.02;
    }

    draw() {
        const img = (scareTimer > 0) ? scaredImage : headImage;
        if (!img.complete) return;

        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.translate(this.cx, this.cy);
        ctx.rotate(this.faceAngle + this.rot);

        const sliceAngleRel = this.sliceAngle - this.faceAngle;
        ctx.rotate(sliceAngleRel);
        ctx.beginPath();
        if (this.side > 0) {
            ctx.rect(-this.size, 0, this.size * 2, this.size);
        } else {
            ctx.rect(-this.size, -this.size, this.size * 2, this.size);
        }
        ctx.clip();
        ctx.rotate(-sliceAngleRel);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -this.size / 2, -this.size / 2, this.size, this.size);

        ctx.restore();
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
    const densityBoost = Math.sqrt(area / (TARGET_TAPS * 1.4));
    const spacing = Math.min(GRID_SPACING, densityBoost);
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

    for (let i = clickEffects.length - 1; i >= 0; i--) {
        clickEffects[i].update();
        clickEffects[i].draw();
        if (clickEffects[i].life <= 0) {
            clickEffects.splice(i, 1);
        }
    }

    for (let i = slices.length - 1; i >= 0; i--) {
        slices[i].update();
        slices[i].draw();
        if (slices[i].life <= 0) {
            slices.splice(i, 1);
        }
    }

    drawCursor();

    requestAnimationFrame(animate);
}

function handleInput(e, isClick) {
    const now = performance.now();
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

    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    mouse.x = cx;
    mouse.y = cy;

    // isClick is true for mousedown and touchend
    if (isClick && !isUnlocked) {
        if (hadSliceSinceDown) {
            return;
        }
        // Prevent default on touchend to avoid ghost mouse clicks
        if (e.type === 'touchend') {
            e.preventDefault();
        }

        let hit = false;
        // Priority 1: Click on a Face
        for (let i = heads.length - 1; i >= 0; i--) {
            if (heads[i].isHit(cx, cy)) {
                triggerExplosion(heads[i]);
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

    if (pointerDown && !isClick && !isUnlocked) {
        let allowSlice = true;
        if (e.type.includes('touch')) {
            if (!touchStart) {
                allowSlice = false;
            } else {
                const distFromStart = Math.hypot(mouse.x - touchStart.x, mouse.y - touchStart.y);
                if (distFromStart < SWIPE_THRESHOLD) {
                    allowSlice = false;
                }
            }
        }

        if (allowSlice) {
            const dx = mouse.x - prevMouse.x;
            const dy = mouse.y - prevMouse.y;
            const moveDist = Math.hypot(dx, dy);
            if (moveDist > 2 && now - lastSliceTime >= SLICE_INTERVAL) {
                for (let i = heads.length - 1; i >= 0; i--) {
                    if (heads[i].isHit(cx, cy)) {
                        const sliceAngle = Math.atan2(dy, dx);
                        triggerSlice(heads[i], sliceAngle);
                        playSliceSound();
                        scareTimer = SCARE_DURATION;
                        lastSliceTime = now;
                        hadSliceSinceDown = true;
                        break;
                    }
                }
                checkWinCondition();
            }
        }
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

function triggerExplosion(head) {
    const centerX = head.x + head.size / 2;
    const centerY = head.y + head.size / 2;
    clickEffects.push(new ClickEffect(centerX, centerY));

    const removed = [];
    for (let i = heads.length - 1; i >= 0; i--) {
        const target = heads[i];
        const tx = target.x + target.size / 2;
        const ty = target.y + target.size / 2;
        const dist = Math.hypot(tx - centerX, ty - centerY);
        if (dist <= EXPLOSION_RADIUS) {
            removed.push(target);
            heads.splice(i, 1);
        }
    }

    if (!removed.includes(head)) {
        const index = heads.indexOf(head);
        if (index !== -1) {
            heads.splice(index, 1);
        }
        removed.push(head);
    }

    removed.forEach(explode);
}

function triggerSlice(head, sliceAngle) {
    const centerX = head.x + head.size / 2;
    const centerY = head.y + head.size / 2;
    const faceAngle = Math.atan2(mouse.y - centerY, mouse.x - centerX);

    const index = heads.indexOf(head);
    if (index !== -1) {
        heads.splice(index, 1);
    }

    slices.push(new SlicePiece(centerX, centerY, head.size, faceAngle, sliceAngle, 1));
    slices.push(new SlicePiece(centerX, centerY, head.size, faceAngle, sliceAngle, -1));
}

window.addEventListener('resize', resize);
window.addEventListener('scroll', updateButtonPositions); // Scroll might shift relative positions
window.addEventListener('mousemove', e => handleInput(e, false));
window.addEventListener('mousedown', e => {
    pointerDown = true;
    hadSliceSinceDown = false;
    handleInput(e, true);
});
window.addEventListener('mouseup', () => {
    pointerDown = false;
});
window.addEventListener('mouseleave', () => {
    pointerDown = false;
});
window.addEventListener('touchstart', e => {
    pointerDown = true;
    hadSliceSinceDown = false;
    touchStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: performance.now()
    };
    handleInput(e, false);
}, { passive: false });
window.addEventListener('touchmove', e => {
    // Prevent scrolling or zooming while playing
    if (!isUnlocked) e.preventDefault();
    handleInput(e, false);
}, { passive: false });
// Switch to touchend for clicking
window.addEventListener('touchend', e => {
    pointerDown = false;
    touchStart = null;
    handleInput(e, true);
}, { passive: false });
window.addEventListener('touchcancel', () => {
    pointerDown = false;
    touchStart = null;
}, { passive: true });

init();
