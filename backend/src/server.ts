import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${env.PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
