/**
 * 關鍵字辭典的搜尋邏輯。
 *
 * 這裡特別涵蓋中文搜尋 —— 端對端測試沒辦法可靠地輸入中文
 * （Playwright 的逐字輸入需要輸入法，fill() 在 WebKit 上不觸發 React 的 onChange），
 * 所以中文比對的正確性由這一層負責。
 */

import { describe, expect, it } from 'vitest';
import taxonomy from '../../src/data/taxonomy.json';
import { filterKeywords } from '../../src/lib/glossary';
import { KEYWORDS } from '../../src/lib/types';

const keywords = (taxonomy as unknown as { keywords: Parameters<typeof filterKeywords>[0] })
  .keywords;

describe('關鍵字搜尋', () => {
  it('空字串回傳全部 15 個關鍵字', () => {
    expect(filterKeywords(keywords, '')).toHaveLength(15);
    expect(filterKeywords(keywords, '   ')).toHaveLength(15);
  });

  /*
   * 同一個關鍵字有四種寫法都要找得到：
   *   Tank（英文）· 坦克（官方繁中規則書）· 壁壘（繁中卡面實際印的）· 壁垒（官方簡中）
   *
   * 「壁壘」那一項最重要：繁中卡的文字是簡轉繁，跟規則書不一樣，
   * 玩家是看著手上的卡打字的。只認規則書用語，等於讓他搜不到自己手上那張卡。
   */
  it('四種寫法都找得到同一個關鍵字（含卡面上實際印的字）', () => {
    for (const term of ['Tank', 'tank', '坦克', '壁壘', '壁垒']) {
      expect(filterKeywords(keywords, term), `搜尋「${term}」`).toContain('Tank');
    }
  });

  it('其他規則書與卡面用語不同的關鍵字，兩種寫法也都找得到', () => {
    const pairs: ReadonlyArray<[string, string, string]> = [
      ['Accelerate', '加速', '急速'],
      ['Assault', '強襲', '強攻'],
      ['Deathknell', '喪鐘', '絕念'],
      ['Legion', '軍團', '鼓舞'],
      ['Vision', '預視', '預知'],
    ];
    for (const [name, rulebook, cardFace] of pairs) {
      expect(filterKeywords(keywords, rulebook), `規則書用語「${rulebook}」`).toContain(name);
      expect(filterKeywords(keywords, cardFace), `卡面用語「${cardFace}」`).toContain(name);
    }
  });

  it('可以用官方說明的內容搜尋', () => {
    // Shield 的官方說明是 "+1 {might} while they're defenders."
    expect(filterKeywords(keywords, 'defender')).toContain('Shield');
    // 繁中說明是「如果它們是防守方，則{might}+1。」
    expect(filterKeywords(keywords, '防守方')).toContain('Shield');
  });

  it('找不到時回傳空陣列', () => {
    expect(filterKeywords(keywords, 'zzzzzzzz')).toHaveLength(0);
  });

  it('不區分大小寫', () => {
    expect(filterKeywords(keywords, 'GANKING')).toEqual(filterKeywords(keywords, 'ganking'));
  });

  it('回傳的關鍵字一定在允許清單內', () => {
    for (const name of filterKeywords(keywords, 'a')) {
      expect(KEYWORDS).toContain(name);
    }
  });
});

describe('辭典資料', () => {
  it('每個關鍵字都有條目，且來源被標記', () => {
    for (const name of KEYWORDS) {
      const entry = keywords[name];
      expect(entry, `${name} 缺少條目`).toBeDefined();
      expect(['official-card-text', 'none']).toContain(entry!.source);
    }
  });

  it('有官方說明的條目，三種語言都必須齊全', () => {
    for (const name of KEYWORDS) {
      const entry = keywords[name]!;
      if (entry.source !== 'official-card-text') continue;
      expect(entry.en, `${name} 缺英文`).toBeTruthy();
      expect(entry.cn, `${name} 缺简中`).toBeTruthy();
      expect(entry.tw, `${name} 缺繁中`).toBeTruthy();
    }
  });

  it('說明文字裡沒有任何 HTML', () => {
    const raw = JSON.stringify(keywords);
    for (const needle of ['<', '>', 'onerror', 'javascript:']) {
      expect(raw).not.toContain(needle);
    }
  });
});
