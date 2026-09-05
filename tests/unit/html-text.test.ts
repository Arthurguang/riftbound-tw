/**
 * 從遠端 HTML 取純文字的資安測試。
 *
 * 這三個函式處理的是**外部網站送來的內容**，所以測試的重點是紅隊而不是行為：
 * 餵它們刻意設計過的輸入，確認拆不出角括號。
 *
 * 兩個修掉的問題都是 CodeQL 抓出來的，我原本沒看出來 ——
 * 所以這裡把攻擊樣本留成測試，免得日後又改回去。
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error 這是給建置腳本用的 .mjs 模組，沒有型別宣告
import { assertPlainText, decodeEntities, stripTags } from '../../scripts/lib/html-text.mjs';

describe('剝除標籤', () => {
  it('一般標籤拿得掉', () => {
    expect(stripTags('<p>hello <em>world</em></p>')).toBe('hello world');
  });

  /*
   * 這是 CodeQL 抓到的那一個。
   *
   * 原本只做一次 replace，`<scr<script>ipt>` 掃完**反而變成** `<script>` ——
   * 越消毒越危險。現在做到不再變化為止。
   */
  it('巢狀寫法不會反而拼出新標籤', () => {
    expect(stripTags('<scr<script>ipt>')).toBe('');
    expect(stripTags('<<a>a href=x>')).toBe('');
    expect(stripTags('<im<img>g src=x onerror=1>')).toBe('');
  });

  it('剝完不會留下角括號', () => {
    for (const attack of [
      '<script>alert(1)</script>',
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
      '<p onclick="x"><svg/onload=y></p>',
      '<<<>>>',
    ]) {
      expect(stripTags(attack), `沒剝乾淨：${attack}`).not.toMatch(/[<>]/);
    }
  });
});

describe('還原 HTML 實體', () => {
  it('常見實體還原得回來', () => {
    expect(decodeEntities('a &amp; b')).toBe('a & b');
    expect(decodeEntities('&quot;x&quot;')).toBe('"x"');
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  });

  /*
   * 這是 CodeQL 抓到的另一個。
   *
   * 原本是一串 replace 接起來，而且 `&amp; → &` 排在最前面。
   * 輸入 `&amp;lt;` 會先變成 `&lt;`，後面那一步再把它變成 `<` ——
   * 等於幫攻擊者把跳脫過的角括號還原回來。
   *
   * 現在是單次掃描：換出來的結果不會再被後面的規則處理。
   */
  it('不會重複解碼 —— 跳脫過的角括號要維持跳脫', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(decodeEntities('&amp;amp;')).toBe('&amp;');
    expect(decodeEntities('&amp;#60;')).toBe('&#60;');
  });

  it('認不得的實體原樣保留，不亂猜', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });
});

describe('純文字斷言', () => {
  it('乾淨的文字放行', () => {
    expect(() => assertPlainText('You may kill up to one gear.', 'x')).not.toThrow();
  });

  it('有角括號就中止 —— 寧可讓建置失敗，也不要猜', () => {
    expect(() => assertPlainText('a <b> c', 'x')).toThrow();
    expect(() => assertPlainText('1 > 2', 'x')).toThrow();
  });

  it('空的或長得離譜的也中止', () => {
    expect(() => assertPlainText('', 'x')).toThrow();
    expect(() => assertPlainText('a'.repeat(2000), 'x')).toThrow();
  });

  /*
   * 三個函式串起來用才是實際的流程：先剝標籤、再還原實體、最後斷言。
   * 這條確認整條鏈擋得住「用實體把角括號藏起來」這一招。
   */
  it('串起來用：藏在實體裡的標籤也會被擋下', () => {
    const attack = decodeEntities(stripTags('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'));
    expect(attack).toBe('<script>alert(1)</script>');
    expect(() => assertPlainText(attack, '勘誤文字')).toThrow();
  });
});
