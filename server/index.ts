import { Accounts } from './accounts';
import { connectPostgres } from './db';
import { startGameServer } from './gameServer';
import { googleVerifier } from './google';

const origins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const googleClientId = process.env.GOOGLE_CLIENT_ID || undefined;
let accounts: Accounts | undefined;
if (process.env.DATABASE_URL) {
  const memberCode = process.env.MEMBER_CODE?.trim() || null;
  if (!memberCode) console.warn('No MEMBER_CODE: nobody can become a member, so the Highscore and Players lists stay empty.');
  accounts = new Accounts(connectPostgres(process.env.DATABASE_URL), googleClientId ? googleVerifier(googleClientId) : null, memberCode);
  await accounts.migrate();
} else {
  console.warn('No DATABASE_URL: running without accounts, so online play is anonymous and nothing is saved.');
}

const server = await startGameServer({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST,
  allowedOrigins: origins,
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
  accounts,
  googleClientId,
});

console.log(`Scrap Riot server on port ${server.port}, origins: ${origins.length ? origins.join(' ') : 'any'}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
