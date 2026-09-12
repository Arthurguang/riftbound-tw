/**
 * 把官方卡圖下載到本站，建置前自動執行。
 *
 * ── 為什麼要自己代管 ──────────────────────────────────────────
 * 原本的做法是只給瀏覽器一個官方 CDN 的網址，圖由使用者的瀏覽器自己去拿。
 * 三個問題：
 *   1. 官方改網址，全站卡圖一起破，而且我們不會馬上知道
 *   2. 使用者的瀏覽器會連到第三方伺服器（已設 no-referrer，但連線本身仍在）
 *   3. CSP 得為此開兩個外部網域的白名單 —— 白名單愈少愈安全
 * 改成自己代管後，CSP 的 img-src 只剩 'self'，而且畫布不再被跨網域污染。
 *
 * 素材來源仍然是官方（Riot 政策要求如此），只是改由本站轉發。
 *
 * ── 為什麼在建置時下載，而不是存進 git ────────────────────────
 * git 會永久保留每一版二進位檔，倉庫只會愈來愈肥，而且刪不掉。
 * 建置時下載則倉庫永遠只有程式碼；CI 與 Vercel 各自快取，平常不會重抓。
 *
 * ── 失敗就讓建置失敗（fail-closed）────────────────────────────
 * 跟卡牌資料同一個原則：寧可上不了線，也不要上線一個破圖的網站。
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARDS = join(ROOT, 'src', 'data', 'cards.origins.json');
const OUT_DIR = join(ROOT, 'public', 'cards');

/**
 * 存三種尺寸。
 *
 * 網站上圖片出現的大小從 60px（牌組編輯器的小圖）到 900px（詳細頁大圖）都有。
 * 只存大圖會讓手機下載一堆用不到的位元組；只存小圖則詳細頁會糊。
 * 這三個寬度覆蓋全部用法，程式會挑「不小於需求」的最接近一個（見 lib/cards.ts）。
 */
const WIDTHS = [160, 420, 900];

/**
 * 同時下載幾個。太多會被 CDN 限流，太少則每次部署都在等。
 * 實測（2026-09-12）：20 個同時下載，全部 2256 檔、97MB 冷下載約 19 秒。
 */
const CONCURRENCY = 20;

/** 小於這個大小的回應一定不是正常卡圖（多半是錯誤頁）。 */
const MIN_BYTES = 500;

/**
 * 官方 CDN 的即時轉檔網址。兩邊語法不同：
 *   英文（Riot Sanity）  ?w=420&fm=webp&q=78
 *   簡中（Tencent COS）  ?imageMogr2/thumbnail/420x/format/webp/quality/80
 */
function remoteUrl(card, width, art) {
  if (art === 'zh-CN') {
    return `${card.zh.cn.image}?imageMogr2/thumbnail/${width}x/format/webp/quality/80`;
  }
  const url = new URL(card.image.url);
  url.searchParams.set('w', String(width));
  url.searchParams.set('fm', 'webp');
  url.searchParams.set('q', '78');
  return url.toString();
}

async function alreadyDownloaded(path) {
  try {
    const info = await stat(path);
    return info.size >= MIN_BYTES;
  } catch {
    return false;
  }
}

async function download(job) {
  const response = await fetch(job.url);
  if (!response.ok) {
    throw new Error(`${job.card} ${job.art} ${job.width}px：HTTP ${response.status}`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    throw new Error(`${job.card} ${job.art} ${job.width}px：回應不是圖片（${type}）`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_BYTES) {
    throw new Error(`${job.card} ${job.art} ${job.width}px：只有 ${bytes.length} 位元組`);
  }
  await writeFile(job.path, bytes);
  return bytes.length;
}

async function main() {
  const startedAt = Date.now();
  const cards = JSON.parse(await readFile(CARDS, 'utf8'));
  const list = Array.isArray(cards) ? cards : cards.cards;

  const jobs = [];
  for (const card of list) {
    for (const art of ['en', 'zh-CN']) {
      if (art === 'zh-CN' && !card.zh?.cn?.image) continue;
      for (const width of WIDTHS) {
        jobs.push({
          card: card.id,
          art,
          width,
          url: remoteUrl(card, width, art),
          path: join(OUT_DIR, art, `${card.id}-${width}.webp`),
        });
      }
    }
  }

  await mkdir(join(OUT_DIR, 'en'), { recursive: true });
  await mkdir(join(OUT_DIR, 'zh-CN'), { recursive: true });

  const todo = [];
  for (const job of jobs) {
    if (!(await alreadyDownloaded(job.path))) todo.push(job);
  }

  if (todo.length === 0) {
    console.log(`卡圖已齊全（${jobs.length} 個檔案），略過下載。`);
    return;
  }

  console.log(`卡圖：共 ${jobs.length} 個檔案，需要下載 ${todo.length} 個…`);

  let done = 0;
  let bytes = 0;
  const failures = [];
  let next = 0;

  async function worker() {
    while (next < todo.length) {
      const job = todo[next++];
      try {
        bytes += await download(job);
      } catch (error) {
        failures.push(error.message);
      }
      done += 1;
      if (done % 200 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failures.length > 0) {
    console.error(`\n卡圖下載失敗 ${failures.length} 個：`);
    for (const message of failures.slice(0, 10)) console.error(`  ${message}`);
    if (failures.length > 10) console.error(`  …還有 ${failures.length - 10} 個`);
    console.error('\n建置中止 —— 寧可上不了線，也不要上線一個破圖的網站。');
    process.exit(1);
  }

  // 總量從磁碟上實際的檔案算，不用下載過程累加的數字 ——
  // 累加值只涵蓋「這次真的下載的」，跳過的檔案不算，讀起來會誤導。
  let total = 0;
  for (const job of jobs) {
    try {
      total += (await stat(job.path)).size;
    } catch {
      // 上面已經確保每個檔案都存在，這裡讀不到就當 0，不影響建置
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(
    `卡圖下載完成：這次下載 ${done} 個，資料夾共 ${jobs.length} 檔、` +
      `${(total / 1024 / 1024).toFixed(1)} MB，耗時 ${seconds} 秒。`,
  );
}

await main();
