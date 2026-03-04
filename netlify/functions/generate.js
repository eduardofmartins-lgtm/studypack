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

  const { topic = 'General Knowledge', grade = 'high', gradeDesc = '' } = body;

  const prompt = `Generate a complete study pack for: "${topic}"
Level: ${gradeDesc || grade}

You MUST return ONLY a single valid JSON object — no markdown fences, no prose, no extra text.
JSON structure:
{
  "flashcards": [
    { "front": "term", "back": "definition or explanation", "difficulty": "⭐ Easy" },
    ... exactly 10 objects
  ],
  "quiz": {
    "questions": [
      {
        "question": "...",
        "choices": ["choice A", "choice B", "choice C", "choice D"],
        "answer": "exact text of correct choice — must match one of choices exactly",
        "explanation": "why this is correct"
      },
      ... exactly 10 objects
    ]
  },
  "cheat_sheet": "plain-text key facts, formulas, dates and names — use dash bullets and blank lines",
  "study_guide": "plain-text guide with === SECTION HEADERS ===, covering main concepts, examples and exam tips"
}`;

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
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator. You always respond with valid JSON only — no markdown, no prose, no explanation outside the JSON.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, headers, body: JSON.stringify({ error: 'OpenRouter error: ' + err }) };
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';

    let clean = raw.replace(/```json[\s\S]*?```/gi, '').replace(/```[\s\S]*?```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned invalid JSON. Please try again.' }) };
    }
    clean = clean.substring(start, end + 1);

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI returned malformed JSON. Please try again.' }) };
    }

    if (parsed.quiz && Array.isArray(parsed.quiz.questions)) {
      parsed.quiz.questions.forEach(q => {
        if (!Array.isArray(q.choices) || q.choices.length < 2) return;
        if (!q.choices.includes(q.answer)) {
          const fix = q.choices.find(c => c.toLowerCase() === (q.answer || '').toLowerCase());
          q.answer = fix || q.choices[0];
        }
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Unknown server error.' }) };
  }
};
