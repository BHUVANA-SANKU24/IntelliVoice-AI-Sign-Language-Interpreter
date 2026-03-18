/**
 * signDictionary.js  – v2  (realistic anatomical hand renderer)
 * Every ASL letter A-Z is drawn with:
 *  - A full palm
 *  - 4 fingers + thumb, each built from 3 segments (proximal/middle/distal phalanx)
 *  - Correct extension / curl / spread angles for each letter
 */

/* ================================================================
   CORE HAND RENDERER
   ================================================================
   Hand coordinate system:
     - Origin (0,0) = wrist centre
     - Y increases downward (normal canvas Y)
     - "up" = negative Y = finger tips direction

   finger config arrays: [thumb, index, middle, ring, pinky]
   Each finger: { curl: 0-1 (0=straight,1=fully curled), spread: angle in rad }
   Thumb is handled separately (different anatomy).
================================================================ */

const SKIN = '#e8c49a';
const SKIN_DARK = '#c9955f';
const SKIN_MID = '#d9ab7a';
const OUTLINE = 'rgba(0,0,0,0.55)';
const NAIL = 'rgba(255,255,255,0.65)';
const JOINT_COL = 'rgba(0,0,0,0.18)';
const SHADOW = 'rgba(0,0,0,0.25)';

// ---- finger geometry ----
// base positions (relative to wrist centre, unscaled) for a hand of size 1
const FINGER_BASES = [
  // [baseX, baseY] from wrist, angle-from-vertical, segment lengths [prox,mid,dist]
  { bx: -0.30, by: -0.10, angle: 0.45, lens: [0.22, 0.18, 0.14] }, // thumb
  { bx: -0.12, by: -0.42, angle: -0.10, lens: [0.26, 0.20, 0.15] }, // index
  { bx: 0.02, by: -0.45, angle: 0.00, lens: [0.29, 0.22, 0.16] }, // middle
  { bx: 0.15, by: -0.42, angle: 0.10, lens: [0.26, 0.20, 0.15] }, // ring
  { bx: 0.27, by: -0.36, angle: 0.20, lens: [0.20, 0.15, 0.12] }, // pinky
];

/**
 * drawHand(ctx, config)
 * config = {
 *   cx, cy, size,          // canvas centre-x, centre-y, scale
 *   fingers: [             // array of 5 objects (thumb … pinky)
 *     { curl: 0-1, spread: radians, tip: 'normal'|'touch_thumb'|'hook' }
 *   ],
 *   thumbUp: bool,         // override: point thumb straight up
 *   palmAngle: 0,          // tilt of entire hand (rad)
 *   tint: null,            // optional overlay color for glow
 * }
 */
function drawHand(ctx, config) {
  const { cx, cy, size: S, fingers, palmAngle = 0 } = config;

  ctx.save();
  ctx.translate(cx, cy);
  if (palmAngle) ctx.rotate(palmAngle);

  // --- Drop shadow ---
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = S * 0.18;
  ctx.shadowOffsetY = S * 0.06;

  _drawPalm(ctx, S);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // --- Draw fingers back-to-front (pinky → thumb) ---
  for (let i = 4; i >= 0; i--) {
    _drawFinger(ctx, S, i, fingers[i] || { curl: 0, spread: 0 });
  }

  ctx.restore();
}

function _drawPalm(ctx, S) {
  ctx.beginPath();
  // Roughly trapezoidal palm
  ctx.moveTo(-S * 0.35, -S * 0.05);   // top-left (index knuckle area)
  ctx.bezierCurveTo(-S * 0.35, -S * 0.42, S * 0.32, -S * 0.42, S * 0.32, -S * 0.05);
  ctx.bezierCurveTo(S * 0.32, S * 0.30, S * 0.20, S * 0.42, S * 0.05, S * 0.44);
  ctx.bezierCurveTo(-S * 0.10, S * 0.46, -S * 0.28, S * 0.38, -S * 0.35, S * 0.20);
  ctx.closePath();

  const palmGrad = ctx.createLinearGradient(0, -S * 0.42, 0, S * 0.44);
  palmGrad.addColorStop(0, SKIN_MID);
  palmGrad.addColorStop(0.55, SKIN);
  palmGrad.addColorStop(1, SKIN_DARK);
  ctx.fillStyle = palmGrad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = S * 0.022;
  ctx.stroke();
}

function _drawFinger(ctx, S, idx, fCfg) {
  const base = FINGER_BASES[idx];
  const { curl, spread = 0 } = fCfg;

  const bx = base.bx * S * 1.0;
  const by = base.by * S * 0.92;
  const baseA = base.angle + spread;   // base angle from vertical
  const lens = base.lens.map(l => l * S);

  // Each knuckle bends by (curl * maxBend) radians
  const maxBend = idx === 0 ? 1.3 : 1.55;  // thumb bends less
  const bend = curl * maxBend;

  // Compute segment chain
  let x = bx, y = by, angle = baseA;
  const segs = [];
  for (let s = 0; s < 3; s++) {
    const len = lens[s];
    const ax = x - Math.sin(angle) * len;
    const ay = y - Math.cos(angle) * len;
    segs.push({ x1: x, y1: y, x2: ax, y2: ay, w: S * (0.10 - s * 0.025 - idx * 0.006) });
    x = ax; y = ay;
    angle += bend * (s === 0 ? 0.45 : 0.55);
  }

  // Draw each phalanx segment
  segs.forEach((seg, si) => {
    const w = Math.max(seg.w, S * 0.04);
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len; // normal
    const ny = dx / len;

    ctx.beginPath();
    ctx.moveTo(seg.x1 + nx * w * 0.9, seg.y1 + ny * w * 0.9);
    ctx.lineTo(seg.x2 + nx * w * 0.75, seg.y2 + ny * w * 0.75);
    ctx.arc(seg.x2, seg.y2, w * 0.75, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(seg.x1 - nx * w * 0.9, seg.y1 - ny * w * 0.9);
    ctx.arc(seg.x1, seg.y1, w * 0.9, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();

    const g = ctx.createLinearGradient(seg.x1 + nx * w, seg.y1, seg.x1 - nx * w, seg.y1);
    g.addColorStop(0, SKIN_MID);
    g.addColorStop(0.5, SKIN);
    g.addColorStop(1, SKIN_DARK);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = S * 0.018;
    ctx.stroke();

    // Joint crease line
    if (si < 2) {
      ctx.beginPath();
      ctx.moveTo(seg.x1 + nx * w * 0.85, seg.y1 + ny * w * 0.85);
      ctx.lineTo(seg.x1 - nx * w * 0.85, seg.y1 - ny * w * 0.85);
      ctx.strokeStyle = JOINT_COL;
      ctx.lineWidth = S * 0.012;
      ctx.stroke();
    }

    // Nail on distal segment
    if (si === 2) {
      const tx = seg.x2 - Math.sin(angle - bend * 0.55) * w * 0.6;
      const ty = seg.y2 - Math.cos(angle - bend * 0.55) * w * 0.6;
      ctx.beginPath();
      ctx.ellipse(tx, ty, w * 0.5, w * 0.65, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = NAIL;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = S * 0.01;
      ctx.stroke();
    }
  });
}

/* ================================================================
   FINGER CONFIG HELPERS
   curl: 0 = fully extended, 1 = fully curled
   spread: radians, positive = spread outward from centre
================================================================ */

function ext() { return { curl: 0.0, spread: 0 }; }
function curl(v = 1) { return { curl: v, spread: 0 }; }
function extSpread(s) { return { curl: 0.0, spread: s }; }
function curlS(v, s) { return { curl: v, spread: s }; }

/* ================================================================
   ASL SIGN DICTIONARY
   fingers array: [thumb, index, middle, ring, pinky]
================================================================ */

const SIGN_DICTIONARY = {
  A: {
    label: 'A',
    description: 'Fist with thumb resting on side',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.4), curl(), curl(), curl(), curl()],
      });
    }
  },
  B: {
    label: 'B',
    description: 'Four fingers up, thumb tucked',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.85), ext(), ext(), ext(), ext()],
      });
    }
  },
  C: {
    label: 'C',
    description: 'Curved C shape',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.35), curl(0.42), curl(0.38), curl(0.40), curl(0.44)],
      });
    }
  },
  D: {
    label: 'D',
    description: 'Index up, others curl to touch thumb',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.35), ext(), curl(0.85), curl(0.85), curl(0.85)],
      });
    }
  },
  E: {
    label: 'E',
    description: 'All fingers bent to palm',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.7), curl(0.75), curl(0.75), curl(0.75), curl(0.75)],
      });
    }
  },
  F: {
    label: 'F',
    description: 'Index & thumb touch, rest extended',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.5), curl(0.55), ext(), ext(), ext()],
      });
    }
  },
  G: {
    label: 'G',
    description: 'Index & thumb point sideways',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        palmAngle: -Math.PI / 4,
        fingers: [curl(0.15), extSpread(-0.15), curl(), curl(), curl()],
      });
    }
  },
  H: {
    label: 'H',
    description: 'Index & middle point sideways',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        palmAngle: -Math.PI / 4,
        fingers: [curl(0.85), extSpread(-0.05), extSpread(0.05), curl(), curl()],
      });
    }
  },
  I: {
    label: 'I',
    description: 'Pinky extended, others curled',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.75), curl(), curl(), curl(), ext()],
      });
    }
  },
  J: {
    label: 'J',
    description: 'Pinky traces a J (shown extended)',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.75), curl(), curl(), curl(), ext()],
      });
      // J curve arc indicator
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(sz * 0.30, -sz * 0.05, sz * 0.22, 0, Math.PI * 0.75, false);
      ctx.strokeStyle = 'rgba(99,179,237,0.75)';
      ctx.lineWidth = sz * 0.04;
      ctx.lineCap = 'round';
      ctx.setLineDash([sz * 0.05, sz * 0.04]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  },
  K: {
    label: 'K',
    description: 'Index & middle up, thumb touches middle',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curlS(0.3, 0.1), extSpread(-0.1), extSpread(0.1), curl(), curl()],
      });
    }
  },
  L: {
    label: 'L',
    description: 'L-shape: index up, thumb out',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [extSpread(-0.3), ext(), curl(), curl(), curl()],
      });
    }
  },
  M: {
    label: 'M',
    description: 'Three fingers draped over thumb',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.6), curl(0.7), curl(0.7), curl(0.7), curl()],
      });
    }
  },
  N: {
    label: 'N',
    description: 'Two fingers draped over thumb',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.6), curl(0.65), curl(0.65), curl(), curl()],
      });
    }
  },
  O: {
    label: 'O',
    description: 'All fingers curve to form O',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.45), curl(0.5), curl(0.48), curl(0.52), curl(0.55)],
      });
    }
  },
  P: {
    label: 'P',
    description: 'Like K but pointing downward',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        palmAngle: Math.PI / 3,
        fingers: [curlS(0.3, 0.1), ext(), extSpread(0.1), curl(), curl()],
      });
    }
  },
  Q: {
    label: 'Q',
    description: 'Index & thumb down, G shape rotated',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        palmAngle: Math.PI / 3,
        fingers: [curl(0.15), extSpread(-0.1), curl(), curl(), curl()],
      });
    }
  },
  R: {
    label: 'R',
    description: 'Index & middle crossed',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.8), extSpread(-0.12), extSpread(0.12), curl(), curl()],
      });
      // Draw cross indicator line
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(-sz * 0.10, -sz * 0.3);
      ctx.lineTo(sz * 0.06, -sz * 0.45);
      ctx.strokeStyle = 'rgba(99,179,237,0.6)';
      ctx.lineWidth = sz * 0.035;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  },
  S: {
    label: 'S',
    description: 'Fist with thumb over fingers',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.55), curl(), curl(), curl(), curl()],
      });
    }
  },
  T: {
    label: 'T',
    description: 'Thumb between index & middle',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.45), curl(0.75), curl(), curl(), curl()],
      });
    }
  },
  U: {
    label: 'U',
    description: 'Index & middle up, together',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.8), ext(), ext(), curl(), curl()],
      });
    }
  },
  V: {
    label: 'V',
    description: 'Index & middle spread in V',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.8), extSpread(-0.2), extSpread(0.2), curl(), curl()],
      });
    }
  },
  W: {
    label: 'W',
    description: 'Index, middle, ring spread in W',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.8), extSpread(-0.2), ext(), extSpread(0.2), curl()],
      });
    }
  },
  X: {
    label: 'X',
    description: 'Index finger hooked',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.6), curl(0.5), curl(), curl(), curl()],
      });
    }
  },
  Y: {
    label: 'Y',
    description: 'Thumb & pinky extended (shaka)',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [extSpread(-0.25), curl(), curl(), curl(), extSpread(0.25)],
      });
    }
  },
  Z: {
    label: 'Z',
    description: 'Index traces Z in air',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curl(0.75), ext(), curl(), curl(), curl()],
      });
      // Z path dashes
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(-sz * 0.25, -sz * 0.70);
      ctx.lineTo(sz * 0.10, -sz * 0.70);
      ctx.lineTo(-sz * 0.25, -sz * 0.45);
      ctx.lineTo(sz * 0.10, -sz * 0.45);
      ctx.strokeStyle = 'rgba(99,179,237,0.7)';
      ctx.lineWidth = sz * 0.038;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([sz * 0.06, sz * 0.04]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  },
  ' ': {
    label: '(space)',
    description: 'Space – open flat hand',
    draw(ctx, cx, cy, sz) {
      drawHand(ctx, {
        cx, cy, size: sz,
        fingers: [curlS(0.1, -0.15), extSpread(-0.05), ext(), extSpread(0.05), extSpread(0.12)],
      });
    }
  },
};

window.SIGN_DICTIONARY = SIGN_DICTIONARY;
window.drawHand = drawHand;
