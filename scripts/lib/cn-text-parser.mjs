/**
 * 官方簡體中文能力文字的解析器。
 *
 * 與英文版不同，官方簡中 API 回傳的是「純文字」而不是 HTML，格式像這樣：
 *   "{{迅捷}}（在你的回合或对峙中使用。）\n对一个战场上的单位造成 2 点伤害。"
 *
 * 也就是說它本來就沒有 HTML 可以夾帶惡意標籤。即便如此，我們仍然套用
 * 與英文版相同的 FAIL-CLOSED 原則：
 *   1. 出現任何角括號一律拒絕（純文字不該有 HTML）。
 *   2. {{...}} 裡的 token 必須在允許清單內，否則建置失敗。
 *
 * 輸出格式與英文版完全相同（CardTextBlock[]），所以前端的渲染元件
 * 不需要為了中文再寫一套。
 */

import { GLYPH_BY_CN_TOKEN, KEYWORD_BY_CN } from './taxonomy-map.mjs';

export class CnTextError extends Error {
  constructor(message, context) {
    super(context ? `${message}\n  來源片段: ${JSON.stringify(context)}` : message);
    this.name = 'CnTextError';
  }
}

/**
 * 解析 {{...}} 內容。
 * 可能是符號（{{S}}、{{红色}}）或關鍵字（{{强攻2}} = Assault 2）。
 */
function parseToken(raw, context) {
  if (Object.hasOwn(GLYPH_BY_CN_TOKEN, raw)) {
    return { type: 'glyph', id: GLYPH_BY_CN_TOKEN[raw] };
  }

  // 關鍵字可能帶數值，例如 {{强攻2}}、{{法盾2}}、{{坚守3}}
  const m = /^(.+?)(\d+)?$/.exec(raw);
  const base = m?.[1] ?? raw;
  const value = m?.[2];

  if (Object.hasOwn(KEYWORD_BY_CN, base)) {
    const name = KEYWORD_BY_CN[base];
    return value === undefined
      ? { type: 'keyword', name, cn: base }
      : { type: 'keyword', name, value: Number(value), cn: base };
  }

  throw new CnTextError(
    `出現未知的簡中 token "{{${raw}}}"。` +
      `\n  若官方新增了關鍵字或符號，請更新 scripts/lib/taxonomy-map.mjs 的允許清單。`,
    context,
  );
}

/**
 * 解析官方簡中能力文字。
 *
 * @param {string | null | undefined} text 官方 API 的 cardEffect
 * @returns {Array<{kind:'paragraph', tokens: object[]}>}
 * @throws {CnTextError}
 */
export function parseCnText(text) {
  if (text === null || text === undefined || text === '') return [];
  if (typeof text !== 'string') {
    throw new CnTextError(`能力文字必須是字串，收到 ${typeof text}`);
  }

  // 純文字裡不該出現角括號。出現就代表格式變了，或有人試圖夾帶 HTML。
  if (text.includes('<') || text.includes('>')) {
    throw new CnTextError('簡中能力文字不應含有角括號', text.slice(0, 120));
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const tokens = [];
      let cursor = 0;
      const pattern = /\{\{([^}]*)\}\}/g;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        if (match.index > cursor) {
          tokens.push({ type: 'text', value: line.slice(cursor, match.index) });
        }
        tokens.push(parseToken(match[1], line));
        cursor = pattern.lastIndex;
      }
      if (cursor < line.length) {
        tokens.push({ type: 'text', value: line.slice(cursor) });
      }

      return { kind: 'paragraph', tokens };
    });
}

/**
 * 把已解析的 token 逐字轉成繁體。
 *
 * 只轉換文字節點；符號與關鍵字的英文代碼保持不變。
 * @param {Array} blocks parseCnText 的輸出
 * @param {(s: string) => string} convert 簡轉繁函式
 */
export function convertBlocksToTraditional(blocks, convert) {
  return blocks.map((block) => ({
    kind: block.kind,
    tokens: block.tokens.map((token) =>
      token.type === 'text' ? { type: 'text', value: convert(token.value) } : token,
    ),
  }));
}
