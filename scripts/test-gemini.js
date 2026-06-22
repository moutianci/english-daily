#!/usr/bin/env node
/**
 * test-gemini.js — 测试 Gemini API 是否可用
 */

const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

console.log("🔍 检查环境变量...");
console.log("  GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ 已设置" : "❌ 未设置");
console.log("  OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ 已设置" : "❌ 未设置");

if (!API_KEY) {
  console.error("\n❌ 缺少 API KEY！请在 GitHub Secrets 中设置 GEMINI_API_KEY");
  process.exit(1);
}

console.log("\n🔊 测试 Gemini API 调用...");

async function testGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
  console.log("  请求 URL:", url.replace(API_KEY, "***"));
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Say 'hello' in one word." }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 100 },
    }),
  });

  console.log("  响应状态:", resp.status, resp.statusText);
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "(无响应)";
  console.log("\n✅ Gemini API 正常！");
  console.log("  回复:", text);
}

testGemini().catch(err => {
  console.error("\n❌ 测试失败:", err.message);
  process.exit(1);
});
