#!/usr/bin/env node
/**
 * publish-article.js — 将文章数据通过 GitHub API 推送到仓库
 * 
 * 用法: node scripts/publish-article.js <date>.json
 * 环境变量:
 *   GITHUB_TOKEN  — GitHub Personal Access Token (需要 repo 权限)
 *   GITHUB_REPO   — 仓库全名 (默认 moutianci/english-daily)
 */

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'moutianci/english-daily';

if (!TOKEN) {
  console.error('❌ 缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: node scripts/publish-article.js <data-file.json>');
  process.exit(1);
}

// Read article data
const articlePath = path.resolve(filePath);
const articleData = fs.readFileSync(articlePath, 'utf-8');
const dateMatch = articlePath.match(/(\d{4}-\d{2}-\d{2})\.json$/);
if (!dateMatch) {
  console.error('文件名应为 YYYY-MM-DD.json 格式');
  process.exit(1);
}
const dateStr = dateMatch[1];

const articleBase64 = Buffer.from(articleData).toString('base64');

async function githubApi(method, url, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `token ${TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`https://api.github.com/repos/${REPO}${url}`, opts);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${err}`);
  }
  return resp.json();
}

async function main() {
  try {
    // 1. Get current SHA of the article file (or dates.json for new articles)
    let articleSha = null;
    try {
      const existing = await githubApi('GET', `/contents/data/${dateStr}.json`);
      articleSha = existing.sha;
    } catch {
      // File doesn't exist yet — that's fine for new articles
    }

    // 2. Get current dates.json SHA and content
    const datesFile = await githubApi('GET', '/contents/dates.json');
    const datesSha = datesFile.sha;
    let dates = JSON.parse(Buffer.from(datesFile.content, 'base64').toString('utf-8'));
    if (!dates.includes(dateStr)) {
      dates.push(dateStr);
      dates.sort().reverse();
    }
    const datesBase64 = Buffer.from(JSON.stringify(dates, null, 2)).toString('base64');

    // 3. Create a tree with both files
    const tree = [
      {
        path: `data/${dateStr}.json`,
        mode: '100644',
        type: 'blob',
        content: articleData, // raw string, GitHub will encode
      },
      {
        path: 'dates.json',
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(dates, null, 2),
      }
    ];

    // 4. Get latest commit on main
    const mainRef = await githubApi('GET', '/git/ref/heads/main');
    const latestCommit = await githubApi('GET', `/git/commits/${mainRef.object.sha}`);
    const baseTree = latestCommit.tree.sha;

    // 5. Create tree
    const newTree = await githubApi('POST', '/git/trees', {
      base_tree: baseTree,
      tree,
    });

    // 6. Create commit
    const commit = await githubApi('POST', '/git/commits', {
      message: `📚 Add daily article for ${dateStr}`,
      tree: newTree.sha,
      parents: [mainRef.object.sha],
    });

    // 7. Update ref
    await githubApi('PATCH', '/git/refs/heads/main', {
      sha: commit.sha,
    });

    console.log(`✅ 文章 ${dateStr} 已推送到 GitHub`);
    console.log(`🔗 https://moutianci.github.io/english-daily/#${dateStr}`);
  } catch (err) {
    console.error('❌ 推送失败:', err.message);
    process.exit(1);
  }
}

main();
