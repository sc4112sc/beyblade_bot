import fs from 'fs';
import puppeteer from 'puppeteer';
import { fetchText } from './base.js';

const KEYWORDS = ['戰鬥陀螺', 'Beyblade', 'BX-', 'UX-', 'CX-', '二手', '面交', '預購', '限定', '補貨'];

function isRelevantTitle(title = '') {
  if (!title) return false;
  const lower = title.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

let sharedBrowser = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  const options = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-notifications',
      '--disable-dev-shm-usage',
      '--lang=zh-TW'
    ]
  };

  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(systemChrome)) {
    options.executablePath = systemChrome;
  }

  sharedBrowser = await puppeteer.launch(options);
  return sharedBrowser;
}

/**
 * Direct Puppeteer search on Threads (threads.net/search?q=...)
 */
export async function checkThreads(query = '戰鬥陀螺 X') {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    const posts = await page.evaluate(() => {
      const items = [];
      const links = Array.from(document.querySelectorAll('a'));
      links.forEach(a => {
        const href = a.href || '';
        if (href.includes('/post/')) {
          const author = href.split('/@')[1]?.split('/')[0] || 'Threads 用戶';
          let parent = a;
          for (let i = 0; i < 4 && parent.parentElement; i++) {
            parent = parent.parentElement;
          }
          const text = (parent.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);

          if (!items.some(i => i.url === href)) {
            items.push({ url: href, author, text });
          }
        }
      });
      return items;
    });

    await page.close();

    return posts.map(p => ({
      id: `threads_${p.url.split('/post/')[1] || p.url}`,
      title: `[Threads 貼文] @${p.author}: ${p.text || '點擊查看動態內容'}`,
      price: 'Threads 社群動態',
      url: p.url,
      platform: 'Threads 社群',
      category: '社群與二手面交'
    }));
  } catch (err) {
    console.error('[Threads Scraper Error]:', err.message);
    return [];
  }
}

/**
 * Direct Puppeteer search on Facebook site (site:facebook.com ...)
 */
export async function checkFacebook(query = '戰鬥陀螺 X 二手 面交 社團') {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(`site:facebook.com ${query}`)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const posts = await page.evaluate(() => {
      const items = [];
      const links = Array.from(document.querySelectorAll('li.b_algo h2 a'));
      links.forEach(a => {
        const href = a.href || '';
        const title = (a.innerText || '').trim();
        if (href.includes('facebook.com') && title) {
          items.push({ url: href, title });
        }
      });
      return items;
    });

    await page.close();

    return posts.map(p => ({
      id: `facebook_${p.url.split('facebook.com/')[1] || p.title}`,
      title: `[Facebook 貼文/社團] ${p.title}`,
      price: 'FB 社群/二手討論',
      url: p.url,
      platform: 'Facebook 社團/粉專',
      category: '社群與二手面交'
    }));
  } catch (err) {
    console.error('[Facebook Scraper Error]:', err.message);
    return [];
  }
}

/**
 * Global Beyblade news search fallback
 */
export async function checkGlobalBeybladeNews() {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent('戰鬥陀螺 X 預購 販售 限定 補貨')}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const xml = await fetchText(url);
  if (!xml) return [];

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const content = match[1];
    const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);

    if (titleMatch && linkMatch) {
      const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const rawUrl = linkMatch[1].trim();
      if (isRelevantTitle(title)) {
        const id = `global_news_${rawUrl.split('/').pop() || title}`;
        items.push({
          id,
          title,
          price: '發售情報/快訊',
          url: rawUrl,
          platform: '全網快訊',
          category: '最新發售/情報'
        });
      }
    }
  }
  return items;
}

/**
 * Run all Social Media & Global News monitors
 */
export async function checkAllSocial() {
  const results = await Promise.allSettled([
    checkThreads(),
    checkFacebook(),
    checkGlobalBeybladeNews()
  ]);

  const allItems = [];
  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      allItems.push(...res.value);
    }
  });

  return allItems;
}
