/**
 * Pyxl Hand Rig v2 - Animation, Encoding & Export Engine
 * Implements client-side GIF, APNG, ZIP, PNG, and SVG generation with zero external dependencies.
 */

import { State, defaultState, cleanPose, norm, clamp, HandBuild, BONES, FINGER_ORDER, calcA, wid, KN, SUM, getBoneBox } from './pyxlHandCore.ts';

// CRC-32 Lookup Table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type);
  const body = concatBytes([name, data]);
  const out = new Uint8Array(body.length + 8);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  out.set(body, 4);
  dv.setUint32(body.length + 4, crc32(body), false);
  return out;
}

export async function compressPngPixels(rgba: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser does not support CompressionStream for APNG; use a current browser release.');
  }
  const rowBytes = w * 4;
  const raw = new Uint8Array((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) {
    raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  // Deflate stream
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function pngHeader(w: number, h: number): Uint8Array[] {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false);
  dv.setUint32(4, h, false);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  return [sig, pngChunk('IHDR', ihdr)];
}

export function encodeApng(compressedFrames: Uint8Array[], w: number, h: number, fps: number): Blob {
  const parts = pngHeader(w, h);
  const actl = new Uint8Array(8);
  const ad = new DataView(actl.buffer);
  ad.setUint32(0, compressedFrames.length, false);
  ad.setUint32(4, 0, false); // 0 = loop forever
  parts.push(pngChunk('acTL', actl));

  let seq = 0;
  for (let i = 0; i < compressedFrames.length; i++) {
    const fctl = new Uint8Array(26);
    const dv = new DataView(fctl.buffer);
    dv.setUint32(0, seq++, false);
    dv.setUint32(4, w, false);
    dv.setUint32(8, h, false);
    dv.setUint32(12, 0, false);
    dv.setUint32(16, 0, false);
    dv.setUint16(20, 1, false); // delay_num
    dv.setUint16(22, fps, false); // delay_den
    fctl[24] = 0; // dispose_op
    fctl[25] = 0; // blend_op
    parts.push(pngChunk('fcTL', fctl));

    if (i === 0) {
      parts.push(pngChunk('IDAT', compressedFrames[i]));
    } else {
      const data = new Uint8Array(compressedFrames[i].length + 4);
      new DataView(data.buffer).setUint32(0, seq++, false);
      data.set(compressedFrames[i], 4);
      parts.push(pngChunk('fdAT', data));
    }
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  return new Blob(parts as unknown as BlobPart[], { type: 'image/apng' });
}

// GIF Encoding Logic
export function gifPalette(): Uint8Array {
  const table = new Uint8Array(768);
  // Color 0: background transparent / default
  table[0] = 226; table[1] = 226; table[2] = 232; // light gray backdrop default
  for (let i = 1; i < 256; i++) {
    const q = i - 1;
    table[i * 3] = Math.round(((q >> 5) & 7) * 255 / 7);
    table[i * 3 + 1] = Math.round(((q >> 2) & 7) * 255 / 7);
    table[i * 3 + 2] = Math.round((q & 3) * 255 / 3);
  }
  return table;
}

export function gifIndices(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let s = 0, d = 0; s < rgba.length; s += 4, d++) {
    if (rgba[s + 3] < 128) {
      out[d] = 0; // Transparent
    } else {
      const q = (rgba[s] >> 5) * 32 + (rgba[s + 1] >> 5) * 4 + (rgba[s + 2] >> 6);
      out[d] = q === 255 ? 255 : q + 1;
    }
  }
  return out;
}

export function gifLzw(data: Uint8Array): Uint8Array {
  const clear = 256;
  const end = 257;
  const dict = new Map<number, number>();
  const out: number[] = [];
  let next = 258;
  let bits = 9;
  let acc = 0;
  let bitCount = 0;

  const write = (code: number, size: number) => {
    acc |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bitCount -= 8;
    }
  };

  write(clear, bits);
  if (data.length) {
    let prefix = data[0];
    for (let i = 1; i < data.length; i++) {
      const value = data[i];
      const key = (prefix << 8) | value;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
      } else {
        write(prefix, bits);
        if (next < 4096) {
          dict.set(key, next++);
          if (next === (1 << bits) && bits < 12) bits++;
        } else {
          write(clear, bits);
          dict.clear();
          next = 258;
          bits = 9;
        }
        prefix = value;
      }
    }
    write(prefix, bits);
  }
  write(end, bits);
  if (bitCount) out.push(acc & 255);
  return Uint8Array.from(out);
}

function le16(v: number): [number, number] {
  return [v & 255, (v >> 8) & 255];
}

export function gifFrame(indices: Uint8Array, w: number, h: number, fps: number): Uint8Array {
  const delay = Math.max(2, Math.round(100 / fps));
  const compressed = gifLzw(indices);
  const bytes = [
    0x21, 0xf9, 4, 1, ...le16(delay), 0, 0, // Graphics control extension (transparent index 0)
    0x2c, ...le16(0), ...le16(0), ...le16(w), ...le16(h), 0, 8 // Image descriptor
  ];
  for (let i = 0; i < compressed.length; i += 255) {
    const block = compressed.subarray(i, i + 255);
    bytes.push(block.length);
    for (const v of block) bytes.push(v);
  }
  bytes.push(0); // Block terminator
  return Uint8Array.from(bytes);
}

export function gifHeader(w: number, h: number): Uint8Array[] {
  const header = Uint8Array.from([71, 73, 70, 56, 57, 97, ...le16(w), ...le16(h), 0xf7, 0, 0]); // GIF89a with 256 color palette
  const loop = Uint8Array.from([0x21, 0xff, 0x0b, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]); // Netscape 2.0 loop extension
  return [header, gifPalette(), loop];
}

// PKZIP in-memory store
export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
}

export function zipStore(files: ZipFileEntry[]): Blob {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    // Local file header
    const lh = new Uint8Array(30);
    const ld = new DataView(lh.buffer);
    ld.setUint32(0, 0x04034b50, true);
    ld.setUint16(4, 20, true);
    ld.setUint16(6, 0x0800, true); // UTF-8 filename flag
    ld.setUint16(8, 0, true); // store (no compression)
    ld.setUint16(10, 0, true);
    ld.setUint16(12, 0x21, true);
    ld.setUint32(14, crc, true);
    ld.setUint32(18, data.length, true);
    ld.setUint32(22, data.length, true);
    ld.setUint16(26, name.length, true);
    ld.setUint16(28, 0, true);

    local.push(lh, name, data);

    // Central directory header
    const ch = new Uint8Array(46);
    const cd = new DataView(ch.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);

    central.push(ch, name);
    offset += lh.length + name.length + data.length;
  }

  const csize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array(22);
  const ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(4, 0, true);
  ed.setUint16(6, 0, true);
  ed.setUint16(8, files.length, true);
  ed.setUint16(10, files.length, true);
  ed.setUint32(12, csize, true);
  ed.setUint32(16, offset, true);

  return new Blob([...local, ...central, end] as unknown as BlobPart[], { type: 'application/zip' });
}

// Pose Interpolation (Spherical linear for angles, linear for parameters)
export function interpolatePose(from: State, to: State, t: number): State {
  const a = cleanPose(from) as State;
  const b = cleanPose(to) as State;
  if (t <= 0) return { ...defaultState(), ...a };
  if (t >= 1) return { ...defaultState(), ...b };

  const p = defaultState();
  p.build = t < 0.5 ? (a.build || 'standard') : (b.build || 'standard');
  p.expert = a.expert || b.expert;
  p.o = t < 0.5 ? a.o : b.o;
  p.wscale = t < 0.5 ? a.wscale : b.wscale;
  p.boxes = t < 0.5 ? a.boxes : b.boxes;

  p.wrist = Math.round(norm(a.wrist + norm(b.wrist - a.wrist) * t));
  p.splay = Math.round(a.splay + (b.splay - a.splay) * t);
  p.thumb = Math.round(a.thumb + (b.thumb - a.thumb) * t);
  p.tilt = Math.round(a.tilt + (b.tilt - a.tilt) * t);

  for (const d of ['index', 'ring', 'pinky'] as const) {
    p.fs[d] = Math.round(a.fs[d] + (b.fs[d] - a.fs[d]) * t);
  }

  for (const d of FINGER_ORDER) {
    p.rot[d] = Math.round(a.rot[d] + (b.rot[d] - a.rot[d]) * t);
    p.cj[d] = [
      Math.round(a.cj[d][0] + (b.cj[d][0] - a.cj[d][0]) * t),
      Math.round(a.cj[d][1] + (b.cj[d][1] - a.cj[d][1]) * t),
      Math.round(a.cj[d][2] + (b.cj[d][2] - a.cj[d][2]) * t),
    ];
  }

  return p;
}

export function squareViewBox(b: { x: number; y: number; width: number; height: number }): string {
  const max = Math.max(b.width, b.height, 1);
  const pad = Math.max(0.65, max * 0.1);
  const size = max + 2 * pad;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
}

export function makeMeasurer(): {
  measure: (markup: string) => { x: number; y: number; width: number; height: number };
  destroy: () => void;
} {
  const measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  measureSvg.setAttribute('width', '1000');
  measureSvg.setAttribute('height', '1000');
  measureSvg.style.cssText = 'position:fixed;left:-12000px;top:0;width:1000px;height:1000px;visibility:hidden;pointer-events:none;overflow:visible';
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  measureSvg.append(group);
  document.body.append(measureSvg);

  return {
    measure(markup: string) {
      group.innerHTML = markup;
      group.querySelectorAll('.hit, .joint-hit').forEach(node => node.remove());
      const b = group.getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    },
    destroy() {
      measureSvg.remove();
    },
  };
}

export function generateHandSvgMarkup(state: State): string {
  const bonesMap = BONES;
  const activeDigits = (() => {
    switch (state.build) {
      case 'claw': return ['index', 'thumb'];
      case 'trident': return ['middle', 'ring', 'thumb'];
      case 'mickey': return ['index', 'middle', 'ring', 'thumb'];
      default: return ['index', 'middle', 'ring', 'pinky', 'thumb'];
    }
  })();

  function buildChain(d: typeof FINGER_ORDER[number], i: number): string {
    const bones = bonesMap[d];
    const n = bones.length;
    const knOvl = state.o > 0 ? KN[d] : 0;
    const w = wid(d, state.wscale);
    const len = bones[i];
    const a = i === 1 ? -knOvl / 2 : 0;
    const J = i === 0 ? knOvl : 0;
    const top = -(a + len);
    const bot = -a;
    const sr = (d === 'thumb' ? 0.125 : 0.22) * (SUM[d] / 8);
    const jr = i === 0 ? KN[d] / 2 : sr;

    const box = getBoneBox(d, i);
    const boxW = box.boxW;

    let html = '';

    // Bone Bounding Box guide (when state.boxes is on: 4:1, 2:1, 1:1, 1:1 with 12.5% margins)
    if (state.boxes) {
      html += `<rect class="box" x="${-boxW / 2}" y="${top}" width="${boxW}" height="${len}" stroke-dasharray="0.06, 0.06" />`;
      if (i === n - 1) {
        html += `<line class="box" x1="${-boxW / 2 + box.emptyMargin}" y1="${top}" x2="${-boxW / 2 + box.emptyMargin}" y2="${bot}" stroke-opacity="0.45" stroke-dasharray="0.03, 0.03" />`;
        html += `<line class="box" x1="${boxW / 2 - box.emptyMargin}" y1="${top}" x2="${boxW / 2 - box.emptyMargin}" y2="${bot}" stroke-opacity="0.45" stroke-dasharray="0.03, 0.03" />`;
      }
    }

    if (i > 0) {
      html += `<rect class="buff" x="${-w / 2}" y="${-sr}" width="${w}" height="${sr * 2}" rx="0.03" />`;
    }
    if (i === n - 1) {
      const rCap = w * 0.45;
      const xL = -w / 2, xR = w / 2;
      const dPath = `M ${xL} ${bot} L ${xL} ${top + rCap} A ${rCap} ${rCap} 0 0 1 ${xL + rCap} ${top} L ${xR - rCap} ${top} A ${rCap} ${rCap} 0 0 1 ${xR} ${top + rCap} L ${xR} ${bot} Z`;
      html += `<path class="bone" d="${dPath}" />`;
    } else {
      html += `<rect class="bone" x="${-w / 2}" y="${top}" width="${w}" height="${len}" rx="0.04" />`;
    }

    if (i + 1 < n) {
      const nextAng = -(state.cj[d][i] || 0);
      html += `<g transform="translate(0, ${top + J / 2}) rotate(${nextAng})">`;
      html += buildChain(d, i + 1);
      html += `<circle class="child-joint" cx="0" cy="0" r="0.05" />`;
      html += `<circle class="parent-joint" cx="0" cy="0" r="0.03" fill="url(#parentJointGrad)" />`;
      html += `</g>`;
    }
    return html;
  }

  let handHtml = `<g transform="rotate(${state.wrist})">`;
  if (state.boxes) {
    handHtml += `<g class="box"><rect x="-2" y="-4" width="4" height="4" /><line x1="-1" y1="-4" x2="-1" y2="0" /><line x1="0" y1="-4" x2="0" y2="0" /><line x1="1" y1="-4" x2="1" y2="0" /></g>`;
  }

  for (const d of FINGER_ORDER) {
    if (!activeDigits.includes(d)) continue;
    const rotBase = calcA(d, state);
    handHtml += `<g data-d="${d}" transform="rotate(${rotBase})">${buildChain(d, 0)}</g>`;
  }

  // Wrist hub
  handHtml += `<circle class="wrist-sock" cx="0" cy="0" r="0.325" />`;
  handHtml += `<circle class="wrist-plug" cx="0" cy="0" r="0.1" />`;
  handHtml += `</g>`;
  return handHtml;
}

export function buildSvgDocument(markup: string, viewBox: string, size = 1024): string {
  const css = `
    #hand { filter: url(#filmBlur); }
    .bone { stroke: #9d4edd; stroke-width: 0.045; fill: #120e1a; }
    .buff { stroke: rgba(157, 78, 221, 0.45); stroke-width: 0.02; stroke-dasharray: 0.08, 0.08; fill: none; }
    .box { stroke: #adff2f; stroke-width: 0.035; stroke-dasharray: 0.1, 0.1; fill: none; }
    .child-joint { fill: #8b25e0; stroke: #7c3aed; stroke-width: 0.008; }
    .parent-joint { stroke: #166534; stroke-width: 0.004; }
    .wrist-sock { stroke: #ef4444; stroke-width: 0.04; fill: #120e1a; }
    .wrist-plug { fill: #ef4444; }
  `;
  const defs = `
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
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}"><style>${css}</style>${defs}${markup}</svg>`;
}

export async function canvasFromMarkup(markup: string, viewBox: string, size: number, opaque = false): Promise<HTMLCanvasElement> {
  const blob = new Blob([buildSvgDocument(markup, viewBox, size)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Browser could not render export frame.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Cannot get 2D canvas context');

    if (opaque) {
      ctx.fillStyle = '#e2e2e8'; // Light gray backdrop if opaque
      ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(image, 0, 0, size, size);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not create image blob'))), type)
  );
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export interface AnimationSequence {
  frames: Array<{ pose: State; markup: string }>;
  viewBox: string;
  from: State;
  to: State;
  duration: number;
  fps: number;
  count: number;
}

export async function buildSequence(
  from: State,
  to: State,
  count: number,
  onProgress?: (current: number, total: number) => void
): Promise<{ frames: Array<{ pose: State; markup: string }>; viewBox: string }> {
  const measurer = makeMeasurer();
  const frames: Array<{ pose: State; markup: string }> = [];
  let bounds: { x: number; y: number; width: number; height: number } | null = null;

  try {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 1 : i / (count - 1);
      const pose = interpolatePose(from, to, t);
      const markup = generateHandSvgMarkup(pose);
      const b = measurer.measure(markup);

      if (!bounds) {
        bounds = { ...b };
      } else {
        const x = Math.min(bounds.x, b.x);
        const y = Math.min(bounds.y, b.y);
        const right = Math.max(bounds.x + bounds.width, b.x + b.width);
        const bottom = Math.max(bounds.y + bounds.height, b.y + b.height);
        bounds = { x, y, width: right - x, height: bottom - y };
      }
      frames.push({ pose, markup });

      if (i % 3 === 0 && onProgress) {
        onProgress(i + 1, count);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } finally {
    measurer.destroy();
  }

  const vb = squareViewBox(bounds || { x: -4, y: -8, width: 8, height: 10 });
  return { frames, viewBox: vb };
}
