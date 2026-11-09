import os from 'node:os';

function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds % 60}s`].filter(Boolean).join(' ');
}

function displayCategory(category) {
  const labels = {
    'GÉNÉRAL': 'GENERAL',
    'PROPRIÉTAIRE': 'OWNER',
    'GROUPES': 'GROUPS',
    'TEXTE': 'TEXT',
    'TEXTE / POLICES': 'TEXT / FONTS',
    'TÉLÉCHARGEMENT': 'DOWNLOADS',
    'OUTILS': 'TOOLS',
    'M.H.E GOLD V2': 'AI & GOLD V2',
  };
    return labels[category] || String(category).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function getCategories(commands) {
  const categories = new Map();
  for (const command of commands.values()) {
    const category = command.category || 'OTHER';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(command);
  }
  return [...categories.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function safeKey(value = '') {
  return String(value).replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 100) || 'unknown';
}

function getTimezone(value) {
  const zone = value || process.env.TZ || 'Africa/Brazzaville';
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: zone });
    return zone;
  } catch {
    throw new Error('Fuseau horaire invalide. Exemple : Africa/Brazzaville ou Europe/Paris.');
  }
}

async function weatherFor(place) {
  const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geoUrl.searchParams.set('name', place);
  geoUrl.searchParams.set('count', '1');
  geoUrl.searchParams.set('language', 'fr');
  geoUrl.searchParams.set('format', 'json');
  const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(12000) });
  if (!geoResponse.ok) throw new Error('Le service de localisation météo est momentanément indisponible.');
  const geo = await geoResponse.json();
  const city = geo.results?.[0];
  if (!city) throw new Error('Ville introuvable. Essaie avec un nom de ville plus précis.');
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(city.latitude));
  forecastUrl.searchParams.set('longitude', String(city.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code');
  forecastUrl.searchParams.set('timezone', 'auto');
  const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(12000) });
  if (!forecastResponse.ok) throw new Error('Le service météo ne répond pas pour le moment.');
  const forecast = await forecastResponse.json();
  const current = forecast.current;
  if (!current) throw new Error('Aucune donnée météo actuelle disponible.');
  const descriptions = {
    0: 'Ciel dégagé', 1: 'Principalement dégagé', 2: 'Partiellement nuageux', 3: 'Couvert',
    45: 'Brouillard', 48: 'Brouillard givrant', 51: 'Bruine légère', 53: 'Bruine modérée',
    55: 'Bruine dense', 61: 'Pluie faible', 63: 'Pluie modérée', 65: 'Forte pluie',
    71: 'Neige faible', 73: 'Neige modérée', 75: 'Forte neige', 80: 'Averses faibles',
    81: 'Averses modérées', 82: 'Fortes averses', 95: 'Orage',
  };
  return [
    `🌦️ MÉTÉO — ${city.name}, ${city.country || ''}`,
    `🌡️ Température : ${current.temperature_2m} °C (ressenti ${current.apparent_temperature} °C)`,
    `☁️ Conditions : ${descriptions[current.weather_code] || 'Conditions variables'}`,
    `💧 Humidité : ${current.relative_humidity_2m}%`,
    `💨 Vent : ${current.wind_speed_10m} km/h`,
    `🕒 Mise à jour : ${current.time || 'maintenant'}`,
    'Source : Open-Meteo',
  ].join('\n');
}

async function wikipediaSearch(query) {
  const url = new URL('https://fr.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  const response = await fetch(url, { headers: { 'User-Agent': 'MHE-MD-GOLD/1.0 (WhatsApp bot)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('La recherche encyclopédique est indisponible.');
  const data = await response.json();
  const hit = data.query?.search?.[0];
  if (!hit) throw new Error('Aucun résultat trouvé.');
  const title = hit.title;
  const summaryUrl = new URL(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const summaryResponse = await fetch(summaryUrl, { headers: { 'User-Agent': 'MHE-MD-GOLD/1.0 (WhatsApp bot)' }, signal: AbortSignal.timeout(12000) });
  if (!summaryResponse.ok) throw new Error('Le résumé encyclopédique est indisponible.');
  const summary = await summaryResponse.json();
  return `📚 WIKIPÉDIA — ${title}\n\n${String(summary.extract || hit.snippet || 'Résumé indisponible.').replace(/<[^>]*>/g, '').slice(0, 2500)}\n\n${summary.content_urls?.desktop?.page || 'https://fr.wikipedia.org'}`;
}

export function registerMheEnhancements({
  register, commands, sendText, getSocket, settings, saveSettings,
  getPrefix, getMode, getBotName, getOwnerName, getVersion, getStartedAt,
  getGroupContext, requireGroup,
}) {
  register('menu', 'GENERAL', 'Open the interactive GOLD command menu', async ({ chat }) => {
    const categories = getCategories(commands);
    const count = commands.size;
    const caption = [
      '╔════════════════════════════╗',
      '       👑 M.H.E-MD GOLD 👑',
      '       GOLDEN BOT SYSTEM',
      '       ULTRA LUXURY MENU',
      '╠════════════════════════════╣',
      `👑 OWNER : ${getOwnerName()}`,
      `⚡ VERSION : ${getVersion()}`,
      `⏱️ UPTIME : ${duration(Date.now() - getStartedAt())}`,
      `📚 COMMANDS : ${count}`,
      `🔖 PREFIX : ${getPrefix()}`,
      `🔒 MODE : ${String(getMode()).toUpperCase()}`,
      '╚════════════════════════════╝',
      '',
      'Select a category below to browse commands.',
    ].join('\n');
    const socket = getSocket();
    let sentImage = false;
    try {
      const botJid = socket?.user?.id;
      if (botJid) {
        const imageUrl = await socket.profilePictureUrl(botJid, 'image');
        await socket.sendMessage(chat, { image: { url: imageUrl }, caption });
        sentImage = true;
      }
    } catch {}
    if (!sentImage) await sendText(chat, caption);
    const rows = categories.slice(0, 10).map(([category, items], index) => ({
      title: displayCategory(category).slice(0, 24),
      description: `${items.length} command(s) — open category`.slice(0, 72),
      rowId: `mhecat:${index}`,
    }));
    if (socket && rows.length) {
      try {
        await socket.sendMessage(chat, {
          text: '👑 M.H.E GOLD — COMMAND CENTER',
          footer: 'HORDAIN MADILA • GOLDEN BOT SYSTEM',
          title: 'COMMAND CATEGORIES',
          buttonText: 'OPEN MENU',
          sections: [{ title: 'AVAILABLE CATEGORIES', rows }],
        });
      } catch (error) {
        await sendText(chat, 'Interactive menu is not supported by this WhatsApp client. Use .menucat 1 to open the first category.');
      }
    }
  });

  register('menucat', 'GENERAL', 'Open a category from the interactive menu', async ({ chat, args }) => {
    const categories = getCategories(commands);
    const index = Number(args[0]);
    if (!Number.isInteger(index) || index < 0 || index >= categories.length) {
      const names = categories.map(([name], i) => `${i + 1}. ${name}`).join('\n');
      await sendText(chat, `Choose a category number:\n${names}\n\nUse ${getPrefix()}menucat 1`);
      return;
    }
    const [category, items] = categories[index];
    const lines = items.map((item) => `• ${getPrefix()}${item.name} — ${item.description || 'No description'}`);
    await sendText(chat, `👑 M.H.E GOLD — ${displayCategory(category)}\n\n${lines.join('\n')}\n\nTotal: ${items.length} command(s)\nUse ${getPrefix()}menu to return.`);
  });

  register('searchcmd', 'GENERAL', 'Search registered commands by name or description', async ({ chat, args }) => {
    const query = args.join(' ').trim().toLowerCase();
    if (!query) throw new Error(`Usage: ${getPrefix()}searchcmd <keyword>`);
    const found = [...commands.values()].filter((item) =>
      item.name.toLowerCase().includes(query)
      || String(item.description || '').toLowerCase().includes(query)
      || String(item.category || '').toLowerCase().includes(query)
    ).slice(0, 20);
    await sendText(chat, found.length
      ? `🔎 COMMAND SEARCH — ${found.length} result(s)\n\n${found.map((item) => `• ${getPrefix()}${item.name} — ${item.description || item.category}`).join('\n')}`
      : `No command found for “${query}”.`);
  });

  register('stats', 'SYSTEM', 'Show live bot and process statistics', async ({ chat }) => {
    const memory = process.memoryUsage();
    const socket = getSocket();
    const lines = [
      '📊 M.H.E GOLD — LIVE SYSTEM',
      `Status : ${socket?.user ? 'WHATSAPP CONNECTED' : 'WAITING FOR CONNECTION'}`,
      `Mode : ${String(getMode()).toUpperCase()}`,
      `Commands : ${commands.size}`,
      `Uptime : ${duration(Date.now() - getStartedAt())}`,
      `Memory RSS : ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
      `Heap used : ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      `Platform : ${process.platform} / ${process.arch}`,
      `Node.js : ${process.version}`,
      `CPU cores : ${os.cpus().length}`,
      `System memory : ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
    ];
    await sendText(chat, lines.join('\n'));
  });

  register('time', 'UTILITIES', 'Show the current time in a timezone', async ({ chat, args }) => {
    const zone = getTimezone(args[0]);
    const value = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date());
    await sendText(chat, `🕒 Current time — ${zone}\n${value}`);
  });

  register('date', 'UTILITIES', 'Show the current date in a timezone', async ({ chat, args }) => {
    const zone = getTimezone(args[0]);
    const value = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
    await sendText(chat, `📅 Current date — ${zone}\n${value}`);
  });

  register('weather', 'SEARCH', 'Get current weather for a city', async ({ chat, args }) => {
    const place = args.join(' ').trim();
    if (!place || place.length > 100) throw new Error(`Usage: ${getPrefix()}weather <city>`);
    await sendText(chat, '🌦️ Fetching current weather…');
    await sendText(chat, await weatherFor(place));
  });

  register('wiki', 'SEARCH', 'Search the French Wikipedia', async ({ chat, args }) => {
    const query = args.join(' ').trim();
    if (!query || query.length > 120) throw new Error(`Usage: ${getPrefix()}wiki <topic>`);
    await sendText(chat, '📚 Searching Wikipedia…');
    await sendText(chat, await wikipediaSearch(query));
  });

  for (const [alias, target, description] of [
    ['setprefix', 'prefix', 'Change the command prefix'],
    ['setbotname', 'botname', 'Change the bot display name'],
    ['setownername', 'ownername', 'Change the displayed owner name'],
    ['setmode', 'mode', 'Set bot access mode: private or public'],
  ]) {
    register(alias, 'OWNER', description, async (context) => {
      const command = commands.get(target);
      if (!command) throw new Error('Target command is unavailable.');
      await command.handler(context);
    }, true);
  }

  settings.todos ||= {};
  register('todo', 'PRODUCTIVITY', 'Manage your personal task list: add, list, done, clear', async ({ chat, actor, args }) => {
    const action = (args[0] || 'list').toLowerCase();
    const key = safeKey(actor);
    settings.todos[key] ||= [];
    const list = settings.todos[key];
    if (action === 'add') {
      const task = args.slice(1).join(' ').trim();
      if (!task || task.length > 180) throw new Error(`Usage: ${getPrefix()}todo add <task> (max 180 characters)`);
      if (list.length >= 30) throw new Error('Your task list is full (30 tasks). Complete or clear some tasks first.');
      list.push({ text: task, done: false, createdAt: Date.now() });
      await saveSettings();
      await sendText(chat, `✅ Task added (#${list.length}): ${task}`);
      return;
    }
    if (action === 'done') {
      const index = Number(args[1]) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error(`Usage: ${getPrefix()}todo done <number>`);
      list[index].done = true;
      await saveSettings();
      await sendText(chat, `✅ Completed: ${list[index].text}`);
      return;
    }
    if (action === 'clear') {
      settings.todos[key] = [];
      await saveSettings();
      await sendText(chat, '🧹 Your task list has been cleared.');
      return;
    }
    if (action !== 'list') throw new Error(`Usage: ${getPrefix()}todo add <task> | done <number> | list | clear`);
    await sendText(chat, list.length
      ? `📝 YOUR TASKS\n\n${list.map((item, i) => `${i + 1}. [${item.done ? 'x' : ' '}] ${item.text}`).join('\n')}`
      : 'Your task list is empty. Use .todo add <task>.');
  });

  settings.notes ||= {};
  register('note', 'PRODUCTIVITY', 'Save, list or delete your personal notes', async ({ chat, actor, args }) => {
    const action = (args[0] || 'list').toLowerCase();
    const key = safeKey(actor);
    settings.notes[key] ||= [];
    const notes = settings.notes[key];
    if (action === 'save') {
      const content = args.slice(1).join(' ').trim();
      if (!content || content.length > 500) throw new Error(`Usage: ${getPrefix()}note save <text> (max 500 characters)`);
      if (notes.length >= 20) throw new Error('You have reached the 20-note limit.');
      notes.push({ text: content, createdAt: Date.now() });
      await saveSettings();
      await sendText(chat, `📌 Note saved as #${notes.length}.`);
      return;
    }
    if (action === 'delete') {
      const index = Number(args[1]) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= notes.length) throw new Error(`Usage: ${getPrefix()}note delete <number>`);
      notes.splice(index, 1);
      await saveSettings();
      await sendText(chat, '🗑️ Note deleted.');
      return;
    }
    if (action !== 'list') throw new Error(`Usage: ${getPrefix()}note save <text> | list | delete <number>`);
    await sendText(chat, notes.length
      ? `📒 YOUR NOTES\n\n${notes.map((item, i) => `${i + 1}. ${item.text}`).join('\n\n')}`
      : 'You have no saved notes. Use .note save <text>.');
  });

  register('groupinfo', 'GROUPS', 'Show information about the current group', async ({ chat }) => {
    requireGroup(chat);
    const metadata = await getSocket().groupMetadata(chat);
    await sendText(chat, [
      `👥 GROUP — ${metadata.subject || 'Unnamed'}`,
      `Members : ${metadata.participants?.length || 0}`,
      `Created : ${metadata.creation ? new Date(metadata.creation * 1000).toLocaleString('en-GB') : 'Unknown'}`,
      `Description : ${metadata.desc || 'No description'}`,
    ].join('\n'));
  });

  register('members', 'GROUPS', 'List group members (first 50)', async ({ chat }) => {
    requireGroup(chat);
    const metadata = await getSocket().groupMetadata(chat);
    const participants = (metadata.participants || []).slice(0, 50);
    const mentions = participants.map((item) => item.id).filter(Boolean);
    const lines = participants.map((item, index) => {
      const role = item.admin || item.isAdmin || item.isSuperAdmin ? '👑 ADMIN' : '• MEMBER';
      return `${index + 1}. ${role} @${String(item.id || '').split('@')[0].split(':')[0]}`;
    });
    await sendText(chat, `👥 MEMBERS — ${metadata.subject || 'GROUP'}\nShowing ${participants.length} of ${metadata.participants?.length || 0}\n\n${lines.join('\n')}`, { mentions });
  });

  register('admins', 'GROUPS', 'List administrators of the current group', async ({ chat }) => {
    requireGroup(chat);
    const metadata = await getSocket().groupMetadata(chat);
    const admins = (metadata.participants || []).filter((item) => item.admin || item.isAdmin || item.isSuperAdmin);
    const mentions = admins.map((item) => item.id).filter(Boolean);
    const lines = admins.map((item, index) => `${index + 1}. 👑 @${String(item.id || '').split('@')[0].split(':')[0]}`);
    await sendText(chat, lines.length
      ? `👑 GROUP ADMINS — ${metadata.subject || 'GROUP'}\\n\\n${lines.join('\\n')}`
      : 'No group administrators were returned by WhatsApp.', { mentions });
  });

  register('setrules', 'GROUPS', 'Set the rules for this group (admins only)', async ({ chat, actor, args }) => {
    requireGroup(chat);
    const context = await getGroupContext(chat, actor);
    if (!context.actorIsAdmin) throw new Error('Only group admins can change group rules.');
    const rules = args.join(' ').trim();
    if (!rules || rules.length > 1500) throw new Error(`Usage: ${getPrefix()}setrules <rules> (max 1500 characters)`);
    settings.groups ||= {};
    settings.groups[chat] ||= {};
    settings.groups[chat].rules = rules;
    await saveSettings();
    await sendText(chat, '✅ Group rules saved.');
  });

  register('rules', 'GROUPS', 'Show the rules for this group', async ({ chat }) => {
    requireGroup(chat);
    const rules = settings.groups?.[chat]?.rules;
    await sendText(chat, rules ? `📜 GROUP RULES\n\n${rules}` : `No rules saved. An admin can set them with ${getPrefix()}setrules <rules>.`);
  });
}
