import { fetchText } from './base.js';

const KEYWORDS = ['戰鬥陀螺', 'Beyblade', 'BX-', 'UX-', 'CX-', '二手', '面交', '預購', '限定', '補貨'];

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
          price: '社群/二手面交/發文資訊',
          url: rawUrl,
          platform: platformName,
          category
        });
      }
    }
  }
  return items;
}

export async function checkThreads() {
  return await fetchRssQuery('Threads 戰鬥陀螺 X 二手 面交 預購', 'Threads 社群', '社群與二手面交');
}

export async function checkFacebook() {
  return await fetchRssQuery('Facebook 戰鬥陀螺 X 二手 面交 社團 預購', 'Facebook 社團/粉專', '社群與二手面交');
}

export async function checkGlobalBeybladeNews() {
  return await fetchRssQuery('戰鬥陀螺 X 預購 販售 限定 補貨', '全網熱門快訊', '最新發售/情報');
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
