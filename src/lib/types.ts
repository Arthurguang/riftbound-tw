/**
 * 卡牌資料的型別定義。
 *
 * 這些型別對應 scripts/fetch-cards.mjs 的輸出。
 * 兩邊的允許清單必須一致 —— tests/card-data.test.ts 會驗證這件事。
 */

export const CARD_TYPES = ['unit', 'spell', 'legend', 'gear', 'battlefield', 'rune'] as const;
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'showcase'] as const;
export const DOMAINS = ['calm', 'chaos', 'fury', 'body', 'mind', 'order', 'colorless'] as const;
/**
 * 收錄的系列。2026-10-13 起收錄官方提供的全部六個系列。
 * 順序就是顯示順序：起源在前，之後依推出時間。
 */
export const SET_IDS = ['OGN', 'OGS', 'RAD', 'SFD', 'UNL', 'VEN'] as const;

export const GLYPH_IDS = [
  'might',
  'exhaust',
  'energy_0',
  'energy_1',
  'energy_2',
  'energy_3',
  'energy_4',
  'energy_5',
  // 2026-10-13 新系列（Vendetta 的高費卡）帶來的能量符號
  'energy_6',
  'energy_7',
  'energy_8',
  'energy_12',
  'rune_body',
  'rune_calm',
  'rune_chaos',
  'rune_fury',
  'rune_mind',
  'rune_order',
  'rune_rainbow',
] as const;

/**
 * 官方關鍵字。
 *
 * 2026-10-13 隨四個新系列（Radiance／Spiritforged／Unleashed／Vendetta）
 * 新增 18 個。名稱一律照官方英文原文，包含含空格（Show Off）與連字號（Quick-Draw）的那幾個 ——
 * 解析器的格式檢查要跟著放寬，見 scripts/lib/card-text-parser.mjs。
 */
export const KEYWORDS = [
  'Accelerate',
  'Action',
  'Add',
  'Ambush',
  'Assault',
  'Backline',
  'Buff',
  'Burn',
  'Deathknell',
  'Deflect',
  'Deploy',
  'Disarm',
  'Empower',
  'Empowered',
  'Equip',
  'Flow',
  'Ganking',
  'Hidden',
  'Hunt',
  'Legion',
  'Level',
  'Mighty',
  'Predict',
  'Quick-Draw',
  'Reaction',
  'Repeat',
  'Shield',
  'Show Off',
  'Stun',
  'Tank',
  'Temporary',
  'Unique',
  'Vision',
  'Weaponmaster',
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
  /**
   * 卡號裡數字前面的字母，一般卡為 null。
   *
   * 2026-10-13 四個新系列帶進三種特殊編號：
   *   T  衍生物（UNL-T01）
   *   R  符文（VEN-R04、RAD-R04a）
   *   SP 特別卡（VEN-SP3/006）
   *
   * ⚠️ 這個欄位必須進分享用的短代碼，否則 `UNL-T01` 與 `UNL-001` 會撞成同一碼，
   * 分享出去的牌組會解析到**錯的卡**（見 deck-url.ts 的 shortCode）。
   */
  codePrefix: 'T' | 'R' | 'SP' | null;
  /** 變體標記（"a"、"*" 等），一般卡為 null。 */
  variant: string | null;
  name: string;
  /**
   * 英雄卡的副標（Annie **, Fiery**）。沒有副標的卡為 null。
   *
   * 2026-10-13 官方把英文卡名拆成 name + subtitle（以前合在 name 裡）。
   * 顯示與比對請用 card-name.ts 的 fullCardName()，不要只用 name ——
   * 全卡池有 145 個卡名被多張卡共用，只比 name 會對到錯的卡。
   */
  subtitle: string | null;
  set: SetId;
  types: CardType[];
  /**
   * 細分身分。英文版 API 沒有這個區分，取自官方簡中資料。
   * 牌組合法性檢查需要它：選定英雄必須是 champion（核心規則 103.2.a.2），
   * 專屬卡有總數上限（103.2.d），指示物不能放進牌組。
   */
  subtype: 'champion' | 'signature' | 'token' | null;
  rarity: Rarity;
  domains: Domain[];
  tags: string[];
  /**
   * tags 裡代表「哪位英雄」的那一個，沒有就是 null。
   *
   * 傳奇卡一定有（建置階段驗證，見 scripts/fetch-cards.mjs 的 attachChampionTags）——
   * 牌表上的卡名要靠它組出來（Ziggs, Hexplosives Expert）。
   * 不能用 tags[0]：新系列的傳奇會同時帶種族標籤（["Yordle","Ziggs"]）。
   */
  championTag: string | null;
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
   * 關鍵字辭典。
   *
   * 內容抽取自官方卡面上的提醒文字（見 scripts/fetch-cards.mjs），
   * 不是任何人手寫的。source 的三種值：
   *   'official-card-text'          官方英文與簡中卡面都有，三種語言齊全
   *   'official-card-text-en-only'  只有英文卡面有（官方簡中還沒收錄帶這個關鍵字的卡）
   *   'none'                        官方卡面完全沒有說明
   * 介面上會誠實標示並指向官方規則書。
   */
  keywords: Record<
    string,
    {
      en: string | null;
      cn: string | null;
      tw: string | null;
      source: 'official-card-text' | 'official-card-text-en-only' | 'none';
    }
  >;
  /**
   * 標籤的中文對照。
   * src 標示繁中譯名的來源：
   *   'official'   Riot 官方 / 台服正式譯名
   *   'converted'  簡轉繁
   *   'english'    兩邊官方中文都還沒有，直接沿用英文原文
   */
  tagLabels: Record<string, { cn: string; tw: string; src: 'official' | 'converted' | 'english' }>;
  energies: number[];
  mights: number[];
  powers: number[];
  glyphs: GlyphId[];
};
