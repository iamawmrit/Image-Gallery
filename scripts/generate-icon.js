import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const assetsDir = path.join(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

const iconPath = path.join(assetsDir, 'icon.png');

console.log('Generating professional icon.png...');

const width = 1024;
const height = 1024;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#30cfd0;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#330867;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="20" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <rect x="112" y="112" width="800" height="800" rx="175" ry="175" fill="url(#grad)" filter="url(#shadow)" />
  
  <!-- White Frame -->
  <rect x="262" y="262" width="500" height="500" rx="40" ry="40" fill="white" />
  
  <!-- Landscape -->
  <mask id="frame-mask">
    <rect x="282" y="282" width="460" height="460" rx="20" ry="20" fill="white" />
  </mask>
  
  <g mask="url(#frame-mask)">
    <!-- Sky -->
    <rect x="282" y="282" width="460" height="460" fill="#E0F7FA" />
    
    <!-- Sun -->
    <circle cx="650" cy="380" r="60" fill="#FFD700" />
    
    <!-- Mountains -->
    <path d="M282 742 L450 450 L600 742 Z" fill="#30cfd0" />
    <path d="M500 742 L650 500 L800 742 Z" fill="#330867" opacity="0.8" />
  </g>
</svg>
`;

sharp(Buffer.from(svg))
    .png()
    .toFile(iconPath)
    .then(() => console.log('New icon.png generated successfully'))
    .catch(err => console.error('Error generating icon:', err));
