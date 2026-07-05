'use strict';

/**
 * Generates build/icon.png (512x512) with no external dependencies — just
 * Node's zlib. electron-builder derives the mac/win/linux icons from this
 * single PNG (it must be >=512x512). Re-run with: node scripts/make-icon.js
 *
 * Design: a dark rounded-square with a soft blue radial glow and a simple "eye"
 * — the assistant that watches the screen.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const buf = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  const i = (y * S + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

const cx = S / 2;
const cy = S / 2;
const radius = 150; // corner radius of the rounded square
const margin = 24;

function inRoundedSquare(x, y) {
  const minX = margin;
  const maxX = S - margin;
  const minY = margin;
  const maxY = S - margin;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  // rounded corners
  const rx = Math.min(Math.max(x, minX + radius), maxX - radius);
  const ry = Math.min(Math.max(y, minY + radius), maxY - radius);
  const dx = x - rx;
  const dy = y - ry;
  return dx * dx + dy * dy <= radius * radius;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedSquare(x, y)) {
      set(x, y, 0, 0, 0, 0); // transparent outside
      continue;
    }
    // radial background: deep navy → slightly lighter toward center
    const d = Math.hypot(x - cx, y - cy) / (S / 2);
    const t = Math.min(1, d);
    let r = lerp(30, 15, t);
    let g = lerp(38, 20, t);
    let b = lerp(58, 27, t);

    // blue glow behind the eye
    const glow = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / 190);
    r = Math.min(255, r + Math.round(60 * glow));
    g = Math.min(255, g + Math.round(110 * glow));
    b = Math.min(255, b + Math.round(255 * glow));

    // the eye: outer almond + iris + pupil + highlight
    const ex = (x - cx) / 150;
    const ey = (y - cy) / 92;
    const eye = ex * ex + ey * ey; // <=1 inside the almond
    const iris = Math.hypot(x - cx, y - cy) / 62;

    if (eye <= 1) {
      // white of the eye
      r = 232; g = 238; b = 246;
      if (iris <= 1) {
        // iris (accent blue)
        r = 60; g = 120; b = 245;
        const pupil = Math.hypot(x - cx, y - cy) / 30;
        if (pupil <= 1) {
          r = 12; g = 16; b = 26; // pupil
          // highlight glint
          if (Math.hypot(x - (cx - 10), y - (cy - 10)) < 8) {
            r = 235; g = 240; b = 250;
          }
        }
      }
    }

    set(x, y, r, g, b, 255);
  }
}

// --- encode PNG (truecolor + alpha, filter 0 per scanline) ---
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter type 0
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('Wrote ' + out + ' (' + png.length + ' bytes)');
