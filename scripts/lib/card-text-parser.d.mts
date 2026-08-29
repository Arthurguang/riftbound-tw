/**
 * card-text-parser.mjs 的型別宣告。
 *
 * 解析器本身刻意用純 JavaScript 撰寫，因為它要在建置腳本裡直接執行
 * （不經過任何編譯步驟 —— 少一個環節就少一個可能出錯的地方）。
 * 這份宣告讓 TypeScript 端（測試與型別檢查）也能看到它的契約。
 *
 * 這裡的型別必須與 src/lib/types.ts 保持一致，
 * tests/unit/card-data.test.ts 會驗證實際產出的資料兩邊都符合。
 */

export type ParsedTextNode =
  | { type: 'text'; value: string }
  | { type: 'break' }
  | { type: 'glyph'; id: string }
  | { type: 'keyword'; name: string; value?: number };

export type ParsedTextBlock =
  | { kind: 'paragraph'; tokens: ParsedTextNode[] }
  | { kind: 'list'; items: ParsedTextNode[][] };

export declare const ALLOWED_GLYPHS: readonly string[];
export declare const ALLOWED_KEYWORDS: readonly string[];

export declare class CardTextError extends Error {
  constructor(message: string, context?: string);
}

/**
 * 把官方 API 的能力文字 HTML 解析成結構化 token。
 *
 * @throws {CardTextError} 遇到任何非預期的標籤、屬性、實體、符號或關鍵字
 */
export declare function parseCardText(
  html: string | null | undefined,
): ParsedTextBlock[];
