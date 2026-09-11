/**
 * 符文大地（Runeterra）的區域資料與卡池統計 —— 只在伺服器端使用。
 *
 * 會讀卡牌資料，所以**不要從客戶端元件 import 這個檔案**
 * （原因見 runeterra-core.ts 開頭）。
 *
 * ── 哪些是資料、哪些是本站寫的 ──────────────────────────────────
 * 算出來的（不手寫）：傳奇與其領域、各區域的卡數、領域分佈、英雄名單。
 * 本站整理的：區域簡介與氛圍色。介面上會標明簡介不是官方文案。
 *
 * 英雄名單刻意只用「卡片上真的帶有這個區域標籤的英雄卡」，不憑世界觀記憶補 ——
 * 例如達瑞斯在設定上是諾克薩斯人，但他的卡沒有標諾克薩斯，這裡就不列。
 * 寧可少列，也不要讓介面說出一句資料撐不住的話。
 */

import { TAXONOMY } from './cards';
import type { TextLang } from './i18n';
import type { Card } from './types';
import { isPlayDomain, playDomains, type PlayDomain } from './runeterra-core';

type Tri = Readonly<Record<TextLang, string>>;

export type RegionMeta = {
  /** 卡牌資料裡的區域標籤，一字不差。 */
  tag: string;
  /** 氛圍色：只用在區域的小色塊，不當功能色。 */
  color: string;
  lore: Tri;
};

export const REGIONS: readonly RegionMeta[] = [
  {
    tag: 'Ionia',
    color: '#d98fa8',
    lore: {
      'zh-TW': '第一之地。追求萬物的平衡，靈界與物質界的邊界在這裡最薄。',
      'zh-CN': '第一之地。追求万物的平衡，灵界与物质界的边界在这里最薄。',
      en: 'The First Lands, where balance is sought in all things and the veil between spirit and matter is thinnest.',
    },
  },
  {
    tag: 'Bilgewater',
    color: '#3a8a93',
    lore: {
      'zh-TW': '海盜、賞金獵人與海怪聚集的港口，靠自由貿易與不要命的膽識立足。',
      'zh-CN': '海盗、赏金猎人与海怪聚集的港口，靠自由贸易与不要命的胆识立足。',
      en: 'A port of pirates, bounty hunters and sea monsters, built on free trade and reckless nerve.',
    },
  },
  {
    tag: 'Noxus',
    color: '#b3262e',
    lore: {
      'zh-TW': '以力量論成敗的擴張帝國。出身不重要，能贏才重要。',
      'zh-CN': '以力量论成败的扩张帝国。出身不重要，能赢才重要。',
      en: 'An expansionist empire that measures worth by strength. Birth matters less than victory.',
    },
  },
  {
    tag: 'Zaun',
    color: '#7cc242',
    lore: {
      'zh-TW': '皮爾托福腳下的化工地下城，混亂又危險，卻也滿是瘋狂的發明。',
      'zh-CN': '皮尔特沃夫脚下的化工地下城，混乱又危险，却也满是疯狂的发明。',
      en: 'The chemical undercity beneath Piltover — chaotic, dangerous and full of wild invention.',
    },
  },
  {
    tag: 'Mount Targon',
    color: '#f2d27a',
    lore: {
      'zh-TW': '通往天界的聖山。信奉太陽與信奉月亮的兩派，在此長年對立。',
      'zh-CN': '通往天界的圣山。信奉太阳与信奉月亮的两派，在此长年对立。',
      en: 'A sacred peak reaching the heavens, where followers of the sun and the moon have long stood opposed.',
    },
  },
  {
    tag: 'Freljord',
    color: '#8fc3dd',
    lore: {
      'zh-TW': '冰封的北境。驕傲而獨立的部族，在嚴寒裡爭奪生存。',
      'zh-CN': '冰封的北境。骄傲而独立的部族，在严寒里争夺生存。',
      en: 'The frozen north, where proud and fiercely independent tribes fight to survive the cold.',
    },
  },
  {
    tag: 'Demacia',
    color: '#d9dfe8',
    lore: {
      'zh-TW': '崇尚秩序與正義的王國，以守護為己任，卻對魔法心懷戒懼。',
      'zh-CN': '崇尚秩序与正义的王国，以守护为己任，却对魔法心怀戒惧。',
      en: 'A kingdom of order and justice, sworn to protect — and deeply wary of magic.',
    },
  },
  {
    tag: 'Bandle City',
    color: '#e6a3d6',
    lore: {
      'zh-TW': '約德爾人的家園。沒人知道它確切在哪，只知道它的門通往世界各處。',
      'zh-CN': '约德尔人的家园。没人知道它确切在哪，只知道它的门通往世界各处。',
      en: 'Home of the yordles. No one knows exactly where it is — only that its doors open onto every corner of the world.',
    },
  },
  {
    tag: 'Shadow Isles',
    color: '#4cc9a8',
    lore: {
      'zh-TW': '曾經美麗的群島，被黑霧吞沒；亡魂在霧中收割生者。',
      'zh-CN': '曾经美丽的群岛，被黑雾吞没；亡魂在雾中收割生者。',
      en: 'Once-beautiful isles swallowed by the Black Mist, where wraiths reap the living.',
    },
  },
  {
    tag: 'Piltover',
    color: '#c9974a',
    lore: {
      'zh-TW': '進步之城。海克斯科技、貿易與發明的中心。',
      'zh-CN': '进步之城。海克斯科技、贸易与发明的中心。',
      en: 'The City of Progress — a centre of hextech, trade and invention.',
    },
  },
  {
    tag: 'The Void',
    color: '#7a45d6',
    lore: {
      'zh-TW': '世界誕生之前就存在的虛無。被它觸及的，再也回不去。',
      'zh-CN': '世界诞生之前就存在的虚无。被它触及的，再也回不去。',
      en: 'A nothingness older than the world. Whatever it touches is never the same again.',
    },
  },
  {
    tag: 'Shurima',
    color: '#e0ae45',
    lore: {
      'zh-TW': '曾經輝煌的沙漠帝國，城市埋在沙下，只在傳說裡延續。',
      'zh-CN': '曾经辉煌的沙漠帝国，城市埋在沙下，只在传说里延续。',
      en: 'A once-glorious desert empire whose cities lie beneath the sand, alive only in legend.',
    },
  },
  {
    tag: 'Ixtal',
    color: '#2f9e6a',
    lore: {
      'zh-TW': '元素魔法最強盛的叢林之地，以魔法築起屏障，隔絕外人。',
      'zh-CN': '元素魔法最强盛的丛林之地，以魔法筑起屏障，隔绝外人。',
      en: 'A jungle realm of the strongest elemental magic, walled off from outsiders by its own spells.',
    },
  },
];

const REGION_TAGS = new Set(REGIONS.map((r) => r.tag));

/** 標籤的顯示名稱（英文介面直接用標籤本身）。 */
export function tagLabel(tag: string, lang: TextLang): string {
  if (lang === 'en') return tag;
  const label = TAXONOMY.tagLabels[tag];
  if (!label) return tag;
  return lang === 'zh-TW' ? label.tw : label.cn;
}

/**
 * 同一張卡的異畫版、超框版在資料裡是不同的紀錄，而且不一定有 variant 標記。
 * 統計時以卡名去重，才不會把同一張卡算兩次。
 */
function uniqueByName(cards: readonly Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of [...cards].sort((a, b) => a.number - b.number)) {
    if (seen.has(card.name)) continue;
    seen.add(card.name);
    out.push(card);
  }
  return out;
}

/**
 * 所有傳奇，每位一張（同名的異畫版只算一次）。
 *
 * **數量不寫死**：新系列加入傳奇時，首頁自動跟著變。
 * 排列：起源系列在前、試煉場在後，同系列依卡號。
 */
export function allLegends(cards: readonly Card[]): Card[] {
  const setOrder = (card: Card) => (card.set === 'OGN' ? 0 : 1);
  return uniqueByName(
    cards.filter((c) => c.types.includes('legend') && playDomains(c).length === 2),
  ).sort((a, b) => setOrder(a) - setOrder(b) || a.number - b.number);
}

/** 一張英雄相關卡上的英雄標籤（不是區域的那個標籤）。 */
export function championTagOf(card: Card): string | null {
  return card.tags.find((t) => !REGION_TAGS.has(t)) ?? null;
}

/** 英雄卡上標的區域；卡上沒標就回 null，不憑世界觀猜。 */
export function regionOfChampion(cards: readonly Card[], champion: string): string | null {
  for (const card of cards) {
    if (card.subtype !== 'champion' || !card.tags.includes(champion)) continue;
    const region = card.tags.find((t) => REGION_TAGS.has(t));
    if (region) return region;
  }
  return null;
}

export type RegionStat = {
  tag: string;
  /** 帶有這個區域標籤的卡（以卡名去重）。 */
  count: number;
  /** 各領域的卡數，多到少。 */
  domains: { domain: PlayDomain; count: number }[];
  /** 帶有這個區域標籤的英雄卡，其英雄標籤。 */
  champions: string[];
};

export function regionStat(cards: readonly Card[], tag: string): RegionStat {
  const tagged = uniqueByName(cards.filter((c) => c.tags.includes(tag)));

  const counts = new Map<PlayDomain, number>();
  for (const card of tagged) {
    for (const domain of card.domains) {
      if (isPlayDomain(domain)) counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
  }
  const domains = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  const champions: string[] = [];
  for (const card of tagged) {
    if (card.subtype !== 'champion') continue;
    const champion = championTagOf(card);
    if (champion && !champions.includes(champion)) champions.push(champion);
  }

  return { tag, count: tagged.length, domains, champions };
}
