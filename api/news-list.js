const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol query param' });

  try {
    const queryOptions = { newsCount: 5, lang: 'en-US', region: 'IN', quotesCount: 0 };
    const newsData = await yahooFinance.search(symbol, queryOptions);
    const newsItems = (newsData.news || []).map(n => {
      // Handle Date object or timestamp
      const date = n.providerPublishTime instanceof Date ? n.providerPublishTime : new Date(n.providerPublishTime || Date.now());
      const now = new Date();
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
      const timeStr = diffHours < 1 ? 'Just now' : diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours/24)}d ago`;

      return {
        h: n.title,
        t: `${n.publisher} · ${timeStr}`,
        link: n.link
      };
    });

    res.status(200).json(newsItems);

  } catch (err) {
    console.error('News list fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news list' });
  }
};
