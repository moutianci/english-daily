#!/usr/bin/env node
/**
 * auto-generate.js — 纯 Node.js 自动生成每日精读文章
 * 用于 GitHub Actions，不依赖 OpenClaw
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌ 缺少 GEMINI_API_KEY 或 OPENAI_API_KEY 环境变量');
  process.exit(1);
}

const TODAY = new Date().toISOString().slice(0, 10);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATES_FILE = path.join(__dirname, '..', 'dates.json');

// 随机话题
const TOPICS = [
  { theme: 'Economics & Finance', prompt: 'global trade, inflation, digital currency, or supply chains' },
  { theme: 'Technology & AI', prompt: 'artificial intelligence, social media, quantum computing, or cybersecurity' },
  { theme: 'Health & Medicine', prompt: 'sleep, nutrition, mental health, longevity, or pandemic preparedness' },
  { theme: 'Environment & Climate', prompt: 'renewable energy, biodiversity, extreme weather, or sustainable cities' },
  { theme: 'Society & Culture', prompt: 'remote work, education reform, urbanization, or demographic shifts' },
  { theme: 'Science & Space', prompt: 'space exploration, neuroscience, genetic engineering, or physics breakthroughs' },
  { theme: 'Sports & Entertainment', prompt: 'sports business, streaming media, gaming industry, or cultural trends' },
];

// 用日期做伪随机选择
const dayIndex = parseInt(TODAY.slice(-2), 10) + parseInt(TODAY.slice(5, 7), 10);
const topic = TOPICS[dayIndex % TOPICS.length];

const SYSTEM_PROMPT = `You are a journalist for The Economist. Write an English article for English learners.

Requirements:
1. Write 4 paragraphs, each 60-100 words
2. Use sophisticated but accessible vocabulary (GRE/CET-6 level)
3. Style: analytical, concise, with varied sentence structures
4. Topic: ${topic.theme} — focus on ${topic.prompt}

For EACH paragraph, provide:
- "en": the English paragraph text
- "zh": accurate, natural Chinese translation
- "vocabulary": 4 key words, each with "word", "phonetic" (IPA), "meaning" (English abbreviation + Chinese), "example" (an example sentence)
- "difficult_sentences": 1 difficult sentence, each with "en", "zh" (explanation), "grammar" (analysis)

IMPORTANT: Output ONLY valid JSON. No markdown, no code blocks, no explanation outside JSON.`;

const USER_PROMPT = `Write today's article (date: ${TODAY}). Topic area: ${topic.prompt}.

Output the complete JSON object with this exact structure:
{
  "date": "${TODAY}",
  "source": "The Economist",
  "title": "Your article title here",
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

// 使用 https 模块（Node.js 内置）
function callGemini() {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
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
      timeout: 30000, // 30秒超时
    }, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`📡 API Response: ${res.statusCode}`);
        
        if (res.statusCode !== 200) {
          reject(new Error(`Gemini API error ${res.statusCode}: ${responseData.substring(0, 500)}`));
          return;
        }
        
        try {
          const data = JSON.parse(responseData);
          if (!data.candidates || !data.candidates[0]) {
            reject(new Error('No candidates in response'));
            return;
          }
          
          let content = data.candidates[0].content.parts[0].text.trim();
          
          // 提取 JSON
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) content = jsonMatch[0];
          content = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
          
          resolve(JSON.parse(content));
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (30s)'));
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`📝 Generating article for ${TODAY}...`);
  console.log(`🎯 Topic: ${topic.theme} (${topic.prompt})`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...`);

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
    const article = await callGemini();

    // 验证结构
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
    if (!dates[TODAY]) {
      dates[TODAY] = [];
    }
    if (!dates[TODAY].includes(TODAY)) {
      dates[TODAY].push(TODAY);
    }
    // Sort keys descending
    const sorted = {};
    Object.keys(dates).sort().reverse().forEach(k => sorted[k] = dates[k]);
    fs.writeFileSync(DATES_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`📅 dates.json updated (${Object.keys(sorted).length} days)`);

    console.log(`✨ Done! Title: ${article.title}`);
    console.log(`📊 ${article.paragraphs.length} paragraphs, ${article.paragraphs.reduce((s, p) => s + (p.vocabulary?.length || 0), 0)} vocabulary words`);
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
