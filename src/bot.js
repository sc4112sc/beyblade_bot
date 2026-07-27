import { Bot } from 'grammy';
import { storage } from './storage.js';

/**
 * Initialize and setup Telegram Bot instance
 * @param {string} token 
 * @returns {Bot}
 */
export function createBot(token, scheduler = null) {
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
      `👋 嗨！<b>${name}</b>，歡迎使用戰鬥陀螺 X 全網推播機器人！\n\n` +
      `✅ 已自動為您啟用推播訂閱。\n` +
      `🆔 您的 Chat ID 為：<code>${chatId}</code>\n\n` +
      `可使用的指令：\n` +
      `/check - 🔍 立即掃描全網戰鬥陀螺 X 資訊\n` +
      `/monitors - 📡 查看目前監控平台清單\n` +
      `/myid - 查詢此對話/群組的 Chat ID\n` +
      `/subscribe - 訂閱推播通告\n` +
      `/unsubscribe - 取消訂閱推播\n` +
      `/status - 查看訂閱狀態\n` +
      `/help - 查看說明`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  // Command /check (Manual scan trigger)
  bot.command('check', async (ctx) => {
    await ctx.reply('🔎 收到手動觸發請求，正在掃描 momo、墊腳石、誠品、金玉堂、東海模型、Toy World、Threads、FB...', { parse_mode: 'HTML' });
    if (scheduler) {
      const res = await scheduler.runScan();
      await ctx.reply(`✅ 掃描完成！發現 ${res.newItemsCount || 0} 筆最新戰鬥陀螺 X 資訊。`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply('⚠️ 排程器服務尚未就緒。', { parse_mode: 'HTML' });
    }
  });

  // Command /monitors
  bot.command('monitors', async (ctx) => {
    const intervalMins = scheduler?.intervalMinutes || parseInt(process.env.SCAN_INTERVAL_MINUTES || '3', 10);
    const text = 
      `📡 <b>目前監控平台清單 (戰鬥陀螺 X)</b>\n\n` +
      `🛍️ <b>電商購物網：</b>\n` +
      `• momo 購物網\n` +
      `• 墊腳石購物網\n` +
      `• 誠品線上\n` +
      `• 金玉堂購物網\n` +
      `• 東海模型購物網\n` +
      `• Toy World 購物網\n\n` +
      `💬 <b>社群與二手買賣：</b>\n` +
      `• Threads 關鍵字動態\n` +
      `• Facebook 社團/粉專貼文\n\n` +
      `⏱️ <b>掃描頻率：</b> 每 ${intervalMins} 分鐘自動巡檢`;

    await ctx.reply(text, { parse_mode: 'HTML' });
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

    await ctx.reply('✅ 您已成功訂閱戰鬥陀螺 X 資訊推播通告！', { parse_mode: 'HTML' });
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
      `• 目前總訂閱數：${totalSubs} 個用戶/群組\n` +
      `• 上次掃描時間：${scheduler?.lastScanTime ? new Date(scheduler.lastScanTime).toLocaleString('zh-TW') : '尚未執行'}`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Command /help
  bot.command('help', async (ctx) => {
    const text = 
      `🤖 <b>戰鬥陀螺 X 推播機器人使用說明</b>\n\n` +
      `<b>可用指令：</b>\n` +
      `• /start - 啟動機器人並自動訂閱\n` +
      `• /check - 立即觸發全網戰鬥陀螺 X 掃描\n` +
      `• /monitors - 查看監控平台清單\n` +
      `• /myid - 查詢此聊天室/群組的 Chat ID\n` +
      `• /subscribe - 訂閱推播通告\n` +
      `• /unsubscribe - 取消訂閱推播通告\n` +
      `• /status - 檢視訂閱狀態與統計\n` +
      `• /help - 顯示此說明範例`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Catch error handling
  bot.catch((err) => {
    console.error('[Bot Error]', err);
  });

  return bot;
}
