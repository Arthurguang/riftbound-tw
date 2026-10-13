/**
 * 系列的順序與代數。
 *
 * 2026-10-13 使用者回饋：「圖鑑的排列太混亂，看不出有任何邏輯」。
 * 根本原因是系列原本照**英文字母**排 —— 第五代（RAD）被排在第一代與第二代中間。
 *
 * 官方卡牌 API 不提供順序或發售日期，所以這份對照是本站自己維護的
 *（labels.ts 的 SET_META，出處寫在那裡）。自己維護的資料最容易腐爛，
 * 所以這裡把「它必須成立的性質」全部釘住。
 */

import { describe, expect, it } from 'vitest';
import { GENERATIONS, SET_LABELS, SET_META, generationLabel, setsOfGeneration } from '../../src/lib/labels';
import { applyFilters, buildSearchIndex, EMPTY_FILTERS } from '../../src/lib/search';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import { SET_IDS } from '../../src/lib/types';

describe('系列資料本身', () => {
  it('每個系列都有名稱、代數與發售日期', () => {
    for (const id of SET_IDS) {
      expect(SET_LABELS[id], id).toBeDefined();
      const meta = SET_META[id];
      expect(meta, id).toBeDefined();
      expect(meta.generation).toBeGreaterThanOrEqual(1);
      expect(meta.released).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('SET_IDS 的順序就是發售順序', () => {
    const dates = SET_IDS.map((id) => SET_META[id].released);
    expect(dates).toEqual([...dates].sort());
  });

  it('代數跟著發售順序遞增，而且沒有跳號', () => {
    const generations = SET_IDS.map((id) => SET_META[id].generation);
    expect(generations).toEqual([...generations].sort((a, b) => a - b));
    expect(GENERATIONS).toEqual([1, 2, 3, 4, 5]);
  });

  /*
   * 第 1 代有兩個系列：起源與它的入門產品試煉之地（同日發售）。
   * 其餘每代各一個。這條就是使用者說的「第一代是 OGN，然後是 SFD」。
   */
  it('第 1 代含起源與試煉之地，第 2 代是鑄魂淬鍊', () => {
    expect(setsOfGeneration(1)).toEqual(['OGN', 'OGS']);
    expect(setsOfGeneration(2)).toEqual(['SFD']);
    expect(setsOfGeneration(5)).toEqual(['RAD']);
  });

  it('代數的三語說法', () => {
    expect(generationLabel(1, 'zh-TW')).toBe('第一代');
    expect(generationLabel(3, 'zh-CN')).toBe('第三代');
    expect(generationLabel(5, 'en')).toBe('Set 5');
  });

  it('每一代都至少有一個系列，而且不會有系列落在代數之外', () => {
    const covered = GENERATIONS.flatMap((g) => setsOfGeneration(g));
    expect([...covered].sort()).toEqual([...SET_IDS].sort());
    for (const g of GENERATIONS) expect(setsOfGeneration(g).length).toBeGreaterThan(0);
  });
});

describe('圖鑑的預設排序', () => {
  const index = buildSearchIndex(ALL_CARDS, TAXONOMY.tagLabels);
  const sorted = applyFilters(ALL_CARDS, { ...EMPTY_FILTERS }, index, 'zh-TW');

  it('先依系列的發售順序分段', () => {
    const order = sorted.map((c) => SET_IDS.indexOf(c.set));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('同一個系列的卡連在一起，不會分成兩段', () => {
    const seen = new Set<string>();
    let current = '';
    for (const card of sorted) {
      if (card.set === current) continue;
      expect(seen.has(card.set), `${card.set} 被切成兩段`).toBe(false);
      seen.add(card.set);
      current = card.set;
    }
  });

  /*
   * 衍生物（T）、符文（R）、特別卡（SP）是另一套號碼。
   * 不分開排的話 UNL-T01 的號碼是 1，會夾在 UNL-001 旁邊 —— 看起來就是沒有邏輯。
   */
  it('一般卡排在前面，帶字母前綴的另外成段', () => {
    const unl = sorted.filter((c) => c.set === 'UNL');
    const firstPrefixed = unl.findIndex((c) => c.codePrefix !== null);
    expect(firstPrefixed).toBeGreaterThan(0);
    for (const card of unl.slice(firstPrefixed)) expect(card.codePrefix).not.toBeNull();
  });

  it('同一個系列裡卡號遞增，異畫版緊接在本尊後面', () => {
    const ven = sorted.filter((c) => c.set === 'VEN' && c.codePrefix === null);
    const numbers = ven.map((c) => c.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    const pair = ven.findIndex((c, i) => i > 0 && c.number === ven[i - 1]!.number);
    expect(pair, '應該找得到同號的異畫版').toBeGreaterThan(0);
    expect(ven[pair - 1]!.variant).toBeNull();
    expect(ven[pair]!.variant).not.toBeNull();
  });

  it('反向排序就是整個倒過來', () => {
    const desc = applyFilters(ALL_CARDS, { ...EMPTY_FILTERS, sort: 'number-desc' }, index, 'zh-TW');
    expect(desc.map((c) => c.id)).toEqual([...sorted].reverse().map((c) => c.id));
  });
});
