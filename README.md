# M.H.E-MD GOLD — WhatsApp Bot

M.H.E-MD GOLD is a WhatsApp multi-device bot project. It uses pairing codes only; the web page does not display a QR code.

## Current implemented commands

The GOLD menu uses the registered command handlers dynamically: every command registered during startup is listed by category, and the count reflects the actual registry rather than an unverified total from another bot.

- General: `.menu`, `.help`, `.ping`, `.alive`, `.owner`, `.uptime`, `.botinfo`, `.chatid`
- Text/fun: `.reverse`, `.choose`, `.dice`, `.coin`
- Fonts: `.font 1 ton texte` et `.font1` à `.font12` (12 transformations Unicode réellement codées)
- Tools: `.fancy`, `.hashtag`, `.boost`, `.flag` et les alias image `.remini`, `.removebg`, `.blur`, etc. Les transformations texte sont implémentées; les traitements d'image et captures nécessitent encore un fournisseur externe configuré.
- Group Gold: `.tagall`, `.everyone`, `.hidetag`, `.tag`, `.kick`, `.add`, `.promote`, `.demote`, `.mute`, `.unmute`, `.link`, `.revoke`, `.ginfo`, `.setdesc`, `.setname`, `.poll`, `.requests`, `.acceptall`, `.rejectall`, `.del`, `.out`. Les actions administratives vérifient les droits du membre et ceux du bot; certaines options dépendent des capacités de WhatsApp.
- Owner Gold: `.mode`, `.prefix`, `.botname`, `.ownername`, `.sudo`, `.delsudo`, `.listsudo`, `.ban`, `.unban`, `.banlist`, `.welcome`, `.goodbye`, `.setwelcome`, `.setgoodbye`, `.antilink`, `.autoread`, `.autoreact` et `.settings`. Les réglages sont persistés dans `data/settings.json`; seuls les réglages déjà reliés au gestionnaire affectent automatiquement le comportement du bot.
- Download: `.download`, `.play`, `.video`, `.tiktok`, `.fb`, `.ig`, `.apk`, `.mediafire` et autres alias enregistrés. Les liens directs sont transmis si compatibles; les téléchargements des plateformes sociales nécessitent encore un fournisseur API documenté et ne sont pas annoncés comme fonctionnels.
- Owner: `.mode private`, `.mode public`
- Group admin: `.tagall`, `.kick`, `.promote`, `.demote`, `.welcome on/off`, `.goodbye on/off`

Group moderation commands check both the actor's group-admin status and whether M.H.E. itself is a group admin. Additional command families should be added as tested modules; commands requiring third-party APIs need the relevant API credentials.

## Run

Requires Node.js 20 or 22.

```sh
npm install
npm start
```

Set environment variables in the hosting provider's secret-variable settings, not in committed files:

- `PORT` — supplied automatically by most hosts
- `BOT_NAME=M.H.E-MD GOLD`
- `PREFIX=.`
- `BOT_MODE=private` (default)
- `OWNER_NUMBERS=` — optional comma-separated trusted numbers, digits only
- `SESSION_DIR=/app/sessions` — use a persistent volume in production
- `SETTINGS_FILE=/app/data/settings.json`
- `SUPABASE_URL` — URL HTTPS du projet Supabase (facultatif, mais nécessaire pour la sauvegarde distante).
- `SUPABASE_SERVICE_ROLE_KEY` — clé secrète serveur du projet Supabase; ne jamais la mettre dans le navigateur ou le dépôt.
- `MHE_SESSION_ENCRYPTION_KEY` — clé de chiffrement base64 de 32 octets, générée avec `openssl rand -base64 32`; conserve-la séparément et ne la perds pas.
- `MHE_SESSION_BUCKET=mhe-sessions` — bucket privé de stockage des fichiers de session (à créer dans Supabase Storage).
- `MHE_SESSION_PREFIX=mhe/` — dossier logique réservé à la session MHE dans ce bucket.

### Sauvegarde durable de la session WhatsApp

Render Free ne conserve pas les fichiers locaux après un redéploiement ou un redémarrage. Pour éviter de perdre l'appairage, crée un bucket **privé** nommé `mhe-sessions` dans Supabase Storage, puis ajoute `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `MHE_SESSION_ENCRYPTION_KEY` dans les variables secrètes du service Render MHE-GOLD. Génère cette dernière avec `openssl rand -base64 32` et conserve une copie sécurisée : sans elle, les sauvegardes chiffrées ne pourront pas être restaurées. Le bot restaure les fichiers JSON avant de démarrer Baileys, sauvegarde les changements et synchronise les fichiers toutes les 15 secondes. En l'absence de ces trois variables, il fonctionne en mode local uniquement et l'endpoint `/health` indique `sessionPersistence: local-only`. Après une déconnexion explicitement signalée par WhatsApp, les fichiers distants de ce préfixe sont effacés pour permettre un nouvel appairage.

Utilise un projet Supabase dédié à MHE et garde le bucket privé. La clé `service_role` est hautement privilégiée : ne la partage pas et ne la colle jamais dans le site web.

The web interface is served from `index.html`. `POST /api/pair` requests a pairing code and has a cooldown. The code is returned only in the HTTP response and is not deliberately printed to logs. Keep the hosting dashboard and session volume private.

## Important security note

Never commit a real `.env`, WhatsApp session files, pairing codes, API keys, or credentials. If any secret was ever committed to a public repository, deleting the file is not enough: rotate the secret because it may remain in Git history.

## Erfan MD feature parity

This repository is not yet a complete copy of every command shown by Erfan MD. The public reference describes broad command categories and notes that availability depends on the actual bot and server configuration. M.H.E. will add compatible features in tested batches and show only commands that are implemented.


## Next command batch

Implemented in source (runtime deployment not yet verified): uptime, bot info, chat ID, text reversal, random choice, dice and coin toss. These are local utilities and do not require third-party API credentials.

## M.H.E GOLD V2 — branche de fonctionnalité

Les commandes suivantes sont ajoutées dans la branche de travail et restent désactivées ou dépendantes d’une configuration :

- `.mheai on`, `.mheai off`, `.mheai status` — assistant IA pour les messages privés. L’activation est réservée au propriétaire; les messages traités sont transmis au fournisseur IA configuré. Limites : 30 secondes entre deux réponses par contact et 12 réponses par contact par jour.
- `.mheai message <instruction>` — personnaliser le prompt de l’assistant.
- `.mheghost 10 ton message` — envoie un message que le bot tente de supprimer après 5 à 60 secondes. WhatsApp ne peut pas empêcher les captures d’écran, copies ou transferts.
- `.mheclone vocal <texte>` — génère une voix synthétique originale. Le bot annonce explicitement qu’il s’agit d’une voix générée par IA; cette commande n’imite pas la voix d’une personne réelle.

Variables secrètes facultatives pour l’IA :
- `MHE_AI_API_KEY` (ou `OPENAI_API_KEY`) — clé du fournisseur IA.
- `MHE_AI_BASE_URL` — racine d’une API compatible avec le format Chat Completions; par défaut l’API OpenAI.
- `MHE_AI_MODEL` — modèle à utiliser; par défaut `gpt-4o-mini`.

Variables secrètes pour la voix synthétique :
- `MHE_TTS_API_KEY` — clé audio, ou réutilisation de la clé IA.
- `MHE_TTS_BASE_URL` — racine de l’API de synthèse vocale.
- `MHE_TTS_MODEL` — nom explicite d’un modèle de synthèse vocale encore pris en charge; requis pour éviter de choisir automatiquement un modèle en fin de vie.
- `MHE_TTS_VOICE` — voix synthétique intégrée, par défaut `coral`.

N’ajoute jamais les clés API au dépôt. Les messages envoyés à l’assistant IA quittent WhatsApp et sont transmis au fournisseur configuré; n’active cette fonction que si cela convient aux personnes qui l’utilisent. La commande vocale reste indisponible tant qu’un modèle TTS actuellement pris en charge n’est pas configuré. Vérifie la documentation du fournisseur avant l’activation en production.

Ces changements sont en cours de revue dans une pull request. Ils ne sont pas encore fusionnés ni déclarés déployés.


## GOLD Command Center — interactive menu and English utilities

The `feature/mhe-gold-ultimate-menu` branch adds a category selector to `.menu` using Baileys interactive list messages, with a text fallback for clients that do not support the interactive payload. Selecting a category opens its live command list from the command registry. The message handler accepts list, button, and template-button response IDs for category navigation.

New commands in this branch:

- General/system: `.menucat`, `.searchcmd`, `.stats`
- Utilities: `.time [IANA timezone]`, `.date [IANA timezone]`
- Search: `.weather <city>` (Open-Meteo), `.wiki <topic>` (French Wikipedia)
- Productivity: `.todo add|list|done|clear`, `.note save|list|delete`
- Groups: `.groupinfo`, `.members`, `.setrules`, `.rules`

Task lists and notes are stored separately per WhatsApp sender in the existing settings file. Limits are applied to prevent unbounded growth. Weather and encyclopedia lookups use fixed public API hosts and request timeouts. These additions do not require new API keys. They are source changes only until tests pass and a deployment is performed.


## M.H.E GOLD Control Center

The owner dashboard is available at `/control`. It displays the live WhatsApp connection state, process uptime and memory, the real command registry, command categories, and runtime configuration. The command catalogue supports search and category filtering. The dashboard is read-only; it does not expose destructive actions or WhatsApp session material.

Before opening it in production, add `CONTROL_PANEL_TOKEN` to the Render service's secret environment variables. Use a randomly generated value of at least 24 characters, keep it private, and never commit it to Git. The dashboard asks for this token and keeps it in the browser session only. The status API returns HTTP 503 until the token is configured and HTTP 401 for an invalid token.


## M.H.E GOLD — parrainage

La page responsive noir et or est servie sur `/parrainage`. Elle permet de créer un code personnel, de partager un lien `/r/CODE`, puis de consulter les visites et les parrainages validés. Les visites ne prouvent pas qu'une personne a rejoint WhatsApp : l'équipe doit confirmer les parrainages avant de les compter comme validés. Aucune récompense automatique n'est attribuée par cette version.

### Configuration requise

1. Dans le projet Supabase utilisé par M.H.E, ouvre SQL Editor et exécute une fois `supabase/referrals.sql`.
2. Dans Render, configure `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` pour le bot. Dans les variables d’environnement du projet Vercel du site, configure aussi ces deux valeurs pour ses fonctions API. La clé `service_role` reste secrète et ne doit jamais être exposée dans le navigateur ni ajoutée au dépôt.
3. Pour utiliser l’endpoint de validation manuelle, configure aussi `CONTROL_PANEL_TOKEN` côté hébergement. Le nombre de parrainages validés doit être confirmé par l’équipe M.H.E.
4. Déploie le dépôt à sa racine sur Vercel, puis vérifie `/parrainage`, la création d’un code et une visite via `/r/CODE`.

La page peut s’afficher sans Supabase, mais la création de liens et les statistiques renvoient une erreur explicite tant que la table n’est pas créée ou que les variables ne sont pas configurées. L’API Vercel utilise les fonctions de `api/`; `vercel.json` route `/parrainage` vers la page et `/r/CODE` vers le suivi.
