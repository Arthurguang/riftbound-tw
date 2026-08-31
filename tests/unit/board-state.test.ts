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
  swapWithSideboard,
  timingKeywords,
  turnStateId,
  TURN_STATE_INFO,
  canPlayByTiming,
  activeRunesOnBase,
  canStandardMove,
  dormantCount,
  entersDormant,
  isInPlayZone,
  setDormant,
  wakeAll,
  ZONE_RULES,
  LOCATIONS,
  LOCATION_RULES,
  type PlayerBoard,
} from '../../src/lib/board-state';
import { totalCards } from '../../src/lib/deck-rules';
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

  it('選定英雄在英雄區域，不算在牌堆裡（133.4、103.2.a.1）', () => {
    const withChampion = player({
      deck: {
        legendId: legend.id,
        championId: champion.id,
        main: { [champion.id]: 3 },
        runes: {},
        battlefields: {},
        sideboard: {},
      },
      // 開局時它就擺在英雄區域
      champion: { [champion.id]: 1 },
    });
    // 牌組有 3 張，英雄區域佔掉 1 張 → 牌堆剩 2 張
    expect(remainingDeck(withChampion).main[champion.id]).toBe(2);
  });

  it('選定英雄被打出後仍然不回牌堆 —— 只是換個區域', () => {
    const base = player({
      deck: {
        legendId: legend.id,
        championId: champion.id,
        main: { [champion.id]: 3 },
        runes: {},
        battlefields: {},
        sideboard: {},
      },
      champion: { [champion.id]: 1 },
    });
    const played = moveCard(base, 'champion', 'base', champion.id);

    expect(played.champion).toEqual({});
    expect(played.base[champion.id]).toBe(1);
    expect(remainingDeck(played).main[champion.id]).toBe(2);
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
    battlefields: [null, null] as [string | null, string | null],
    turn: 4,
    onThePlay: false,
    activePlayer: 'you' as const,
    phase: { duel: false, chain: false },
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
    const result = decodeBoard('b3!1!1!~nope999~0~~~~~~!~~0~~~~~~!.', index);
    expect(result.board.you.hand).toEqual({});
    expect(result.dropped).toBeGreaterThan(0);
  });

  it('離譜的回合數會被夾回合理範圍', () => {
    expect(decodeBoard('b3!99999!1!~~0~~~~~~!~~0~~~~~~!.', index).board.turn).toBe(1);
    expect(decodeBoard('b3!-5!1!~~0~~~~~~!~~0~~~~~~!.', index).board.turn).toBe(1);
    expect(decodeBoard('b3!7!1!~~0~~~~~~!~~0~~~~~~!.', index).board.turn).toBe(7);
  });

  it('離譜的未知手牌張數會被拒絕', () => {
    expect(decodeBoard('b3!1!1!~~99999~~~~~~!~~0~~~~~~!.', index).board.you.unknownHand).toBe(0);
    expect(decodeBoard('b3!1!1!~~-3~~~~~~!~~0~~~~~~!.', index).board.you.unknownHand).toBe(0);
  });

  it('注入型內容不會變成卡片', () => {
    const attacks = [
      'b3!1!1!~<script>alert(1)</script>~0~~~~~~!~~0~~~~~~!.',
      'b3!1!1!~__proto__x3~0~~~~~~!~~0~~~~~~!.',
      'b3!1!1!~constructorx3~0~~~~~~!~~0~~~~~~!.',
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

describe('位置：戰場與基地（規則 198.1）', () => {
  it('位置包含基地與兩處戰場', () => {
    expect(LOCATIONS).toEqual(['base', 'bf0', 'bf1']);
    expect(LOCATION_RULES.base).toBe('107.1');
    expect(LOCATION_RULES.bf0).toBe('107.2');
  });

  it('單位可以在基地與戰場之間移動（198.2：位置是常駐牌的屬性）', () => {
    const before = player({ base: { [unit.id]: 2 } });

    const toBf0 = moveCard(before, 'base', 'bf0', unit.id);
    expect(toBf0.base[unit.id]).toBe(1);
    expect(toBf0.bf0[unit.id]).toBe(1);

    const toBf1 = moveCard(toBf0, 'bf0', 'bf1', unit.id);
    expect(toBf1.bf0).toEqual({});
    expect(toBf1.bf1[unit.id]).toBe(1);
  });

  it('戰場上的單位也要從牌堆扣掉', () => {
    const result = remainingDeck(player({ bf0: { [unit.id]: 1 }, bf1: { [unit.id]: 1 } }));
    expect(result.main[unit.id]).toBe(1);
  });

  it('符文只算基地上的 —— 107.1.c 明文說符文位於基地', () => {
    // 就算有人把符文擺到戰場欄位，資源計算也只看基地
    const p = player({ base: { [rune.id]: 3 }, bf0: { [rune.id]: 5 } });
    expect(runesOnBase(p, byId)).toBe(3);
  });
});

describe('戰場區域（485.4、485.5）', () => {
  const battlefield = ALL_CARDS.find((c) => c.types.includes('battlefield'))!;
  const other2 = ALL_CARDS.find(
    (c) => c.types.includes('battlefield') && c.id !== battlefield.id,
  )!;

  it('兩處戰場會編進網址並還原', () => {
    const board = {
      battlefields: [battlefield.id, other2.id] as [string | null, string | null],
      turn: 3,
      onThePlay: true,
      activePlayer: 'you' as const,
      phase: { duel: false, chain: false },
      you: player(),
      opponent: player(),
    };
    const result = decodeBoard(encodeBoard(board, ALL_CARDS), index);

    expect(result.board.battlefields).toEqual([battlefield.id, other2.id]);
    expect(result.dropped).toBe(0);
  });

  it('只選了一處也能正確還原', () => {
    const board = {
      battlefields: [battlefield.id, null] as [string | null, string | null],
      turn: 1,
      onThePlay: true,
      activePlayer: 'you' as const,
      phase: { duel: false, chain: false },
      you: player(),
      opponent: player(),
    };
    expect(decodeBoard(encodeBoard(board, ALL_CARDS), index).board.battlefields).toEqual([
      battlefield.id,
      null,
    ]);
  });

  it('認不得的戰場代碼視為沒選，不亂猜', () => {
    const result = decodeBoard('b3!1!1!~~0~~~~~!~~0~~~~~!nope999.alsonope', index);
    expect(result.board.battlefields).toEqual([null, null]);
  });
});

describe('舊版連結相容', () => {
  it('b1 的舊連結仍然能開，戰場與戰場上的單位為空', () => {
    const legacy = `b1!3!0!${'~'.repeat(0)}~~0~~~!~~0~~~`;
    const result = decodeBoard(legacy, index);

    expect(result.board.turn).toBe(3);
    expect(result.board.onThePlay).toBe(false);
    expect(result.board.battlefields).toEqual([null, null]);
    expect(result.board.you.bf0).toEqual({});
    expect(result.board.you.bf1).toEqual({});
  });

  it('b1 連結裡的手牌與廢牌堆照樣讀得出來', () => {
    const legacy = `b1!1!1!2|||${'ogn001x3'}|||~ogn001~0~~~!~~0~~~`;
    const result = decodeBoard(legacy, index);
    expect(Object.keys(result.board.you.hand)).toHaveLength(1);
  });
});

describe('局間換牌（賽事規則 403.4）', () => {
  const deckWithSide = {
    legendId: legend.id,
    championId: null,
    main: { [unit.id]: 3, [other.id]: 1 },
    runes: {},
    battlefields: {},
    sideboard: { [other.id]: 2 },
  };

  it('可以把主牌組的卡換到備牌', () => {
    const next = swapWithSideboard(deckWithSide, unit.id, 'toSideboard');
    expect(next.main[unit.id]).toBe(2);
    expect(next.sideboard[unit.id]).toBe(1);
  });

  it('可以把備牌的卡換進主牌組', () => {
    const next = swapWithSideboard(deckWithSide, other.id, 'toMain');
    expect(next.sideboard[other.id]).toBe(1);
    expect(next.main[other.id]).toBe(2);
  });

  it('來源沒有那張卡就不動作', () => {
    expect(swapWithSideboard(deckWithSide, unit.id, 'toMain')).toBe(deckWithSide);
  });

  it('總張數守恆 —— 換牌只是搬移，不會憑空生出卡', () => {
    const before = totalCards(deckWithSide.main) + totalCards(deckWithSide.sideboard);
    const after = swapWithSideboard(deckWithSide, unit.id, 'toSideboard');
    expect(totalCards(after.main) + totalCards(after.sideboard)).toBe(before);
  });

  it('選定英雄被換出主牌組後就不再是選定英雄（103.2）', () => {
    const withChampion = {
      ...deckWithSide,
      championId: other.id,
      main: { [other.id]: 1 },
    };
    const next = swapWithSideboard(withChampion, other.id, 'toSideboard');

    expect(next.main[other.id]).toBeUndefined();
    expect(next.championId).toBeNull();
  });

  it('主牌組還有同名卡時，選定英雄不會被取消', () => {
    const withChampion = { ...deckWithSide, championId: unit.id };
    const next = swapWithSideboard(withChampion, unit.id, 'toSideboard');

    expect(next.main[unit.id]).toBe(2);
    expect(next.championId).toBe(unit.id);
  });
});

describe('備牌不算在盤面的牌組裡', () => {
  it('備牌的卡出現在盤面上會被當成「牌組以外的卡」', () => {
    // 403.4、403.5：備牌只在局間換進主牌組，對局中不在場上
    const sideOnly = ALL_CARDS.find(
      (c) => c.id !== unit.id && c.id !== other.id && c.types.includes('unit'),
    )!;
    const p = player({
      deck: {
        legendId: legend.id,
        championId: null,
        main: { [unit.id]: 3 },
        runes: {},
        battlefields: {},
        sideboard: { [sideOnly.id]: 2 },
      },
      base: { [sideOnly.id]: 1 },
    });

    expect(foreignCards(p)).toContain(sideOnly.id);
  });
});

describe('回合狀態與打出時機（規則 307–310）', () => {
  const withReaction = ALL_CARDS.find((c) => timingKeywords(c).reaction)!;
  const withAction = ALL_CARDS.find((c) => timingKeywords(c).action)!;
  const plain = ALL_CARDS.find(
    (c) => c.types.includes('unit') && !timingKeywords(c).action && !timingKeywords(c).reaction,
  )!;

  it('四種狀態由兩個維度疊加而成（310）', () => {
    expect(turnStateId({ duel: false, chain: false })).toBe('normal-open');
    expect(turnStateId({ duel: false, chain: true })).toBe('normal-closed');
    expect(turnStateId({ duel: true, chain: false })).toBe('duel-open');
    expect(turnStateId({ duel: true, chain: true })).toBe('duel-closed');
  });

  it('每種狀態都標明官方條號', () => {
    expect(TURN_STATE_INFO['normal-open'].rule).toBe('310.1');
    expect(TURN_STATE_INFO['normal-closed'].rule).toBe('310.2');
    expect(TURN_STATE_INFO['duel-open'].rule).toBe('310.3');
    expect(TURN_STATE_INFO['duel-closed'].rule).toBe('310.4');
  });

  it('資料裡認得出迅捷（Action）與反應（Reaction）', () => {
    expect(timingKeywords(withAction)).toMatchObject({ action: true });
    expect(timingKeywords(withReaction)).toMatchObject({ reaction: true });
    expect(timingKeywords(plain)).toEqual({ action: false, reaction: false });
  });

  it('普通開環：回合玩家可以打出任何卡（310.1.a）', () => {
    expect(canPlayByTiming(plain, 'normal-open', true)).toBe(true);
    expect(canPlayByTiming(withAction, 'normal-open', true)).toBe(true);
    expect(canPlayByTiming(withReaction, 'normal-open', true)).toBe(true);
  });

  it('普通開環：不是你的回合就只有反應打得出來', () => {
    expect(canPlayByTiming(plain, 'normal-open', false)).toBe(false);
    expect(canPlayByTiming(withAction, 'normal-open', false)).toBe(false);
    expect(canPlayByTiming(withReaction, 'normal-open', false)).toBe(true);
  });

  it('閉環狀態：只有反應（309.1.a），跟是不是回合玩家無關', () => {
    for (const isTurnPlayer of [true, false]) {
      expect(canPlayByTiming(plain, 'normal-closed', isTurnPlayer)).toBe(false);
      expect(canPlayByTiming(withAction, 'normal-closed', isTurnPlayer)).toBe(false);
      expect(canPlayByTiming(withReaction, 'normal-closed', isTurnPlayer)).toBe(true);
    }
  });

  it('法術對決開環：只有迅捷或反應（308.1.a）', () => {
    expect(canPlayByTiming(plain, 'duel-open', true)).toBe(false);
    expect(canPlayByTiming(withAction, 'duel-open', true)).toBe(true);
    expect(canPlayByTiming(withReaction, 'duel-open', true)).toBe(true);
    // 對決中不分回合玩家
    expect(canPlayByTiming(withAction, 'duel-open', false)).toBe(true);
  });

  it('法術對決閉環：兩條限制疊加後只剩反應', () => {
    expect(canPlayByTiming(withAction, 'duel-closed', true)).toBe(false);
    expect(canPlayByTiming(withReaction, 'duel-closed', true)).toBe(true);
  });

  it('大多數單位只能在普通開環打出 —— 這正是階段會影響召喚的原因', () => {
    const units = ALL_CARDS.filter((c) => c.types.includes('unit') && c.subtype !== 'token');
    const timed = units.filter((c) => {
      const k = timingKeywords(c);
      return k.action || k.reaction;
    });

    // 絕大多數單位沒有時機關鍵字
    expect(timed.length).toBeLessThan(units.length * 0.1);
    for (const unit of units.filter((u) => !timed.includes(u)).slice(0, 20)) {
      expect(canPlayByTiming(unit, 'duel-open', true)).toBe(false);
      expect(canPlayByTiming(unit, 'normal-open', true)).toBe(true);
    }
  });

  it('回合狀態會編進網址並還原', () => {
    const board = {
      ...EMPTY_BOARD,
      activePlayer: 'opponent' as const,
      phase: { duel: true, chain: true },
    };
    const result = decodeBoard(encodeBoard(board, ALL_CARDS), index);

    expect(result.board.activePlayer).toBe('opponent');
    expect(result.board.phase).toEqual({ duel: true, chain: true });
  });

  it('b3 以前的舊連結預設為你的回合、普通開環', () => {
    const legacy = 'b3!1!1!~~0~~~~~~!~~0~~~~~~!.';
    const result = decodeBoard(legacy, index);

    expect(result.board.activePlayer).toBe('you');
    expect(result.board.phase).toEqual({ duel: false, chain: false });
  });
});

describe('活躍與休眠（規則 414、415）', () => {
  const gear = ALL_CARDS.find((c) => c.types.includes('gear'))!;

  it('進場預設狀態依卡種而不同', () => {
    // 143.4、359.2.c：單位以休眠狀態進場
    expect(entersDormant(unit)).toBe(true);
    // 359.2.d：非單位裝備以活躍狀態進場
    expect(entersDormant(gear)).toBe(false);
    // 430.2.a：符文預設以活躍狀態召出
    expect(entersDormant(rune)).toBe(false);
  });

  it('休眠張數不會超過該位置實際有幾張', () => {
    const p = player({ base: { [unit.id]: 2 } });
    expect(dormantCount(setDormant(p, 'base', unit.id, 99), 'base', unit.id)).toBe(2);
    expect(dormantCount(setDormant(p, 'base', unit.id, -5), 'base', unit.id)).toBe(0);
  });

  it('喚醒階段把所有東西設為活躍（415.3.a）', () => {
    const p = setDormant(
      setDormant(player({ base: { [unit.id]: 2 }, bf0: { [other.id]: 1 } }), 'base', unit.id, 2),
      'bf0',
      other.id,
      1,
    );
    expect(dormantCount(p, 'base', unit.id)).toBe(2);

    const woken = wakeAll(p);
    expect(woken.dormant).toEqual({ base: {}, bf0: {}, bf1: {} });
  });

  it('只有活躍的符文算資源（164.2.a、414.1）', () => {
    const p = player({ base: { [rune.id]: 5 } });
    expect(activeRunesOnBase(p, byId)).toBe(5);

    const withDormant = setDormant(p, 'base', rune.id, 2);
    expect(activeRunesOnBase(withDormant, byId)).toBe(3);

    // 全部休眠 → 沒有可用資源
    expect(activeRunesOnBase(setDormant(p, 'base', rune.id, 5), byId)).toBe(0);
  });

  it('休眠的單位付不出標準移動的費用（414.3.a、414.1.b）', () => {
    const p = player({ base: { [unit.id]: 2 } });
    expect(canStandardMove(p, 'base', unit.id)).toBe(true);

    // 兩張都休眠 → 沒有能付費用的
    expect(canStandardMove(setDormant(p, 'base', unit.id, 2), 'base', unit.id)).toBe(false);
    // 只有一張休眠 → 另一張還能動
    expect(canStandardMove(setDormant(p, 'base', unit.id, 1), 'base', unit.id)).toBe(true);
  });

  it('只有場上的位置有活躍／休眠之分', () => {
    expect(isInPlayZone('base')).toBe(true);
    expect(isInPlayZone('bf0')).toBe(true);
    expect(isInPlayZone('bf1')).toBe(true);
    expect(isInPlayZone('hand')).toBe(false);
    expect(isInPlayZone('discard')).toBe(false);
    expect(isInPlayZone('champion')).toBe(false);
  });

  it('休眠狀態會編進網址並還原', () => {
    const you = setDormant(player({ base: { [rune.id]: 4 }, bf0: { [unit.id]: 2 } }), 'base', rune.id, 3);
    const board = {
      ...EMPTY_BOARD,
      you: setDormant(you, 'bf0', unit.id, 1),
    };
    const result = decodeBoard(encodeBoard(board, ALL_CARDS), index);

    expect(dormantCount(result.board.you, 'base', rune.id)).toBe(3);
    expect(dormantCount(result.board.you, 'bf0', unit.id)).toBe(1);
    expect(result.dropped).toBe(0);
  });

  it('b4 以前的舊連結預設全部活躍', () => {
    const legacy = 'b4!1!1!~~0~~~~~~!~~0~~~~~~!.!y00';
    const result = decodeBoard(legacy, index);
    expect(result.board.you.dormant).toEqual({ base: {}, bf0: {}, bf1: {} });
  });
});
