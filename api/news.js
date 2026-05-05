const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

    // 1. Fetch real-time news from Yahoo Finance
    const queryOptions = { newsCount: 4, lang: 'en-US', region: 'IN', quotesCount: 0 };
    const newsData = await yahooFinance.search(symbol, queryOptions);
    const newsItems = (newsData.news || []).map(n => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link
    }));

    if (newsItems.length === 0) {
      return res.status(200).json({
        tags: ['[No Recent News]'],
        summary: 'No major news headlines found for this symbol in the recent period.',
        articles: []
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Fallback if no API key
    if (!apiKey) {
      const topHeadline = newsItems[0].title;
      return res.status(200).json({
        tags: ['[Latest Headline]'],
        summary: `Latest news from ${newsItems[0].publisher}: "${topHeadline}". Add your Gemini API key for deep AI analysis.`,
        articles: newsItems
      });
    }

    // 3. Generate SEBI-Compliant AI Summary
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const promptContext = newsItems.map((n, i) => `${i + 1}. ${n.title} (${n.publisher})`).join('\n');
    
    const systemPrompt = `
You are a highly strictly regulated financial data extractor. You must adhere to Indian SEBI regulations.
NEVER provide investment advice, target prices, buy/sell recommendations, or predictions about the future.
Your ONLY job is to read the provided news headlines and output a factual, objective summary of the current fundamental context.

Data:
${promptContext}

Respond ONLY with a valid JSON object in this exact format:
{
  "tags": ["[Tag 1]", "[Tag 2]"], 
  "summary": "A 2-3 sentence purely factual summary of the news context. Use objective language."
}

Example tags: "[Earnings Release]", "[Sector Tailwinds]", "[Regulatory Update]", "[Macro Context]", "[Order Book Expansion]". Do NOT use tags like "[Bullish]" or "[Bearish]".
`;

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    let aiData;
    try {
      aiData = JSON.parse(responseText);
    } catch (e) {
      // Fallback if AI fails to return strict JSON
      aiData = {
        tags: ['[AI Processing]'],
        summary: 'AI processed the latest headlines, but the output could not be formatted correctly.'
      };
    }

    res.status(200).json({
      tags: aiData.tags,
      summary: aiData.summary,
      articles: newsItems
    });

  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news data' });
  }
};
