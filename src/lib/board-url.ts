/**
 * 盤面 ⇄ 網址編碼。
 *
 * 跟牌組一樣，盤面完整編在網址裡，分享復盤不需要伺服器或資料庫 ——
 * 維持本站「零使用者資料」的架構。
 *
 * 資安：網址是使用者可以任意編造的輸入。解碼時每一個代碼都要比對
 * 真實存在的卡片，認不得的一律丟棄並回報，與 deck-url.ts 相同的原則。
 */

import { decodeDeck, encodeDeck, shortCode } from './deck-url';
import { EMPTY_BOARD, EMPTY_PLAYER, type BoardState, type Pile, type PlayerBoard } from './board-state';
import type { Card } from './types';

/**
 * 編碼格式版本。
 *
 * b1：`b1!回合!先手!你!對手`
 * b2：加上戰場區域，且一方多了兩處戰場上的單位
 * b3：一方再多一段英雄區域（108.3）
 * b4：加上回合玩家與回合狀態（307–310）
 * b5：一方再多三段休眠狀態（414、415）
 *
 * 舊連結仍然要能開 —— 分享出去的復盤連結不能突然失效。
 */
const FORMAT_VERSION = 'b5';
const SUPPORTED_VERSIONS = new Set(['b1', 'b2', 'b3', 'b4', 'b5']);

/*
 * 分隔符的層級，由外而內互不重複：
 *
 *   !　盤面的欄位（版本、回合、先後手、雙方）
 *   ~　一方的欄位（牌組、手牌、未知手牌數、基地、廢牌堆、放逐）
 *   |　牌組本身的欄位（deck-url.ts 已經在用）
 *   .　一疊裡的各張卡
 *
 * 第一版把盤面也用 `|` 分隔，結果牌組編碼裡的 `|` 讓整份切錯位 ——
 * 巢狀編碼一定要確認內層沒有用到外層的分隔符。
 */
const BOARD_SEP = '!';
const PLAYER_SEP = '~';

/** 單張卡的張數上限，與牌組編碼一致。 */
const MAX_QTY = 99;

/** 一疊最多幾種卡。防呆用，遠高於實際需求。 */
const MAX_ENTRIES = 200;

/** 回合數上限。防止有人在網址裡塞天文數字。 */
const MAX_TURN = 99;

/** 未知手牌張數上限。 */
const MAX_UNKNOWN_HAND = 99;

const encodePile = (pile: Pile, byId: Map<string, Card>): string =>
  Object.entries(pile)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const card = byId.get(id);
      if (!card) return null;
      return qty === 1 ? shortCode(card) : `${shortCode(card)}x${qty}`;
    })
    .filter(Boolean)
    .join('.');

function decodePile(
  encoded: string,
  index: Map<string, Card>,
): { pile: Pile; dropped: number } {
  const pile: Pile = {};
  let dropped = 0;
  if (encoded === '') return { pile, dropped };

  for (const part of encoded.split('.').slice(0, MAX_ENTRIES)) {
    const m = /^([a-z0-9*]+?)(?:x(\d{1,2}))?$/.exec(part);
    if (!m) {
      dropped += 1;
      continue;
    }
    const card = index.get(m[1] ?? '');
    if (!card) {
      dropped += 1;
      continue;
    }
    const qty = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      dropped += 1;
      continue;
    }
    pile[card.id] = Math.min(MAX_QTY, (pile[card.id] ?? 0) + qty);
  }
  return { pile, dropped };
}

/**
 * 一方的編碼：`牌組編碼~手牌~未知手牌數~基地~廢牌堆~放逐`
 *
 * 用 `~` 分隔是因為牌組編碼裡已經用掉了 `|`。
 */
function encodePlayer(player: PlayerBoard, cards: Card[], byId: Map<string, Card>): string {
  return [
    encodeDeck(player.deck, cards),
    encodePile(player.hand, byId),
    String(Math.max(0, Math.min(MAX_UNKNOWN_HAND, player.unknownHand))),
    encodePile(player.base, byId),
    encodePile(player.discard, byId),
    encodePile(player.exile, byId),
    encodePile(player.bf0, byId),
    encodePile(player.bf1, byId),
    encodePile(player.champion, byId),
    encodePile(player.dormant.base, byId),
    encodePile(player.dormant.bf0, byId),
    encodePile(player.dormant.bf1, byId),
    // 戰力加成。跟休眠一樣是每個位置一疊，沿用同一套編碼
    encodePile(player.buffs.base, byId),
    encodePile(player.buffs.bf0, byId),
    encodePile(player.buffs.bf1, byId),
  ].join(PLAYER_SEP);
}

function decodePlayer(
  encoded: string,
  index: Map<string, Card>,
): { player: PlayerBoard; dropped: number } {
  // b1 沒有最後兩段（戰場上的單位），解構時預設空字串即可
  const [
    deckRaw = '',
    handRaw = '',
    unknownRaw = '0',
    baseRaw = '',
    discardRaw = '',
    exileRaw = '',
    bf0Raw = '',
    bf1Raw = '',
    championRaw = '',
    dormantBaseRaw = '',
    dormantBf0Raw = '',
    dormantBf1Raw = '',
    buffBaseRaw = '',
    buffBf0Raw = '',
    buffBf1Raw = '',
  ] = encoded.split(PLAYER_SEP);

  const deck = decodeDeck(deckRaw, index);
  const hand = decodePile(handRaw, index);
  const base = decodePile(baseRaw, index);
  const discard = decodePile(discardRaw, index);
  const exile = decodePile(exileRaw, index);
  const bf0 = decodePile(bf0Raw, index);
  const bf1 = decodePile(bf1Raw, index);
  const champion = decodePile(championRaw, index);
  const buffBase = decodePile(buffBaseRaw, index);
  const buffBf0 = decodePile(buffBf0Raw, index);
  const buffBf1 = decodePile(buffBf1Raw, index);
  const dormantBase = decodePile(dormantBaseRaw, index);
  const dormantBf0 = decodePile(dormantBf0Raw, index);
  const dormantBf1 = decodePile(dormantBf1Raw, index);

  const parsedUnknown = Number(unknownRaw);
  const unknownHand =
    Number.isInteger(parsedUnknown) && parsedUnknown >= 0 && parsedUnknown <= MAX_UNKNOWN_HAND
      ? parsedUnknown
      : 0;

  return {
    player: {
      deck: deck.deck,
      hand: hand.pile,
      unknownHand,
      champion: champion.pile,
      dormant: {
        base: dormantBase.pile,
        bf0: dormantBf0.pile,
        bf1: dormantBf1.pile,
      },
      buffs: {
        base: buffBase.pile,
        bf0: buffBf0.pile,
        bf1: buffBf1.pile,
      },
      base: base.pile,
      bf0: bf0.pile,
      bf1: bf1.pile,
      discard: discard.pile,
      exile: exile.pile,
    },
    dropped:
      deck.dropped +
      hand.dropped +
      base.dropped +
      discard.dropped +
      exile.dropped +
      bf0.dropped +
      bf1.dropped +
      champion.dropped +
      buffBase.dropped +
      buffBf0.dropped +
      buffBf1.dropped +
      dormantBase.dropped +
      dormantBf0.dropped +
      dormantBf1.dropped,
  };
}

/**
 * 把盤面編成查詢字串的值。
 *
 * 格式：`b1!回合!先手!你這方!對手`
 */
export function encodeBoard(board: BoardState, cards: Card[]): string {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const bfCode = (id: string | null) => {
    const card = id ? byId.get(id) : undefined;
    return card ? shortCode(card) : '';
  };

  return [
    FORMAT_VERSION,
    String(Math.max(1, Math.min(MAX_TURN, Math.round(board.turn)))),
    board.onThePlay ? '1' : '0',
    encodePlayer(board.you, cards, byId),
    encodePlayer(board.opponent, cards, byId),
    `${bfCode(board.battlefields[0])}.${bfCode(board.battlefields[1])}`,
    // 回合玩家 + 對決 + 結算鏈，各一個字元
    `${board.activePlayer === 'you' ? 'y' : 'o'}${board.phase.duel ? '1' : '0'}${
      board.phase.chain ? '1' : '0'
    }`,
  ].join(BOARD_SEP);
}

export type BoardDecodeResult = {
  board: BoardState;
  /** 有多少段因為無法辨識而被丟棄 —— 介面上要讓使用者知道。 */
  dropped: number;
};

/** 從查詢字串還原盤面。認不得的部分安靜丟棄並計數，不讓整份解析失敗。 */
export function decodeBoard(encoded: string, index: Map<string, Card>): BoardDecodeResult {
  if (typeof encoded !== 'string' || encoded === '') {
    return { board: EMPTY_BOARD, dropped: 0 };
  }

  const parts = encoded.split(BOARD_SEP);
  if (!SUPPORTED_VERSIONS.has(parts[0] ?? '')) {
    return { board: EMPTY_BOARD, dropped: 1 };
  }

  const [, turnRaw = '1', playRaw = '1', youRaw = '', oppRaw = '', bfRaw = '', stateRaw = ''] =
    parts;

  const parsedTurn = Number(turnRaw);
  const turn =
    Number.isInteger(parsedTurn) && parsedTurn >= 1 && parsedTurn <= MAX_TURN ? parsedTurn : 1;

  const you = youRaw === '' ? { player: EMPTY_PLAYER, dropped: 0 } : decodePlayer(youRaw, index);
  const opponent =
    oppRaw === '' ? { player: EMPTY_PLAYER, dropped: 0 } : decodePlayer(oppRaw, index);

  // 戰場：認不得的代碼視為沒選，不猜
  const [bf0Code = '', bf1Code = ''] = bfRaw.split('.');
  const battlefields: [string | null, string | null] = [
    (bf0Code === '' ? null : (index.get(bf0Code)?.id ?? null)),
    (bf1Code === '' ? null : (index.get(bf1Code)?.id ?? null)),
  ];

  // 回合狀態：b3 以前沒有這段，預設回合玩家是你、普通開環
  const activePlayer = stateRaw[0] === 'o' ? 'opponent' : 'you';
  const phase = { duel: stateRaw[1] === '1', chain: stateRaw[2] === '1' };

  return {
    board: {
      battlefields,
      turn,
      activePlayer,
      phase,
      onThePlay: playRaw !== '0',
      you: you.player,
      opponent: opponent.player,
    },
    dropped: you.dropped + opponent.dropped,
  };
}

/** 空盤面編出來長什麼樣。用來判斷網址要不要帶參數。 */
export const emptyBoardCode = (cards: Card[]): string => encodeBoard(EMPTY_BOARD, cards);
