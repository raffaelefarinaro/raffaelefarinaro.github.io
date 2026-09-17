// Nuke button: clears all faces with a mushroom-cloud animation, then the
// normal win/unlock flow takes over. Lives inside the bottom #ui banner,
// styled red with a pulsing glow so it reads as "the big red button".

(function () {
    let nuking = false;

    function gameWon() {
        const banner = document.getElementById('win-banner');
        return banner && !banner.classList.contains('hidden');
    }

    // --- Mushroom cloud animation on a dedicated overlay canvas ---
    // Timeline (~1.7s):
    //   0.00s  white flash + expanding shockwave ring from bottom center
    //   0.15s  stem: pixel-block column shoots up
    //   0.55s  cap: cloud head blossoms (hot orange core -> dark pixel blobs), rises
    //   0.90s  faces pop in staggered waves (game's own triggerExplosion: real
    //          explosion particles + sounds mix with the cloud)
    //   1.70s  cloud fades, overlay removed, done
    function runMushroomAnimation(onFacesPopped, onDone) {
        const overlay = document.createElement('canvas');
        overlay.id = 'nuke-overlay';
        overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9;pointer-events:none;';
        overlay.width = window.innerWidth;
        overlay.height = window.innerHeight;
        document.body.appendChild(overlay);
        const c = overlay.getContext('2d');
        const W = overlay.width, H = overlay.height;
        const cx = W / 2;
        const groundY = H - 100;
        const capY = groundY - H * 0.28;
        const DURATION = 1700;

        const t0 = performance.now();
        let facesPopped = false;
        let doneCalled = false;

        // deterministic pseudo-random so the cloud looks the same every run
        let seed = 42;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const blobs = [];
        for (let i = 0; i < 26; i++) {
            blobs.push({
                a: rand() * Math.PI * 2,
                r: 0.25 + rand() * 0.75,
                size: 14 + rand() * 26,
                wobble: rand() * Math.PI * 2
            });
        }

        function drawRing(p) {
            const ringR = p * Math.max(W, H) * 0.75;
            c.beginPath();
            c.arc(cx, groundY, ringR, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(255,255,255,' + ((1 - p) * 0.9).toFixed(3) + ')';
            c.lineWidth = 6 * (1 - p) + 2;
            c.stroke();
            c.beginPath();
            c.arc(cx, groundY, ringR * 0.8, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(255,200,80,' + ((1 - p) * 0.6).toFixed(3) + ')';
            c.lineWidth = 3;
            c.stroke();
        }

        function drawStem(p) {
            const stemW = 44 * (0.6 + 0.4 * p);
            const stemTop = groundY - (groundY - capY) * p;
            const seg = 12;
            c.fillStyle = 'rgba(60,50,45,0.85)';
            for (let y = groundY; y > stemTop; y -= seg) {
                const jitter = Math.sin(y * 0.09 + p * 9) * 6;
                c.fillRect(cx - stemW / 2 + jitter, y - seg, stemW, seg);
            }
        }

        function drawCap(p, age) {
            const capR = (W * 0.16) * (0.3 + 0.7 * p);
            const y = capY - 18 * (1 - p) + Math.sin(age * 2) * 3;
            for (const b of blobs) {
                const bx = cx + Math.cos(b.a) * capR * b.r;
                const by = y + Math.sin(b.a) * capR * 0.35 * b.r;
                const s = b.size * (0.5 + 0.5 * p) * (1 + Math.sin(age * 3 + b.wobble) * 0.06);
                c.fillStyle = 'rgba(52,48,46,0.92)';
                c.fillRect(bx - s / 2, by - s / 2, s, s);
                c.fillStyle = 'rgba(85,78,72,0.85)';
                c.fillRect(bx - s / 4, by - s / 4, s / 2, s / 2);
            }
            if (p < 0.5) {
                const g = c.createRadialGradient(cx, y, 4, cx, y, capR * 1.4);
                g.addColorStop(0, 'rgba(255,140,40,' + Math.max(0, 0.7 * (1 - p * 2)).toFixed(3) + ')');
                g.addColorStop(1, 'rgba(255,60,0,0)');
                c.fillStyle = g;
                c.fillRect(cx - capR * 1.5, y - capR * 1.5, capR * 3, capR * 3);
            }
        }

        function frame(now) {
            const t = now - t0;
            c.clearRect(0, 0, W, H);

            if (t < 250) {
                const a = 1 - t / 250;
                c.fillStyle = 'rgba(255,255,255,' + (a * 0.85).toFixed(3) + ')';
                c.fillRect(0, 0, W, H);
            }
            if (t >= 100) drawRing(Math.min(1, (t - 100) / 700));
            if (t >= 150) drawStem(Math.min(1, (t - 150) / 400));
            if (t >= 550) drawCap(Math.min(1, (t - 550) / 450), t / 1000);

            if (!facesPopped && t >= 900) {
                facesPopped = true;
                if (onFacesPopped) onFacesPopped();
            }

            if (t < DURATION) {
                requestAnimationFrame(frame);
            } else {
                c.clearRect(0, 0, W, H);
                overlay.remove();
                if (!doneCalled) { doneCalled = true; if (onDone) onDone(); }
            }
        }
        requestAnimationFrame(frame);

        // safety net: always finish
        setTimeout(() => {
            if (!doneCalled) {
                doneCalled = true;
                const el = document.getElementById('nuke-overlay');
                if (el) el.remove();
                if (onDone) onDone();
            }
        }, DURATION + 600);
    }

    function nuke(done) {
        // script.js and this script are both classic scripts, so they share the
        // global lexical environment: `heads`, `triggerExplosion`, `checkWinCondition`
        // declared at top level in script.js are directly reachable here.
        let canUseGameState = false;
        try {
            canUseGameState = typeof heads !== 'undefined' && typeof triggerExplosion === 'function';
        } catch (e) {
            canUseGameState = false;
        }

        const popFaces = () => {
            if (canUseGameState) {
                // Explode in batches so the rAF loop renders them as the cloud rises
                const perBatchSize = (total) => Math.max(5, Math.ceil(total / 6));
                const batch = () => {
                    const n = Math.min(perBatchSize(heads.length), heads.length);
                    for (let k = 0; k < n && heads.length > 0; k++) {
                        triggerExplosion(heads[0]);
                    }
                    if (heads.length > 0) {
                        setTimeout(batch, 70);
                    } else {
                        try { playExplosionSound(); } catch (e) {}
                        finishNuke();
                        if (done) done();
                    }
                };
                batch();
            } else {
                sweepNuke(done);
            }
        };

        runMushroomAnimation(popFaces, done);
    }

    // Nuke finishing: unlock the game WITHOUT the prize banner and WITHOUT hiding
    // the #ui banner. The banner keeps its instructions; the counter shows a nuke
    // note. Proper play keeps the MISSION ACCOMPLISHED banner exclusively.
    function finishNuke() {
        try {
            isUnlocked = true;
            const ui = document.getElementById('ui');
            if (ui) {
                ui.style.display = '';           // undo any hide
                const watch = ui.querySelector('.ui-watch');
                if (watch) watch.textContent = 'RADIATION CLEARED.';
            }
            const canvas = document.getElementById('game-canvas');
            if (canvas) canvas.style.cursor = 'auto';
            document.querySelectorAll('.pixel-btn').forEach(b => b.classList.remove('is-locked'));
        } catch (e) {}
    }

    function sweepNuke(done) {
        // Fallback path: the game's own checkWinCondition will try to show the
        // prize banner and hide the UI; suppress both afterwards.
        const suppressBanner = () => {
            try {
                const banner = document.getElementById('win-banner');
                if (banner) banner.classList.add('hidden');
                const ui = document.getElementById('ui');
                if (ui) ui.style.display = '';
                finishNuke();
            } catch (e) {}
        };
        // Fallback: synthetic window-level mousedown/mouseup pairs. The game's tap
        // handler explodes any head within ~29px of the click (plus neighbours
        // within the blast radius). Two offset passes at a 45px step guarantee
        // coverage; bursts are broken across macrotasks so the rAF loop can draw.
        const w = window.innerWidth;
        const h = window.innerHeight;
        const step = 45;
        const offsets = [0, step / 2];

        sweepPass(step, offsets[0], w, h);
        suppressBanner();
        if (heads.length === 0) { if (done) done(); return; }

        let i = 1;
        (function next() {
            if (i >= offsets.length || heads.length === 0) { suppressBanner(); if (done) done(); return; }
            sweepPass(step, offsets[i++], w, h);
            suppressBanner();
            setTimeout(next, 30);
        })();
        setTimeout(() => { if (done) done(); }, 800);
    }

    function sweepPass(step, off, w, h) {
        for (let y = step / 2 + off; y < h; y += step) {
            for (let x = step / 2 + off; x < w; x += step) {
                window.dispatchEvent(new MouseEvent('mousedown', {
                    clientX: x, clientY: y, bubbles: true
                }));
                window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            }
        }
    }

    function initNuke() {
        // The nuke option lives INSIDE the bottom #ui banner: the instruction
        // text becomes "TAP / SLICE TO ELIMINATE   OR" and the red NUKE button
        // sits next to it. Layout is a flex row inside the banner.
        const ui = document.getElementById('ui');
        if (!ui) return;
        if (document.getElementById('nuke-btn')) return;

        // Restructure the banner content: watch/count line on top, then text + OR + button
        ui.innerHTML = '<div class="ui-watch">THEY ARE WATCHING...</div>' +
                       '<span class="ui-text">TAP / SLICE TO ELIMINATE</span>' +
                       '<span class="ui-or">OR</span>' +
                       '<button id="nuke-btn" aria-label="Clear all faces instantly with a big explosion">NUKE</button>';
        ui.classList.add('with-nuke');

        const btn = document.getElementById('nuke-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (nuking) return;
            nuking = true;
            btn.classList.add('spent');
            nuke(() => {
                btn.classList.remove('spent');
                nuking = false;
            });
        });
        ui.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNuke);
    } else {
        initNuke();
    }
})();