/**
 * 勘誤表的測試。
 *
 * 這份資料是**抓來的規則文字**，錯一個字就是錯的。所以測試分成兩類：
 *
 *   1. 資料完整性 —— 每筆都對得到卡片、新舊真的不一樣、沒有殘留標籤
 *   2. 抓取沒有被悄悄縮短 —— 這是實際踩到的坑（見下方註解）
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import { ERRATA, ERRATA_VERSION, errataFor, isEnglishOnly } from '../../src/lib/errata';
import { applyFilters, buildSearchIndex, EMPTY_FILTERS } from '../../src/lib/search';
import { filtersFromParams, filtersToQueryString } from '../../src/lib/filters-url';

const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);

describe('勘誤資料本身', () => {
  it('有東西，而且標了版本與出處', () => {
    expect(ERRATA.length).toBeGreaterThan(0);
    expect(ERRATA_VERSION.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ERRATA_VERSION.url.startsWith('https://playriftbound.com/')).toBe(true);
  });

  it('每一筆都對得到真的卡片 —— 對不到就等於靜靜漏掉', () => {
    for (const e of ERRATA) {
      expect(byName(e.name), `勘誤「${e.official}」對應到「${e.name}」，卡池裡沒有這張卡`)
        .toBeDefined();
    }
  });

  it('卡名不重複', () => {
    const names = ERRATA.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /*
   * 第一版的解析只取標記後**第一個** <p>，但卡牌文字是拆成好幾個 <p> 的
   *（第一個通常是卡種行）。結果新舊兩邊都拿到同一行卡種 ——
   * 31 筆會全部存成一樣的東西，而且看起來完全像正常的卡牌文字。
   *
   * 這條就是當初擋下它的那個條件，放進測試免得改壞了沒人知道。
   */
  it('新舊文字一定不一樣', () => {
    for (const e of ERRATA) {
      expect(e.updated, `${e.name} 的新舊文字相同，解析可能又壞了`).not.toBe(e.printed);
    }
  });

  /*
   * 用摘要工具讀官方頁面時，文字會被**悄悄縮短**：
   * Unlicensed Armory 開頭的「Discard 1, [E]:」和結尾的括號提示文字都被吃掉，
   * 看起來卻完全像一段正常的卡牌文字。所以這裡釘住幾段完整原文。
   */
  it('文字沒有被縮短 —— 開頭與結尾都完整', () => {
    const armory = ERRATA.find((e) => e.name === 'Unlicensed Armory')!;
    expect(armory.updated.startsWith('Discard 1, [E]:')).toBe(true);
    expect(armory.updated.endsWith("(Send it to base. This isn't a move.)")).toBe(true);
    expect(armory.printed.startsWith('Discard 1, [E]:')).toBe(true);

    // 有卡種行的，卡種行要留著（那也是卡面文字的一部分）
    const salvage = ERRATA.find((e) => e.name === 'Salvage')!;
    expect(salvage.updated).toContain('[Action]');
    expect(salvage.updated).toContain('You may kill up to one gear.');
  });

  it('沒有殘留 HTML 標籤或逃脫序列', () => {
    /*
     * 逃脫序列的樣式用 String.raw 寫。
     * 直接寫成正則字面量的話反斜線會在產生這個檔案時被吃掉，
     * 變成無效的 unicode 逃脫（這個專案已經被同一件事咬過六次）。
     */
    const leftover = new RegExp(`[<>]|&[a-z]+;|${String.raw`\\u00`}`);
    for (const e of ERRATA) {
      expect(e.updated + e.printed).not.toMatch(leftover);
    }
  });

  it('官方寫法與實際卡名不同的那一筆，差異還在', () => {
    const dc = ERRATA.find((e) => e.official === 'Dark Child, Starter');
    expect(dc?.name).toBe('Dark Child - Starter');
    expect(byName('Dark Child, Starter')).toBeUndefined();
  });
});

describe('查詢與分類', () => {
  it('查得到有勘誤的卡，沒勘誤的回 null', () => {
    expect(errataFor(byName('Salvage')!)?.updated).toContain('up to one gear');
    const clean = ALL_CARDS.find((c) => !ERRATA.some((e) => e.name === c.name))!;
    expect(errataFor(clean)).toBeNull();
  });

  /*
   * 官方在少數幾張卡註明「只有英文版的文字不同」。
   * 對只看繁中卡的使用者來說那幾張不受影響 —— 不分辨清楚會讓人白擔心。
   */
  it('認得出「只有英文版不同」的那幾筆', () => {
    const flagged = ERRATA.filter(isEnglishOnly);
    expect(flagged.length).toBeGreaterThan(0);
    for (const e of flagged) expect(e.note).toBeTruthy();
    // 沒有附註的一定不算
    const plain = ERRATA.find((e) => e.note === null)!;
    expect(isEnglishOnly(plain)).toBe(false);
  });

  /*
   * 篩出來的**卡片數會多於勘誤筆數** —— 這是對的，不是 bug。
   * 勘誤是針對卡名的，所以同名的異畫版一樣適用（31 筆 → 36 張卡）。
   * 這條特地把兩個數字都檢查，免得日後有人「修正」成用卡號比對，
   * 那樣異畫版就會漏掉勘誤。
   */
  it('「已勘誤」篩選：同名的異畫版一樣要標出來', () => {
    const index = buildSearchIndex(ALL_CARDS, TAXONOMY.tagLabels);
    const result = applyFilters(ALL_CARDS, { ...EMPTY_FILTERS, marks: ['errata'] }, index, 'zh-TW');

    for (const c of result) expect(errataFor(c)).not.toBeNull();
    // 涵蓋到的**卡名**剛好就是勘誤的筆數
    expect(new Set(result.map((c) => c.name)).size).toBe(ERRATA.length);
    // 而卡片數更多 —— 有同名異畫版
    expect(result.length).toBeGreaterThan(ERRATA.length);
  });

  it('勘誤標記也寫得進網址', () => {
    const qs = filtersToQueryString({ ...EMPTY_FILTERS, marks: ['errata'] });
    expect(filtersFromParams(new URLSearchParams(qs), []).marks).toEqual(['errata']);
  });
});
