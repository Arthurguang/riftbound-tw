/**
 * 分類法的三語對照。
 *
 * ── 來源說明 ──────────────────────────────────────────────────────
 * 簡中：全部取自中國大陸官方發行商的資料（Riot Games × 闪魂）。
 * 繁中：官方尚未推出繁中的線上卡牌資料，因此：
 *        · 英雄名取自 Riot 官方 Data Dragon 的 zh_TW 語系（標籤在 taxonomy.json）
 *        · 地區名為《英雄聯盟》台服正式譯名
 *        · 卡種／稀有度／關鍵字為官方簡中的逐字轉繁
 *        · 領域在中文版卡面上是以顏色標示，因此中文一律顯示顏色
 */

import type { CardType, Domain, GlyphId, Keyword, Rarity, SetId } from './types';
import type { TextLang } from './i18n';

type Tri = Record<TextLang, string>;

const tri = (tw: string, cn: string, en: string): Tri => ({ 'zh-TW': tw, 'zh-CN': cn, en });

export const SET_LABELS: Record<SetId, Tri> = {
  OGN: tri('起源', '起源', 'Origins'),
  OGS: tri('試煉場', '试炼场', 'Proving Grounds'),
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
 * 領域。
 *
 * 英文卡面用領域名（Fury / Calm …），中文卡面則直接用顏色標示，
 * 所以中文顯示顏色才符合玩家手上的實體卡。
 */
export const DOMAIN_LABELS: Record<Domain, Tri> = {
  fury: tri('紅色', '红色', 'Fury'),
  calm: tri('綠色', '绿色', 'Calm'),
  mind: tri('藍色', '蓝色', 'Mind'),
  body: tri('橙色', '橙色', 'Body'),
  chaos: tri('紫色', '紫色', 'Chaos'),
  order: tri('黃色', '黄色', 'Order'),
  colorless: tri('無色', '无色', 'Colorless'),
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
  Accelerate: tri('急速', '急速', 'Accelerate'),
  Action: tri('迅捷', '迅捷', 'Action'),
  Add: tri('獲得', '获得', 'Add'),
  Assault: tri('強攻', '强攻', 'Assault'),
  Deathknell: tri('絕念', '绝念', 'Deathknell'),
  Deflect: tri('法盾', '法盾', 'Deflect'),
  Ganking: tri('遊走', '游走', 'Ganking'),
  Hidden: tri('待命', '待命', 'Hidden'),
  Legion: tri('鼓舞', '鼓舞', 'Legion'),
  Mighty: tri('強力', '强力', 'Mighty'),
  Reaction: tri('反應', '反应', 'Reaction'),
  Shield: tri('堅守', '坚守', 'Shield'),
  Tank: tri('壁壘', '壁垒', 'Tank'),
  Temporary: tri('瞬息', '瞬息', 'Temporary'),
  Vision: tri('預知', '预知', 'Vision'),
};

export const GLYPH_LABELS: Record<GlyphId, Tri> = {
  might: tri('力量', '战力', 'Might'),
  exhaust: tri('橫置', '横置', 'Exhaust'),
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
