# M.H.E. — WhatsApp Bot

M.H.E. is a separate WhatsApp multi-device bot project. It uses pairing codes only; the web page does not display a QR code.

## Current implemented commands

The menu count is calculated from the registered command handlers; it is not a claimed total for every Erfan MD command.

- General: `.menu`, `.help`, `.ping`, `.alive`, `.owner`, `.uptime`, `.botinfo`, `.chatid`
- Text/fun: `.reverse`, `.choose`, `.dice`, `.coin`
- Fonts: `.font 1 ton texte` et `.font1` à `.font12` (12 transformations Unicode réellement codées)
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
- `BOT_NAME=M.H.E.`
- `PREFIX=.`
- `BOT_MODE=private` (default)
- `OWNER_NUMBERS=` — optional comma-separated trusted numbers, digits only
- `SESSION_DIR=/app/sessions` — use a persistent volume in production
- `SETTINGS_FILE=/app/data/settings.json`

The web interface is served from `index.html`. `POST /api/pair` requests a pairing code and has a cooldown. The code is returned only in the HTTP response and is not deliberately printed to logs. Keep the hosting dashboard and session volume private.

## Important security note

Never commit a real `.env`, WhatsApp session files, pairing codes, API keys, or credentials. If any secret was ever committed to a public repository, deleting the file is not enough: rotate the secret because it may remain in Git history.

## Erfan MD feature parity

This repository is not yet a complete copy of every command shown by Erfan MD. The public reference describes broad command categories and notes that availability depends on the actual bot and server configuration. M.H.E. will add compatible features in tested batches and show only commands that are implemented.


## Next command batch

Implemented in source (runtime deployment not yet verified): uptime, bot info, chat ID, text reversal, random choice, dice and coin toss. These are local utilities and do not require third-party API credentials.
