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

/** 能力文字裡實際帶有這個關鍵字的卡 —— 不論英文還是簡中那一面。 */
function cardsWithKeyword(keyword: string): string[] {
  return ALL_CARDS.filter((card) =>
    [card.text, card.zh.cn?.text ?? [], card.zh.tw?.text ?? []].some((blocks) =>
      blocks.some((block) =>
        (block.kind === 'paragraph' ? [block.tokens] : block.items).some((tokens) =>
          tokens.some((t) => t.type === 'keyword' && t.name === keyword),
        ),
      ),
    ),
  ).map((c) => c.id);
}

/*
 * 檢查方式是「每一種寫法都要找得到所有帶這個關鍵字的卡」，
 * 而不是「三種寫法的結果完全相同」。
 *
 * 2026-10-13 收錄新系列後，後者不再成立，而且不成立是對的：
 * 搜尋框同時也比對卡名，UNL-202「Void Assault」的英文卡名裡就有 Assault，
 * 它卻沒有 Assault 關鍵字；反過來 SFD-002 的簡中卡名裡有「强袭」。
 * 那是搜尋該有的行為，不是壞掉 —— 真正要守住的是使用者當初回報的那件事：
 * 中文怎麼打都要找得到帶該關鍵字的卡。
 */
describe('圖鑑搜尋：關鍵字的各種寫法', () => {
  it('英文、規則書用語、卡面用語、簡中都找得到帶該關鍵字的卡', () => {
    const expected = cardsWithKeyword('Tank');
    expect(expected.length).toBeGreaterThan(0);

    for (const term of ['Tank', '坦克', '壁壘', '壁垒']) {
      const found = search(term).map((c) => c.id);
      expect(found, `搜尋「${term}」`).toEqual(expect.arrayContaining(expected));
    }
  });

  it('其他規則書與卡面不同的關鍵字也一樣', () => {
    for (const [english, rulebook, cardFace] of [
      ['Accelerate', '加速', '急速'],
      ['Assault', '強襲', '強攻'],
      ['Deathknell', '喪鐘', '絕念'],
      ['Vision', '預視', '預知'],
    ] as const) {
      const expected = cardsWithKeyword(english);
      expect(expected.length, `${english} 應該有卡`).toBeGreaterThan(0);
      for (const term of [english, rulebook, cardFace]) {
        expect(search(term).map((c) => c.id), `搜尋「${term}」`).toEqual(
          expect.arrayContaining(expected),
        );
      }
    }
  });

  it('不存在的詞仍然找不到東西（不是全部都命中）', () => {
    expect(search('這個詞不存在於任何卡片')).toHaveLength(0);
  });
});
