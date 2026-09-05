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
import {
  coinedTermsIn,
  ERRATA,
  ERRATA_VERSION,
  errataFor,
  errataZh,
  isEnglishOnly,
  ZH_COINED_TERMS,
  ZH_TRANSLATOR,
} from '../../src/lib/errata';
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

/**
 * 社群整理的中文參考翻譯。
 *
 * 這份資料的風險跟一般翻譯不同：它會被當成規則來讀。所以測試的重點不是
 * 「翻得好不好」（測不了），而是三件**可以自動驗證**的事：
 *
 *   1. 每一筆勘誤都有對應的翻譯，沒有漏
 *   2. 用詞沿用官方繁中卡面的既有譯法，沒有自己另外發明
 *   3. 真的自訂的詞（官方繁中沒出現過的）有被登記下來，介面才講得出口
 */
describe('中文參考翻譯', () => {
  it('每一筆勘誤都翻到了，一筆不漏', () => {
    for (const e of ERRATA) {
      expect(errataZh(e), `「${e.name}」沒有中文翻譯`).toBeTruthy();
    }
  });

  it('明確標示為非官方 —— 這是它能存在的前提', () => {
    expect(ZH_TRANSLATOR).toContain('非官方');
  });

  /*
   * 術語一律沿用官方繁中卡面的譯法，不自己發明。
   * 這幾個是從卡牌資料裡實際比對出來的，寫死在這裡當回歸防線：
   * 哪天有人「順手」把放逐改成流放、回收改成棄置，這條就會紅燈。
   */
  it('關鍵術語用官方繁中卡面的譯法', () => {
    const all = ERRATA.map((e) => errataZh(e) ?? '').join('\n');

    // 該出現的官方用詞
    for (const term of ['放逐', '回收', '摧毀', '召回', '增益', '征服', '戰力', '主牌堆']) {
      expect(all, `翻譯裡找不到官方用詞「${term}」`).toContain(term);
    }

    // 常見但**不是**官方用法的替代寫法，一個都不該出現
    for (const wrong of ['流放', '棄牌堆', '力量值', '牌庫', '橫置']) {
      expect(all, `出現了非官方用詞「${wrong}」`).not.toContain(wrong);
    }
  });

  /*
   * 自訂詞必須登記。
   *
   * heal 在 Origins 的官方繁中卡面完全沒有出現過（勘誤才引入的新用語），
   * 所以「治療」是我們自己取的。介面上要講出來，使用者才知道哪些有官方依據。
   */
  it('自訂的詞有登記，而且真的在翻譯裡用到', () => {
    expect(ZH_COINED_TERMS.length).toBeGreaterThan(0);
    for (const term of ZH_COINED_TERMS) {
      expect(term.why.length, `「${term.zh}」沒有說明為什麼要自訂`).toBeGreaterThan(10);
      const used = ERRATA.some((e) => (errataZh(e) ?? '').includes(term.zh));
      expect(used, `登記了「${term.zh}」卻沒有任何一筆翻譯用到它`).toBe(true);
    }
  });

  it('查得出某一段翻譯用了哪些自訂詞', () => {
    const armory = ERRATA.find((e) => e.name === 'Unlicensed Armory')!;
    const zh = errataZh(armory)!;
    expect(zh).toContain('治療');
    expect(coinedTermsIn(zh).map((t) => t.en)).toContain('heal');

    // 沒用到自訂詞的就不該回報
    const salvage = ERRATA.find((e) => e.name === 'Salvage')!;
    expect(coinedTermsIn(errataZh(salvage)!)).toHaveLength(0);
  });

  it('翻譯的段落數跟原文一致 —— 少一段就是漏翻', () => {
    for (const e of ERRATA) {
      const zh = errataZh(e)!;
      expect(zh.split('\n').length, `「${e.name}」的段落數跟原文對不上`).toBe(
        e.updated.split('\n').length,
      );
    }
  });
});
