import { Bot } from 'grammy';
import { storage } from './storage.js';

/**
 * Initialize and setup Telegram Bot instance
 * @param {string} token 
 * @returns {Bot}
 */
export function createBot(token) {
  if (!token || token === 'your_telegram_bot_token_here') {
    console.warn('[Bot] WARNING: TELEGRAM_BOT_TOKEN is not set or using default value. Bot will not connect to Telegram.');
    return null;
  }

  const bot = new Bot(token);

  // Command /start
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const name = ctx.from?.first_name || ctx.chat.title || 'User';

    await storage.addSubscriber(chatId, {
      name,
      username: ctx.from?.username,
      type: chatType
    });

    const message = 
      `👋 嗨！<b>${name}</b>，歡迎使用 Telegram 推播機器人！\n\n` +
      `✅ 已自動為您啟用推播訂閱。\n` +
      `🆔 您的 Chat ID 為：<code>${chatId}</code>\n\n` +
      `可使用的指令：\n` +
      `/myid - 查詢此對話/群組的 Chat ID\n` +
      `/subscribe - 訂閱推播通告\n` +
      `/unsubscribe - 取消訂閱推播\n` +
      `/status - 查看訂閱狀態\n` +
      `/help - 查看說明`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  // Command /myid
  bot.command('myid', async (ctx) => {
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const name = ctx.from?.first_name || ctx.chat.title || 'User';

    const text = 
      `📌 <b>Chat ID 資訊</b>\n` +
      `• 名稱：${name}\n` +
      `• 類型：${chatType}\n` +
      `• <b>Chat ID：</b> <code>${chatId}</code>\n\n` +
      `💡 您可以使用此 Chat ID 透過 HTTP API 發送指定推播！`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Command /subscribe
  bot.command('subscribe', async (ctx) => {
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const name = ctx.from?.first_name || ctx.chat.title || 'User';

    await storage.addSubscriber(chatId, {
      name,
      username: ctx.from?.username,
      type: chatType
    });

    await ctx.reply('✅ 您已成功訂閱推播通告！', { parse_mode: 'HTML' });
  });

  // Command /unsubscribe
  bot.command('unsubscribe', async (ctx) => {
    const chatId = ctx.chat.id;
    const removed = await storage.removeSubscriber(chatId);

    if (removed) {
      await ctx.reply('🔕 您已取消訂閱推播通告。', { parse_mode: 'HTML' });
    } else {
      await ctx.reply('ℹ️ 您尚未訂閱通告。', { parse_mode: 'HTML' });
    }
  });

  // Command /status
  bot.command('status', async (ctx) => {
    const chatId = ctx.chat.id;
    const isSubbed = storage.isSubscribed(chatId);
    const totalSubs = storage.getAllSubscribers().length;

    const text = 
      `📊 <b>機器人狀態報告</b>\n` +
      `• 您的訂閱狀態：${isSubbed ? '✅ 已訂閱' : '❌ 未訂閱'}\n` +
      `• 目前總訂閱數：${totalSubs} 個用戶/群組`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Command /help
  bot.command('help', async (ctx) => {
    const text = 
      `🤖 <b>Telegram 推播機器人使用說明</b>\n\n` +
      `<b>可用指令：</b>\n` +
      `• /start - 啟動機器人並自動訂閱\n` +
      `• /myid - 查詢此聊天室/群組的 Chat ID\n` +
      `• /subscribe - 訂閱推播通告\n` +
      `/unsubscribe - 取消訂閱推播通告\n` +
      `• /status - 檢視訂閱狀態與統計\n` +
      `• /help - 顯示此說明範例\n\n` +
      `<b>HTTP API 發送推播範例：</b>\n` +
      `<code>curl -X POST http://localhost:3000/api/send \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -H "X-API-KEY: your_api_key" \\\n` +
      `  -d '{"chatId": "${ctx.chat.id}", "message": "hello world"}'</code>`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Catch error handling
  bot.catch((err) => {
    console.error('[Bot Error]', err);
  });

  return bot;
}
