/**
 * 解析器紅隊測試 —— 本專案最重要的一組測試。
 *
 * 這裡直接餵惡意 payload 給卡牌能力文字的解析器，斷言它「必須爆炸」。
 *
 * 為什麼這比任何掃描工具都重要：
 * 官方 API 回傳的是 HTML 字串。如果 Riot 的 CMS 哪天被入侵、
 * 或是上游資料被中間人竄改，惡意 HTML 就會流進我們的建置流程。
 * 這組測試保證那種情況下「建置會失敗」，而不是「網站帶毒上線」。
 */

import { describe, expect, it } from 'vitest';
import {
  parseCardText,
  ALLOWED_GLYPHS,
  ALLOWED_KEYWORDS,
  CardTextError,
} from '../../scripts/lib/card-text-parser.mjs';

describe('紅隊：惡意輸入必須讓建置失敗', () => {
  const attacks: [string, string][] = [
    ['img 標籤帶 onerror', '<p><img src=x onerror=alert(1)></p>'],
    ['script 標籤', '<p>hi</p><script>alert(1)</script>'],
    ['段落上的事件處理器', '<p onclick="alert(1)">hi</p>'],
    ['javascript: 連結', '<p><a href="javascript:alert(1)">x</a></p>'],
    ['svg onload', '<p><svg/onload=alert(1)></p>'],
    ['iframe', '<p><iframe src="//evil.example.com"></iframe></p>'],
    ['style 屬性夾帶 javascript:', '<p style="background:url(javascript:alert(1))">x</p>'],
    ['大寫繞過嘗試', '<P><IMG SRC=x ONERROR=alert(1)></P>'],
    ['沒有包在 p 裡的裸文字', 'alert(1)'],
    ['未閉合的 p', '<p>hello'],
    ['ul 裡混入非 li 的內容', '<ul><li>a</li><div>b</div></ul>'],
    ['巢狀 script 藏在 li 裡', '<ul><li><script>alert(1)</script></li></ul>'],
    ['object 標籤', '<p><object data="evil"></object></p>'],
    ['未知的 HTML 實體', '<p>&Tab;&NewLine;</p>'],
    ['data: URI', '<p><embed src="data:text/html,<script>alert(1)</script>"></p>'],
  ];

  it.each(attacks)('必須拒絕：%s', (_name, html) => {
    expect(() => parseCardText(html)).toThrow(CardTextError);
  });

  it('必須拒絕未知的符號（官方新增符號時我們要立刻知道）', () => {
    expect(() => parseCardText('<p>:rb_totally_new_glyph:</p>')).toThrow(/未知的符號/);
  });

  it('必須拒絕沒有 rb_ 前綴的符號', () => {
    expect(() => parseCardText('<p>:evil:</p>')).toThrow(CardTextError);
  });

  it('必須拒絕未知的關鍵字', () => {
    expect(() => parseCardText('<p>[Superpower]</p>')).toThrow(/未知的關鍵字/);
  });

  it('必須拒絕非字串輸入', () => {
    // @ts-expect-error 故意傳入錯誤型別
    expect(() => parseCardText({ evil: true })).toThrow(CardTextError);
  });
});

describe('正常官方資料必須能正確解析', () => {
  it('解析單純段落', () => {
    const result = parseCardText('<p>Draw 1.</p>');
    expect(result).toEqual([{ kind: 'paragraph', tokens: [{ type: 'text', value: 'Draw 1.' }] }]);
  });

  it('解析 <br /> 換行', () => {
    const result = parseCardText('<p>A<br />B</p>');
    expect(result[0]).toEqual({
      kind: 'paragraph',
      tokens: [{ type: 'text', value: 'A' }, { type: 'break' }, { type: 'text', value: 'B' }],
    });
  });

  it('解析符號', () => {
    const result = parseCardText('<p>Gets +1 :rb_might: buff.</p>');
    expect(result[0]).toMatchObject({
      tokens: [
        { type: 'text', value: 'Gets +1 ' },
        { type: 'glyph', id: 'might' },
        { type: 'text', value: ' buff.' },
      ],
    });
  });

  it('解析不帶數值與帶數值的關鍵字', () => {
    expect(parseCardText('<p>[Assault]</p>')[0]).toMatchObject({
      tokens: [{ type: 'keyword', name: 'Assault' }],
    });
    expect(parseCardText('<p>[Shield 2]</p>')[0]).toMatchObject({
      tokens: [{ type: 'keyword', name: 'Shield', value: 2 }],
    });
  });

  it('解析 <ul><li> 清單（官方在 OGN-200 等卡上使用）', () => {
    const result = parseCardText(
      '<p>Choose one:</p><ul><li>:rb_rune_fury: — Deal 2.</li><li>Draw 1.</li></ul>',
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ kind: 'list' });
    const list = result[1] as { kind: 'list'; items: unknown[] };
    expect(list.items).toHaveLength(2);
  });

  it('空值與 null 回傳空陣列（沒有能力文字的卡）', () => {
    expect(parseCardText(null)).toEqual([]);
    expect(parseCardText(undefined)).toEqual([]);
    expect(parseCardText('')).toEqual([]);
  });
});

describe('允許清單本身', () => {
  it('符號清單是 15 個且不重複', () => {
    expect(ALLOWED_GLYPHS).toHaveLength(15);
    expect(new Set(ALLOWED_GLYPHS).size).toBe(15);
  });

  it('關鍵字清單是 15 個且不重複', () => {
    expect(ALLOWED_KEYWORDS).toHaveLength(15);
    expect(new Set(ALLOWED_KEYWORDS).size).toBe(15);
  });
});
