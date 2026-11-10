import os from 'node:os';

function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds % 60}s`].filter(Boolean).join(' ');
}

const CATEGORY_ORDER = ['OWNER', 'BOT', 'GROUP', 'AI', 'DOWNLOADER', 'CONVERTER', 'TOOLS', 'GAMES & FUN', 'OTHER'];

function normalizeCategory(category = '') {
  const value = String(category).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (['OWNER', 'PROPRIETAIRE', 'PROPRIÉTAIRE'].includes(value)) return 'OWNER';
  if (['GENERAL', 'SYSTEM', 'UTILITIES', 'SEARCH', 'PRODUCTIVITY', 'BOT'].includes(value)) return 'BOT';
  if (['GROUP', 'GROUPS', 'GROUPES', 'GROUPE MANAGER'].includes(value)) return 'GROUP';
  if (['AI', 'AI & INTELLIGENCE', 'M.H.E GOLD V2'].includes(value)) return 'AI';
  if (['DOWNLOADER', 'DOWNLOADS', 'TELECHARGEMENT'].includes(value)) return 'DOWNLOADER';
  if (['CONVERTER', 'CONVERTERS', 'CONVERSION'].includes(value)) return 'CONVERTER';
  if (['TOOLS', 'OUTILS', 'TEXT', 'TEXT / FONTS', 'TEXTE', 'TEXTE / POLICES'].includes(value)) return 'TOOLS';
  if (['FUN', 'GAMES', 'GAMES & FUN'].includes(value)) return 'GAMES & FUN';
  return 'OTHER';
}

function displayCategory(category) {
  const labels = {
    OWNER: '👑 OWNER',
    BOT: '🤖 BOT',
    GROUP: '👥 GROUP MANAGER',
    AI: '🧠 AI',
    DOWNLOADER: '⬇️ DOWNLOADER',
    CONVERTER: '🔄 CONVERTER',
    TOOLS: '🛠️ TOOLS',
    'GAMES & FUN': '🎮 GAMES & FUN',
    OTHER: '📦 OTHER',
  };
  return labels[category] || labels.OTHER;
}

function getCategories(commands) {
  const categories = new Map(CATEGORY_ORDER.filter((category) => category !== 'OTHER').map((category) => [category, []]));
  for (const command of commands.values()) {
    const category = normalizeCategory(command.category || 'OTHER');
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(command);
  }
  return [...categories.entries()].sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
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


const aiCommandCooldowns = new Map();

async function requestMheAI(prompt, instruction = 'Réponds clairement en français, sauf si la demande est dans une autre langue.') {
  const apiKey = process.env.MHE_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Configure MHE_AI_API_KEY ou OPENAI_API_KEY dans les variables secrètes de Render pour activer les commandes IA.');
  const endpoint = (process.env.MHE_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.MHE_AI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: instruction }, { role: 'user', content: prompt.slice(0, 3500) }],
      max_tokens: 650,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Le fournisseur IA a répondu HTTP ${response.status}. Vérifie la clé et les paramètres API.`);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Le fournisseur IA a renvoyé une réponse vide.');
  return answer.trim().slice(0, 3500);
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
      'Choisis une catégorie pour afficher ses commandes.',
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
    const categoryLines = categories.map(([category, items], index) =>
      `${index + 1}. ${displayCategory(category)} — ${items.length} commande(s)`
    );
    await sendText(chat, [
      '👑 M.H.E GOLD — MENU DES COMMANDES',
      `📚 Total réel : ${count} commande(s)`,
      '',
      ...categoryLines,
      '',
      `Pour ouvrir une catégorie : ${getPrefix()}menucat numéro`,
      `Pour chercher une commande : ${getPrefix()}searchcmd mot-clé`,
    ].join('\n'));

    const rows = categories.slice(0, 10).map(([category, items], index) => ({
      title: displayCategory(category).slice(0, 24),
      description: `${items.length} commande(s) — ouvrir`.slice(0, 72),
      rowId: `mhecat:${index + 1}`,
    }));
    if (socket && rows.length) {
      try {
        await socket.sendMessage(chat, {
          text: '👑 M.H.E GOLD — COMMAND CENTER',
          footer: 'HORDAIN MADILA • GOLDEN BOT SYSTEM',
          title: 'CATÉGORIES DISPONIBLES',
          buttonText: 'OUVRIR LE MENU',
          sections: [{ title: 'CHOISIR UNE CATÉGORIE', rows }],
        });
      } catch (error) {
        await sendText(chat, `Le menu interactif n’est pas disponible. Utilise ${getPrefix()}menucat 1 pour ouvrir la première catégorie.`);
      }
    }
  });

  register('menucat', 'GENERAL', 'Afficher une catégorie : .menucat numéro [page]', async ({ chat, args }) => {
    const categories = getCategories(commands);
    const index = Number(args[0]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= categories.length) {
      const names = categories.map(([name], i) => `${i + 1}. ${displayCategory(name)}`).join('\n');
      await sendText(chat, `Choisis un numéro de catégorie :\n${names}\n\nUtilise ${getPrefix()}menucat 1`);
      return;
    }
    const [category, items] = categories[index];
    const pageSize = 25;
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Number(args[1] || 1);
    if (!Number.isInteger(page) || page < 1 || page > pages) {
      throw new Error(`Page invalide. Utilise ${getPrefix()}menucat ${index + 1} 1 à ${pages}.`);
    }
    if (!items.length) {
      const notes = category === 'DOWNLOADER'
        ? 'Le fournisseur de téléchargement n’est pas encore configuré. Aucune commande de téléchargement n’est annoncée comme fonctionnelle.'
        : 'Aucune commande active dans cette catégorie pour le moment.';
      await sendText(chat, `👑 M.H.E GOLD — ${displayCategory(category)}\n\n${notes}\n\nRetour : ${getPrefix()}menu`);
      return;
    }
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
    const lines = pageItems.map((item) => `• ${getPrefix()}${item.name}${item.ownerOnly ? ' 🔒 PROPRIÉTAIRE' : ''} — ${item.description || 'Description indisponible'}`);
    const next = page < pages ? `\nPage suivante : ${getPrefix()}menucat ${index + 1} ${page + 1}` : '';
    await sendText(chat, `👑 M.H.E GOLD — ${displayCategory(category)}\n📄 Page ${page}/${pages}\n\n${lines.join('\n')}\n\nTotal : ${items.length} commande(s)${next}\n\nRetour : ${getPrefix()}menu`);
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

  register('help', 'GENERAL', 'Afficher l’aide générale ou celle d’une commande', async ({ chat, args }) => {
    const requested = (args[0] || '').toLowerCase().replace(/^\\./, '');
    if (!requested) {
      await sendText(chat, `👑 M.H.E GOLD — AIDE\n\n• ${getPrefix()}menu : afficher les catégories\n• ${getPrefix()}menucat numéro : ouvrir une catégorie\n• ${getPrefix()}searchcmd mot-clé : rechercher une commande\n• ${getPrefix()}help commande : afficher l’aide d’une commande`);
      return;
    }
    const command = commands.get(requested);
    if (!command) throw new Error(`Commande inconnue : ${getPrefix()}${requested}. Utilise ${getPrefix()}searchcmd ${requested}.`);
    await sendText(chat, `📖 AIDE — ${getPrefix()}${command.name}\nCatégorie : ${displayCategory(normalizeCategory(command.category))}\nAccès : ${command.ownerOnly ? 'propriétaire uniquement 🔒' : 'selon les règles du groupe et du mode du bot'}\nDescription : ${command.description || 'Aucune description disponible'}`);
  });

  register('upper', 'CONVERTER', 'Convertir un texte en majuscules : .upper texte', async ({ chat, args }) => {
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${getPrefix()}upper texte`);
    await sendText(chat, value.toLocaleUpperCase('fr-FR'));
  });

  register('lower', 'CONVERTER', 'Convertir un texte en minuscules : .lower texte', async ({ chat, args }) => {
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${getPrefix()}lower texte`);
    await sendText(chat, value.toLocaleLowerCase('fr-FR'));
  });

  register('base64', 'CONVERTER', 'Encoder ou décoder du texte : .base64 encode|decode texte', async ({ chat, args }) => {
    const action = (args[0] || '').toLowerCase();
    const value = args.slice(1).join(' ').trim();
    if (!['encode', 'decode'].includes(action) || !value || value.length > 3000) {
      throw new Error(`Utilise ${getPrefix()}base64 encode Bonjour ou ${getPrefix()}base64 decode Qm9uam91cg==`);
    }
    if (action === 'encode') {
      await sendText(chat, Buffer.from(value, 'utf8').toString('base64'));
      return;
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
      throw new Error('Texte Base64 invalide.');
    }
    await sendText(chat, Buffer.from(value, 'base64').toString('utf8'));
  });

  register('urlencode', 'CONVERTER', 'Encoder un texte pour une URL : .urlencode texte', async ({ chat, args }) => {
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${getPrefix()}urlencode texte`);
    await sendText(chat, encodeURIComponent(value));
  });

  register('urldecode', 'CONVERTER', 'Décoder un texte encodé pour une URL : .urldecode texte', async ({ chat, args }) => {
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${getPrefix()}urldecode texte`);
    try {
      await sendText(chat, decodeURIComponent(value));
    } catch {
      throw new Error('Texte URL invalide.');
    }
  });

  register('auto', 'GENERAL', 'Activer ou désactiver la réaction automatique du bot', async ({ chat, args }) => {
    const action = (args[0] || 'status').toLowerCase();
    if (action === 'status') {
      await sendText(chat, `⚡ Réaction automatique : ${settings.autoreact === false ? 'désactivée' : 'activée'}.`);
      return;
    }
    if (!['on', 'off'].includes(action)) throw new Error(`Utilise ${getPrefix()}auto on, off ou status.`);
    settings.autoreact = action === 'on';
    await saveSettings();
    await sendText(chat, `⚡ Réaction automatique ${settings.autoreact ? 'activée' : 'désactivée'}.`);
  }, true);



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
  register('mhestat', 'SYSTEM', 'Alias de .stats : statistiques système en direct', async (context) => {
    await commands.get('stats').handler(context);
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


  for (const [alias, instruction, usage] of [
    ['ai', 'Réponds comme un assistant utile et précis.', 'question'],
    ['ask', 'Réponds directement à la question de l’utilisateur.', 'question'],
    ['explain', 'Explique simplement, étape par étape, avec un exemple si utile.', 'notion à expliquer'],
    ['summarize', 'Résume fidèlement le texte fourni en conservant les idées essentielles.', 'texte à résumer'],
    ['code', 'Aide à écrire ou comprendre du code. Donne une solution claire et explique les choix.', 'question de programmation'],
  ]) {
    register(alias, 'AI & INTELLIGENCE', `Assistant IA : .${alias} ${usage}`, async ({ chat, actor, args }) => {
      const prompt = args.join(' ').trim();
      if (!prompt || prompt.length > 3500) throw new Error(`Utilise ${getPrefix()}${alias} ${usage} (3500 caractères maximum).`);
      const now = Date.now();
      const previous = aiCommandCooldowns.get(actor) || 0;
      if (now - previous < 8000) throw new Error('Attends quelques secondes avant une nouvelle demande IA.');
      aiCommandCooldowns.set(actor, now);
      await sendText(chat, '🤖 M.H.E AI traite ta demande…');
      const answer = await requestMheAI(prompt, instruction);
      await sendText(chat, `🤖 M.H.E AI — ${alias.toUpperCase()}\n\n${answer}`);
    });
  }

  register('translate', 'AI & INTELLIGENCE', 'Traduire : .translate langue cible | texte', async ({ chat, actor, args }) => {
    const separator = args.indexOf('|');
    const targetLanguage = (separator >= 0 ? args.slice(0, separator) : args.slice(0, 1)).join(' ').trim();
    const sourceText = (separator >= 0 ? args.slice(separator + 1) : args.slice(1)).join(' ').trim();
    if (!targetLanguage || !sourceText || sourceText.length > 3000) {
      throw new Error(`Utilise ${getPrefix()}translate anglais | Bonjour, comment vas-tu ?`);
    }
    const now = Date.now();
    const previous = aiCommandCooldowns.get(actor) || 0;
    if (now - previous < 8000) throw new Error('Attends quelques secondes avant une nouvelle demande IA.');
    aiCommandCooldowns.set(actor, now);
    await sendText(chat, '🌍 Traduction en cours…');
    const answer = await requestMheAI(sourceText, `Traduis fidèlement le texte en ${targetLanguage}. Retourne uniquement la traduction, sans commentaire.`);
    await sendText(chat, `🌍 Traduction — ${targetLanguage}\n\n${answer}`);
  });

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

  for (const [name, setting, label] of [
    ['antilink', 'antilink', 'anti-liens'],
    ['antispam', 'antispam', 'anti-spam'],
    ['antitag', 'antitag', 'anti-mentions massives'],
    ['antistatusmention', 'antistatusmention', 'anti-mentions de statut'],
  ]) {
    register(name, 'GROUPS', `Activer ou désactiver ${label} : .${name} on/off/status`, async ({ chat, actor, args }) => {
      requireGroup(chat);
      const context = await getGroupContext(chat, actor);
      if (!context.actorIsAdmin) throw new Error('⛔ Cette commande est réservée aux administrateurs du groupe.');
      settings.groups ||= {};
      settings.groups[chat] ||= {};
      const group = settings.groups[chat];
      const action = (args[0] || 'status').toLowerCase();
      if (action === 'status') {
        await sendText(chat, `🛡️ ${label} : ${group[setting] ? 'activé' : 'désactivé'}.`);
        return;
      }
      if (!['on', 'off'].includes(action)) throw new Error(`Utilise .${name} on, off ou status.`);
      group[setting] = action === 'on';
      await saveSettings();
      await sendText(chat, `🛡️ ${label} ${group[setting] ? 'activé' : 'désactivé'} dans ce groupe.`);
    });
  }

  register('kick', 'GROUPS', 'Retirer un membre (admin du groupe, mention ou réponse)', async ({ chat, actor, message }) => {
    requireGroup(chat);
    const context = await getGroupContext(chat, actor);
    if (!context.actorIsAdmin) throw new Error('⛔ Seuls les administrateurs du groupe peuvent retirer un membre.');
    if (!context.botIsAdmin) throw new Error('⚠️ M.H.E doit être administrateur pour retirer un membre.');
    const info = message?.message?.extendedTextMessage?.contextInfo || {};
    const targets = [...new Set([...(info.mentionedJid || []), ...(info.participant ? [info.participant] : [])])];
    if (targets.length !== 1) throw new Error(`Mentionne un seul membre ou réponds à son message : ${getPrefix()}kick @membre`);
    const target = targets[0];
    const numberOf = (jid = '') => String(jid).split('@')[0].split(':')[0].replace(/\\D/g, '');
    const targetNumber = numberOf(target);
    const targetInfo = context.participants?.find((item) => numberOf(item.id || item.jid) === targetNumber);
    const botNumber = numberOf(getSocket()?.user?.id || '');
    if (targetNumber && botNumber && targetNumber === botNumber) {
      throw new Error('⛔ M.H.E ne peut pas se retirer lui-même du groupe.');
    }
    if (targetInfo?.admin || targetInfo?.isAdmin || targetInfo?.isSuperAdmin) {
      throw new Error('⛔ M.H.E ne peut pas retirer un administrateur du groupe.');
    }
    await getSocket().groupParticipantsUpdate(chat, [target], 'remove');
    await sendText(chat, `✅ Demande de retrait envoyée pour @${target.split('@')[0]}.`, { mentions: [target] });
  });

  for (const [name, setting, success] of [
    ['lockgc', 'announcement', '🔒 Groupe fermé : seuls les administrateurs peuvent envoyer des messages.'],
    ['unlockgc', 'not_announcement', '🔓 Groupe ouvert : tous les membres peuvent envoyer des messages.'],
  ]) {
    register(name, 'GROUPS', name === 'lockgc' ? 'Réserver les messages aux administrateurs' : 'Autoriser tous les membres à envoyer des messages', async ({ chat, actor }) => {
      requireGroup(chat);
      const context = await getGroupContext(chat, actor);
      if (!context.actorIsAdmin) throw new Error('⛔ Cette commande est réservée aux administrateurs du groupe.');
      if (!context.botIsAdmin) throw new Error('⚠️ M.H.E doit être administrateur pour modifier les paramètres du groupe.');
      await getSocket().groupSettingUpdate(chat, setting);
      await sendText(chat, success);
    });
  }

}
