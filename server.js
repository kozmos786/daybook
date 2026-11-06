import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/src/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/src/model.js', ['src/model.js', 'text/javascript; charset=utf-8']],
  ['/src/dates.js', ['src/dates.js', 'text/javascript; charset=utf-8']],
  ['/src/school.js', ['src/school.js', 'text/javascript; charset=utf-8']],
  ['/src/schoolActions.js', ['src/schoolActions.js', 'text/javascript; charset=utf-8']],
  ['/src/schoolUi.js', ['src/schoolUi.js', 'text/javascript; charset=utf-8']],
  ['/src/guide.js', ['src/guide.js', 'text/javascript; charset=utf-8']],
  ['/src/games.js', ['src/games.js', 'text/javascript; charset=utf-8']],
  ['/src/reminders.js', ['src/reminders.js', 'text/javascript; charset=utf-8']],
  ['/src/theme.js', ['src/theme.js', 'text/javascript; charset=utf-8']],
  ['/src/chessWorker.js', ['src/chessWorker.js', 'text/javascript; charset=utf-8']],
  ['/src/gamesLogic.js', ['src/gamesLogic.js', 'text/javascript; charset=utf-8']],
  ['/src/storage.js', ['src/storage.js', 'text/javascript; charset=utf-8']],
  ['/src/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
]);

export function createServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      response.writeHead(400);
      response.end('Invalid URL');
      return;
    }
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    try {
      const body = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error('Unable to serve application asset:', error);
      response.writeHead(500);
      response.end('Unable to read application file. Check the server terminal.');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', (error) => {
    console.error(`Cannot start task planner: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(4173, '127.0.0.1', () => {
    console.log('Personal task planner: http://127.0.0.1:4173');
    console.log('Keep this terminal open. Press Ctrl+C to stop.');
  });
}
