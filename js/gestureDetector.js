/**
 * gestureDetector.js  v2
 * MediaPipe Hands integration with:
 *  - Color-coded landmark skeleton (fingertip = red, joint = cyan, palm = purple)
 *  - Pulsing glow ring when hand detected
 *  - Smooth gradient skeleton lines
 *  - Camera active glow on panel
 */

// MediaPipe HAND_CONNECTIONS full set
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],          // Index
    [0, 9], [9, 10], [10, 11], [11, 12],     // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],   // Ring
    [0, 17], [17, 18], [18, 19], [19, 20],   // Pinky
    [5, 9], [9, 13], [13, 17], [5, 17],      // Palm knuckles
];

const FINGERTIPS = [4, 8, 12, 16, 20];
const PALM_NODES = [0, 5, 9, 13, 17];

class GestureDetector {
    constructor() {
        this.videoEl = document.getElementById('videoInput');
        this.canvasEl = document.getElementById('landmarkCanvas');
        this.ctx = this.canvasEl.getContext('2d');
        this.hands = null;
        this.camera = null;
        this.stream = null;
        this.isRunning = false;
        this.onLandmarks = null;
        this.lastFrameTime = 0;
        this.fps = 0;
        this._glowPhase = 0;
        this._rafId = null;
        this._handDetected = false;
    }

    async init() {
        if (!window.Hands) throw new Error('MediaPipe Hands not loaded.');
        this.hands = new Hands({
            locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        });
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
        });
        this.hands.onResults((r) => this._onResults(r));
    }

    async start() {
        if (this.isRunning) return;
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
        });
        this.videoEl.srcObject = this.stream;
        this.videoEl.style.display = 'block';

        await new Promise(resolve => {
            this.videoEl.onloadedmetadata = () => { this.videoEl.play(); resolve(); };
        });

        this.canvasEl.width = this.videoEl.videoWidth || 640;
        this.canvasEl.height = this.videoEl.videoHeight || 480;
        this.isRunning = true;

        document.getElementById('cameraPlaceholder').style.display = 'none';
        document.getElementById('detectionOverlay').style.display = 'block';
        // Camera panel glow
        document.getElementById('panelSignToText')?.classList.add('camera-active');

        if (window.Camera) {
            this.camera = new Camera(this.videoEl, {
                onFrame: async () => {
                    if (this.isRunning && this.hands) await this.hands.send({ image: this.videoEl });
                },
                width: 640, height: 480,
            });
            this.camera.start();
        } else {
            this._rafLoop();
        }
    }

    _rafLoop() {
        if (!this.isRunning) return;
        const now = performance.now();
        if (now - this.lastFrameTime > 33) {
            this.fps = Math.round(1000 / (now - this.lastFrameTime));
            this.lastFrameTime = now;
            if (this.hands) this.hands.send({ image: this.videoEl }).catch(() => { });
        }
        this._rafId = requestAnimationFrame(() => this._rafLoop());
    }

    _onResults(results) {
        const w = this.canvasEl.width, h = this.canvasEl.height;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, w, h);

        this._glowPhase += 0.05;

        if (results.multiHandLandmarks?.length > 0) {
            const lm = results.multiHandLandmarks[0];
            this._handDetected = true;
            this._drawHandSkeleton(ctx, lm, w, h);
            if (this.onLandmarks) this.onLandmarks(lm, w, h);
        } else {
            this._handDetected = false;
            if (this.onLandmarks) this.onLandmarks(null, w, h);
        }

        const fpsEl = document.getElementById('statusFPS');
        if (fpsEl) fpsEl.textContent = `⚡ FPS: ${this.fps || '–'}`;
    }

    _drawHandSkeleton(ctx, lm, w, h) {
        const x = i => lm[i].x * w;
        const y = i => lm[i].y * h;

        // --- Glow aura on palm centre ---
        const palmX = x(9), palmY = y(9);
        const glowR = 32 + Math.sin(this._glowPhase) * 6;
        const glow = ctx.createRadialGradient(palmX, palmY, 0, palmX, palmY, glowR);
        glow.addColorStop(0, 'rgba(56,189,248,0.22)');
        glow.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.beginPath();
        ctx.arc(palmX, palmY, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // --- Skeleton connections ---
        ctx.lineWidth = 2.5;
        HAND_CONNECTIONS.forEach(([a, b]) => {
            const grad = ctx.createLinearGradient(x(a), y(a), x(b), y(b));
            // Palm connections = purple, finger connections = cyan
            const isPalm = (PALM_NODES.includes(a) && PALM_NODES.includes(b));
            grad.addColorStop(0, isPalm ? 'rgba(167,139,250,0.9)' : 'rgba(56,189,248,0.85)');
            grad.addColorStop(1, isPalm ? 'rgba(99,102,241,0.9)' : 'rgba(167,139,250,0.85)');
            ctx.beginPath();
            ctx.strokeStyle = grad;
            ctx.lineJoin = 'round';
            ctx.moveTo(x(a), y(a));
            ctx.lineTo(x(b), y(b));
            ctx.stroke();
        });

        // --- Landmark dots ---
        lm.forEach((pt, i) => {
            const px = pt.x * w, py = pt.y * h;
            const isTip = FINGERTIPS.includes(i);
            const isPalm = PALM_NODES.includes(i);
            const r = isTip ? 7 : isPalm ? 6 : 4;

            // Outer glow
            ctx.beginPath();
            ctx.arc(px, py, r + 3, 0, Math.PI * 2);
            ctx.fillStyle = isTip
                ? 'rgba(248,113,113,0.2)'
                : 'rgba(56,189,248,0.15)';
            ctx.fill();

            // Core dot
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = isTip ? '#f87171'  // fingertip = red
                : isPalm ? '#c084fc'  // palm = purple
                    : '#38bdf8';            // joint = cyan
            ctx.fill();

            // White rim
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        });

        // --- Fingertip labels (optional large view) ---
        const tipNames = { 4: 'T', 8: 'I', 12: 'M', 16: 'R', 20: 'P' };
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        FINGERTIPS.forEach(i => {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(tipNames[i], x(i), y(i) - 14);
        });
    }

    stop() {
        this.isRunning = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this.camera) { this.camera.stop(); this.camera = null; }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        this.videoEl.srcObject = null;
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        document.getElementById('cameraPlaceholder').style.display = 'flex';
        document.getElementById('detectionOverlay').style.display = 'none';
        document.getElementById('panelSignToText')?.classList.remove('camera-active');
    }
}

window.GestureDetector = GestureDetector;
