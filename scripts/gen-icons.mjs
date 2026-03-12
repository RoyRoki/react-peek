import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const assetsDir = resolve(root, 'assets');
const buildIcons = resolve(root, 'build', 'icons');

mkdirSync(assetsDir, { recursive: true });
mkdirSync(buildIcons, { recursive: true });

function isPartOfR(x, y, size) {
  const unit = size / 16;
  const lx = x / unit;
  const ly = y / unit;
  if (lx < 3 || lx > 13 || ly < 2 || ly > 14) return false;
  if (lx >= 4 && lx <= 6) return true;
  if (ly >= 2 && ly <= 4 && lx >= 4 && lx <= 11) return true;
  if (ly >= 7 && ly <= 9 && lx >= 4 && lx <= 11) return true;
  if (lx >= 10 && lx <= 12 && ly >= 2 && ly <= 9) return true;
  if (ly >= 9 && ly <= 14) {
    const diagX = 6 + (ly - 9) * 1.2;
    if (lx >= diagX && lx <= diagX + 2.5) return true;
  }
  return false;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function generateIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const isR = size >= 16 && isPartOfR(x, y, size);
      if (isR) {
        pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
      } else {
        pixels[i] = 59; pixels[i + 1] = 130; pixels[i + 2] = 246; pixels[i + 3] = 255;
      }
    }
  }

  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0;
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

for (const size of [16, 32, 48, 128]) {
  const png = generateIcon(size);
  writeFileSync(resolve(assetsDir, `icon-${size}.png`), png);
  writeFileSync(resolve(buildIcons, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png (${png.length} bytes)`);
}

console.log('Done!');
