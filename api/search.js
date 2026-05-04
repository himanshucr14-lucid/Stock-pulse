const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query parameter q is required and must be at least 2 characters' });
  }

  try {
    const result = await yahooFinance.search(q, {
      quotesCount: 15,
      newsCount: 0
    });

    if (!result || !result.quotes) {
      return res.status(200).json([]);
    }

    // Filter to prioritize Indian exchanges
    const filtered = result.quotes
      .filter(quote => quote.isYahooFinance && (quote.symbol.endsWith('.NS') || quote.symbol.endsWith('.BO') || quote.exchange === 'NSI' || quote.exchange === 'BSE'))
      .map(quote => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname || quote.symbol,
        exchange: quote.exchange === 'NSI' ? 'NSE' : (quote.exchange === 'BSE' ? 'BSE' : quote.exchDisp || quote.exchange),
        type: quote.typeDisp || quote.quoteType
      }));

    res.status(200).json(filtered);
  } catch (error) {
    console.error('Search API Error:', error);
    res.status(500).json({ error: 'Failed to search', details: error.message });
  }
};
