/**
 * 對局盤面模型 —— 復盤用。
 *
 * ── 這是什麼，不是什麼 ──────────────────────────────────────────
 * 這是一個**盤面編輯器**：擺出手牌、廢牌堆、場上狀況，然後從當下盤面
 * 算出精確的數字（剩下什麼牌、下一張抽到 X 的機率、現在付得起哪些卡）。
 *
 * 它**不會**告訴你最佳解，也**不會**判斷某個動作合不合法 ——
 * 那需要一個看得懂 376 張卡各自能力、還能執行戰鬥與據守的規則引擎，
 * 也就是路線圖第九階段。沒有引擎卻跳出「建議」，那個建議是編的。
 *
 * ── 區域依官方規則 ──────────────────────────────────────────────
 * 場地（107）　　基地 107.1、戰場區域 107.2、待命區域 107.3、傳奇區域 107.4
 * 非場地（108）　廢牌堆 108.2、英雄區域 108.3、主牌堆 108.4、
 * 　　　　　　　 符文牌堆 108.5、放逐區域 108.6、手牌 108.7
 *
 * ── 資訊可見性也照規則走 ────────────────────────────────────────
 * 108.7.c　玩家的手牌為**私密資訊**
 * 108.7.e　但玩家的**手牌數量為公開資訊**
 *
 * 所以對手那側預設只記「張數」。你知道有哪幾張才填內容 ——
 * 這樣算出來的機率是「以你實際知道的資訊」為基礎，而不是作弊視角。
 */

import { totalCards, type Deck } from './deck-rules';
import type { Card } from './types';

/** 一疊卡：卡片 id → 張數。 */
export type Pile = Record<string, number>;

/**
 * 盤面上可以擺卡的區域。
 *
 * 待命區域（107.3）暫時併入基地：它每處戰場只能放一張、而且正面朝下的
 * 內容是私密資訊（107.3.f），單獨做一區的效益不高。日後有需要再拆。
 */
export const BOARD_ZONES = ['hand', 'base', 'bf0', 'bf1', 'discard', 'exile'] as const;
export type BoardZone = (typeof BOARD_ZONES)[number];

export const ZONE_RULES: Record<BoardZone, { rule: string; hidden: boolean }> = {
  hand: { rule: '108.7', hidden: true },
  base: { rule: '107.1', hidden: false },
  bf0: { rule: '107.2', hidden: false },
  bf1: { rule: '107.2', hidden: false },
  discard: { rule: '108.2', hidden: false },
  exile: { rule: '108.6', hidden: false },
};

/**
 * 常駐牌所在的位置。
 *
 * 198.1　位置包括**戰場和基地**
 * 198.2　常駐牌的位置是該常駐牌的屬性
 *
 * 1v1 場上有兩處戰場（485.4），各由一名玩家提供（485.5）——
 * bf0 是你帶來的那處，bf1 是對手帶來的那處。雙方的單位都可能在任一處。
 */
export const LOCATIONS = ['base', 'bf0', 'bf1'] as const;
export type LocationId = (typeof LOCATIONS)[number];

export const LOCATION_RULES: Record<LocationId, string> = {
  base: '107.1',
  bf0: '107.2',
  bf1: '107.2',
};

export type PlayerBoard = {
  /** 這一方的牌組。決定牌堆裡原本有些什麼。 */
  deck: Deck;
  /** 手牌裡**你知道**的卡（108.7.c 手牌是私密資訊）。 */
  hand: Pile;
  /**
   * 手牌裡你不知道內容、但知道存在的張數。
   *
   * 依 108.7.e，手牌數量是公開資訊 —— 所以對手有幾張你一定知道，
   * 只是不知道是什麼。這些牌仍然來自對手的牌堆，計算剩餘牌堆時要扣掉。
   */
  unknownHand: number;
  /**
   * 基地：你控制的常駐牌與符文（107.1.c）。
   *
   * 符文**只會**在基地（107.1.c 明文如此），不會移到戰場上。
   */
  base: Pile;
  /** 你在第一處戰場（你帶來的那處）上的單位。 */
  bf0: Pile;
  /** 你在第二處戰場（對手帶來的那處）上的單位。 */
  bf1: Pile;
  /** 廢牌堆（108.2）。 */
  discard: Pile;
  /** 放逐區域（108.6）。 */
  exile: Pile;
};

export type BoardState = {
  /**
   * 戰場區域（107.2）。
   *
   * 1v1 場上有兩處戰場（485.4「戰場數量：2」），各由一名玩家從自己
   * 構築時放進牌組的 3 張裡選出一張帶進來（485.4.a、485.5）。
   * 索引 0 是你帶來的，索引 1 是對手帶來的。
   */
  battlefields: [string | null, string | null];
  /** 目前第幾回合。用來推算應該召出過幾張符文。 */
  turn: number;
  /** 你是不是先手（485.7 影響符文數）。 */
  onThePlay: boolean;
  you: PlayerBoard;
  opponent: PlayerBoard;
};

export const EMPTY_PLAYER: PlayerBoard = {
  deck: {
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: {},
    sideboard: {},
  },
  hand: {},
  unknownHand: 0,
  base: {},
  bf0: {},
  bf1: {},
  discard: {},
  exile: {},
};

export const EMPTY_BOARD: BoardState = {
  battlefields: [null, null],
  turn: 1,
  onThePlay: true,
  you: EMPTY_PLAYER,
  opponent: EMPTY_PLAYER,
};

// ─── 疊的基本操作 ────────────────────────────────────────────────

/** 一疊裡總共幾張。 */
export const pileSize = (pile: Pile): number =>
  Object.values(pile).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);

/** 加減一疊裡某張卡的張數。降到 0 就移除該項，避免資料無限膨脹。 */
export function setInPile(pile: Pile, cardId: string, qty: number): Pile {
  const next = { ...pile };
  if (qty <= 0) delete next[cardId];
  else next[cardId] = Math.min(qty, 99);
  return next;
}

/** 把一張卡從一個區域搬到另一個區域。來源不足時不動作。 */
export function moveCard(
  player: PlayerBoard,
  from: BoardZone,
  to: BoardZone,
  cardId: string,
): PlayerBoard {
  if (from === to) return player;
  const available = player[from][cardId] ?? 0;
  if (available <= 0) return player;

  return {
    ...player,
    [from]: setInPile(player[from], cardId, available - 1),
    [to]: setInPile(player[to], cardId, (player[to][cardId] ?? 0) + 1),
  };
}

// ─── 剩餘牌堆 ────────────────────────────────────────────────────

export type RemainingDeck = {
  /** 主牌堆裡還剩什麼（卡片 id → 張數） */
  main: Pile;
  /** 主牌堆剩幾張 */
  mainSize: number;
  /** 符文牌堆還剩什麼 */
  runes: Pile;
  runeSize: number;
  /**
   * 盤面上出現的張數超過牌組裡的張數。
   *
   * 這代表擺錯了（例如廢牌堆放了 4 張某卡，但牌組只有 3 張）。
   * 不會自己修正 —— 安靜修正只會讓使用者以為擺對了。
   */
  overflow: { cardId: string; inDeck: number; onBoard: number }[];
};

/**
 * 算出主牌堆與符文牌堆還剩什麼。
 *
 * 主牌堆 = 牌組主牌組 − 選定英雄 − 手牌 − 基地 − 廢牌堆 − 放逐
 *
 * 為什麼要扣選定英雄：133.4 說遊戲開始時主牌堆的卡會出現在主牌堆
 * 或（如果是選定英雄）英雄區域 —— 它一開始就不在牌堆裡。
 *
 * 不知道內容的手牌（unknownHand）也要從**張數**上扣掉，
 * 但因為不知道是哪幾張，只能減少總張數，不能指定減哪一張。
 * 這正是「機率」存在的原因，所以另外回報。
 */
export function remainingDeck(player: PlayerBoard): RemainingDeck {
  const overflow: RemainingDeck['overflow'] = [];

  /** 盤面上（不含牌堆）某張卡出現幾次。 */
  const onBoard = (cardId: string): number =>
    BOARD_ZONES.reduce((sum, zone) => sum + (player[zone][cardId] ?? 0), 0);

  const subtract = (source: Pile, isMain: boolean): Pile => {
    const result: Pile = {};
    for (const [cardId, inDeck] of Object.entries(source)) {
      if (inDeck <= 0) continue;

      let used = onBoard(cardId);
      // 選定英雄開局就在英雄區域，不在牌堆裡（133.4）
      if (isMain && player.deck.championId === cardId) used += 1;

      const left = inDeck - used;
      if (left < 0) {
        overflow.push({ cardId, inDeck, onBoard: used });
      } else if (left > 0) {
        result[cardId] = left;
      }
    }
    return result;
  };

  const main = subtract(player.deck.main, true);
  const runes = subtract(player.deck.runes, false);

  // 不知道內容的手牌只能從總張數扣
  const mainSize = Math.max(0, pileSize(main) - player.unknownHand);

  return { main, mainSize, runes, runeSize: pileSize(runes), overflow };
}

/**
 * 盤面上有沒有出現「不屬於這副牌組」的卡。
 *
 * 遊戲中確實可能出現牌組以外的卡（指示物、被效果加入的卡），
 * 所以這不是錯誤，只是提醒使用者確認 —— 因為它會讓剩餘牌堆的計算失準。
 */
export function foreignCards(player: PlayerBoard): string[] {
  const inDeck = new Set([
    ...Object.keys(player.deck.main),
    ...Object.keys(player.deck.runes),
    ...Object.keys(player.deck.battlefields),
    ...Object.keys(player.deck.sideboard),
  ]);
  if (player.deck.legendId) inDeck.add(player.deck.legendId);

  const seen = new Set<string>();
  for (const zone of BOARD_ZONES) {
    for (const [cardId, qty] of Object.entries(player[zone])) {
      if (qty > 0 && !inDeck.has(cardId)) seen.add(cardId);
    }
  }
  return [...seen];
}

/** 基地上有幾張符文 —— 這是目前實際可用的資源上限。 */
export function runesOnBase(player: PlayerBoard, byId: Map<string, Card>): number {
  let count = 0;
  for (const [cardId, qty] of Object.entries(player.base)) {
    if (qty <= 0) continue;
    if (byId.get(cardId)?.types.includes('rune')) count += qty;
  }
  return count;
}

/** 手牌總張數（已知 + 未知）。108.7.e：張數是公開資訊。 */
export const handSize = (player: PlayerBoard): number =>
  pileSize(player.hand) + Math.max(0, player.unknownHand);

/** 牌組是否已經設定（有沒有東西可以算）。 */
export const hasDeck = (player: PlayerBoard): boolean => totalCards(player.deck.main) > 0;
