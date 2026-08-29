/**
 * 取得卡牌的中文資料。
 *
 * ── 簡體中文 ──────────────────────────────────────────────────
 * 來源：中國大陸官方發行商的公開 API（Riot Games × 闪魂）。
 *   https://lol-api.playloltcg.com/xcx/card/searchCardCraftWeb
 * 這是官方自己的卡牌圖鑑在用的介面，提供官方簡中卡名、能力文字、
 * 背景敘述與官方簡中卡圖。
 *
 * ── 繁體中文卡名 ──────────────────────────────────────────────
 * 官方沒有推出繁中的線上卡牌資料庫（繁中版 2026-08-07 才上市，只有實體卡），
 * 因此繁中「卡名」取自台灣社群站「符文戰場編年史」ChronicleCore
 * 公開頁面上的 schema.org JSON-LD 結構化資料。
 *
 * 取用時遵守的原則：
 *   1. 只讀取他們 robots.txt 允許、且列在自家 sitemap 裡的公開頁面。
 *      他們的 robots.txt 明寫 Disallow: /api/ —— 我們完全不碰那個路徑。
 *   2. 只取「卡名」。能力文字我們自己從官方簡中逐字轉繁，不取用他們的成果。
 *   3. 一律不引用他們的圖片，卡圖全部來自官方來源，不佔用他們的頻寬。
 *   4. 每次請求間隔 800ms，且帶可識別的 User-Agent。
 *   5. 結果寫入版控快取，之後的建置不會再次請求。
 *   6. 站上頁尾標明出處。
 */

import { readFile, writeFile } from 'node:fs/promises';

const CN_API = 'https://lol-api.playloltcg.com/xcx/card/searchCardCraftWeb';
const TW_SITE = 'https://riftbound.chroniclecore.com';
const TW_USER_AGENT =
  'riftbound-tw-cardgallery/1.0 (non-commercial fan project; card name lookup; contact via project repository)';
const TW_DELAY_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── 簡體中文 ────────────────────────────────────────────────────

/**
 * 抓取官方簡中卡牌資料。
 *
 * @returns wanted 以卡號為鍵、只含指定系列的 Map（給卡牌資料用）
 *          all    完整清單（給關鍵字辭典用 —— 有些關鍵字的官方說明
 *                 只出現在後續系列的卡面上）
 */
export async function fetchSimplifiedChinese(wantedSets) {
  const all = [];
  for (let page = 1; page <= 30; page += 1) {
    const res = await fetch(CN_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        pageNum: page,
        pageSize: 100,
        searchContent: '',
        cardCategoryList: [],
        cardColorList: [],
        rarityList: [],
        productCodeList: [],
      }),
    });
    if (!res.ok) throw new Error(`官方簡中 API 回應 ${res.status}`);
    const body = await res.json();
    if (body.code !== 0) throw new Error(`官方簡中 API 回傳 code=${body.code}`);
    const list = body.result?.list ?? [];
    if (list.length === 0) break;
    all.push(...list);
    if (all.length >= body.result.total) break;
  }

  const wanted = all.filter((card) =>
    wantedSets.some((set) => String(card.cardNo ?? '').startsWith(`${set}·`)),
  );

  // 官方簡中用「·」當分隔符，英文版用「-」，統一成英文版的格式方便比對。
  return {
    wanted: new Map(wanted.map((card) => [card.cardNo.replace('·', '-'), card])),
    all,
  };
}

// ─── 繁體中文卡名 ────────────────────────────────────────────────

/** 從一個卡片頁的 HTML 取出 schema.org JSON-LD 的卡名。 */
function extractNameFromJsonLd(html, code) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue; // 這一塊不是合法 JSON，換下一塊
    }
    if (data?.['@type'] !== 'CreativeWork') continue;
    const name = data.name;
    if (typeof name !== 'string' || name === '') continue;

    // 只接受純文字卡名。出現角括號代表格式有異，寧可跳過也不要帶進專案。
    if (/[<>]/.test(name)) {
      throw new Error(`[${code}] 繁中卡名含有角括號："${name}"`);
    }
    const alternates = Array.isArray(data.alternateName)
      ? data.alternateName.filter((v) => typeof v === 'string' && !/[<>]/.test(v))
      : [];
    return { name, alternates };
  }
  return null;
}

/**
 * 取得繁中卡名。
 *
 * @param {string[]} baseCodes 例如 ['OGN-001', 'OGN-002', ...]
 * @param {string} cachePath   快取檔路徑
 * @param {boolean} refresh    是否強制重新抓取
 */
export async function fetchTraditionalNames(baseCodes, cachePath, refresh) {
  /** @type {Record<string, {name: string, alternates: string[]}>} */
  let cache = {};
  if (!refresh) {
    try {
      cache = JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {
      cache = {}; // 還沒有快取，等一下重新抓
    }
  }

  const missing = baseCodes.filter((code) => !Object.hasOwn(cache, code));
  if (missing.length === 0) {
    console.log(`  ✓ 繁中卡名：使用既有快取（${Object.keys(cache).length} 筆）`);
    return cache;
  }

  console.log(`  · 繁中卡名：需要抓取 ${missing.length} 筆（每筆間隔 ${TW_DELAY_MS}ms，請稍候）`);
  let found = 0;
  let absent = 0;

  for (const [index, code] of missing.entries()) {
    if (index > 0) await sleep(TW_DELAY_MS);
    try {
      const res = await fetch(`${TW_SITE}/cards/${code}`, {
        headers: { 'user-agent': TW_USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) {
        cache[code] = null; // 對方沒有這張卡的頁面，記下來避免重複請求
        absent += 1;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = extractNameFromJsonLd(await res.text(), code);
      cache[code] = entry;
      if (entry) found += 1;
      else absent += 1;
    } catch (err) {
      // 單張卡抓不到不該讓整個建置失敗（繁中卡名是加分項，不是必要資料）。
      console.warn(`    ! ${code} 取得失敗：${err.message}`);
      cache[code] = null;
      absent += 1;
    }

    if ((index + 1) % 50 === 0) {
      console.log(`    … 進度 ${index + 1}/${missing.length}`);
    }
  }

  await writeFile(cachePath, `${JSON.stringify(cache, null, 1)}\n`, 'utf8');
  console.log(`  ✓ 繁中卡名：取得 ${found} 筆，${absent} 筆無資料（已寫入快取）`);
  return cache;
}
