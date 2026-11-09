import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticReport } from '../core/diagnostics.js';

test('diagnostic reports only operational runtime values', () => {
  const report = buildDiagnosticReport({
    nodeVersion: 'v22.0.0',
    uptimeSeconds: 90,
    whatsappConnected: true,
    commandCount: 42,
    memory: { rss: 2 * 1024 * 1024, heapUsed: 1024 * 1024, heapTotal: 4 * 1024 * 1024 },
  });
  assert.match(report, /WhatsApp : connecté/);
  assert.match(report, /1min 30s/);
  assert.match(report, /Node\.js : v22\.0\.0/);
  assert.match(report, /Commandes enregistrées : 42/);
  assert.match(report, /RSS 2\.0 Mio/);
});

test('diagnostic handles disconnected and invalid optional data safely', () => {
  const report = buildDiagnosticReport({
    whatsappConnected: false,
    uptimeSeconds: -2,
    commandCount: 'not-a-number',
    memory: {},
  });
  assert.match(report, /WhatsApp : déconnecté/);
  assert.match(report, /Processus : actif depuis 0s/);
  assert.match(report, /Commandes enregistrées : 0/);
  assert.doesNotMatch(report, /NaN|undefined/);
});
