function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  return [days && `${days}j`, hours && `${hours}h`, minutes && `${minutes}min`, `${remainder}s`]
    .filter(Boolean)
    .join(' ');
}

function mib(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} Mio`;
}

export function buildDiagnosticReport({
  nodeVersion = 'inconnu',
  uptimeSeconds = 0,
  whatsappConnected = false,
  commandCount = 0,
  memory = {},
} = {}) {
  const count = Math.max(0, Math.floor(Number(commandCount) || 0));
  return [
    '🩺 Diagnostic M.H.E-MD',
    `WhatsApp : ${whatsappConnected ? 'connecté' : 'déconnecté'}`,
    `Processus : actif depuis ${formatDuration(uptimeSeconds)}`,
    `Node.js : ${String(nodeVersion).slice(0, 32)}`,
    `Commandes enregistrées : ${count}`,
    `Mémoire : RSS ${mib(memory.rss)} · tas ${mib(memory.heapUsed)} / ${mib(memory.heapTotal)}`,
  ].join('\n');
}
