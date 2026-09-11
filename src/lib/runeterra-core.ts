/**
 * 符文陣圖的核心常數 —— 可以放進瀏覽器端元件的那一半。
 *
 * ── 為什麼拆成兩個檔案 ──────────────────────────────────────────
 * 這裡只放「不需要卡牌資料」的東西：環的排列、對立關係、顏色、文字。
 * 需要讀卡牌資料的統計放在 runeterra.ts。
 *
 * 分開是為了**不把整份卡牌 JSON 打包進首頁的瀏覽器程式**：
 * 客戶端元件只要一 import 到 cards.ts，幾百 KB 的卡牌資料就會跟著進去。
 *
 * ── 這個圖形從哪來 ──────────────────────────────────────────────
 * 六大領域兩兩相對（熾烈↔翠意、靈光↔摧破、混沌↔序理），這是官方設定。
 * 扣掉三組對立，六個領域兩兩配對剩下 12 種組合；起源系列（OGN）的
 * 12 位傳奇剛好一人一種、不重複。把六個領域排成一圈，12 條連線就是
 * 一個六邊形加一個六芒星。
 *
 * **環上的排列順序是本站的設計，不是官方設定** —— 只保證對立的兩個相對而立。
 */

import type { TextLang } from './i18n';
import type { Card, Domain } from './types';

/** 遊戲裡真正有意義的六個領域（去掉「無特性」）。 */
export type PlayDomain = Exclude<Domain, 'colorless'>;

/** 環上的排列：索引 i 與 i+3 一定互為對立。 */
export const RING: readonly PlayDomain[] = ['fury', 'mind', 'chaos', 'calm', 'body', 'order'];

/** 官方的對立關係。 */
export const OPPOSITE: Readonly<Record<PlayDomain, PlayDomain>> = {
  fury: 'calm',
  calm: 'fury',
  mind: 'body',
  body: 'mind',
  chaos: 'order',
  order: 'chaos',
};

/** 與 globals.css 的 .domain-dot--* 同一組色碼（也與中文實體卡面一致）。 */
export const DOMAIN_COLOR: Readonly<Record<PlayDomain, string>> = {
  fury: '#e0533d',
  calm: '#4fae63',
  mind: '#3da8c8',
  body: '#e08a3d',
  chaos: '#a05fd6',
  order: '#d8b23f',
};

type Tri = Readonly<Record<TextLang, string>>;

/** 陣圖上用的短名稱（不帶顏色括號）。 */
export const DOMAIN_SHORT: Readonly<Record<PlayDomain, Tri>> = {
  fury: { 'zh-TW': '熾烈', 'zh-CN': '炽烈', en: 'Fury' },
  calm: { 'zh-TW': '翠意', 'zh-CN': '翠意', en: 'Calm' },
  mind: { 'zh-TW': '靈光', 'zh-CN': '灵光', en: 'Mind' },
  body: { 'zh-TW': '摧破', 'zh-CN': '摧破', en: 'Body' },
  chaos: { 'zh-TW': '混沌', 'zh-CN': '混沌', en: 'Chaos' },
  order: { 'zh-TW': '序理', 'zh-CN': '序理', en: 'Order' },
};

/**
 * 各領域的風格描述。
 *
 * **這是本站整理的文字，不是官方文案**，介面上會標明。
 * 內容描述的是「這個領域的卡傾向怎麼玩」，不是規則 —— 所以不引條號。
 */
export const DOMAIN_ESSENCE: Readonly<Record<PlayDomain, Tri>> = {
  fury: {
    'zh-TW': '進攻、激情與征服。擅長用傷害清場，單位一出場就能行動。',
    'zh-CN': '进攻、激情与征服。擅长用伤害清场，单位一出场就能行动。',
    en: 'Aggression, passion and conquest — damage-based removal and units that act the moment they land.',
  },
  mind: {
    'zh-TW': '智取而非力敵。用法術、詭計與干擾打亂對手，掌控整局的節奏。',
    'zh-CN': '智取而非力敌。用法术、诡计与干扰打乱对手，掌控整局的节奏。',
    en: 'Outsmart rather than overpower — spells, tricks and disruption that control the tempo.',
  },
  chaos: {
    'zh-TW': '隱匿與變數。讓雙方都棄牌，再從廢牌堆把牌撈回來。',
    'zh-CN': '隐匿与变数。让双方都弃牌，再从废牌堆把牌捞回来。',
    en: 'Concealment and variance — discard for both players, then pull cards back out of the trash.',
  },
  calm: {
    'zh-TW': '平衡、耐心、守住陣地。先看清對手要做什麼，再在對的時刻回應。',
    'zh-CN': '平衡、耐心、守住阵地。先看清对手要做什么，再在对的时刻回应。',
    en: 'Balance, patience and holding ground — read the opponent, then answer at the right moment.',
  },
  body: {
    'zh-TW': '最直接的力量：部署單位、進攻戰場、贏下每一場戰鬥。',
    'zh-CN': '最直接的力量：部署单位、进攻战场、赢下每一场战斗。',
    en: 'Direct strength — deploy units, attack battlefields, win the fight.',
  },
  order: {
    'zh-TW': '有組織的推進。成群的單位一起向前，犧牲一名單位往往能換來更多價值。',
    'zh-CN': '有组织的推进。成群的单位一起向前，牺牲一名单位往往能换来更多价值。',
    en: 'Organised advance — units moving together, trading one away for greater value.',
  },
};

export function isPlayDomain(domain: Domain): domain is PlayDomain {
  return domain !== 'colorless';
}

/** 一張卡的遊戲領域（去掉無特性）。 */
export function playDomains(card: Pick<Card, 'domains'>): PlayDomain[] {
  return card.domains.filter(isPlayDomain);
}

/** 兩個領域配對的識別字，與順序無關。 */
export function pairKey(a: PlayDomain, b: PlayDomain): string {
  return [a, b].sort().join('+');
}

/** 所有不對立的領域配對 —— 應該剛好 12 組。 */
export function nonOppositePairs(): [PlayDomain, PlayDomain][] {
  const out: [PlayDomain, PlayDomain][] = [];
  RING.forEach((a, i) => {
    for (const b of RING.slice(i + 1)) {
      if (OPPOSITE[a] !== b) out.push([a, b]);
    }
  });
  return out;
}
