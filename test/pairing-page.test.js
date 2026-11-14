import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('pairing page script is valid JavaScript and tracks the selected session', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'pairing page script exists');
  assert.doesNotThrow(() => new vm.Script(match[1]), 'pairing page script parses');
  assert.match(match[1], /targetSessionId/);
  assert.match(match[1], /item\.state==='connected'/);
  assert.match(html, /numberMasked/);
});
