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
export const BOARD_ZONES = [
  'champion',
  'hand',
  'base',
  'bf0',
  'bf1',
  'discard',
  'exile',
] as const;
export type BoardZone = (typeof BOARD_ZONES)[number];

export const ZONE_RULES: Record<BoardZone, { rule: string; hidden: boolean }> = {
  champion: { rule: '108.3', hidden: false },
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
/**
 * 區域在介面上的名稱。
 *
 * 收在這裡是因為盤面、檢視面板、搬移按鈕都要用到同一組字 ——
 * 分散在各元件裡就會出現「同一個區域在兩個地方叫不同名字」。
 */
export const ZONE_LABELS: Record<BoardZone, string> = {
  champion: '英雄區域',
  hand: '手牌',
  base: '基地',
  bf0: '戰場一',
  bf1: '戰場二',
  discard: '廢牌堆',
  exile: '放逐區',
};

/**
 * 每個區域的卡可以搬去哪裡。順序照實際使用頻率排。
 *
 * 198.1：位置包括基地與各個戰場，所以單位可以在這三處之間移動。
 * 108.3.d：選定英雄可以從英雄區域照正常規則打出。
 */
export const MOVE_TARGETS: Record<BoardZone, BoardZone[]> = {
  champion: ['base', 'bf0', 'bf1', 'discard'],
  // 有些效果會直接把手牌放逐，所以手牌也要能直接送到放逐區
  hand: ['base', 'bf0', 'bf1', 'discard', 'exile'],
  base: ['bf0', 'bf1', 'discard', 'hand'],
  bf0: ['base', 'bf1', 'discard'],
  bf1: ['base', 'bf0', 'discard'],
  discard: ['hand', 'base', 'exile'],
  exile: ['hand', 'base', 'discard'],
};

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
  /**
   * 英雄區域（108.3）。
   *
   * 遊戲開始時選定英雄放在這裡（103.2.a.1、133.4），所以它**不在牌堆裡**。
   * 它可以從這裡照正常規則打出（108.3.d），打出後就移到基地或戰場。
   *
   * 傳奇不需要對應的疊：它在傳奇區域，而且**不能從該區移除、移動或移位**
   * （107.4.d），所以只要顯示 deck.legendId 就好。
   */
  champion: Pile;
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
  /**
   * 場上各位置有幾張處於**休眠**狀態（414）。
   *
   * 只有場上的位置需要這個 —— 手牌、廢牌堆、放逐區沒有活躍／休眠之分。
   * 數量不會超過該位置實際有幾張。
   *
   * 進場的預設狀態依卡種而不同：
   *   143.4、359.2.c　單位以**休眠**狀態進場（可被 [急速] 改變，143.4.a）
   *   359.2.d　　　　 非單位裝備以**活躍**狀態進場
   *   430.2.a　　　　 符文預設以**活躍**狀態召出
   */
  dormant: { base: Pile; bf0: Pile; bf1: Pile };
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
  /** 現在是誰的回合。影響誰能打出卡（310.1.a）。 */
  activePlayer: 'you' | 'opponent';
  /** 回合狀態的兩個維度（308、309）。 */
  phase: TurnPhase;
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
  champion: {},
  hand: {},
  unknownHand: 0,
  base: {},
  bf0: {},
  bf1: {},
  dormant: { base: {}, bf0: {}, bf1: {} },
  discard: {},
  exile: {},
};

export const EMPTY_BOARD: BoardState = {
  battlefields: [null, null],
  turn: 1,
  activePlayer: 'you',
  phase: { duel: false, chain: false },
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
 * 主牌堆 = 牌組主牌組 − 盤面上所有區域的同名卡
 *
 * 「盤面上所有區域」包含英雄區域：133.4 說遊戲開始時主牌堆的卡會出現在
 * 主牌堆或（如果是選定英雄）英雄區域 —— 選定英雄一開始就不在牌堆裡。
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

  /*
   * 選定英雄不再特別扣一張 —— 它現在是英雄區域那一疊的內容，
   * onBoard 已經把所有區域算進去了。兩邊都扣會重複計算。
   */
  const subtract = (source: Pile): Pile => {
    const result: Pile = {};
    for (const [cardId, inDeck] of Object.entries(source)) {
      if (inDeck <= 0) continue;

      const used = onBoard(cardId);
      const left = inDeck - used;
      if (left < 0) {
        overflow.push({ cardId, inDeck, onBoard: used });
      } else if (left > 0) {
        result[cardId] = left;
      }
    }
    return result;
  };

  const main = subtract(player.deck.main);
  const runes = subtract(player.deck.runes);

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
export function foreignCards(player: PlayerBoard, byId?: Map<string, Card>): string[] {
  /*
   * 備牌**不算**在內：對局進行中備牌不在場上，
   * 它只在局間 1 換 1 地換進主牌組（賽事規則 403.4、403.5）。
   * 所以盤面上出現備牌的卡，就是真的該提醒使用者確認。
   */
  const inDeck = new Set([
    ...Object.keys(player.deck.main),
    ...Object.keys(player.deck.runes),
    ...Object.keys(player.deck.battlefields),
  ]);
  if (player.deck.legendId) inDeck.add(player.deck.legendId);

  const seen = new Set<string>();
  for (const zone of BOARD_ZONES) {
    for (const [cardId, qty] of Object.entries(player[zone])) {
      if (qty <= 0 || inDeck.has(cardId)) continue;
      /*
       * 衍生物不算「不在牌組裡」。
       *
       * 它本來就不會被放進任何牌組 —— 是靠卡牌效果生成的（例如
       * OGN-117 維克特：在對手回合打出卡時，額外打出一名「隨從」）。
       * 場上出現衍生物完全正常，跳警告只會變成雜訊。
       */
      if (byId?.get(cardId)?.subtype === 'token') continue;
      seen.add(cardId);
    }
  }
  return [...seen];
}

/** 基地上有幾張符文 —— 這是目前實際可用的資源上限。 */
/**
 * 把基地那一疊拆成「符文」與「其他常駐物」。
 *
 * 資料上它們同住基地（107.1.c「受玩家控制的常駐牌和符文位於該玩家的基地」），
 * 但操作方式完全不同：符文是資源，每一張各自有活躍／休眠（414、415），
 * 使用者要能一張一張指定。所以**顯示時**拆成兩塊，資料本身不動。
 */
export function splitBaseByRunes(
  player: PlayerBoard,
  byId: Map<string, Card>,
): { runes: Pile; others: Pile } {
  const runes: Pile = {};
  const others: Pile = {};
  for (const [cardId, qty] of Object.entries(player.base)) {
    if (qty <= 0) continue;
    const card = byId.get(cardId);
    // 認不出來的卡當成一般常駐物 —— 不要因為資料缺漏就讓它從畫面消失
    if (card?.types.includes('rune')) runes[cardId] = qty;
    else others[cardId] = qty;
  }
  return { runes, others };
}

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

// ─── 備牌調整（賽事規則 403.4）────────────────────────────────────

/**
 * 把一張卡在主牌組與備牌之間對調。
 *
 * 賽事規則 403.4 說備牌卡必須與主牌組的卡**1 換 1** 對調，
 * 403.4.c 說換完後主牌組仍要符合張數要求。
 *
 * 這裡只做搬移，不強制 1 換 1 —— 介面上顯示前後張數讓使用者自己確認，
 * 因為換到一半的中間狀態本來就會不平衡。
 */
export function swapWithSideboard(
  deck: Deck,
  cardId: string,
  direction: 'toSideboard' | 'toMain',
): Deck {
  const fromKey = direction === 'toSideboard' ? 'main' : 'sideboard';
  const toKey = direction === 'toSideboard' ? 'sideboard' : 'main';

  const available = deck[fromKey][cardId] ?? 0;
  if (available <= 0) return deck;

  const next: Deck = {
    ...deck,
    [fromKey]: setInPile(deck[fromKey], cardId, available - 1),
    [toKey]: setInPile(deck[toKey], cardId, (deck[toKey][cardId] ?? 0) + 1),
  };

  // 選定英雄被換出主牌組就不再是選定英雄（103.2 要求它是主牌組的一張）
  if (direction === 'toSideboard' && next.main[cardId] === undefined && next.championId === cardId) {
    next.championId = null;
  }
  return next;
}

// ─── 回合狀態與打出時機（規則 307–310）────────────────────────────

/**
 * 回合狀態的兩個維度。官方把它們疊加成四種狀態（310）。
 *
 * 308　回合處於「普通狀態」或「法術對決狀態」
 * 309　回合處於「開環狀態」或「閉環狀態」
 */
export type TurnPhase = {
  /** 正在進行法術對決或戰鬥（308.1）。 */
  duel: boolean;
  /** 結算鏈存在（309.1）。 */
  chain: boolean;
};

export type TurnStateId = 'normal-open' | 'normal-closed' | 'duel-open' | 'duel-closed';

export const turnStateId = ({ duel, chain }: TurnPhase): TurnStateId =>
  duel ? (chain ? 'duel-closed' : 'duel-open') : chain ? 'normal-closed' : 'normal-open';

/** 每種狀態能打出什麼。條號直接對應官方規則，介面上要顯示出來。 */
export const TURN_STATE_INFO: Record<
  TurnStateId,
  { label: string; rule: string; allows: string }
> = {
  'normal-open': {
    label: '普通開環',
    rule: '310.1',
    allows: '回合玩家擁有優先行動權時，可以打出任何卡牌或技能（310.1.a）',
  },
  'normal-closed': {
    label: '普通閉環',
    rule: '310.2',
    allows: '結算鏈存在，只有帶有 [反應] 的卡牌或技能可以打出（309.1.a）',
  },
  'duel-open': {
    label: '法術對決開環',
    rule: '310.3',
    allows: '對決或戰鬥中，只有帶有 [迅捷] 或 [反應] 的可以打出（308.1.a）',
  },
  'duel-closed': {
    label: '法術對決閉環',
    rule: '310.4',
    allows: '對決中且結算鏈存在，只有帶有 [反應] 的可以打出（309.1.a）',
  },
};

/** 這張卡帶有哪些時機關鍵字。Action 的官方簡中名是「迅捷」，Reaction 是「反應」。 */
export function timingKeywords(card: Card): { action: boolean; reaction: boolean } {
  const names = new Set<string>();
  // 能力文字有兩種區塊：段落與清單，關鍵字兩種裡面都可能出現
  for (const block of card.text) {
    const tokens = block.kind === 'paragraph' ? block.tokens : block.items.flat();
    for (const token of tokens) {
      if (token.type === 'keyword') names.add(token.name);
    }
  }
  return { action: names.has('Action'), reaction: names.has('Reaction') };
}

/**
 * 這張卡在目前的回合狀態下打不打得出來 —— **只看時機**。
 *
 * 309.1.a　閉環狀態：只有 [反應]
 * 308.1.a　法術對決狀態：只有 [迅捷] 或 [反應]
 * 310.1.a　預設：只能在自己回合的普通開環、且擁有優先行動權時打出
 *
 * ⚠️ 這裡**不檢查**費用、目標、以及卡牌自身的其他限制 ——
 * 那需要規則引擎。資源夠不夠是另外算的。
 */
export function canPlayByTiming(
  card: Card,
  state: TurnStateId,
  isTurnPlayer: boolean,
): boolean {
  const { action, reaction } = timingKeywords(card);

  // 309.1.a：閉環狀態下只有反應，跟是不是回合玩家無關
  if (state === 'normal-closed' || state === 'duel-closed') return reaction;

  // 308.1.a：法術對決狀態下只有迅捷或反應
  if (state === 'duel-open') return action || reaction;

  // 普通開環：回合玩家可以打出任何卡（310.1.a）；
  // 非回合玩家只有反應可以打（反應的官方說明是「可在任意時機打出」）
  return isTurnPlayer || reaction;
}

// ─── 活躍與休眠（規則 414、415）──────────────────────────────────

/** 場上的位置。只有這些位置的卡有活躍／休眠之分。 */
export const IN_PLAY_ZONES = ['base', 'bf0', 'bf1'] as const;
export type InPlayZone = (typeof IN_PLAY_ZONES)[number];

export const isInPlayZone = (zone: BoardZone): zone is InPlayZone =>
  (IN_PLAY_ZONES as readonly string[]).includes(zone);

/**
 * 一張卡進場時預設是活躍還是休眠。
 *
 * 143.4　　單位以休眠狀態進入場地
 * 359.2.c　打出的單位以休眠狀態進場
 * 359.2.d　非單位裝備以活躍狀態進場
 * 430.2.a　符文預設以活躍狀態召出
 *
 * 143.4.a 說單位的進場狀態可以被 [急速] 之類的效果改變，
 * 所以這只是**預設值**，使用者隨時可以自己改。
 */
export function entersDormant(card: Card): boolean {
  if (card.types.includes('rune')) return false;
  return card.types.includes('unit');
}

/** 某個位置有幾張某卡處於休眠。 */
export const dormantCount = (player: PlayerBoard, zone: InPlayZone, cardId: string): number =>
  player.dormant[zone][cardId] ?? 0;

/** 設定休眠張數。上限是該位置實際有幾張，不會超出。 */
export function setDormant(
  player: PlayerBoard,
  zone: InPlayZone,
  cardId: string,
  count: number,
): PlayerBoard {
  const total = player[zone][cardId] ?? 0;
  const clamped = Math.max(0, Math.min(total, Math.round(count)));

  return {
    ...player,
    dormant: {
      ...player.dormant,
      [zone]: setInPile(player.dormant[zone], cardId, clamped),
    },
  };
}

/**
 * 喚醒階段：把控制的所有非法術遊戲物體設為活躍（415.3.a）。
 *
 * 這是每個回合開始都會發生的事，所以做成一個按鈕。
 */
export function wakeAll(player: PlayerBoard): PlayerBoard {
  return { ...player, dormant: { base: {}, bf0: {}, bf1: {} } };
}

/**
 * 基地上**活躍**的符文有幾張。
 *
 * 這才是實際可用的資源：消耗符文取得法力（164.2.a）需要它是活躍的，
 * 休眠代表「耗盡了能量」（414.1）。
 */
export function activeRunesOnBase(player: PlayerBoard, byId: Map<string, Card>): number {
  let count = 0;
  for (const [cardId, qty] of Object.entries(player.base)) {
    if (qty <= 0) continue;
    if (!byId.get(cardId)?.types.includes('rune')) continue;
    count += Math.max(0, qty - dormantCount(player, 'base', cardId));
  }
  return count;
}

/**
 * 休眠的單位能不能做標準移動（去別的戰場）。
 *
 * 414.3.a：一名單位進行標準移動的費用，**是進入休眠狀態** ——
 * 已經休眠的就付不出這個費用（414.1.b：已經休眠的無法再次進入休眠）。
 */
export const canStandardMove = (player: PlayerBoard, zone: InPlayZone, cardId: string): boolean =>
  (player[zone][cardId] ?? 0) > dormantCount(player, zone, cardId);
