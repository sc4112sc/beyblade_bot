const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        ...options.headers
      },
      signal: AbortSignal.timeout(options.timeout || 10000),
      ...options
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`[FetchJson Error] ${url}:`, err.message);
    return null;
  }
}

export async function fetchText(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        ...options.headers
      },
      signal: AbortSignal.timeout(options.timeout || 10000),
      ...options
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } catch (err) {
    console.error(`[FetchText Error] ${url}:`, err.message);
    return null;
  }
}

/**
 * Fallback search engine scraper for JS-rendered or anti-bot sites
 */
export async function searchDuckDuckGo(siteDomain, keyword) {
  const query = siteDomain ? `site:${siteDomain} ${keyword}` : keyword;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const html = await fetchText(searchUrl);
  if (!html) return [];

  const results = [];
  const titleRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = titleRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();

    const actualUrlMatch = rawUrl.match(/uddg=([^&]+)/);
    const actualUrl = actualUrlMatch ? decodeURIComponent(actualUrlMatch[1]) : rawUrl;

    if (rawTitle && actualUrl && !actualUrl.includes('duckduckgo.com')) {
      results.push({
        title: rawTitle,
        url: actualUrl
      });
    }
  }

  return results;
}
