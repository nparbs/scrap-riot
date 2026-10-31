import { startGameServer } from './gameServer';

const origins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const server = await startGameServer({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST,
  allowedOrigins: origins,
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
});

console.log(`Scrap Riot server on port ${server.port}, origins: ${origins.length ? origins.join(' ') : 'any'}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
