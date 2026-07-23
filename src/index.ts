import 'dotenv-defaults/config';
import variables from '@/config/variables';
import { applyPendingDatabaseBackupRestore } from '@/core/backup';
import { shutdown } from '@/primitives/shutdown';
import { startHttpServer } from '@/runtime/startHttpServer';
import { PinoLogger } from './logger/pinoLogger';
const port = variables.PORT;

async function bootstrap() {
  const scope = "ApplicationBootstrap";
  try {
    const restored = await applyPendingDatabaseBackupRestore();
    if (restored) PinoLogger.info({ scope: 'bootstrap', message: 'Database backup restored before application startup', fileName: restored.fileName });
    const runningServer = await startHttpServer(port);
    PinoLogger.info({ scope: 'bootstrap', message: 'Server running', url: runningServer.url, port });

    const disposables = [
      { async stop() { await runningServer.stop(); } }
    ];

    process.on('SIGTERM', () => void shutdown('SIGTERM', disposables));
    process.on('SIGINT', () => void shutdown('SIGINT', disposables));
  }
  catch (error) {
    PinoLogger.error({ scope, message: 'Failed to start the application', err: error });
    throw error;
  }
}

bootstrap().catch(_err => process.exit(1));
