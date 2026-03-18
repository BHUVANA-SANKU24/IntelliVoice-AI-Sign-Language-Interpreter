/**
 * SignBridge – Parallax Motion System
 * Adds:
 *  1. Mouse-tracking parallax depth to background orbs
 *  2. Subtle 3-D tilt on glass panels
 *  3. Floating micro-particle layer for depth
 */
(function () {
    'use strict';

    /* ── Config ─────────────────────────────────────── */
    const ORB_STRENGTH = [60, -45, 35];   // px shift per orb (+ / -)
    const PANEL_TILT = 4;              // max degrees for 3-D tilt
    const PARTICLE_COUNT = 28;
    const LERP_SPEED = 0.07;           // smoothing (0 = freeze, 1 = instant)

    /* ── State ──────────────────────────────────────── */
    let mouse = { x: 0.5, y: 0.5 };       // normalised 0-1
    let target = { x: 0.5, y: 0.5 };
    let raf;

    /* ── Elements ───────────────────────────────────── */
    const orbs = Array.from(document.querySelectorAll('.orb'));
    const panels = Array.from(document.querySelectorAll('.panel'));

    /* ── Helpers ────────────────────────────────────── */
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* ── Mouse tracking ─────────────────────────────── */
    document.addEventListener('mousemove', (e) => {
        target.x = e.clientX / window.innerWidth;
        target.y = e.clientY / window.innerHeight;
    });

    /* ── Orb parallax (CSS custom-property driven) ──── */
    function updateOrbs() {
        const cx = (mouse.x - 0.5);   // -0.5 → 0.5
        const cy = (mouse.y - 0.5);

        orbs.forEach((orb, i) => {
            const s = ORB_STRENGTH[i] || 30;
            const tx = cx * s;
            const ty = cy * s;
            orb.style.transform = `translate(${tx}px, ${ty}px)`;
        });
    }

    /* ── Panel 3-D tilt ─────────────────────────────── */
    function updatePanels() {
        panels.forEach((panel) => {
            const rect = panel.getBoundingClientRect();
            const cx = (rect.left + rect.width / 2) / window.innerWidth;
            const cy = (rect.top + rect.height / 2) / window.innerHeight;
            const rotY = (mouse.x - cx) * PANEL_TILT;
            const rotX = (cy - mouse.y) * PANEL_TILT;
            panel.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(0)`;
        });
    }

    /* ── Reset panel tilt on mouse-leave ────────────── */
    panels.forEach((panel) => {
        panel.addEventListener('mouseleave', () => {
            panel.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0)';
        });
    });

    /* ── Main animation loop ────────────────────────── */
    function tick() {
        mouse.x = lerp(mouse.x, target.x, LERP_SPEED);
        mouse.y = lerp(mouse.y, target.y, LERP_SPEED);
        updateOrbs();
        updatePanels();
        raf = requestAnimationFrame(tick);
    }

    /* ── Floating particles ─────────────────────────── */
    function createParticles() {
        const container = document.createElement('div');
        container.className = 'parallax-particles';
        document.body.appendChild(container);

        const colors = ['#38bdf8', '#a78bfa', '#f472b6', '#4ade80', '#fb923c'];

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = document.createElement('div');
            p.className = 'p-particle';

            const size = 2 + Math.random() * 4;
            const dur = 8 + Math.random() * 16;
            const delay = Math.random() * -20;
            const x = Math.random() * 100;
            const color = colors[Math.floor(Math.random() * colors.length)];

            p.style.cssText = `
        width:${size}px;
        height:${size}px;
        left:${x}%;
        animation-duration:${dur}s;
        animation-delay:${delay}s;
        background:${color};
        box-shadow:0 0 ${size * 3}px ${color};
      `;
            container.appendChild(p);
        }
    }

    /* ── Scroll parallax on header & ref panel ──────── */
    function applyScrollParallax() {
        const header = document.querySelector('.header');
        const refPanel = document.querySelector('.reference-panel');
        const scrollY = window.scrollY;

        if (header) {
            header.style.transform = `translateY(${scrollY * 0.15}px)`;
        }
        if (refPanel) {
            refPanel.style.transform = `translateY(${-scrollY * 0.05}px)`;
        }
    }

    window.addEventListener('scroll', applyScrollParallax, { passive: true });

    /* ── Boot ───────────────────────────────────────── */
    function init() {
        createParticles();
        tick();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
