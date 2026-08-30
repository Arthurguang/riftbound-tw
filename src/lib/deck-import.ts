/**
 * 牌組匯入：把貼上的牌表文字或 CSV 還原成牌組。
 *
 * ── 為什麼只做文字與 CSV ────────────────────────────────────────
 * 圖片需要文字辨識（OCR），那是一整套模型，而且辨識錯了會安靜地給你
 * 一副錯的牌組 —— 對這個專案來說是不能接受的失敗模式。
 * PDF 雖然內含文字，但要在瀏覽器裡解析任意 PDF 得帶一個大型解析器進來，
 * 違背「零執行期套件」的原則，而且我們自己產生的 PDF 本來就有 CSV 與網址可用。
 *
 * 所以支援的是**真正用得到而且不會出錯**的三種：
 *   · 本站匯出的 CSV（有「區域」欄，最精確）
 *   · 本站匯出的牌表文字（有【區域】標題）
 *   · 一般抄牌網站的純文字（「3 卡名」或「3x 卡名」每行一張）
 *
 * ── 資安 ────────────────────────────────────────────────────────
 * 貼上的內容是不可信輸入。每一行都要比對到真實存在的卡片才採用，
 * 認不得的一律略過並回報數量，絕不猜測。
 */

import { EMPTY_DECK, zoneForCard, type Deck, type DeckZone } from './deck-rules';
import { shortCode } from './deck-url';
import type { Card } from './types';

/** 一次最多處理幾行。防止貼上超大檔案癱瘓瀏覽器。 */
const MAX_LINES = 2000;

/** 單張卡的張數上限，與網址編碼一致。 */
const MAX_QTY = 99;

export type ImportIssue = {
  line: number;
  text: string;
  reason: 'unknown-card' | 'bad-quantity' | 'ambiguous';
};

export type DeckImportResult = {
  deck: Deck;
  /**
   * 牌表的標題行（如果有的話）。
   * 本站匯出的文字第一行就是牌組名稱，匯入時順便帶回來。
   */
  name: string | null;
  /** 成功匯入幾行 */
  imported: number;
  /** 每一行為什麼失敗，介面上要讓使用者看得到 */
  issues: ImportIssue[];
};

/** 匯入時可以放進哪一區（備牌不是卡片屬性，要由文字標題判斷）。 */
type TargetZone = DeckZone | 'sideboard';

/** 把卡名正規化，讓比對不受標點、大小寫、全半形影響。 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[，、]/g, ',')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

type Lookup = {
  byCode: Map<string, Card>;
  byShort: Map<string, Card>;
  byName: Map<string, Card[]>;
};

/** 建立比對用的索引。三種語言的卡名都收，貼中文或英文都找得到。 */
export function buildImportIndex(cards: Card[]): Lookup {
  const byCode = new Map<string, Card>();
  const byShort = new Map<string, Card>();
  const byName = new Map<string, Card[]>();

  const addName = (name: string | null | undefined, card: Card) => {
    if (!name) return;
    const key = normalizeName(name);
    if (key === '') return;
    byName.set(key, [...(byName.get(key) ?? []), card]);
  };

  for (const card of cards) {
    byCode.set(card.code.toLowerCase(), card);
    byShort.set(shortCode(card), card);

    // 三種語言的卡名都收，貼中文或英文都找得到
    addName(card.name, card);
    addName(card.zh.tw?.name, card);
    addName(card.zh.cn?.name, card);

    // 英雄卡的中文版把副標分開存，牌表上常寫成「凱莎-虛空之女」
    for (const zh of [card.zh.tw, card.zh.cn]) {
      if (zh?.name && zh.subtitle) {
        addName(`${zh.name}-${zh.subtitle}`, card);
        addName(`${zh.name}，${zh.subtitle}`, card);
      }
    }
  }
  return { byCode, byShort, byName };
}

/**
 * 依卡名或卡號找卡片。
 *
 * 同名卡有多個版本（異畫）時，一律選**卡號最小**的那一張 ——
 * 這是可預測的規則，而不是隨機挑一張。使用者要指定版本就用卡號。
 */
function findCard(token: string, lookup: Lookup): Card | null {
  const raw = token.trim();
  if (raw === '') return null;

  const byCode = lookup.byCode.get(raw.toLowerCase());
  if (byCode) return byCode;

  const byShort = lookup.byShort.get(raw.toLowerCase());
  if (byShort) return byShort;

  const matches = lookup.byName.get(normalizeName(raw));
  if (!matches || matches.length === 0) return null;

  return [...matches].sort((a, b) => a.number - b.number)[0] ?? null;
}

/** 各區域標題的關鍵字，三種語言都認。 */
const ZONE_HEADINGS: { zone: TargetZone; patterns: RegExp }[] = [
  { zone: 'legend', patterns: /^(傳奇|传奇|legend)/i },
  { zone: 'sideboard', patterns: /^(備牌|备牌|sideboard|side\s*board)/i },
  { zone: 'runes', patterns: /^(符文|rune)/i },
  { zone: 'battlefields', patterns: /^(戰場|战场|battlefield)/i },
  { zone: 'main', patterns: /^(主牌組|主牌堆|main\s*deck|main|選定英雄|选定英雄|chosen)/i },
];

/** 這一行是不是區域標題？是的話回傳它代表哪一區。 */
function detectHeading(line: string): TargetZone | null {
  // 【主牌組】40 或 Main Deck (40) 或 // Sideboard
  const cleaned = line
    .replace(/^[[\]【】#/*\-–—\s]+/, '')
    .replace(/[[\]【】()（）:：]/g, ' ')
    .trim();
  if (cleaned === '') return null;
  // 純粹是「3 卡名」這種資料行就不是標題
  if (/^\d/.test(cleaned)) return null;

  for (const { zone, patterns } of ZONE_HEADINGS) {
    if (patterns.test(cleaned)) return zone;
  }
  return null;
}

/**
 * 解析一行「張數 + 卡名」。
 *
 * 認得的寫法：
 *   3 Blazing Scorcher
 *   3x Blazing Scorcher
 *   3 x 烈焰灼魂者
 *   Blazing Scorcher x3
 *   OGN-001/298
 */
function parseLine(line: string): { qty: number; token: string; explicit: boolean } | null {
  const text = line.trim();
  if (text === '') return null;

  // 前置張數
  const prefix = /^(\d{1,3})\s*[x*×]?\s+(.+)$/i.exec(text);
  if (prefix) return { qty: Number(prefix[1]), token: prefix[2]!.trim(), explicit: true };

  // 後置張數
  const suffix = /^(.+?)\s*[x*×]\s*(\d{1,3})$/i.exec(text);
  if (suffix) return { qty: Number(suffix[2]), token: suffix[1]!.trim(), explicit: true };

  /*
   * 沒寫張數就當一張，explicit 為 false。
   *
   * 這個旗標是用來區分「這行想寫一張卡」和「這行只是標題」：
   * 標題行也長這樣，但有寫張數的行認不得卡名時就該回報錯誤，
   * 不能當成標題吞掉。
   */
  return { qty: 1, token: text, explicit: false };
}

/** 把 CSV 的一行切成欄位（支援引號包住的欄位）。 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}

/** 本站匯出的 CSV，第一欄是區域名稱。 */
const CSV_ZONE_BY_LABEL = new Map<string, TargetZone>([
  ['傳奇', 'legend'],
  ['传奇', 'legend'],
  ['legend', 'legend'],
  ['選定英雄', 'main'],
  ['选定英雄', 'main'],
  ['chosen champion', 'main'],
  ['主牌組', 'main'],
  ['主牌堆', 'main'],
  ['main deck', 'main'],
  ['符文牌組', 'runes'],
  ['符文牌堆', 'runes'],
  ['rune deck', 'runes'],
  ['戰場', 'battlefields'],
  ['战场', 'battlefields'],
  ['battlefields', 'battlefields'],
  ['備牌', 'sideboard'],
  ['备牌', 'sideboard'],
  ['sideboard', 'sideboard'],
]);

/** 看起來像本站匯出的 CSV 嗎？ */
function looksLikeCsv(text: string): boolean {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  if (!firstLine.includes(',')) return false;
  const cells = splitCsvLine(firstLine).map((c) => normalizeName(c));
  return cells.some((c) => CSV_ZONE_BY_LABEL.has(c) || ['區域', '区域', 'zone'].includes(c));
}

/**
 * 匯入牌組。
 *
 * 自動判斷是 CSV 還是純文字牌表，兩種都不需要使用者先選格式。
 */
export function importDeck(text: string, cards: Card[]): DeckImportResult {
  const lookup = buildImportIndex(cards);
  const isCsv = looksLikeCsv(text);

  const deck: Deck = {
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: {},
    sideboard: {},
  };

  const issues: ImportIssue[] = [];
  let imported = 0;
  let name: string | null = null;

  /** 目前所在的區域。沒有標題時依卡片本身的類型決定。 */
  let currentZone: TargetZone | null = null;

  const put = (zone: TargetZone, card: Card, qty: number) => {
    if (zone === 'legend') {
      // 傳奇只有一張，後面的覆蓋前面的
      deck.legendId = card.id;
      return;
    }
    const bucket = deck[zone];
    bucket[card.id] = Math.min(MAX_QTY, (bucket[card.id] ?? 0) + qty);
  };

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).slice(0, MAX_LINES);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === '') continue;
    // 註解行
    // 註解行，以及本站匯出牌表最後那行以破折號開頭的出處註記
    if (/^(\/\/|#|—|–|--)/.test(line)) continue;

    let token = '';
    let qty = 1;
    let zoneHint: TargetZone | null = null;

    if (isCsv) {
      const cells = splitCsvLine(line);
      const zoneLabel = normalizeName(cells[0] ?? '');
      // 標題列
      if (['區域', '区域', 'zone'].includes(zoneLabel)) continue;

      zoneHint = CSV_ZONE_BY_LABEL.get(zoneLabel) ?? null;
      if (zoneHint === null) {
        issues.push({ line: index + 1, text: line, reason: 'unknown-card' });
        continue;
      }
      qty = Number((cells[1] ?? '').trim());
      // 用卡號比對最可靠，卡名只是備援
      token = (cells[4] ?? '').trim() || (cells[3] ?? '').trim() || (cells[2] ?? '').trim();
    } else {
      const heading = detectHeading(line);
      if (heading !== null) {
        currentZone = heading;
        continue;
      }
      const parsed = parseLine(line);
      if (!parsed) continue;

      /*
       * 還沒匯入任何卡、又沒有寫張數、也認不出卡名 → 這是標題行。
       * 本站匯出的牌表第一行就是牌組名稱；其他抄牌網站也常有標題。
       * 有寫張數的行（「3 不存在的卡」）不適用 —— 那明顯是想寫一張卡，
       * 認不得就該回報，不能當標題吞掉。
       */
      if (
        name === null &&
        imported === 0 &&
        !parsed.explicit &&
        findCard(parsed.token, lookup) === null
      ) {
        name = parsed.token;
        continue;
      }

      qty = parsed.qty;
      token = parsed.token;
    }

    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      issues.push({ line: index + 1, text: line, reason: 'bad-quantity' });
      continue;
    }

    // 本站的文字牌表在卡名後面接「/ 英文名 (卡號)」，卡號最可靠
    const codeInLine = /\(([A-Za-z]{3}-\d{3}[a-z]?\/\d+)\)\s*$/.exec(token);
    if (codeInLine) token = codeInLine[1]!;

    const card = findCard(token, lookup);
    if (!card) {
      issues.push({ line: index + 1, text: line, reason: 'unknown-card' });
      continue;
    }

    // 區域：CSV 有明確欄位；純文字先看標題，沒有標題就依卡片類型判斷
    let zone: TargetZone | null = zoneHint;
    if (zone === null) {
      const natural = zoneForCard(card);
      if (natural === null) {
        issues.push({ line: index + 1, text: line, reason: 'unknown-card' });
        continue;
      }
      // 標題說是備牌，而這張卡本來就該進主牌組 → 放備牌
      zone = currentZone === 'sideboard' && natural === 'main' ? 'sideboard' : natural;
    }

    put(zone, card, qty);
    imported += 1;
  }

  return { deck, name, imported, issues };
}

/**
 * 匯入後把選定英雄補上。
 *
 * 牌表文字通常不會標明哪一張是選定英雄，因此依規則推斷：
 * 主牌組裡符合傳奇英雄標籤的英雄單位（103.2.a.2）。
 * 只有唯一一個候選時才自動指定 —— 有多個就交給使用者選，不猜。
 */
export function inferChampion(deck: Deck, byId: Map<string, Card>): string | null {
  if (deck.championId) return deck.championId;
  const legend = deck.legendId ? byId.get(deck.legendId) : undefined;
  if (!legend) return null;

  const candidates = Object.keys(deck.main)
    .map((id) => byId.get(id))
    .filter((card): card is Card => Boolean(card))
    .filter(
      (card) =>
        card.subtype === 'champion' && card.tags.some((tag) => legend.tags.includes(tag)),
    );

  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}

/** 空牌組，供介面在匯入失敗時使用。 */
export const EMPTY_IMPORT: DeckImportResult = {
  deck: EMPTY_DECK,
  name: null,
  imported: 0,
  issues: [],
};

/** 讓介面能顯示可貼上的範例。 */
export const IMPORT_EXAMPLE = `【傳奇】
1 凱莎-虛空之女 (OGN-247/298)

【主牌組】
3 烈焰灼魂者
3 Brazen Buccaneer
2 OGN-003/298

【符文牌組】
12 狂怒符文

【戰場】
1 團結祭壇

【備牌】
2 劈砍`;
