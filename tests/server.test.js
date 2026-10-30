import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.js';

test('local server serves only explicit assets and rejects other methods and paths', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port, address } = server.address();
  try {
    assert.equal(address, '127.0.0.1');
    const root = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Daybook/);
    assert.match(root.headers.get('content-security-policy'), /script-src 'self'/);
    const script = await fetch(`http://127.0.0.1:${port}/src/model.js`);
    assert.match(script.headers.get('content-type'), /javascript/);
    await script.arrayBuffer();
    const head = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
    assert.equal(await head.text(), '');
    const post = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' });
    assert.equal(post.status, 405);
    await post.text();
    for (const path of ['/package.json', '/server.js', '/%2e%2e/README.md', '/src/..%5c..%5csecret.txt', '/src/model.js/extra']) {
      const status = await new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port, path }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        });
        request.on('error', reject);
      });
      assert.equal(status, 404, path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
