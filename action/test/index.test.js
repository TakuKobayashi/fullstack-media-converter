import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run } from '../index.js';

test('generates a README in the requested language', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'ollama-readme-'));
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    assert.equal(request.url, '/api/chat');
    assert.equal(payload.model, 'test-model');
    assert.match(payload.messages[0].content, /Japanese/);
    assert.match(payload.messages[1].content, /package.json/);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ message: { content: '# テスト\n\n説明です。' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  const previous = { ...process.env };
  try {
    await writeFile(path.join(workspace, 'package.json'), '{"name":"fixture"}', 'utf8');
    process.env.GITHUB_WORKSPACE = workspace;
    await run([
      '--model',
      'test-model',
      '--language',
      'Japanese',
      '--ollama-host',
      `http://127.0.0.1:${address.port}`,
      '--output',
      'README.md',
    ]);
    assert.equal(
      await readFile(path.join(workspace, 'README.md'), 'utf8'),
      '# テスト\n\n説明です。\n',
    );
  } finally {
    process.env = previous;
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});

test('rejects output paths outside the workspace', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'ollama-readme-'));
  const previous = { ...process.env };
  try {
    process.env.GITHUB_WORKSPACE = workspace;
    await assert.rejects(run(['--output', '../README.md']), /output must stay inside/);
  } finally {
    process.env = previous;
    await rm(workspace, { recursive: true, force: true });
  }
});
