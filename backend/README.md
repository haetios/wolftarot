# Welcome to Colyseus!

This project was created with [⚔️ `create-colyseus-app`](https://github.com/colyseus/create-colyseus-app/).

[Documentation](https://docs.colyseus.io/)

## :crossed_swords: Usage

```
pnpm install
pnpm start
```

Then open http://localhost:2567 for the playground, or /monitor for the monitor.

## Structure

- `src/index.ts`: entry point — leave it alone if you plan to deploy to Colyseus Cloud
- `src/app.config.ts`: server configuration — rooms, HTTP routes, express middleware
- `src/engine/`: Tarot rules engine — pure logic, no Colyseus (cards, deal, bidding, play, scoring…)
- `src/auth/`: Supabase JWT verification (`verify-token.ts`), configuration from the environment (`config.ts`), player identity (`identity.ts`)
- `src/rooms/TarotRoom.ts`: the game room (`tarot`), options `{ playerCount: 3 | 4 | 5 }`; players must be authenticated (see below)
- `src/rooms/schema/TarotState.ts`: the state synchronized to clients (a hand is only sent to its owner)
- `test/engine/`: rules engine tests; `test/auth/`: token verification tests; `test/rooms/`: boots the real server and connects real clients
- `test/helpers/auth.ts`: signs Supabase-like tokens locally for the tests (no network)
- `loadtest/example.ts`: scriptable client for `pnpm loadtest`
- `ecosystem.config.cjs`: pm2 configuration, used when deploying to Colyseus Cloud

## Scripts

- `pnpm start`: run the server in watch mode (`tsx watch src/index.ts`)
- `pnpm test`: run the Vitest suite (`pnpm test:watch` in watch mode)
- `pnpm typecheck`: TypeScript check (strict)
- `pnpm lint`: ESLint
- `pnpm format` / `pnpm format:check`: Prettier
- `pnpm build`: compile to `build/`
- `pnpm loadtest`: connect N simulated clients with [`@colyseus/loadtest`](https://github.com/colyseus/colyseus-loadtest/)
- `GET /health`: returns `{"status":"ok"}`

## Configuration

Copy [`.env.example`](.env.example) and fill it in, or (preferred for secrets) export the variables
in the process environment, which takes precedence over files. `@colyseus/tools` loads only the
**first** file found among `.env.<NODE_ENV>` and `.env`: the committed `.env.development` and
`.env.production` sample files therefore shadow a local `.env`. Never commit a secret.

| Variable              | Required       | Description                                                                                                                                                                                                                                  |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`        | one of the two | Project URL, e.g. `https://<ref>.supabase.co`. Enables asymmetric keys (ES256/RS256) fetched from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (cached, fetched on first use) and the issuer check (`<SUPABASE_URL>/auth/v1`). Not secret. |
| `SUPABASE_JWT_SECRET` | one of the two | Legacy shared HS256 secret, only if the project still signs tokens with it. **Secret**, 32 characters minimum.                                                                                                                               |
| `PORT`                | no             | Listening port (2567).                                                                                                                                                                                                                       |

Without either Supabase variable the server starts with a warning but refuses every connection.
An invalid value (malformed URL, short secret) stops the server at startup.

## Authentication

Every connection to a `tarot` room (create or join) must carry the user's Supabase access token:

```ts
client.auth.token = session.access_token; // sent as `Authorization: Bearer <jwt>`
await client.joinOrCreate("tarot", { playerCount: 4 });
```

`TarotRoom.onAuth` (static, run by the matchmaker before any seat is reserved) checks the
signature, expiry (5 s clock tolerance), audience `authenticated`, issuer (when `SUPABASE_URL` is
set) and `sub`. Anonymous Supabase users are refused. A refused connection fails with
`AUTH_FAILED` (525) and the message `Authentification refusée (<reason>) : …`, where `<reason>` is
one of `missingToken`, `malformedToken`, `expiredToken`, `invalidSignature`, `invalidClaims`,
`unsupportedAlgorithm`, `anonymousUser`, `notConfigured`, `verificationFailed`.

The player's identity (`id` = `sub`, display name) stays on the server (`client.auth`); only the
display name is synchronized. The name comes from `user_metadata.username` (then `user_name`,
`preferred_username`), falling back to `Joueur <seat>`; join options are ignored. The `profiles`
table (sprint B14) will plug into `resolvePlayerIdentity()` in `src/auth/identity.ts`.

## What's included

### Reconnection

`TarotRoom.onDrop()` holds a dropped client's seat for 30 seconds via
`allowReconnection()`. The SDK retries automatically with exponential backoff;
`onReconnect()` fires if it gets back in time, `onLeave()` if it does not.

- https://docs.colyseus.io/room/reconnection
