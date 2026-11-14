// Petit serveur statique (aucune dépendance) pour la prévisualisation et le rendu.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

export function startServer(port = 5173) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      const range = req.headers.range;
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      if (range) { // nécessaire pour pouvoir naviguer dans l'audio
        const [a, b] = range.replace('bytes=', '').split('-');
        const start = +a, end = b ? +b : st.size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.env.PORT || 5173);
  await startServer(port);
  console.log(`Prévisualisation : http://localhost:${port}/`);
}
