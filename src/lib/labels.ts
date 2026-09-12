/**
 * 分類法的三語對照。
 *
 * ── 來源說明 ──────────────────────────────────────────────────────
 * 簡中：全部取自中國大陸官方發行商的資料（Riot Games × 闪魂）。
 * 繁中：以**官方繁體中文核心規則書**為準（2026-07-16 版，playriftbound.com/zh-tw/rules-hub）。
 *        · 英雄名取自 Riot 官方 Data Dragon 的 zh_TW 語系（標籤在 taxonomy.json）
 *        · 地區名為《英雄聯盟》台服正式譯名
 *
 * ── 為什麼繁中有兩套官方用語 ──────────────────────────────────
 * Riot 的繁中規則書是獨立翻譯的，但**繁中實體卡的文字是由官方簡中逐字轉繁**，
 * 兩者對不上。同一個關鍵字，規則書寫「加速」，卡面印「急速」。
 *
 * 本站一律採規則書用語 —— 裁決以規則書為準，那才是有爭議時算數的版本。
 * 卡面實際印的字另外收在 CARD_FACE_TW，介面上並列標示，
 * 玩家才不會以為自己拿錯卡。這是繁中玩家目前最常問的問題。
 *
 * 2026-09-12 實測：官方卡牌資料端點帶 locale=zh_TW 回傳的卡名與卡圖，
 * 與 en_US 完全相同 —— 官方線上並沒有繁中卡牌資料或繁中卡圖。
 */

import type { CardType, Domain, GlyphId, Keyword, Rarity, SetId } from './types';
import type { TextLang } from './i18n';

type Tri = Record<TextLang, string>;

const tri = (tw: string, cn: string, en: string): Tri => ({ 'zh-TW': tw, 'zh-CN': cn, en });

export const SET_LABELS: Record<SetId, Tri> = {
  OGN: tri('起源', '起源', 'Origins'),
  OGS: tri('試煉之地', '试炼之地', 'Proving Grounds'),
};

export const TYPE_LABELS: Record<CardType, Tri> = {
  unit: tri('單位', '单位', 'Unit'),
  spell: tri('法術', '法术', 'Spell'),
  legend: tri('傳奇', '传奇', 'Legend'),
  gear: tri('裝備', '装备', 'Gear'),
  battlefield: tri('戰場', '战场', 'Battlefield'),
  rune: tri('符文', '符文', 'Rune'),
};

/**
 * 流派（繁中規則書用語；簡中規則書稱「符文特性」）。
 *
 * 繁中名稱取自官方繁體中文核心規則書：狂怒＝紅、止靜＝綠、心智＝藍、
 * 身軀＝橙、渾沌＝紫、秩序＝黃（規則書裡「流派」出現 70 次，「領域」0 次）。
 * 簡中名稱取自官方簡中核心規則 134.2。
 *
 * 繁中卡面印的是另一套（熾烈／翠意／靈光／摧破／混沌／序理，簡中轉繁而來），
 * 收在 CARD_FACE_TW，介面上並列。
 *
 * 這裡採用「正式名稱（顏色）」的寫法：正式名稱是規則書用語，
 * 顏色則是玩家在卡面上實際看到的識別方式，兩者都需要。
 *
 * 「無流派」不是第七個流派 —— 官方規則 134.1 說「大多數卡牌擁有一個或多個」，
 * 135.2.e.6.b 提到「如果卡牌沒有流派⋯」，可見沒有流派是合法狀態。
 * 這類卡不受流派限制，任何牌組都能放（見 src/lib/deck-rules.ts）。
 */
export const DOMAIN_LABELS: Record<Domain, Tri> = {
  fury: tri('狂怒（紅）', '炽烈（红）', 'Fury'),
  calm: tri('止靜（綠）', '翠意（绿）', 'Calm'),
  mind: tri('心智（藍）', '灵光（蓝）', 'Mind'),
  body: tri('身軀（橙）', '摧破（橙）', 'Body'),
  chaos: tri('渾沌（紫）', '混沌（紫）', 'Chaos'),
  order: tri('秩序（黃）', '序理（黄）', 'Order'),
  colorless: tri('無流派', '无特性', 'Colorless'),
};

/**
 * 繁中卡面上實際印的字（只收「跟規則書不一樣」的）。
 *
 * 繁中實體卡的文字是官方簡中逐字轉繁，沒有在地化；規則書則是獨立翻譯。
 * 玩家手上拿的是卡片，查裁決看的是規則書 —— 兩邊對不上時會以為自己看錯，
 * 所以介面上兩個都要出現，而且要講清楚哪個是哪個。
 */
export const CARD_FACE_TW: Partial<Record<Domain | Keyword | 'might' | 'exhaust', string>> = {
  fury: '熾烈',
  calm: '翠意',
  mind: '靈光',
  body: '摧破',
  chaos: '混沌',
  order: '序理',
  Accelerate: '急速',
  Action: '迅捷',
  Assault: '強攻',
  Deathknell: '絕念',
  Legion: '鼓舞',
  Mighty: '強力',
  Tank: '壁壘',
  Vision: '預知',
  might: '力量',
  exhaust: '橫置',
};

/**
 * 領域代表色。
 *
 * 這些顏色不是設計選擇，而是遊戲本身的規則 ——
 * 官方簡中資料就是直接用 red / green / blue / orange / purple / yellow
 * 來標示領域的（見 scripts/lib/taxonomy-map.mjs 的 DOMAIN_BY_CN_COLOR）。
 */
export const DOMAIN_COLORS: Record<Domain, string> = {
  fury: '#e0533d',
  calm: '#4fae63',
  mind: '#3da8c8',
  body: '#e08a3d',
  chaos: '#a05fd6',
  order: '#d8b23f',
  colorless: '#8a8f98',
};

export const RARITY_LABELS: Record<Rarity, Tri> = {
  common: tri('普通', '普通', 'Common'),
  uncommon: tri('不凡', '不凡', 'Uncommon'),
  rare: tri('稀有', '稀有', 'Rare'),
  epic: tri('史詩', '史诗', 'Epic'),
  showcase: tri('異畫', '异画', 'Showcase'),
};

/** 稀有度由低到高的排序權重。 */
export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  showcase: 4,
};

/**
 * 關鍵字的三語「名稱」。
 *
 * ⚠️ 這裡只放名稱，不放解釋。
 *
 * 原本這裡有我手寫的關鍵字說明，事後拿官方卡面原文比對，
 * 十五個裡有五個是錯的（例如把 Shield 寫成「吸收傷害」，
 * 官方其實是「防守方時 +1 力量」）。憑印象寫遊戲規則不可靠。
 *
 * 現在解釋一律來自官方卡面上的提醒文字，由建置腳本自動抽取到
 * taxonomy.json 的 keywords 欄位，官方改措辭時我們會跟著更新。
 */
export const KEYWORD_LABELS: Record<Keyword, Tri> = {
  Accelerate: tri('加速', '急速', 'Accelerate'),
  Action: tri('行動', '迅捷', 'Action'),
  Add: tri('獲得', '获得', 'Add'),
  Assault: tri('強襲', '强攻', 'Assault'),
  Deathknell: tri('喪鐘', '绝念', 'Deathknell'),
  Deflect: tri('法盾', '法盾', 'Deflect'),
  Ganking: tri('遊走', '游走', 'Ganking'),
  // 「待命」是 Hidden。規則書另有「潛伏」是 Ambush —— 兩個不同的關鍵字，別對調。
  Hidden: tri('待命', '待命', 'Hidden'),
  Legion: tri('軍團', '鼓舞', 'Legion'),
  Mighty: tri('強大', '强力', 'Mighty'),
  Reaction: tri('反應', '反应', 'Reaction'),
  Shield: tri('堅守', '坚守', 'Shield'),
  Tank: tri('坦克', '壁垒', 'Tank'),
  Temporary: tri('瞬息', '瞬息', 'Temporary'),
  Vision: tri('預視', '预知', 'Vision'),
};

export const GLYPH_LABELS: Record<GlyphId, Tri> = {
  might: tri('戰力', '战力', 'Might'),
  exhaust: tri('休眠', '横置', 'Exhaust'),
  energy_0: tri('0 點能量', '0 点能量', '0 Energy'),
  energy_1: tri('1 點能量', '1 点能量', '1 Energy'),
  energy_2: tri('2 點能量', '2 点能量', '2 Energy'),
  energy_3: tri('3 點能量', '3 点能量', '3 Energy'),
  energy_4: tri('4 點能量', '4 点能量', '4 Energy'),
  energy_5: tri('5 點能量', '5 点能量', '5 Energy'),
  rune_body: tri('橙色符文', '橙色符文', 'Body Rune'),
  rune_calm: tri('綠色符文', '绿色符文', 'Calm Rune'),
  rune_chaos: tri('紫色符文', '紫色符文', 'Chaos Rune'),
  rune_fury: tri('紅色符文', '红色符文', 'Fury Rune'),
  rune_mind: tri('藍色符文', '蓝色符文', 'Mind Rune'),
  rune_order: tri('黃色符文', '黄色符文', 'Order Rune'),
  rune_rainbow: tri('任意符文', '任意符文', 'Any Rune'),
};

/** 從三語對照取出指定語言的字串。 */
export function pick(labels: Tri, lang: TextLang): string {
  return labels[lang];
}
