/**
 * 規則頁的文字內容。
 *
 * ── 為什麼這一頁是「速查 + 官方連結」而不是整本規則書的翻譯 ──
 *
 * 兩個理由，都很實際：
 *
 * 1. 版權。把 Riot 的規則書整本轉載或翻譯放上同人站，正是最容易被要求下架的行為。
 *    同人站該做的是「幫玩家更快找到並理解官方規則」，不是取代它。
 *
 * 2. 正確性。官方沒有推出繁中規則書，我如果憑理解翻譯，錯了也沒人會發現。
 *    開發這一頁時就出過這種事：關鍵字說明我原本手寫了十五條，
 *    後來拿官方卡面原文比對，其中五條是錯的。
 *
 * 所以這一頁只放兩種東西：
 *   · 能明確引用來源的事實（下面每條都標了出處）
 *   · 直接取自官方卡面的關鍵字說明（由建置腳本自動抽取，非手寫）
 * 其餘一律連到官方原文。
 */

import type { TextLang } from './i18n';

type Tri = Record<TextLang, string>;
const tri = (tw: string, cn: string, en: string): Tri => ({ 'zh-TW': tw, 'zh-CN': cn, en });

/** 官方規則文件連結。 */
export const OFFICIAL_LINKS = [
  {
    href: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf',
    label: tri('完整規則書 Core Rules（PDF）', '完整规则书 Core Rules（PDF）', 'Core Rules (PDF)'),
    note: tri('官方唯一具權威性的規則文件', '官方唯一具权威性的规则文件', 'The authoritative rules document'),
  },
  {
    href: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/503da65669ced10598d62925a6f6bc15111af726.pdf',
    label: tri('賽事規則 Tournament Rules（PDF）', '赛事规则 Tournament Rules（PDF）', 'Tournament Rules (PDF)'),
    note: tri('參加官方賽事前必讀', '参加官方赛事前必读', 'Required reading before official events'),
  },
  {
    href: 'https://playriftbound.com/en-us/rules-hub/',
    label: tri('官方規則中心 Rules Hub', '官方规则中心 Rules Hub', 'Official Rules Hub'),
    note: tri('規則更新、勘誤與裁定都在這裡', '规则更新、勘误与裁定都在这里', 'Updates, errata, and rulings'),
  },
  {
    href: 'https://playriftbound.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/',
    label: tri('起源系列卡牌勘誤', '起源系列卡牌勘误', 'Origins Card Errata'),
    note: tri('少數卡牌的實際文字與印刷不同', '少数卡牌的实际文字与印刷不同', 'A few cards differ from their printing'),
  },
];

/** 頁面上各區塊的標題與說明文字。 */
export const RULES_STRINGS = {
  title: tri('規則說明', '规则说明', 'Rules'),
  intro: tri(
    '這一頁是速查用的。完整且具權威性的規則以官方 Core Rules 為準 —— 有爭議時請以官方文件為依據。',
    '这一页是速查用的。完整且具权威性的规则以官方 Core Rules 为准 —— 有争议时请以官方文件为依据。',
    'This page is a quick reference. The official Core Rules are authoritative — defer to them in any dispute.',
  ),

  basicsTitle: tri('遊戲概要', '游戏概要', 'The Basics'),
  basicsNote: tri(
    '以下每一條都標了出處，沒有出處的內容不會寫在這裡。',
    '以下每一条都标了出处，没有出处的内容不会写在这里。',
    'Every statement below cites its source. Nothing unsourced appears here.',
  ),

  glossaryTitle: tri('關鍵字辭典', '关键字词典', 'Keyword Glossary'),
  glossaryNote: tri(
    '以下說明直接取自官方印在卡面上的提醒文字，由建置程式自動擷取，不是本站自行撰寫的。官方調整措辭時會一併更新。',
    '以下说明直接取自官方印在卡面上的提醒文字，由构建程序自动提取，不是本站自行撰写的。官方调整措辞时会一并更新。',
    'These definitions are taken directly from the reminder text Riot prints on the cards, extracted automatically at build time. They are not written by this site.',
  ),
  glossarySearch: tri('搜尋關鍵字', '搜索关键字', 'Search keywords'),
  glossaryNoResult: tri('找不到符合的關鍵字。', '找不到符合的关键字。', 'No matching keyword.'),
  noOfficialText: tri(
    '官方卡面未提供這個關鍵字的說明，請參閱官方規則書。',
    '官方卡面未提供这个关键字的说明，请参阅官方规则书。',
    'The cards do not print reminder text for this keyword — see the official Core Rules.',
  ),
  usedOnCards: tri('使用這個關鍵字的卡牌', '使用这个关键字的卡牌', 'Cards with this keyword'),

  glyphsTitle: tri('符號說明', '符号说明', 'Symbols'),
  glyphsNote: tri(
    '卡面上的符號對照。',
    '卡面上的符号对照。',
    'The symbols printed on cards.',
  ),

  linksTitle: tri('官方規則文件', '官方规则文件', 'Official Rules Documents'),
  linksNote: tri(
    '本站不轉載官方規則書全文。要查完整規則請直接看官方文件。',
    '本站不转载官方规则书全文。要查完整规则请直接看官方文件。',
    'This site does not reproduce the rulebook. For the full rules, read the official documents.',
  ),
} as const;

/**
 * 遊戲概要。
 *
 * 每一條都必須有 source（出處），沒有出處的規則說明不放進來 ——
 * 這是這一頁的硬性規定。
 */
export const BASICS: { text: Tri; source: Tri }[] = [
  {
    text: tri(
      '拿到 8 分就獲勝（多人團隊賽為 11 分）。',
      '拿到 8 分就获胜（多人团队赛为 11 分）。',
      'Reach 8 points to win (11 in team games).',
    ),
    source: tri('官方新手指南', '官方新手指南', 'Official Quick Start Guide'),
  },
  {
    text: tri(
      '分數來自控制戰場：每維持控制一個戰場，每回合得 1 分。',
      '分数来自控制战场：每维持控制一个战场，每回合得 1 分。',
      'Points come from battlefields: hold one and score 1 point per turn.',
    ),
    source: tri('官方新手指南', '官方新手指南', 'Official Quick Start Guide'),
  },
  {
    text: tri(
      '每個回合會獲得兩個新的符文，符文是支付費用的資源。',
      '每个回合会获得两个新的符文，符文是支付费用的资源。',
      'You gain two new runes each turn; runes pay for your cards.',
    ),
    source: tri('官方新手指南', '官方新手指南', 'Official Quick Start Guide'),
  },
  {
    text: tri(
      '單位用「力量」在戰鬥中造成傷害；戰鬥結束時只剩你有單位存活，你就贏得這場戰鬥。',
      '单位用「战力」在战斗中造成伤害；战斗结束时只剩你有单位存活，你就赢得这场战斗。',
      'Units deal damage with their Might. If only your units remain standing, you win the fight.',
    ),
    source: tri('官方新手指南', '官方新手指南', 'Official Quick Start Guide'),
  },
  {
    text: tri(
      '牌組以一張「傳奇」為核心，傳奇決定你能使用哪些領域（顏色）的卡。',
      '卡组以一张「传奇」为核心，传奇决定你能使用哪些领域（颜色）的卡。',
      'A deck is built around a Legend, which determines the domains (colors) you may use.',
    ),
    source: tri('官方新手指南', '官方新手指南', 'Official Quick Start Guide'),
  },
];
