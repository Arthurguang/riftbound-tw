/**
 * 牌組匯出。
 *
 * 四種格式全部**不需要任何額外套件**：
 *   純文字   自己組字串
 *   CSV      自己組字串（Excel 可直接開啟）
 *   PDF      做一份列印專用版面，用瀏覽器內建的「列印 → 另存為 PDF」
 *   PNG      用瀏覽器內建的繪圖功能
 *
 * 為什麼堅持零套件：每多一個套件就多一份供應鏈風險。
 * 上線當天 CI 就抓到過一個套件（postcss）本身的高風險漏洞 ——
 * 那不是我們寫錯，但如果沒有自動掃描就不會有人發現。
 * 能不裝就不裝。
 */

import { cardName } from './cards';
import { TYPE_LABELS, DOMAIN_LABELS } from './labels';
import { RULES_VERSION, type Deck } from './deck-rules';
import { shortCode } from './deck-url';
import type { TextLang } from './i18n';
import type { Card } from './types';

/**
 * Excel 開啟 UTF-8 的 CSV 時，如果檔案開頭沒有 BOM，中文會變成亂碼。
 *
 * 這是中文使用者最常踩的坑之一：檔案內容其實是對的，
 * 但 Excel 會用系統預設編碼去猜，猜錯就整片亂碼。
 * 加上這三個位元組，Excel 就知道要用 UTF-8 讀。
 */
const UTF8_BOM = '﻿';

/** CSV 欄位跳脫：含逗號、引號或換行的值要用引號包起來，內部引號要加倍。 */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const toCsvText = (rows: (string | number)[][]): string =>
  UTF8_BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

// ─── 牌組的區域整理 ──────────────────────────────────────────────

export type ExportRow = {
  zone: 'legend' | 'champion' | 'main' | 'runes' | 'battlefields';
  card: Card;
  qty: number;
};

/** 把牌組攤平成一列一列，供各種匯出格式共用。 */
export function deckRows(deck: Deck, byId: Map<string, Card>): ExportRow[] {
  const rows: ExportRow[] = [];
  const push = (zone: ExportRow['zone'], id: string, qty: number) => {
    const card = byId.get(id);
    if (card && qty > 0) rows.push({ zone, card, qty });
  };

  if (deck.legendId) push('legend', deck.legendId, 1);
  if (deck.championId) push('champion', deck.championId, 1);

  const sortByNumber = (entries: [string, number][]) =>
    entries.sort(([a], [b]) => (byId.get(a)?.number ?? 0) - (byId.get(b)?.number ?? 0));

  for (const [id, qty] of sortByNumber(Object.entries(deck.main))) push('main', id, qty);
  for (const [id, qty] of sortByNumber(Object.entries(deck.runes))) push('runes', id, qty);
  for (const [id, qty] of sortByNumber(Object.entries(deck.battlefields))) {
    push('battlefields', id, qty);
  }
  return rows;
}

const ZONE_LABELS: Record<ExportRow['zone'], Record<TextLang, string>> = {
  legend: { 'zh-TW': '傳奇', 'zh-CN': '传奇', en: 'Legend' },
  champion: { 'zh-TW': '選定英雄', 'zh-CN': '选定英雄', en: 'Chosen Champion' },
  main: { 'zh-TW': '主牌組', 'zh-CN': '主牌堆', en: 'Main Deck' },
  runes: { 'zh-TW': '符文牌組', 'zh-CN': '符文牌堆', en: 'Rune Deck' },
  battlefields: { 'zh-TW': '戰場', 'zh-CN': '战场', en: 'Battlefields' },
};

export const zoneLabel = (zone: ExportRow['zone'], lang: TextLang) => ZONE_LABELS[zone][lang];

// ─── 純文字 ──────────────────────────────────────────────────────

/**
 * 卡牌遊戲通用的牌表格式：「張數 卡名 (卡號)」。
 * 適合貼到論壇或 Discord。
 */
export function toPlainText(
  deck: Deck,
  byId: Map<string, Card>,
  lang: TextLang,
  deckName: string,
): string {
  const rows = deckRows(deck, byId);
  const lines: string[] = [deckName, ''];

  for (const zone of ['legend', 'champion', 'main', 'runes', 'battlefields'] as const) {
    const inZone = rows.filter((r) => r.zone === zone);
    if (inZone.length === 0) continue;
    const total = inZone.reduce((sum, r) => sum + r.qty, 0);
    lines.push(`【${zoneLabel(zone, lang)}】${total}`);
    for (const { card, qty } of inZone) {
      const name = cardName(card, lang);
      const english = lang === 'en' ? '' : ` / ${card.name}`;
      lines.push(`${qty} ${name}${english} (${card.code})`);
    }
    lines.push('');
  }

  lines.push(`— 由符文戰場資料庫產生 · 規則依據：${RULES_VERSION.document} ${RULES_VERSION.updated}`);
  return lines.join('\n');
}

// ─── CSV ─────────────────────────────────────────────────────────

const CSV_HEADERS: Record<TextLang, string[]> = {
  'zh-TW': ['區域', '張數', '卡名', '英文卡名', '卡號', '卡種', '領域', '能量', '力量'],
  'zh-CN': ['区域', '张数', '卡名', '英文卡名', '卡号', '类型', '颜色', '费用', '战力'],
  en: ['Zone', 'Qty', 'Name', 'English Name', 'Code', 'Type', 'Domain', 'Energy', 'Might'],
};

export function toCsv(deck: Deck, byId: Map<string, Card>, lang: TextLang): string {
  const rows: (string | number)[][] = [CSV_HEADERS[lang]];

  for (const { zone, card, qty } of deckRows(deck, byId)) {
    rows.push([
      zoneLabel(zone, lang),
      qty,
      cardName(card, lang),
      card.name,
      card.code,
      card.types.map((t) => TYPE_LABELS[t][lang]).join(' / '),
      card.domains.map((d) => DOMAIN_LABELS[d][lang]).join(' / '),
      card.energy ?? '',
      card.might ?? '',
    ]);
  }
  return toCsvText(rows);
}

/** 缺卡清單的 CSV —— 可以直接印出來帶去卡店。 */
export function missingToCsv(
  missing: { cardId: string; needed: number; owned: number; short: number }[],
  byId: Map<string, Card>,
  lang: TextLang,
): string {
  const header: Record<TextLang, string[]> = {
    'zh-TW': ['卡名', '英文卡名', '卡號', '牌組需要', '目前擁有', '還缺'],
    'zh-CN': ['卡名', '英文卡名', '卡号', '卡组需要', '目前拥有', '还缺'],
    en: ['Name', 'English Name', 'Code', 'Needed', 'Owned', 'Short'],
  };

  const rows: (string | number)[][] = [header[lang]];
  for (const entry of missing) {
    const card = byId.get(entry.cardId);
    if (!card) continue;
    rows.push([
      cardName(card, lang),
      card.name,
      card.code,
      entry.needed,
      entry.owned,
      entry.short,
    ]);
  }
  return toCsvText(rows);
}

// ─── 收藏的匯出／匯入 ────────────────────────────────────────────

/**
 * 收藏資料只存在使用者的瀏覽器，清除瀏覽資料就會消失。
 * 因此匯出／匯入是必要功能，不是加分項。
 */
export function collectionToCsv(
  collection: Record<string, number>,
  byId: Map<string, Card>,
  lang: TextLang,
): string {
  const header: Record<TextLang, string[]> = {
    'zh-TW': ['卡號', '卡名', '英文卡名', '擁有張數'],
    'zh-CN': ['卡号', '卡名', '英文卡名', '拥有张数'],
    en: ['Code', 'Name', 'English Name', 'Owned'],
  };

  const rows: (string | number)[][] = [header[lang]];
  const entries = Object.entries(collection)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card))
    .sort((a, b) => a.card.code.localeCompare(b.card.code));

  for (const { card, qty } of entries) {
    rows.push([card.code, cardName(card, lang), card.name, qty]);
  }
  return toCsvText(rows);
}

export type ImportResult = {
  collection: Record<string, number>;
  imported: number;
  /** 無法辨識而被略過的列數 —— 介面上要讓使用者知道。 */
  skipped: number;
};

/**
 * 從 CSV 還原收藏。
 *
 * 只認「卡號」與「擁有張數」兩欄，其餘欄位忽略 ——
 * 這樣使用者用 Excel 編輯過（加註解、調欄位順序）也還能匯入。
 *
 * 檔案內容是不可信輸入：每一列都要驗證卡號真的存在、張數是合理整數。
 */
export function collectionFromCsv(text: string, cards: Card[]): ImportResult {
  const byCode = new Map(cards.map((c) => [c.code, c]));
  const byShort = new Map(cards.map((c) => [shortCode(c), c]));

  const collection: Record<string, number> = {};
  let imported = 0;
  let skipped = 0;

  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;

    // 簡單的 CSV 切割：支援引號包住的欄位
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

    const code = cells[0]?.trim() ?? '';
    const card = byCode.get(code) ?? byShort.get(code.toLowerCase());
    if (!card) {
      // 第一列通常是標題列，不算錯誤
      if (index > 0) skipped += 1;
      continue;
    }

    // 張數欄位：找第一個能解析成數字的欄位（容忍欄位順序被調動）
    const qtyCell = cells.slice(1).find((c) => /^\s*\d+\s*$/.test(c));
    const qty = qtyCell === undefined ? NaN : Number(qtyCell.trim());
    if (!Number.isInteger(qty) || qty < 0 || qty > 999) {
      skipped += 1;
      continue;
    }

    if (qty > 0) collection[card.id] = qty;
    imported += 1;
  }

  return { collection, imported, skipped };
}

// ─── 下載 ────────────────────────────────────────────────────────

/**
 * 觸發瀏覽器下載。
 *
 * 用 blob URL 而不是 data: URL —— data: URL 在檔案較大時會超出網址長度限制，
 * 而且我們的 CSP 沒有開放 data: 給非圖片用途。
 * blob URL 是同源的物件參照，不受 CSP 的來源限制。
 */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 釋放記憶體；延遲一下確保下載已經開始
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 產生安全的檔名：去掉檔案系統不允許的字元。 */
export function safeFilename(name: string, extension: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'deck';
  return `${cleaned.slice(0, 60)}.${extension}`;
}
