import { fetchText } from './base.js';

const KEYWORDS = ['戰鬥陀螺', 'Beyblade', 'BX-', 'UX-', 'CX-', '陀螺'];

function isRelevantTitle(title = '') {
  if (!title) return false;
  const lower = title.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

async function fetchRssQuery(query, platformName, category) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const xml = await fetchText(url);
  if (!xml) return [];

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
    const content = match[1];
    const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);

    if (titleMatch && linkMatch) {
      const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const rawUrl = linkMatch[1].trim();
      if (isRelevantTitle(title)) {
        const id = `${platformName}_${rawUrl.split('/').pop() || title}`;
        items.push({
          id,
          title,
          price: '最新上架/商品資訊',
          url: rawUrl,
          platform: platformName,
          category
        });
      }
    }
  }
  return items;
}

export async function checkMomo() {
  return await fetchRssQuery('site:momoshop.com.tw 戰鬥陀螺', 'momo購物網', '電商購物');
}

export async function checkStepStone() {
  return await fetchRssQuery('site:stepstone.com.tw 戰鬥陀螺', '墊腳石購物網', '電商購物');
}

export async function checkEslite() {
  return await fetchRssQuery('site:eslite.com 戰鬥陀螺', '誠品線上', '電商購物');
}

export async function checkKingstone() {
  return await fetchRssQuery('site:jyt.com.tw 戰鬥陀螺', '金玉堂購物網', '電商購物');
}

export async function checkDonghai() {
  return await fetchRssQuery('site:ehobby.com.tw 戰鬥陀螺', '東海模型', '電商購物');
}

export async function checkToyWorld() {
  return await fetchRssQuery('site:toyworld.com.tw 戰鬥陀螺', 'Toy World', '電商購物');
}

/**
 * Run all E-commerce monitors
 */
export async function checkAllEcommerce() {
  const results = await Promise.allSettled([
    checkMomo(),
    checkStepStone(),
    checkEslite(),
    checkKingstone(),
    checkDonghai(),
    checkToyWorld()
  ]);

  const allItems = [];
  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      allItems.push(...res.value);
    }
  });

  return allItems;
}
