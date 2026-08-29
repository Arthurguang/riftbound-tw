'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ART_LANGS,
  ART_LANG_LABELS,
  TEXT_LANGS,
  TEXT_LANG_LABELS,
  readArtLang,
  readTextLang,
  t,
} from '@/lib/i18n';

/**
 * 語言切換。
 *
 * 兩個獨立的選項：
 *   文字語言 —— 介面、卡名、能力文字
 *   卡面語言 —— 要看英文卡面還是簡體中文卡面
 *
 * 分開是刻意的：很多台灣玩家看繁中介面，但手上的實體卡是英文版。
 *
 * 狀態寫在網址，所以切換後的頁面可以直接複製分享，
 * 也不需要 cookie 或 localStorage。
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = new URLSearchParams(searchParams.toString());
  const textLang = readTextLang(params);
  const artLang = readArtLang(params);
  const strings = t(textLang);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    const qs = next.toString();
    router.replace(qs === '' ? pathname : `${pathname}?${qs}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="text-lang" className="sr-only">
        {strings.language}
      </label>
      <select
        id="text-lang"
        value={textLang}
        onChange={(e) => setParam('lang', e.target.value)}
        title={strings.language}
        className="rounded-md border border-line bg-surface-1 px-2 py-1 text-xs text-ink-dim hover:text-ink focus:border-accent focus:outline-none"
      >
        {TEXT_LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {TEXT_LANG_LABELS[lang]}
          </option>
        ))}
      </select>

      <label htmlFor="art-lang" className="sr-only">
        {strings.cardArt}
      </label>
      <select
        id="art-lang"
        value={artLang}
        onChange={(e) => setParam('art', e.target.value)}
        title={strings.cardArt}
        className="rounded-md border border-line bg-surface-1 px-2 py-1 text-xs text-ink-dim hover:text-ink focus:border-accent focus:outline-none"
      >
        {ART_LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {ART_LANG_LABELS[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
