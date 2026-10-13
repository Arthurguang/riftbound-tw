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
 * 解析 {{...}} 內容，回傳一個或多個 token。
 *
 * 舊系列的寫法單純：{{S}}（符號）、{{强攻2}}（關鍵字＋數值）。
 * 2026-10-13 的四個新系列把好幾樣東西黏在同一組大括號裡：
 *
 *   {{装配绿色}}    關鍵字 ＋ 符號
 *   {{强化3橙色}}   關鍵字 ＋ 數值 ＋ 符號
 *   {{已强化>}}     關鍵字 ＋ 依賴箭頭（英文是分開的 [Empowered][>]）
 *   {{等级6>}}      關鍵字 ＋ 數值 ＋ 箭頭
 *
 * 所以改成「從左到右逐段吃掉」：每一步取最長匹配的關鍵字或符號，
 * 吃不掉的殘留一律丟錯 —— fail-closed 的原則不變。
 *
 * @param {string} raw      大括號裡的內容
 * @param {string} context  整行文字，錯誤訊息用
 * @param {{domains?: string[]}} card  這張卡的流派，解析 {{C}} 時需要
 * @returns {object[]}
 */
function parseTokenGroup(raw, context, card = {}) {
  const out = [];
  let rest = raw;

  // 結尾的箭頭：{{已强化>}}、{{等级6>}}
  let arrow = '';
  const arrowMatch = /(>{1,2})$/.exec(rest);
  if (arrowMatch) {
    arrow = arrowMatch[1] === '>' ? ' ▸' : ' ▸▸';
    rest = rest.slice(0, -arrowMatch[1].length);
  }

  const keywordKeys = Object.keys(KEYWORD_BY_CN).sort((a, b) => b.length - a.length);
  const glyphKeys = Object.keys(GLYPH_BY_CN_TOKEN).sort((a, b) => b.length - a.length);

  while (rest.length > 0) {
    const before = rest;

    const keyword = keywordKeys.find((k) => rest.startsWith(k));
    if (keyword) {
      rest = rest.slice(keyword.length);
      const value = /^(\d+)/.exec(rest)?.[1];
      if (value !== undefined) rest = rest.slice(value.length);
      out.push(
        value === undefined
          ? { type: 'keyword', name: KEYWORD_BY_CN[keyword], cn: keyword }
          : { type: 'keyword', name: KEYWORD_BY_CN[keyword], value: Number(value), cn: keyword },
      );
      continue;
    }

    /*
     * {{C}}：卡面上用一個泛用符號代表「這張卡自己的流派符能」。
     * 英文版同一處印的是實際的符文圖示（例如狂怒卡印 :rb_rune_fury:），
     * 規則書 §135.2.e 也說明 [C] 的符能部分要用該卡的流派支付。
     * 所以單流派的卡就用那個流派的符文；雙流派無法指定單一個，用彩色（任意）符文。
     */
    if (rest.startsWith('C')) {
      rest = rest.slice(1);
      const domains = card.domains ?? [];
      const id = domains.length === 1 ? `rune_${domains[0]}` : 'rune_rainbow';
      out.push({ type: 'glyph', id });
      continue;
    }

    const glyph = glyphKeys.find((k) => rest.startsWith(k));
    if (glyph) {
      rest = rest.slice(glyph.length);
      out.push({ type: 'glyph', id: GLYPH_BY_CN_TOKEN[glyph] });
      continue;
    }

    if (rest === before) break; // 這一輪什麼都吃不掉
  }

  if (rest.length > 0) {
    throw new CnTextError(
      `出現未知的簡中 token "{{${raw}}}"（卡在 "${rest}"）。` +
        `\n  若官方新增了關鍵字或符號，請更新 scripts/lib/taxonomy-map.mjs 的允許清單。`,
      context,
    );
  }

  if (arrow !== '') out.push({ type: 'text', value: arrow });
  return out;
}

/**
 * 解析 {{...}} 內容。
 * 可能是符號（{{S}}、{{红色}}）或關鍵字（{{强攻2}} = Assault 2）。
 */
function parseToken(raw, context) {
  /*
   * 「依賴型關鍵字」的箭頭標示（規則書 §135.2.e.7），格式「{{已强化}}{{>}} 效果文字」。
   * 官方英文與簡中都用同一個符號，共 113 張卡。不是關鍵字，解析成箭頭字元。
   * 與英文解析器的處理一致，見 card-text-parser.mjs。
   */
  if (raw === '>' || raw === '>>') {
    return { type: 'text', value: raw === '>' ? ' ▸' : ' ▸▸' };
  }

  /*
   * 簡中版的「這張卡沒有能力文字」佔位符，對應英文的 [NO TEXT]（18 處，全是異畫符文卡）。
   */
  if (raw === '无文本') {
    return { type: 'text', value: '' };
  }

  /*
   * 標籤，不是關鍵字。
   *
   * 簡中會把標籤也括起來（SFD-182「让你的[机械]属性单位…」），
   * 但英文版同一句寫成一般文字（"your Mech units"）。
   * 逐個列舉而不是「不認得就當文字」—— 後者會讓真正的新關鍵字被靜靜吞掉。
   */
  const CN_TAG_TOKENS = new Set(['机械']);
  if (CN_TAG_TOKENS.has(raw)) {
    return { type: 'text', value: raw };
  }

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

  return null; // 交給 parseTokenGroup 處理複合寫法
}

/**
 * 解析官方簡中能力文字。
 *
 * @param {string | null | undefined} text 官方 API 的 cardEffect
 * @returns {Array<{kind:'paragraph', tokens: object[]}>}
 * @throws {CnTextError}
 */
export function parseCnText(text, card = {}) {
  if (text === null || text === undefined || text === '') return [];
  if (typeof text !== 'string') {
    throw new CnTextError(`能力文字必須是字串，收到 ${typeof text}`);
  }

  // 純文字裡不該出現角括號。出現就代表格式變了，或有人試圖夾帶 HTML。
  /*
   * 純文字裡不該出現角括號 —— 唯一的例外是 {{已强化>}} 這種
   * 把依賴箭頭寫在大括號裡的新寫法（2026-10-13 的新系列開始出現）。
   * 所以檢查「大括號以外」的角括號，夾帶 HTML 仍然擋得住。
   */
  const outsideTokens = text.replace(/\{\{[^}]*\}\}/g, '');
  if (outsideTokens.includes('<') || outsideTokens.includes('>')) {
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
        const single = parseToken(match[1], line);
        if (single === null) tokens.push(...parseTokenGroup(match[1], line, card));
        else tokens.push(single);
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
