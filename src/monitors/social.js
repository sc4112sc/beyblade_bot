import fs from 'fs';
import puppeteer from 'puppeteer';
import { fetchText } from './base.js';

const SUBJECT_KEYWORDS = ['戰鬥陀螺', '陀螺', 'beyblade', 'UX', 'BX', 'CX'];
const ACTION_KEYWORDS = ['面交', '二手', '出清', '交易', '收', '售', '預購'];

function generateQueryMatrix(prefix = '', suffix = '') {
  const queries = [];
  for (const subject of SUBJECT_KEYWORDS) {
    for (const action of ACTION_KEYWORDS) {
      queries.push(`${prefix}${subject} ${action}${suffix}`.trim());
    }
  }
  return queries;
}

const CORE_KEYWORDS = ['戰鬥陀螺', '陀螺', 'beyblade', 'ux', 'cx', 'bx'];

function isRelevantTitle(title = '') {
  if (!title) return false;
  const lower = title.toLowerCase();
  return CORE_KEYWORDS.some(k => lower.includes(k));
}

let sharedBrowser = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.connected) {
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
 * Direct Puppeteer search on Threads (threads.net/search?q=...) across dynamically generated matrix queries
 */
export async function checkThreads() {
  // Use 5 most effective queries to keep total time under 60s
  const queries = [
    '二手陀螺',
    '陀螺 面交',
    '戰鬥陀螺 面交',
    'UX 面交',
    'CX 面交'
  ];
  const allPosts = [];

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    for (const query of queries) {
      try {
        const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=recent`;
        // Must use networkidle2 — Threads is a React SPA; domcontentloaded only gives empty HTML skeleton
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 3500));

        const posts = await page.evaluate(() => {
          const items = [];
          const links = Array.from(document.querySelectorAll('a[href*="/post/"]'));
          links.forEach(a => {
            const href = a.href || '';
            // Skip /media sub-links (duplicates), keep only main post links
            if (!href.includes('/post/') || href.includes('/post/') && href.split('/post/')[1]?.includes('/')) return;

            // Extract author from URL: /@username/post/...
            const author = href.match(/\/@([^/]+)\//)?.[1] || 'Threads用戶';

            // Walk up to find the post container (article or role=article)
            let container = a;
            for (let i = 0; i < 10 && container.parentElement; i++) {
              container = container.parentElement;
              const role = container.getAttribute('role');
              const tag = container.tagName?.toLowerCase();
              if (role === 'article' || tag === 'article') break;
            }

            const text = (container.innerText || a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            const timeEl = container.querySelector('time');
            const pubDateStr = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText || '') : '';

            if (!items.some(i => i.url === href)) {
              items.push({ url: href, author, text, pubDateStr });
            }
          });
          return items;
        });

        console.log(`[Threads] Query "${query}" found ${posts.length} raw posts`);
        posts.slice(0, 3).forEach(p => console.log('  ->', p.url, '|', p.text.slice(0, 60)));

        posts.forEach(p => {
          // Since our query already contains beyblade keywords, trust the source.
          // Only skip if post text explicitly indicates it's totally unrelated.
          if (!allPosts.some(existing => existing.url === p.url)) {
            allPosts.push(p);
          }
        });
      } catch (err) {
        console.error(`[Threads Query Error: "${query}"]:`, err.message);
      }
    }

    await page.close();

    return allPosts.map(p => ({
      id: `threads_${p.url.split('/post/')[1] || p.url.split('/t/')[1] || p.url}`,
      title: `[Threads 最新動態] @${p.author}: ${p.text || '點擊查看動態內容'}`,
      price: 'Threads 今日最新貼文',
      url: p.url,
      platform: 'Threads 社群',
      category: '社群與二手面交',
      pubDateStr: p.pubDateStr,
      publishedAt: p.pubDateStr ? new Date(p.pubDateStr).getTime() : Date.now()
    }));
  } catch (err) {
    console.error('[Threads Scraper Error]:', err.message);
    return [];
  }
}

/**
 * Direct Facebook recent post search (site:facebook.com ... when:1d) across dynamically generated matrix queries
 */
export async function checkFacebook() {
  const queries = generateQueryMatrix('site:facebook.com ', ' when:1d');

  const allItems = [];

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
      const xml = await fetchText(url);
      if (!xml) continue;

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && allItems.length < 50) {
        const content = match[1];
        const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);
        const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          const rawUrl = linkMatch[1].trim();
          const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : '';
          const publishedAt = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();

          if (isRelevantTitle(title) && !allItems.some(existing => existing.url === rawUrl)) {
            const id = `facebook_${rawUrl.split('/').pop() || title}`;
            allItems.push({
              id,
              title: `[FB 最新買賣] ${title.replace(/\s*-\s*facebook\.com$/i, '')}`,
              price: 'FB 今日最新貼文',
              url: rawUrl,
              platform: 'Facebook 社團/粉專',
              category: '社群與二手面交',
              pubDateStr,
              publishedAt
            });
          }
        }
      }
    } catch (err) {
      console.error(`[Facebook Query Error: "${query}"]:`, err.message);
    }
  }

  return allItems;
}

/**
 * Global Beyblade news & fast alerts search (recent 24h) across multiple queries
 */
export async function checkGlobalBeybladeNews() {
  const queries = [
    '戰鬥陀螺 X 預購 販售 限定 補貨 when:1d',
    '戰鬥陀螺 面交 二手 出清 販售 when:1d'
  ];

  const allItems = [];

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
      const xml = await fetchText(url);
      if (!xml) continue;

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && allItems.length < 30) {
        const content = match[1];
        const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);
        const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          const rawUrl = linkMatch[1].trim();
          const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : '';
          const publishedAt = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();

          if (isRelevantTitle(title) && !allItems.some(existing => existing.url === rawUrl)) {
            const id = `global_news_${rawUrl.split('/').pop() || title}`;
            allItems.push({
              id,
              title,
              price: '發售情報/快訊',
              url: rawUrl,
              platform: '全網快訊',
              category: '最新發售/情報',
              pubDateStr,
              publishedAt
            });
          }
        }
      }
    } catch (err) {
      console.error(`[Global News Query Error: "${query}"]:`, err.message);
    }
  }

  return allItems;
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

  // Sort strictly by publishedAt descending (newest post time first)
  return allItems.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
}
