import { checkAllEcommerce } from './monitors/ecommerce.js';
import { checkAllSocial } from './monitors/social.js';
import { historyStorage } from './storageHistory.js';
import { storage } from './storage.js';

export class Scheduler {
  constructor(bot, intervalMinutes = 3) {
    this.bot = bot;
    this.intervalMinutes = intervalMinutes;
    this.intervalMs = intervalMinutes * 60 * 1000;
    this.timer = null;
    this.isRunning = false;
    this.lastScanTime = null;
    this.totalPushed = 0;
  }

  start() {
    if (this.timer) return;
    console.log(`⏰ [Scheduler] Beyblade X Monitor Scheduler started (Interval: ${this.intervalMs / 60000} mins)`);
    
    // Run initial scan after 5 seconds
    setTimeout(() => this.runScan(), 5000);

    // Set recurring timer
    this.timer = setInterval(() => this.runScan(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 [Scheduler] Monitor Scheduler stopped.');
    }
  }

  async runScan() {
    if (this.isRunning) {
      console.log('⏳ [Scheduler] Scan already in progress, skipping...');
      return { success: false, reason: 'in_progress' };
    }

    this.isRunning = true;
    this.lastScanTime = new Date().toISOString();
    console.log(`🔍 [Scheduler] Starting scan across all platforms for Beyblade X...`);

    let newItemsCount = 0;

    try {
      // 1. Collect all items from Ecommerce & Social
      const [ecomItems, socialItems] = await Promise.all([
        checkAllEcommerce(),
        checkAllSocial()
      ]);

      const allItems = [...ecomItems, ...socialItems];
      console.log(`📊 [Scheduler] Found total ${allItems.length} relevant items/posts.`);

      // 2. Filter new unseen items
      const subscribers = storage.getAllSubscribers();
      
      // If history is completely empty on boot, establish baseline (mark seen without pushing)
      const isFreshBoot = historyStorage.seenIds.size === 0;

      for (const item of allItems) {
        if (!historyStorage.isSeen(item.id)) {
          if (isFreshBoot) {
            // First run baseline initialization: mark current items as seen without sending push spam
            await historyStorage.addSeen(item.id);
          } else {
            // Newly discovered item after baseline! Push notification to subscribers
            newItemsCount++;
            this.totalPushed++;

            if (this.bot && subscribers.length > 0) {
              const message = this.formatPushMessage(item);
              
              for (const sub of subscribers) {
                try {
                  await this.bot.api.sendMessage(sub.chatId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                  });
                } catch (err) {
                  console.error(`[Scheduler Push Error] Failed to send to ${sub.chatId}:`, err.message);
                }
              }
            }

            // Mark item as seen
            await historyStorage.addSeen(item.id);
          }
        }
      }

      if (isFreshBoot) {
        console.log(`📌 [Scheduler] Baseline initialized with ${allItems.length} existing items. Future scans will push NEW items only.`);
      } else {
        console.log(`✨ [Scheduler] Scan completed. ${newItemsCount} new item(s) pushed.`);
      }
    } catch (err) {
      console.error('[Scheduler Error] Error during scan:', err);
    } finally {
      this.isRunning = false;
    }

    return {
      success: true,
      lastScanTime: this.lastScanTime,
      newItemsCount
    };
  }

  formatPushMessage(item) {
    const categoryEmoji = item.category === '電商購物' ? '🛍️' : '💬';
    
    return (
      `🌀 <b>[戰鬥陀螺 X 第一手動態推播]</b>\n\n` +
      `📌 <b>標題：</b> <a href="${item.url}">${escapeHtml(item.title)}</a>\n` +
      `${categoryEmoji} <b>來源：</b> ${item.platform} (${item.category})\n` +
      `💰 <b>類型/詳細：</b> <code>${escapeHtml(item.price)}</code>\n\n` +
      `👉 <a href="${item.url}">點此立即前往商品/貼文頁面</a>`
    );
  }
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
