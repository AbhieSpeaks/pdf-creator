// Generate simple PNG icons for the extension
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Create simple colored PNG icons
// These use a minimal valid PNG structure

function createPNG(size) {
  // Create canvas-like data for a simple blue rectangle with "PDF" text
  // This creates a minimal valid PNG file

  const { createCanvas } = require('canvas');
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Blue background with rounded corners effect
  ctx.fillStyle = '#4285f4';
  ctx.fillRect(0, 0, size, size);

  // White "PDF" text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.floor(size * 0.35)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PDF', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

// For systems without canvas, create placeholder message
console.log('Icon generation requires the "canvas" npm package.');
console.log('Install with: npm install canvas');
console.log('');
console.log('Alternatively, create your own icons:');
console.log('- icon16.png (16x16 pixels)');
console.log('- icon48.png (48x48 pixels)');
console.log('- icon128.png (128x128 pixels)');
console.log('');
console.log('Place them in: assets/icons/');
