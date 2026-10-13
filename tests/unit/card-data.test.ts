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
      OGN: 352, OGS: 24, RAD: 183, SFD: 288, UNL: 286, VEN: 237,
    };
    for (const [set, count] of Object.entries(expected)) {
      const actual = list.filter((c) => c.set === set).length;
      expect(actual, `${set} 張數`).toBeGreaterThanOrEqual(count - 2);
      expect(actual, `${set} 張數`).toBeLessThanOrEqual(count);
    }
    expect(list.length).toBeGreaterThanOrEqual(1360);
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

  it('中文能力文字的 token 型別與符號都在允許清單內', () => {
    for (const card of list) {
      const zh = card.zh as { cn: { text: Record<string, unknown>[] } | null };
      for (const block of zh.cn?.text ?? []) {
        expect(block.kind).toBe('paragraph');
        for (const token of block.tokens as Record<string, unknown>[]) {
          expect(['text', 'break', 'glyph', 'keyword']).toContain(token.type);
          if (token.type === 'glyph') expect(GLYPH_IDS).toContain(token.id);
          if (token.type === 'keyword') expect(KEYWORDS).toContain(token.name);
        }
      }
    }
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
