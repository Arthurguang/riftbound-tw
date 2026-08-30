/**
 * 牌組 ⇄ 網址編碼。
 *
 * 牌組完整編碼在網址裡，因此分享牌組**不需要任何伺服器或資料庫** ——
 * 這維持了本站「零使用者資料」的架構，也是資安評分能拿 A+ 的根本原因。
 *
 * 資安注意：網址是使用者可以任意編造的輸入。
 * 解碼時每一個代碼都必須比對真實存在的卡片，認不得的一律丟棄，
 * 張數也要限制在合理範圍 —— 與 filters-url.ts 相同的原則。
 */

import { EMPTY_DECK, type Deck } from './deck-rules';
import type { Card } from './types';

/** 編碼格式版本。日後若要改格式，靠這個辨識舊連結。 */
const FORMAT_VERSION = '1';

/** 單一卡片的張數上限。防止有人在網址裡塞 999999 張癱瘓瀏覽器。 */
const MAX_QTY = 99;

/** 一副牌組最多能塞多少種不同的卡（遠高於實際需求，只是防呆）。 */
const MAX_ENTRIES = 300;

/**
 * 卡片的短代碼，例如 `ogn056`、`ogn066a`。
 *
 * 不直接用卡片 id（`ogn-056-298`）是因為結尾的系列總數是冗餘的，
 * 網址會變得又長又難讀。
 */
export function shortCode(card: Card): string {
  return `${card.set.toLowerCase()}${String(card.number).padStart(3, '0')}${card.variant ?? ''}`;
}

/** 建立「短代碼 → 卡片」的查表，供解碼使用。 */
export function buildCodeIndex(cards: Card[]): Map<string, Card> {
  return new Map(cards.map((card) => [shortCode(card), card]));
}

const encodeZone = (zone: Record<string, number>, byId: Map<string, Card>): string =>
  Object.entries(zone)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const card = byId.get(id);
      if (!card) return null;
      return qty === 1 ? shortCode(card) : `${shortCode(card)}x${qty}`;
    })
    .filter(Boolean)
    .join('.');

/**
 * 把牌組編成查詢字串的值。
 *
 * 格式：`1|傳奇|選定英雄|主牌組|符文|戰場`
 * 例：`1|ogn304|ogn066a|ogn056x3.ogn179x2|ogn007x12|ogn205.ogn206.ogn207`
 */
export function encodeDeck(deck: Deck, cards: Card[]): string {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const codeOf = (id: string | null) => {
    if (!id) return '';
    const card = byId.get(id);
    return card ? shortCode(card) : '';
  };

  return [
    FORMAT_VERSION,
    codeOf(deck.legendId),
    codeOf(deck.championId),
    encodeZone(deck.main, byId),
    encodeZone(deck.runes, byId),
    encodeZone(deck.battlefields, byId),
  ].join('|');
}

/** 解析一個區域的編碼，只接受確實存在的卡片。 */
function decodeZone(
  encoded: string,
  index: Map<string, Card>,
): { zone: Record<string, number>; dropped: number } {
  const zone: Record<string, number> = {};
  let dropped = 0;

  if (encoded === '') return { zone, dropped };

  for (const part of encoded.split('.').slice(0, MAX_ENTRIES)) {
    const m = /^([a-z0-9*]+?)(?:x(\d{1,2}))?$/.exec(part);
    if (!m) {
      dropped += 1;
      continue;
    }
    const card = index.get(m[1] ?? '');
    if (!card) {
      dropped += 1; // 認不得的代碼直接丟棄，不讓它進入應用程式狀態
      continue;
    }
    const qty = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      dropped += 1;
      continue;
    }
    zone[card.id] = (zone[card.id] ?? 0) + qty;
  }
  return { zone, dropped };
}

export type DecodeResult = {
  deck: Deck;
  /** 有多少段編碼因為無法辨識而被丟棄 —— 介面上要讓使用者知道。 */
  dropped: number;
};

/**
 * 從查詢字串的值還原牌組。
 *
 * 任何無法辨識的部分都會被安靜丟棄並計入 dropped，
 * 而不是讓整個解析失敗 —— 使用者拿到一份「大部分正確」的牌組，
 * 比看到一片空白有用得多。但介面必須告訴他有東西被丟掉了。
 */
export function decodeDeck(encoded: string, index: Map<string, Card>): DecodeResult {
  if (typeof encoded !== 'string' || encoded === '') {
    return { deck: EMPTY_DECK, dropped: 0 };
  }

  const parts = encoded.split('|');
  if (parts[0] !== FORMAT_VERSION) {
    // 版本對不上就整份不採用，總比誤讀成別的牌組好
    return { deck: EMPTY_DECK, dropped: 1 };
  }

  const [, legendCode = '', championCode = '', mainRaw = '', runesRaw = '', bfRaw = ''] = parts;

  const legend = legendCode === '' ? null : (index.get(legendCode) ?? null);
  const champion = championCode === '' ? null : (index.get(championCode) ?? null);

  const main = decodeZone(mainRaw, index);
  const runes = decodeZone(runesRaw, index);
  const battlefields = decodeZone(bfRaw, index);

  let dropped = main.dropped + runes.dropped + battlefields.dropped;
  if (legendCode !== '' && !legend) dropped += 1;
  if (championCode !== '' && !champion) dropped += 1;

  return {
    deck: {
      legendId: legend?.id ?? null,
      championId: champion?.id ?? null,
      main: main.zone,
      runes: runes.zone,
      battlefields: battlefields.zone,
    },
    dropped,
  };
}
