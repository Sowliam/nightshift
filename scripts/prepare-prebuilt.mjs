import fs from 'fs';
import path from 'path';

const distDir = path.resolve('apps/desktop/dist');
const outputDir = path.join(distDir, '.vercel', 'output');
const staticDir = path.join(outputDir, 'static');

fs.mkdirSync(staticDir, { recursive: true });

// Copy index.html, logo.png, assets to staticDir
fs.copyFileSync(path.join(distDir, 'index.html'), path.join(staticDir, 'index.html'));
if (fs.existsSync(path.join(distDir, 'logo.png'))) {
  fs.copyFileSync(path.join(distDir, 'logo.png'), path.join(staticDir, 'logo.png'));
}

const assetsSrc = path.join(distDir, 'assets');
const assetsDest = path.join(staticDir, 'assets');
fs.cpSync(assetsSrc, assetsDest, { recursive: true });

// config.json for Build Output API v3
const config = {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' }
  ]
};

fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(config, null, 2));
console.log('Prebuilt output created successfully at:', outputDir);
