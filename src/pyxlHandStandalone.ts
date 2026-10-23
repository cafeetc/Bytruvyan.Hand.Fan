/**
 * Generates the pure standalone single-file HTML artifact conforming to Section 12:
 * "One HTML file. All CSS in <style>, all JS in one <script>. No fetches, no imports, no external images.
 * IDs and classes exactly as in §8 / §9. Key *** in localStorage and pose shape exactly as in §7."
 */

export function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pyxl Hand Rig v2</title>
<style>
:root {
  --bg: #120e18;
  --bg-stage: #e2e2e8;
  --panel: #181322;
  --border: #2c223c;
  --border-light: #413259;
  --fg: #f4f0fa;
  --fg-muted: #9e91b5;
  --accent: #a855f7;
  --accent-hover: #c084fc;
  --accent-subtle: rgba(168, 85, 247, 0.16);
  --bone-stroke: #9d4edd;
  --bone-fill: #120e1a;
  --buff-stroke: rgba(157, 78, 221, 0.45);
  --box-stroke: #adff2f;
  --sock-stroke: #adff2f;
  --sock-fill: #120e1a;
  --plug-fill: #adff2f;
  --grid-unit: #c2c2cc;
  --axis-stroke: #9898a6;
  --wrist-stroke: #ef4444;
  --wrist-fill: #ef4444;
}

[data-theme="light"] {
  --bg: #f6f3fa;
  --bg-stage: #ece6f4;
  --panel: #ffffff;
  --border: #d4c9e4;
  --border-light: #e4dcf0;
  --fg: #191224;
  --fg-muted: #6e6182;
  --accent: #8b25e0;
  --accent-hover: #731bc4;
  --accent-subtle: rgba(139, 37, 224, 0.12);
  --bone-stroke: #8b25e0;
  --bone-fill: #1a1424;
  --buff-stroke: rgba(110, 97, 130, 0.45);
  --box-stroke: #65a30d;
  --sock-stroke: #4d7c0f;
  --sock-fill: #1a1424;
  --plug-fill: #65a30d;
  --grid-75: #bfbfbf;
  --gt-stroke: rgba(191, 191, 191, 0.65);
  --gq-stroke: rgba(191, 191, 191, 0.45);
  --axis-stroke: #bfbfbf;
  --wrist-stroke: #dc2626;
  --wrist-fill: #dc2626;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

#stage {
  height: 66.667%;
  background: var(--bg-stage);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

#s {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
#s:active { cursor: grabbing; }

#split {
  height: 16px;
  background: var(--border);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 20;
  transition: background 0.15s;
}
#split:hover { background: var(--accent); }
#split::after {
  content: "";
  width: 40px;
  height: 4px;
  background: var(--fg-muted);
  border-radius: 2px;
  opacity: 0.7;
}

#c {
  flex: 1;
  background: var(--panel);
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  align-content: start;
}

.c-group {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.c-group h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}
.row label {
  flex: 1;
  color: var(--fg);
  white-space: nowrap;
}
.row input[type="range"] {
  flex: 2;
  accent-color: var(--accent);
}
.row input[type="number"] {
  width: 52px;
  padding: 2px 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 4px;
  font-size: 0.75rem;
  text-align: right;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
button, select, input[type="text"] {
  font-family: inherit;
  font-size: 0.75rem;
  background: var(--panel);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
button:hover {
  border-color: var(--accent);
  background: var(--accent-subtle);
}
button.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
button.primary:hover { background: var(--accent-hover); }

textarea {
  width: 100%;
  height: 60px;
  background: var(--panel);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.7rem;
  padding: 6px;
  resize: vertical;
}

details {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  background: var(--panel);
}
details summary {
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--fg-muted);
}
details[open] summary { margin-bottom: 8px; color: var(--accent); }

#rd {
  grid-column: 1 / -1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  font-size: 0.72rem;
  color: var(--fg-muted);
  line-height: 1.5;
}
#rd strong { color: var(--fg); }

/* SVG Canvas Elements */
#hand {
  filter: url(#filmBlur);
}
.bone {
  stroke: var(--bone-stroke);
  stroke-width: 0.05;
  fill: var(--bone-fill);
}
.buff {
  stroke: var(--buff-stroke);
  stroke-width: 0.02;
  stroke-dasharray: 0.08, 0.08;
  fill: none;
}
.box {
  stroke: var(--box-stroke);
  stroke-width: 0.03;
  stroke-dasharray: 0.1, 0.1;
  fill: none;
}
.sock {
  stroke: var(--sock-stroke);
  stroke-width: 0.04;
  fill: var(--sock-fill);
}
.plug {
  fill: var(--plug-fill);
}
.child-joint {
  fill: #8b25e0;
  stroke: #7c3aed;
  stroke-width: 0.008;
}
.parent-joint {
  stroke: #166534;
  stroke-width: 0.004;
}
.wrist-sock {
  stroke: var(--wrist-stroke);
  stroke-width: 0.04;
  fill: var(--bone-fill);
}
.wrist-plug {
  fill: var(--wrist-fill);
}
.g-unit {
  stroke: var(--grid-unit);
  stroke-width: 0.018;
  opacity: 0.7;
}
.gt,
.gq {
  display: none;
}
.axis {
  stroke: var(--axis-stroke);
  stroke-width: 0.035;
  opacity: 0.9;
}
.hit {
  fill: transparent;
  stroke: transparent;
  pointer-events: all;
  cursor: grab;
}
.hit:hover {
  stroke: var(--accent);
  stroke-width: 0.03;
  stroke-dasharray: 0.08, 0.08;
}
[data-theme-btn] {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  background: var(--panel);
  border: 1px solid var(--border);
}
</style>
</head>
<body>

<div id="stage">
  <button id="themeToggle" data-theme-btn>Theme</button>
  <svg id="s" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="filmBlur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.0055" />
      </filter>
      <radialGradient id="parentJointGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stop-color="#ffff33" />
        <stop offset="35%" stop-color="#adff2f" />
        <stop offset="70%" stop-color="#65a30d" />
        <stop offset="100%" stop-color="#15803d" />
      </radialGradient>
    </defs>
    <g id="grid"></g>
    <g id="hand"></g>
  </svg>
</div>

<div id="split" title="Drag to resize / Double-click to reset (66.67%)"></div>

<div id="c">
  <!-- Generated dynamically in script -->
</div>

<div id="rd">
  <!-- Populated with spec notes verbatim -->
</div>

<script>
(function() {
  const STORAGE_KEY = '***';
  const BONES = {
    middle: [4, 2, 1, 1],
    ring:   [3.75, 1.875, 0.9375, 0.9375],
    index:  [3.5, 1.75, 0.875, 0.875],
    pinky:  [3.25, 1.625, 0.8125, 0.8125],
    thumb:  [2, 1, 1, 1]
  };
  const SUM = { middle: 8, ring: 7.5, index: 7, pinky: 6.5, thumb: 5 };
  const KN  = { middle: 1, ring: 1, index: 1, pinky: 1, thumb: 0.5 };
  const LIM = { thumb: -120, index: -30, middle: 0, ring: 30, pinky: 90 };
  const R = Math.PI / 180;
  const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  const CTRL_FINGERS = ['index', 'ring', 'pinky', 'thumb', 'middle'];

  function norm(a) { return ((a + 540) % 360) - 180; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function cRange(d, exp) { return exp ? [-90, 90] : (d === 'thumb' ? [-20, 80] : [-20, 90]); }
  function rRange(d, exp) { return exp ? [-90, 90] : (d === 'thumb' ? [-60, 60] : [-45, 45]); }
  function A(d, st) {
    const extra = d === 'thumb' ? st.thumb : (d === 'middle' ? 0 : (st.fs[d] || 0));
    return (LIM[d] * clamp(st.splay + extra, -100, 100)) / 100 + st.tilt + (st.rot[d] || 0);
  }
  function wid(d, wscale) {
    const baseW = 0.75;
    const scale = d === 'thumb' ? 0.9 : (SUM[d] / SUM.middle);
    const standardW = baseW * scale;
    if (wscale && d !== 'thumb') {
      return standardW * ((SUM[d] - KN[d]) / 7);
    }
    return standardW;
  }
  function reach(d, o) { return SUM[d] - (o > 0 ? KN[d] : 0); }

  function def() {
    return {
      expert: false,
      splay: 30,
      thumb: 10,
      fs: { index: 0, ring: 0, pinky: 0 },
      wrist: 0,
      tilt: 0,
      o: 0.5,
      wscale: false,
      boxes: false,
      cj: {
        thumb: [0, 0, 0],
        index: [0, 0, 0],
        middle: [0, 0, 0],
        ring: [0, 0, 0],
        pinky: [0, 0, 0]
      },
      rot: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }
    };
  }

  let state = def();
  let drag = null;
  let cachedCTM = null;
  let rafPending = false;
  let gridDirty = true;
  let viewFrozen = false;
  let cachedW = 10;
  let curViewBox = { x: -5, y: -9, w: 10, h: 10 };

  const svg = document.getElementById('s');
  const gGrid = document.getElementById('grid');
  const gHand = document.getElementById('hand');
  const stage = document.getElementById('stage');
  const split = document.getElementById('split');
  const cPanel = document.getElementById('c');
  const rd = document.getElementById('rd');

  function num(v) { return Number(v) || 0; }
  function clean(raw) {
    if (!raw) return {};
    const res = {};
    if (raw.splay !== undefined) res.splay = clamp(num(raw.splay), -100, 100);
    if (raw.thumb !== undefined) res.thumb = clamp(num(raw.thumb), -100, 100);
    if (raw.wrist !== undefined) res.wrist = norm(num(raw.wrist));
    if (raw.tilt !== undefined) res.tilt = clamp(num(raw.tilt), -30, 30);
    if (raw.o !== undefined) res.o = num(raw.o) > 0 ? 0.5 : 0;
    if (raw.wscale !== undefined) res.wscale = !!raw.wscale;
    if (raw.boxes !== undefined) res.boxes = !!raw.boxes;
    if (raw.expert !== undefined) res.expert = !!raw.expert;
    if (raw.fs) {
      res.fs = {
        index: clamp(num(raw.fs.index), -100, 100),
        ring: clamp(num(raw.fs.ring), -100, 100),
        pinky: clamp(num(raw.fs.pinky), -100, 100)
      };
    }
    if (raw.rot) {
      res.rot = {};
      FINGERS.forEach(d => { res.rot[d] = num(raw.rot[d]); });
    }
    if (raw.cj) {
      res.cj = {};
      FINGERS.forEach(d => {
        res.cj[d] = [num(raw.cj[d]?.[0]), num(raw.cj[d]?.[1]), num(raw.cj[d]?.[2])];
      });
    }
    return res;
  }

  function getSavedPoses() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('pyxl.hand.v2');
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }
  function setSavedPoses(poses) {
    try {
      const json = JSON.stringify(poses, null, 2);
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem('pyxl.hand.v2', json);
    } catch(e) {}
  }

  function clampers() {
    state.splay = clamp(state.splay, -100, 100);
    state.thumb = clamp(state.thumb, -100, 100);
    state.wrist = norm(state.wrist);
    state.tilt = clamp(state.tilt, -30, 30);
    ['index', 'ring', 'pinky'].forEach(k => {
      state.fs[k] = clamp(state.fs[k], -100, 100);
    });
    FINGERS.forEach(d => {
      const [rLo, rHi] = rRange(d, state.expert);
      state.rot[d] = clamp(state.rot[d], rLo, rHi);
      const [cLo, cHi] = cRange(d, state.expert);
      state.cj[d][0] = clamp(state.cj[d][0], cLo, cHi);
      state.cj[d][1] = clamp(state.cj[d][1], cLo, cHi);
      state.cj[d][2] = clamp(state.cj[d][2], cLo, cHi);
    });
  }

  function jointPos(d) {
    const bones = BONES[d];
    const n = bones.length;
    const knOvl = state.o > 0 ? KN[d] : 0;
    let phi = state.wrist + A(d, state);
    let x = 0, y = 0;
    const pos = [];
    for (let i = 0; i < n - 1; i++) {
      const a = (i === 1 ? -knOvl / 2 : 0);
      const J = (i === 0 ? knOvl : 0);
      const dist = a + bones[i] - J / 2;
      x += dist * Math.sin(phi * R);
      y -= dist * Math.cos(phi * R);
      pos.push({ x, y, phi });
      phi -= (state.cj[d][i] || 0);
    }
    const last = bones[n - 1];
    pos.push({
      x: x + last * Math.sin(phi * R),
      y: y - last * Math.cos(phi * R),
      phi
    });
    return pos;
  }

  function runIK(d, k, tx, ty) {
    const bones = BONES[d];
    const n = bones.length;
    const effIndex = Math.min(k + 1, n - 1);
    const [cLo, cHi] = cRange(d, state.expert);
    const [rLo, rHi] = rRange(d, state.expert);

    for (let iter = 0; iter < 14; iter++) {
      for (let j = k; j >= -1; j--) {
        const positions = jointPos(d);
        const eff = positions[effIndex];
        let jx = 0, jy = 0;
        if (j >= 0) {
          jx = positions[j].x;
          jy = positions[j].y;
        }
        const vEx = eff.x - jx, vEy = eff.y - jy;
        const vTx = tx - jx, vTy = ty - jy;
        const cross = vEx * vTy - vEy * vTx;
        const dot = vEx * vTx + vEy * vTy;
        if (Math.abs(dot) < 1e-6 && Math.abs(cross) < 1e-6) continue;
        const dl = Math.atan2(cross, dot) / R;
        if (j === -1) {
          state.rot[d] = clamp(state.rot[d] + dl, rLo, rHi);
        } else {
          state.cj[d][j] = clamp(state.cj[d][j] - dl, cLo, cHi);
        }
      }
    }
    state.rot[d] = Math.round(state.rot[d]);
    state.cj[d][0] = Math.round(state.cj[d][0]);
    state.cj[d][1] = Math.round(state.cj[d][1]);
    state.cj[d][2] = Math.round(state.cj[d][2]);
  }

  function buildChain(d, i, ang) {
    const bones = BONES[d];
    const n = bones.length;
    const knOvl = state.o > 0 ? KN[d] : 0;
    const w = wid(d, state.wscale);
    const len = bones[i];
    const a = (i === 1 ? -knOvl / 2 : 0);
    const J = (i === 0 ? knOvl : 0);
    const top = -(a + len);
    const bot = -a;
    const sr = (d === 'thumb' ? 0.125 : 0.22) * (SUM[d] / 8);
    const jr = (i === 0 ? KN[d] / 2 : sr);

    const boxScale = (d === 'thumb' ? 1.0 : (SUM[d] / SUM.middle));
    const boxW = 1.0 * boxScale;
    const emptyMargin = 0.125 * boxW;

    let html = '';
    // bone bounding box guide
    if (state.boxes) {
      html += \`<rect class="box" x="\${-boxW/2}" y="\${top}" width="\${boxW}" height="\${len}" stroke-dasharray="0.06, 0.06" />\`;
      if (i === n - 1) {
        html += \`<line class="box" x1="\${-boxW/2 + emptyMargin}" y1="\${top}" x2="\${-boxW/2 + emptyMargin}" y2="\${bot}" stroke-opacity="0.45" stroke-dasharray="0.03, 0.03" />\`;
        html += \`<line class="box" x1="\${boxW/2 - emptyMargin}" y1="\${top}" x2="\${boxW/2 - emptyMargin}" y2="\${bot}" stroke-opacity="0.45" stroke-dasharray="0.03, 0.03" />\`;
      }
    }

    // seam buffer
    if (i > 0) {
      html += \`<rect class="buff" x="\${-w/2}" y="\${-sr}" width="\${w}" height="\${sr*2}" rx="0.03" />\`;
    }

    // bone rect or tip cap
    if (i === n - 1) {
      const rCap = w * 0.45;
      const xL = -w/2, xR = w/2;
      const dPath = \`M \${xL} \${bot} L \${xL} \${top + rCap} A \${rCap} \${rCap} 0 0 1 \${xL + rCap} \${top} L \${xR - rCap} \${top} A \${rCap} \${rCap} 0 0 1 \${xR} \${top + rCap} L \${xR} \${bot} Z\`;
      html += \`<path class="bone" d="\${dPath}" />\`;
    } else {
      html += \`<rect class="bone" x="\${-w/2}" y="\${top}" width="\${w}" height="\${len}" rx="0.04" />\`;
    }

    // shaft hit rect (the bone-drag fix)
    const shaftK = Math.min(i + 1, n - 2);
    html += \`<rect class="hit" x="\${-w/2 - 0.25}" y="\${top - 0.25}" width="\${w + 0.5}" height="\${len + 0.5}" data-d="\${d}" data-j="\${shaftK}" />\`;

    // next segment with joint circles
    if (i + 1 < n) {
      const nextAng = ang[i] || 0;
      const nextGroup = buildChain(d, i + 1, ang);
      html += \`<g transform="translate(0, \${top + J/2}) rotate(\${nextAng})">\`;
      html += nextGroup;
      // Joint circles (child joint 10 subpyxl purple circle, parent joint 6x6 green circle getting yellow toward center)
      html += '<circle class="child-joint" cx="0" cy="0" r="0.05" />';
      html += '<circle class="parent-joint" cx="0" cy="0" r="0.03" fill="url(#parentJointGrad)" />';
      html += \`<circle class="hit" cx="0" cy="0" r="\${Math.max(jr, 0.3)}" data-d="\${d}" data-j="\${i}" />\`;
      html += \`</g>\`;
    }

    return html;
  }

  function renderGrid() {
    if (!gridDirty) return;
    const r = 14;
    let g = '<g class="grid-lines">';
    for (let x = -r; x <= r; x++) {
      g += \`<line class="\${x===0 ? 'axis' : 'g-unit'}" x1="\${x}" y1="\${-r}" x2="\${x}" y2="\${r}" />\`;
    }
    for (let y = -r; y <= r; y++) {
      g += \`<line class="\${y===0 ? 'axis' : 'g-unit'}" x1="\${-r}" y1="\${y}" x2="\${r}" y2="\${y}" />\`;
    }
    g += '</g>';
    gGrid.innerHTML = g;
    gridDirty = false;
  }

  function draw() {
    let handHtml = '';
    if (state.boxes) {
      handHtml += \`<rect class="box" x="-2" y="-4" width="4" height="4" />\`;
      handHtml += \`<line class="box" x1="-1" y1="-4" x2="-1" y2="0" />\`;
      handHtml += \`<line class="box" x1="0" y1="-4" x2="0" y2="0" />\`;
      handHtml += \`<line class="box" x1="1" y1="-4" x2="1" y2="0" />\`;
    }

    FINGERS.forEach(d => {
      const rotBase = A(d, state);
      const ang = state.cj[d].map(c => -c);
      const chainHtml = buildChain(d, 0, ang);
      handHtml += \`<g data-d="\${d}" transform="rotate(\${rotBase})">\${chainHtml}</g>\`;
    });

    // Wrist hub circles & hit (half previous size)
    handHtml += \`<circle class="wrist-sock" cx="0" cy="0" r="0.325" />\`;
    handHtml += \`<circle class="wrist-plug" cx="0" cy="0" r="0.1" />\`;
    handHtml += \`<circle class="hit" cx="0" cy="0" r="0.65" data-w="1" />\`;

    gHand.setAttribute('transform', \`rotate(\${state.wrist})\`);
    gHand.innerHTML = handHtml;

    if (!viewFrozen) {
      try {
        const bb = gHand.getBBox();
        if (bb.width > 0 && bb.height > 0) {
          const rect = stage.getBoundingClientRect();
          const stageW = rect.width || 800;
          const stageH = rect.height || 500;
          const aspect = Math.max(0.2, stageW / stageH);

          const baseH = 10.5;
          const defW = aspect >= 1 ? baseH * aspect : baseH;
          const defH = aspect >= 1 ? baseH : baseH / aspect;
          const defX = -defW / 2;
          const defY = 1.3 - defH;
          const defBottom = 1.3;

          const handBottom = bb.y + bb.height;
          const handTop = bb.y;

          if (handBottom <= defBottom) {
            curViewBox = { x: defX, y: defY, w: defW, h: defH };
            svg.setAttribute('viewBox', \`\${defX} \${defY} \${defW} \${defH}\`);
            gridDirty = true;
            renderGrid();
          } else {
            const targetTop = Math.min(defY, handTop - 0.6);
            const targetBottom = handBottom + 0.6;
            const targetH = Math.max(defH, targetBottom - targetTop);
            const targetW = aspect >= 1 ? targetH * aspect : targetH;
            let targetX = -targetW / 2;
            if (bb.x < -targetW / 2 + 0.5 || bb.x + bb.width > targetW / 2 - 0.5) {
              targetX = (bb.x + bb.width / 2) - targetW / 2;
            }
            curViewBox = { x: targetX, y: targetTop, w: targetW, h: targetH };
            svg.setAttribute('viewBox', \`\${targetX} \${targetTop} \${targetW} \${targetH}\`);
            gridDirty = true;
            renderGrid();
          }
        }
      } catch(e) {}
    }
  }

  function toCanvas(e) {
    if (!cachedCTM) cachedCTM = svg.getScreenCTM().inverse();
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const res = pt.matrixTransform(cachedCTM);
    return [res.x, res.y];
  }

  svg.addEventListener('pointerdown', e => {
    cachedCTM = svg.getScreenCTM().inverse();
    viewFrozen = true;
    const target = e.target;
    if (target.dataset.w) {
      drag = { type: 'wrist' };
    } else if (target.dataset.j !== undefined && target.dataset.d) {
      drag = { type: 'ik', d: target.dataset.d, k: parseInt(target.dataset.j, 10) };
    } else {
      const gD = target.closest('[data-d]');
      if (gD && gD.dataset.d) {
        drag = { type: 'finger', d: gD.dataset.d };
      }
    }
    if (drag) {
      svg.setPointerCapture(e.pointerId);
    }
  });

  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!drag) return;
      const [x, y] = toCanvas(e);
      if (drag.type === 'wrist') {
        state.wrist = Math.round(norm(Math.atan2(x, -y) / R));
      } else if (drag.type === 'finger') {
        const d = drag.d;
        const base = state.wrist + A(d, state) - state.rot[d];
        const [rLo, rHi] = rRange(d, state.expert);
        state.rot[d] = Math.round(clamp(norm(Math.atan2(x, -y) / R - base), rLo, rHi));
      } else if (drag.type === 'ik') {
        runIK(drag.d, drag.k, x, y);
      }
      syncInputs();
      draw();
    });
  });

  function endDrag() {
    drag = null;
    cachedCTM = null;
    viewFrozen = false;
    draw();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // Split bar resize
  let splitDragging = false;
  split.addEventListener('pointerdown', e => {
    splitDragging = true;
    split.setPointerCapture(e.pointerId);
  });
  window.addEventListener('pointermove', e => {
    if (!splitDragging) return;
    const total = window.innerHeight;
    const pct = clamp((e.clientY / total) * 100, 20, 85);
    stage.style.height = pct + '%';
    gridDirty = true;
    draw();
  });
  window.addEventListener('pointerup', () => { splitDragging = false; });
  split.addEventListener('dblclick', () => {
    stage.style.height = '66.667%';
    gridDirty = true;
    draw();
  });

  // UI Setup & Sync
  function makeSlider(parent, label, min, max, val, onInput, id) {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = min; rng.max = max; rng.value = val;
    const numInp = document.createElement('input');
    numInp.type = 'number';
    numInp.min = min; numInp.max = max; numInp.value = val;
    if (id) {
      rng.id = 'r_' + id;
      numInp.id = 'n_' + id;
    }
    rng.addEventListener('input', () => {
      numInp.value = rng.value;
      onInput(Number(rng.value));
    });
    numInp.addEventListener('input', () => {
      rng.value = numInp.value;
      onInput(Number(numInp.value));
    });
    row.appendChild(lbl);
    row.appendChild(rng);
    row.appendChild(numInp);
    parent.appendChild(row);
  }

  function buildControlsUI() {
    cPanel.innerHTML = '';

    // Group 1: Hand Group
    const hGrp = document.createElement('div');
    hGrp.className = 'c-group';
    hGrp.innerHTML = '<h3>Hand & Poses</h3>';

    // Pose select + name + save/delete
    const pRow = document.createElement('div');
    pRow.className = 'row';
    pRow.innerHTML = \`<label>Pose</label><select id="poseSel" style="flex:2"></select>\`;
    hGrp.appendChild(pRow);

    const sRow = document.createElement('div');
    sRow.className = 'row';
    sRow.innerHTML = \`<input type="text" id="poseName" placeholder="Pose name" style="flex:2"><button id="btnSave">Save</button><button id="btnDel">Delete</button>\`;
    hGrp.appendChild(sRow);

    // Export / Import
    const expRow = document.createElement('div');
    expRow.style.display = 'flex';
    expRow.style.flexDirection = 'column';
    expRow.style.gap = '4px';
    expRow.innerHTML = \`<div class="btn-row"><button id="btnExp">Export JSON</button><button id="btnImp">Import JSON</button></div><textarea id="poseJson" placeholder="Paste or view JSON pose here"></textarea>\`;
    hGrp.appendChild(expRow);

    // Expert toggle
    const expRowChk = document.createElement('div');
    expRowChk.className = 'row';
    expRowChk.innerHTML = \`<label><input type="checkbox" id="chkExpert"> Expert Mode (±90°)</label>\`;
    hGrp.appendChild(expRowChk);

    // Hand Sliders
    makeSlider(hGrp, 'Wrist', -180, 180, state.wrist, v => { state.wrist = v; draw(); }, 'wrist');
    makeSlider(hGrp, 'Hand Splay', -100, 100, state.splay, v => { state.splay = v; draw(); }, 'splay');
    makeSlider(hGrp, 'Bird Tilt', -30, 30, state.tilt, v => { state.tilt = v; draw(); }, 'tilt');

    // Toggles
    const togRow = document.createElement('div');
    togRow.style.display = 'flex';
    togRow.style.flexDirection = 'column';
    togRow.style.gap = '6px';
    togRow.innerHTML = \`
      <label><input type="checkbox" id="chkOverlap" \${state.o > 0 ? 'checked' : ''}> Knuckle Overlap</label>
      <label><input type="checkbox" id="chkWscale" \${state.wscale ? 'checked' : ''}> Scale Widths</label>
      <label><input type="checkbox" id="chkBoxes" \${state.boxes ? 'checked' : ''}> Show Palm Boxes</label>
    \`;
    hGrp.appendChild(togRow);

    // Action buttons
    const actRow = document.createElement('div');
    actRow.className = 'btn-row';
    actRow.innerHTML = \`<button id="btnReset">Reset Pose</button><button id="btnMirror">Mirror Left/Right</button>\`;
    hGrp.appendChild(actRow);

    cPanel.appendChild(hGrp);

    // Groups 2..6: Per-finger groups: index, ring, pinky, thumb, middle
    CTRL_FINGERS.forEach(d => {
      const fGrp = document.createElement('div');
      fGrp.className = 'c-group';
      const capD = d.charAt(0).toUpperCase() + d.slice(1);
      fGrp.innerHTML = \`<h3>\${capD} \${d === 'middle' ? '(Master Bird)' : ''}</h3>\`;

      if (d !== 'middle') {
        const minS = -100, maxS = 100;
        const curS = d === 'thumb' ? state.thumb : (state.fs[d] || 0);
        makeSlider(fGrp, 'Splay Add', minS, maxS, curS, v => {
          if (d === 'thumb') state.thumb = v;
          else state.fs[d] = v;
          draw();
        }, \`fs_\${d}\`);
      }

      const [rLo, rHi] = rRange(d, state.expert);
      makeSlider(fGrp, 'Rotation', rLo, rHi, state.rot[d], v => {
        state.rot[d] = v;
        draw();
      }, \`rot_\${d}\`);

      const [cLo, cHi] = cRange(d, state.expert);
      const avgCurl = Math.round((state.cj[d][0] + state.cj[d][1]) / 2);
      makeSlider(fGrp, 'Curl (All)', cLo, cHi, avgCurl, v => {
        state.cj[d][0] = v;
        state.cj[d][1] = v;
        state.cj[d][2] = v;
        syncInputs();
        draw();
      }, \`curl_all_\${d}\`);

      const dt = document.createElement('details');
      dt.innerHTML = '<summary>Joint curls</summary>';
      const dtBody = document.createElement('div');
      dtBody.style.display = 'flex';
      dtBody.style.flexDirection = 'column';
      dtBody.style.gap = '8px';
      dtBody.style.marginTop = '6px';

      makeSlider(dtBody, 'Knuckle', cLo, cHi, state.cj[d][0], v => { state.cj[d][0] = v; draw(); }, \`cj_\${d}_0\`);
      makeSlider(dtBody, 'Middle Joint', cLo, cHi, state.cj[d][1], v => { state.cj[d][1] = v; draw(); }, \`cj_\${d}_1\`);
      makeSlider(dtBody, 'Tip Joint', cLo, cHi, state.cj[d][2], v => { state.cj[d][2] = v; draw(); }, \`cj_\${d}_2\`);
      dt.appendChild(dtBody);
      fGrp.appendChild(dt);

      cPanel.appendChild(fGrp);
    });

    // Wire Hand group events
    document.getElementById('chkExpert').addEventListener('change', e => {
      state.expert = e.target.checked;
      clampers();
      buildControlsUI();
      draw();
    });
    document.getElementById('chkOverlap').addEventListener('change', e => {
      state.o = e.target.checked ? 0.5 : 0;
      draw();
    });
    document.getElementById('chkWscale').addEventListener('change', e => {
      state.wscale = e.target.checked;
      draw();
    });
    document.getElementById('chkBoxes').addEventListener('change', e => {
      state.boxes = e.target.checked;
      draw();
    });
    document.getElementById('btnReset').addEventListener('click', () => {
      const exp = state.expert, o = state.o, ws = state.wscale, bx = state.boxes;
      state = def();
      state.expert = exp; state.o = o; state.wscale = ws; state.boxes = bx;
      syncInputs();
      draw();
    });
    document.getElementById('btnMirror').addEventListener('click', () => {
      state.wrist = -state.wrist;
      state.splay = -state.splay;
      state.thumb = -state.thumb;
      state.tilt = -state.tilt;
      FINGERS.forEach(d => { state.rot[d] = -state.rot[d]; });
      ['index', 'ring', 'pinky'].forEach(k => { state.fs[k] = -state.fs[k]; });
      syncInputs();
      draw();
    });

    // Poses UI
    const poseSel = document.getElementById('poseSel');
    const poseName = document.getElementById('poseName');
    const btnSave = document.getElementById('btnSave');
    const btnDel = document.getElementById('btnDel');
    const btnExp = document.getElementById('btnExp');
    const btnImp = document.getElementById('btnImp');
    const poseJson = document.getElementById('poseJson');

    function refreshPoses() {
      const saved = getSavedPoses();
      poseSel.innerHTML = '<option value="">Neutral flat (default)</option>';
      Object.keys(saved).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        poseSel.appendChild(opt);
      });
    }
    refreshPoses();

    poseSel.addEventListener('change', () => {
      const k = poseSel.value;
      if (!k) {
        const exp = state.expert, o = state.o, ws = state.wscale, bx = state.boxes;
        state = def();
        state.expert = exp; state.o = o; state.wscale = ws; state.boxes = bx;
      } else {
        const saved = getSavedPoses();
        if (saved[k]) {
          const exp = state.expert, o = state.o, ws = state.wscale, bx = state.boxes;
          state = { ...def(), ...clean(saved[k]) };
          state.expert = exp; state.o = o; state.wscale = ws; state.boxes = bx;
        }
      }
      clampers();
      syncInputs();
      draw();
    });

    btnSave.addEventListener('click', () => {
      const name = poseName.value.trim();
      if (!name) return alert('Enter a pose name');
      const saved = getSavedPoses();
      saved[name] = clean(state);
      setSavedPoses(saved);
      refreshPoses();
      poseSel.value = name;
      poseName.value = '';
    });

    btnDel.addEventListener('click', () => {
      const k = poseSel.value;
      if (!k) return;
      const saved = getSavedPoses();
      delete saved[k];
      setSavedPoses(saved);
      refreshPoses();
      poseSel.value = '';
      poseSel.dispatchEvent(new Event('change'));
    });

    btnExp.addEventListener('click', () => {
      poseJson.value = JSON.stringify(clean(state), null, 2);
    });

    btnImp.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(poseJson.value);
        const cleaned = clean(parsed);
        const exp = state.expert, o = state.o, ws = state.wscale, bx = state.boxes;
        state = { ...def(), ...cleaned };
        state.expert = exp; state.o = o; state.wscale = ws; state.boxes = bx;
        clampers();
        syncInputs();
        draw();
      } catch(e) {
        alert('Invalid JSON');
      }
    });

    renderRdNotes();
  }

  function syncInputs() {
    const setVal = (id, v) => {
      const r = document.getElementById('r_' + id);
      const n = document.getElementById('n_' + id);
      if (r) r.value = v;
      if (n) n.value = v;
    };
    setVal('wrist', state.wrist);
    setVal('splay', state.splay);
    setVal('tilt', state.tilt);
    setVal('fs_thumb', state.thumb);
    setVal('fs_index', state.fs.index);
    setVal('fs_ring', state.fs.ring);
    setVal('fs_pinky', state.fs.pinky);
    FINGERS.forEach(d => {
      setVal(\`rot_\${d}\`, state.rot[d]);
      setVal(\`cj_\${d}_0\`, state.cj[d][0]);
      setVal(\`cj_\${d}_1\`, state.cj[d][1]);
      setVal(\`cj_\${d}_2\`, state.cj[d][2]);
    });
  }

  function renderRdNotes() {
    rd.innerHTML = \`
      <strong>Pyxl Hand Rig v2 — Master Proportionality & Reach</strong><br>
      • <strong>Reachable lengths:</strong> Middle (8 raw, 7 functional) | Ring (7.5 raw, 6.5 functional) | Index (7 raw, 6.0 functional) | Pinky (6.5 raw, 5.5 functional) | Thumb (5 raw, 4.5 functional)<br>
      • <strong>Proportions:</strong> Middle finger sets master proportions (4:2:1:1). Metacarpal 4:1 box, Proximal 2:1 box, Middle 1:1 box, Distal 1:1 invisible square with 12.5% empty space on each side (width = 0.75 pyxl / 75 subpyxls). Other fingers scaled from Middle. Shapes fit inside boxes in all cases.
    \`;
  }

  // Theme Toggle
  const themeBtn = document.getElementById('themeToggle');
  themeBtn.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    document.body.setAttribute('data-theme', isLight ? 'dark' : 'light');
    themeBtn.textContent = isLight ? 'Dark' : 'Light';
  });

  // Init
  buildControlsUI();
  draw();
  new ResizeObserver(() => {
    gridDirty = true;
    draw();
  }).observe(stage);

})();
</script>
</body>
</html>
`;
}
