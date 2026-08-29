/**
 * 卡牌資料的存取層。
 *
 * 資料是建置階段產生的靜態 JSON（見 scripts/fetch-cards.mjs），
 * 網站執行期不會對外發任何請求。
 */

import cardsJson from '@/data/cards.origins.json';
import taxonomyJson from '@/data/taxonomy.json';
import type { Card, CardTextBlock, CardTextNode, Taxonomy } from './types';
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

/** 找出同名的其他卡（例如不同稀有度的變體版本）。 */
export function getVariants(card: Card): Card[] {
  return ALL_CARDS.filter((other) => other.id !== card.id && other.name === card.name);
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
  if (lang === 'zh-CN') return card.zh.cn?.subtitle ?? null;
  if (lang === 'zh-TW') return card.zh.tw?.subtitle ?? null;
  // 英文版的副標本來就寫在卡名裡（"Ahri, Alluring"），不另外拆分。
  return null;
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
 * 產生卡圖的縮圖網址。
 *
 * 兩個官方 CDN 都支援即時轉檔，但語法不同：
 *   英文（Riot Sanity）    ?w=420&fm=webp&q=78          744×1039 PNG → 約 30KB WebP
 *   簡中（Tencent COS）    ?imageMogr2/thumbnail/420x/  約 200KB PNG → 約 37KB WebP
 *
 * 網域已在建置階段驗證過必須是官方 CDN，這裡只是加上參數。
 */
export function cardImageUrl(card: Card, width: number, art: ArtLang = 'en'): string {
  if (resolveArtLang(card, art) === 'zh-CN') {
    // Tencent COS 的處理參數不是標準查詢字串，必須直接接在網址後面。
    return `${card.zh.cn!.image}?imageMogr2/thumbnail/${width}x/format/webp/quality/80`;
  }
  const url = new URL(card.image.url);
  url.searchParams.set('w', String(width));
  url.searchParams.set('fm', 'webp');
  url.searchParams.set('q', '78');
  return url.toString();
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
