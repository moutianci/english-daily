# English Daily — 经济学人精读应用

## 📁 项目结构

```
english-daily/
├── index.html              # 主页面（单页应用）
├── dates.json              # 所有可用日期列表
├── data/
│   └── 2026-06-17.json     # 今日精读内容
└── scripts/
    └── generate-daily.js   # 每日数据骨架生成脚本
```

## 🚀 使用方式

1. **启动本地服务器预览**：
   ```bash
   cd ~/.qclaw/workspace/english-daily
   python3 -m http.server 8765
   # 然后浏览器打开 http://localhost:8765
   ```

2. **查看今日精读内容** — 页面会自动加载 `data/2026-06-17.json`

## 📖 功能特性

- **逐段精读**：英文原文 → 点击展开中文翻译
- **词汇高亮**：重点单词在文中蓝色高亮，点击弹出释义卡片（含音标、释义、例句）
- **难句解析**：每段 1-2 个难句，含翻译、分析和语法点
- **日期导航**：右上角日期选择器 + 底部上/下一篇切换
- **响应式**：手机/平板/桌面均可使用

## 🔄 每日更新流程

1. 运行骨架生成脚本：
   ```bash
   node scripts/generate-daily.js 2026-06-18
   ```
2. 编辑生成的 `data/2026-06-18.json`，填入文章内容、翻译、词汇和难句解析
3. `dates.json` 会自动更新

## 📝 数据格式

```json
{
  "date": "2026-06-17",
  "source": "The Economist",
  "title": "文章标题",
  "url": "原文链接",
  "paragraphs": [
    {
      "en": "英文段落...",
      "zh": "中文翻译...",
      "vocabulary": [
        { "word": "word", "phonetic": "/wɜːrd/", "meaning": "释义", "example": "例句" }
      ],
      "difficult_sentences": [
        { "en": "原句", "zh": "解析", "grammar": "语法点" }
      ]
    }
  ]
}
```

## 🤖 自动化思路

后续可配合 cron 定时任务：
1. 每日自动抓取经济学人最新文章
2. 调用 AI 生成翻译 + 词汇解析 + 难句解析
3. 自动写入 `data/YYYY-MM-DD.json`
4. 自动更新 `dates.json`
