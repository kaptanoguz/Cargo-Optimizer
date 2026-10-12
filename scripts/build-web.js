// Copies the web app (index.html, css/, js/) into dist-web/, the folder Tauri bundles.
// Run: npm run build:web  (Tauri runs it before every `tauri build`)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist-web');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
['css', 'js'].forEach(dir => fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true }));
console.log('dist-web/ ← index.html, css/, js/');
