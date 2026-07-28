/**
 * social.js — Beyblade X social monitor
 *
 * Threads  : Puppeteer headless (networkidle2 + time-element anchor)
 * Facebook : Google News RSS (site:facebook.com)
 */

import fs from 'fs';
import puppeteer from 'puppeteer';
import { fetchText } from './base.js';

// ─── Keyword Config ────────────────────────────────────────────────────────────
const BEYBLADE_KEYWORDS = ['戰鬥陀螺', '陀螺', 'beyblade', 'UX', 'BX', 'CX'];

// Threads search queries — keep small (5) so total runtime stays under 60s
const THREADS_QUERIES = [
  '二手陀螺',
  '陀螺 面交',
  '戰鬥陀螺 面交',
  'UX 面交',
  'CX 面交'
];

// Facebook via Google News RSS
const FB_QUERIES = [
  '戰鬥陀螺 二手 面交',
  '戰鬥陀螺 出售',
  '陀螺 面交 出售',
  'beyblade 二手 面交'
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function isBeyblade(text = '') {
  const lower = text.toLowerCase();
  return BEYBLADE_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;

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

// ─── Threads ───────────────────────────────────────────────────────────────────
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
      const searchUrl =
        `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=recent`;

      try {
        // networkidle2 is mandatory — Threads is a React SPA
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 22000 });
        await new Promise(r => setTimeout(r, 3000));

        const posts = await page.evaluate(() => {
          const found = [];

          // Every Threads post link contains /post/ in the href
          const anchors = Array.from(document.querySelectorAll('a[href*="/post/"]'));

          for (const a of anchors) {
            const href = a.href || '';

            // ① Skip sub-paths like /post/xxx/media or /post/xxx/likers
            const postId = href.split('/post/')[1] || '';
            if (!postId || postId.includes('/')) continue;

            // ② Extract @username from URL
            const authorMatch = href.match(/\/@([^/]+)\/post\//);
            const author = authorMatch ? authorMatch[1] : '未知用戶';

            // ③ Walk UP the DOM until we find the element that contains a <time>
            //    That element is the individual post card.
            let card = a.parentElement;
            let timeEl = null;
            for (let i = 0; i < 20 && card && card !== document.body; i++) {
              timeEl = card.querySelector('time');
              if (timeEl) break;
              card = card.parentElement;
            }

            if (!timeEl || !card) continue; // no card found → skip

            // ④ Extract text and date from the card
            const rawText = (card.innerText || '').replace(/\s+/g, ' ').trim();
            const datetime =
              timeEl.getAttribute('datetime') || timeEl.innerText || '';

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
            results.push({
              id: `threads_${p.href}`,
              title: `@${p.author}: ${p.text || '(點擊查看貼文)'}`.slice(0, 150),
              price: p.text.slice(0, 100) || 'Threads 最新貼文',
              url: p.href,
              platform: 'Threads',
              category: '社群與二手面交',
              pubDateStr: p.datetime,
              publishedAt: p.datetime ? new Date(p.datetime).getTime() : Date.now()
            });
          }
        }
      } catch (err) {
        console.error(`[Threads] "${query}" error:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Threads] Fatal:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
  }

  console.log(`[Threads] Done — ${results.length} unique posts`);
  return results;
}

// ─── Facebook (Google News RSS) ────────────────────────────────────────────────
export async function checkFacebook() {
  const results = [];
  const seenUrls = new Set();

  for (const query of FB_QUERIES) {
    const rssUrl =
      `https://news.google.com/rss/search?q=site:facebook.com+${encodeURIComponent(query)}` +
      `&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

    try {
      const xml = await fetchText(rssUrl);
      if (!xml) continue;

      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];

        const title =
          block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
          block.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link =
          block.match(/<link>(.*?)<\/link>/)?.[1] ||
          block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] || '';
        const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

        if (!link || seenUrls.has(link)) continue;
        if (!link.includes('facebook.com')) continue;
        if (!isBeyblade(title)) continue;

        seenUrls.add(link);
        results.push({
          id: `fb_${link}`,
          title: title.slice(0, 150),
          price: 'Facebook 貼文',
          url: link,
          platform: 'Facebook',
          category: '社群與二手面交',
          pubDateStr: pubDate,
          publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now()
        });
      }
    } catch (err) {
      console.error(`[Facebook] "${query}" error:`, err.message);
    }
  }

  console.log(`[Facebook] Done — ${results.length} posts`);
  return results;
}

// ─── Combined ─────────────────────────────────────────────────────────────────
export async function checkAllSocial() {
  const [threadsResult, fbResult] = await Promise.allSettled([
    checkThreads(),
    checkFacebook()
  ]);

  const threadItems = threadsResult.status === 'fulfilled' ? threadsResult.value : [];
  const fbItems = fbResult.status === 'fulfilled' ? fbResult.value : [];

  console.log(`[Social] Threads=${threadItems.length} | FB=${fbItems.length}`);

  // Interleave: Threads first, then FB, alternating
  const merged = [];
  const maxLen = Math.max(threadItems.length, fbItems.length);
  for (let i = 0; i < maxLen; i++) {
    if (threadItems[i]) merged.push(threadItems[i]);
    if (fbItems[i]) merged.push(fbItems[i]);
  }

  return merged;
}
