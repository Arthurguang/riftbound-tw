/**
 * 把牌組畫成一張 PNG 圖片。
 *
 * ── 為什麼是純文字排版，不放卡圖 ────────────────────────────────
 * 卡圖放在 Riot 的 CDN（cmsassets.rgpub.io）。瀏覽器的畫布只要畫進
 * 跨網域的圖片，就會被標記為「已污染（tainted）」，之後呼叫 toBlob()
 * 會直接丟出 SecurityError —— 這是瀏覽器防止網站偷讀其他網站圖片內容的機制。
 *
 * 要繞過它必須那個 CDN 主動回傳 CORS 標頭，這不是我們能控制的。
 * 與其做一個「有時候會失敗、失敗原因還很難懂」的功能，
 * 不如做一個必定成功的文字版牌表圖 —— 貼到 Discord、LINE 都能直接看。
 *
 * 這裡完全用瀏覽器內建的 Canvas API，沒有引入任何繪圖套件。
 */

import { cardName } from './cards';
import { annotateRows, shortSummary, zoneLabel, type AnnotatedRow } from './deck-export';
import { RULES_VERSION, type Deck } from './deck-rules';
import type { Collection } from './collection';
import type { TextLang } from './i18n';
import type { Card } from './types';

/** 版面常數。用兩倍解析度輸出，貼到聊天軟體縮放後仍然清晰。 */
const SCALE = 2;
const WIDTH = 720;
const PADDING = 32;
const LINE_HEIGHT = 26;
const ZONE_GAP = 18;
// 標題 + 副標題 + 分隔線。副標題的基線在 PADDING+34，13px 字高到 47，
// 分隔線要留在它下面，否則會壓在字上。
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 44;

/** 深色配色，與網站一致。 */
const COLORS = {
  background: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  heading: '#e6edf3',
  text: '#c9d1d9',
  dim: '#8b949e',
  accent: '#d4a24a',
  warn: '#e0a458',
};

const MISSING_HEADING: Record<TextLang, string> = {
  'zh-TW': '還需要蒐集',
  'zh-CN': '还需要收集',
  en: 'Still Needed',
};

const ALL_OWNED: Record<TextLang, string> = {
  'zh-TW': '這副牌組你已經湊齊了。',
  'zh-CN': '这副卡组你已经凑齐了。',
  en: 'You already own every card in this deck.',
};

const FONT_STACK =
  '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, -apple-system, sans-serif';

const ZONES = ['legend', 'champion', 'main', 'runes', 'battlefields'] as const;

/**
 * 產生牌組圖片。
 *
 * 回傳 null 代表這個瀏覽器不支援 canvas —— 呼叫端要據此提示使用者，
 * 不能假設一定成功。
 */
export async function renderDeckImage(
  deck: Deck,
  byId: Map<string, Card>,
  lang: TextLang,
  deckName: string,
  collection: Collection | null = null,
): Promise<Blob | null> {
  const rows = annotateRows(deck, byId, collection);

  // 先算出總高度，才能建立正確大小的畫布
  const groups: { zone: (typeof ZONES)[number]; entries: AnnotatedRow[] }[] = ZONES.map(
    (zone) => ({ zone, entries: rows.filter((r) => r.zone === zone) }),
  ).filter((g) => g.entries.length > 0);

  const bodyHeight = groups.reduce(
    (sum, g) => sum + LINE_HEIGHT + g.entries.length * LINE_HEIGHT + ZONE_GAP,
    0,
  );

  // 缺卡區塊：標題一行，加上每一種缺的卡一行
  const missing = collection ? rows.filter((r) => (r.short ?? 0) > 0) : [];
  const missingHeight = collection
    ? LINE_HEIGHT + Math.max(1, missing.length) * LINE_HEIGHT + ZONE_GAP
    : 0;

  const height = HEADER_HEIGHT + bodyHeight + missingHeight + FOOTER_HEIGHT + PADDING;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  // 背景
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, height);

  // 標題
  ctx.fillStyle = COLORS.heading;
  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillText(truncate(ctx, deckName, WIDTH - PADDING * 2), PADDING, PADDING);

  ctx.fillStyle = COLORS.dim;
  ctx.font = `13px ${FONT_STACK}`;
  const totalMain = rows
    .filter((r) => r.zone === 'main')
    .reduce((sum, r) => sum + r.qty, 0);
  const summary = collection ? shortSummary(rows) : null;
  const subtitle =
    summary === null
      ? `主牌組 ${totalMain} 張`
      : summary.cards === 0
        ? `主牌組 ${totalMain} 張　·　已湊齊`
        : `主牌組 ${totalMain} 張　·　還缺 ${summary.cards} 張（${summary.kinds} 種）`;
  ctx.fillText(subtitle, PADDING, PADDING + 34);

  // 分隔線
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, HEADER_HEIGHT - 12);
  ctx.lineTo(WIDTH - PADDING, HEADER_HEIGHT - 12);
  ctx.stroke();

  // 各區域
  let y = HEADER_HEIGHT + 8;
  for (const { zone, entries } of groups) {
    const total = entries.reduce((sum, r) => sum + r.qty, 0);

    ctx.fillStyle = COLORS.accent;
    ctx.font = `600 15px ${FONT_STACK}`;
    ctx.fillText(`${zoneLabel(zone, lang)}　${total}`, PADDING, y);
    y += LINE_HEIGHT;

    for (const { card, qty, owned, short } of entries) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = `13px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${qty}`, PADDING + 24, y + 2);
      ctx.textAlign = 'left';

      ctx.fillStyle = COLORS.text;
      ctx.font = `14px ${FONT_STACK}`;
      const name = cardName(card, lang);
      const nameWidth = WIDTH - PADDING * 2 - (collection ? 250 : 150);
      ctx.fillText(truncate(ctx, name, nameWidth), PADDING + 36, y);

      // 缺卡用警示色標出來，湊齊的就不加雜訊
      if (short !== null && short > 0) {
        ctx.fillStyle = COLORS.warn;
        ctx.font = `12px ${FONT_STACK}`;
        ctx.textAlign = 'right';
        ctx.fillText(`有 ${owned} · 缺 ${short}`, WIDTH - PADDING - 96, y + 2);
        ctx.textAlign = 'left';
      }

      ctx.fillStyle = COLORS.dim;
      ctx.font = `12px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      ctx.fillText(card.code, WIDTH - PADDING, y + 2);
      ctx.textAlign = 'left';

      y += LINE_HEIGHT;
    }
    y += ZONE_GAP;
  }

  // 缺卡清單：和牌表放在同一張圖，帶去卡店只要看這一張
  if (collection) {
    ctx.fillStyle = COLORS.warn;
    ctx.font = `600 15px ${FONT_STACK}`;
    ctx.fillText(MISSING_HEADING[lang], PADDING, y);
    y += LINE_HEIGHT;

    if (missing.length === 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = `13px ${FONT_STACK}`;
      ctx.fillText(ALL_OWNED[lang], PADDING, y);
      y += LINE_HEIGHT;
    } else {
      for (const row of missing) {
        ctx.fillStyle = COLORS.warn;
        ctx.font = `13px ${FONT_STACK}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${row.short}`, PADDING + 24, y + 2);
        ctx.textAlign = 'left';

        ctx.fillStyle = COLORS.text;
        ctx.font = `14px ${FONT_STACK}`;
        const label = cardName(row.card, lang);
        ctx.fillText(truncate(ctx, label, WIDTH - PADDING * 2 - 250), PADDING + 36, y);

        ctx.fillStyle = COLORS.dim;
        ctx.font = `12px ${FONT_STACK}`;
        ctx.textAlign = 'right';
        ctx.fillText(`已有 ${row.owned}`, WIDTH - PADDING - 96, y + 2);
        ctx.fillText(row.card.code, WIDTH - PADDING, y + 2);
        ctx.textAlign = 'left';

        y += LINE_HEIGHT;
      }
    }
    y += ZONE_GAP;
  }

  // 頁尾：標明出處與規則版本，方便別人查證
  ctx.fillStyle = COLORS.dim;
  ctx.font = `11px ${FONT_STACK}`;
  ctx.fillText(
    `符文戰場資料庫 · 規則依據：${RULES_VERSION.document} ${RULES_VERSION.updated}`,
    PADDING,
    height - PADDING,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** 文字太長時截斷加省略號，避免超出畫布。 */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** 下載 Blob。與 downloadText 同樣使用 blob URL。 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
