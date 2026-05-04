const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

module.exports = async (req, res) => {
  // Add CORS headers for local development and direct API access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    let symbols = [];
    
    // Parse body if Vercel hasn't already (sometimes depends on content-type)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (body && body.symbols && Array.isArray(body.symbols)) {
      symbols = body.symbols;
    }

    if (!symbols || symbols.length === 0) {
      return res.status(200).json([]);
    }

    // Deduplicate symbols to save API calls
    const uniqueSymbols = [...new Set(symbols)];

    // Fetch quotes for all symbols concurrently using yahoo-finance2
    // It gracefully handles an array of symbols
    const quotes = await yahooFinance.quote(uniqueSymbols);
    
    // Normalize response to array if a single symbol was returned as an object
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    // Map the results to the standard shape expected by our frontend
    const results = quotesArray.map(quote => {
      // Different markets/assets might have slightly different field names in YF
      const price = quote.regularMarketPrice || quote.price;
      const prevClose = quote.regularMarketPreviousClose || quote.regularMarketOpen || price;
      
      const chgAbs = price - prevClose;
      const chgPct = prevClose > 0 ? (chgAbs / prevClose) * 100 : 0;
      
      return {
        symbol: quote.symbol,
        price: price,
        chg: chgPct,
        chgAbs: chgAbs,
        dir: chgAbs >= 0 ? 'up' : 'dn',
        name: quote.shortName || quote.longName || quote.symbol,
        prevClose: prevClose
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching live prices:', error);
    res.status(500).json({ error: 'Failed to fetch market data', details: error.message });
  }
};
