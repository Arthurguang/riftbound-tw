/**
 * 卡牌資料的存取層。
 *
 * 資料是建置階段產生的靜態 JSON（見 scripts/fetch-cards.mjs），
 * 網站執行期不會對外發任何請求。
 */

import cardsJson from '@/data/cards.origins.json';
import taxonomyJson from '@/data/taxonomy.json';
import type { Card, CardTextBlock, CardTextNode, Taxonomy } from './types';
// 純函式放在沒有資料相依的檔案（見 card-name.ts 開頭），這裡轉出去方便既有呼叫端
export { fullCardName } from './card-name';
import { fullCardName } from './card-name';
import type { ArtLang, TextLang } from './i18n';

/*
 * JSON 匯入的推導型別過於寬鬆（例如 string 而非 union），
 * 這裡明確轉成專案型別。
 *
 * 這個轉型是安全的，因為資料已經在建置階段被 scripts/fetch-cards.mjs
 * 逐欄位驗證過（任何不符合允許清單的值都會讓建置失敗），
 * 而且 tests/card-data.test.ts 會再次驗證產出的 JSON 符合這些型別。
 */
export const ALL_CARDS = cardsJson as unknown as Card[];
export const TAXONOMY = taxonomyJson as unknown as Taxonomy;

const BY_ID = new Map(ALL_CARDS.map((card) => [card.id, card]));

export function getCardById(id: string): Card | undefined {
  return BY_ID.get(id);
}

/**
 * 找出同一張卡的其他版本（異畫、超框、再版）。
 *
 * 比的是**完整卡名**：2026-10-13 起官方把英文卡名拆成 name + subtitle，
 * 只比 name 的話「Ahri, Alluring」會跟其他五張不同的阿璃卡被當成同一張。
 */
export function getVariants(card: Card): Card[] {
  const full = fullCardName(card);
  return ALL_CARDS.filter((other) => other.id !== card.id && fullCardName(other) === full);
}

/** 把能力文字的 token 攤平成純文字，供搜尋比對使用。 */
export function cardTextToPlain(blocks: CardTextBlock[]): string {
  const fromTokens = (tokens: CardTextNode[]): string =>
    tokens
      .map((token) => {
        switch (token.type) {
          case 'text':
            return token.value;
          case 'keyword':
            return token.value === undefined ? token.name : `${token.name} ${token.value}`;
          case 'glyph':
            return token.id;
          case 'break':
            return ' ';
        }
      })
      .join('');

  return blocks
    .map((block) =>
      block.kind === 'paragraph'
        ? fromTokens(block.tokens)
        : block.items.map(fromTokens).join(' '),
    )
    .join(' ');
}

// ─── 多語系存取 ──────────────────────────────────────────────────────────

/** 取這張卡在指定語言的名稱。中文資料缺漏時自動退回英文。 */
export function cardName(card: Card, lang: TextLang): string {
  if (lang === 'zh-CN') return card.zh.cn?.name ?? card.name;
  if (lang === 'zh-TW') return card.zh.tw?.name ?? card.name;
  return card.name;
}

/** 冠軍卡的副標（例如 Ahri, **Alluring**）。 */
export function cardSubtitle(card: Card, lang: TextLang): string | null {
  /*
   * 2026-10-13 起官方英文資料也把副標拆出來了（以前寫在卡名裡）。
   *
   * 中文資料整個缺的時候要退回英文副標，跟卡名的退回規則一致 ——
   * 否則新系列的六張阿璃在中文介面上會全部顯示成「Ahri」，分不出是哪一張。
   * 中文資料有、但那張卡本來就沒有副標（一般單位、法術）時才是 null。
   */
  if (lang === 'zh-CN') return card.zh.cn === null ? card.subtitle : card.zh.cn.subtitle;
  if (lang === 'zh-TW') return card.zh.tw === null ? card.subtitle : card.zh.tw.subtitle;
  return card.subtitle;
}

export function cardText(card: Card, lang: TextLang): CardTextBlock[] {
  if (lang === 'zh-CN') return card.zh.cn?.text ?? card.text;
  if (lang === 'zh-TW') return card.zh.tw?.text ?? card.text;
  return card.text;
}

/** 背景敘述。英文版官方資料沒有提供，只有中文版有。 */
export function cardFlavor(card: Card, lang: TextLang): string | null {
  if (lang === 'zh-CN') return card.zh.cn?.flavor ?? null;
  if (lang === 'zh-TW') return card.zh.tw?.flavor ?? null;
  return null;
}

/** 這張卡在此語言下，能力文字是否為簡轉繁（用於介面上誠實標示）。 */
export function isConvertedText(card: Card, lang: TextLang): boolean {
  return lang === 'zh-TW' && card.zh.tw?.textSource === 'converted';
}

// ─── 卡圖 ────────────────────────────────────────────────────────────────

/** 這張卡在指定卡面語言下是否有圖。簡中卡面偶爾會缺，缺就退回英文。 */
export function resolveArtLang(card: Card, art: ArtLang): ArtLang {
  if (art === 'zh-CN' && !card.zh.cn?.image) return 'en';
  return art;
}

/**
 * 卡圖存下來的三種寬度（由 scripts/download-card-images.mjs 在建置前下載）。
 * 要改這裡的話，腳本裡的 WIDTHS 也要一起改。
 */
const STORED_WIDTHS = [160, 420, 900] as const;

/** 挑「不小於需求」的最小一個：縮小不會糊，放大會。 */
function storedWidth(width: number): number {
  return STORED_WIDTHS.find((stored) => stored >= width) ?? 900;
}

/**
 * 產生卡圖網址 —— 指向本站，不是官方 CDN。
 *
 * 2026-09-12 改為自行代管（原本是直接給瀏覽器官方 CDN 的網址）：
 *   1. 官方改網址不會讓全站卡圖一起破
 *   2. 使用者的瀏覽器不再連到第三方伺服器
 *   3. CSP 的 img-src 因此收斂成只有 'self'，白名單少兩個外部網域
 *   4. 畫布不再被跨網域污染（牌組圖以後要放卡圖才有可能）
 *
 * 素材來源仍然是官方 —— Riot 政策要求如此，我們只是改由本站轉發。
 * 詳細頁的「開啟原圖」仍然連到官方網址（見 cardImageOriginal），那是引用出處。
 */
export function cardImageUrl(card: Card, width: number, art: ArtLang = 'en'): string {
  return `/cards/${resolveArtLang(card, art)}/${card.id}-${storedWidth(width)}.webp`;
}

/** 原始尺寸的官方卡圖網址（詳細頁的「開啟原圖」用）。 */
export function cardImageOriginal(card: Card, art: ArtLang = 'en'): string {
  return resolveArtLang(card, art) === 'zh-CN' ? card.zh.cn!.image! : card.image.url;
}

/** 圖片的替代文字：英文卡面用官方無障礙描述，中文卡面用中文卡名。 */
export function cardImageAlt(card: Card, lang: TextLang = 'en', art: ArtLang = 'en'): string {
  if (resolveArtLang(card, art) === 'en' && card.image.alt) return card.image.alt;
  const name = cardName(card, lang);
  const subtitle = cardSubtitle(card, lang);
  return `${name}${subtitle ? `・${subtitle}` : ''}（${card.code}）`;
}

