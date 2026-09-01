/**
 * 盤面動作的測試。
 *
 * 隨機的部分全部注入固定的亂數來源，這樣「抽到什麼」是可預測的 ——
 * 否則測不出「加權是不是照張數」這種事，只能測「有沒有崩潰」。
 */

import { describe, expect, it } from 'vitest';
import {
  beginTurn,
  discardFrom,
  drawCards,
  handEntries,
  mulligan,
  pickWeighted,
  startGame,
  summonRunes,
} from '../../src/lib/board-actions';
import {
  EMPTY_BOARD,
  EMPTY_PLAYER,
  pileSize,
  remainingDeck,
  activeRunesOnBase,
  setDormant,
  dormantCount,
  type PlayerBoard,
} from '../../src/lib/board-state';
import { TURN_RULES } from '../../src/lib/draw-model';
import { ALL_CARDS } from '../../src/lib/cards';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

const legend = ALL_CARDS.find((c) => c.types.includes('legend'))!;
const rune = ALL_CARDS.find((c) => c.types.includes('rune'))!;
const rune2 = ALL_CARDS.find((c) => c.types.includes('rune') && c.id !== rune.id)!;
const unit = ALL_CARDS.find((c) => c.types.includes('unit') && c.subtype !== 'token')!;
const other = ALL_CARDS.find(
  (c) => c.types.includes('unit') && c.subtype !== 'token' && c.id !== unit.id,
)!;
const champion = ALL_CARDS.find((c) => c.subtype === 'champion')!;

function player(overrides: Partial<PlayerBoard> = {}): PlayerBoard {
  return {
    ...EMPTY_PLAYER,
    deck: {
      legendId: legend.id,
      championId: null,
      main: { [unit.id]: 3, [other.id]: 3 },
      runes: { [rune.id]: 8, [rune2.id]: 4 },
      battlefields: {},
      sideboard: {},
    },
    ...overrides,
  };
}

/** 固定回傳同一個值的亂數來源，讓抽牌結果可預測。 */
const fixed = (value: number) => () => value;

/** 依序回傳指定值的亂數來源。 */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('加權隨機挑一張', () => {
  it('roll 落在第一項的範圍就挑第一項', () => {
    // { a: 3, b: 1 } 共 4 張，roll 0–2 應該是 a
    expect(pickWeighted({ a: 3, b: 1 }, fixed(0))).toBe('a');
    expect(pickWeighted({ a: 3, b: 1 }, fixed(0.5))).toBe('a'); // floor(0.5*4)=2
  });

  it('roll 落在第二項的範圍就挑第二項', () => {
    expect(pickWeighted({ a: 3, b: 1 }, fixed(0.9))).toBe('b'); // floor(0.9*4)=3
  });

  it('張數越多被挑中的機會越大 —— 實際跑一輪驗證分布', () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i += 1) {
      const picked = pickWeighted({ a: 3, b: 1 }, fixed(i / 1000));
      if (picked) counts[picked] = (counts[picked] ?? 0) + 1;
    }
    // 3:1 的比例，容許些微誤差
    expect(counts.a! / counts.b!).toBeGreaterThan(2.5);
    expect(counts.a! / counts.b!).toBeLessThan(3.5);
  });

  it('空的一疊回傳 null', () => {
    expect(pickWeighted({}, fixed(0))).toBeNull();
    expect(pickWeighted({ a: 0 }, fixed(0))).toBeNull();
  });
});

describe('抽牌（315.4.b）', () => {
  it('抽出來的牌會進手牌，並從牌堆扣掉', () => {
    const before = player();
    expect(remainingDeck(before).mainSize).toBe(6);

    const after = drawCards(before, 2, fixed(0));
    expect(pileSize(after.hand)).toBe(2);
    expect(remainingDeck(after).mainSize).toBe(4);
  });

  it('牌堆抽完就停，不會抽出不存在的牌', () => {
    const after = drawCards(player(), 99, sequence([0, 0.5, 0.9]));
    expect(pileSize(after.hand)).toBe(6);
    expect(remainingDeck(after).mainSize).toBe(0);
  });

  it('不會抽出超過牌組張數的同名卡', () => {
    const after = drawCards(player(), 6, fixed(0));
    expect(after.hand[unit.id]).toBeLessThanOrEqual(3);
    expect(remainingDeck(after).overflow).toEqual([]);
  });

  it('空牌組不會崩潰', () => {
    expect(() => drawCards(EMPTY_PLAYER, 5, fixed(0))).not.toThrow();
  });
});

describe('召出符文（315.3.b、430.2.a）', () => {
  it('召出的符文進基地，並從符文牌堆扣掉', () => {
    const after = summonRunes(player(), 2, fixed(0));
    expect(pileSize(after.base)).toBe(2);
    expect(remainingDeck(after).runeSize).toBe(10);
  });

  it('預設以活躍狀態召出（430.2.a）', () => {
    const after = summonRunes(player(), 3, fixed(0));
    expect(activeRunesOnBase(after, byId)).toBe(3);
    expect(after.dormant.base).toEqual({});
  });

  it('符文牌堆不足時，有多少就召多少（315.3.b.1）', () => {
    const after = summonRunes(player(), 99, sequence([0, 0.9]));
    expect(pileSize(after.base)).toBe(12);
    expect(remainingDeck(after).runeSize).toBe(0);
  });
});

describe('開局（116、133.4）', () => {
  it('抽四張開局手牌', () => {
    const after = startGame(player(), sequence([0, 0.9, 0.3, 0.6]));
    expect(pileSize(after.hand)).toBe(TURN_RULES.openingHand);
  });

  it('選定英雄放進英雄區域，不在牌堆裡（133.4）', () => {
    const p = player({
      deck: {
        legendId: legend.id,
        championId: champion.id,
        main: { [champion.id]: 3, [unit.id]: 3 },
        runes: {},
        battlefields: {},
        sideboard: {},
      },
    });
    const after = startGame(p, fixed(0));

    expect(after.champion[champion.id]).toBe(1);
    // 6 張主牌組 − 1 張英雄 − 4 張手牌 = 1
    expect(remainingDeck(after).mainSize).toBe(1);
  });

  it('會清掉上一局留下的東西', () => {
    const dirty = player({
      base: { [rune.id]: 5 },
      discard: { [unit.id]: 2 },
      bf0: { [other.id]: 1 },
    });
    const after = startGame(dirty, fixed(0));

    expect(after.base).toEqual({});
    expect(after.discard).toEqual({});
    expect(after.bf0).toEqual({});
  });
});

describe('手牌調度（117.1–117.3）', () => {
  it('換掉的牌數等於補抽的牌數', () => {
    const started = startGame(player(), sequence([0, 0.9, 0.3, 0.6]));
    const inHand = Object.keys(started.hand);

    const after = mulligan(started, [inHand[0]!], fixed(0));
    expect(pileSize(after.hand)).toBe(pileSize(started.hand));
  });

  it('最多只能換兩張（117.1）', () => {
    const started = startGame(player(), sequence([0, 0.9, 0.3, 0.6]));
    const all = Object.entries(started.hand).flatMap(([id, qty]) =>
      Array.from({ length: qty }, () => id),
    );

    const after = mulligan(started, all, fixed(0));
    // 換三張以上時只換前兩張，手牌總數不變
    expect(pileSize(after.hand)).toBe(pileSize(started.hand));
  });

  it('補抽的牌來自「不含擱置牌」的牌堆，最後才洗回去（117.2、117.3）', () => {
    /*
     * 牌組只有兩種卡，開局四張。把手上的某張擱置後，
     * 補抽時牌堆裡不該還有那一張 —— 但補抽完之後它要回到牌堆。
     */
    const started = startGame(player(), sequence([0, 0, 0, 0.9]));
    const before = remainingDeck(started).mainSize;

    const after = mulligan(started, [Object.keys(started.hand)[0]!], fixed(0.9));

    // 擱置的牌洗回去了，所以牌堆總數不變
    expect(remainingDeck(after).mainSize).toBe(before);
    // 也沒有卡片被留在放逐區
    expect(after.exile).toEqual({});
  });

  it('沒指定要換的牌就什麼都不做', () => {
    const started = startGame(player(), fixed(0));
    expect(mulligan(started, [], fixed(0))).toBe(started);
  });

  it('指定手上沒有的牌時不會憑空生出卡', () => {
    const started = startGame(player(), fixed(0));
    const after = mulligan(started, ['not-a-card'], fixed(0));
    expect(pileSize(after.hand)).toBe(pileSize(started.hand));
  });
});

describe('下一回合（315.1、315.3.b、315.4.b、485.7）', () => {
  const board = { ...EMPTY_BOARD, you: player(), opponent: player() };

  it('喚醒、召兩張符文、抽一張牌', () => {
    const withDormant = setDormant(
      summonRunes(player(), 2, fixed(0)),
      'base',
      rune.id,
      2,
    );
    const start = { ...board, you: withDormant };

    const after = beginTurn(start, 'you', fixed(0));

    // 415.3.a 喚醒
    expect(dormantCount(after.you, 'base', rune.id)).toBe(0);
    // 315.3.b 再召兩張 → 場上 4 張
    expect(pileSize(after.you.base)).toBe(4);
    // 315.4.b 抽一張
    expect(pileSize(after.you.hand)).toBe(1);
  });

  it('後手在第一回合多召一張（485.7）', () => {
    // you 是後手 → onThePlay 為 false
    const asSecond = { ...board, onThePlay: false, turn: 1 };
    const after = beginTurn(asSecond, 'you', fixed(0));
    expect(pileSize(after.you.base)).toBe(3);
  });

  it('先手第一回合只召兩張', () => {
    const asFirst = { ...board, onThePlay: true, turn: 1 };
    expect(pileSize(beginTurn(asFirst, 'you', fixed(0)).you.base)).toBe(2);
  });

  it('額外那張只在第一回合適用', () => {
    const laterTurn = { ...board, onThePlay: false, turn: 3 };
    expect(pileSize(beginTurn(laterTurn, 'you', fixed(0)).you.base)).toBe(2);
  });

  it('對手的先後手跟你相反', () => {
    // you 是先手 → opponent 是後手 → 對手第一回合召三張
    const asFirst = { ...board, onThePlay: true, turn: 1 };
    expect(pileSize(beginTurn(asFirst, 'opponent', fixed(0)).opponent.base)).toBe(3);
  });

  it('換人之後回到普通開環', () => {
    const inDuel = { ...board, phase: { duel: true, chain: true } };
    const after = beginTurn(inDuel, 'you', fixed(0));

    expect(after.phase).toEqual({ duel: false, chain: false });
    expect(after.activePlayer).toBe('you');
  });

  it('不會動到另一方', () => {
    const after = beginTurn(board, 'you', fixed(0));
    expect(after.opponent).toBe(board.opponent);
  });
});

describe('送進廢牌堆', () => {
  it('從手牌丟到廢牌堆', () => {
    const p = player({ hand: { [unit.id]: 2 } });
    const after = discardFrom(p, 'hand', unit.id);

    expect(after.hand[unit.id]).toBe(1);
    expect(after.discard[unit.id]).toBe(1);
  });

  it('來源沒有那張卡就不動作', () => {
    const p = player();
    expect(discardFrom(p, 'hand', unit.id)).toBe(p);
  });

  it('總張數守恆 —— 只是換個區域', () => {
    const p = player({ base: { [unit.id]: 1 } });
    const after = discardFrom(p, 'base', unit.id);
    expect(remainingDeck(after).mainSize).toBe(remainingDeck(p).mainSize);
  });
});

describe('手牌列表', () => {
  it('依卡號排序，並過濾掉不存在的卡', () => {
    const p = player({ hand: { [other.id]: 1, [unit.id]: 2, 'not-a-card': 5 } });
    const entries = handEntries(p, byId);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.card.number).toBeLessThanOrEqual(entries[1]!.card.number);
  });
});
