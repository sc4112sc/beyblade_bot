import { checkThreads } from './monitors/threads.js';
import { historyStorage } from './storageHistory.js';
import { storage } from './storage.js';

export class Scheduler {
  constructor(bot, intervalMinutes = 3) {
    this.bot = bot;
    this.intervalMinutes = intervalMinutes;
    this.intervalId = null;
    this.lastScanTime = null;
    this.isRunning = false;
  }

  start() {
    if (this.intervalId) return;
    
    console.log(`[Scheduler] Started. Interval: ${this.intervalMinutes} minutes.`);
    this.runScan(); // Run immediately

    this.intervalId = setInterval(() => {
      this.runScan();
    }, this.intervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Scheduler] Stopped.');
    }
  }

  async runScan() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastScanTime = Date.now();

    try {
      console.log(`[Scheduler] Running scheduled scan...`);
      const items = await this.getLatestItems(20);
      
      const newItems = items.filter(item => {
        // hasSeen returns true if already seen
        return !historyStorage.hasSeen(item.id);
      });

      console.log(`[Scheduler] Scan complete. Found ${newItems.length} new items.`);

      if (newItems.length > 0) {
        // Mark as seen immediately to prevent duplicate pushing on slow sends
        newItems.forEach(item => historyStorage.markAsSeen(item.id));

        await this.pushToSubscribers(newItems);
      }
    } catch (err) {
      console.error('[Scheduler] Error during scan:', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  async getLatestItems(limit = 5) {
    try {
      const threadsItems = await checkThreads();

      // Sort strictly by publishedAt timestamp descending (newest post time first)
      const allItems = [...threadsItems].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

      return allItems.slice(0, limit);
    } catch (err) {
      console.error('[Scheduler getLatestItems Error]:', err.message);
      return [];
    }
  }

  formatPushMessage(item) {
    return `🌀 <b>[社群推播通知]</b>\n\n` +
           `📌 <b>標題：</b> <a href="${item.url}">${item.title}</a>\n` +
           `📡 <b>來源：</b> ${item.platform}\n` +
           `💰 <b>內文預覽：</b> <code>${item.price}</code>\n\n` +
           `👉 <a href="${item.url}">點此前往查看</a>`;
  }

  async pushToSubscribers(items) {
    if (!this.bot) return;

    const subscribers = storage.getAllSubscribers();
    if (subscribers.length === 0) return;

    console.log(`[Scheduler] Pushing ${items.length} items to ${subscribers.length} subscribers...`);

    for (const item of items) {
      const msg = this.formatPushMessage(item);
      for (const sub of subscribers) {
        try {
          await this.bot.api.sendMessage(sub.chatId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
        } catch (err) {
          console.error(`[Scheduler] Push error for chat ${sub.chatId}:`, err.message);
        }
      }
    }
  }
}
