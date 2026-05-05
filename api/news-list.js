const https = require('https');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Fetch URL and return raw text
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Parse RSS/XML items from Google News feed
function parseRssItems(xml, maxItems = 5) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  const now = new Date();
  const MAX_AGE_DAYS = 60; // filter out articles older than 60 days

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const link  = (block.match(/<link>(.*?)<\/link>/) || block.match(/<feedburner:origLink>(.*?)<\/feedburner:origLink>/))?.[1] || '';
    const pub   = (block.match(/<source[^>]*>(.*?)<\/source>/))?.[1] || 'Google News';
    const dateStr = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';

    if (!title) continue;

    const date = dateStr ? new Date(dateStr) : new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);

    // Skip articles older than MAX_AGE_DAYS
    if (diffDays > MAX_AGE_DAYS) continue;

    const diffMin = Math.floor((now - date) / 60000);
    const timeStr = diffMin < 60
      ? `${Math.max(1, diffMin)}m ago`
      : diffMin < 1440
        ? `${Math.floor(diffMin / 60)}h ago`
        : `${Math.floor(diffMin / 1440)}d ago`;

    // Decode HTML entities
    const cleanTitle = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    items.push({ h: cleanTitle, t: `${pub} · ${timeStr}`, link, date });
  }

  // Sort newest first, then trim to maxItems
  items.sort((a, b) => b.date - a.date);
  return items.slice(0, maxItems).map(({ h, t, link }) => ({ h, t, link }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol query param' });

  try {
    // Step 1: Get company short name (e.g. "WIPRO.NS" -> "Wipro")
    let companyName = symbol.replace(/\.(NS|BO)$/i, ''); // fallback
    try {
      const quote = await yahooFinance.quote(symbol, { fields: ['shortName', 'longName'] });
      if (quote?.shortName) {
        // Use a clean, short version: "WIPRO LTD" -> "Wipro", "Reliance Industries Limited" -> "Reliance Industries"
        companyName = quote.shortName
          .replace(/ LTD\.?$/i, '')
          .replace(/ LIMITED\.?$/i, '')
          .replace(/ INC\.?$/i, '')
          .trim();
      }
    } catch (_) {}

    // Step 2: Fetch from Google News RSS - use qdr:m to only get news from the past month
    const query = encodeURIComponent(`${companyName} NSE stock`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:m`;
    
    const xml = await fetchUrl(rssUrl);
    let newsItems = parseRssItems(xml, 5);

    // Fallback 1: if no recent articles, try without "NSE stock" suffix
    if (newsItems.length === 0) {
      const rssUrl2 = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:m`;
      const xml2 = await fetchUrl(rssUrl2);
      newsItems = parseRssItems(xml2, 5);
    }

    // Fallback 2: if still nothing (very low coverage stock), relax to 6-month window
    if (newsItems.length === 0) {
      const rssUrl3 = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const xml3 = await fetchUrl(rssUrl3);
      newsItems = parseRssItems(xml3, 5);
    }

    res.status(200).json(newsItems);

  } catch (err) {
    console.error('News list fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news list' });
  }
};
