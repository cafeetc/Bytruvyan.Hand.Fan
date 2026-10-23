/**
 * Pyxl Hand Rig v2 - Core Mathematics, Geometry, and State
 * Conforms to Spec doc 1CKhcWot0YDq-HHtsem2uLG31knrrd6RFz5iH1_nIQo0 (pyxl.hand.v2, 2026-10-22)
 */

export type FingerName = 'middle' | 'ring' | 'index' | 'pinky' | 'thumb';

export type HandBuild = 'standard' | 'claw' | 'trident' | 'mickey';

export interface State {
  expert: boolean;               // false = limits on, true = limits off
  splay: number;                 // -100..100 (30 default)
  thumb: number;                 // -100..100 (10 default) - added to hand splay for thumb only
  fs: {
    index: number;
    ring: number;
    pinky: number;
  };
  wrist: number;                 // -180..180 deg
  tilt: number;                  // -30..30 deg
  o: number;                     // 0 | 0.5 knuckle overlap off / on
  wscale: boolean;               // scale widths by (SUM-KN)/7 for non-thumb
  boxes: boolean;                // show palm boxes
  cj: {
    thumb: [number, number, number];
    index: [number, number, number];
    middle: [number, number, number];
    ring: [number, number, number];
    pinky: [number, number, number];
  };
  rot: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  build?: HandBuild;             // optional build filter: standard, claw, trident, mickey
}

export const FINGER_ORDER: FingerName[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];
export const CONTROLS_FINGER_ORDER: FingerName[] = ['index', 'ring', 'pinky', 'thumb', 'middle'];

export const BONES: Record<FingerName, number[]> = {
  middle: [4, 2, 1, 1],
  ring:   [3.75, 1.75, 1, 1],
  index:  [3.5, 2, 0.75, 0.75],
  pinky:  [3.25, 1.75, 0.75, 0.75],
  thumb:  [2, 1, 1],
};

export const SUM: Record<FingerName, number> = {
  middle: 8,
  ring:   7.5,
  index:  7,
  pinky:  6.5,
  thumb:  4,
};

export const KN: Record<FingerName, number> = {
  middle: 1,
  ring:   1,
  index:  1,
  pinky:  1,
  thumb:  0.5,
};

export const LIM: Record<FingerName, number> = {
  thumb:  -120,
  index:  -30,
  middle: 0,
  ring:   30,
  pinky:  90,
};

export const R = Math.PI / 180;

export function norm(a: number): number {
  return ((a + 540) % 360) - 180;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function cRange(d: FingerName, expert: boolean): [number, number] {
  if (expert) return [-90, 90];
  return d === 'thumb' ? [-20, 80] : [-20, 90];
}

export function rRange(d: FingerName, expert: boolean): [number, number] {
  if (expert) return [-90, 90];
  return d === 'thumb' ? [-60, 60] : [-45, 45];
}

export function calcA(d: FingerName, state: State): number {
  const extra = d === 'thumb' ? state.thumb : (d === 'middle' ? 0 : (state.fs[d as 'index' | 'ring' | 'pinky'] ?? 0));
  const effectiveSplay = clamp(state.splay + extra, -100, 100);
  return (LIM[d] * effectiveSplay) / 100 + state.tilt + (state.rot[d] ?? 0);
}

export function wid(d: FingerName, wscale: boolean): number {
  return wscale && d !== 'thumb' ? (SUM[d] - KN[d]) / 7 : 1;
}

export function reach(d: FingerName, o: number): number {
  const knOvl = o > 0 ? KN[d] : 0;
  return SUM[d] - knOvl;
}

export function defaultState(): State {
  return {
    expert: false,
    splay: 30,
    thumb: 10,
    fs: {
      index: 0,
      ring: 0,
      pinky: 0,
    },
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
      pinky: [0, 0, 0],
    },
    rot: {
      thumb: 0,
      index: 0,
      middle: 0,
      ring: 0,
      pinky: 0,
    },
    build: 'standard',
  };
}

export function cleanPose(raw: Partial<State>): Partial<State> {
  const res: Partial<State> = {};
  if (raw.splay !== undefined) res.splay = clamp(Number(raw.splay) || 0, -100, 100);
  if (raw.thumb !== undefined) res.thumb = clamp(Number(raw.thumb) || 0, -100, 100);
  if (raw.wrist !== undefined) res.wrist = norm(Number(raw.wrist) || 0);
  if (raw.tilt !== undefined) res.tilt = clamp(Number(raw.tilt) || 0, -30, 30);
  if (raw.o !== undefined) res.o = Number(raw.o) > 0 ? 0.5 : 0;
  if (raw.wscale !== undefined) res.wscale = Boolean(raw.wscale);
  if (raw.boxes !== undefined) res.boxes = Boolean(raw.boxes);
  if (raw.expert !== undefined) res.expert = Boolean(raw.expert);
  if (raw.build !== undefined) res.build = raw.build;

  if (raw.fs) {
    res.fs = {
      index: clamp(Number(raw.fs.index) || 0, -100, 100),
      ring: clamp(Number(raw.fs.ring) || 0, -100, 100),
      pinky: clamp(Number(raw.fs.pinky) || 0, -100, 100),
    };
  }

  if (raw.rot) {
    res.rot = {
      thumb: Number(raw.rot.thumb) || 0,
      index: Number(raw.rot.index) || 0,
      middle: Number(raw.rot.middle) || 0,
      ring: Number(raw.rot.ring) || 0,
      pinky: Number(raw.rot.pinky) || 0,
    };
  }

  if (raw.cj) {
    res.cj = {
      thumb: [Number(raw.cj.thumb?.[0]) || 0, Number(raw.cj.thumb?.[1]) || 0, Number(raw.cj.thumb?.[2]) || 0],
      index: [Number(raw.cj.index?.[0]) || 0, Number(raw.cj.index?.[1]) || 0, Number(raw.cj.index?.[2]) || 0],
      middle: [Number(raw.cj.middle?.[0]) || 0, Number(raw.cj.middle?.[1]) || 0, Number(raw.cj.middle?.[2]) || 0],
      ring: [Number(raw.cj.ring?.[0]) || 0, Number(raw.cj.ring?.[1]) || 0, Number(raw.cj.ring?.[2]) || 0],
      pinky: [Number(raw.cj.pinky?.[0]) || 0, Number(raw.cj.pinky?.[1]) || 0, Number(raw.cj.pinky?.[2]) || 0],
    };
  }

  return res;
}

export function clampStateToLimits(st: State): State {
  const expert = st.expert;
  const splay = clamp(st.splay, -100, 100);
  const thumb = clamp(st.thumb, -100, 100);
  const wrist = norm(st.wrist);
  const tilt = clamp(st.tilt, -30, 30);

  const fs = {
    index: clamp(st.fs.index, -100, 100),
    ring: clamp(st.fs.ring, -100, 100),
    pinky: clamp(st.fs.pinky, -100, 100),
  };

  const rot = { ...st.rot };
  const cj = {
    thumb: [...st.cj.thumb] as [number, number, number],
    index: [...st.cj.index] as [number, number, number],
    middle: [...st.cj.middle] as [number, number, number],
    ring: [...st.cj.ring] as [number, number, number],
    pinky: [...st.cj.pinky] as [number, number, number],
  };

  for (const d of FINGER_ORDER) {
    const [rLo, rHi] = rRange(d, expert);
    rot[d] = clamp(rot[d], rLo, rHi);

    const [cLo, cHi] = cRange(d, expert);
    cj[d] = [
      clamp(cj[d][0], cLo, cHi),
      clamp(cj[d][1], cLo, cHi),
      clamp(cj[d][2], cLo, cHi),
    ];
  }

  return {
    ...st,
    splay,
    thumb,
    wrist,
    tilt,
    fs,
    rot,
    cj,
  };
}

export interface JointPosition {
  x: number;
  y: number;
  phi: number;
}

/**
 * jointPos(d): Computes SVG-space world coordinates of all joints for finger d
 * Walk bones 0..n-2
 * dist = a + L[i] - J/2
 * accumulate x += dist * sin(phi*R), y -= dist * cos(phi*R)
 * push [x,y,phi]
 * phi -= ja(d,i)
 * Start phi = wrist + A(d)
 * Final push: fingertip position
 */
export function jointPos(d: FingerName, st: State): JointPosition[] {
  const bones = BONES[d];
  const n = bones.length;
  const knOvl = st.o > 0 ? KN[d] : 0;
  let phi = st.wrist + calcA(d, st);
  let x = 0;
  let y = 0;
  const pos: JointPosition[] = [];

  for (let i = 0; i < n - 1; i++) {
    const a = i === 1 ? -knOvl / 2 : 0;
    const J = i === 0 ? knOvl : 0;
    const dist = a + bones[i] - J / 2;
    x += dist * Math.sin(phi * R);
    y -= dist * Math.cos(phi * R);
    pos.push({ x, y, phi });
    phi -= (st.cj[d]?.[i] ?? 0);
  }

  // Fingertip end-effector:
  const lastBone = bones[n - 1];
  const tipX = x + lastBone * Math.sin(phi * R);
  const tipY = y - lastBone * Math.cos(phi * R);
  pos.push({ x: tipX, y: tipY, phi });

  return pos;
}

/**
 * CCD Inverse Kinematics (14 iterations)
 * Drives finger d joints towards target (tx, ty) in SVG coordinates.
 */
export function runIk(d: FingerName, k: number, tx: number, ty: number, st: State): State {
  const nextSt = {
    ...st,
    rot: { ...st.rot },
    cj: {
      ...st.cj,
      [d]: [...st.cj[d]] as [number, number, number],
    },
  };

  const bones = BONES[d];
  const n = bones.length;
  const effIndex = Math.min(k + 1, n - 1);
  const [cLo, cHi] = cRange(d, nextSt.expert);
  const [rLo, rHi] = rRange(d, nextSt.expert);

  for (let iter = 0; iter < 14; iter++) {
    for (let j = k; j >= -1; j--) {
      const positions = jointPos(d, nextSt);
      const eff = positions[effIndex];

      let jx = 0;
      let jy = 0;
      if (j >= 0) {
        jx = positions[j].x;
        jy = positions[j].y;
      }

      const vEx = eff.x - jx;
      const vEy = eff.y - jy;
      const vTx = tx - jx;
      const vTy = ty - jy;

      const cross = vEx * vTy - vEy * vTx;
      const dot = vEx * vTx + vEy * vTy;
      if (Math.abs(dot) < 1e-6 && Math.abs(cross) < 1e-6) continue;

      const dl = Math.atan2(cross, dot) / R;

      if (j === -1) {
        nextSt.rot[d] = clamp(nextSt.rot[d] + dl, rLo, rHi);
      } else if (j >= 0 && j < 3) {
        nextSt.cj[d][j] = clamp(nextSt.cj[d][j] - dl, cLo, cHi);
      }
    }
  }

  // Round values as per spec
  nextSt.rot[d] = Math.round(nextSt.rot[d]);
  nextSt.cj[d][0] = Math.round(nextSt.cj[d][0]);
  nextSt.cj[d][1] = Math.round(nextSt.cj[d][1]);
  nextSt.cj[d][2] = Math.round(nextSt.cj[d][2]);

  return nextSt;
}

/**
 * Filter fingers shown based on active hand build
 */
export function getActiveFingers(build: HandBuild = 'standard'): FingerName[] {
  switch (build) {
    case 'claw':
      return ['index', 'thumb'];
    case 'trident':
      return ['middle', 'ring', 'thumb'];
    case 'mickey':
      return ['index', 'middle', 'ring', 'thumb'];
    case 'standard':
    default:
      return ['index', 'middle', 'ring', 'pinky', 'thumb'];
  }
}

/**
 * Built-in canonical pose presets for artist reference & quick starting points
 */
export const PRESET_POSES: Record<string, Partial<State>> = {
  'Neutral flat (default)': {
    splay: 30,
    thumb: 10,
    wrist: 0,
    tilt: 0,
    fs: { index: 0, ring: 0, pinky: 0 },
    rot: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
    cj: {
      thumb: [0, 0, 0],
      index: [0, 0, 0],
      middle: [0, 0, 0],
      ring: [0, 0, 0],
      pinky: [0, 0, 0],
    },
  },
  'Relaxed Natural': {
    splay: 25,
    thumb: 15,
    wrist: 0,
    tilt: 0,
    fs: { index: -5, ring: 5, pinky: 12 },
    rot: { thumb: -10, index: 2, middle: 0, ring: -3, pinky: -8 },
    cj: {
      thumb: [22, 18, 0],
      index: [25, 20, 15],
      middle: [28, 22, 18],
      ring: [32, 25, 20],
      pinky: [35, 28, 22],
    },
  },
  'Fist': {
    splay: 12,
    thumb: -15,
    wrist: 0,
    tilt: 0,
    fs: { index: 0, ring: 0, pinky: 0 },
    rot: { thumb: -35, index: -5, middle: 0, ring: 4, pinky: 8 },
    cj: {
      thumb: [45, 60, 0],
      index: [85, 88, 85],
      middle: [88, 90, 88],
      ring: [88, 90, 88],
      pinky: [85, 88, 85],
    },
  },
  'Pointing': {
    splay: 18,
    thumb: -10,
    wrist: 0,
    tilt: -5,
    fs: { index: 0, ring: 0, pinky: 0 },
    rot: { thumb: -25, index: 0, middle: 4, ring: 6, pinky: 10 },
    cj: {
      thumb: [40, 45, 0],
      index: [0, 0, 0],
      middle: [85, 88, 85],
      ring: [85, 88, 85],
      pinky: [85, 88, 85],
    },
  },
  'Peace / Victory': {
    splay: 35,
    thumb: -15,
    wrist: 0,
    tilt: 0,
    fs: { index: -15, ring: 0, pinky: 0 },
    rot: { thumb: -30, index: -12, middle: 10, ring: 0, pinky: 5 },
    cj: {
      thumb: [45, 55, 0],
      index: [0, 0, 0],
      middle: [0, 0, 0],
      ring: [85, 88, 85],
      pinky: [85, 88, 85],
    },
  },
  'Thumbs Up': {
    splay: 15,
    thumb: 35,
    wrist: -90,
    tilt: 0,
    fs: { index: 0, ring: 0, pinky: 0 },
    rot: { thumb: 20, index: 0, middle: 0, ring: 0, pinky: 0 },
    cj: {
      thumb: [0, 0, 0],
      index: [85, 88, 85],
      middle: [88, 90, 88],
      ring: [88, 90, 88],
      pinky: [85, 88, 85],
    },
  },
  'OK Sign': {
    splay: 32,
    thumb: 0,
    wrist: 0,
    tilt: 0,
    fs: { index: -10, ring: 8, pinky: 18 },
    rot: { thumb: -15, index: -10, middle: 5, ring: 12, pinky: 18 },
    cj: {
      thumb: [50, 40, 0],
      index: [55, 50, 30],
      middle: [0, 0, 0],
      ring: [5, 5, 0],
      pinky: [10, 10, 5],
    },
  },
  'Rock / Horns': {
    splay: 35,
    thumb: -10,
    wrist: 0,
    tilt: 0,
    fs: { index: -15, ring: 0, pinky: 20 },
    rot: { thumb: -25, index: -10, middle: 0, ring: 0, pinky: 15 },
    cj: {
      thumb: [45, 50, 0],
      index: [0, 0, 0],
      middle: [88, 90, 88],
      ring: [88, 90, 88],
      pinky: [0, 0, 0],
    },
  },
  'Open Splay (Fan)': {
    splay: 75,
    thumb: 40,
    wrist: 0,
    tilt: 0,
    fs: { index: 20, ring: 20, pinky: 30 },
    rot: { thumb: 15, index: -10, middle: 0, ring: 10, pinky: 20 },
    cj: {
      thumb: [-10, -5, 0],
      index: [-10, -5, 0],
      middle: [-10, -5, 0],
      ring: [-10, -5, 0],
      pinky: [-10, -5, 0],
    },
  },
};
