# bohudur-proxy

A small relay that lets community members call the [Bohudur](https://bohudur.one) payment API through one shared server. It exists for people on free hosts (Railway and similar) whose IP addresses the gateway's provider flags as spam. Each member gets a personal key from a Telegram bot.

> Unofficial community project, run with the permission of Bohudur's owner. Not affiliated with Bohudur.

## Base URLs

| Host | URL |
| ---- | --- |
| Custom domain | `https://proxy.abm.ami.bd` |
| Render | `https://bohudur-proxy.onrender.com` |

Both reach the same relay. Use either one as the base URL.

## How it works

```
your app ──► bohudur-proxy (this repo) ──► request.bohudur.one
             x-relay-key: <your key>
```

1. You get a personal key from the Telegram bot and choose how long it lasts.
2. Every request to the relay carries that key in the `x-relay-key` header.
3. A valid key means the request is forwarded to Bohudur and the response comes back unchanged.
4. Each member has exactly one key. A new key replaces the old one, and the admin can ban members.

## Using the relay

1. Open the bot [@BohudurProxyBot](https:://t.me/BohudurProxyBot) and send `/start`.
2. Tap **🔑 Get** and send a duration such as `30m`, `12h` or `7d`. The bot replies with your key.
3. Call the Bohudur API as usual, but use the relay's address as the base URL and add your key as `x-relay-key`. Paths, bodies and headers stay the same as in the [Bohudur docs](https://docs.bohudur.one).

```bash
curl -X POST https://proxy.abm.ami.bd/create/v2/ \
  -H "Content-Type: application/json" \
  -H "AH-BOHUDUR-API-KEY: <your Bohudur API key>" \
  -H "x-relay-key: <your relay key>" \
  -d '{
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "amount": 10,
    "return_type": "GET",
    "redirect_url": "https://example.com/success",
    "cancel_url": "https://example.com/cancel"
  }'
```

The same call in Node:

```js
const response = await fetch("https://proxy.abm.ami.bd/create/v2/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "AH-BOHUDUR-API-KEY": process.env.BOHUDUR_API_KEY,
    "x-relay-key": process.env.RELAY_KEY
  },
  body: JSON.stringify({
    full_name: "Jane Doe",
    email: "jane@example.com",
    amount: 10,
    return_type: "GET",
    redirect_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel"
  })
})
```

> The `@theabmmohi/bohudur` SDK (v1.1.2) hard-codes the Bohudur URL and has no option for extra headers, so use `fetch` as above until it does.

### What the relay does to your request

- **Passed through:** method, path, query string, body, and every header, including `AH-BOHUDUR-API-KEY` and any other custom `X-...` header.
- **Removed:** `x-relay-key`, connection-level headers (`host`, `connection`, `content-length` and similar), and headers that reveal the original caller (`x-forwarded-*`, `x-real-ip`, `cf-*`, ...). Bohudur sees the relay, not your server.
- **Responses:** the status, headers and body from Bohudur are returned as they are, including redirects and multiple cookies.
- **Errors from the relay itself:**

| Status | Meaning |
| ------ | ------- |
| `401`  | Missing, invalid, expired, revoked or banned key |
| `502`  | Bohudur could not be reached |
| `504`  | Bohudur took longer than 30 seconds |
| `500`  | Unexpected error inside the relay |

### Good to know

- **The relay can see your Bohudur API key and request bodies**, because they pass through it. The code never logs headers or bodies, and the database stores only your Telegram ID, username, name and current relay key. Even so, you are trusting whoever runs the relay. If that matters to you, [self-host it](#self-hosting).
- **If your Bohudur account restricts allowed IPs** (errors `3016`, `3054`, `3104`), allow the relay's outbound IP addresses instead of your own server's.
- There is **no rate limiting**, and request bodies are held in memory, which suits small API calls, not large uploads.

## Bot reference

Send `/start` once to show the keyboard.

| Button | Who | What it does |
| ------ | --- | ------------ |
| 🔑 Get | Everyone | Shows your current key and when it expires. If you have none, or it expired, it asks for a duration and creates one. |
| 🔄 Rotate | Everyone | Asks for a duration and issues a new key. The old key stops working immediately. |
| 🔍 Search | Admin | Asks for a Telegram ID (digits) or `@username` and shows that member's full database row. |
| 🚫 Ban/Unban | Admin | Asks for a Telegram ID or `@username` and toggles their ban. Banning revokes their key at once. An unbanned member has to get a new key. |

A duration is a number followed by `m`, `h` or `d`, for example `30m`, `12h` or `7d`.

## Self-hosting

You need Node 20 or newer, a Postgres database, a Telegram bot, and a host with public HTTPS.

1. **Create the bot.** Talk to [@BotFather](https://t.me/BotFather) for the token, and to [@userinfobot](https://t.me/userinfobot) for your own numeric Telegram ID.
2. **Create a Postgres database.** Neon and Supabase free tiers work. The `users` table is created automatically on startup. If the server uses a self-signed certificate, end your connection string with `?sslmode=no-verify`.
3. **Install:**
   ```bash
   git clone https://github.com/theabmmohi/bohudur-proxy.git
   cd bohudur-proxy
   npm install
   ```
4. **Set the environment variables** (copy `.env.example` to `.env` locally):

| Variable | Description |
| -------- | ----------- |
| `JWT_SECRET` | Long random string that signs relay keys. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it invalidates every key. |
| `PUBLIC_URL` | Public HTTPS address of the service, for example `https://proxy.example.com`. The Telegram webhook is registered here on startup. |
| `BOHUDUR_URL` | Address to forward to: `https://request.bohudur.one` |
| `PG_URL` | Postgres connection string |
| `TG_BOT` | Bot token from BotFather |
| `TG_ADMIN` | Your numeric Telegram ID, the only admin |
| `PORT` | Optional, defaults to `3000`. Most hosts set it for you. |

5. **Deploy.** Run the repo as a Node web service on your host:
   - Build command: `npm install && npm run build`
   - Start command: `npm run server`
   - Add the environment variables above.

   On startup the service registers its Telegram webhook by itself.
6. **Custom domain (optional).** Point a `CNAME` record at your host's address, add the domain in your host's dashboard, and use it as `PUBLIC_URL`.

### Local development

```bash
cp .env.example .env    # then fill it in
npm run dev
```

Telegram delivers updates by webhook, so `PUBLIC_URL` must be a public HTTPS address. Use a tunnel such as cloudflared or ngrok. Use a separate bot token from your production bot, because registering a webhook takes the bot over.

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Run with auto-reload |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Bundle to `dist/` |
| `npm run server` | Run the built server |

Never commit `.env`. It is already in `.gitignore`.

## How keys work

- A key is an HS256 [JWT](https://jwt.io) whose subject is the member's Telegram ID and whose expiry is the duration they picked.
- Each member's current key is stored in the database and also held in memory. Checking a request means verifying the signature and expiry and confirming it matches the member's current key. **No database query happens per request.**
- A new key, a rotation or a ban invalidates the old key instantly. The in-memory copy is rebuilt from the database on every startup.

## Project structure

```
src/
  server.ts         HTTP server: routes Telegram updates and relay traffic; startup and shutdown
  relay.ts          Authenticates and forwards requests to BOHUDUR_URL
  telegram/bot.ts   Keyboard menus, key issuing, admin tools
  database/         index.ts: pool and schema, users.ts: queries
  utils/auth.ts     Key issue / verify / revoke and the in-memory cache
  utils/env.ts      Required environment variables
```

Import aliases: `@/` is `src/`, `@db/` is `src/database/`, `@tg/` is `src/telegram/`, and `@util/` is `src/utils/`.

## Limitations

- Built for a **single instance**. The key cache and the bot's pending questions live in memory.
- A restart forgets any question the bot was waiting on. Members just tap the button again.
- No rate limiting.

## License

MIT
