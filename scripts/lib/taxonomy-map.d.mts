/**
 * taxonomy-map.mjs 的型別宣告 —— 只宣告 TypeScript 端（單元測試）實際用到的部分。
 *
 * 跟 card-text-parser.d.mts 同一個理由：抓取腳本是純 .mjs、沒有建置步驟，
 * 測試要用到它的時候需要一份宣告。用到新的匯出時再補進來。
 */

/** 能力文字裡的關鍵字：簡中 token → 英文關鍵字。 */
export declare const KEYWORD_BY_CN: Readonly<Record<string, string>>;

/** 簡中能力文字裡被括起來、但其實是標籤的字（例如「机械」）。 */
export declare const CN_TAG_TOKENS: ReadonlySet<string>;
