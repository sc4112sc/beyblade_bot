import puppeteer from 'puppeteer';
import fs from 'fs';

const THREADS_QUERIES = [
  '二手陀螺',
  '陀螺 面交',
  '戰鬥陀螺 面交',
  'UX 面交',
  'CX 面交'
];

const BEYBLADE_KEYWORDS = [
  '陀螺', '戰鬥陀螺', 'Beyblade',
  'UX', 'CX', 'BX', '黑龍', '青龍', '白虎', '朱雀', '玄武', '天照', '月讀'
];

function isBeyblade(text = '') {
  const lower = text.toLowerCase();
  return BEYBLADE_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

function parseThreadsDate(str = '') {
  if (!str) return Date.now();
  const s = str.trim();

  // ISO / date-like  ("2026-7-20", "2026-07-28T...")
  if (/^\d{4}/.test(s)) {
    const ts = new Date(s).getTime();
    return isNaN(ts) ? Date.now() : ts;
  }

  const now = Date.now();
  // Relative: "N天", "N小時", "N分鐘"
  const dayMatch   = s.match(/(\d+)天/);
  const hourMatch  = s.match(/(\d+)小時/);
  const minMatch   = s.match(/(\d+)分/);
  if (dayMatch)   return now - Number(dayMatch[1])   * 86400000;
  if (hourMatch)  return now - Number(hourMatch[1])  * 3600000;
  if (minMatch)   return now - Number(minMatch[1])   * 60000;

  return now;
}

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;

  const opts = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--lang=zh-TW'
    ]
  };

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(chromePath)) opts.executablePath = chromePath;

  _browser = await puppeteer.launch(opts);
  return _browser;
}

export async function checkThreads() {
  const results = [];
  const seenUrls = new Set();

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    for (const query of THREADS_QUERIES) {
      const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=recent`;

      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 22000 });
        await new Promise(r => setTimeout(r, 3000));

        const posts = await page.evaluate(() => {
          const found = [];
          const anchors = Array.from(document.querySelectorAll('a[href*="/post/"]'));

          for (const a of anchors) {
            const href = a.href || '';
            const postId = href.split('/post/')[1] || '';
            if (!postId || postId.includes('/')) continue;

            const authorMatch = href.match(/\/@([^/]+)\/post\//);
            const author = authorMatch ? authorMatch[1] : '未知用戶';

            let card = a.parentElement;
            let timeEl = null;
            for (let i = 0; i < 25 && card && card !== document.body; i++) {
              const times = card.querySelectorAll('time');
              const textLen = (card.innerText || '').length;
              if (times.length === 1 && textLen > 30) {
                timeEl = times[0];
                break;
              }
              card = card.parentElement;
            }

            if (!timeEl || !card) continue;

            const datetime = timeEl.getAttribute('datetime') || timeEl.innerText || '';
            const rawLines = (card.innerText || '')
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0);

            const NOISE = /^(\d+|翻譯|顯示更多|更多|查看|按讚|留言|分享|回覆|篩選|最新|無法提供此內容)$/;
            const contentLines = rawLines.slice(2).filter(l => !NOISE.test(l));
            const rawText = contentLines.join(' ').replace(/\s+/g, ' ').trim();

            if (!found.some(f => f.href === href)) {
              found.push({ href, author, text: rawText.slice(0, 300), datetime });
            }
          }
          return found;
        });

        console.log(`[Threads] "${query}" → ${posts.length} posts`);

        for (const p of posts) {
          if (!seenUrls.has(p.href)) {
            seenUrls.add(p.href);
            const ts = parseThreadsDate(p.datetime);
            results.push({
              id: `threads_${p.href}`,
              title: `@${p.author}: ${p.text || '(點擊查看貼文)'}`.slice(0, 150),
              price: p.text.slice(0, 100) || 'Threads 最新貼文',
              url: p.href,
              platform: 'Threads',
              category: '社群與二手面交',
              pubDateStr: p.datetime,
              publishedAt: ts
            });
          }
        }
      } catch (err) {
        console.error(`[Threads] Error searching for ${query}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Threads] Core execution error:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
  }

  // Filter valid Beyblade posts within last 7 days
  const now = Date.now();
  const validResults = results.filter(r => {
    if ((now - r.publishedAt) > 7 * 86400000) return false;
    if (!isBeyblade(r.title) && !isBeyblade(r.price)) return false;
    return true;
  });

  return validResults;
}
