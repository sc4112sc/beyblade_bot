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

  async getLatestItems(limit = 5) {
    try {
      const [ecomItems, socialItems] = await Promise.all([
        checkAllEcommerce(),
        checkAllSocial()
      ]);
      const allItems = [...socialItems, ...ecomItems];
      return allItems.slice(0, limit);
    } catch (err) {
      console.error('[Scheduler getLatestItems Error]:', err.message);
      return [];
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
      
      // Check if history is fresh
      const isFreshBoot = historyStorage.seenIds.size === 0;

      if (isFreshBoot) {
        // Send top 3 freshest items on initial boot
        const topItems = allItems.slice(0, 3);
        for (const item of topItems) {
          if (this.bot && subscribers.length > 0) {
            const message = this.formatPushMessage(item);
            for (const sub of subscribers) {
              try {
                await this.bot.api.sendMessage(sub.chatId, message, {
                  parse_mode: 'HTML',
                  disable_web_page_preview: false
                });
                newItemsCount++;
                this.totalPushed++;
              } catch (err) {
                console.error(`[Scheduler Push Error] Failed to send to ${sub.chatId}:`, err.message);
              }
            }
          }
        }

        // Mark all current items as seen
        for (const item of allItems) {
          await historyStorage.addSeen(item.id);
        }

        console.log(`📌 [Scheduler] Baseline initialized with ${allItems.length} existing items (pushed top 3 freshest). Future scans will push NEW items only.`);
      } else {
        for (const item of allItems) {
          if (!historyStorage.isSeen(item.id)) {
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

      console.log(`✨ [Scheduler] Scan completed. ${newItemsCount} new item(s) pushed.`);
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
