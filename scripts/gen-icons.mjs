import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const OUT_DIR = path.join(rootDir, 'electron');
const ICON_SOURCE_PNG = path.join(OUT_DIR, 'icon-source.png');
const ICON_PNG = path.join(OUT_DIR, 'icon.png');
const ICON_ICO = path.join(OUT_DIR, 'icon.ico');

const SRC_SIZE = 256;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type);
  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, dataBuf]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
};

const encodePng = (rgba, width, height) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const rowLen = width * 4;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLen + 1);
    raw[rowOffset] = 0; // filter type 0
    const srcOffset = y * rowLen;
    rgba.copy(raw, rowOffset + 1, srcOffset, srcOffset + rowLen);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
};

const createRgba = (width, height) => Buffer.alloc(width * height * 4);

const setPixel = (rgba, width, x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= width) return;
  const height = rgba.length / (width * 4);
  if (y >= height) return;
  const idx = (y * width + x) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
};

const fillRect = (rgba, width, x, y, w, h, color) => {
  const [r, g, b, a = 255] = color;
  const height = rgba.length / (width * 4);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      setPixel(rgba, width, xx, yy, r, g, b, a);
    }
  }
};

const inRoundRect = (cx, cy, x, y, w, h, r) => {
  const left = x;
  const top = y;
  const right = x + w;
  const bottom = y + h;
  if (cx < left || cx > right || cy < top || cy > bottom) return false;
  const innerLeft = left + r;
  const innerRight = right - r;
  const innerTop = top + r;
  const innerBottom = bottom - r;
  if (cx >= innerLeft && cx <= innerRight) return true;
  if (cy >= innerTop && cy <= innerBottom) return true;
  const cornerX = cx < innerLeft ? innerLeft : innerRight;
  const cornerY = cy < innerTop ? innerTop : innerBottom;
  const dx = cx - cornerX;
  const dy = cy - cornerY;
  return dx * dx + dy * dy <= r * r;
};

const fillRoundRect = (rgba, width, x, y, w, h, radius, color) => {
  const [r, g, b, a = 255] = color;
  const height = rgba.length / (width * 4);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  const rad = Math.max(0, radius);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const cx = xx + 0.5;
      const cy = yy + 0.5;
      if (inRoundRect(cx, cy, x, y, w, h, rad)) {
        setPixel(rgba, width, xx, yy, r, g, b, a);
      }
    }
  }
};

const strokeRoundRect = (rgba, width, x, y, w, h, radius, thickness, color) => {
  fillRoundRect(rgba, width, x, y, w, h, radius, color);
  const inner = Math.max(1, thickness);
  fillRoundRect(rgba, width, x + inner, y + inner, w - inner * 2, h - inner * 2, Math.max(0, radius - inner), [
    255,
    255,
    255,
    0,
  ]);
};

const fillCircle = (rgba, width, cx, cy, radius, color) => {
  const [r, g, b, a = 255] = color;
  const height = rgba.length / (width * 4);
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(rgba, width, xx, yy, r, g, b, a);
      }
    }
  }
};

const strokeCircle = (rgba, width, cx, cy, radius, thickness, color) => {
  const outer = radius;
  const inner = Math.max(0, radius - Math.max(1, thickness));
  fillCircle(rgba, width, cx, cy, outer, color);
  fillCircle(rgba, width, cx, cy, inner, [255, 255, 255, 0]);
};

const drawThickLine = (rgba, width, x0, y0, x1, y1, thickness, color) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillCircle(rgba, width, x, y, thickness / 2, color);
  }
};

const resizeBilinear = (src, srcW, srcH, dstW, dstH) => {
  const dst = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const sy = (y + 0.5) * (srcH / dstH) - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < dstW; x += 1) {
      const sx = (x + 0.5) * (srcW / dstW) - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = sx - x0;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const dstIdx = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const v00 = src[idx00 + c];
        const v10 = src[idx10 + c];
        const v01 = src[idx01 + c];
        const v11 = src[idx11 + c];
        const v0 = v00 + (v10 - v00) * wx;
        const v1 = v01 + (v11 - v01) * wx;
        const v = v0 + (v1 - v0) * wy;
        dst[dstIdx + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return dst;
};

const drawIcon256 = () => {
  const rgba = createRgba(SRC_SIZE, SRC_SIZE);

  const white = [255, 255, 255, 255];
  const blue = [28, 117, 190, 255];
  const blueLight = [73, 170, 230, 255];
  const blueDark = [19, 93, 165, 255];
  const green = [42, 180, 108, 255];
  const gray = [160, 167, 173, 255];
  const grayDark = [118, 128, 138, 255];

  fillRect(rgba, SRC_SIZE, 0, 0, SRC_SIZE, SRC_SIZE, white);

  // Calendar body
  fillRoundRect(rgba, SRC_SIZE, 66, 24, 168, 148, 26, blue);
  fillRoundRect(rgba, SRC_SIZE, 76, 34, 148, 128, 18, blueLight);
  fillRoundRect(rgba, SRC_SIZE, 76, 34, 148, 30, 18, blueDark);

  // Rings
  fillRoundRect(rgba, SRC_SIZE, 98, 2, 26, 62, 13, [210, 210, 210, 255]);
  fillRoundRect(rgba, SRC_SIZE, 176, 2, 26, 62, 13, [210, 210, 210, 255]);
  fillRoundRect(rgba, SRC_SIZE, 102, 20, 18, 38, 9, [160, 160, 160, 255]);
  fillRoundRect(rgba, SRC_SIZE, 180, 20, 18, 38, 9, [160, 160, 160, 255]);

  // Grid squares
  const gridX = 120;
  const gridY = 78;
  const cell = 20;
  const gap = 12;
  const cells = [
    gray,
    green,
    green,
    green,
    green,
    gray,
    gray,
    gray,
    gray,
  ];
  let idx = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = gridX + col * (cell + gap);
      const y = gridY + row * (cell + gap);
      fillRoundRect(rgba, SRC_SIZE, x, y, cell, cell, 4, cells[idx] || gray);
      idx += 1;
    }
  }

  // Clock
  const clockCx = 86;
  const clockCy = 186;
  strokeCircle(rgba, SRC_SIZE, clockCx, clockCy, 56, 10, blue);
  fillCircle(rgba, SRC_SIZE, clockCx, clockCy, 46, [255, 255, 255, 255]);

  // clock ticks
  for (let k = 0; k < 12; k += 1) {
    const angle = (Math.PI * 2 * k) / 12;
    const r0 = 36;
    const r1 = k % 3 === 0 ? 44 : 41;
    const x0 = clockCx + Math.cos(angle) * r0;
    const y0 = clockCy + Math.sin(angle) * r0;
    const x1 = clockCx + Math.cos(angle) * r1;
    const y1 = clockCy + Math.sin(angle) * r1;
    drawThickLine(rgba, SRC_SIZE, x0, y0, x1, y1, k % 3 === 0 ? 4 : 3, k % 3 === 0 ? blue : grayDark);
  }

  // clock hands
  drawThickLine(rgba, SRC_SIZE, clockCx, clockCy, clockCx, clockCy - 22, 6, blueDark);
  drawThickLine(rgba, SRC_SIZE, clockCx, clockCy, clockCx + 18, clockCy + 12, 6, blueDark);
  fillCircle(rgba, SRC_SIZE, clockCx, clockCy, 6, blueDark);

  // People
  fillCircle(rgba, SRC_SIZE, 172, 198, 24, blue);
  fillCircle(rgba, SRC_SIZE, 224, 198, 24, green);
  fillRoundRect(rgba, SRC_SIZE, 148, 220, 56, 26, 13, blue);
  fillRoundRect(rgba, SRC_SIZE, 200, 220, 56, 26, 13, green);
  fillCircle(rgba, SRC_SIZE, 172, 198, 13, [255, 255, 255, 220]);
  fillCircle(rgba, SRC_SIZE, 224, 198, 13, [255, 255, 255, 220]);

  return rgba;
};

const encodeIco = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type
  header.writeUInt16LE(images.length, 4); // count

  const dirEntries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    offset += png.length;
    dirEntries.push(entry);
  }

  const imageData = images.map((it) => it.png);
  return Buffer.concat([header, ...dirEntries, ...imageData]);
};

function run(exe, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(exe)} exited with code ${code}`));
    });
  });
}

const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;

const generateFromSourcePng = async () => {
  const src = psQuote(ICON_SOURCE_PNG);
  const outPng = psQuote(ICON_PNG);
  const outIco = psQuote(ICON_ICO);

  const cmd = `
Add-Type -AssemblyName System.Drawing

$src = ${src}
$outPng = ${outPng}
$outIco = ${outIco}

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($img, 0, 0, 256, 256)
$g.Dispose()
$img.Dispose()

$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = New-Object System.IO.FileStream($outIco, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()
`;

  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]);
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const hasSourcePng = await fileExists(ICON_SOURCE_PNG);
  const hasPng = await fileExists(ICON_PNG);
  const hasIco = await fileExists(ICON_ICO);

  if (!hasSourcePng && hasPng && hasIco) {
    process.stdout.write(`Icons already exist; skip generation.\n`);
    process.stdout.write(`- ${path.relative(rootDir, ICON_PNG)}\n`);
    process.stdout.write(`- ${path.relative(rootDir, ICON_ICO)}\n`);
    return;
  }

  if (hasSourcePng) {
    await generateFromSourcePng();
    process.stdout.write(`Generated from: ${path.relative(rootDir, ICON_SOURCE_PNG)}\n`);
    process.stdout.write(`Generated: ${path.relative(rootDir, ICON_PNG)}\n`);
    process.stdout.write(`Generated: ${path.relative(rootDir, ICON_ICO)}\n`);
    return;
  }

  const base = drawIcon256();
  const png256 = encodePng(base, SRC_SIZE, SRC_SIZE);
  await fs.writeFile(ICON_PNG, png256);

  const images = [];
  for (const size of SIZES) {
    const rgba = size === SRC_SIZE ? base : resizeBilinear(base, SRC_SIZE, SRC_SIZE, size, size);
    images.push({ size, png: encodePng(rgba, size, size) });
  }
  await fs.writeFile(ICON_ICO, encodeIco(images));

  process.stdout.write(`Generated: ${path.relative(rootDir, ICON_PNG)}\n`);
  process.stdout.write(`Generated: ${path.relative(rootDir, ICON_ICO)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
