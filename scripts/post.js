// Ergänzt die fertige Seite (dist/index.html) um App-Symbol, Titel und "Zum Home-Bildschirm"-Angaben
const fs = require('fs');
const p = 'dist/index.html';
let h = fs.readFileSync(p, 'utf8');
const tags = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="MSG Erste Hilfe">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="theme-color" content="#801619">',
  '<style>html,body{background:#ECE8E8}</style>',
].join('\n');
h = h.replace('</head>', tags + '\n</head>');
h = h.replace(/<title>[^<]*<\/title>/, '<title>MSG Erste-Hilfe-Schule</title>');
if (!/<title>/.test(h)) h = h.replace('</head>', '<title>MSG Erste-Hilfe-Schule</title>\n</head>');
fs.writeFileSync(p, h);
console.log('post.js: fertig');
