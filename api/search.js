const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Internal Yahoo Finance MF fund codes — always start with 0P
const INTERNAL_CODE_RE = /^0P[0-9A-Z]+$/;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query q must be at least 2 characters' });
  }

  try {
    // Attempt 3 things in parallel:
    // 1. Search by query (catches stocks that Yahoo indexes well)
    // 2. Direct quote lookup for QUERY.NS (catches exact symbol hits)
    // 3. Direct quote lookup for QUERY+BNK.NS and QUERY+BANK.NS (common Indian bank name patterns)
    const cleanQ   = q.trim().toUpperCase().replace(/\s+/g, '');
    const attempts = [
      yahooFinance.search(q, { quotesCount: 20, newsCount: 0 }).catch(() => null),
      yahooFinance.quote(`${cleanQ}.NS`).catch(() => null),
      yahooFinance.quote(`${cleanQ}BNK.NS`).catch(() => null),
      yahooFinance.quote(`${cleanQ}BANK.NS`).catch(() => null),
    ];

    const [searchRes, direct1, direct2, direct3] = await Promise.all(attempts);

    const seen = new Set();
    const results = [];

    // Helper: add a properly formatted direct quote result
    const addDirect = (dq) => {
      if (!dq || !dq.symbol) return;
      const rawSym = dq.symbol.replace(/\.(NS|BO)$/, '');
      if (seen.has(rawSym)) return;
      if (!dq.shortName && !dq.longName) return;
      seen.add(rawSym);
      results.push({
        symbol: dq.symbol,
        rawSym,
        name: dq.shortName || dq.longName || rawSym,
        exchange: dq.symbol.endsWith('.NS') ? 'NSE' : 'BSE',
        type: 'Stock',
        quoteType: 'EQUITY'
      });
    };

    // Add direct hits first (highest confidence)
    [direct1, direct2, direct3].forEach(addDirect);

    // Then parse search results, filtering out garbage
    const quotes = searchRes?.quotes || [];
    for (const quote of quotes) {
      if (!quote.isYahooFinance) continue;

      const isIndian = quote.symbol.endsWith('.NS') || quote.symbol.endsWith('.BO') ||
                       quote.exchange === 'NSI' || quote.exchange === 'BSE';
      if (!isIndian) continue;

      const rawSym = quote.symbol.replace(/\.(NS|BO)$/, '');
      if (seen.has(rawSym)) continue;          // Already added via direct lookup
      if (INTERNAL_CODE_RE.test(rawSym)) continue; // Internal code like 0P0001BAJT

      const name = quote.shortname || quote.longname || '';
      // Reject if name IS the internal code or IS just the symbol (no real name)
      if (!name || name === quote.symbol || name === rawSym || INTERNAL_CODE_RE.test(name)) continue;

      seen.add(rawSym);
      const qt = (quote.quoteType || '').toUpperCase();
      results.push({
        symbol: quote.symbol,
        rawSym,
        name,
        exchange: (quote.exchange === 'NSI' || quote.symbol.endsWith('.NS')) ? 'NSE' : 'BSE',
        type: qt === 'EQUITY' ? 'Stock' : qt === 'MUTUALFUND' ? 'Mutual Fund' : qt === 'ETF' ? 'ETF' : (quote.typeDisp || qt),
        quoteType: qt
      });
    }

    // Sort: EQUITY first, then ETF, then MF
    results.sort((a, b) => {
      const order = { 'EQUITY': 0, 'ETF': 1, 'MUTUALFUND': 2 };
      return (order[a.quoteType] ?? 3) - (order[b.quoteType] ?? 3);
    });

    res.status(200).json(results.slice(0, 10));
  } catch (error) {
    console.error('Search API Error:', error);
    res.status(500).json({ error: 'Failed to search', details: error.message });
  }
};
