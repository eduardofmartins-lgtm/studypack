exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing OPENROUTER_API_KEY environment variable.' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body.' }) }; }

  const { topic = '', grade = 'high', systemPrompt = '', messages = [] } = body;

  if (!messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No messages provided.' }) };
  }

  const gradeMap = {
    elementary: 'elementary school students (age 6–11) — use very simple, friendly language',
    middle:     'middle school students (age 11–14) — clear and accessible language',
    high:       'high school students (age 14–18) — detailed explanations with examples',
    college:    'college students — advanced technical depth and precise vocabulary'
  };

  const sys = systemPrompt ||
    `You are a friendly, encouraging AI tutor for ${gradeMap[grade] || gradeMap.high}. ` +
    `The topic is: "${topic}". ` +
    `Give concise, clear, educational answers. Use examples when helpful. ` +
    `Keep responses under 180 words. Respond in the same language the user writes in.`;

  const trimmed = messages.slice(-20);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://studypackhack.netlify.app',
        'X-Title': 'StudyPack'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        max_tokens: 512,
        temperature: 0.7,
        messages: [
          { role: 'system', content: sys },
          ...trimmed.map(m => ({ role: m.role, content: m.content }))
        ]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, headers, body: JSON.stringify({ error: 'OpenRouter error: ' + err }) };
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't respond. Please try again.";

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Unknown server error.' }) };
  }
};
