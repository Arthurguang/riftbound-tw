/**
 * 危險 API 的全域禁用檢查。
 *
 * 這支腳本會掃過 src/ 底下所有程式碼，只要出現下列任何一種寫法就讓 CI 失敗。
 * 目的不是抓現在的錯，而是「以後不會有人不小心加進來」——
 * 包含未來的你自己，或是任何複製貼上來的範例程式碼。
 *
 *   執行： npm run check:danger
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'scripts'];

/** 每一條規則都附上「為什麼」，因為半年後的你會想知道。 */
const FORBIDDEN = [
  {
    pattern: /dangerouslySetInnerHTML/,
    why: 'React 直接寫入 HTML 的後門。本專案的卡牌文字已在建置階段拆成安全的 token，永遠不需要它。',
  },
  {
    pattern: /\.innerHTML\s*=/,
    why: '直接寫入 HTML 是最典型的 XSS 來源。請改用 textContent 或交給 React 渲染。',
  },
  {
    pattern: /\.outerHTML\s*=/,
    why: '同 innerHTML，會把字串當成 HTML 解析。',
  },
  {
    pattern: /\beval\s*\(/,
    why: '把字串當程式碼執行。CSP 也已禁止（沒有 unsafe-eval）。',
  },
  {
    pattern: /new\s+Function\s*\(/,
    why: 'eval 的變形，同樣是把字串當程式碼執行。',
  },
  {
    /*
     * 只允許 new RegExp('字面量') 這種形式。
     * 用變數或樣板字串組出來的正則式會被 CodeQL 標為高風險（正則式注入），
     * 而且就算目前的來源是安全的，日後只要有人讓它變成可設定的就會出事。
     * 這條規則是實際踩過之後補上的 —— 當時 CodeQL 在 PR 上擋下了合併。
     */
    pattern: /new\s+RegExp\s*\(\s*(?!['"])/,
    why: "正則式必須寫成字面量。用變數或樣板字串組正則式會被判定為正則式注入（高風險），請直接寫 /pattern/ 或 new RegExp('字面量')。",
  },
  {
    pattern: /document\.write\s*\(/,
    why: '會把字串當 HTML 寫入文件。',
  },
  {
    pattern: /javascript:/,
    why: 'javascript: 協議的連結等同於執行任意程式碼。',
  },
  {
    pattern: /'unsafe-inline'|"unsafe-inline"/,
    why: "放寬 CSP 的 unsafe-inline 會讓整個 XSS 防線失效。若因框架限制而必須使用，請先與威脅模型一起討論。",
  },
  {
    pattern: /'unsafe-eval'|"unsafe-eval"/,
    why: 'unsafe-eval 允許把字串當程式碼執行，等同關閉 CSP 的主要保護。',
  },
];

/** 允許例外的檔案：這些檔案「使用」這些關鍵字是刻意且必要的。 */
const ALLOWLIST = new Set([
  'scripts/check-forbidden-apis.mjs', // 就是這支腳本本身
  'src/lib/security-headers.ts', // 開發模式的 CSP 需要用到這些關鍵字
  'scripts/fetch-cards.mjs', // SVG 安全檢查需要比對 'javascript:' 字樣
  'scripts/lib/card-text-parser.mjs', // 解析器的允許清單需要比對這些字樣
]);

/**
 * 判斷這一行是不是註解。
 *
 * 註解裡提到 dangerouslySetInnerHTML 是在「說明為什麼不用它」，
 * 不該被當成違規 —— 我們要抓的是實際的程式碼。
 */
function isComment(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (CODE_EXTENSIONS.test(entry.name)) {
      yield full;
    }
  }
}

const findings = [];

for (const dir of SCAN_DIRS) {
  for await (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    if (ALLOWLIST.has(rel)) continue;

    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) {
          findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 100), why: rule.why });
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error(`\n❌ 發現 ${findings.length} 處危險寫法：\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text}`);
    console.error(`    → ${f.why}\n`);
  }
  process.exit(1);
}

console.log('✅ 危險 API 檢查通過：src/ 與 scripts/ 中沒有任何禁用寫法。');

/*
 * ── 第二道：版控裡不准有機密檔案 ──────────────────────────────
 *
 * 2026-10-06 的事故：recovery-codes.txt（6 組兩步驟驗證備用碼）被帶進版控，
 * 在公開儲存庫上公開了 38 天才發現。.gitignore 可以防止「新檔案」被加進來，
 * 但防不了已經在追蹤中的檔案 —— 一旦被追蹤，.gitignore 就不再生效。
 *
 * 所以這裡直接問 git：「你現在追蹤了哪些檔案」，檔名像機密就讓 CI 失敗。
 * 這是檔名層級的檢查，不讀內容 —— 腳本本身不該碰到任何機密。
 */
const SECRET_FILE_PATTERNS = [
  { pattern: /recovery[-_]?codes?/i, what: '備用碼／救援碼' },
  { pattern: /backup[-_]?codes?/i, what: '備用碼' },
  { pattern: /\.(pem|key|p12|pfx)$/i, what: '私鑰或憑證檔' },
  { pattern: /(^|\/)\.env($|\.)/i, what: '環境變數檔' },
  { pattern: /(password|credential)s?\.(txt|json|csv|md)$/i, what: '密碼或憑證清單' },
];

let tracked = [];
try {
  const { execFileSync } = await import('node:child_process');
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
} catch {
  // 不是 git 環境（例如從壓縮檔解開）就跳過這道檢查，不要讓建置失敗
  console.log('ℹ️  略過機密檔案檢查：這裡不是 git 工作目錄。');
}

const secretFiles = tracked
  .map((file) => ({ file, rule: SECRET_FILE_PATTERNS.find((r) => r.pattern.test(file)) }))
  .filter((hit) => hit.rule);

if (secretFiles.length > 0) {
  console.error(`\n❌ 版控裡出現 ${secretFiles.length} 個看起來是機密的檔案：\n`);
  for (const { file, rule } of secretFiles) {
    console.error(`  ${file}`);
    console.error(`    → 檔名像${rule.what}。機密不進版控，正確位置是紙本與密碼管理器。`);
    console.error(`    → 移除方式：git rm --cached "${file}"，並確認 .gitignore 有涵蓋。`);
    console.error(`    → ⚠️ 已經推上公開儲存庫的話，**那組機密要視為已外洩，必須重新產生**。\n`);
  }
  process.exit(1);
}

if (tracked.length > 0) {
  console.log(`✅ 機密檔案檢查通過：版控中的 ${tracked.length} 個檔案沒有可疑檔名。`);
}
