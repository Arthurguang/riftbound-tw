/**
 * 驗證建置產生的卡牌 JSON 確實符合我們宣告的型別。
 *
 * src/lib/cards.ts 為了方便使用，把匯入的 JSON 直接轉型成 Card[]。
 * 那個轉型的正確性由「建置腳本的驗證」加上「這組測試」共同保證 ——
 * 不是靠信任。
 */

import { describe, expect, it } from 'vitest';
import cards from '../../src/data/cards.origins.json';
import taxonomy from '../../src/data/taxonomy.json';
import { CARD_TYPES, DOMAINS, GLYPH_IDS, KEYWORDS, RARITIES, SET_IDS } from '../../src/lib/types';
import { cardImageUrl } from '../../src/lib/cards';
import type { Card } from '../../src/lib/types';

const list = cards as unknown as Record<string, unknown>[];

describe('卡牌資料完整性', () => {
  /*
   * 2026-10-13 起收錄六個系列。
   *
   * 不寫死總數：官方 API 的分頁會抖動，每次抓到的張數會差一兩張
   * （抓取腳本本身有容忍機制，見 fetch-cards.mjs 的張數檢查）。
   * 這裡改成檢查「每個系列都有，而且數量在合理範圍」——
   * 真正把關張數的是抓取腳本，測試只負責確認資料檔沒有整個系列不見。
   */
  it('六個系列都在，而且張數合理', () => {
    const expected: Record<string, number> = {
      // RAD 還在預覽期，官方陸續追加公開（10-13 是 183 張，10-15 是 206 張）
      OGN: 352, OGS: 24, RAD: 206, SFD: 288, UNL: 286, VEN: 237,
    };
    for (const [set, count] of Object.entries(expected)) {
      const actual = list.filter((c) => c.set === set).length;
      expect(actual, `${set} 張數`).toBeGreaterThanOrEqual(count - 2);
      expect(actual, `${set} 張數`).toBeLessThanOrEqual(count);
    }
    expect(list.length).toBeGreaterThanOrEqual(1385);
  });

  it('每張卡的 id 都唯一，且只含網址安全的字元', () => {
    const ids = list.map((c) => c.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('所有列舉欄位的值都在允許清單內', () => {
    for (const card of list) {
      expect(SET_IDS).toContain(card.set);
      expect(RARITIES).toContain(card.rarity);
      for (const type of card.types as string[]) expect(CARD_TYPES).toContain(type);
      for (const domain of card.domains as string[]) expect(DOMAINS).toContain(domain);
      expect(['portrait', 'landscape']).toContain(card.orientation);
    }
  });

  /*
   * 上面驗的是「資料裡記的來源」，下面驗的是「網頁實際要圖的地方」。
   * 兩件事要分開：Riot 政策要求素材來自官方（上面那條），
   * 而本站把它下載下來自己提供（下面這條），兩者都要成立。
   */
  it('網頁要圖的網址指向本站，並挑不小於需求的最小尺寸', () => {
    const card = list[0] as unknown as Card;
    expect(cardImageUrl(card, 60)).toBe(`/cards/en/${card.id}-160.webp`);
    expect(cardImageUrl(card, 160)).toBe(`/cards/en/${card.id}-160.webp`);
    expect(cardImageUrl(card, 300)).toBe(`/cards/en/${card.id}-420.webp`);
    expect(cardImageUrl(card, 420)).toBe(`/cards/en/${card.id}-420.webp`);
    expect(cardImageUrl(card, 900)).toBe(`/cards/en/${card.id}-900.webp`);
    // 超過最大尺寸時退到最大的那一張，不會產生不存在的檔名
    expect(cardImageUrl(card, 5000)).toBe(`/cards/en/${card.id}-900.webp`);
  });

  it('卡圖網址一律是官方 CDN 的 https 位址', () => {
    for (const card of list) {
      const image = card.image as { url: string };
      const url = new URL(image.url);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('cmsassets.rgpub.io');
    }
  });
});

describe('能力文字裡沒有任何 HTML —— 這是最關鍵的一條', () => {
  const ALLOWED_NODE_TYPES = new Set(['text', 'break', 'glyph', 'keyword']);

  it('所有 token 的型別都在允許清單內，且符號/關鍵字皆為已知值', () => {
    for (const card of list) {
      for (const block of card.text as Record<string, unknown>[]) {
        expect(['paragraph', 'list']).toContain(block.kind);
        const tokenLists =
          block.kind === 'paragraph'
            ? [block.tokens as Record<string, unknown>[]]
            : (block.items as Record<string, unknown>[][]);

        for (const tokens of tokenLists) {
          for (const token of tokens) {
            expect(ALLOWED_NODE_TYPES).toContain(token.type);
            if (token.type === 'glyph') expect(GLYPH_IDS).toContain(token.id);
            if (token.type === 'keyword') expect(KEYWORDS).toContain(token.name);
          }
        }
      }
    }
  });

  it('沒有任何一段文字 token 含有角括號（代表沒有 HTML 殘留）', () => {
    const walk = (tokens: Record<string, unknown>[]) => {
      for (const token of tokens) {
        if (token.type === 'text') {
          expect(token.value as string).not.toMatch(/[<>]/);
        }
      }
    };
    for (const card of list) {
      for (const block of card.text as Record<string, unknown>[]) {
        if (block.kind === 'paragraph') walk(block.tokens as Record<string, unknown>[]);
        else for (const item of block.items as Record<string, unknown>[][]) walk(item);
      }
    }
  });

  it('整份 JSON 字串裡不存在 <script 或 onerror= 之類的片段', () => {
    const raw = JSON.stringify(cards).toLowerCase();
    for (const needle of ['<script', 'onerror=', 'javascript:', '<iframe', '<img ']) {
      expect(raw).not.toContain(needle);
    }
  });
});

describe('分類法', () => {
  it('篩選選項都能對應到實際存在的卡牌屬性', () => {
    const t = taxonomy as unknown as Record<string, string[]>;
    for (const type of t.types!) expect(CARD_TYPES).toContain(type);
    for (const domain of t.domains!) expect(DOMAINS).toContain(domain);
    for (const rarity of t.rarities!) expect(RARITIES).toContain(rarity);
  });

  it('標籤清單沒有重複', () => {
    const tags = (taxonomy as unknown as { tags: string[] }).tags;
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe('中文資料', () => {
  const taxo = taxonomy as unknown as {
    tags: string[];
    tagLabels: Record<string, { cn: string; tw: string; src: string }>;
  };

  /*
   * 中文資料的要求分兩種，因為兩個系列的來源進度不同：
   *
   *   OGN／OGS  中國大陸發行商早就收錄完畢 → **每張都必須有**，少了就是抓取壞了
   *   新四系列   對方進度落後（2026-10-13 實測 1368 張裡 855 張有）→ 允許沒有，
   *             那些卡在站上以英文呈現，與本站既有做法一致
   */
  const LEGACY = ['OGN', 'OGS'];

  it('舊系列每張卡都有官方簡中資料', () => {
    for (const card of list.filter((c) => LEGACY.includes(c.set as string))) {
      const zh = card.zh as { cn: Record<string, unknown> | null };
      expect(zh.cn, `${card.code} 缺少簡中資料`).not.toBeNull();
      expect(typeof zh.cn!.name).toBe('string');
      expect((zh.cn!.name as string).length).toBeGreaterThan(0);
    }
  });

  it('新系列有簡中的卡，資料結構一樣完整', () => {
    const withCn = list.filter((c) => !LEGACY.includes(c.set as string) && (c.zh as { cn: unknown }).cn);
    expect(withCn.length, '新系列應該有一部分卡已經有簡中').toBeGreaterThan(100);
    for (const card of withCn) {
      const cn = (card.zh as { cn: Record<string, unknown> }).cn;
      expect(typeof cn.name, `${card.code}`).toBe('string');
      expect((cn.name as string).length).toBeGreaterThan(0);
    }
  });

  it('有繁中資料的卡，卡名與來源都標示正確', () => {
    for (const card of list) {
      const tw = (card.zh as { tw: Record<string, unknown> | null }).tw;
      if (tw === null) {
        // 只有在官方與社群都還沒有該卡資料時才允許
        expect((card.zh as { cn: unknown }).cn, `${card.code} 沒有繁中卻有簡中`).toBeNull();
        continue;
      }
      expect((tw.name as string).length).toBeGreaterThan(0);
      expect(['community', 'converted']).toContain(tw.nameSource);
      // 繁中能力文字目前一律是簡轉繁 —— 介面靠這個欄位誠實標示
      expect(tw.textSource).toBe('converted');
    }
  });

  it('簡中卡圖一律來自官方 CDN', () => {
    for (const card of list) {
      const image = (card.zh as { cn: { image: string | null } | null }).cn?.image ?? null;
      if (image === null) continue;
      const url = new URL(image);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('cdn.playloltcg.com');
    }
  });

  it('中文能力文字同樣沒有任何 HTML 殘留', () => {
    const raw = JSON.stringify(list.map((c) => c.zh)).toLowerCase();
    for (const needle of ['<script', 'onerror=', 'javascript:', '<iframe', '<p>', '<br']) {
      expect(raw).not.toContain(needle);
    }
  });

  /*
   * 2026-10-15 起有兩個簡中來源：中國大陸發行商只有段落，
   * Riot 官方 zh_CN 跟英文同格式、會有條列（「選一項 ——」底下的選項）。兩種都要驗。
   */
  it('中文能力文字的 token 型別與符號都在允許清單內', () => {
    const check = (tokens: Record<string, unknown>[]) => {
      for (const token of tokens) {
        expect(['text', 'break', 'glyph', 'keyword']).toContain(token.type);
        if (token.type === 'glyph') expect(GLYPH_IDS).toContain(token.id);
        if (token.type === 'keyword') expect(KEYWORDS).toContain(token.name);
      }
    };
    for (const card of list) {
      const zh = card.zh as {
        cn: { text: Record<string, unknown>[] } | null;
        tw: { text: Record<string, unknown>[] } | null;
      };
      for (const block of [...(zh.cn?.text ?? []), ...(zh.tw?.text ?? [])]) {
        expect(['paragraph', 'list']).toContain(block.kind);
        if (block.kind === 'paragraph') check(block.tokens as Record<string, unknown>[]);
        else for (const item of block.items as Record<string, unknown>[][]) check(item);
      }
    }
  });

  it('每一份簡中都標明來源', () => {
    for (const card of list) {
      const cn = (card.zh as { cn: { source: string } | null }).cn;
      if (cn === null) continue;
      expect(['publisher', 'riot'], card.code as string).toContain(cn.source);
    }
  });

  /*
   * 使用者回饋「有些地方還是英文」之後補上 Riot 官方 zh_CN。
   * 這條確認補缺真的有效：只剩極少數兩個來源都還沒翻譯的卡。
   * 門檻刻意寬鬆（官方預覽期會一直追加新卡），真正要守的是「不會退回到一大片英文」。
   */
  it('幾乎每張卡都有中文', () => {
    const english = list.filter((c) => (c.zh as { cn: unknown }).cn === null);
    expect(english.length).toBeLessThan(list.length * 0.02);
  });

  /*
   * 2026-10-15 查出：社群繁中卡名原本只用「系列＋號碼」對應，沒算字母前綴，
   * VEN-R01（狂怒符文）因此拿到 VEN-001「巴凱旋沙者」的名字。
   * 抓取腳本現在會拿社群資料附的英文名核對；這裡用幾張實際出過事的卡釘住結果。
   */
  it('符文、衍生物、特別卡不會拿到同號一般卡的繁中名', () => {
    const tw = (code: string) =>
      (list.find((c) => c.code === code)?.zh as { tw: { name: string } | null } | undefined)?.tw
        ?.name;
    expect(tw('VEN-R01')).toBe('狂怒符文');
    expect(tw('UNL-T01')).not.toBe(tw('UNL-001/219'));
    expect(tw('SFD-T03')).not.toBe(tw('SFD-003/221'));
    expect(tw('VEN-SP1/006')).not.toBe(tw('VEN-001/166'));
  });

  /*
   * src = 'english' 是 2026-10-13 新系列帶來的第三種情況：
   * 兩邊官方中文都還沒有這個標籤，只好沿用英文原文。
   * 這種時候 cn／tw 會等於英文標籤本身 —— 介面照樣顯示得出來，
   * 而欄位誠實記著「這不是中文譯名」。
   */
  it('每個標籤都有中英對照，且繁中譯名標明來源', () => {
    for (const tag of taxo.tags) {
      const label = taxo.tagLabels[tag];
      expect(label, `標籤 ${tag} 缺少對照`).toBeDefined();
      expect(label!.cn.length).toBeGreaterThan(0);
      expect(label!.tw.length).toBeGreaterThan(0);
      expect(['official', 'converted', 'english']).toContain(label!.src);
      if (label!.src === 'english') {
        expect(label!.cn, `標籤 ${tag}`).toBe(tag);
        expect(label!.tw, `標籤 ${tag}`).toBe(tag);
      }
    }
  });
});

/**
 * 卡片屬性跟**官方印刷卡圖**一致。
 *
 * 2026-10-16 使用者回報「有些卡明明是紅色，卻顯示成紫色」。查下去是 Riot 資料庫的分類欄位
 * 在 RAD（預覽期）大量填錯，起源也有零星錯誤。抓取腳本改成對不上時以發行商為準，
 * 每一筆都對照過卡圖。下面每一條就是一張實際看過卡圖的卡 —— 資料再被改壞，這裡會先紅。
 */
describe('卡片屬性跟官方卡圖一致', () => {
  const card = (code: string) => {
    const found = list.find((c) => c.code === code);
    expect(found, `${code} 不在資料裡`).toBeDefined();
    return found as unknown as Card;
  };

  it('流派：RAD-001 業餘爆破狂是紅色（狂怒），不是紫色', () => {
    expect(card('RAD-001/167').domains).toEqual(['fury']);
    expect(card('RAD-124/167').domains).toEqual(['order']);
  });

  it('卡種：卡上印 SPELL 的是法術、印 GEAR 的是裝備', () => {
    expect(card('RAD-007/167').types).toEqual(['spell']); // Rally for War
    expect(card('RAD-046/167').types).toEqual(['gear']); // Resplendent Rostrum
  });

  it('費用：OGN-187 旋風卡上印 4', () => {
    expect(card('OGN-187/298').energy).toBe(4);
  });

  it('標籤：OGN-235 卡瑪是卡瑪，不是菲艾', () => {
    expect(card('OGN-235/298').tags).toContain('Karma');
    expect(card('OGN-235/298').tags).not.toContain('Vi');
  });

  it('標籤：RAD-112 希格斯是佐恩的約德爾人，不是班德爾城', () => {
    expect([...card('RAD-112/167').tags].sort()).toEqual(['Yordle', 'Zaun', 'Ziggs']);
  });

  it('標籤：發行商合寫或打錯的標籤被正確拆開', () => {
    expect([...card('RAD-075/167').tags].sort()).toEqual(['Bird', 'Demacia', 'Elite']);
    expect([...card('RAD-092/167').tags].sort()).toEqual(['Dragon', 'Mount Targon']);
  });

  it('標籤：發行商漏掉、Riot 有的正確標籤保留下來', () => {
    expect(card('SFD-086/221').tags).toContain('Equipment');
  });

  it('標籤：卡上沒印的「Device」不會出現', () => {
    expect(list.filter((c) => (c.tags as string[]).includes('Device'))).toEqual([]);
  });

  /*
   * 不靠第二個來源也查得出來的錯：單位一定有戰力、法術一定沒有。
   * 發行商還沒收錄的卡（只有 Riot 一個來源）全靠這一道把關。
   */
  it('單位都有戰力，法術都沒有', () => {
    for (const c of list as unknown as Card[]) {
      if (c.types.includes('unit')) expect(c.might, c.code).not.toBeNull();
      if (c.types.includes('spell')) expect(c.might, c.code).toBeNull();
    }
  });
});
