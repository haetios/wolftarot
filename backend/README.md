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
- `src/rooms/TarotRoom.ts`: the game room (`tarot`), options `{ playerCount: 3 | 4 | 5 }`
- `src/rooms/schema/TarotState.ts`: the state synchronized to clients (a hand is only sent to its owner)
- `test/engine/`: rules engine tests; `test/rooms/`: boots the real server and connects real clients
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

## What's included

### Reconnection

`TarotRoom.onDrop()` holds a dropped client's seat for 30 seconds via
`allowReconnection()`. The SDK retries automatically with exponential backoff;
`onReconnect()` fires if it gets back in time, `onLeave()` if it does not.

- https://docs.colyseus.io/room/reconnection
