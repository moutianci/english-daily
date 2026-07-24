#!/usr/bin/env node
/**
 * embed-articles.js — 将 data/*.json 嵌入式到 index.html
 *
 * 将所有文章的完整内容嵌入到 index.html 的 EMBEDDED_ARTICLES 等三个变量，
 * 使页面无需网络请求即可直接加载全部数据。
 *
 * 用法（工作流中）: node scripts/embed-articles.js
 * 用法（本地调试）: node scripts/embed-articles.js --dry-run
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const DATA_DIR = path.join(ROOT, 'data');
const DRY_RUN = process.argv.includes('--dry-run');

const REPO = 'moutianci/english-daily';

// ─────────────────────────────────────────────────────────────
// 1. 从 GitHub 拉取最新 index.html（或从本地文件读取）
// ─────────────────────────────────────────────────────────────
function fetchIndexHTML() {
  try {
    const { execSync } = require('child_process');
    const raw = execSync(
      `gh api repos/${REPO}/contents/index.html --jq '.content' | base64 -d`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    console.log('📄 Fetched index.html from GitHub');
    return raw;
  } catch (err) {
    console.log('⚠️  Failed to fetch from GitHub, using local file');
    return fs.readFileSync(INDEX_PATH, 'utf-8');
  }
}

// ─────────────────────────────────────────────────────────────
// 2. 从 data/ 目录加载所有文章
// ─────────────────────────────────────────────────────────────
function loadAllArticles() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /\.json$/.test(f));
  const articles = {};
  const datesMap = {};

  for (const file of files) {
    const date = file.replace('.json', '');
    const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
    let article;
    try {
      article = JSON.parse(raw);
    } catch (e) {
      console.error(`  ⚠️  Failed to parse ${file}: ${e.message}`);
      continue;
    }

    articles[date] = article;

    if (!datesMap[date]) datesMap[date] = [];
    const entry = { id: date, title: article.title || date, titleZh: article.titleZh || '' };
    if (!datesMap[date].some(e => e.id === date)) {
      datesMap[date].push(entry);
    }
  }

  return { articles, datesMap };
}

// ─────────────────────────────────────────────────────────────
// 3. 从 HTML 中提取现有 EMBEDDED_ARTICLE_IDS（用于增量追加）
// ─────────────────────────────────────────────────────────────
function extractExistingIds(html) {
  const re = /const\s+EMBEDDED_ARTICLE_IDS\s*=\s*(\[[\s\S]*?\])\s*;/;
  const m = html.match(re);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]);
    return parsed.filter(id => typeof id === 'string');
  } catch (e) {
    console.error('  ⚠️  Failed to parse EMBEDDED_ARTICLE_IDS:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 4. 查找 section 边界：给定 "const NAME = " 后第一个字符位置，
//    返回该 section 末尾分号的索引（; 所在位置 + 1，即 after ';' 的位置）
// ─────────────────────────────────────────────────────────────
function findSectionEnd(html, eqPos) {
  let i = eqPos + 1;
  while (i < html.length && /\s/.test(html[i])) i++;
  let depth = 0, inStr = false, esc = false;
  while (i < html.length) {
    const c = html[i];
    if (esc) { esc = false; i++; continue; }
    if (c === '\\') { esc = true; i++; continue; }
    if (c === '"') { inStr = !inStr; i++; continue; }
    if (!inStr) {
      if (c === '{' || c === '[') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          let j = i + 1;
          while (j < html.length && /\s/.test(html[j])) j++;
          return j; // points to ';'
        }
      } else if (c === ']') {
        depth--;
        if (depth === 0) {
          let j = i + 1;
          while (j < html.length && /\s/.test(html[j])) j++;
          return j;
        }
      }
    }
    i++;
  }
  return -1;
}

function replaceSection(html, name, newValue) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`);
  const m = html.match(re);
  if (!m) {
    console.error(`  ⚠️  Could not find section: ${name}`);
    return html;
  }
  const eqPos = m.index + m[0].length - 1; // position of '='
  const semiPos = findSectionEnd(html, eqPos);
  if (semiPos < 0) {
    console.error(`  ⚠️  Could not find section end for: ${name}`);
    return html;
  }
  // Build: "const NAME = " + newValue + ";"
  const constKw = m[0].replace(/\s*=\s*$/, ' = '); // "const NAME = "
  const before = html.slice(0, m.index + constKw.length); // up to "const NAME = "
  const after = html.slice(semiPos); // from ';' onwards
  return before + newValue + after;
}

// ─────────────────────────────────────────────────────────────
// 5. 构建三个嵌入式数据块的文本
// ─────────────────────────────────────────────────────────────
function sortIds(ids) {
  return [...ids].sort((a, b) => {
    const aa = a.replace(/b$/, ''), ab = a.match(/b$/)?.[0] || '';
    const ba = b.replace(/b$/, ''), bb = b.match(/b$/)?.[0] || '';
    if (aa !== ba) return aa.localeCompare(ba);
    return ab.localeCompare(bb);
  });
}

function buildEmbeddedSections(articles, datesMap, existingIds) {
  // DATES_MAP: sorted descending by date
  const dateKeys = Object.keys(datesMap).sort().reverse();
  const datesMapEntries = dateKeys.map(date => {
    const entries = datesMap[date];
    const inner = entries.map(e => JSON.stringify(e)).join(',\n    ');
    return `  "${date}": [\n    ${inner}\n  ]`;
  });
  const datesMapText = `{\n${datesMapEntries.join(',\n')}\n}`;

  // ARTICLE_IDS: all unique IDs
  const allIds = sortIds(new Set([
    ...existingIds,
    ...Object.keys(articles)
  ]));
  const idsText = `[\n    ${allIds.map(id => JSON.stringify(id)).join(',\n    ')}\n  ]`;

  // ARTICLES: all articles
  const articleKeys = sortIds(Object.keys(articles));
  const articlesEntries = articleKeys.map(key => {
    const json = JSON.stringify(articles[key], null, 4);
    return `  "${key}": ${json}`;
  });
  const articlesText = `{\n${articlesEntries.join(',\n')}\n}`;

  return { datesMapText, idsText, articlesText };
}

// ─────────────────────────────────────────────────────────────
// 6. 验证脚本语法
// ─────────────────────────────────────────────────────────────
function validate(html) {
  const scriptStart = html.indexOf('<script>') + 8;
  const scriptEnd = html.lastIndexOf('</script>');
  const script = html.slice(scriptStart, scriptEnd);
  try {
    new Function(script);
    console.log('  ✅ Script syntax OK');
    return true;
  } catch (e) {
    console.error(`  ❌ Script syntax error: ${e.message}`);
    // Binary search for error line
    const lines = script.split('\n');
    let lo = 0, hi = lines.length, lastGood = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        new Function(lines.slice(0, mid).join('\n'));
        lastGood = mid;
        lo = mid + 1;
      } catch { hi = mid - 1; }
    }
    for (let i = lastGood; i < Math.min(lines.length, lastGood + 3); i++) {
      console.error(`     Line ${i + 1}: ${lines[i].substring(0, 120)}`);
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function main() {
  console.log('🔧 Embedding articles into index.html...\n');

  // 1. Fetch / read HTML
  const html = fetchIndexHTML();
  console.log(`  HTML size: ${html.length} bytes`);

  // 2. Load all articles from data/
  const { articles, datesMap } = loadAllArticles();
  console.log(`  Loaded ${Object.keys(articles).length} articles from data/`);

  // 3. Extract existing IDs
  const existingIds = extractExistingIds(html);
  console.log(`  Existing embedded IDs: ${existingIds.length}`);

  // 4. Find new articles
  const newDates = Object.keys(articles).filter(d => !existingIds.includes(d));
  if (newDates.length > 0) {
    console.log(`  📦 New articles to embed: ${newDates.join(', ')}`);
  } else {
    console.log('  ℹ️  No new articles to embed');
  }

  // 5. Build new embedded sections
  const { datesMapText, idsText, articlesText } = buildEmbeddedSections(articles, datesMap, existingIds);

  // 6. Replace in HTML (one section at a time, each from the latest html state)
  let newHtml = html;
  newHtml = replaceSection(newHtml, 'EMBEDDED_DATES_MAP', datesMapText);
  newHtml = replaceSection(newHtml, 'EMBEDDED_ARTICLE_IDS', idsText);
  newHtml = replaceSection(newHtml, 'EMBEDDED_ARTICLES', articlesText);

  console.log(`\n  New HTML size: ${newHtml.length} bytes (+${newHtml.length - html.length})`);

  // 7. Validate
  if (!validate(newHtml)) {
    console.error('\n❌ Validation failed, NOT saving');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Not saving file');
    return;
  }

  // 8. Save locally
  fs.writeFileSync(INDEX_PATH, newHtml, 'utf-8');
  console.log(`\n✅ index.html updated and saved`);
  console.log(`   Run 'git status' to see changes`);
}

main();
