/**
 * 卡牌能力文字解析器 —— 本專案最重要的資安元件。
 *
 * 官方 API 回傳的能力文字是 HTML 字串，例如：
 *   "<p>[Reaction] (Play any time...)<br />Counter a spell.</p>"
 *   "<p>Choose one —</p><ul><li>Draw 1.</li><li>Ready me.</li></ul>"
 *
 * 我們「絕對不把 HTML 字串帶進網站」。這支解析器在建置階段把它拆成
 * 結構化的 token，前端只渲染 token，因此完全不需要
 * dangerouslySetInnerHTML，也不需要任何 HTML 消毒套件。
 *
 * 設計原則：FAIL-CLOSED（遇到任何預期外的東西就 throw，讓建置失敗）。
 * 寧可讓建置壞掉，也不要讓不明內容悄悄上線。
 * 就算 Riot 的 CMS 哪天被入侵而回傳惡意 HTML，這裡會直接爆炸。
 *
 * 已盤點官方 Origins 系列全部 376 張卡的能力文字，實際只用到四種標籤：
 *   <p>(712 次)  <br />(177 次)  <ul>(4 次)  <li>(14 次)
 * 且完全沒有使用 HTML 實體。允許清單就是照這個結果訂的。
 */

/** 允許出現在能力文字裡的符號（:rb_xxx: 形式）。未列出的一律拒絕。 */
export const ALLOWED_GLYPHS = Object.freeze([
  'might',
  'exhaust',
  'energy_0',
  'energy_1',
  'energy_2',
  'energy_3',
  'energy_4',
  'energy_5',
  'rune_body',
  'rune_calm',
  'rune_chaos',
  'rune_fury',
  'rune_mind',
  'rune_order',
  'rune_rainbow',
]);

/** 允許出現在方括號裡的關鍵字（[Assault]、[Shield 2] 等）。未列出的一律拒絕。 */
export const ALLOWED_KEYWORDS = Object.freeze([
  'Accelerate',
  'Action',
  'Add',
  'Assault',
  'Deathknell',
  'Deflect',
  'Ganking',
  'Hidden',
  'Legion',
  'Mighty',
  'Reaction',
  'Shield',
  'Tank',
  'Temporary',
  'Vision',
]);

/**
 * 允許的 HTML 實體。
 * 目前官方資料一個都沒用到，但先列出常見的幾個；
 * 未列出的具名實體一律拒絕，這樣官方哪天新增用法我們會立刻知道。
 */
const ALLOWED_ENTITIES = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
});

const GLYPH_SET = new Set(ALLOWED_GLYPHS);
const KEYWORD_SET = new Set(ALLOWED_KEYWORDS);

export class CardTextError extends Error {
  constructor(message, context) {
    super(context ? `${message}\n  來源片段: ${JSON.stringify(context)}` : message);
    this.name = 'CardTextError';
  }
}

/**
 * 解析 HTML 實體。只認允許清單裡的實體。
 * 注意：解碼後即使出現 "<" 也完全安全，因為它只是純文字，
 * 最終由 React 以文字節點輸出（React 會自動跳脫）。
 */
function decodeEntities(text) {
  const suspicious = text.match(/&[#a-zA-Z0-9]+;/g) ?? [];
  for (const entity of suspicious) {
    if (!(entity in ALLOWED_ENTITIES)) {
      throw new CardTextError(`出現未知的 HTML 實體 "${entity}"`, text);
    }
  }
  // 落單的 "&"（沒有分號結尾）不是實體，直接當純文字保留。
  return text.replace(/&[#a-zA-Z0-9]+;/g, (m) => ALLOWED_ENTITIES[m]);
}

/** 把一段純文字（已確認不含任何標籤）切成 text / glyph / keyword token。 */
function tokenizeSegment(segment, out) {
  const pattern = /:([a-zA-Z0-9_]+):|\[([^\]]*)\]/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(segment)) !== null) {
    if (match.index > cursor) {
      out.push({ type: 'text', value: segment.slice(cursor, match.index) });
    }

    if (match[1] !== undefined) {
      // :rb_might: 形式的符號
      const raw = match[1];
      if (!raw.startsWith('rb_')) {
        throw new CardTextError(`符號 ":${raw}:" 沒有預期的 "rb_" 前綴`, segment);
      }
      const id = raw.slice(3);
      if (!GLYPH_SET.has(id)) {
        throw new CardTextError(
          `出現未知的符號 ":${raw}:"（允許清單：${ALLOWED_GLYPHS.join(', ')}）`,
          segment,
        );
      }
      out.push({ type: 'glyph', id });
    } else {
      // [Assault] / [Shield 2] 形式的關鍵字
      const inner = match[2];
      const kw = /^([A-Z][A-Za-z]*)(?: (\d+))?$/.exec(inner);
      if (!kw) {
        throw new CardTextError(`方括號內容 "[${inner}]" 不是合法的關鍵字格式`, segment);
      }
      const [, name, value] = kw;
      if (!KEYWORD_SET.has(name)) {
        throw new CardTextError(
          `出現未知的關鍵字 "[${inner}]"（允許清單：${ALLOWED_KEYWORDS.join(', ')}）`,
          segment,
        );
      }
      out.push(
        value === undefined
          ? { type: 'keyword', name }
          : { type: 'keyword', name, value: Number(value) },
      );
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < segment.length) {
    out.push({ type: 'text', value: segment.slice(cursor) });
  }
}

/**
 * 解析一段行內內容（<p> 或 <li> 的內層）。
 * 這是整個解析器的核心防線。
 */
function parseInline(inner) {
  // 唯一允許的行內標籤是 <br>。先把它切開⋯⋯
  const segments = inner.split(/<br\s*\/?>/);

  // ⋯⋯切完之後，任何剩下的 "<" 或 ">" 都代表有未預期的標籤，直接拒絕。
  // <img onerror=…>、<script>、<svg onload=…>、<a href="javascript:…">
  // 全部會在這一行被擋下。
  for (const segment of segments) {
    if (segment.includes('<') || segment.includes('>')) {
      throw new CardTextError('出現未允許的 HTML 標籤或角括號', segment.slice(0, 120));
    }
  }

  const tokens = [];
  segments.forEach((segment, index) => {
    if (index > 0) tokens.push({ type: 'break' });
    tokenizeSegment(decodeEntities(segment), tokens);
  });

  // 去掉空的文字 token，讓輸出乾淨一點。
  return tokens.filter((t) => t.type !== 'text' || t.value !== '');
}

/** 從 rest 的開頭取出 <tag>…</tag> 的內層，並回傳剩餘字串。 */
function takeBlock(rest, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  if (!rest.startsWith(open)) return null;
  const end = rest.indexOf(close, open.length);
  if (end === -1) throw new CardTextError(`找不到對應的 ${close}`, rest.slice(0, 120));
  return { inner: rest.slice(open.length, end), rest: rest.slice(end + close.length).trim() };
}

/**
 * 解析一整段卡牌能力文字 HTML。
 *
 * @param {string | null | undefined} html 官方 API 的 text.richText.body
 * @returns {Array<{kind: 'paragraph', tokens: object[]} | {kind: 'list', items: object[][]}>}
 * @throws {CardTextError} 遇到任何非預期的標籤、屬性、實體、符號或關鍵字
 */
export function parseCardText(html) {
  if (html === null || html === undefined || html === '') return [];
  if (typeof html !== 'string') {
    throw new CardTextError(`能力文字必須是字串，收到 ${typeof html}`);
  }

  const blocks = [];
  let rest = html.trim();

  // 整份內容必須完全由 <p>…</p> 與 <ul>…</ul> 區塊組成，不能有任何殘留。
  while (rest.length > 0) {
    const paragraph = takeBlock(rest, 'p');
    if (paragraph) {
      blocks.push({ kind: 'paragraph', tokens: parseInline(paragraph.inner) });
      rest = paragraph.rest;
      continue;
    }

    const list = takeBlock(rest, 'ul');
    if (list) {
      const items = [];
      let listRest = list.inner.trim();
      while (listRest.length > 0) {
        const item = takeBlock(listRest, 'li');
        if (!item) {
          throw new CardTextError('<ul> 內只允許 <li> 項目', listRest.slice(0, 120));
        }
        items.push(parseInline(item.inner));
        listRest = item.rest;
      }
      if (items.length === 0) throw new CardTextError('<ul> 內沒有任何 <li> 項目');
      blocks.push({ kind: 'list', items });
      rest = list.rest;
      continue;
    }

    throw new CardTextError(
      '內容必須完全由 <p>…</p> 或 <ul><li>…</li></ul> 組成',
      rest.slice(0, 120),
    );
  }

  return blocks;
}
