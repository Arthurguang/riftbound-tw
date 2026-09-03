/**
 * 把盤面從「可編輯」變成「可操作」。
 *
 * 復盤板原本只能手動擺卡。這裡加上遊戲實際會發生的動作 ——
 * 洗牌開局、抽牌、手牌調度、下一回合 —— 讓一個人（或同機兩人）
 * 可以把一局真的打完，而不是只能重建靜態畫面。
 *
 * ── 隨機從哪裡來 ────────────────────────────────────────────────
 * 我們的盤面模型裡，牌堆是一個「還剩哪些卡、各幾張」的集合，**沒有順序**。
 *
 * 這不是偷懶，而是剛好正確：規則 114 說牌堆要洗牌、108.4.d 說遊戲過程中
 * 主牌堆的順序是**隱密資訊**。對玩家而言，牌堆順序是均勻隨機且未知的 ——
 * 所以「從剩下的集合裡依張數加權隨機抽一張」跟「從洗好的牌堆頂端抽一張」
 * 在機率上完全等價。
 *
 * ── 這裡**不做**規則判斷 ────────────────────────────────────────
 * 這些動作只執行「規則明文寫的固定流程」（抽幾張、召幾張、什麼時候喚醒）。
 * 不檢查你打的牌合不合法、也不判斷勝負 —— 那需要規則引擎。
 */

import {
  remainingDeck,
  setInPile,
  wakeAll,
  type BoardState,
  type PlayerBoard,
  type Pile,
} from './board-state';
import { TURN_RULES } from './draw-model';
import type { Card } from './types';

/**
 * 從一疊裡依張數加權隨機挑一張。
 *
 * random 參數讓測試可以注入固定的亂數 —— 沒有它就沒辦法驗證
 * 「抽出來的分布真的照張數加權」。
 */
export function pickWeighted(pile: Pile, random: () => number = Math.random): string | null {
  const entries = Object.entries(pile).filter(([, qty]) => qty > 0);
  const total = entries.reduce((sum, [, qty]) => sum + qty, 0);
  if (total === 0) return null;

  let roll = Math.floor(random() * total);
  for (const [cardId, qty] of entries) {
    if (roll < qty) return cardId;
    roll -= qty;
  }
  // 浮點數邊界的保險，理論上到不了這裡
  return entries.at(-1)?.[0] ?? null;
}

/**
 * 從主牌堆抽 n 張到手牌（315.4.b 每回合抽一張、116 開局抽四張）。
 *
 * 牌堆抽完就停 —— 315.4.b.1 說主牌堆沒牌可抽時視為「燃盡」，
 * 那是勝負判定的一部分，這個工具不判斷勝負，所以只是抽不到而已。
 */
export function drawCards(
  player: PlayerBoard,
  count: number,
  random: () => number = Math.random,
): PlayerBoard {
  let next = player;
  for (let i = 0; i < count; i += 1) {
    const left = remainingDeck(next).main;
    const cardId = pickWeighted(left, random);
    if (cardId === null) break; // 牌堆空了
    next = { ...next, hand: setInPile(next.hand, cardId, (next.hand[cardId] ?? 0) + 1) };
  }
  return next;
}

/**
 * 從符文牌堆召出 n 張到基地（315.3.b、430.1）。
 *
 * 430.2.a：預設以活躍狀態召出，所以不動 dormant。
 * 315.3.b.1：符文牌堆不足兩張時，有多少就召出多少。
 */
export function summonRunes(
  player: PlayerBoard,
  count: number,
  random: () => number = Math.random,
): PlayerBoard {
  let next = player;
  for (let i = 0; i < count; i += 1) {
    const left = remainingDeck(next).runes;
    const cardId = pickWeighted(left, random);
    if (cardId === null) break;
    next = { ...next, base: setInPile(next.base, cardId, (next.base[cardId] ?? 0) + 1) };
  }
  return next;
}

/**
 * 開局：把選定英雄放進英雄區域，抽開局手牌。
 *
 * 116　　　 每名玩家各抽四張牌
 * 133.4　　選定英雄開局就在英雄區域，不在牌堆裡
 *
 * 會先清掉場上所有東西 —— 這是「重新開一局」，不是「繼續」。
 *
 * runeTarget 是「照規則這一方現在該有幾張符文」，由呼叫端依回合數算好
 * （先手第 1 回合 2 張、後手第 1 個自己的回合 3 張 —— 315.3.b、485.7）。
 * 重設之後符文也要回到該有的狀態，否則場面清空了符文卻還留著舊的張數。
 */
export function startGame(
  player: PlayerBoard,
  runeTarget = 0,
  random: () => number = Math.random,
): PlayerBoard {
  const fresh: PlayerBoard = {
    ...player,
    hand: {},
    unknownHand: 0,
    base: {},
    bf0: {},
    bf1: {},
    discard: {},
    exile: {},
    dormant: { base: {}, bf0: {}, bf1: {} },
    // 103.2.a.1：遊戲開始時選定英雄置於英雄區域
    champion: player.deck.championId ? setInPile({}, player.deck.championId, 1) : {},
  };

  const withHand = drawCards(fresh, TURN_RULES.openingHand, random);
  // 場面已經清空，所以這裡的「加」等同於直接設成該有的張數
  return adjustRunesOnBase(withHand, runeTarget, TURN_RULES.runeDeckSize);
}

/**
 * 手牌調度（117.1–117.3）。
 *
 * 官方順序很重要：
 *   117.1　從手牌選最多兩張**擱置**
 *   117.2　抽取與擱置數量相等的卡牌
 *   117.3　最後才**回收**被擱置的卡牌
 *
 * 也就是說補抽的牌來自「不含擱置牌」的牌堆。這裡照這個順序做：
 * 先把要換的牌從手牌拿掉但**不放回牌堆**，抽完之後才讓它們回去。
 */
export function mulligan(
  player: PlayerBoard,
  cardIds: string[],
  random: () => number = Math.random,
): PlayerBoard {
  const toSwap = cardIds.slice(0, TURN_RULES.mulliganMax);
  if (toSwap.length === 0) return player;

  // 117.1 擱置：從手牌拿掉，但這幾張還不算回到牌堆
  let setAside: Pile = {};
  let hand = player.hand;
  let actuallySet = 0;
  for (const cardId of toSwap) {
    if ((hand[cardId] ?? 0) <= 0) continue;
    hand = setInPile(hand, cardId, (hand[cardId] ?? 0) - 1);
    setAside = setInPile(setAside, cardId, (setAside[cardId] ?? 0) + 1);
    actuallySet += 1;
  }
  if (actuallySet === 0) return player;

  /*
   * 117.2 抽等量的牌。
   *
   * 這時牌堆裡不能含擱置的那幾張 —— 把它們暫時放進放逐區來達成，
   * 因為 remainingDeck 會把場上所有區域都扣掉。
   * 抽完之後再拿出來（117.3 回收）。
   */
  const withAside: PlayerBoard = {
    ...player,
    hand,
    exile: Object.entries(setAside).reduce(
      (pile, [id, qty]) => setInPile(pile, id, (pile[id] ?? 0) + qty),
      player.exile,
    ),
  };

  const drawn = drawCards(withAside, actuallySet, random);

  // 117.3 回收：擱置的牌洗回牌組，也就是從暫存的放逐區拿掉
  let exile = drawn.exile;
  for (const [id, qty] of Object.entries(setAside)) {
    exile = setInPile(exile, id, (exile[id] ?? 0) - qty);
  }

  return { ...drawn, exile };
}

/**
 * 進入下一回合的固定流程。
 *
 * 315.1　喚醒階段：把控制的所有非法術遊戲物體設為活躍（415.3.a）
 * 315.3.b　召出階段：從符文牌堆召出兩張符文
 * 485.7　　1v1：後手在自己**首個**召出階段額外召出一張
 * 315.4.b　抽牌階段：抽一張牌
 *
 * 只做這三件固定的事。開始階段的得分計算、觸發式技能都不在這裡 ——
 * 那需要規則引擎。
 */
export function beginTurn(
  board: BoardState,
  side: 'you' | 'opponent',
  random: () => number = Math.random,
): BoardState {
  const player = board[side];

  // 這一方是不是先手：you 看 onThePlay，opponent 就是相反
  const onThePlay = side === 'you' ? board.onThePlay : !board.onThePlay;
  // 485.7 只在該玩家「自己遊戲中的第一個召出階段」才適用
  const isFirstTurn = board.turn === 1;
  const bonus = !onThePlay && isFirstTurn ? TURN_RULES.secondPlayerBonusRune : 0;

  let next = wakeAll(player); // 315.1、415.3.a
  next = summonRunes(next, TURN_RULES.runesPerTurn + bonus, random); // 315.3.b、485.7
  next = drawCards(next, TURN_RULES.cardsPerTurn, random); // 315.4.b

  return {
    ...board,
    [side]: next,
    activePlayer: side,
    // 換人之後回到普通開環（結算鏈與對決都結束了）
    phase: { duel: false, chain: false },
  };
}

/**
 * 依回合變化增減基地上的符文。
 *
 * ── 為什麼是「增量」而不是「設成應有的張數」 ────────────────────
 * 照規則算，第 N 回合應該召出過 min(12, N×2 + 後手加成) 張。
 * 直覺做法是每次改回合就把基地設成那個數字 —— **但那會毀掉復盤**。
 *
 * 實際對局中場上的符文幾乎一定比公式少：回收符文取得符能之後，
 * 那張符文**永久離場**（164.2.b）。所以使用者在第 5 回合手動設成 7 張
 * 是完全正確的盤面。若他把回合推到 6，我們卻把 7 覆蓋成 12，
 * 等於把他辛苦重建的局面洗掉。
 *
 * 所以這裡只做**相對變化**：一回合加兩張（315.3.b），推回去就減兩張。
 * 從 7 推到第 6 回合會得到 9，而不是 12 —— 他的調整被保留下來。
 *
 * 後手第一回合多的那一張（485.7）已經含在起始張數裡，不會重複加。
 *
 * ── 分配方式是決定性的 ──────────────────────────────────────────
 * 不用亂數：使用者把回合推來推去時，同一個回合數要得到同一個結果。
 * 加的時候補進「牌組裡還沒上場最多」的那一種，減的時候從
 * 「場上最多」的那一種拿掉 —— 已經擺好的比例會被保留。
 *
 * @param cap 基地上的符文上限，由呼叫端傳入（符文牌組共 12 張，103.3.a）
 */
export function adjustRunesOnBase(
  player: PlayerBoard,
  delta: number,
  cap: number,
): PlayerBoard {
  const runeIds = Object.keys(player.deck.runes);
  if (runeIds.length === 0 || delta === 0) return player;

  const onBase = (id: string) => player.base[id] ?? 0;
  const current = runeIds.reduce((sum, id) => sum + onBase(id), 0);
  const target = Math.max(0, Math.min(cap, current + delta));
  if (target === current) return player;

  let base = player.base;
  let left = target - current;

  while (left > 0) {
    // 補進「牌組裡剩最多沒上場」的那一種
    const pick = runeIds
      .map((id) => ({ id, spare: (player.deck.runes[id] ?? 0) - (base[id] ?? 0) }))
      .filter((r) => r.spare > 0)
      .sort((a, b) => b.spare - a.spare || a.id.localeCompare(b.id))[0];
    if (!pick) break; // 符文牌組已經全部上場
    base = setInPile(base, pick.id, (base[pick.id] ?? 0) + 1);
    left -= 1;
  }

  while (left < 0) {
    // 從「場上最多」的那一種拿掉
    const pick = runeIds
      .map((id) => ({ id, qty: base[id] ?? 0 }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty || a.id.localeCompare(b.id))[0];
    if (!pick) break;
    base = setInPile(base, pick.id, pick.qty - 1);
    left += 1;
  }

  return { ...player, base };
}

/** 把手上或場上的某張卡送進廢牌堆。方便打完法術之後收拾。 */
export function discardFrom(
  player: PlayerBoard,
  zone: 'hand' | 'base' | 'bf0' | 'bf1',
  cardId: string,
): PlayerBoard {
  const available = player[zone][cardId] ?? 0;
  if (available <= 0) return player;

  return {
    ...player,
    [zone]: setInPile(player[zone], cardId, available - 1),
    discard: setInPile(player.discard, cardId, (player.discard[cardId] ?? 0) + 1),
  };
}

/** 手牌裡可以拿去調度的卡（給介面列選項用）。 */
export function handEntries(
  player: PlayerBoard,
  byId: Map<string, Card>,
): { card: Card; qty: number }[] {
  return Object.entries(player.hand)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);
}
