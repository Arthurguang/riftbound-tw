/**
 * 復盤的三個新東西：廢牌堆的進入順序、傳奇的休眠、雙方分數。
 *
 * 廢牌堆順序是最容易出錯的：張數（discard）與順序（discardOrder）是兩份資料，
 * 任何一條路徑只改了其中一份，畫面上的張數就會跟實際對不上。
 * 所以這裡除了正常流程，也測「兩份不一致」時會不會被調和回來。
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_BOARD,
  EMPTY_PLAYER,
  MAX_DISCARD_ORDER,
  moveCard,
  moveFromDiscard,
  orderedDiscard,
  remainingDeck,
  setDormant,
  setScore,
  VICTORY_SCORE,
  wakeAll,
  type BoardState,
  type PlayerBoard,
} from '../../src/lib/board-state';
import { discardFrom, startGame } from '../../src/lib/board-actions';
import { decodeBoard, encodeBoard } from '../../src/lib/board-url';
import { buildCodeIndex } from '../../src/lib/deck-url';
import { ALL_CARDS } from '../../src/lib/cards';

const index = buildCodeIndex(ALL_CARDS);
const units = ALL_CARDS.filter((c) => c.types.includes('unit') && c.subtype !== 'token');
const a = units[0]!;
const b = units[1]!;
const c = units[2]!;
const legend = ALL_CARDS.find((card) => card.types.includes('legend'))!;

function player(overrides: Partial<PlayerBoard> = {}): PlayerBoard {
  return {
    ...EMPTY_PLAYER,
    deck: {
      legendId: legend.id,
      championId: null,
      main: { [a.id]: 3, [b.id]: 3, [c.id]: 3 },
      runes: {},
      battlefields: {},
      sideboard: {},
    },
    ...overrides,
  };
}

/** 盤面編碼裡「你這一方」的第 n 個欄位換成別的值 —— 用來模擬被竄改的網址。 */
function tamperYou(code: string, field: number, value: string): string {
  const parts = code.split('!');
  const fields = parts[3]!.split('~');
  fields[field] = value;
  parts[3] = fields.join('~');
  return parts.join('!');
}

/** 一方的欄位位置（見 board-url.ts 的 encodePlayer）。 */
const FIELD = { order: 15, legendDormant: 16, score: 17 } as const;

describe('廢牌堆的進入順序', () => {
  it('不管從哪一區進來，都放在最上面', () => {
    // 使用者的例子：手牌的 a 先進廢牌堆，接著場上的 b 進去 → b 在 a 上面
    let p = player({ hand: { [a.id]: 1 }, bf0: { [b.id]: 1 }, base: { [c.id]: 1 } });
    p = moveCard(p, 'hand', 'discard', a.id);
    p = moveCard(p, 'bf0', 'discard', b.id);
    p = discardFrom(p, 'base', c.id);
    // 最早的在前、最上面的在最後
    expect(orderedDiscard(p)).toEqual([a.id, b.id, c.id]);
  });

  it('同名卡各自佔一個位置', () => {
    let p = player({ hand: { [a.id]: 2, [b.id]: 1 } });
    p = moveCard(p, 'hand', 'discard', a.id);
    p = moveCard(p, 'hand', 'discard', b.id);
    p = moveCard(p, 'hand', 'discard', a.id);
    expect(orderedDiscard(p)).toEqual([a.id, b.id, a.id]);
    expect(p.discard[a.id]).toBe(2);
  });

  it('用一般搬移拿走同名卡時，拿的是最上面那張', () => {
    let p = player({ discard: { [a.id]: 2, [b.id]: 1 }, discardOrder: [a.id, b.id, a.id] });
    p = moveCard(p, 'discard', 'hand', a.id);
    expect(orderedDiscard(p)).toEqual([a.id, b.id]);
    expect(p.hand[a.id]).toBe(1);
  });

  it('從視窗點選的那一張搬走，剩下的順序不變', () => {
    const p = player({ discard: { [a.id]: 2, [b.id]: 1 }, discardOrder: [a.id, b.id, a.id] });
    // 拿走中間那張 b
    const next = moveFromDiscard(p, 1, 'hand');
    expect(orderedDiscard(next)).toEqual([a.id, a.id]);
    expect(next.hand[b.id]).toBe(1);
    expect(next.discard[b.id]).toBeUndefined();
  });

  it('搬到場上、放逐、放回牌堆都可以', () => {
    const p = player({ discard: { [a.id]: 1, [b.id]: 1 }, discardOrder: [a.id, b.id] });
    expect(moveFromDiscard(p, 0, 'bf1').bf1[a.id]).toBe(1);
    expect(moveFromDiscard(p, 1, 'exile').exile[b.id]).toBe(1);

    // 放回牌堆 = 從盤面拿掉，剩餘牌堆多一張
    const before = remainingDeck(p).main[a.id] ?? 0;
    const back = moveFromDiscard(p, 0, 'deck');
    expect(remainingDeck(back).main[a.id]).toBe(before + 1);
    expect(orderedDiscard(back)).toEqual([b.id]);
  });

  it('索引超出範圍、或目標就是廢牌堆時什麼都不做', () => {
    const p = player({ discard: { [a.id]: 1 }, discardOrder: [a.id] });
    expect(moveFromDiscard(p, 5, 'hand')).toBe(p);
    expect(moveFromDiscard(p, -1, 'hand')).toBe(p);
    expect(moveFromDiscard(p, 0, 'discard')).toBe(p);
  });

  // ── 兩份資料不一致時的調和 ──

  it('順序裡少了的卡補在最上面（例如從加卡面板直接加進廢牌堆）', () => {
    const p = player({ discard: { [a.id]: 1, [b.id]: 1 }, discardOrder: [a.id] });
    expect(orderedDiscard(p)).toEqual([a.id, b.id]);
  });

  it('順序裡多出來的卡從上面拿掉（例如從面板直接減一張）', () => {
    const p = player({ discard: { [a.id]: 1 }, discardOrder: [a.id, b.id, a.id] });
    expect(orderedDiscard(p)).toEqual([a.id]);
  });

  it('順序清單有長度上限，不會被塞爆', () => {
    const p = player({
      discard: { [a.id]: 3 },
      discardOrder: Array.from({ length: MAX_DISCARD_ORDER * 10 }, () => a.id),
    });
    expect(orderedDiscard(p)).toHaveLength(3);
  });

  it('重新開局會清空順序', () => {
    const p = player({ discard: { [a.id]: 1 }, discardOrder: [a.id] });
    expect(startGame(p, 0, () => 0).discardOrder).toEqual([]);
  });
});

describe('傳奇的休眠（107.4.c、415.3.a）', () => {
  it('預設是活躍', () => {
    expect(EMPTY_PLAYER.legendDormant).toBe(false);
  });

  it('喚醒階段連傳奇一起喚醒', () => {
    const p = setDormant(player({ base: { [a.id]: 1 }, legendDormant: true }), 'base', a.id, 1);
    const woke = wakeAll(p);
    expect(woke.legendDormant).toBe(false);
    expect(woke.dormant.base).toEqual({});
  });

  it('重新開局回到活躍', () => {
    expect(startGame(player({ legendDormant: true }), 0, () => 0).legendDormant).toBe(false);
  });
});

describe('分數', () => {
  it('勝利分數預設 8 分', () => {
    expect(VICTORY_SCORE).toBe(8);
  });

  it('可以加減，不會低於 0（官方規則：分數無法低於 0）', () => {
    const p = player();
    expect(setScore(p, 3).score).toBe(3);
    expect(setScore(p, -1).score).toBe(0);
    expect(setScore(p, 1000).score).toBe(99);
  });

  it('沒有變化時回傳同一個物件（不觸發多餘的重繪）', () => {
    const p = player();
    expect(setScore(p, 0)).toBe(p);
  });

  it('重新開局分數歸零', () => {
    expect(startGame(player({ score: 5 }), 0, () => 0).score).toBe(0);
  });
});

describe('網址編碼（b6）', () => {
  const board: BoardState = {
    ...EMPTY_BOARD,
    you: player({
      discard: { [a.id]: 2, [b.id]: 1 },
      discardOrder: [a.id, b.id, a.id],
      legendDormant: true,
      score: 5,
    }),
    opponent: player({ score: 7 }),
  };
  const code = encodeBoard(board, ALL_CARDS);

  it('順序、傳奇休眠、分數都能來回保留', () => {
    const decoded = decodeBoard(code, index);
    expect(decoded.dropped).toBe(0);
    expect(orderedDiscard(decoded.board.you)).toEqual([a.id, b.id, a.id]);
    expect(decoded.board.you.legendDormant).toBe(true);
    expect(decoded.board.you.score).toBe(5);
    expect(decoded.board.opponent.score).toBe(7);
    expect(decoded.board.opponent.legendDormant).toBe(false);
  });

  it('b5 的舊連結仍然能開：沒有順序、傳奇活躍、分數 0', () => {
    const parts = code.replace(/^b6/, 'b5').split('!');
    for (const i of [3, 4]) parts[i] = parts[i]!.split('~').slice(0, FIELD.order).join('~');
    const decoded = decodeBoard(parts.join('!'), index);

    expect(decoded.board.you.discard).toEqual({ [a.id]: 2, [b.id]: 1 });
    expect(decoded.board.you.legendDormant).toBe(false);
    expect(decoded.board.you.score).toBe(0);
    // 沒有順序時照樣列得出來，張數正確
    expect(orderedDiscard(decoded.board.you)).toHaveLength(3);
  });

  // ── 網址是不可信輸入 ──

  it('離譜的分數一律當成 0', () => {
    for (const bad of ['-3', '1000', '2.5', 'abc', '1e3', '0x5']) {
      expect(decodeBoard(tamperYou(code, FIELD.score, bad), index).board.you.score).toBe(0);
    }
  });

  it('順序裡認不得或注入型的代碼會被丟棄並回報', () => {
    const attacked = tamperYou(code, FIELD.order, '<script>.__proto__.nope999');
    const decoded = decodeBoard(attacked, index);
    expect(decoded.dropped).toBe(3);
    // 張數仍以 discard 為準，順序被調和回來
    expect(orderedDiscard(decoded.board.you)).toHaveLength(3);
    expect(Object.prototype).not.toHaveProperty('nope999');
  });

  it('傳奇休眠只認 "1"', () => {
    for (const bad of ['true', 'yes', '2', '<b>']) {
      const decoded = decodeBoard(tamperYou(code, FIELD.legendDormant, bad), index);
      expect(decoded.board.you.legendDormant).toBe(false);
    }
  });
});
