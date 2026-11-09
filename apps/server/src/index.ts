import { buildApp } from './app.js';
import { config, validateConfig } from './config.js';

async function start() {
  validateConfig();

  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`[NIGHTSHIFT SERVER] Listening at ${address}`);
    console.log(
      `[NIGHTSHIFT SERVER] LiveKit Pool: ${config.livekitAccounts.length} account(s) ready (Active URL: ${config.livekit.url})`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
