/**
 * 對局盤面模型的測試。
 *
 * 最重要的一組是「剩餘牌堆」：復盤時算出來的每個機率都建立在它上面，
 * 算錯了整頁的數字都是錯的。
 *
 * 網址一樣是不可信輸入，所以也在這裡驗證解碼的防禦。
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_BOARD,
  EMPTY_PLAYER,
  foreignCards,
  handSize,
  hasDeck,
  moveCard,
  pileSize,
  remainingDeck,
  runesOnBase,
  setInPile,
  ZONE_RULES,
  type PlayerBoard,
} from '../../src/lib/board-state';
import { decodeBoard, encodeBoard } from '../../src/lib/board-url';
import { buildCodeIndex } from '../../src/lib/deck-url';
import { ALL_CARDS } from '../../src/lib/cards';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const index = buildCodeIndex(ALL_CARDS);

const legend = ALL_CARDS.find((c) => c.types.includes('legend'))!;
const rune = ALL_CARDS.find((c) => c.types.includes('rune'))!;
const unit = ALL_CARDS.find((c) => c.types.includes('unit') && c.subtype !== 'token')!;
const other = ALL_CARDS.find(
  (c) => c.types.includes('unit') && c.subtype !== 'token' && c.id !== unit.id,
)!;
const champion = ALL_CARDS.find((c) => c.subtype === 'champion')!;

/** 一個有牌組的空盤面。 */
function player(overrides: Partial<PlayerBoard> = {}): PlayerBoard {
  return {
    ...EMPTY_PLAYER,
    deck: {
      legendId: legend.id,
      championId: null,
      main: { [unit.id]: 3, [other.id]: 3 },
      runes: { [rune.id]: 12 },
      battlefields: {},
      sideboard: {},
    },
    ...overrides,
  };
}

describe('區域的規則出處', () => {
  it('每個區域都標明官方條號', () => {
    expect(ZONE_RULES.hand.rule).toBe('108.7');
    expect(ZONE_RULES.base.rule).toBe('107.1');
    expect(ZONE_RULES.discard.rule).toBe('108.2');
    expect(ZONE_RULES.exile.rule).toBe('108.6');
  });

  it('只有手牌是私密資訊（108.7.c）', () => {
    expect(ZONE_RULES.hand.hidden).toBe(true);
    expect(ZONE_RULES.base.hidden).toBe(false);
    expect(ZONE_RULES.discard.hidden).toBe(false);
    expect(ZONE_RULES.exile.hidden).toBe(false);
  });
});

describe('疊的基本操作', () => {
  it('張數降到 0 就從資料裡移除，不留空項', () => {
    const pile = setInPile({ [unit.id]: 1 }, unit.id, 0);
    expect(pile).toEqual({});
    expect(Object.keys(pile)).toHaveLength(0);
  });

  it('張數有上限，離譜的數字不會進到狀態裡', () => {
    expect(setInPile({}, unit.id, 999)[unit.id]).toBe(99);
  });

  it('負數視為移除', () => {
    expect(setInPile({ [unit.id]: 2 }, unit.id, -5)).toEqual({});
  });

  it('pileSize 忽略非正數', () => {
    expect(pileSize({ a: 3, b: 0, c: -1 })).toBe(3);
  });
});

describe('在區域之間移動卡片', () => {
  it('從手牌打到基地', () => {
    const before = player({ hand: { [unit.id]: 2 } });
    const after = moveCard(before, 'hand', 'base', unit.id);

    expect(after.hand[unit.id]).toBe(1);
    expect(after.base[unit.id]).toBe(1);
  });

  it('來源沒有那張卡就不動作', () => {
    const before = player({ hand: {} });
    expect(moveCard(before, 'hand', 'base', unit.id)).toBe(before);
  });

  it('搬到同一區不動作', () => {
    const before = player({ hand: { [unit.id]: 1 } });
    expect(moveCard(before, 'hand', 'hand', unit.id)).toBe(before);
  });

  it('搬完最後一張後來源不留空項', () => {
    const after = moveCard(player({ hand: { [unit.id]: 1 } }), 'hand', 'discard', unit.id);
    expect(after.hand).toEqual({});
    expect(after.discard[unit.id]).toBe(1);
  });
});

describe('剩餘牌堆', () => {
  it('什麼都沒擺時，牌堆就是整副牌組', () => {
    const result = remainingDeck(player());
    expect(result.main).toEqual({ [unit.id]: 3, [other.id]: 3 });
    expect(result.mainSize).toBe(6);
    expect(result.runeSize).toBe(12);
    expect(result.overflow).toEqual([]);
  });

  it('手牌、基地、廢牌堆、放逐都會從牌堆扣掉', () => {
    const result = remainingDeck(
      player({
        hand: { [unit.id]: 1 },
        base: { [unit.id]: 1 },
        discard: { [other.id]: 2 },
        exile: { [other.id]: 1 },
      }),
    );

    expect(result.main[unit.id]).toBe(1);
    expect(result.main[other.id]).toBeUndefined(); // 3 張都不在牌堆了
    expect(result.mainSize).toBe(1);
  });

  it('基地上的符文會從符文牌堆扣掉', () => {
    const result = remainingDeck(player({ base: { [rune.id]: 4 } }));
    expect(result.runes[rune.id]).toBe(8);
    expect(result.runeSize).toBe(8);
  });

  it('選定英雄開局就在英雄區域，不算在牌堆裡（133.4）', () => {
    const withChampion = player({
      deck: {
        legendId: legend.id,
        championId: champion.id,
        main: { [champion.id]: 3 },
        runes: {},
        battlefields: {},
        sideboard: {},
      },
    });
    // 牌組有 3 張，扣掉英雄區域那張 → 牌堆剩 2 張
    expect(remainingDeck(withChampion).main[champion.id]).toBe(2);
  });

  it('不知道內容的手牌只減少總張數，不指定減哪一張', () => {
    const result = remainingDeck(player({ unknownHand: 2 }));

    // 每張卡的張數不變（不知道是哪幾張）
    expect(result.main).toEqual({ [unit.id]: 3, [other.id]: 3 });
    // 但總張數要扣掉
    expect(result.mainSize).toBe(4);
  });

  it('未知手牌多於牌堆時，總張數不會變成負數', () => {
    expect(remainingDeck(player({ unknownHand: 99 })).mainSize).toBe(0);
  });

  it('擺超過牌組張數時會回報，而不是安靜修正', () => {
    const result = remainingDeck(player({ discard: { [unit.id]: 5 } }));

    expect(result.overflow).toHaveLength(1);
    expect(result.overflow[0]).toMatchObject({ cardId: unit.id, inDeck: 3, onBoard: 5 });
    // 出問題的那張不會留在牌堆裡
    expect(result.main[unit.id]).toBeUndefined();
  });

  it('空牌組不會崩潰', () => {
    expect(() => remainingDeck(EMPTY_PLAYER)).not.toThrow();
    expect(remainingDeck(EMPTY_PLAYER).mainSize).toBe(0);
  });
});

describe('牌組以外的卡', () => {
  it('盤面出現不屬於這副牌組的卡會被指出來', () => {
    const stranger = ALL_CARDS.find(
      (c) => c.id !== unit.id && c.id !== other.id && c.id !== rune.id && c.id !== legend.id,
    )!;
    expect(foreignCards(player({ base: { [stranger.id]: 1 } }))).toContain(stranger.id);
  });

  it('牌組裡的卡不會被誤報', () => {
    expect(foreignCards(player({ hand: { [unit.id]: 1 }, base: { [rune.id]: 2 } }))).toEqual([]);
  });

  it('傳奇卡不算牌組以外的卡', () => {
    expect(foreignCards(player({ base: { [legend.id]: 1 } }))).toEqual([]);
  });
});

describe('其他衍生資訊', () => {
  it('基地上的符文張數算得出來', () => {
    expect(runesOnBase(player({ base: { [rune.id]: 5, [unit.id]: 2 } }), byId)).toBe(5);
  });

  it('手牌張數是已知加未知（108.7.e：張數是公開資訊）', () => {
    expect(handSize(player({ hand: { [unit.id]: 2 }, unknownHand: 3 }))).toBe(5);
  });

  it('未知手牌是負數時當作 0', () => {
    expect(handSize(player({ unknownHand: -5 }))).toBe(0);
  });

  it('hasDeck 判斷有沒有東西可以算', () => {
    expect(hasDeck(EMPTY_PLAYER)).toBe(false);
    expect(hasDeck(player())).toBe(true);
  });
});

describe('盤面的網址編碼', () => {
  const board = {
    turn: 4,
    onThePlay: false,
    you: player({ hand: { [unit.id]: 2 }, base: { [rune.id]: 6 }, discard: { [other.id]: 1 } }),
    opponent: player({ unknownHand: 5, discard: { [unit.id]: 2 } }),
  };

  it('編碼後再解碼會得到同一個盤面', () => {
    const result = decodeBoard(encodeBoard(board, ALL_CARDS), index);
    expect(result.board).toEqual(board);
    expect(result.dropped).toBe(0);
  });

  it('空盤面來回一致', () => {
    expect(decodeBoard(encodeBoard(EMPTY_BOARD, ALL_CARDS), index).board).toEqual(EMPTY_BOARD);
  });

  it('先手後手會保留', () => {
    const first = { ...board, onThePlay: true };
    expect(decodeBoard(encodeBoard(first, ALL_CARDS), index).board.onThePlay).toBe(true);
    expect(decodeBoard(encodeBoard(board, ALL_CARDS), index).board.onThePlay).toBe(false);
  });

  // ── 以下是安全性測試 ──

  it('版本不符時整份不採用', () => {
    expect(decodeBoard('zz!1!1!|', index).board).toEqual(EMPTY_BOARD);
  });

  it('認不得的卡片代碼會被丟棄並回報', () => {
    const result = decodeBoard('b1!1!1!~nope999~0~~~!~~0~~~', index);
    expect(result.board.you.hand).toEqual({});
    expect(result.dropped).toBeGreaterThan(0);
  });

  it('離譜的回合數會被夾回合理範圍', () => {
    expect(decodeBoard('b1!99999!1!~~0~~~!~~0~~~', index).board.turn).toBe(1);
    expect(decodeBoard('b1!-5!1!~~0~~~!~~0~~~', index).board.turn).toBe(1);
    expect(decodeBoard('b1!7!1!~~0~~~!~~0~~~', index).board.turn).toBe(7);
  });

  it('離譜的未知手牌張數會被拒絕', () => {
    expect(decodeBoard('b1!1!1!~~99999~~~!~~0~~~', index).board.you.unknownHand).toBe(0);
    expect(decodeBoard('b1!1!1!~~-3~~~!~~0~~~', index).board.you.unknownHand).toBe(0);
  });

  it('注入型內容不會變成卡片', () => {
    const attacks = [
      'b1!1!1!~<script>alert(1)</script>~0~~~!~~0~~~',
      'b1!1!1!~__proto__x3~0~~~!~~0~~~',
      'b1!1!1!~constructorx3~0~~~!~~0~~~',
      "b1|1!1!~'; DROP TABLE--~0~~~|~~0~~~",
    ];
    for (const attack of attacks) {
      const result = decodeBoard(attack, index);
      expect(result.board.you.hand).toEqual({});
      expect(result.dropped).toBeGreaterThan(0);
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('超長網址不會無限展開', () => {
    const huge = Array.from({ length: 5000 }, () => 'ogn001x99').join('.');
    const result = decodeBoard(`b1|1!1!~${huge}~0~~~|~~0~~~`, index);
    expect(Object.keys(result.board.you.hand).length).toBeLessThanOrEqual(1);
  });

  it('空字串與亂碼都安全回到空盤面', () => {
    expect(decodeBoard('', index).board).toEqual(EMPTY_BOARD);
    expect(decodeBoard('garbage', index).board).toEqual(EMPTY_BOARD);
  });
});
