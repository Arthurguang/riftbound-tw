/**
 * 英文 ⇄ 簡體中文 ⇄ 繁體中文 的分類法對照表。
 *
 * ── 資料來源與可信度 ──────────────────────────────────────────────
 *
 * 簡中（zh-CN）：全部來自中國大陸官方發行商的 API（lol-api.playloltcg.com）。
 *   下面的對照關係不是我猜的，是把 376 張卡的中英資料逐張對齊後統計出來的
 *   （顏色、卡種、稀有度、關鍵字都是無衝突的 1:1；標籤用 Jaccard 相似度，
 *   65 個裡有 64 個相似度 ≥ 0.9）。fetch-cards.mjs 會在每次建置時重新驗證。
 *
 * 繁中（zh-TW）：官方沒有推出繁中的線上卡牌資料庫（繁中版 2026-08-07 才上市，
 *   目前只有實體卡），因此每個詞的來源都標記清楚：
 *     'official'  — 英雄名取自 Riot 官方 Data Dragon 的 zh_TW 語系；
 *                   地區名為《英雄聯盟》台服長期使用的正式譯名。
 *     'converted' — 由官方簡中逐字轉換為繁體，用詞未在地化。
 *   介面上會標示哪些是轉換而來的，不會假裝它們是官方譯名。
 */

/** 領域：官方簡中用顏色表示，英文版用領域名。 */
export const DOMAIN_BY_CN_COLOR = Object.freeze({
  red: 'fury',
  green: 'calm',
  blue: 'mind',
  orange: 'body',
  purple: 'chaos',
  yellow: 'order',
  colorless: 'colorless',
});

/** 卡種：簡中把英雄單位、指示物單位等細分，英文版統一為 unit。 */
export const TYPE_BY_CN_CATEGORY = Object.freeze({
  单位: 'unit',
  英雄单位: 'unit',
  指示物单位: 'unit',
  专属单位: 'unit',
  法术: 'spell',
  专属法术: 'spell',
  符文: 'rune',
  装备: 'gear',
  传奇: 'legend',
  战场: 'battlefield',
});

export const RARITY_BY_CN = Object.freeze({
  普通: 'common',
  不凡: 'uncommon',
  稀有: 'rare',
  史诗: 'epic',
  异画: 'showcase',
});

/** 能力文字裡的關鍵字：簡中 token → 英文關鍵字。 */
export const KEYWORD_BY_CN = Object.freeze({
  急速: 'Accelerate',
  迅捷: 'Action',
  获得: 'Add',
  强攻: 'Assault',
  绝念: 'Deathknell',
  法盾: 'Deflect',
  游走: 'Ganking',
  待命: 'Hidden',
  鼓舞: 'Legion',
  强力: 'Mighty',
  反应: 'Reaction',
  坚守: 'Shield',
  壁垒: 'Tank',
  瞬息: 'Temporary',
  预知: 'Vision',
});

/** 能力文字裡的符號 token（簡中）→ 本站的符號 id。 */
export const GLYPH_BY_CN_TOKEN = Object.freeze({
  S: 'might',
  横置: 'exhaust',
  0: 'energy_0',
  1: 'energy_1',
  2: 'energy_2',
  3: 'energy_3',
  4: 'energy_4',
  5: 'energy_5',
  红色: 'rune_fury',
  绿色: 'rune_calm',
  蓝色: 'rune_mind',
  橙色: 'rune_body',
  紫色: 'rune_chaos',
  黄色: 'rune_order',
  A: 'rune_rainbow',
});

/**
 * 標籤對照。
 *
 * cn ── 官方簡中（由資料對齊統計得出，建置時會重新驗證）
 * tw ── 繁中
 * src ─ 繁中譯名的來源：'official'（Riot 官方 / 台服正式譯名）或 'converted'（簡轉繁）
 */
export const TAGS = Object.freeze({
  // ── 英雄（繁中取自 Riot 官方 Data Dragon 的 zh_TW 語系） ──
  Ahri: { cn: '阿狸', tw: '阿璃', src: 'official' },
  Anivia: { cn: '艾尼维亚', tw: '艾妮維亞', src: 'official' },
  Annie: { cn: '安妮', tw: '安妮', src: 'official' },
  Blitzcrank: { cn: '布里茨', tw: '布里茨', src: 'official' },
  Caitlyn: { cn: '凯特琳', tw: '凱特琳', src: 'official' },
  Darius: { cn: '德莱厄斯', tw: '達瑞斯', src: 'official' },
  'Dr. Mundo': { cn: '蒙多医生', tw: '蒙多醫生', src: 'official' },
  Draven: { cn: '德莱文', tw: '達瑞文', src: 'official' },
  Ekko: { cn: '艾克', tw: '艾克', src: 'official' },
  Fiora: { cn: '菲奥娜', tw: '菲歐拉', src: 'official' },
  Garen: { cn: '盖伦', tw: '蓋倫', src: 'official' },
  Heimerdinger: { cn: '黑默丁格', tw: '漢默丁格', src: 'official' },
  Jinx: { cn: '金克丝', tw: '吉茵珂絲', src: 'official' },
  "Kai'Sa": { cn: '卡莎', tw: '凱莎', src: 'official' },
  Karthus: { cn: '卡尔萨斯', tw: '卡爾瑟斯', src: 'official' },
  Kayn: { cn: '凯隐', tw: '慨影', src: 'official' },
  "Kog'Maw": { cn: '克格莫', tw: '寇格魔', src: 'official' },
  'Lee Sin': { cn: '李青', tw: '李星', src: 'official' },
  Leona: { cn: '蕾欧娜', tw: '雷歐娜', src: 'official' },
  Lux: { cn: '拉克丝', tw: '拉克絲', src: 'official' },
  Malzahar: { cn: '玛尔扎哈', tw: '馬爾札哈', src: 'official' },
  'Master Yi': { cn: '易', tw: '易大師', src: 'official' },
  'Miss Fortune': { cn: '厄运小姐', tw: '好運姐', src: 'official' },
  Nocturne: { cn: '魔腾', tw: '夜曲', src: 'official' },
  Qiyana: { cn: '奇亚娜', tw: '姬亞娜', src: 'official' },
  Sett: { cn: '瑟提', tw: '賽特', src: 'official' },
  Shen: { cn: '慎', tw: '慎', src: 'official' },
  Sona: { cn: '娑娜', tw: '索娜', src: 'official' },
  Taric: { cn: '塔里克', tw: '塔里克', src: 'official' },
  Teemo: { cn: '提莫', tw: '提摩', src: 'official' },
  Tryndamere: { cn: '泰达米尔', tw: '泰達米爾', src: 'official' },
  'Twisted Fate': { cn: '崔斯特', tw: '逆命', src: 'official' },
  Udyr: { cn: '乌迪尔', tw: '烏迪爾', src: 'official' },
  Vayne: { cn: '薇恩', tw: '汎', src: 'official' },
  Vi: { cn: '蔚', tw: '菲艾', src: 'official' },
  Viktor: { cn: '维克托', tw: '維克特', src: 'official' },
  Volibear: { cn: '沃利贝尔', tw: '弗力貝爾', src: 'official' },
  Warwick: { cn: '沃里克', tw: '沃維克', src: 'official' },
  Yasuo: { cn: '亚索', tw: '犽宿', src: 'official' },

  // ── 地區（《英雄聯盟》台服長期使用的正式譯名） ──
  'Bandle City': { cn: '班德尔城', tw: '班德爾城', src: 'official' },
  Bilgewater: { cn: '比尔吉沃特', tw: '比爾吉沃特', src: 'official' },
  Demacia: { cn: '德玛西亚', tw: '德瑪西亞', src: 'official' },
  Freljord: { cn: '弗雷尔卓德', tw: '弗雷爾卓德', src: 'official' },
  Ionia: { cn: '艾欧尼亚', tw: '愛歐尼亞', src: 'official' },
  Ixtal: { cn: '以绪塔尔', tw: '伊薩爾', src: 'official' },
  'Mount Targon': { cn: '巨神峰', tw: '巨神峰', src: 'official' },
  Noxus: { cn: '诺克萨斯', tw: '諾克薩斯', src: 'official' },
  Piltover: { cn: '皮尔特沃夫', tw: '皮爾托福', src: 'official' },
  'Shadow Isles': { cn: '暗影岛', tw: '暗影島', src: 'official' },
  Shurima: { cn: '恕瑞玛', tw: '恕瑞瑪', src: 'official' },
  'The Void': { cn: '虚空之地', tw: '虛空', src: 'official' },
  Zaun: { cn: '祖安', tw: '祖安', src: 'official' },

  // ── 特徵標籤 ──
  Bird: { cn: '鸟类', tw: '鳥類', src: 'converted' },
  Cat: { cn: '猫科', tw: '貓科', src: 'converted' },
  Dog: { cn: '犬形', tw: '犬形', src: 'converted' },
  Dragon: { cn: '龙', tw: '龍', src: 'converted' },
  Elite: { cn: '精锐', tw: '精銳', src: 'converted' },
  Fae: { cn: '仙灵', tw: '仙靈', src: 'converted' },
  Mech: { cn: '机械', tw: '機械', src: 'converted' },
  Pirate: { cn: '海盗', tw: '海盜', src: 'converted' },
  Poro: { cn: '魄罗', tw: '波羅', src: 'official' },
  Recruit: { cn: '随从', tw: '隨從', src: 'converted' },
  Spirit: { cn: '灵体', tw: '靈體', src: 'converted' },
  Trifarian: { cn: '崔法利', tw: '崔法利', src: 'converted' },
  Yordle: { cn: '约德尔人', tw: '約德爾人', src: 'official' },
});
