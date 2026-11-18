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
- `src/profiles/`: player profiles and settings — username rules (`username.ts`) and hand order model (`hand-order.ts`), shared with the frontend; `ProfileRepository` interface (`repository.ts`) and its Supabase implementation (`supabase-repository.ts`, configured in `config.ts`)
- `../supabase/migrations/`: SQL schema of the `profiles` and `settings` tables with their RLS (see [`../supabase/README.md`](../supabase/README.md))
- `src/rooms/TarotRoom.ts`: the game room (`tarot`), options `{ playerCount: 3 | 4 | 5 }`; players must be authenticated (see below)
- `src/rooms/schema/TarotState.ts`: the state synchronized to clients (a hand is only sent to its owner)
- `test/engine/`: rules engine tests; `test/auth/`: token verification tests; `test/profiles/`: profiles and settings (including a check that the SQL rules match the TypeScript ones); `test/rooms/`: boots the real server and connects real clients
- `test/helpers/auth.ts`: signs Supabase-like tokens locally for the tests (no network); `test/helpers/profiles.ts`: in-memory `ProfileRepository` (no network)
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

| Variable                   | Required       | Description                                                                                                                                                                                                                                           |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`             | one of the two | Project URL, e.g. `https://<ref>.supabase.co`. Enables asymmetric keys (ES256/RS256) fetched from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (cached, fetched on first use) and the issuer check (`<SUPABASE_URL>/auth/v1`). Not secret.          |
| `SUPABASE_JWT_SECRET`      | one of the two | Legacy shared HS256 secret, only if the project still signs tokens with it. **Secret**, 32 characters minimum.                                                                                                                                        |
| `SUPABASE_PUBLISHABLE_KEY` | recommended    | Project **public** key (`sb_publishable_…`, or the legacy `anon` key), the same one the frontend uses. Not secret. Enables reading usernames from the `profiles` table; requires `SUPABASE_URL`. A secret / `service_role` key is refused at startup. |
| `PORT`                     | no             | Listening port (2567).                                                                                                                                                                                                                                |

Without either Supabase variable the server starts with a warning but refuses every connection.
Without `SUPABASE_PUBLISHABLE_KEY` the server starts with a warning and takes usernames from
`user_metadata` (development fallback only: not unique, editable by the user).
An invalid value (malformed URL, short secret, secret key instead of the public key) stops the
server at startup.

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
display name is synchronized, and join options are ignored.

## Profiles and settings

The display name comes from the `profiles` table (unique username, created at sign-up by a
database trigger), read by `resolvePlayerIdentity()` in `src/auth/identity.ts` through a
`ProfileRepository`. **Least privilege:** the server queries Supabase's REST API with the project
public key and **the player's own access token**, so RLS applies exactly as for the player; the
`service_role` key is never used.

| Situation                                      | Result                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| profile found                                  | its username                                                                                      |
| no profile (deleted account, still-valid JWT)  | connection refused with `profileNotFound`                                                         |
| Supabase unreachable, timeout (3 s), bad reply | connection accepted, fallback name `Joueur <seat>`, warning logged                                |
| `SUPABASE_PUBLISHABLE_KEY` not set (dev)       | name from `user_metadata.username` (then `user_name`, `preferred_username`), else `Joueur <seat>` |

`user_metadata` is never used once profiles are configured, not even during an outage: the user
can change it at any time and it is not unique, so it would allow impersonation.

The player's settings (`settings` table, base order of the cards in hand) can be read with
`ProfileRepository.findSettings()`; the model and its validation live in
`src/profiles/hand-order.ts` (`HandOrder`, `DEFAULT_HAND_ORDER`, `parseHandOrder`, `sortHand`)
and are meant to be reused by the frontend settings page.

## Free games (matchmaking)

A free online game uses Colyseus' built-in matchmaking, with one queue per table size:

```ts
client.auth.token = supabaseAccessToken;
const room = await client.joinOrCreate("tarot", { playerCount: 4 }); // 3, 4 or 5
```

- Players asking for the same size share a table; sizes are never mixed (`filterBy(["playerCount"])`).
- `playerCount` defaults to 4 when omitted; any other value than 3, 4 or 5 is refused
  (`MATCHMAKE_INVALID_CRITERIA`). It is normalized in `TarotRoom.onAuth`, before the table search.
- Queue feedback: while `state.phase === "waiting"`, the table holds `state.players.size` of
  `state.playerCount` players. When it is full, it is locked and the first deal starts.
- A seat freed before the game starts is offered again by the matchmaking.
- One account, one seat: the same Supabase user cannot sit twice at a table
  (`ALREADY_SEATED`, code 4090). A second tab of the same account is sent to the same waiting
  table by `joinOrCreate`, then refused: the frontend should show "already at a table".
- Matchmaking options must be a JSON object; anything else (string, number, `null`, array) is
  refused with `MATCHMAKE_INVALID_CRITERIA`, so the size filter can never be bypassed.

## Private tables

```ts
// The host creates the table and shares its code.
const room = await client.create("tarot", { privateTable: true, playerCount: 4 });
const code = room.state.code; // e.g. "K7Q2MX" (also room.roomId)

// Friends join with the code.
const room = await client.joinById(code);
```

- The code is the room id: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L),
  random (crypto) and unique among open tables. Codes are case-sensitive (upper case).
- A private table never shows up in free-game matchmaking.
- The creator is the host (`state.hostSeat`). Before the game starts, the host can:
  - `send("setPlayerCount", { playerCount: 3 | 4 | 5 })` (not below the number of seated players;
    seats are renumbered without gaps);
  - `send("start")` once every seat is taken. A full private table does not start by itself.
- If the host leaves before the start, the player at the lowest seat becomes the host.
- Refusals (message `error`): `notPrivate`, `notHost`, `wrongPhase`, `tableNotFull`,
  `invalidPlayerCount`, `tooManyPlayers`.

## What's included

### Reconnection

`TarotRoom.onDrop()` holds a dropped client's seat for 30 seconds via
`allowReconnection()`. The SDK retries automatically with exponential backoff;
`onReconnect()` fires if it gets back in time, `onLeave()` if it does not.

- https://docs.colyseus.io/room/reconnection
