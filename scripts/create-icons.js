#!/usr/bin/env node
// Create simple PNG icons without external dependencies

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[i] = c;
}

function createPNG(width, height, pixelData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (image data)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type (none)
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      rawData[offset++] = pixelData[idx];     // R
      rawData[offset++] = pixelData[idx + 1]; // G
      rawData[offset++] = pixelData[idx + 2]; // B
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createIconPixels(size) {
  const pixels = Buffer.alloc(size * size * 3);
  const bgColor = [66, 133, 244]; // #4285f4
  const textColor = [255, 255, 255]; // white

  // Fill with background color
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = bgColor[0];
    pixels[i * 3 + 1] = bgColor[1];
    pixels[i * 3 + 2] = bgColor[2];
  }

  // Draw a simple "P" shape for PDF
  const margin = Math.floor(size * 0.2);
  const lineWidth = Math.max(2, Math.floor(size * 0.15));

  // Vertical line of P
  for (let y = margin; y < size - margin; y++) {
    for (let dx = 0; dx < lineWidth; dx++) {
      const x = margin + dx;
      if (x < size) {
        const idx = (y * size + x) * 3;
        pixels[idx] = textColor[0];
        pixels[idx + 1] = textColor[1];
        pixels[idx + 2] = textColor[2];
      }
    }
  }

  // Top horizontal line of P
  for (let x = margin; x < size - margin; x++) {
    for (let dy = 0; dy < lineWidth; dy++) {
      const y = margin + dy;
      if (y < size) {
        const idx = (y * size + x) * 3;
        pixels[idx] = textColor[0];
        pixels[idx + 1] = textColor[1];
        pixels[idx + 2] = textColor[2];
      }
    }
  }

  // Middle horizontal line of P
  const midY = Math.floor(size / 2);
  for (let x = margin; x < size - margin; x++) {
    for (let dy = 0; dy < lineWidth; dy++) {
      const y = midY + dy;
      if (y < size) {
        const idx = (y * size + x) * 3;
        pixels[idx] = textColor[0];
        pixels[idx + 1] = textColor[1];
        pixels[idx + 2] = textColor[2];
      }
    }
  }

  // Right vertical line of P (top half)
  for (let y = margin; y < midY + lineWidth; y++) {
    for (let dx = 0; dx < lineWidth; dx++) {
      const x = size - margin - lineWidth + dx;
      if (x >= 0) {
        const idx = (y * size + x) * 3;
        pixels[idx] = textColor[0];
        pixels[idx + 1] = textColor[1];
        pixels[idx + 2] = textColor[2];
      }
    }
  }

  return pixels;
}

// Generate icons
const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'assets', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const pixels = createIconPixels(size);
  const png = createPNG(size, size, pixels);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('\nIcons created successfully!');
