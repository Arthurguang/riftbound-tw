/**
 * 從 Riot 官方公開內容 API 抓取 Riftbound 卡牌資料，
 * 驗證、正規化，然後輸出成靜態 JSON 供網站使用。
 *
 * 這支腳本只在「建置階段」執行，網站執行期完全不會呼叫外部 API。
 *
 * 資安設計：全程 FAIL-CLOSED。
 * 任何預期外的欄位、型別、標籤、符號、關鍵字都會讓建置失敗並停止，
 * 而不是靜默略過。寧可壞掉，也不要讓不明內容上線。
 *
 *   執行： npm run fetch:cards
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as OpenCC from 'opencc-js';
import { parseCardText, ALLOWED_GLYPHS } from './lib/card-text-parser.mjs';
import { parseCnText, convertBlocksToTraditional } from './lib/cn-text-parser.mjs';
import { fetchSimplifiedChinese, fetchTraditionalNames } from './lib/fetch-locales.mjs';
import {
  CN_TAG_TOKENS,
  DOMAIN_BY_CN_COLOR,
  GLYPH_BY_CN_TOKEN,
  KEYWORD_BY_CN,
  RARITY_BY_CN,
  SUBTYPE_BY_CN_CATEGORY,
  TAGS,
  TYPE_BY_CN_CATEGORY,
} from './lib/taxonomy-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── 設定 ────────────────────────────────────────────────────────────────

const API_BASE = 'https://content.publishing.riotgames.com';
const API_PATH =
  '/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards';
const PAGE_SIZE = 200;

/**
 * 收錄的系列。2026-10-13 起收錄官方 API 提供的全部六個系列。
 *
 * 官方在 2026 年陸續推出了四個新系列，而且**簡體中文資料也一起上線**了 ——
 * 以前簡中要另外去中國大陸發行商的站抓，現在 locale=zh_CN 就有，卡圖也在同一個圖床。
 */
/*
 * 收錄的系列，**依官方發售順序**（與 src/lib/types.ts 的 SET_IDS 一致）。
 * 這個順序會寫進 taxonomy.json 的 sets，決定篩選器的排列。
 * 原本是英文字母順序，害圖鑑的排序看起來毫無邏輯（第五代夾在第一、二代中間）。
 */
const WANTED_SETS = Object.freeze({
  OGN: 'Origins',
  OGS: 'Proving Grounds',
  SFD: 'Spiritforged',
  UNL: 'Unleashed',
  VEN: 'Vendetta',
  RAD: 'Radiance',
});

/**
 * 預期張數。對不上就代表官方改了東西，必須讓建置失敗以引起注意。
 *
 * ⚠️ 這些數字是**以卡片 id 去重之後**的數量。API 分頁會回傳重複項目，
 * 不去重的話同一個系列會多數出好幾張（2026-10-13 實測 OGN 會數成 353）。
 */
const EXPECTED_COUNTS = Object.freeze({
  OGN: 352,
  OGS: 24,
  /*
   * RAD 還在預覽期（2026-10-23 發售），官方陸續追加公開：
   *   10-13  192 張，9 張缺 cardType → 183
   *   10-15  219 張，13 張缺 cardType → 206
   */
  RAD: 206,
  SFD: 288,
  // UNL 官方 288 張，其中 2 張衍生物缺 cardType
  UNL: 286,
  VEN: 237,
});

const GLYPH_BASE =
  'https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest';

/**
 * 官方卡圖 CDN。只有這兩個網域會被寫進 CSP 的 img-src。
 *   en    ── Riot 全球官方（Sanity CDN），支援 ?w=&fm=webp 即時轉檔
 *   zh-CN ── 中國大陸官方發行商（Tencent COS），支援 ?imageMogr2/... 即時轉檔
 */
const IMAGE_HOST = 'cmsassets.rgpub.io';
const IMAGE_HOST_CN = 'cdn.playloltcg.com';

const ALLOWED_CARD_TYPES = Object.freeze([
  'unit', 'spell', 'legend', 'gear', 'battlefield', 'rune',
]);
const ALLOWED_RARITIES = Object.freeze([
  'common', 'uncommon', 'rare', 'epic', 'showcase',
]);
const ALLOWED_DOMAINS = Object.freeze([
  'calm', 'chaos', 'fury', 'body', 'mind', 'order', 'colorless',
]);

// ─── 小工具 ──────────────────────────────────────────────────────────────

class DataError extends Error {
  constructor(message, cardCode) {
    super(cardCode ? `[${cardCode}] ${message}` : message);
    this.name = 'DataError';
  }
}

function fail(message, cardCode) {
  throw new DataError(message, cardCode);
}

/** 取巢狀欄位，缺少就讓建置失敗。 */
function require_(value, path, cardCode) {
  if (value === undefined || value === null) fail(`缺少必要欄位 ${path}`, cardCode);
  return value;
}

function requireString(value, path, cardCode) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`欄位 ${path} 應為非空字串，實際為 ${JSON.stringify(value)}`, cardCode);
  }
  return value;
}

function requireInt(value, path, cardCode) {
  if (!Number.isInteger(value)) {
    fail(`欄位 ${path} 應為整數，實際為 ${JSON.stringify(value)}`, cardCode);
  }
  return value;
}

function requireOneOf(value, allowed, path, cardCode) {
  if (!allowed.includes(value)) {
    fail(`欄位 ${path} 的值 "${value}" 不在允許清單內（${allowed.join(', ')}）`, cardCode);
  }
  return value;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) fail(`API 回應 ${res.status} ${res.statusText}：${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    fail(`API 回應的 content-type 不是 JSON（實際為 "${contentType}"）：${url}`);
  }
  return res.json();
}

// ─── 卡牌正規化 ──────────────────────────────────────────────────────────

/**
 * 驗證並解析官方卡圖網址。
 * 只接受寫死的官方 CDN 網域，避免上游被竄改後把使用者導向任意網站。
 */
function normalizeImage(raw, cardCode) {
  const urlString = requireString(raw?.url, 'cardImage.url', cardCode);
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return fail(`cardImage.url 不是合法網址：${urlString}`, cardCode);
  }
  if (url.protocol !== 'https:') fail(`卡圖網址必須是 https：${urlString}`, cardCode);
  if (url.hostname !== IMAGE_HOST) {
    fail(`卡圖網址的網域 "${url.hostname}" 不是官方 CDN（預期 ${IMAGE_HOST}）`, cardCode);
  }
  return {
    url: url.toString(),
    width: requireInt(raw?.dimensions?.width, 'cardImage.dimensions.width', cardCode),
    height: requireInt(raw?.dimensions?.height, 'cardImage.dimensions.height', cardCode),
    // 官方提供的無障礙描述，直接當 alt 用。
    alt: typeof raw?.accessibilityText === 'string' ? raw.accessibilityText : null,
  };
}

/**
 * 從 publicCode 拆出卡號、特殊編號前綴與變體標記。
 *
 * 一般卡： "OGN-056/298"、"OGN-066a/298"，以及帶星號變體的 "OGN-304" 那一類
 * 特殊編號（2026-10-13 隨新系列出現，全部掃過共四種形狀）：
 *   "UNL-T01"      衍生物，沒有分母
 *   "VEN-R04"      符文，沒有分母
 *   "RAD-R04a"     符文的異畫版
 *   "VEN-SP3/006"  特別卡，分母是特別卡自己的總數
 */
function parsePublicCode(publicCode, setId, cardCode) {
  const m = /^([A-Z]{2,4})-(SP|T|R)?(\d{1,4})([a-z*]*)(?:\/(\d{1,4}))?$/.exec(publicCode);
  if (!m) fail(`publicCode 格式無法辨識："${publicCode}"`, cardCode);
  if (m[1] !== setId) {
    fail(`publicCode 的系列前綴 "${m[1]}" 與 set.value.id "${setId}" 不符`, cardCode);
  }
  return {
    number: Number(m[3]),
    codePrefix: m[2] ?? null,
    variant: m[4] === '' ? null : m[4],
  };
}

function normalizeCard(raw) {
  const publicCode = requireString(raw?.publicCode, 'publicCode', raw?.id);
  const code = publicCode;

  const id = requireString(raw?.id, 'id', code);
  // id 會直接變成網址的一部分，因此嚴格限制字元集。
  if (!/^[a-z0-9-]+$/.test(id)) fail(`id "${id}" 含有不允許的字元`, code);

  const setId = requireOneOf(
    require_(raw?.set?.value?.id, 'set.value.id', code),
    Object.keys(WANTED_SETS),
    'set.value.id',
    code,
  );

  const { number, codePrefix, variant } = parsePublicCode(publicCode, setId, code);

  const typeList = require_(raw?.cardType?.type, 'cardType.type', code);
  if (!Array.isArray(typeList) || typeList.length === 0) {
    fail('cardType.type 必須是非空陣列', code);
  }
  const types = typeList.map((t) =>
    requireOneOf(
      requireString(t?.id, 'cardType.type[].id', code),
      ALLOWED_CARD_TYPES,
      'cardType',
      code,
    ),
  );

  const domainList = require_(raw?.domain?.values, 'domain.values', code);
  if (!Array.isArray(domainList) || domainList.length === 0) {
    fail('domain.values 必須是非空陣列', code);
  }
  const domains = domainList.map((d) =>
    requireOneOf(requireString(d?.id, 'domain.values[].id', code), ALLOWED_DOMAINS, 'domain', code),
  );

  const rarity = requireOneOf(
    requireString(raw?.rarity?.value?.id, 'rarity.value.id', code),
    ALLOWED_RARITIES,
    'rarity',
    code,
  );

  const tagsRaw = raw?.tags?.tags ?? [];
  if (!Array.isArray(tagsRaw)) fail('tags.tags 必須是陣列', code);
  const tags = tagsRaw.map((t) => requireString(t, 'tags.tags[]', code));

  const orientation = requireOneOf(
    requireString(raw?.orientation, 'orientation', code),
    ['portrait', 'landscape'],
    'orientation',
    code,
  );

  const numericField = (field) => {
    const node = raw?.[field];
    if (node === undefined || node === null) return null;
    return requireInt(node?.value?.id, `${field}.value.id`, code);
  };

  const artistList = raw?.illustrator?.values ?? [];
  if (!Array.isArray(artistList)) fail('illustrator.values 必須是陣列', code);
  const artists = artistList.map((a) => requireString(a?.label, 'illustrator.values[].label', code));

  let text;
  try {
    text = parseCardText(raw?.text?.richText?.body);
  } catch (err) {
    fail(`能力文字解析失敗：${err.message}`, code);
  }

  return {
    id,
    code,
    number,
    codePrefix,
    variant,
    name: requireString(raw?.name, 'name', code),
    /*
     * 英雄卡的副標。
     *
     * 2026-10-13 發現官方把英文資料的卡名拆開了：
     * 以前 name 欄位直接寫「Annie, Fiery」，現在變成 name="Annie"、subtitle="Fiery"。
     *
     * 這件事不只是顯示問題 —— 全卡池有 145 個卡名被多張不同的卡共用
     * （六個阿璃、五個德萊文…），只靠 name 比對會對到錯的卡。
     * 禁卡表、勘誤表、牌表匯入匯出一律改用「卡名, 副標」的完整名稱，
     * 見 src/lib/cards.ts 的 fullCardName。
     */
    subtitle: typeof raw?.subtitle === 'string' && raw.subtitle !== '' ? raw.subtitle : null,
    set: setId,
    types,
    rarity,
    domains,
    tags,
    energy: numericField('energy'),
    might: numericField('might'),
    power: numericField('power'),
    orientation,
    text,
    artists,
    image: normalizeImage(raw?.cardImage, code),
  };
}

// ─── 符號圖示下載 ────────────────────────────────────────────────────────

/**
 * SVG 檔案本身可以夾帶腳本。雖然我們只用 img 標籤引用（瀏覽器不會執行其中的
 * 腳本），仍在下載時做一次內容檢查，任何可疑內容一律拒絕。
 */
function assertSafeSvg(svg, name) {
  const lowered = svg.toLowerCase();
  const forbidden = [
    '<script', '<foreignobject', '<iframe', '<embed', '<object',
    'javascript:', 'data:text/html', '<animate',
  ];
  for (const needle of forbidden) {
    if (lowered.includes(needle)) fail(`符號 ${name}.svg 含有不允許的內容 "${needle}"`);
  }
  if (/\son[a-z]+\s*=/i.test(svg)) fail(`符號 ${name}.svg 含有事件處理屬性（on*=）`);
  const head = lowered.trimStart();
  if (!head.startsWith('<?xml') && !head.startsWith('<svg')) {
    fail(`符號 ${name}.svg 的開頭不像 SVG`);
  }
}

async function downloadGlyphs() {
  const dir = join(ROOT, 'public', 'glyphs');
  await mkdir(dir, { recursive: true });
  for (const name of ALLOWED_GLYPHS) {
    const url = `${GLYPH_BASE}/${name}.svg`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) fail(`下載符號失敗 ${res.status}：${url}`);
    const svg = await res.text();
    assertSafeSvg(svg, name);
    await writeFile(join(dir, `${name}.svg`), svg, 'utf8');
  }
  console.log(`  ✓ 已下載並檢查 ${ALLOWED_GLYPHS.length} 個符號圖示 → public/glyphs/`);
}

// ─── 中文化 ──────────────────────────────────────────────────────────────

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

/**
 * 用簡中資料交叉驗證我們的對照表。
 *
 * taxonomy-map.mjs 裡的對照關係是從資料統計出來的，不是憑空猜測。
 * 這個函式在每次建置時重新驗證一遍 —— 只要官方哪天改了分類，建置就會失敗，
 * 而不是默默產生錯誤的中文標籤。
 */
/**
 * 兩個官方來源對不上的卡，以及最後採用的值。由 reconcileWithPublisher 累積，main() 最後一起判斷。
 *
 * ── 2026-10-16 改成「對不上時以發行商為準」────────────────────────
 * 原本的規則是以英文（Riot）為準。使用者回報「有些卡明明是紅色，卻顯示成紫色」，
 * 逐張對照**官方印刷卡圖**之後發現，對不上的時候錯的幾乎都是 Riot：
 *
 *   流派  19 張（全在 RAD）  卡圖顏色 19/19 跟發行商一致
 *         例：RAD-001 業餘爆破狂，卡圖紅色，Riot 寫渾沌（紫）
 *   卡種  23 張（全在 RAD）  卡圖印的類型 23/23 跟發行商一致
 *         例：RAD-007 Rally for War 卡上印 SPELL，Riot 寫裝備；
 *         Riot 寫「單位」的卡有好幾張沒有戰力（單位一定有戰力）
 *   費用   1 張（OGN-187）   卡圖印 4，Riot 寫 3
 *   標籤  多張                見 reconcileTags 的說明
 *
 * RAD 在 10/23 才發售，Riot 的資料是預覽期的，分類欄位顯然還沒整理好；
 * 但 OGN-187 是起源的卡，所以這不只是預覽期的問題。
 *
 * 比例過高（> 5%）仍然中斷 —— 那通常代表我們的對照表壞了，不是官方資料不一致。
 */
const domainDisagreements = [];
const typeDisagreements = [];
const statDisagreements = [];
const tagCorrections = [];

/** 發行商的數值欄位：數字或數字字串才算有值，其餘當作沒有。 */
function publisherNumber(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,2}$/.test(value)) return Number(value);
  return null;
}

/**
 * 跟中國大陸發行商的資料對照；對不上時改用發行商的值（理由見上方說明）。
 *
 * 只改「卡片屬性」：流派、卡種、費用、戰力、標籤。
 * 卡名、能力文字、稀有度、卡圖仍然以 Riot 為準 —— 那些兩邊沒有對不上的情況。
 */
function reconcileWithPublisher(card, cn, tagContext) {
  const code = card.code;

  const cnDomains = (cn.cardColorList ?? []).map((color) => {
    if (!Object.hasOwn(DOMAIN_BY_CN_COLOR, color)) {
      fail(`未知的簡中顏色 "${color}"，請更新 taxonomy-map.mjs`, code);
    }
    return DOMAIN_BY_CN_COLOR[color];
  });
  if (cnDomains.length > 0 && [...cnDomains].sort().join() !== [...card.domains].sort().join()) {
    domainDisagreements.push({ code, en: [...card.domains], cn: cnDomains });
    card.domains = ALLOWED_DOMAINS.filter((d) => cnDomains.includes(d));
  }

  const cnTypes = new Set(
    (cn.cardCategoryNameList ?? []).map((category) => {
      if (!Object.hasOwn(TYPE_BY_CN_CATEGORY, category)) {
        fail(`未知的簡中卡種 "${category}"，請更新 taxonomy-map.mjs`, code);
      }
      return TYPE_BY_CN_CATEGORY[category];
    }),
  );
  if (cnTypes.size > 0 && card.types.some((type) => !cnTypes.has(type))) {
    typeDisagreements.push({ code, en: [...card.types], cn: [...cnTypes] });
    card.types = ALLOWED_CARD_TYPES.filter((t) => cnTypes.has(t));
  }

  // 費用與戰力：兩邊都有值、而且不同時才改（發行商的 power 就是戰力）
  for (const [field, value] of [
    ['energy', publisherNumber(cn.energy)],
    ['might', publisherNumber(cn.power)],
  ]) {
    if (value !== null && card[field] !== null && card[field] !== value) {
      statDisagreements.push({ code, field, en: card[field], cn: value });
      card[field] = value;
    }
  }

  reconcileTags(card, cn, tagContext);

  if (!Object.hasOwn(RARITY_BY_CN, cn.rarityName)) {
    fail(`未知的簡中稀有度 "${cn.rarityName}"，請更新 taxonomy-map.mjs`, code);
  }
  // 稀有度只警告不中斷：官方兩邊對「異畫」的歸類偶有差異，不影響資料正確性。
  if (RARITY_BY_CN[cn.rarityName] !== card.rarity) {
    console.warn(`    ! ${code} 稀有度差異：英文 ${card.rarity} / 簡中 ${cn.rarityName}`);
  }
}

/** 簡中標籤 → 英文標籤代碼。比對時拿掉空白（「烈娜塔·戈拉斯克」有時中間有空格、有時沒有）。 */
const TAG_BY_CN = new Map(
  Object.entries(TAGS).map(([en, label]) => [label.cn.replace(/\s+/g, ''), en]),
);

/**
 * 發行商資料本身的筆誤，逐筆對照卡圖確認過（2026-10-16）。
 *
 *   精锐鸟类  RAD-075 卡上印「DEMACIA • ELITE • BIRD」——兩個標籤被合寫成一個
 *   巨神峰龙  RAD-092 卡上印「MOUNT TARGON • DRAGON」——地區欄位多打了「龙」
 *             （「龙」另外寫在標籤欄位，所以這裡只對應到巨神峰）
 *
 * 逐筆列舉而不是寫成模糊比對：新的筆誤要讓建置停下來，由人看過卡圖再加進來。
 */
const PUBLISHER_TAG_FIXES = Object.freeze({
  精锐鸟类: ['Elite', 'Bird'],
  巨神峰龙: ['Mount Targon'],
});

/**
 * Riot 資料裡已確認是錯的標籤：卡片上根本沒印。
 * 「Device」出現在 17 張 RAD 的裝備卡上，對照卡圖（例如 RAD-017 卡上只印 GEAR）全都沒有。
 */
const RIOT_BOGUS_TAGS = new Set(['Device']);

/**
 * 發行商的英雄／地區／其他標籤欄位，攤成英文標籤代碼。
 *
 * strict（預設）：認不得就中止建置 —— 用在本站實際收錄的卡上。
 * 非 strict：認不得就略過 —— 只用在 publisherTagContext 掃描**全部**發行商資料時，
 * 那裡面有本站沒收錄的卡（例如官方資料不全而跳過的 RAD-009，標籤寫成黏在一起的「约德尔人机械」），
 * 不該因為一張不會上站的卡讓整個建置停下來。
 */
function publisherTags(cn, code, strict = true) {
  const field = (value) =>
    typeof value === 'string'
      ? value
          .split('|')
          .map((s) => s.replace(/\s+/g, ''))
          .filter(Boolean)
          .flatMap((s) => {
            if (Object.hasOwn(PUBLISHER_TAG_FIXES, s)) return PUBLISHER_TAG_FIXES[s];
            const en = TAG_BY_CN.get(s);
            if (en) return [en];
            if (strict) {
              fail(`發行商標籤「${s}」不在對照表裡，請確認卡圖後補進 taxonomy-map.mjs 的 TAGS`, code);
            }
            return [];
          })
      : [];
  return { hero: field(cn.hero), region: field(cn.region), other: field(cn.tag) };
}

/**
 * 標籤（英雄名、地區、種族等）的合併規則。
 *
 * 標籤不能整個照搬某一邊 —— 對照卡圖之後，**兩邊各有錯**：
 *
 *   Riot 錯   RAD 大多數卡的標籤是空的；17 張多出卡上沒印的「Device」；
 *             OGN-235 卡瑪被標成「菲艾」；RAD-112 希格斯的地區寫成班德爾城（卡上印佐恩）；
 *             RAD 傳奇多了種族標籤（卡上只印英雄名）；SFD 一批英雄卡漏了地區
 *   發行商錯  SFD-086 世界地圖集漏了「裝備」（卡上印 GEAR • EQUIPMENT）
 *
 * 所以規則是**以發行商為主、補上 Riot 不衝突的部分**：
 *   英雄名  發行商有就用發行商的（取代 Riot 的），沒有才用 Riot 的
 *   地區    同上
 *   其他    兩邊合併，但傳奇只留發行商的（傳奇卡上只印英雄名），
 *           並拿掉已確認是錯的 Riot 標籤
 * 順序照卡面印的順序：英雄名 → 地區 → 其他。
 */
function reconcileTags(card, cn, { heroTags, regionTags }) {
  const pub = publisherTags(cn, card.code);
  const riotHero = card.tags.filter((t) => heroTags.has(t));
  const riotRegion = card.tags.filter((t) => regionTags.has(t) && !heroTags.has(t));
  const riotOther = card.tags.filter(
    (t) => !heroTags.has(t) && !regionTags.has(t) && !RIOT_BOGUS_TAGS.has(t),
  );

  const merged = [
    ...new Set([
      ...(pub.hero.length > 0 ? pub.hero : riotHero),
      ...(pub.region.length > 0 ? pub.region : riotRegion),
      ...pub.other,
      ...(card.types.includes('legend') ? [] : riotOther),
    ]),
  ];

  if ([...merged].sort().join() !== [...card.tags].sort().join()) {
    tagCorrections.push({ code: card.code, from: [...card.tags], to: merged });
  }
  card.tags = merged;
}

/**
 * 發行商資料裡出現過的英雄名與地區（攤成英文代碼）。
 * reconcileTags 靠它判斷 Riot 的某個標籤屬於哪一類 —— 從資料推出來，不另外維護名單。
 */
function publisherTagContext(publisherCards) {
  const heroTags = new Set();
  const regionTags = new Set();
  for (const cn of publisherCards) {
    const { hero, region } = publisherTags(cn, cn.cardNo ?? '?', false);
    for (const t of hero) heroTags.add(t);
    for (const t of region) regionTags.add(t);
  }
  return { heroTags, regionTags };
}

/** 產生簡中卡圖網址，並確認網域是官方 CDN。 */
function normalizeCnImage(url, code) {
  if (typeof url !== 'string' || url === '') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`簡中卡圖網址不合法：${url}`, code);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== IMAGE_HOST_CN) {
    fail(`簡中卡圖網域 "${parsed.hostname}" 不是官方 CDN（預期 ${IMAGE_HOST_CN}）`, code);
  }
  return parsed.toString();
}

/**
 * 標出每張卡的「英雄標籤」。
 *
 * 為什麼需要這個欄位：傳奇卡的英文 name 只有稱號（Hexplosives Expert），
 * 英雄名在 tags 裡，牌表上要寫成「Ziggs, Hexplosives Expert」。
 * 以前每張傳奇都剛好只有一個 tag，直接取 tags[0] 就對了；
 * 2026-10-13 的新系列出現兩個標籤的傳奇（["Yordle","Ziggs"]），
 * 取 tags[0] 會變成「Yordle, Hexplosives Expert」—— 錯的卡名。
 *
 * 怎麼判斷哪個標籤是英雄：官方的英雄單位卡就是「英雄名＋副標」的形狀
 *（Ahri / Alluring），所以卡池裡**有副標的單位卡的卡名**就是英雄名清單。
 * 這是從資料本身推出來的，不是另外維護一份名單。
 *
 * 任何一張傳奇判不出唯一的英雄標籤就中止建置 —— 寧可停下來，
 * 也不要讓匯出的牌表帶著錯的卡名流出去。
 */
function attachChampionTags(cards) {
  const championNames = new Set(
    cards.filter((c) => c.types.includes('unit') && c.subtitle !== null).map((c) => c.name),
  );

  const ambiguous = [];
  for (const card of cards) {
    const hits = card.tags.filter((tag) => championNames.has(tag));
    if (card.types.includes('legend') && hits.length !== 1) {
      ambiguous.push(`${card.code} ${card.name}（標籤 ${JSON.stringify(card.tags)} → ${hits.length} 個英雄）`);
    }
    card.championTag = hits.length === 1 ? hits[0] : null;
  }
  if (ambiguous.length > 0) {
    fail(
      `這些傳奇判不出唯一的英雄標籤，匯出的牌表會寫錯卡名：\n      ${ambiguous.join('\n      ')}`,
    );
  }
}

/** 把中文資料掛到卡片上。 */
function attachLocales(card, cn, twNames, tagContext) {
  /*
   * 沒有簡中資料時，subtype 要明確給 null，不能漏掉這個欄位
   * （漏掉會讓 JSON 裡整個鍵不見，型別上說好一定有）。
   *
   * ⚠️ 連帶的限制：細分身分（英雄／專屬／衍生物）目前只能從簡中分類判斷，
   * 所以官方簡中還沒收錄的新卡會是 null，牌組合法性檢查對那些卡無法判斷。
   * 要解決得改用官方 API 的 zh_CN 語系當來源（涵蓋全部系列），列為後續工作。
   */
  if (!cn) return { cn: null, tw: null, subtype: null };

  reconcileWithPublisher(card, cn, tagContext);

  const cnText = parseCnText(cn.cardEffect, card);
  const cnName = requireString(cn.cardName, 'cardName', card.code);
  const cnSubtitle = typeof cn.subTitle === 'string' && cn.subTitle !== '' ? cn.subTitle : null;
  const cnFlavor = typeof cn.flavorText === 'string' && cn.flavorText !== '' ? cn.flavorText : null;


  /*
   * 細分類型（英雄單位／專屬卡／指示物）只有官方簡中資料有，
   * 但牌組合法性檢查需要它 —— 見 taxonomy-map.mjs 的 SUBTYPE_BY_CN_CATEGORY。
   * 一張卡最多只會有一種細分身分。
   */
  const subtypes = [
    ...new Set(
      (cn.cardCategoryNameList ?? [])
        .map((category) => SUBTYPE_BY_CN_CATEGORY[category])
        .filter(Boolean),
    ),
  ];
  if (subtypes.length > 1) {
    fail(`同時具有多種細分身分：${subtypes.join('、')}`, card.code);
  }

  return {
    subtype: subtypes[0] ?? null,
    cn: {
      name: cnName,
      subtitle: cnSubtitle,
      text: cnText,
      flavor: cnFlavor,
      image: normalizeCnImage(cn.frontImage, card.code),
      source: 'publisher',
    },
    tw: {
      ...traditionalName(card, cnName, cnSubtitle, twNames),
      text: convertBlocksToTraditional(cnText, toTraditional),
      textSource: 'converted',
      flavor: cnFlavor === null ? null : toTraditional(cnFlavor),
    },
  };
}

/**
 * 社群繁中卡名的查詢鍵：系列＋**字母前綴**＋號碼（VEN-R01、UNL-T01、VEN-SP1）。
 *
 * ⚠️ 2026-10-15 修正：原本的鍵沒有字母前綴，VEN-R01（狂怒符文）與 VEN-SP1（凱莎特別卡）
 * 都被當成 VEN-001，繁中介面上就顯示 VEN-001「巴凱旋沙者」的譯名 —— 別張卡的名字。
 * 跟分享碼撞號（deck-url.ts 的 shortCode）是同一類問題，當時只修了那一邊。
 */
function communityKey(card) {
  return `${card.set}-${card.codePrefix ?? ''}${String(card.number).padStart(card.codePrefix ? 2 : 3, '0')}`;
}

/** 比對英文卡名用：小寫、拿掉括號內容與標點。 */
const normalizeEnglish = (value) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** 兩個字串的編輯距離是否不超過 2（容許「Corinna／Corina」這種拼字差異）。 */
function nearlyEqual(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] <= 2;
}

/**
 * 社群資料這一筆，真的是這張卡嗎？
 *
 * 社群的每一筆都附了英文卡名（alternates），拿來跟官方英文名對照。
 * 這是最後一道防線：就算查詢鍵哪天又對錯（官方改編號、對方網站改版），
 * 也不會把別張卡的名字安上去 —— 對不上就退回簡轉繁，並在建置輸出列出來。
 *
 * 容許的差異都是實際遇過的：拼字誤差（Corinna／Corina、Crusier／Cruiser）、
 * 括號補註（Recruit (DE)／Recruit v2）、傳奇的英雄名前綴（Daughter of the Void／
 * Kai'Sa, Daughter of the Void）。
 */
function communityNameMatches(card, entry) {
  const english = (entry.alternates ?? [])
    .filter((a) => /[A-Za-z]/.test(a))
    .map(normalizeEnglish)
    .filter(Boolean);
  // 社群資料沒附英文名的（實測 9 筆）無從比對，沿用原本的做法
  if (english.length === 0) return true;
  const ours = [card.name, card.subtitle ? `${card.name}, ${card.subtitle}` : null]
    .filter(Boolean)
    .map(normalizeEnglish);
  return english.some((theirs) =>
    ours.some(
      (mine) =>
        theirs === mine ||
        nearlyEqual(theirs, mine) ||
        (mine.length >= 4 && theirs.includes(mine)) ||
        (theirs.length >= 4 && mine.includes(theirs)),
    ),
  );
}

/** 建置期間被擋下的社群譯名，最後統一印出來。 */
const rejectedCommunityNames = [];

/**
 * 繁中卡名：優先使用社群整理的官方繁中譯名；沒有的話退而求其次逐字轉繁。
 * 兩個簡中來源（中國大陸發行商、Riot 官方 zh_CN）共用這一段規則。
 */
function traditionalName(card, cnName, cnSubtitle, twNames) {
  const twEntry = twNames[communityKey(card)];

  if (twEntry?.name && !communityNameMatches(card, twEntry)) {
    rejectedCommunityNames.push(
      `${card.code}「${card.name}」≠ 社群「${twEntry.alternates.find((a) => /[A-Za-z]/.test(a))}」`,
    );
  } else if (twEntry?.name) {
    /*
     * 冠軍卡的繁中名是「阿璃-誘人」這種「名字-副標」合併寫法，
     * 拆開後才能跟英文（Ahri, Alluring）與簡中（阿狸／嫣然狐媚）一致呈現。
     * 只有在簡中確實有副標時才拆，避免誤切本來就含連字號的卡名。
     */
    if (cnSubtitle === null) return { name: twEntry.name, subtitle: null, nameSource: 'community' };
    const m = /^(.+?)[-－—](.+)$/.exec(twEntry.name);
    return m
      ? { name: m[1], subtitle: m[2], nameSource: 'community' }
      : { name: twEntry.name, subtitle: null, nameSource: 'community' };
  }

  return {
    name: toTraditional(cnName),
    subtitle: cnSubtitle === null ? null : toTraditional(cnSubtitle),
    // 讓介面能誠實標示這個譯名是哪來的
    nameSource: 'converted',
  };
}

/** 完整卡名。與 src/lib/card-name.ts 的 fullCardName 同一套規則（.mjs 無法直接讀 TypeScript）。 */
function fullName(card) {
  if (card.types.includes('legend')) {
    const champion = card.championTag;
    if (!champion) return card.name;
    return card.name.startsWith(`${champion},`) ? card.name : `${champion}, ${card.name}`;
  }
  return card.subtitle ? `${card.name}, ${card.subtitle}` : card.name;
}

/**
 * 再版卡沿用第一代的繁中（使用者要求：「如果有一代的繁中說明對上的地方就直接套用」）。
 *
 * 第一代（起源、試煉之地）在台灣有實體卡，社群整理過官方繁中卡名；
 * 後面的系列常常再版同一張卡（例如 VEN-172 就是 OGN-028 的 Draven, Showboat），
 * 但新卡號的繁中譯名還沒人整理，原本只能逐字簡轉繁。
 *
 * 規則分兩層，**對得越多套得越多**：
 *   完整卡名相同              → 沿用第一代的繁中卡名（官方實體卡譯名）
 *   卡名＋英文能力文字都相同  → 這一張完全沒有中文時，連能力文字一起沿用
 *
 * 只看卡名就套文字是不行的：同名卡在後面的系列可能被改過文字，
 * 套上舊文字等於顯示錯的規則。英文原文逐字相同，才代表是同一張卡。
 *
 * 必須在 attachChampionTags 之後呼叫（傳奇的完整卡名要靠英雄標籤組）。
 */
function reuseFirstGenerationChinese(cards) {
  const FIRST = new Set(['OGN', 'OGS']);
  const firstByName = new Map();
  for (const card of cards) {
    if (FIRST.has(card.set) && card.zh.tw?.nameSource === 'community') {
      firstByName.set(fullName(card), card);
    }
  }

  let names = 0;
  let texts = 0;
  for (const card of cards) {
    if (FIRST.has(card.set)) continue;
    const original = firstByName.get(fullName(card));
    if (!original) continue;

    const sameText = JSON.stringify(card.text) === JSON.stringify(original.text);
    if (card.zh.cn === null && sameText) {
      card.zh = {
        // 卡圖不沿用：那是另一個印刷版本的圖
        cn: { ...original.zh.cn, image: null },
        tw: { ...original.zh.tw },
      };
      texts += 1;
    } else if (card.zh.tw && card.zh.tw.nameSource !== 'community') {
      card.zh.tw = {
        ...card.zh.tw,
        name: original.zh.tw.name,
        subtitle: original.zh.tw.subtitle,
        nameSource: 'community',
      };
      names += 1;
    }
  }
  return { names, texts };
}

/** 字串裡有沒有中文字（判斷官方 zh_CN 是不是其實還沒翻譯、只回英文）。 */
const hasChinese = (value) => typeof value === 'string' && /[一-鿿]/.test(value);

/**
 * 用 Riot 官方 API 的 zh_CN 補上中文。
 *
 * ── 為什麼需要第二個簡中來源 ────────────────────────────────────
 * 主要來源（中國大陸發行商的網站）進度落後：2026-10-15 實測，
 * 本站 1370 張卡裡有 514 張它還沒收錄，那些卡在圖鑑上只有英文。
 * 使用者的回饋就是「有些地方還是英文」。
 *
 * Riot 自己的卡牌 API 帶 locale=zh_CN 就有簡中，補得到其中 511 張，而且：
 *   · 卡號（publicCode）跟英文完全同一套 —— 一對一對應，不可能對錯卡
 *   · 能力文字格式跟英文一模一樣，用同一支解析器（只是方括號裡換成簡中關鍵字）
 *   · 是 Riot 官方的資料，比第三方網站更符合 Riot 的素材政策
 *
 * ── 為什麼只拿來「補缺」，不全面取代 ─────────────────────────────
 * 已經有發行商資料的卡，換來源會讓上線中的文字整批變動，卻沒有使用者要求。
 * 而且發行商資料多了兩樣 Riot 沒有的：背景敘述、細分身分（英雄／專屬／衍生物）。
 * 先補缺；要不要全面改用 Riot 官方，留給之後另外決定。
 *
 * ── 官方 zh_CN 也會有沒翻譯的卡 ──────────────────────────────────
 * 少數卡（實測約 26 張）在 zh_CN 回傳的其實是英文。卡名沒有中文字就當作沒有，
 * 不要把英文當成「簡中」存起來 —— 那會讓介面把英文標成「簡轉繁」。
 */
function attachRiotLocales(card, riot, twNames) {
  if (!riot || !hasChinese(riot.name)) return null;

  const body = riot.text?.richText?.body ?? '';
  // 卡名翻了、能力文字卻還是英文的半成品，同樣不收
  if (body !== '' && !hasChinese(body)) return null;

  let text;
  try {
    text = parseCardText(body, { keywords: KEYWORD_BY_CN, tags: CN_TAG_TOKENS });
  } catch (err) {
    fail(`官方 zh_CN 能力文字解析失敗：${err.message}`, card.code);
  }

  const name = riot.name;
  const subtitle = hasChinese(riot.subtitle) ? riot.subtitle : null;

  return {
    cn: {
      name,
      subtitle,
      text,
      // 官方 zh_CN 沒有背景敘述；卡圖暫不採用（本站卡圖流程目前只處理發行商的 CDN）
      flavor: null,
      image: null,
      source: 'riot',
    },
    tw: {
      ...traditionalName(card, name, subtitle, twNames),
      text: convertBlocksToTraditional(text, toTraditional),
      textSource: 'converted',
      flavor: null,
    },
  };
}

// ─── 關鍵字辭典 ──────────────────────────────────────────────────────────

/**
 * 已知在卡面上找不到成對官方說明的關鍵字。
 *
 * Add 的說明（"Abilities that add resources can't be reacted to."）確實印在卡面上，
 * 但它沒有緊接在關鍵字後面，而且那張卡同時帶有其他關鍵字 ——
 * 沒有任何自動規則能在不冒「張冠李戴」風險的前提下把它認出來。
 *
 * 這裡明確記下來，而不是放寬比對規則去硬湊：
 * 放寬規則會讓其他關鍵字也可能配到錯的說明，那種錯誤比「暫時沒有說明」嚴重得多。
 * 介面上會顯示「官方卡面未提供說明」並指向官方規則書。
 *
 * 如果**其他**關鍵字哪天也抓不到，建置仍然會失敗 —— 那代表官方改了措辭，要有人來看。
 */
const KEYWORDS_WITHOUT_CARD_REMINDER = new Set(['Add']);

/**
 * 從卡面文字裡抽出官方的關鍵字說明。
 *
 * 官方會在卡面上用括號補充關鍵字的意思，例如
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 * 這是**官方自己的定義**，比任何人憑印象寫的都準確。
 *
 * 為什麼要自動抽而不是手打進程式碼：
 *   1. 官方哪天調整措辭，我們會跟著更新，不會停在舊版本。
 *   2. 開發過程中我曾手寫過這些說明，事後比對官方原文發現十五個裡錯了五個
 *      （例如把 Shield 寫成「吸收傷害」，官方其實是「防守方時 +1 力量」）。
 *      憑印象寫規則不可靠，這件事要用機制解決，不是靠小心。
 *
 * 掃描範圍是「全部系列」而不是只有 Origins —— 有幾個關鍵字的說明文字
 * 只出現在後續系列的卡面上。
 */
function extractKeywordGlossary(rawEnCards, cnCards) {


  const ALL_KEYWORDS = Object.values(KEYWORD_BY_CN);

  /**
   * 從卡面文字裡找出每個關鍵字的官方說明。
   *
   * 官方有兩種寫法，兩種都要處理：
   *
   *   緊接在後   "[Reaction] (Play any time, even before spells resolve.)"
   *   放在句尾   "[Legion] — When you play me, ready me.
   *               (Get the effect if you've played another card this turn)"
   *
   * 第二種沒辦法靠位置判斷，改用「專屬性」：
   * 一段說明文字如果**只出現在帶有該關鍵字的卡上**，那它幾乎必然是
   * 在解釋那個關鍵字。這個判準是資料本身給的，不是我猜的。
   */
  /*
   * 兩種語言標示關鍵字的方式不同，所以要用不同的比對規則：
   *   英文卡面   [Assault]、[Shield 2]
   *   簡中卡面   {强攻}、{法盾2}     （原文是 {{强攻}}，前面已轉成單層大括號）
   * 兩者都轉換成統一的英文關鍵字名稱後再處理。
   */
  /*
   * 每種語言的比對式都寫成「字面量」，而且每次使用時都新建一個。
   *
   * 為什麼不用 new RegExp(某個變數) 去組出來：
   * CodeQL 會把「用變數建構正則式」標記為高風險（正則式注入）。
   * 這裡的來源雖然是我們自己的常數、實際上不可被利用，但那個寫法本身很脆弱 ——
   * 日後只要有人讓那個變數變成可設定的，就會變成真的漏洞。
   * 寫成字面量既沒有這個風險，也比較好讀。
   *
   * 每次都新建的原因：帶 g 旗標的正則式會記住 lastIndex，
   * 共用同一個實例會讓第二次呼叫從上次的位置開始找，結果時對時錯。
   */
  const KEYWORD_PATTERNS = {
    en: {
      // 關鍵字可能含連字號（Quick-Draw）或空格（Show Off），2026-10-13 的新系列才出現
      newToken: () => /\[([A-Za-z][A-Za-z-]*(?: [A-Za-z][A-Za-z-]*)?)(?: \d+)?\]/g,
      resolve: (raw) => (ALL_KEYWORDS.includes(raw) ? raw : null),
    },
    cn: {
      newToken: () => /\{([^}]+?)\d*\}/g,
      resolve: (raw) => KEYWORD_BY_CN[raw] ?? null,
    },
  };

  /** 取出一段文字裡所有的括號內容（含它在文字中的位置）。 */
  const parentheticals = (text) => {
    const out = [];
    const re = /[（(]([^）)]{10,400})[）)]/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push({ index: m.index, value: m[1].trim() });
    return out;
  };

  /**
   * 從候選說明裡挑「最多張卡印的那個說法」。
   *
   * ── 為什麼不是挑第一張 ──────────────────────────────────────────
   * 原本是「第一個符合的就採用」，結果取決於卡片的排列順序：
   *   · 照官方 API 的順序 → 不固定，2026-10-15 官方追加新卡後「護盾」的說明就變了
   *   · 照發售順序 → 固定了，但常挑到特例：「裝備」帶著某張卡的具體費用、
   *     「炫技」只講機械、「伏擊」連帶著強攻的說明
   *
   * 通用的定義會在很多張卡上重複印；特例只出現在一兩張。
   * 所以「出現最多次的說法」就是最接近官方定義的那一個，而且結果穩定。
   * 同票時取排列在前的（發售較早、卡號較小），一樣是固定的。
   *
   * 只在最高的那一層優先順序裡比（緊鄰且不帶數值 > 緊鄰帶數值 > 唯一括號），
   * 不會因為某個特例印得多就蓋過更明確的來源。
   */
  const pickMostCommon = (candidates) => {
    if (candidates.length === 0) return null;
    const top = Math.max(...candidates.map((c) => c.score));
    const counts = new Map();
    for (const c of candidates) {
      if (c.score !== top) continue;
      const entry = counts.get(c.en);
      if (entry) entry.count += 1;
      else counts.set(c.en, { count: 1, first: c });
    }
    let best = null;
    for (const entry of counts.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    return best.first;
  };

  /** 這段文字裡帶有哪些關鍵字，以及每個關鍵字出現的位置。 */
  const keywordHits = (text, lang) => {
    const { newToken, resolve } = KEYWORD_PATTERNS[lang];
    const hits = [];
    const re = newToken();
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = resolve(m[1]);
      // hasValue：[Shield 3] 這種帶數值的寫法，說明會寫成「+3」而不是通用的定義
      if (name) hits.push({ name, index: m.index, end: m.index + m[0].length, hasValue: /\d/.test(m[0]) });
    }
    return hits;
  };

  /**
   * 為每個關鍵字挑一張「最能代表它」的卡，然後從**同一張卡的同一個括號位置**
   * 同時取出英文與簡中的說明。
   *
   * 為什麼一定要同一張卡同一個位置：
   * 如果英文與簡中各自獨立挑選，很容易挑到不同的卡。開發時實際發生過 ——
   * 英文取到 [Assault]（+1 力量）、簡中取到 {强攻2}（+2 戰力），
   * 兩邊講的是不同的東西，但看起來都「對」。這種錯最難發現。
   *
   * 挑選優先順序：
   *   1. 括號緊接在關鍵字後面（最沒有歧義）
   *   2. 這張卡只有一個關鍵字、也只有一個括號（那個括號必然是在解釋它）
   * 同一層裡再用 pickMostCommon 挑「最多張卡印的說法」。
   */
  const collectPaired = (pairs) => {
    const result = new Map();

    for (const keyword of ALL_KEYWORDS) {
      /** @type {{score: number, en: string, cn: string}[]} */
      const candidates = [];

      for (const { en, cn } of pairs) {
        if (!en || !cn) continue;
        const enHits = keywordHits(en, 'en').filter((h) => h.name === keyword);
        const cnHits = keywordHits(cn, 'cn').filter((h) => h.name === keyword);
        if (enHits.length === 0 || cnHits.length === 0) continue;

        const enParens = parentheticals(en);
        const cnParens = parentheticals(cn);
        if (enParens.length === 0 || enParens.length !== cnParens.length) continue;

        /*
         * 找出「緊接在關鍵字之後」的那個括號。
         *
         * 不帶數值的寫法（[Shield]）優先於帶數值的（[Shield 3]）：
         * 前者的提醒文字是通用定義「+1 戰力」，後者是那張卡的特例「+3」。
         * 辭典要的是定義，不是某一張卡的數字。
         */
        let chosen = -1;
        let score = 0;
        for (const hit of enHits) {
          const idx = enParens.findIndex(
            (p) => p.index >= hit.end && p.index - hit.end <= 3,
          );
          if (idx >= 0) {
            chosen = idx;
            score = hit.hasValue ? 2 : 3;
            break;
          }
        }

        // 沒有緊鄰的話：這張卡只有一個關鍵字、也只有一個括號才採用
        if (chosen < 0) {
          const allEnKeywords = new Set(keywordHits(en, 'en').map((h) => h.name));
          if (allEnKeywords.size === 1 && enParens.length === 1) {
            chosen = 0;
            score = 1;
          }
        }
        if (chosen < 0) continue;

        candidates.push({ score, en: enParens[chosen].value, cn: cnParens[chosen].value });
      }

      const best = pickMostCommon(candidates);
      if (best) result.set(keyword, { en: best.en, cn: best.cn });
    }
    return result;
  };

  /**
   * 只有英文的後備來源。
   *
   * 2026-10-13 的新系列裡，有 5 個關鍵字（Burn／Empower／Empowered／Flow／Level）
   * **只出現在中國大陸發行商還沒收錄的卡上**，配不出中英成對的說明。
   * 這時取英文官方說明，中文留空 —— 跟本站處理新卡的方式一致：
   * 沒有官方中文就顯示英文，絕不自己寫一段規則說明頂替。
   */
  const collectEnglishOnly = (enOnlyTexts) => {
    const result = new Map();
    for (const keyword of ALL_KEYWORDS) {
      const candidates = [];
      for (const text of enOnlyTexts) {
        const hits = keywordHits(text, 'en').filter((h) => h.name === keyword);
        if (hits.length === 0) continue;
        const parens = parentheticals(text);
        if (parens.length === 0) continue;

        // 1. 括號緊接在關鍵字後面（不帶數值的優先）；2. 關鍵字與括號都只有一個
        let found = null;
        for (const hit of hits) {
          const near = parens.find((p) => p.index >= hit.end && p.index - hit.end <= 3);
          if (near) {
            found = { score: hit.hasValue ? 2 : 3, en: near.value, cn: null };
            break;
          }
        }
        if (!found && new Set(keywordHits(text, 'en').map((h) => h.name)).size === 1 && parens.length === 1) {
          found = { score: 1, en: parens[0].value, cn: null };
        }
        if (found) candidates.push(found);
      }
      const best = pickMostCommon(candidates);
      if (best) result.set(keyword, { en: best.en, cn: null });
    }
    return result;
  };

  /*
   * 先把卡片排成固定順序（發售順序、再依卡號）。
   *
   * 下面的挑選是「第一個符合的就採用」。原本直接用官方 API 回傳的順序 ——
   * 那個順序**不固定**：2026-10-15 官方追加公開一批熠耀光彩的卡之後，
   * 「護盾」的說明就從通用的「+1 戰力」變成某張 [Shield 3] 卡的「+3」，
   * 規則頁的說明跟著變了，沒有任何人改程式。
   * 排好順序之後，結果只會因為資料內容改變而改變，不會因為對方伺服器的回應順序。
   */
  const setOrder = Object.keys(WANTED_SETS);
  rawEnCards = [...rawEnCards].sort(
    (a, b) =>
      setOrder.indexOf(a?.set?.value?.id) - setOrder.indexOf(b?.set?.value?.id) ||
      String(a?.publicCode ?? '').localeCompare(String(b?.publicCode ?? '')),
  );

  // 英文：把官方 HTML 轉成純文字（不經過解析器，因為這裡只是要讀，不會輸出到頁面）
  const enTexts = rawEnCards.map((c) =>
    (c?.text?.richText?.body ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/:rb_([a-z0-9_]+):/g, '{$1}')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&'),
  );
  /*
   * 簡中的符號 token（{{S}}、{{紫色}}…）轉成與英文一致的符號 id，
   * 這樣前端可以用同一套元件把兩種語言的說明都畫成圖示。
   * 關鍵字 token 維持中文原樣，因為後面要靠它比對關鍵字。
   */
  const cnTexts = cnCards.map((c) =>
    (c?.cardEffect ?? '').replace(/\{\{([^}]*)\}\}/g, (_, inner) =>
      Object.hasOwn(GLYPH_BY_CN_TOKEN, inner) ? `{${GLYPH_BY_CN_TOKEN[inner]}}` : `{${inner}}`,
    ),
  );

  // 依卡號把英文卡與簡中卡配對，才能保證兩邊取到的是同一張卡的同一句話
  const cnByCode = new Map(
    cnCards.filter((c) => c?.cardNo).map((c) => [c.cardNo.replace('·', '-'), c]),
  );
  const pairs = rawEnCards
    .map((card, i) => {
      const cn = cnByCode.get(card?.publicCode ?? '');
      return cn ? { en: enTexts[i], cn: cnTexts[cnCards.indexOf(cn)] } : null;
    })
    .filter(Boolean);

  const paired = collectPaired(pairs);

  // 配不出中英成對的，再試只有英文的來源（新系列的關鍵字會走到這裡）
  const englishOnly = collectEnglishOnly(enTexts);

  const entries = {};
  const missing = [];
  const englishOnlyNames = [];
  for (const name of Object.values(KEYWORD_BY_CN)) {
    const hit = paired.get(name);
    if (!hit) {
      const enHit = englishOnly.get(name);
      if (enHit) {
        entries[name] = {
          en: enHit.en,
          cn: null,
          tw: null,
          // 介面要能說出「這段只有英文，因為官方還沒出中文」
          source: 'official-card-text-en-only',
        };
        englishOnlyNames.push(name);
        continue;
      }
    }
    if (!hit) {
      // 沒有官方說明的關鍵字，介面上會誠實標示並指向官方規則書，
      // 不會用手寫的內容頂替。
      entries[name] = { en: null, cn: null, tw: null, source: 'none' };
      if (!KEYWORDS_WITHOUT_CARD_REMINDER.has(name)) missing.push(name);
      continue;
    }
    entries[name] = {
      en: hit.en,
      cn: hit.cn,
      // 繁中沿用簡中的官方說明逐字轉繁（官方尚未推出繁中規則資料）
      tw: toTraditional(hit.cn),
      // 讓介面能誠實標示這段文字的來歷
      source: 'official-card-text',
    };
  }
  if (englishOnlyNames.length > 0) {
    console.log(
      `  ℹ ${englishOnlyNames.length} 個關鍵字目前只有英文官方說明（官方簡中尚未收錄這些卡）：${englishOnlyNames.join('、')}`,
    );
  }
  return { entries, missing };
}

// ─── 分類法（篩選選項） ──────────────────────────────────────────────────

function buildTaxonomy(cards) {
  const collect = (fn) => {
    const set = new Set();
    for (const card of cards) for (const v of fn(card)) set.add(v);
    return [...set];
  };
  const numbers = (fn) => collect((c) => (fn(c) === null ? [] : [fn(c)])).sort((a, b) => a - b);

  return {
    sets: Object.entries(WANTED_SETS).map(([id, name]) => ({
      id,
      name,
      count: cards.filter((c) => c.set === id).length,
    })),
    // 依既定順序輸出（不是依資料出現順序），讓 UI 穩定。
    types: ALLOWED_CARD_TYPES.filter((t) => cards.some((c) => c.types.includes(t))),
    domains: ALLOWED_DOMAINS.filter((d) => cards.some((c) => c.domains.includes(d))),
    rarities: ALLOWED_RARITIES.filter((r) => cards.some((c) => c.rarity === r)),
    tags: collect((c) => c.tags).sort((a, b) => a.localeCompare(b, 'en')),
    // 標籤的中文對照。每個標籤都必須有對照，否則建置失敗（見下方 main()）。
    tagLabels: Object.fromEntries(
      collect((c) => c.tags)
        .sort((a, b) => a.localeCompare(b, 'en'))
        .map((tag) => [tag, TAGS[tag]]),
    ),
    energies: numbers((c) => c.energy),
    mights: numbers((c) => c.might),
    powers: numbers((c) => c.power),
    glyphs: [...ALLOWED_GLYPHS],
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────

/**
 * 抓官方公開 API 的全部卡片（收斂式，見函式內說明）。
 *
 * 2026-10-15 起英文（en_US）與簡中（zh_CN）共用這一段：
 * 官方 zh_CN 是補新系列中文的來源，分頁一樣會抖動，一樣要抓到收斂為止。
 */
async function fetchOfficialCards(locale) {
  let total = Infinity;
  const byApiId = new Map();
  let pages = 0;

  /*
   * 抓到「這一輪沒有帶來任何新卡」為止，最多 5 輪。
   *
   * 一開始只抓兩輪，結果仍然不穩（一次聯集 1381 張、下一次 1380 張）——
   * 代表同一張卡可能連續兩輪都被漏掉。改成收斂式：重複抓到結果不再變多。
   * 每輪 7 次請求，實務上 2～3 輪就會停。
   */
  const MAX_ROUNDS = 5;
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const before = byApiId.size;
    let from = 0;
    let roundTotal = Infinity;
    while (from < roundTotal) {
      const url = `${API_BASE}${API_PATH}?locale=${locale}&from=${from}&limit=${PAGE_SIZE}`;
      const body = await fetchJson(url);
      if (!Array.isArray(body?.data)) fail(`API 回應缺少 data 陣列：${url}`);
      roundTotal = requireInt(body?.metadata?.totalItems, 'metadata.totalItems');
      total = roundTotal;
      if (body.data.length === 0) break; // 已經抓完，提早收工
      for (const card of body.data) {
        const prev = byApiId.get(card?.id);
        if (prev !== undefined && JSON.stringify(prev) !== JSON.stringify(card)) {
          fail(`同一個 id 出現兩筆不同的資料："${card.id}"（${prev.publicCode} 與 ${card.publicCode}）`);
        }
        byApiId.set(card?.id, card);
      }
      from += PAGE_SIZE;
      pages += 1;
      if (pages > MAX_ROUNDS * 10) fail('分頁次數異常過多，中止以免無限迴圈');
    }
    const added = byApiId.size - before;
    console.log(`  ✓ 第 ${round} 輪：累計 ${byApiId.size} 張（新增 ${added}）`);
    if (round > 1 && added === 0) break; // 收斂了
    if (round === MAX_ROUNDS) {
      console.log(`  ⚠ 抓了 ${MAX_ROUNDS} 輪仍未收斂，以目前結果繼續（張數檢查會把關）`);
    }
  }

  const raw = [...byApiId.values()];
  console.log(`  ✓ ${locale} 聯集共 ${raw.length} 張卡（${pages} 次請求）`);

  // 官方 metadata.totalItems 會把尚未公開的佔位項目也算進去，
  // 因此實際回傳筆數通常會少一些。這不是錯誤，只是記錄下來備查。
  // 真正的完整性保證來自下方各系列的張數檢查。
  if (raw.length !== total) {
    console.log(`    （官方 metadata 宣稱 ${total} 筆，差額為尚未公開的項目）`);
  }
  if (raw.length === 0) fail(`API 沒有回傳任何卡片（${locale}）`);
  return raw;
}

async function main() {
  console.log('▶ 從 Riot 官方公開 API 抓取卡牌資料…');

  /*
   * ── 為什麼要抓兩輪 ──────────────────────────────────────────────
   * 官方 API 的分頁**不穩定**：同一組請求，有時某張卡跨頁重複出現，
   * 有時某張卡在頁面邊界被漏掉。2026-10-13 連續幾次實測，
   * SFD 時而 287 張、時而 288 張，RAD 也會差一張。
   *
   * 只抓一輪的話，下面的張數檢查會**隨機**失敗，那比沒有檢查更糟 ——
   * 紅燈一旦變得不可信，真正的問題就沒有人會當真。
   *
   * 所以抓兩輪取聯集：一輪漏掉的，另一輪通常有。
   * 兩輪都漏的極少數情況仍會被張數檢查抓到，那時重跑即可。
   */
  const raw = await fetchOfficialCards('en_US');

  const inWantedSets = raw.filter((c) => Object.keys(WANTED_SETS).includes(c?.set?.value?.id));

  /*
   * 官方資料本身缺欄位的卡，逐張列出後跳過。
   *
   * 這 11 張有卡名、有卡圖，但**英文與簡中都沒有 cardType**（2026-10-13 兩邊都查過）。
   * 沒有卡種就無法做牌組合法性檢查，也無法正確篩選，收進來只會產生壞資料。
   *
   * 為什麼要逐張列舉，而不是寫成「缺卡種就跳過」：
   * 後者會讓**未來**任何一張缺資料的卡都被靜靜丟掉，失去 fail-closed 的意義。
   * 列在這裡的才跳過，沒列到的照樣中斷建置。
   * 官方補齊之後把對應那行刪掉，張數檢查會立刻提醒我們。
   */
  const KNOWN_DATA_GAPS = new Map([
    ['RAD-006/167', '官方缺 cardType（Scorched Earth）'],
    ['RAD-009/167', '官方缺 cardType（Antagonistic Apparatus）'],
    ['RAD-026/167', '官方缺 cardType（Entrenched Boar）'],
    ['RAD-034/167', '官方缺 cardType（Hunker Down）'],
    ['RAD-041/167', '官方缺 cardType（Hush）'],
    ['RAD-047/167', '官方缺 cardType（Fanfare）'],
    ['RAD-049/167', '官方缺 cardType（Industrious Mechsmith）'],
    ['RAD-121/167', '官方缺 cardType（One-Two Punch）'],
    ['RAD-127/167', '官方缺 cardType（Rousing Display）'],
    // 2026-10-15 官方追加公開的 RAD 卡裡，又有 4 張同樣缺 cardType（發售日 10/23 前的預覽資料）
    ['RAD-022/167', '官方缺 cardType（Whirling Twirligig）'],
    ['RAD-104/167', '官方缺 cardType（Pitiless Stalker）'],
    ['RAD-123/167', "官方缺 cardType（Protector's Shield）"],
    ['RAD-134/167', '官方缺 cardType（Raucous Anthem）'],
    ['UNL-T04', '官方缺 cardType（Buff 衍生物）'],
    ['UNL-T08', '官方缺 cardType（XP Tracker 衍生物）'],
  ]);

  const skipped = inWantedSets.filter((c) => KNOWN_DATA_GAPS.has(c?.publicCode));
  const wanted = inWantedSets.filter((c) => !KNOWN_DATA_GAPS.has(c?.publicCode));
  console.log(`  ✓ 篩出收錄系列 ${wanted.length} 張，開始驗證…`);
  if (skipped.length > 0) {
    console.log(`  ⚠ 跳過 ${skipped.length} 張官方資料不全的卡：`);
    for (const c of skipped) {
      console.log(`      ${c.publicCode}　${KNOWN_DATA_GAPS.get(c.publicCode)}`);
    }
  }

  // 重複與遺漏在上面「兩輪聯集」時已經處理掉了。
  const cards = wanted.map(normalizeCard);

  // 網址會用 id 當作路由參數，必須唯一。
  const seen = new Map();
  for (const card of cards) {
    if (seen.has(card.id)) fail(`id 重複："${card.id}"（${seen.get(card.id)} 與 ${card.code}）`);
    seen.set(card.id, card.code);
  }

  /*
   * 張數檢查：兩個方向刻意不對稱。
   *
   * ── 為什麼不是嚴格相等 ──────────────────────────────────────────
   * 官方 API 回傳的卡片數本身會浮動：2026-10-13 連續測了六次，
   * 總數在 1379～1381 之間跳動，少的那一兩張每次還不一樣（這次 OGN、上次 SFD）。
   * 多抓幾輪取聯集仍然會發生（同一輪連線多半落在同一個節點，漏的是同幾張）。
   * 推測是官方把「尚未公開」的項目在分頁之後才濾掉，而各節點的快取進度不同。
   *
   * 嚴格相等會讓建置**隨機失敗**，那比沒有檢查更糟 —— 紅燈一旦不可信，
   * 真正的問題就沒有人會當真（這個教訓在問題 69 已經學過一次）。
   *
   * ── 所以分成三種情況 ────────────────────────────────────────────
   *   少一兩張   官方抖動，印警告繼續（頂多暫時少收錄一兩張卡）
   *   少很多     抓取真的壞了（例如 API 改格式），中斷
   *   變多       官方新增了卡，中斷並要求人確認後更新數字
   */
  const COUNT_TOLERANCE = 2;
  for (const [setId, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = cards.filter((c) => c.set === setId).length;
    const diff = actual - expected;

    if (diff > 0) {
      fail(
        `${setId} 張數為 ${actual}，比預期的 ${expected} 多 ${diff} 張。` +
          `\n  官方可能新增了卡片。請確認內容後更新 scripts/fetch-cards.mjs 的 EXPECTED_COUNTS。`,
      );
    }
    if (-diff > COUNT_TOLERANCE) {
      fail(
        `${setId} 張數為 ${actual}，比預期的 ${expected} 少 ${-diff} 張（超過容忍的 ${COUNT_TOLERANCE} 張）。` +
          `\n  這通常代表抓取壞了，而不是官方抖動。請先重跑一次確認。`,
      );
    }
    if (diff < 0) {
      console.log(
        `  ⚠ ${setId} (${WANTED_SETS[setId]}): ${actual} 張　比預期少 ${-diff} 張（官方分頁抖動，在容忍範圍內）`,
      );
      continue;
    }
    console.log(`  ✓ ${setId} (${WANTED_SETS[setId]}): ${actual} 張`);
  }

  // 依系列的發售順序，再依卡號 —— 跟站上的顯示順序一致
  const setOrder = Object.keys(WANTED_SETS);
  cards.sort(
    (a, b) =>
      setOrder.indexOf(a.set) - setOrder.indexOf(b.set) ||
      a.number - b.number ||
      (a.variant ?? '').localeCompare(b.variant ?? ''),
  );

  // 每個標籤都必須有中文對照，缺一個就讓建置失敗。
  const missingTagLabels = [...new Set(cards.flatMap((c) => c.tags))].filter(
    (tag) => !Object.hasOwn(TAGS, tag),
  );
  if (missingTagLabels.length > 0) {
    fail(
      `以下標籤缺少中文對照：${missingTagLabels.join('、')}` +
        `\n  請在 scripts/lib/taxonomy-map.mjs 的 TAGS 補上。`,
    );
  }

  // ── 中文資料 ──────────────────────────────────────────────────────────
  console.log('\n▶ 取得中文資料…');

  console.log('  · 簡體中文：中國大陸官方發行商 API（lol-api.playloltcg.com）');
  const { wanted: cnMap, all: cnAll } = await fetchSimplifiedChinese(Object.keys(WANTED_SETS));
  console.log(`  ✓ 取得官方簡中卡牌 ${cnMap.size} 張（全系列 ${cnAll.length} 張）`);
  // 標籤合併時用來判斷「這個標籤是英雄名還是地區」（見 reconcileTags）
  const tagContext = publisherTagContext(cnMap.values());

  // 鍵要含字母前綴（見 communityKey 的說明），否則符文、衍生物會對到同號的一般卡
  const baseCodes = [...new Set(cards.map(communityKey))].sort();
  const twNames = await fetchTraditionalNames(
    baseCodes,
    join(ROOT, 'src', 'data', 'zh-tw-names.json'),
    process.argv.includes('--refresh-tw'),
  );

  console.log('  · 補缺用：Riot 官方 API 的 zh_CN（發行商還沒收錄的卡）');
  const riotZh = new Map(
    (await fetchOfficialCards('zh_CN')).map((item) => [item?.publicCode, item]),
  );

  let cnMatched = 0;
  let riotFilled = 0;
  let twOfficial = 0;
  for (const card of cards) {
    const cn = cnMap.get(card.code) ?? null;
    if (cn) cnMatched += 1;
    let locales = attachLocales(card, cn, twNames, tagContext);
    if (locales.cn === null) {
      const riot = attachRiotLocales(card, riotZh.get(card.code), twNames);
      if (riot) {
        riotFilled += 1;
        locales = { ...riot, subtype: null };
      }
    }
    card.subtype = locales.subtype;
    /*
     * 卡號帶 T 的就是衍生物（UNL-T01）。
     *
     * 細分身分本來只能從簡中資料看，但官方簡中還沒收錄新系列的衍生物 ——
     * 那些卡在圖鑑的「衍生物」篩選與復盤的候選清單裡就會整批消失。
     * 卡號本身已經說明了這件事，用它補上；兩邊說法不一致就中止。
     */
    if (card.codePrefix === 'T') {
      if (card.subtype !== null && card.subtype !== 'token') {
        fail(`卡號說是衍生物，簡中卻說是 ${card.subtype}`, card.code);
      }
      card.subtype = 'token';
    }
    card.zh = { cn: locales.cn, tw: locales.tw };
    if (card.zh.tw?.nameSource === 'community') twOfficial += 1;
  }

  attachChampionTags(cards);
  const reused = reuseFirstGenerationChinese(cards);

  /*
   * 簡中覆蓋率：舊系列要求 100%，新系列允許缺。
   *
   * OGN／OGS 兩邊一直是完全對應的，少了就代表資料格式變了，必須中斷。
   * 2026-10-13 起收錄的四個新系列，中國大陸發行商的進度落後官方英文
   * （當天實測：1369 張裡有 1191 張有簡中），缺的那些卡會以英文呈現 ——
   * 這跟本站既有的處理方式一致（翻譯一律與官方英文並列，沒有翻譯就只有英文）。
   */
  const LEGACY_SETS = ['OGN', 'OGS'];
  const missingLegacy = cards
    .filter((c) => LEGACY_SETS.includes(c.set) && !cnMap.has(c.code))
    .map((c) => c.code);
  if (missingLegacy.length > 0) {
    fail(
      `有 ${missingLegacy.length} 張舊系列的卡找不到官方簡中資料：${missingLegacy.slice(0, 10).join('、')}` +
        `\n  這兩個系列兩邊一向完全對應，出現落差代表資料格式改變了。`,
    );
  }
  const stillEnglish = cards.filter((c) => c.zh.cn === null);
  const communityNames = cards.filter((c) => c.zh.tw?.nameSource === 'community').length;
  console.log(
    `  ✓ 簡中：發行商 ${cnMatched} 張＋Riot 官方 zh_CN 補 ${riotFilled} 張` +
      `＋沿用第一代 ${reused.texts} 張，共 ${cards.length - stillEnglish.length}/${cards.length} 張`,
  );
  console.log(
    `  ✓ 繁中卡名：${communityNames} 張用社群整理的官方譯名` +
      `（其中 ${reused.names} 張是再版卡沿用第一代；原本 ${twOfficial} 張）`,
  );
  if (rejectedCommunityNames.length > 0) {
    console.log(
      `  ⚠ ${rejectedCommunityNames.length} 筆社群譯名的英文對不上這張卡，改用簡轉繁：\n      ` +
        rejectedCommunityNames.join('\n      '),
    );
  }
  if (stillEnglish.length > 0) {
    console.log(
      `  ℹ 仍只有英文 ${stillEnglish.length} 張（兩個官方簡中來源都還沒翻譯）：` +
        stillEnglish.slice(0, 8).map((c) => c.code).join('、') +
        (stillEnglish.length > 8 ? ' …' : ''),
    );
  }

  /*
   * 兩個官方來源對不上時：以發行商為準（理由見 reconcileWithPublisher 上方的說明），
   * 把每一筆改動列出來，日後查證時知道改了什麼。
   * 但如果對不上的比例過高，那不是官方不一致，是我們的對照表壞了 —— 中斷。
   */
  const reportCorrections = (label, list, describe) => {
    if (list.length === 0) return;
    const ratio = list.length / Math.max(1, cnMatched);
    const sample = list.slice(0, 8).map(describe).join('、');
    if (ratio > 0.05) {
      fail(
        `有 ${list.length} 張卡（${(ratio * 100).toFixed(1)}%）的${label}兩邊對不上：${sample}` +
          `\n  比例這麼高通常代表 taxonomy-map.mjs 的對照壞了，而不是官方資料不一致。`,
      );
    }
    console.log(
      `  ⚠ ${list.length} 張卡的${label}兩邊不同，以發行商為準（已對照官方卡圖）：${sample}` +
        (list.length > 8 ? ` …等 ${list.length} 張` : ''),
    );
  };
  reportCorrections('流派', domainDisagreements, (d) => `${d.code} ${d.en}→${d.cn}`);
  reportCorrections('卡種', typeDisagreements, (d) => `${d.code} ${d.en}→${d.cn}`);
  reportCorrections('費用／戰力', statDisagreements, (d) => `${d.code} ${d.field} ${d.en}→${d.cn}`);
  // 標籤的修正比例本來就高（RAD 的 Riot 標籤大多是空的），不套用 5% 的門檻，只列出來
  if (tagCorrections.length > 0) {
    console.log(
      `  ℹ ${tagCorrections.length} 張卡的標籤以發行商補正：` +
        tagCorrections
          .slice(0, 6)
          .map((d) => `${d.code} [${d.from}]→[${d.to}]`)
          .join('、') +
        (tagCorrections.length > 6 ? ' …' : ''),
    );
  }

  /*
   * 卡片屬性的基本一致性 —— 不靠第二個來源也查得出來的錯。
   *
   * 單位一定有戰力、法術一定沒有。2026-10-16 查 RAD 的時候，Riot 寫成「單位」的卡
   * 有好幾張沒有戰力，寫成「法術」的卡卻有戰力 —— 這條檢查當時就會直接抓到。
   * 發行商還沒收錄的卡（只有 Riot 一個來源）全靠這一道把關。
   */
  const inconsistent = cards.filter(
    (c) =>
      (c.types.includes('unit') && c.might === null) ||
      (c.types.includes('spell') && c.might !== null),
  );
  if (inconsistent.length > 0) {
    fail(
      `${inconsistent.length} 張卡的卡種與戰力矛盾（單位沒有戰力，或法術有戰力）：` +
        inconsistent
          .slice(0, 10)
          .map((c) => `${c.code} ${c.types} 戰力=${c.might}`)
          .join('、') +
        `\n  請對照官方卡圖確認是哪一邊的資料錯了。`,
    );
  }

  await downloadGlyphs();

  // 關鍵字辭典：掃全系列的卡面文字，抽出官方自己寫的說明
  const glossary = extractKeywordGlossary(raw, cnAll);
  if (glossary.missing.length > 0) {
    fail(
      `以下關鍵字在所有系列的卡面上都找不到官方說明：${glossary.missing.join('、')}` +
        `
  這代表官方改了措辭，或我們的比對規則需要調整。` +
        `
  不要用手寫的說明頂替 —— 規則寫錯比沒有更糟。`,
    );
  }
  const withText = Object.values(glossary.entries).filter((e) => e.en).length;
  console.log(
    `  ✓ 關鍵字辭典：${withText}/${Object.keys(glossary.entries).length} 個關鍵字取得官方說明` +
      (withText < Object.keys(glossary.entries).length
        ? `（${[...KEYWORDS_WITHOUT_CARD_REMINDER].join('、')} 卡面未提供，已標示）`
        : ''),
  );

  const taxonomy = { ...buildTaxonomy(cards), keywords: glossary.entries };
  const dataDir = join(ROOT, 'src', 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'cards.origins.json'), JSON.stringify(cards, null, 1), 'utf8');
  await writeFile(join(dataDir, 'taxonomy.json'), JSON.stringify(taxonomy, null, 1), 'utf8');

  console.log('  ✓ 已輸出 src/data/cards.origins.json 與 taxonomy.json');
  console.log('\n✅ 完成：', {
    卡片總數: cards.length,
    有能力文字: cards.filter((c) => c.text.length > 0).length,
    橫向卡: cards.filter((c) => c.orientation === 'landscape').length,
    Tag數: taxonomy.tags.length,
  });
}

main().catch((err) => {
  console.error(`\n❌ 建置中止：${err.message}\n`);
  process.exit(1);
});
