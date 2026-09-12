/**
 * 圖鑑搜尋要認得關鍵字的每一種寫法。
 *
 * 2026-09-12 使用者回報：在圖鑑搜尋框打「壁壘」和「坦克」都沒有結果。
 * 原因是能力文字轉成純文字時，關鍵字是以**英文**進索引的（token.name），
 * 中文怎麼打都對不上。
 *
 * 繁中特別麻煩：官方有兩套用語 —— 規則書寫「坦克」，卡面印「壁壘」，
 * 玩家看著手上的卡打字，兩種都要找得到。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import { applyFilters, buildSearchIndex, EMPTY_FILTERS } from '../../src/lib/search';

const index = buildSearchIndex(ALL_CARDS, TAXONOMY.tagLabels);
const search = (query: string) => applyFilters(ALL_CARDS, { ...EMPTY_FILTERS, query }, index, 'zh-TW');

describe('圖鑑搜尋：關鍵字的各種寫法', () => {
  it('英文、規則書用語、卡面用語、簡中都找得到同一批卡', () => {
    const byEnglish = search('Tank').map((c) => c.id);
    expect(byEnglish.length).toBeGreaterThan(0);

    for (const term of ['坦克', '壁壘', '壁垒']) {
      expect(search(term).map((c) => c.id), `搜尋「${term}」`).toEqual(byEnglish);
    }
  });

  it('其他規則書與卡面不同的關鍵字也一樣', () => {
    for (const [english, rulebook, cardFace] of [
      ['Accelerate', '加速', '急速'],
      ['Assault', '強襲', '強攻'],
      ['Deathknell', '喪鐘', '絕念'],
      ['Vision', '預視', '預知'],
    ] as const) {
      const expected = search(english).map((c) => c.id);
      expect(expected.length, `${english} 應該有卡`).toBeGreaterThan(0);
      expect(search(rulebook).map((c) => c.id), `規則書「${rulebook}」`).toEqual(expected);
      expect(search(cardFace).map((c) => c.id), `卡面「${cardFace}」`).toEqual(expected);
    }
  });

  it('不存在的詞仍然找不到東西（不是全部都命中）', () => {
    expect(search('這個詞不存在於任何卡片')).toHaveLength(0);
  });
});
