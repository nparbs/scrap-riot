// Runs the full game server with accounts on an in-memory database, so no Postgres is needed
// for local development. Nothing survives a restart. Usage: npm run server:dev
import { Accounts } from '../server/accounts';
import { startGameServer } from '../server/gameServer';
import { embeddedDb } from './embedded-db';

const accounts = new Accounts(embeddedDb(), null);
await accounts.migrate();
const server = await startGameServer({
  port: Number(process.env.PORT ?? 8787),
  accounts,
  room: {
    lobbyMs: Number(process.env.LOBBY_MS ?? 5000),
    duration: process.env.MATCH_SECONDS ? Number(process.env.MATCH_SECONDS) : undefined,
  },
});
console.log(`Dev server with in-memory accounts on port ${server.port}`);
