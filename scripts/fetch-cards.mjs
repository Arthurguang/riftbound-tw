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
  DOMAIN_BY_CN_COLOR,
  RARITY_BY_CN,
  TAGS,
  TYPE_BY_CN_CATEGORY,
} from './lib/taxonomy-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── 設定 ────────────────────────────────────────────────────────────────

const API_BASE = 'https://content.publishing.riotgames.com';
const API_PATH =
  '/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards';
const PAGE_SIZE = 200;

/** 本階段只收錄 Origins 系列（主系列 + 試煉場）。 */
const WANTED_SETS = Object.freeze({ OGN: 'Origins', OGS: 'Proving Grounds' });

/** 預期張數。對不上就代表官方改了東西，必須讓建置失敗以引起注意。 */
const EXPECTED_COUNTS = Object.freeze({ OGN: 352, OGS: 24 });

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
 * 從 publicCode 拆出卡號與變體標記。
 * 格式範例： "OGN-056/298"、"OGN-066a/298"、"OGN-304(星號)/298"
 */
function parsePublicCode(publicCode, setId, cardCode) {
  const m = /^([A-Z]{2,4})-(\d{1,4})([a-z*]*)\/(\d{1,4})$/.exec(publicCode);
  if (!m) fail(`publicCode 格式無法辨識："${publicCode}"`, cardCode);
  if (m[1] !== setId) {
    fail(`publicCode 的系列前綴 "${m[1]}" 與 set.value.id "${setId}" 不符`, cardCode);
  }
  return { number: Number(m[2]), variant: m[3] === '' ? null : m[3] };
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

  const { number, variant } = parsePublicCode(publicCode, setId, code);

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
    variant,
    name: requireString(raw?.name, 'name', code),
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
function assertTaxonomyAgrees(card, cn) {
  const code = card.code;

  const cnDomains = (cn.cardColorList ?? []).map((color) => {
    if (!Object.hasOwn(DOMAIN_BY_CN_COLOR, color)) {
      fail(`未知的簡中顏色 "${color}"，請更新 taxonomy-map.mjs`, code);
    }
    return DOMAIN_BY_CN_COLOR[color];
  });
  if ([...cnDomains].sort().join() !== [...card.domains].sort().join()) {
    fail(`領域對不上：英文 [${card.domains}] vs 簡中 [${cnDomains}]`, code);
  }

  const cnTypes = new Set(
    (cn.cardCategoryNameList ?? []).map((category) => {
      if (!Object.hasOwn(TYPE_BY_CN_CATEGORY, category)) {
        fail(`未知的簡中卡種 "${category}"，請更新 taxonomy-map.mjs`, code);
      }
      return TYPE_BY_CN_CATEGORY[category];
    }),
  );
  for (const type of card.types) {
    if (!cnTypes.has(type)) fail(`卡種對不上：英文 ${type} 不在簡中 [${[...cnTypes]}]`, code);
  }

  if (!Object.hasOwn(RARITY_BY_CN, cn.rarityName)) {
    fail(`未知的簡中稀有度 "${cn.rarityName}"，請更新 taxonomy-map.mjs`, code);
  }
  // 稀有度只警告不中斷：官方兩邊對「異畫」的歸類偶有差異，不影響資料正確性。
  if (RARITY_BY_CN[cn.rarityName] !== card.rarity) {
    console.warn(`    ! ${code} 稀有度差異：英文 ${card.rarity} / 簡中 ${cn.rarityName}`);
  }
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

/** 把中文資料掛到卡片上。 */
function attachLocales(card, cn, twNames) {
  if (!cn) return { cn: null, tw: null };

  assertTaxonomyAgrees(card, cn);

  const cnText = parseCnText(cn.cardEffect);
  const cnName = requireString(cn.cardName, 'cardName', card.code);
  const cnSubtitle = typeof cn.subTitle === 'string' && cn.subTitle !== '' ? cn.subTitle : null;
  const cnFlavor = typeof cn.flavorText === 'string' && cn.flavorText !== '' ? cn.flavorText : null;

  // 繁中卡名：優先使用社群整理的官方繁中譯名；沒有的話退而求其次逐字轉繁。
  const baseCode = `${card.set}-${String(card.number).padStart(3, '0')}`;
  const twEntry = twNames[baseCode];
  const hasOfficialTwName = Boolean(twEntry?.name);

  /*
   * 冠軍卡的繁中名是「阿璃-誘人」這種「名字-副標」合併寫法，
   * 拆開後才能跟英文（Ahri, Alluring）與簡中（阿狸／嫣然狐媚）一致呈現。
   * 只有在簡中確實有副標時才拆，避免誤切本來就含連字號的卡名。
   */
  const splitTwName = (full) => {
    if (cnSubtitle === null) return { name: full, subtitle: null };
    const m = /^(.+?)[-－—](.+)$/.exec(full);
    return m ? { name: m[1], subtitle: m[2] } : { name: full, subtitle: null };
  };

  return {
    cn: {
      name: cnName,
      subtitle: cnSubtitle,
      text: cnText,
      flavor: cnFlavor,
      image: normalizeCnImage(cn.frontImage, card.code),
    },
    tw: {
      ...(hasOfficialTwName
        ? splitTwName(twEntry.name)
        : {
            name: toTraditional(cnName),
            subtitle: cnSubtitle === null ? null : toTraditional(cnSubtitle),
          }),
      // 讓介面能誠實標示這個譯名是哪來的
      nameSource: hasOfficialTwName ? 'community' : 'converted',
      text: convertBlocksToTraditional(cnText, toTraditional),
      textSource: 'converted',
      flavor: cnFlavor === null ? null : toTraditional(cnFlavor),
    },
  };
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

async function main() {
  console.log('▶ 從 Riot 官方公開 API 抓取卡牌資料…');

  const raw = [];
  let from = 0;
  let total = Infinity;
  let pages = 0;

  while (from < total) {
    const url = `${API_BASE}${API_PATH}?locale=en_US&from=${from}&limit=${PAGE_SIZE}`;
    const body = await fetchJson(url);
    if (!Array.isArray(body?.data)) fail(`API 回應缺少 data 陣列：${url}`);
    total = requireInt(body?.metadata?.totalItems, 'metadata.totalItems');
    if (body.data.length === 0) break; // 已經抓完，提早收工
    raw.push(...body.data);
    from += PAGE_SIZE;
    pages += 1;
    if (pages > 20) fail('分頁次數異常過多，中止以免無限迴圈');
  }
  console.log(`  ✓ 取得 ${raw.length} 張卡（${pages} 頁）`);

  // 官方 metadata.totalItems 會把尚未公開的佔位項目也算進去，
  // 因此實際回傳筆數通常會少一些。這不是錯誤，只是記錄下來備查。
  // 真正的完整性保證來自下方各系列的張數檢查。
  if (raw.length !== total) {
    console.log(`    （官方 metadata 宣稱 ${total} 筆，差額為尚未公開的項目）`);
  }
  if (raw.length === 0) fail('API 沒有回傳任何卡片');

  const wanted = raw.filter((c) => Object.keys(WANTED_SETS).includes(c?.set?.value?.id));
  console.log(`  ✓ 篩出 Origins 系列 ${wanted.length} 張，開始驗證…`);

  const cards = wanted.map(normalizeCard);

  // 網址會用 id 當作路由參數，必須唯一。
  const seen = new Map();
  for (const card of cards) {
    if (seen.has(card.id)) fail(`id 重複："${card.id}"（${seen.get(card.id)} 與 ${card.code}）`);
    seen.set(card.id, card.code);
  }

  // 張數必須與預期相符，官方改動時要讓我們知道。
  for (const [setId, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = cards.filter((c) => c.set === setId).length;
    if (actual !== expected) {
      fail(
        `${setId} 張數為 ${actual}，與預期的 ${expected} 不符。` +
          `\n  若官方確實新增/調整了卡片，請確認內容後更新 scripts/fetch-cards.mjs 的 EXPECTED_COUNTS。`,
      );
    }
    console.log(`  ✓ ${setId} (${WANTED_SETS[setId]}): ${actual} 張`);
  }

  cards.sort((a, b) => (a.set === b.set ? a.number - b.number : a.set.localeCompare(b.set)));

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
  const cnMap = await fetchSimplifiedChinese(Object.keys(WANTED_SETS));
  console.log(`  ✓ 取得官方簡中卡牌 ${cnMap.size} 張`);

  const baseCodes = [
    ...new Set(cards.map((c) => `${c.set}-${String(c.number).padStart(3, '0')}`)),
  ].sort();
  const twNames = await fetchTraditionalNames(
    baseCodes,
    join(ROOT, 'src', 'data', 'zh-tw-names.json'),
    process.argv.includes('--refresh-tw'),
  );

  let cnMatched = 0;
  let twOfficial = 0;
  for (const card of cards) {
    const cn = cnMap.get(card.code) ?? null;
    if (cn) cnMatched += 1;
    card.zh = attachLocales(card, cn, twNames);
    if (card.zh.tw?.nameSource === 'community') twOfficial += 1;
  }

  if (cnMatched !== cards.length) {
    const missing = cards.filter((c) => !cnMap.has(c.code)).map((c) => c.code);
    fail(
      `有 ${missing.length} 張卡找不到對應的官方簡中資料：${missing.slice(0, 10).join('、')}` +
        `\n  官方兩邊的卡號應該完全對應，出現落差代表資料格式改變了。`,
    );
  }
  console.log(`  ✓ 簡中對應 ${cnMatched}/${cards.length} 張，繁中卡名 ${twOfficial} 張有社群譯名`);

  await downloadGlyphs();

  const taxonomy = buildTaxonomy(cards);
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
