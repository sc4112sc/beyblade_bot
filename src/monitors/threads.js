import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storage } from '../storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '../../data/threads_history.json');

// 儲存已推播過的貼文歷史 (使用 Set 提升查詢效能)
let historyCache = new Set();

/**
 * 載入歷史紀錄
 */
async function loadHistory() {
  try {
    const dir = path.dirname(HISTORY_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    try {
      const content = await fs.readFile(HISTORY_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        historyCache = new Set(data);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        await saveHistory();
      } else {
        console.error('[Threads Monitor] Error reading history file:', err);
      }
    }
  } catch (err) {
    console.error('[Threads Monitor] Failed to initialize history:', err);
  }
}

/**
 * 儲存歷史紀錄
 */
async function saveHistory() {
  try {
    const arrayData = Array.from(historyCache);
    // 為了避免檔案無限長大，可以限制歷史紀錄的數量，例如保留最近 1000 筆
    if (arrayData.length > 1000) {
      const trimmed = arrayData.slice(arrayData.length - 1000);
      historyCache = new Set(trimmed);
    }
    
    await fs.writeFile(HISTORY_FILE, JSON.stringify(Array.from(historyCache), null, 2), 'utf-8');
  } catch (err) {
    console.error('[Threads Monitor] Error saving history file:', err);
  }
}

/**
 * 簡易版免登入 Threads 爬蟲
 * @param {string} username - 目標使用者的 Threads 帳號 (不含 @)
 * @returns {Promise<Array>} 爬取到的貼文陣列
 */
export async function scrapeThreads(username) {
  console.log(`[Threads Scraper] 開始爬取 @${username} 的公開資料...`);
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    const targetUrl = `https://www.threads.net/@${username}`;
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 額外等待 3 秒確保內容載入
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const posts = await page.evaluate(() => {
      const results = [];
      const textSpans = document.querySelectorAll('span[dir="auto"]');
      
      textSpans.forEach(span => {
        const text = span.innerText;
        
        if (
          text && 
          text.trim().length > 15 && 
          !text.includes('位粉絲') &&
          !text.includes('則回覆') &&
          !text.includes('查看貼文') &&
          !text.includes('登入以查看更多') &&
          !text.includes('使用 Instagram 帳號繼續')
        ) {
          results.push({
            content: text.trim(),
            scrapedAt: new Date().toISOString()
          });
        }
      });
      
      const uniqueResults = [];
      const seen = new Set();
      for (const item of results) {
        if (!seen.has(item.content)) {
          seen.add(item.content);
          uniqueResults.push(item);
        }
      }
      
      return uniqueResults;
    });
    
    return posts;
    
  } catch (error) {
    console.error(`[Threads Scraper] 爬取 @${username} 時發生錯誤:`, error.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * 啟動 Threads 定時監控
 * @param {import('grammy').Bot} bot - Telegram Bot 實例
 */
export async function startThreadsMonitor(bot) {
  if (!bot) {
    console.warn('[Threads Monitor] Bot 實例不存在，無法啟動監控。');
    return;
  }

  const usersEnv = process.env.THREADS_TARGET_USERS || 'zuck';
  const targetUsers = usersEnv.split(',').map(u => u.trim()).filter(Boolean);
  
  if (targetUsers.length === 0) {
    console.log('[Threads Monitor] 未設定監控目標 (THREADS_TARGET_USERS)，跳過啟動。');
    return;
  }

  const intervalMinutes = parseInt(process.env.SCAN_INTERVAL_MINUTES || '3', 10);
  console.log(`[Threads Monitor] 啟動監控，目標帳號: ${targetUsers.join(', ')}，頻率: 每 ${intervalMinutes} 分鐘`);

  await loadHistory();

  const checkUpdates = async () => {
    for (const user of targetUsers) {
      try {
        const posts = await scrapeThreads(user);
        
        // 倒序處理，讓最舊的先發送
        for (let i = posts.length - 1; i >= 0; i--) {
          const post = posts[i];
          // 這裡簡單取前 30 個字作為 hash 依據，或者整句 (如果字太少)
          const hashKey = `${user}_${post.content.substring(0, 50).replace(/\s/g, '')}`;
          
          if (!historyCache.has(hashKey)) {
            console.log(`[Threads Monitor] 發現新貼文 (@${user}): ${post.content.substring(0, 30)}...`);
            
            // 標記為已處理
            historyCache.add(hashKey);
            await saveHistory();
            
            // 進行廣播
            const subscribers = storage.getAllSubscribers();
            const message = `🧵 <b>來自 @${user} 的最新 Threads:</b>\n\n${post.content}\n\n👉 <a href="https://www.threads.net/@${user}">前往查看</a>`;
            
            for (const sub of subscribers) {
              try {
                await bot.api.sendMessage(sub.chatId, message, { parse_mode: 'HTML', disable_web_page_preview: true });
              } catch (err) {
                console.error(`[Threads Monitor] 發送給 ${sub.chatId} 失敗:`, err.message);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Threads Monitor] 檢查 @${user} 時發生錯誤:`, err.message);
      }
    }
  };

  // 啟動時先檢查一次
  checkUpdates();
  
  // 設定定時器
  setInterval(checkUpdates, intervalMinutes * 60 * 1000);
}
