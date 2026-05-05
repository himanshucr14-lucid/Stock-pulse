const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Map frontend timeframes to Yahoo Finance parameters
const TF_MAP = {
  '1D': { days: 2, interval: '5m' }, // Use 2 days to ensure enough data for the current day
  '5D': { days: 7, interval: '15m' },
  '1M': { days: 35, interval: '1d' },
  '3M': { days: 100, interval: '1d' },
  '1Y': { days: 370, interval: '1d' },
  '5Y': { days: 1850, interval: '1wk' }
};

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    
    let { symbol, tf } = body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    tf = tf || '1D';
    const params = TF_MAP[tf] || TF_MAP['1D'];

    // Calculate period1 (start date)
    const period1 = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
    
    const chartParams = {
      period1,
      interval: params.interval,
      return: 'array' // Ask for array of quotes
    };

    const result = await yahooFinance.chart(symbol, chartParams);
    
    if (!result || !result.quotes || result.quotes.length === 0) {
      return res.status(200).json([]);
    }

    // Map to our frontend format: { o, h, l, c, v, t }
    // Filter out null closes (happens sometimes during trading halts or pre-market)
    const formattedData = result.quotes
      .filter(q => q.close !== null)
      .map(q => ({
        t: new Date(q.date).getTime(),
        o: q.open || q.close,
        h: q.high || q.close,
        l: q.low || q.close,
        c: q.close,
        v: q.volume || 0
      }));

    res.status(200).json(formattedData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data', details: error.message });
  }
};
