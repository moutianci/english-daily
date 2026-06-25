#!/usr/bin/env node
/**
 * auto-generate.js — 自动生成每日精读文章
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DOUBAO_KEY = process.env.DOUBAO_API_KEY;
const DOUBAO_MODEL = process.env.DOUBAO_MODEL || 'doubao-seed-2-0-pro-260215';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

if (!OPENAI_KEY && !GEMINI_KEY && !DOUBAO_KEY && !DEEPSEEK_KEY) {
  console.error('❌ 缺少 API KEY 环境变量');
  process.exit(1);
}

// 从文本中提取完整的 JSON 对象（正确处理嵌套大括号）
function extractJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (c === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  throw new Error('Incomplete JSON object (unmatched braces)');
}

// 使用北京时间 (UTC+8)，与 cron 触发时间一致
const beijingMs = Date.now() + 8 * 3600 * 1000;
const TODAY = new Date(beijingMs).toISOString().slice(0, 10);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATES_FILE = path.join(__dirname, '..', 'dates.json');

// 随机话题（新概念英语 3-4 册风格）
const TOPICS = [
  { theme: 'Life & Experience', prompt: 'daily life stories, personal reflections, or interesting experiences' },
  { theme: 'Nature & Animals', prompt: 'wildlife, natural scenery, pets, or ecological stories' },
  { theme: 'Work & Career', prompt: 'jobs, professions, workplace stories, or career advice' },
  { theme: 'Travel & Culture', prompt: 'travel experiences, cultural differences, customs, or famous landmarks' },
  { theme: 'Science & Discovery', prompt: 'scientific discoveries, inventions, space exploration, or curious facts' },
  { theme: 'History & Society', prompt: 'historical events, social phenomena, cultural heritage, or famous figures' },
  { theme: 'Health & Lifestyle', prompt: 'healthy living, habits, diet, exercise, or mental well-being' },
];

const dayIndex = parseInt(TODAY.slice(-2), 10) + parseInt(TODAY.slice(5, 7), 10);
const topic = TOPICS[dayIndex % TOPICS.length];

const SYSTEM_PROMPT = `You are an English teacher writing for Chinese learners. Write in the style of New Concept English Book 3 or 4 — clear, elegant, and slightly literary prose.

Requirements:
1. Write 4 paragraphs, each 60-100 words. Each paragraph tells a coherent part of the story.
2. Language level: intermediate-to-advanced, similar to NCE Book 3-4 (precise word choices, vivid expressions)
3. Topic: ${topic.theme} — ${topic.prompt}

For EACH paragraph, provide:
- "en": the English paragraph text
- "zh": accurate, natural Chinese translation
- "vocabulary": 4 key words from this paragraph, each with:
  - "word": the English word
  - "phonetic": IPA pronunciation (e.g. /ɪɡˈzɑːmpl/)
  - "meaning": part of speech abbreviation + Chinese meaning (e.g. "n. 例子；榜样")
  - "example": an example sentence using the word
- "difficult_sentences": 1 complex sentence from this paragraph, each with:
  - "en": the sentence text
  - "zh": Chinese translation
  - "grammar": grammar structure analysis

IMPORTANT: Output ONLY valid JSON. No markdown, no code blocks, no explanation outside JSON.`;

const USER_PROMPT = `Write today's article (date: ${TODAY}). Topic area: ${topic.prompt}.

Output the complete JSON object with this exact structure:
{
  "date": "${TODAY}",
  "source": "The Economist",
  "title": "Your article title here",
  "titleZh": "Your Chinese article title here",
  "url": "",
  "paragraphs": [
    {
      "en": "English paragraph...",
      "zh": "中文翻译...",
      "vocabulary": [
        {"word": "example", "phonetic": "/ɪɡˈzæmpəl/", "meaning": "n. 例子", "example": "This is an example."}
      ],
      "difficult_sentences": [
        {"en": "The difficult sentence.", "zh": "解释", "grammar": "语法分析"}
      ]
    }
  ]
}

Remember: Exactly 4 paragraphs. Output ONLY the JSON object.`;

// OpenAI API 调用
function callOpenAI() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    console.log('📡 Calling OpenAI API...');
    
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 60000,
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`📡 OpenAI Response: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          reject(new Error(`OpenAI API error ${res.statusCode}: ${responseData.substring(0, 500)}`));
          return;
        }
        try {
          const d = JSON.parse(responseData);
          let content = d.choices[0].message.content.trim();
          content = extractJSON(content);
          resolve(JSON.parse(content));
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// Gemini API 调用
function callGemini() {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const data = JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${USER_PROMPT}` }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 4000 },
    });

    console.log('📡 Calling Gemini API...');
    
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 60000,
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`📡 Gemini Response: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          reject(new Error(`Gemini API error ${res.statusCode}: ${responseData.substring(0, 500)}`));
          return;
        }
        try {
          const d = JSON.parse(responseData);
          let content = d.candidates[0].content.parts[0].text.trim();
          content = extractJSON(content);
          resolve(JSON.parse(content));
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// DeepSeek API 调用 — OpenAI 兼容接口，全球可访问
function callDeepSeek() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    console.log('📡 Calling DeepSeek API...');
    
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 60000,
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`📡 DeepSeek Response: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          reject(new Error(`DeepSeek API error ${res.statusCode}: ${responseData.substring(0, 500)}`));
          return;
        }
        try {
          const d = JSON.parse(responseData);
          let content = d.choices[0].message.content.trim();
          content = extractJSON(content);
          resolve(JSON.parse(content));
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// Doubao (豆包) API 调用 — OpenAI 兼容接口
function callDoubao() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: DOUBAO_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    console.log(`📡 Calling Doubao API (model: ${DOUBAO_MODEL})...`);
    
    const req = https.request({
      hostname: 'ark.cn-beijing.volces.com',
      path: '/api/v3/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DOUBAO_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 60000,
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`📡 Doubao Response: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          reject(new Error(`Doubao API error ${res.statusCode}: ${responseData.substring(0, 500)}`));
          return;
        }
        try {
          const d = JSON.parse(responseData);
          let content = d.choices[0].message.content.trim();
          content = extractJSON(content);
          resolve(JSON.parse(content));
        } catch (err) {
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`📝 Generating article for ${TODAY}...`);
  console.log(`🎯 Topic: ${topic.theme}`);
  console.log(`🔑 OPENAI_KEY exists: ${!!OPENAI_KEY}`);
  console.log(`🔑 GEMINI_KEY exists: ${!!GEMINI_KEY}`);
  console.log(`🔑 DOUBAO_KEY exists: ${!!DOUBAO_KEY}`);
  console.log(`🔑 DEEPSEEK_KEY exists: ${!!DEEPSEEK_KEY}`);
  console.log(`🤖 DOUBAO_MODEL: ${DOUBAO_MODEL}`);

  // 检查是否已有当天文章
  if (fs.existsSync(DATA_DIR)) {
    const existing = path.join(DATA_DIR, `${TODAY}.json`);
    if (fs.existsSync(existing)) {
      console.log(`⚠️ Article for ${TODAY} already exists, skipping.`);
      return;
    }
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    // 失败链式重试：DeepSeek → OpenAI → Gemini
    let article;
    let lastError;
    
    if (DEEPSEEK_KEY) {
      try {
        article = await callDeepSeek();
      } catch (err) {
        console.log(`⚠️ DeepSeek failed: ${err.message.substring(0, 100)}`);
        lastError = err;
      }
    }
    
    if (!article && OPENAI_KEY) {
      console.log('🔄 Trying OpenAI...');
      try {
        article = await callOpenAI();
      } catch (err) {
        console.log(`⚠️ OpenAI failed: ${err.message.substring(0, 100)}`);
        lastError = err;
      }
    }
    
    if (!article && GEMINI_KEY) {
      console.log('🔄 Trying Gemini...');
      try {
        article = await callGemini();
      } catch (err) {
        console.log(`⚠️ Gemini failed: ${err.message.substring(0, 100)}`);
        lastError = err;
      }
    }
    
    if (!article) {
      throw lastError || new Error('No API available');
    }

    if (!article.paragraphs || article.paragraphs.length < 3) {
      throw new Error('Article has fewer than 3 paragraphs');
    }

    // 保存文章
    const articlePath = path.join(DATA_DIR, `${TODAY}.json`);
    fs.writeFileSync(articlePath, JSON.stringify(article, null, 2), 'utf-8');
    console.log(`✅ Article saved: ${articlePath}`);

    // 更新 dates.json
    let dates = {};
    if (fs.existsSync(DATES_FILE)) {
      dates = JSON.parse(fs.readFileSync(DATES_FILE, 'utf-8'));
    }
    if (!dates[TODAY]) dates[TODAY] = [];
    // 新格式：对象数组（支持同日多篇）
    const articleId = TODAY;
    const entry = { id: articleId, title: article.title, titleZh: article.titleZh || '' };
    const exists = dates[TODAY].some(e =>
      (typeof e === 'object' ? e.id : e) === articleId
    );
    if (!exists) dates[TODAY].push(entry);
    // 兼容旧格式（纯字符串数组）
    if (typeof dates[TODAY][0] === 'string') {
      dates[TODAY] = dates[TODAY].map(id => ({ id, title: id, titleZh: '' }));
    }
    // 补全 titleZh
    dates[TODAY] = dates[TODAY].map(e => ({
      id: typeof e === 'object' ? e.id : e,
      title: typeof e === 'object' ? (e.title || e.id) : e,
      titleZh: typeof e === 'object' ? (e.titleZh || '') : ''
    }));
    const sorted = {};
    Object.keys(dates).sort().reverse().forEach(k => sorted[k] = dates[k]);
    fs.writeFileSync(DATES_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`📅 dates.json updated`);
    console.log(`✨ Done! Title: ${article.title}`);
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
