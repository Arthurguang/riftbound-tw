/**
 * 使用條款與隱私權政策。
 *
 * 最重要的是最後一組：**隱私權政策要跟程式碼對得上**。
 * 政策寫「只存這些」，程式碼卻偷偷多存了別的 —— 那份政策就是假的，
 * 而且沒有人會發現，因為沒有人會重讀自己寫過的政策。
 * 所以用測試把「程式碼裡哪些檔案碰了瀏覽器儲存」釘住：多了一個就紅燈，
 * 提醒改程式的人回來更新 legal-content.ts。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY, TERMS, type LegalDoc } from '../../src/lib/legal-content';
import { CONTACT_URL } from '../../src/lib/site';
import { TEXT_LANGS } from '../../src/lib/i18n';

const docs: [string, LegalDoc][] = [
  ['使用條款', TERMS],
  ['隱私權政策', PRIVACY],
];

describe('兩份文件都完整', () => {
  for (const [name, doc] of docs) {
    it(`${name}：每一段三種語言都有內容`, () => {
      const texts = [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.body])];
      for (const text of texts) {
        for (const lang of TEXT_LANGS) expect(text[lang].trim(), `${text.en} / ${lang}`).not.toBe('');
      }
    });

    it(`${name}：有聯絡方式這一段`, () => {
      expect(doc.sections.some((s) => s.heading.en === 'Contact')).toBe(true);
    });
  }

  it('聯絡管道是本站 GitHub 儲存庫的 Issues，不是個人信箱', () => {
    const url = new URL(CONTACT_URL);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('github.com');
    expect(url.pathname).toBe('/Arthurguang/riftbound-tw/issues');
  });
});

describe('條款寫到審核會在意的事', () => {
  const english = TERMS.sections.flatMap((s) => s.body.map((b) => b.en)).join(' ');

  it('講明非商業、非官方', () => {
    expect(english).toContain('non-commercial');
    expect(english).toContain('not affiliated with, endorsed by, or sponsored by Riot Games');
  });

  it('講明翻譯與英文並列、英文為準', () => {
    expect(english).toContain('alongside the official English text');
  });

  it('講明沒有勝率，復盤工具不是遊戲、不執行規則', () => {
    expect(english).toContain('does not provide win rates');
    expect(english).toContain('It is not a game');
    expect(english).toContain('no rules enforcement');
  });
});

/** src 底下所有 .ts / .tsx 檔。 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('隱私權政策跟程式碼對得上', () => {
  const root = join(__dirname, '..', '..');
  const files = sourceFiles(join(root, 'src')).map((path) => ({
    path: relative(root, path).replaceAll('\\', '/'),
    // 拿掉註解再比對：註解裡提到 localStorage 不算使用
    code: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));

  const using = (pattern: RegExp) =>
    files.filter((f) => pattern.test(f.code)).map((f) => f.path).sort();

  it('用到 localStorage 的只有政策列出的兩處（動畫音樂偏好、收藏紀錄）', () => {
    expect(using(/localStorage\./)).toEqual(['src/components/Ambience.tsx', 'src/lib/collection.ts']);
  });

  it('用到 sessionStorage 的只有政策列出的兩處（編輯中的牌組與盤面、圖鑑捲動位置）', () => {
    expect(using(/sessionStorage\./)).toEqual(['src/lib/gallery-scroll.ts', 'src/lib/session-state.ts']);
  });

  it('沒有任何程式碼碰 cookie 或 IndexedDB', () => {
    expect(using(/document\.cookie|indexedDB|cookies\(\)/)).toEqual([]);
  });

  it('政策確實寫了這些', () => {
    const english = PRIVACY.sections.flatMap((s) => s.body.map((b) => b.en)).join(' ');
    expect(english).toContain('localStorage');
    expect(english).toContain('sessionStorage');
    expect(english).toContain('We do not use cookies');
    expect(english).toContain('We do not use any analytics');
  });
});
