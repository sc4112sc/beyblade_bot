import 'dotenv/config';
import { createBot } from './bot.js';
import { storage } from './storage.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, ...valParts] = arg.slice(2).split('=');
      const val = valParts.join('=');
      options[key] = val || true;
    }
  });

  return options;
}

async function main() {
  const options = parseArgs();
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your_telegram_bot_token_here') {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file.');
    process.exit(1);
  }

  const message = options.message || options.m;
  const chatId = options.chatId || options.c;
  const broadcast = options.broadcast || options.b;
  const parseMode = options.parseMode || 'HTML';
  const photoUrl = options.photoUrl;

  if (!message) {
    console.log(`
🚀 Telegram Push CLI Usage:

Send to a single user/group:
  npm run push -- --chatId=<CHAT_ID> --message="Hello World"

Broadcast to all subscribers:
  npm run push -- --broadcast --message="Broadcast Announcement"

Optional Flags:
  --photoUrl=<URL>     Attach photo URL
  --parseMode=HTML|MarkdownV2 (default: HTML)
    `);
    process.exit(0);
  }

  await storage.init();
  const bot = createBot(token);

  try {
    if (broadcast) {
      const subscribers = storage.getAllSubscribers();
      console.log(`📡 Starting broadcast to ${subscribers.length} subscriber(s)...`);

      let successCount = 0;
      for (const sub of subscribers) {
        try {
          if (photoUrl) {
            await bot.api.sendPhoto(sub.chatId, photoUrl, { caption: message, parse_mode: parseMode });
          } else {
            await bot.api.sendMessage(sub.chatId, message, { parse_mode: parseMode });
          }
          console.log(`  ✅ Sent to ${sub.name} (${sub.chatId})`);
          successCount++;
        } catch (err) {
          console.error(`  ❌ Failed for ${sub.name} (${sub.chatId}):`, err.message);
        }
      }
      console.log(`✨ Broadcast finished: ${successCount}/${subscribers.length} succeeded.`);
    } else if (chatId) {
      console.log(`🚀 Sending message to chatId ${chatId}...`);
      if (photoUrl) {
        await bot.api.sendPhoto(chatId, photoUrl, { caption: message, parse_mode: parseMode });
      } else {
        await bot.api.sendMessage(chatId, message, { parse_mode: parseMode });
      }
      console.log(`✅ Message successfully sent to ${chatId}`);
    } else {
      console.error('❌ Error: Must specify either --chatId=<ID> or --broadcast');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error sending message:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
