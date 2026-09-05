/**
 * 建置前抓取官方勘誤表，產生 src/data/errata.json。
 *
 * ── 為什麼要有這個 ──────────────────────────────────────────────
 *
 * 官方對已印出的卡片發過勘誤，而且明說**勘誤文字取代印刷文字，你永遠是照
 * 更新後的文字在玩**。問題是：
 *
 *   1. 官方卡牌 API 的文字**新舊混雜** —— 實測 Kinkou Monk、Ravenborn Tome
 *      已經是勘誤後的，但 Salvage、Sigil of the Storm、Void Gate 還是勘誤前的。
 *      也就是說，光靠 API 我們的圖鑑對某些卡就是在顯示過時文字。
 *   2. 官方明說勘誤**不會**印在後續再版或**在地化版本**上 ——
 *      也就是繁中卡上不會有。對台灣玩家來說這份資料的價值反而更高。
 *
 * ── 為什麼是抓取而不是手打 ──────────────────────────────────────
 *
 * 31 張卡、每張新舊兩段文字，手打必然出錯。而且實測發現：用摘要工具讀這個
 * 頁面會**悄悄縮短文字** —— Unlicensed Armory 開頭的「Discard 1, [E]:」和
 * 結尾的括號提示文字都被吃掉了，看起來卻完全像一段正常的卡牌文字。
 *
 * 規則文字錯一個字就是錯的。所以照這個專案既有的做法：抓原始頁面、
 * 嚴格解析、驗不過就讓建置失敗。
 */

import { writeFileSync } from 'node:fs';

const SOURCE = 'https://playriftbound.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/';
const OUT = new URL('../src/data/errata.json', import.meta.url);

/** 官方頁面上的卡名與我們卡池的正式卡名對不上的例外。 */
const NAME_FIXES = {
  'Dark Child, Starter': 'Dark Child - Starter',
};

/**
 * 允許出現在勘誤文字裡的字元。
 *
 * 這是資安防線，跟 card-text-parser 同一個原則：**與其事後消毒，
 * 不如一開始就不讓奇怪的東西進到專案裡**。這些文字最後會直接渲染給使用者，
 * 出現角括號就代表頁面結構跟我們以為的不一樣，寧可中斷也不要猜。
 */
function assertPlainText(value, where) {
  if (/[<>]/.test(value)) throw new Error(`${where} 含有角括號，可能混進了標籤：${value}`);
  if (value.length === 0 || value.length > 1200) throw new Error(`${where} 長度不合理：${value.length}`);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, String.fromCharCode(8217))
    .replace(/&lsquo;/g, String.fromCharCode(8216))
    .replace(/&mdash;/g, String.fromCharCode(8212))
    .replace(/&ndash;/g, String.fromCharCode(8211));
}

/**
 * 取出某個標記（[NEW TEXT] / [OLD TEXT]）後面那一整段的純文字。
 *
 * ⚠️ 卡牌文字是**拆成好幾個 <p>** 的：第一個通常是卡種行
 *（例如「[Action] (Play on your turn or in showdowns.)」），真正的能力文字在後面。
 *
 * 第一版只取第一個 <p>，結果新舊兩邊都拿到同一行卡種 —— 31 筆會全部存成
 * 一模一樣的東西，而且看起來完全像正常的卡牌文字。是下面「新舊文字一樣就中止」
 * 那條斷言擋下來的，不是我看出來的。
 *
 * 所以要取到下一個區塊邊界（<h4>／<h5>／<hr>）之前的**全部** <p>。
 */
function textAfter(block, marker) {
  const at = block.indexOf(marker);
  if (at === -1) return null;
  let rest = block.slice(at);
  // 先跳過標記自己那一行，再切到下一個區塊邊界
  const headEnd = rest.indexOf('</h5>');
  if (headEnd !== -1) rest = rest.slice(headEnd + 5);
  const end = rest.search(/<(h4|h5|hr)\b/i);
  const region = end === -1 ? rest : rest.slice(0, end);

  const parts = [];
  for (const m of region.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const inner = m[1];
    // <p> 裡官方只用純文字與少數行內強調；出現別的標籤就代表結構變了
    if (/<(?!\/?(em|strong|i|b)\b)[a-z]/i.test(inner)) return null;
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    if (text !== '') parts.push(text);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

async function main() {
  const res = await fetch(SOURCE, { headers: { 'user-agent': 'riftbound-tw build script' } });
  if (!res.ok) throw new Error(`抓取失敗：HTTP ${res.status}`);
  const html = await res.text();

  /*
   * 直接解析伺服器端已經渲染好的 HTML。
   *
   * 這個頁面同時有兩份內容：Next.js 塞在 __NEXT_DATA__ 裡的 JSON（逃脫過的，
   * 光角括號的逃脫序列就出現 611 次），以及已渲染的 HTML（32 個 h2）。
   *
   * 原本這裡有一段把逃脫序列還原回來的程式碼，實測發現**根本不需要** ——
   * 完全不還原也解析得到全部 31 筆。所以拿掉了。
   *
   * 看起來有作用、實際什麼都沒做的程式碼比沒有還糟：下一個人會以為它是必要的，
   * 改壞了也不會發現。
   */
  const blocks = html.split(/<h2[^>]*>/).slice(1);
  const entries = [];
  const skipped = [];

  for (const block of blocks) {
    const close = block.indexOf('</h2>');
    if (close === -1) continue;
    const heading = decodeEntities(block.slice(0, close).replace(/<[^>]+>/g, '')).trim();
    const body = block.slice(close);

    const updated = textAfter(body, '[NEW TEXT]');
    const printed = textAfter(body, '[OLD TEXT]');
    if (!updated || !printed) {
      skipped.push(heading);
      continue;
    }

    assertPlainText(updated, `${heading} 的新文字`);
    assertPlainText(printed, `${heading} 的舊文字`);
    if (updated === printed) throw new Error(`${heading} 的新舊文字一樣，解析八成錯了`);

    // 有些條目後面附註「只有英文版的文字不同」—— 對繁中使用者是重要資訊
    const noteMatch = body.match(/<em>\s*(Note:[\s\S]*?)<\/em>/);
    const note = noteMatch ? decodeEntities(noteMatch[1].replace(/<[^>]+>/g, '')).trim() : null;

    entries.push({
      official: heading,
      name: NAME_FIXES[heading] ?? heading,
      updated,
      printed,
      note,
    });
  }

  if (entries.length === 0) throw new Error('一筆都沒解析到 —— 頁面結構應該變了');

  /*
   * 每一筆都要對得到真的卡片。
   *
   * 這是最重要的一道檢查：官方頁面上的卡名寫法**不保證**跟卡牌資料一致
   *（禁卡表就出過這種事）。對不到卻默默略過的話，勘誤就會靜靜地漏掉。
   */
  const cards = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      new URL('../src/data/cards.origins.json', import.meta.url),
      'utf8',
    ),
  );
  const list = Array.isArray(cards) ? cards : cards.cards;
  const known = new Set(list.map((c) => c.name));
  const missing = entries.filter((e) => !known.has(e.name));
  if (missing.length > 0) {
    throw new Error(
      `這些勘誤對不到卡片，請到 NAME_FIXES 補上對應：\n  ${missing
        .map((e) => `"${e.official}"`)
        .join('\n  ')}`,
    );
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out = {
    source: SOURCE,
    document: 'Riftbound: Origins Card Errata（官方英文版）',
    /** 官方文章的發布日期，介面上會標示。 */
    published: '2025-10-28',
    fetchedAt: new Date().toISOString().slice(0, 10),
    entries,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`勘誤 ${entries.length} 筆已寫入 src/data/errata.json`);
  if (skipped.length > 0) console.log(`（略過非勘誤段落 ${skipped.length} 個：${skipped.join('、')}）`);
}

main().catch((err) => {
  console.error('抓取勘誤失敗：', err.message);
  process.exit(1);
});
