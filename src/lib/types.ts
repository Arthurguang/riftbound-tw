/**
 * 卡牌資料的型別定義。
 *
 * 這些型別對應 scripts/fetch-cards.mjs 的輸出。
 * 兩邊的允許清單必須一致 —— tests/card-data.test.ts 會驗證這件事。
 */

export const CARD_TYPES = ['unit', 'spell', 'legend', 'gear', 'battlefield', 'rune'] as const;
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'showcase'] as const;
export const DOMAINS = ['calm', 'chaos', 'fury', 'body', 'mind', 'order', 'colorless'] as const;
export const SET_IDS = ['OGN', 'OGS'] as const;

export const GLYPH_IDS = [
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
] as const;

export const KEYWORDS = [
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
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type Rarity = (typeof RARITIES)[number];
export type Domain = (typeof DOMAINS)[number];
export type SetId = (typeof SET_IDS)[number];
export type GlyphId = (typeof GLYPH_IDS)[number];
export type Keyword = (typeof KEYWORDS)[number];

/**
 * 能力文字的最小單位。
 *
 * 重點：這裡沒有任何 HTML 字串。官方回傳的 HTML 已經在建置階段
 * （scripts/lib/card-text-parser.mjs）被拆成這些 token，
 * 因此前端渲染時完全不需要 dangerouslySetInnerHTML。
 */
export type CardTextNode =
  | { type: 'text'; value: string }
  | { type: 'break' }
  | { type: 'glyph'; id: GlyphId }
  | { type: 'keyword'; name: Keyword; value?: number };

export type CardTextBlock =
  | { kind: 'paragraph'; tokens: CardTextNode[] }
  | { kind: 'list'; items: CardTextNode[][] };

/**
 * 一張卡的中文資料。
 *
 * 簡中全部來自中國大陸官方發行商；繁中的卡名來自台灣社群整理的官方實體卡譯名，
 * 能力文字則是由官方簡中逐字轉繁（官方尚未推出繁中線上資料）。
 * nameSource / textSource 讓介面能誠實標示每段文字的來歷。
 */
export type SimplifiedLocale = {
  name: string;
  subtitle: string | null;
  text: CardTextBlock[];
  flavor: string | null;
  /** 官方簡中卡面圖（Tencent COS），沒有的話為 null。 */
  image: string | null;
};

export type TraditionalLocale = {
  name: string;
  subtitle: string | null;
  /** 'community' = 台灣社群整理的官方實體卡譯名；'converted' = 簡轉繁 */
  nameSource: 'community' | 'converted';
  text: CardTextBlock[];
  /** 目前一律為 'converted'：官方尚未推出繁中線上卡牌資料。 */
  textSource: 'converted';
  flavor: string | null;
};

export type Card = {
  /** 網址用的識別碼，例如 "ogn-056-298"。保證唯一且只含 [a-z0-9-]。 */
  id: string;
  /** 官方卡號，例如 "OGN-056/298"。 */
  code: string;
  /** 收藏編號的數字部分。 */
  number: number;
  /** 變體標記（"a"、"*" 等），一般卡為 null。 */
  variant: string | null;
  name: string;
  set: SetId;
  types: CardType[];
  rarity: Rarity;
  domains: Domain[];
  tags: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  orientation: 'portrait' | 'landscape';
  text: CardTextBlock[];
  artists: string[];
  image: {
    url: string;
    width: number;
    height: number;
    /** 官方提供的無障礙描述。 */
    alt: string | null;
  };
  /** 中文資料。 */
  zh: {
    cn: SimplifiedLocale | null;
    tw: TraditionalLocale | null;
  };
};

export type Taxonomy = {
  sets: { id: SetId; name: string; count: number }[];
  types: CardType[];
  domains: Domain[];
  rarities: Rarity[];
  tags: string[];
  /**
   * 標籤的中文對照。
   * src 標示繁中譯名的來源：'official'（Riot 官方 / 台服正式譯名）或 'converted'（簡轉繁）。
   */
  tagLabels: Record<string, { cn: string; tw: string; src: 'official' | 'converted' }>;
  energies: number[];
  mights: number[];
  powers: number[];
  glyphs: GlyphId[];
};
