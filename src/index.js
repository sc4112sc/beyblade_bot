import 'dotenv/config';
import { createBot } from './bot.js';
import { createServer } from './server.js';
import { storage } from './storage.js';
import { historyStorage } from './storageHistory.js';
import { Scheduler } from './scheduler.js';

async function bootstrap() {
  console.log('🚀 Starting Beyblade X Telegram Push Bot service...');

  // Initialize subscribers storage
  await storage.init();
  console.log(`[Storage] Subscribers storage initialized. Loaded ${storage.getAllSubscribers().length} subscriber(s).`);

  // Initialize seen items history storage
  await historyStorage.init();
  console.log('[HistoryStorage] History storage initialized.');

  // Initialize Telegram Bot & Scheduler
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let bot = null;
  let scheduler = null;

  if (token && token !== 'your_telegram_bot_token_here') {
    try {
      // Create temporary bot to bind to scheduler
      bot = createBot(token, null);
      if (bot) {
        scheduler = new Scheduler(bot, 10); // Check every 10 minutes
        // Re-create bot with scheduler reference for /check command
        bot = createBot(token, scheduler);

        // Start long polling for Telegram commands
        bot.start({
          onStart: (info) => {
            console.log(`[Telegram Bot] Connected successfully! Bot username: @${info.username}`);
          }
        });

        // Start scheduler
        scheduler.start();
      }
    } catch (err) {
      console.error('[Telegram Bot] Error initializing bot polling:', err.message);
    }
  } else {
    console.warn('⚠️ [Telegram Bot] TELEGRAM_BOT_TOKEN is not configured in .env file.');
    console.warn('⚠️ [Telegram Bot] Bot commands will be disabled until token is set.');
  }

  // Initialize Express Server
  const app = createServer(bot);
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`📡 [Express API] Push Notification API server running on port ${port}`);
    console.log(`👉 Health Check: http://localhost:${port}/health`);
    console.log(`👉 Send API:     POST http://localhost:${port}/api/send`);
    console.log(`👉 Broadcast API: POST http://localhost:${port}/api/broadcast`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Uncaught exception during bootstrap:', err);
  process.exit(1);
});
