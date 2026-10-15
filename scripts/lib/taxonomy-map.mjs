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
  // 2026-10-13 新系列：簡中改用 neutral 表示無流派（英文仍是 colorless，例 RAD-167 妮可）
  neutral: 'colorless',
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
  // 2026-10-13 新系列：綁定特定英雄的裝備（例如 RAD-156 嘉文四世的「德瑪西亞軍旗」）
  专属装备: 'gear',
  指示物装备: 'gear',
  传奇: 'legend',
  战场: 'battlefield',
  指示物战场: 'battlefield',
});

/**
 * 卡牌的細分類型。
 *
 * 英文版 API 只給大類（unit / spell / …），但官方簡中把「英雄單位」「專屬卡」
 * 「指示物」分得很清楚，而牌組合法性檢查**需要**這個區分：
 *
 *   · 選定英雄必須是「英雄單位」，且英雄標籤與傳奇一致（核心規則 103.2.a.2）
 *   · 專屬卡全卡組最多三張（核心規則 103.2.d）
 *   · 指示物不是可放進牌組的卡
 *
 * null 代表沒有特殊身分的一般卡。
 */
export const SUBTYPE_BY_CN_CATEGORY = Object.freeze({
  英雄单位: 'champion',
  专属单位: 'signature',
  专属法术: 'signature',
  专属装备: 'signature',
  指示物装备: 'token',
  指示物战场: 'token',
  指示物单位: 'token',
});

export const RARITY_BY_CN = Object.freeze({
  普通: 'common',
  不凡: 'uncommon',
  稀有: 'rare',
  史诗: 'epic',
  异画: 'showcase',
});

/**
 * 簡中能力文字裡被括起來、但其實是**標籤**而不是關鍵字的字。
 *
 * 簡中會把標籤也括起來（SFD-182「让你的[机械]属性单位…」），
 * 英文版同一句卻寫成一般文字（"your Mech units"）。
 * 逐個列舉而不是「不認得就當文字」—— 後者會讓真正的新關鍵字被靜靜吞掉。
 *
 * 中國大陸發行商的資料（cn-text-parser）與 Riot 官方 zh_CN（card-text-parser）共用這一份。
 */
export const CN_TAG_TOKENS = Object.freeze(new Set(['机械']));

/** 能力文字裡的關鍵字：簡中 token → 英文關鍵字。 */
export const KEYWORD_BY_CN = Object.freeze({
  急速: 'Accelerate',
  迅捷: 'Action',
  获得: 'Add',
  伏击: 'Ambush',
  强攻: 'Assault',
  后排: 'Backline',
  增益: 'Buff',
  燃烧: 'Burn',
  绝念: 'Deathknell',
  法盾: 'Deflect',
  部署: 'Deploy',
  缴械: 'Disarm',
  强化: 'Empower',
  已强化: 'Empowered',
  装配: 'Equip',
  流转: 'Flow',
  游走: 'Ganking',
  待命: 'Hidden',
  狩猎: 'Hunt',
  鼓舞: 'Legion',
  等级: 'Level',
  强力: 'Mighty',
  洞察: 'Predict',
  灵便: 'Quick-Draw',
  反应: 'Reaction',
  回响: 'Repeat',
  坚守: 'Shield',
  亮出: 'Show Off',
  眩晕: 'Stun',
  壁垒: 'Tank',
  瞬息: 'Temporary',
  唯我: 'Unique',
  预知: 'Vision',
  百炼: 'Weaponmaster',
});

/** 能力文字裡的符號 token（簡中）→ 本站的符號 id。 */
export const GLYPH_BY_CN_TOKEN = Object.freeze({
  S: 'might',
  横置: 'exhaust',
  /*
   * 2026-10-13 的新系列改用單字母寫法，與舊系列並存。對照是比對同一張卡的英文版確認的：
   *   T  RAD-027 簡「{{T}}：给予一名单位{{增益}}」＝ 英「:rb_exhaust:: [Buff] a unit」
   *   A  RAD-036 簡「对手必须支付{{A}}」＝ 英「Opponents must pay :rb_rune_rainbow:」
   * （另有 {{C}}＝「這張卡自己流派的符文」，因為要看卡片才知道是哪一色，
   *   處理寫在 cn-text-parser.mjs 而不是這張表。）
   */
  T: 'exhaust',
  // SFD-206 的官方資料把 {{S}} 寫成小寫 {{s}}（全站僅此一處），比照處理
  s: 'might',
  A: 'rune_rainbow',
  0: 'energy_0',
  1: 'energy_1',
  2: 'energy_2',
  3: 'energy_3',
  4: 'energy_4',
  5: 'energy_5',
  6: 'energy_6',
  7: 'energy_7',
  8: 'energy_8',
  12: 'energy_12',
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

  // ── 2026-10-13 四個新系列的英雄（同樣取自 Data Dragon zh_TW／zh_CN） ──
  Akali: { cn: '阿卡丽', tw: '阿卡莉', src: 'official' },
  Akshan: { cn: '阿克尚', tw: '埃可尚', src: 'official' },
  Ambessa: { cn: '安蓓萨', tw: '安比薩', src: 'official' },
  Aphelios: { cn: '厄斐琉斯', tw: '亞菲利歐', src: 'official' },
  Ashe: { cn: '艾希', tw: '艾希', src: 'official' },
  Azir: { cn: '阿兹尔', tw: '阿祈爾', src: 'official' },
  Bard: { cn: '巴德', tw: '巴德', src: 'official' },
  Diana: { cn: '黛安娜', tw: '黛安娜', src: 'official' },
  Evelynn: { cn: '伊芙琳', tw: '伊芙琳', src: 'official' },
  Ezreal: { cn: '伊泽瑞尔', tw: '伊澤瑞爾', src: 'official' },
  Fizz: { cn: '菲兹', tw: '飛斯', src: 'official' },
  Galio: { cn: '加里奥', tw: '加里歐', src: 'official' },
  Gangplank: { cn: '普朗克', tw: '剛普朗克', src: 'official' },
  Graves: { cn: '格雷福斯', tw: '葛雷夫', src: 'official' },
  Hwei: { cn: '彗', tw: '赫威', src: 'official' },
  Illaoi: { cn: '俄洛伊', tw: '伊羅旖', src: 'official' },
  Irelia: { cn: '艾瑞莉娅', tw: '伊瑞莉雅', src: 'official' },
  Ivern: { cn: '艾翁', tw: '埃爾文', src: 'official' },
  Janna: { cn: '迦娜', tw: '珍娜', src: 'official' },
  'Jarvan IV': { cn: '嘉文四世', tw: '嘉文四世', src: 'official' },
  Jax: { cn: '贾克斯', tw: '賈克斯', src: 'official' },
  Jayce: { cn: '杰斯', tw: '杰西', src: 'official' },
  Jhin: { cn: '烬', tw: '燼', src: 'official' },
  "K'Sante": { cn: '奎桑提', tw: '卡桑帝', src: 'official' },
  Karma: { cn: '卡尔玛', tw: '卡瑪', src: 'official' },
  Katarina: { cn: '卡特琳娜', tw: '卡特蓮娜', src: 'official' },
  Kayle: { cn: '凯尔', tw: '凱爾', src: 'official' },
  Kennen: { cn: '凯南', tw: '凱能', src: 'official' },
  "Kha'Zix": { cn: '卡兹克', tw: '卡力斯', src: 'official' },
  LeBlanc: { cn: '乐芙兰', tw: '勒布朗', src: 'official' },
  Lillia: { cn: '莉莉娅', tw: '莉莉亞', src: 'official' },
  Lucian: { cn: '卢锡安', tw: '路西恩', src: 'official' },
  Lulu: { cn: '璐璐', tw: '露璐', src: 'official' },
  Mel: { cn: '梅尔', tw: '梅爾', src: 'official' },
  Mordekaiser: { cn: '莫德凯撒', tw: '魔鬥凱薩', src: 'official' },
  Morgana: { cn: '莫甘娜', tw: '魔甘娜', src: 'official' },
  Nami: { cn: '娜美', tw: '娜米', src: 'official' },
  Nasus: { cn: '内瑟斯', tw: '納瑟斯', src: 'official' },
  Neeko: { cn: '妮蔻', tw: '妮可', src: 'official' },
  Nidalee: { cn: '奈德丽', tw: '奈德麗', src: 'official' },
  Nilah: { cn: '尼菈', tw: '淣菈', src: 'official' },
  Orianna: { cn: '奥莉安娜', tw: '奧莉安娜', src: 'official' },
  Ornn: { cn: '奥恩', tw: '鄂爾', src: 'official' },
  Poppy: { cn: '波比', tw: '波比', src: 'official' },
  Pyke: { cn: '派克', tw: '派克', src: 'official' },
  "Rek'Sai": { cn: '雷克塞', tw: '雷珂煞', src: 'official' },
  Rell: { cn: '芮尔', tw: '銳兒', src: 'official' },
  'Renata Glasc': { cn: '烈娜塔 · 戈拉斯克', tw: '睿娜妲‧格萊斯克', src: 'official' },
  Renekton: { cn: '雷克顿', tw: '雷尼克頓', src: 'official' },
  Rengar: { cn: '雷恩加尔', tw: '雷葛爾', src: 'official' },
  Riven: { cn: '锐雯', tw: '雷玟', src: 'official' },
  Rumble: { cn: '兰博', tw: '藍寶', src: 'official' },
  Seraphine: { cn: '萨勒芬妮', tw: '瑟菈紛', src: 'official' },
  Sivir: { cn: '希维尔', tw: '希維爾', src: 'official' },
  Soraka: { cn: '索拉卡', tw: '索拉卡', src: 'official' },
  Swain: { cn: '斯维因', tw: '斯溫', src: 'official' },
  Syndra: { cn: '辛德拉', tw: '星朵拉', src: 'official' },
  Vex: { cn: '薇古丝', tw: '薇可絲', src: 'official' },
  Xerath: { cn: '泽拉斯', tw: '齊勒斯', src: 'official' },
  'Xin Zhao': { cn: '赵信', tw: '趙信', src: 'official' },
  Yone: { cn: '永恩', tw: '犽凝', src: 'official' },
  Yuumi: { cn: '悠米', tw: '悠咪', src: 'official' },
  Zed: { cn: '劫', tw: '劫', src: 'official' },
  Ziggs: { cn: '吉格斯', tw: '希格斯', src: 'official' },
  Zilean: { cn: '基兰', tw: '極靈', src: 'official' },

  // ── 新系列的其他標籤：簡中取自中國大陸官方站，繁中為逐字轉換 ──
  Demon: { cn: '恶魔', tw: '惡魔', src: 'converted' },
  Equipment: { cn: '武装', tw: '武裝', src: 'converted' },
  Icathia: { cn: '艾卡西亚', tw: '艾卡西亞', src: 'converted' },
  Kathkan: { cn: '喀斯坎', tw: '喀斯坎', src: 'converted' },
  Sentinel: { cn: '哨兵', tw: '哨兵', src: 'converted' },
  Spider: { cn: '蜘蛛', tw: '蜘蛛', src: 'converted' },

  /*
   * Device：官方中英文資料都查過，**沒有任何官方中文**
   * （中國大陸官方站把這些卡歸在「装备」類別，但沒有對應的標籤）。
   * 依照本站「沒有官方譯名就顯示英文」的原則保留英文，有了官方譯名再補。
   */
  Device: { cn: 'Device', tw: 'Device', src: 'english' },
});
