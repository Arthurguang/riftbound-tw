/**
 * 牌組匯入的測試。
 *
 * 貼上的文字是不可信輸入，所以重點有二：
 *   · 認得的格式要真的認得（來回一致）
 *   · 認不得的要**回報**而不是安靜略過或亂猜
 */

import { describe, expect, it } from 'vitest';
import { importDeck, inferChampion } from '../../src/lib/deck-import';
import { toCsv, toPlainText } from '../../src/lib/deck-export';
import { EMPTY_DECK, type Deck } from '../../src/lib/deck-rules';
import { ALL_CARDS } from '../../src/lib/cards';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

const legend = ALL_CARDS.find((c) => c.types.includes('legend'))!;
const rune = ALL_CARDS.find((c) => c.types.includes('rune'))!;
const battlefield = ALL_CARDS.find((c) => c.types.includes('battlefield'))!;
const unit = ALL_CARDS.find(
  (c) => c.types.includes('unit') && c.subtype !== 'token' && !c.name.includes(','),
)!;

describe('純文字牌表', () => {
  it('認得「3 卡名」這種最常見的寫法', () => {
    const result = importDeck(`3 ${unit.name}`, ALL_CARDS);
    expect(result.deck.main[unit.id]).toBe(3);
    expect(result.imported).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it('認得 3x、3 x、卡名 x3 等變化', () => {
    for (const line of [`3x ${unit.name}`, `3 x ${unit.name}`, `${unit.name} x3`]) {
      expect(importDeck(line, ALL_CARDS).deck.main[unit.id]).toBe(3);
    }
  });

  it('沒寫張數就當一張', () => {
    expect(importDeck(unit.name, ALL_CARDS).deck.main[unit.id]).toBe(1);
  });

  it('認得卡號', () => {
    expect(importDeck(`2 ${unit.code}`, ALL_CARDS).deck.main[unit.id]).toBe(2);
  });

  it('中文卡名也認得', () => {
    const withTw = ALL_CARDS.find((c) => c.zh.tw?.name && c.types.includes('unit'))!;
    const result = importDeck(`3 ${withTw.zh.tw!.name}`, ALL_CARDS);
    expect(result.imported).toBe(1);
    expect(Object.keys(result.deck.main)).toContain(withTw.id);
  });

  it('依卡片類型自動歸位，不需要標題', () => {
    const text = [`1 ${legend.name}`, `12 ${rune.name}`, `1 ${battlefield.name}`].join('\n');
    const result = importDeck(text, ALL_CARDS);

    expect(result.deck.legendId).toBe(legend.id);
    expect(result.deck.runes[rune.id]).toBe(12);
    expect(result.deck.battlefields[battlefield.id]).toBe(1);
  });

  it('有【備牌】標題時，主牌組的卡會放進備牌', () => {
    const text = ['【主牌組】', `3 ${unit.name}`, '', '【備牌】', `2 ${unit.name}`].join('\n');
    const result = importDeck(text, ALL_CARDS);

    expect(result.deck.main[unit.id]).toBe(3);
    expect(result.deck.sideboard[unit.id]).toBe(2);
  });

  it('英文的 Sideboard 標題也認得', () => {
    const text = ['Main Deck', `3 ${unit.name}`, 'Sideboard', `1 ${unit.name}`].join('\n');
    expect(importDeck(text, ALL_CARDS).deck.sideboard[unit.id]).toBe(1);
  });

  it('空行與註解行會被略過，不算錯誤', () => {
    const text = ['', '// 這是註解', `# 也是註解`, `3 ${unit.name}`, ''].join('\n');
    const result = importDeck(text, ALL_CARDS);
    expect(result.imported).toBe(1);
    expect(result.issues).toEqual([]);
  });
});

describe('本站匯出的格式可以原封不動貼回來', () => {
  const deck: Deck = {
    legendId: legend.id,
    championId: null,
    main: { [unit.id]: 3 },
    runes: { [rune.id]: 12 },
    battlefields: { [battlefield.id]: 3 },
    sideboard: {},
  };

  it('牌表文字來回一致', () => {
    const text = toPlainText(deck, byId, 'zh-TW', '測試牌組');
    const result = importDeck(text, ALL_CARDS);

    expect(result.deck.legendId).toBe(legend.id);
    expect(result.deck.main[unit.id]).toBe(3);
    expect(result.deck.runes[rune.id]).toBe(12);
    expect(result.deck.battlefields[battlefield.id]).toBe(3);
    expect(result.issues).toEqual([]);
  });

  it('三種語言的牌表文字都來回一致', () => {
    for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
      const result = importDeck(toPlainText(deck, byId, lang, 'x'), ALL_CARDS);
      expect(result.deck.main[unit.id]).toBe(3);
      expect(result.deck.runes[rune.id]).toBe(12);
      expect(result.issues).toEqual([]);
    }
  });

  it('CSV 來回一致', () => {
    const csv = toCsv(deck, byId, 'zh-TW');
    const result = importDeck(csv, ALL_CARDS);

    expect(result.deck.legendId).toBe(legend.id);
    expect(result.deck.main[unit.id]).toBe(3);
    expect(result.deck.runes[rune.id]).toBe(12);
    expect(result.deck.battlefields[battlefield.id]).toBe(3);
    expect(result.issues).toEqual([]);
  });

  it('含備牌的 CSV 也來回一致', () => {
    const withSide: Deck = { ...deck, sideboard: { [unit.id]: 0 } };
    const other = ALL_CARDS.find(
      (c) => c.types.includes('unit') && c.id !== unit.id && c.subtype !== 'token',
    )!;
    withSide.sideboard = { [other.id]: 2 };

    const result = importDeck(toCsv(withSide, byId, 'zh-TW'), ALL_CARDS);
    expect(result.deck.sideboard[other.id]).toBe(2);
    expect(result.deck.main[unit.id]).toBe(3);
  });

  it('含逗號的卡名在 CSV 來回後仍然正確', () => {
    const withComma = ALL_CARDS.find(
      (c) => c.name.includes(',') && c.types.includes('unit'),
    )!;
    const d: Deck = { ...EMPTY_DECK, main: { [withComma.id]: 2 } };

    const result = importDeck(toCsv(d, byId, 'en'), ALL_CARDS);
    expect(result.deck.main[withComma.id]).toBe(2);
    expect(result.issues).toEqual([]);
  });
});

describe('認不得的內容會回報，不會亂猜', () => {
  it('不存在的卡名會被記錄下來', () => {
    const result = importDeck('3 這張卡不存在', ALL_CARDS);
    expect(result.imported).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ line: 1, reason: 'unknown-card' });
  });

  it('離譜的張數會被拒絕', () => {
    const result = importDeck(`999 ${unit.name}`, ALL_CARDS);
    expect(result.imported).toBe(0);
    expect(result.issues[0]?.reason).toBe('bad-quantity');
  });

  it('一部分認得、一部分認不得時，認得的照樣匯入', () => {
    const text = [`3 ${unit.name}`, '2 不存在的卡', `12 ${rune.name}`].join('\n');
    const result = importDeck(text, ALL_CARDS);

    expect(result.imported).toBe(2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.line).toBe(2);
    expect(result.deck.main[unit.id]).toBe(3);
    expect(result.deck.runes[rune.id]).toBe(12);
  });

  it('注入型內容不會產生任何卡片', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '3 <img src=x onerror=alert(1)>',
      "3 '; DROP TABLE cards; --",
      '3 __proto__',
      '3 constructor',
      '3 ../../etc/passwd',
    ];
    const result = importDeck(attacks.join('\n'), ALL_CARDS);

    expect(result.deck).toMatchObject({ main: {}, runes: {}, battlefields: {}, sideboard: {} });
    expect(result.imported).toBe(0);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('超長輸入不會無限展開', () => {
    const huge = Array.from({ length: 10000 }, () => `1 ${unit.name}`).join('\n');
    const result = importDeck(huge, ALL_CARDS);
    // 只處理前 2000 行
    expect(result.imported).toBeLessThanOrEqual(2000);
    expect(result.deck.main[unit.id]).toBeLessThanOrEqual(99);
  });

  it('空字串安全回到空牌組', () => {
    const result = importDeck('', ALL_CARDS);
    expect(result.imported).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.deck.legendId).toBeNull();
  });

  it('指示物不能匯入', () => {
    const token = ALL_CARDS.find((c) => c.subtype === 'token')!;
    const result = importDeck(`1 ${token.code}`, ALL_CARDS);
    expect(result.imported).toBe(0);
    expect(result.issues[0]?.reason).toBe('unknown-card');
  });
});

describe('同名卡的版本選擇', () => {
  it('同名多版本時一律取卡號最小的，結果可預測', () => {
    const groups = new Map<string, Card[]>();
    for (const card of ALL_CARDS) {
      groups.set(card.name, [...(groups.get(card.name) ?? []), card]);
    }
    const pair = [...groups.values()].find((list) => list.length >= 2);
    expect(pair).toBeDefined();

    const smallest = [...pair!].sort((a, b) => a.number - b.number)[0]!;
    const result = importDeck(`1 ${smallest.name}`, ALL_CARDS);

    const picked = Object.keys({
      ...result.deck.main,
      ...result.deck.runes,
      ...result.deck.battlefields,
    })[0];
    expect(picked ?? result.deck.legendId).toBe(smallest.id);
  });

  it('用卡號就能指定特定版本', () => {
    const variant = ALL_CARDS.find((c) => c.variant !== null && c.types.includes('unit'));
    if (!variant) return;
    expect(importDeck(`1 ${variant.code}`, ALL_CARDS).deck.main[variant.id]).toBe(1);
  });
});

describe('自動判斷選定英雄', () => {
  it('只有唯一候選時才自動指定', () => {
    const champion = ALL_CARDS.find(
      (c) => c.subtype === 'champion' && c.tags.some((t) => legend.tags.includes(t)),
    );
    if (!champion) return;

    const deck: Deck = { ...EMPTY_DECK, legendId: legend.id, main: { [champion.id]: 1 } };
    expect(inferChampion(deck, byId)).toBe(champion.id);
  });

  it('有多個候選時不猜，回傳 null', () => {
    const candidates = ALL_CARDS.filter(
      (c) => c.subtype === 'champion' && c.tags.some((t) => legend.tags.includes(t)),
    );
    if (candidates.length < 2) return;

    const deck: Deck = {
      ...EMPTY_DECK,
      legendId: legend.id,
      main: Object.fromEntries(candidates.slice(0, 2).map((c) => [c.id, 1])),
    };
    expect(inferChampion(deck, byId)).toBeNull();
  });

  it('沒有傳奇時不猜', () => {
    expect(inferChampion({ ...EMPTY_DECK, main: {} }, byId)).toBeNull();
  });

  it('已經指定過就不覆蓋', () => {
    const deck: Deck = { ...EMPTY_DECK, legendId: legend.id, championId: unit.id };
    expect(inferChampion(deck, byId)).toBe(unit.id);
  });
});
