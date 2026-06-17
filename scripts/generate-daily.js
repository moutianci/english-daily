#!/usr/bin/env node
/**
 * generate-daily.js — 生成每日精读数据骨架
 * 用法: node scripts/generate-daily.js [YYYY-MM-DD]
 * 默认: 今天
 */

const fs = require('fs');
const path = require('path');

const dateArg = process.argv[2];
const today = dateArg || new Date().toISOString().slice(0, 10);

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('日期格式应为 YYYY-MM-DD');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const skeleton = {
  date: today,
  source: "",
  title: "",
  url: "",
  paragraphs: [
    {
      en: "",
      zh: "",
      vocabulary: [
        { word: "", phonetic: "", meaning: "", example: "" }
      ],
      difficult_sentences: [
        { en: "", zh: "", grammar: "" }
      ]
    }
  ]
};

const outPath = path.join(dataDir, `${today}.json`);
fs.writeFileSync(outPath, JSON.stringify(skeleton, null, 2), 'utf-8');

// Update dates.json
const datesPath = path.join(__dirname, '..', 'dates.json');
let dates = [];
if (fs.existsSync(datesPath)) {
  dates = JSON.parse(fs.readFileSync(datesPath, 'utf-8'));
}
if (!dates.includes(today)) {
  dates.push(today);
  dates.sort().reverse();
  fs.writeFileSync(datesPath, JSON.stringify(dates, null, 2), 'utf-8');
}

console.log(`✅ 已生成骨架文件: ${outPath}`);
console.log(`📝 请编辑该文件，填入文章内容和解析。`);
