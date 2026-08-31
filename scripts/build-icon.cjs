'use strict';
/**
 * Draws the application icon from geometry rather than scaling a bitmap, so
 * every size in the .ico is rendered sharp at its own resolution.
 *
 * The mark matches the tray icon and the project's social preview: a battery on
 * the dark navy field, with the cyan charge accent used throughout the UI.
 *
 * Run with `npm run icon`. The result is committed, so a normal build does not
 * depend on this script.
 */
const { writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const SIZES = [256, 128, 64, 48, 32, 16];
/** Below this the three separate bars turn to mush, so a solid level is drawn instead. */
const SIMPLIFY_BELOW = 24;
const SAMPLES = 4;

const FIELD_BASE = [0x10, 0x13, 0x1d];
const FIELD_GLOW = [0x1f, 0x36, 0x51];
const SHELL = [0xe9, 0xed, 0xf7];
const ACCENT = [0x22, 0xd3, 0xee];

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRect(x, y, left, top, right, bottom, radius) {
  const halfWidth = (right - left) / 2;
  const halfHeight = (bottom - top) / 2;
  const dx = Math.abs(x - (left + right) / 2) - (halfWidth - radius);
  const dy = Math.abs(y - (top + bottom) / 2) - (halfHeight - radius);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - radius;
}

function mix(a, b, t) {
  return [0, 1, 2].map((index) => Math.round(a[index] + (b[index] - a[index]) * t));
}

/** The app's own backdrop: a flat navy field lit from the top-right corner. */
function field(x, y) {
  const glow = Math.max(0, 1 - Math.hypot(x - 0.95, y) / 0.62);
  return mix(FIELD_BASE, FIELD_GLOW, glow * glow);
}

/**
 * Returns the mark's colour at a point, or null where the field shows through.
 * Coordinates are normalised, so one description serves every size.
 */
function mark(x, y, stroke, simplified) {
  const body = { left: 0.13, top: 0.30, right: 0.71, bottom: 0.70, radius: 0.055 };
  const outer = roundedRect(x, y, body.left, body.top, body.right, body.bottom, body.radius);
  const inner = roundedRect(
    x, y, body.left + stroke, body.top + stroke, body.right - stroke, body.bottom - stroke,
    Math.max(0.008, body.radius - stroke),
  );
  const terminal = roundedRect(x, y, 0.745, 0.415, 0.85, 0.585, 0.03);

  if (terminal <= 0) return SHELL;
  if (outer <= 0 && inner > 0) return SHELL;
  if (inner > 0) return null;

  // Charge sits inside the shell with a gap, so the outline stays readable.
  const gap = stroke * 0.85;
  const left = body.left + stroke + gap;
  const right = body.right - stroke - gap;
  const top = body.top + stroke + gap;
  const bottom = body.bottom - stroke - gap;
  if (y < top || y > bottom) return null;

  if (simplified) {
    return x <= left + (right - left) * 0.66 ? ACCENT : null;
  }
  // Three bars with half-width gaps: 3b + 2(b/2) = 4b across the run.
  const bar = (right - left) / 4.4;
  for (let index = 0; index < 3; index += 1) {
    const start = left + index * bar * 1.5;
    if (x >= start && x <= start + bar) return ACCENT;
  }
  return null;
}

/** Renders one size to straight BGRA, bottom-up, as an .ico entry expects. */
function render(size) {
  const stroke = Math.max(0.05, 1.45 / size);
  const simplified = size < SIMPLIFY_BELOW;
  const radius = 0.2;
  const pixels = Buffer.alloc(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (column + (sx + 0.5) / SAMPLES) / size;
          const y = (row + (sy + 0.5) / SAMPLES) / size;
          if (roundedRect(x, y, 0, 0, 1, 1, radius) > 0) continue;
          const colour = mark(x, y, stroke, simplified) ?? field(x, y);
          red += colour[0]; green += colour[1]; blue += colour[2]; alpha += 255;
        }
      }
      const total = SAMPLES * SAMPLES;
      const covered = alpha / 255;
      // Bottom-up rows, and colour averaged over covered samples only so edges
      // fade in alpha instead of darkening towards black.
      const offset = ((size - 1 - row) * size + column) * 4;
      pixels[offset] = covered ? Math.round(blue / covered) : 0;
      pixels[offset + 1] = covered ? Math.round(green / covered) : 0;
      pixels[offset + 2] = covered ? Math.round(red / covered) : 0;
      pixels[offset + 3] = Math.round(alpha / total);
    }
  }
  return pixels;
}

/**
 * Classic BMP entries rather than PNG-compressed ones: NSIS and older Windows
 * shell surfaces still read those most reliably.
 */
function bitmapEntry(size, pixels) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR image plus the AND mask below it.
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  // A 32-bit icon carries its own alpha; the mask stays fully opaque.
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

function buildIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let offset = directory.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([directory, ...images.map((image) => image.data)]);
}

const images = SIZES.map((size) => ({ size, data: bitmapEntry(size, render(size)) }));
const target = join(__dirname, '..', 'build', 'icon.ico');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, buildIco(images));
console.log(`Wrote ${target} (${SIZES.join(', ')} px)`);
