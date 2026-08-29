/**
 * 多語系設定。
 *
 * 本站有兩個獨立的語言選項：
 *   1. 文字語言（textLang）—— 介面、卡名、能力文字
 *   2. 卡圖語言（artLang）—— 要看英文卡面還是簡體中文卡面
 *
 * 兩者分開是刻意的：很多台灣玩家看繁中介面，但手上的實體卡是英文版，
 * 也有人相反。硬把兩者綁在一起只會兩邊都不順手。
 *
 * 狀態存在網址（?lang=&art=），因此可以直接分享連結，
 * 也不需要 cookie 或 localStorage。
 */

export const TEXT_LANGS = ['zh-TW', 'zh-CN', 'en'] as const;
export const ART_LANGS = ['en', 'zh-CN'] as const;

export type TextLang = (typeof TEXT_LANGS)[number];
export type ArtLang = (typeof ART_LANGS)[number];

export const DEFAULT_TEXT_LANG: TextLang = 'zh-TW';
export const DEFAULT_ART_LANG: ArtLang = 'en';

export const TEXT_LANG_LABELS: Record<TextLang, string> = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  en: 'English',
};

export const ART_LANG_LABELS: Record<ArtLang, string> = {
  en: '英文卡面',
  'zh-CN': '简体中文卡面',
};

export function isTextLang(value: string): value is TextLang {
  return (TEXT_LANGS as readonly string[]).includes(value);
}

export function isArtLang(value: string): value is ArtLang {
  return (ART_LANGS as readonly string[]).includes(value);
}

export function readTextLang(params: URLSearchParams | { lang?: string }): TextLang {
  const raw = params instanceof URLSearchParams ? (params.get('lang') ?? '') : (params.lang ?? '');
  return isTextLang(raw) ? raw : DEFAULT_TEXT_LANG;
}

export function readArtLang(params: URLSearchParams | { art?: string }): ArtLang {
  const raw = params instanceof URLSearchParams ? (params.get('art') ?? '') : (params.art ?? '');
  return isArtLang(raw) ? raw : DEFAULT_ART_LANG;
}

/** html 標籤的 lang 屬性值。 */
export const HTML_LANG: Record<TextLang, string> = {
  'zh-TW': 'zh-Hant-TW',
  'zh-CN': 'zh-Hans-CN',
  en: 'en',
};

// ─── 介面文字 ────────────────────────────────────────────────────────────

type UiStrings = {
  siteName: string;
  siteTagline: string;
  navGallery: string;
  galleryTitle: string;
  gallerySubtitle: (count: number) => string;
  searchLabel: string;
  searchPlaceholder: string;
  sortLabel: string;
  showFilters: string;
  hideFilters: string;
  resultCount: (count: number) => string;
  clearFilters: string;
  noResults: string;
  backToGallery: string;
  abilityText: string;
  noAbilityText: string;
  flavorText: string;
  domain: string;
  set: string;
  tags: string;
  artist: string;
  otherVersions: (count: number) => string;
  openFullImage: string;
  energy: string;
  might: string;
  power: string;
  language: string;
  cardArt: string;
  convertedNotice: string;
  convertedNoticeShort: string;
  communityNameNotice: string;
  skipToContent: string;
  notFoundTitle: string;
  notFoundBody: string;
  loading: string;
  filterSet: string;
  filterType: string;
  filterDomain: string;
  filterRarity: string;
  filterEnergy: string;
  filterMight: string;
  filterTags: (count: number) => string;
};

const ZH_TW: UiStrings = {
  siteName: '符文戰場資料庫',
  siteTagline: 'Riftbound · 繁體中文玩家資源',
  navGallery: '卡牌圖鑑',
  galleryTitle: '卡牌圖鑑',
  gallerySubtitle: (n) => `起源系列（Origins）與試煉場（Proving Grounds）共 ${n} 張卡。`,
  searchLabel: '搜尋卡牌',
  searchPlaceholder: '搜尋卡名、能力文字、標籤或繪師（中英文皆可）',
  sortLabel: '排序方式',
  showFilters: '展開篩選',
  hideFilters: '收合篩選',
  resultCount: (n) => `符合條件：${n} 張`,
  clearFilters: '清除所有條件',
  noResults: '找不到符合條件的卡牌。試著放寬篩選條件，或換個關鍵字。',
  backToGallery: '回到卡牌圖鑑',
  abilityText: '能力文字',
  noAbilityText: '（這張卡沒有能力文字）',
  flavorText: '背景敘述',
  domain: '領域',
  set: '系列',
  tags: '標籤',
  artist: '繪師',
  otherVersions: (n) => `其他版本（${n}）`,
  openFullImage: '點擊卡圖可開啟官方原始尺寸圖片',
  energy: '能量費用',
  might: '力量',
  power: '威力',
  language: '文字語言',
  cardArt: '卡面語言',
  convertedNotice:
    '此能力文字由官方簡體中文逐字轉為繁體，用詞未在地化。官方目前尚未推出繁中的線上卡牌資料。',
  convertedNoticeShort: '簡轉繁',
  communityNameNotice: '繁中卡名由台灣社群整理自官方實體卡',
  skipToContent: '跳到主要內容',
  notFoundTitle: '找不到這個頁面',
  notFoundBody: '這張卡片可能不存在，或是網址打錯了。',
  loading: '載入卡牌資料…',
  filterSet: '系列',
  filterType: '卡種',
  filterDomain: '領域',
  filterRarity: '稀有度',
  filterEnergy: '能量',
  filterMight: '力量',
  filterTags: (n) => `標籤（${n}）`,
};

const ZH_CN: UiStrings = {
  siteName: '符文战场资料库',
  siteTagline: 'Riftbound · 玩家资源',
  navGallery: '卡牌图鉴',
  galleryTitle: '卡牌图鉴',
  gallerySubtitle: (n) => `起源系列（Origins）与试炼场（Proving Grounds）共 ${n} 张卡。`,
  searchLabel: '搜索卡牌',
  searchPlaceholder: '搜索卡名、技能文字、标签或画师（中英文皆可）',
  sortLabel: '排序方式',
  showFilters: '展开筛选',
  hideFilters: '收起筛选',
  resultCount: (n) => `符合条件：${n} 张`,
  clearFilters: '清除所有条件',
  noResults: '找不到符合条件的卡牌。试着放宽筛选条件，或换个关键字。',
  backToGallery: '回到卡牌图鉴',
  abilityText: '技能文字',
  noAbilityText: '（这张卡没有技能文字）',
  flavorText: '背景故事',
  domain: '颜色',
  set: '系列',
  tags: '标签',
  artist: '画师',
  otherVersions: (n) => `其他版本（${n}）`,
  openFullImage: '点击卡图可打开官方原始尺寸图片',
  energy: '能量费用',
  might: '战力',
  power: '威力',
  language: '文字语言',
  cardArt: '卡面语言',
  convertedNotice: '',
  convertedNoticeShort: '',
  communityNameNotice: '',
  skipToContent: '跳到主要内容',
  notFoundTitle: '找不到这个页面',
  notFoundBody: '这张卡片可能不存在，或者网址打错了。',
  loading: '加载卡牌资料…',
  filterSet: '系列',
  filterType: '类型',
  filterDomain: '颜色',
  filterRarity: '稀有度',
  filterEnergy: '费用',
  filterMight: '战力',
  filterTags: (n) => `标签（${n}）`,
};

const EN: UiStrings = {
  siteName: 'Riftbound Card Database',
  siteTagline: 'Riftbound · Player Resource',
  navGallery: 'Card Gallery',
  galleryTitle: 'Card Gallery',
  gallerySubtitle: (n) => `${n} cards from Origins and Proving Grounds.`,
  searchLabel: 'Search cards',
  searchPlaceholder: 'Search name, ability text, tags, or artist',
  sortLabel: 'Sort by',
  showFilters: 'Show filters',
  hideFilters: 'Hide filters',
  resultCount: (n) => `${n} cards`,
  clearFilters: 'Clear all filters',
  noResults: 'No cards match these filters. Try broadening them or using a different keyword.',
  backToGallery: 'Back to card gallery',
  abilityText: 'Ability',
  noAbilityText: '(This card has no ability text.)',
  flavorText: 'Flavor text',
  domain: 'Domain',
  set: 'Set',
  tags: 'Tags',
  artist: 'Artist',
  otherVersions: (n) => `Other versions (${n})`,
  openFullImage: 'Click the card to open the official full-size image',
  energy: 'Energy cost',
  might: 'Might',
  power: 'Power',
  language: 'Text language',
  cardArt: 'Card art',
  convertedNotice: '',
  convertedNoticeShort: '',
  communityNameNotice: '',
  skipToContent: 'Skip to main content',
  notFoundTitle: 'Page not found',
  notFoundBody: 'This card may not exist, or the URL is wrong.',
  loading: 'Loading cards…',
  filterSet: 'Set',
  filterType: 'Type',
  filterDomain: 'Domain',
  filterRarity: 'Rarity',
  filterEnergy: 'Energy',
  filterMight: 'Might',
  filterTags: (n) => `Tags (${n})`,
};

const STRINGS: Record<TextLang, UiStrings> = { 'zh-TW': ZH_TW, 'zh-CN': ZH_CN, en: EN };

export function t(lang: TextLang): UiStrings {
  return STRINGS[lang];
}
