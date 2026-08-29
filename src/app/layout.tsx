import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { HTML_LANG, isTextLang, t, DEFAULT_TEXT_LANG, type TextLang } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '符文戰場資料庫 — Riftbound 繁體中文玩家資源',
    template: '%s｜符文戰場資料庫',
  },
  description:
    '符文戰場（Riftbound）繁體中文玩家資源站。起源系列卡牌圖鑑，支援繁中／简中／英文三語切換、英文與简中卡面切換，以及全文搜尋與多條件篩選。',
  robots: { index: true, follow: true },
  applicationName: '符文戰場資料庫',
};

export const viewport: Viewport = {
  themeColor: '#0b0e14',
  width: 'device-width',
  initialScale: 1,
};

function SiteHeader({ lang }: { lang: TextLang }) {
  const strings = t(lang);
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
          {strings.siteName}
        </Link>
        <Link
          href="/cards"
          className="text-sm text-ink-dim transition-colors hover:text-accent-soft"
        >
          {strings.navGallery}
        </Link>
        <div className="ml-auto">
          {/* 語言切換要讀網址參數，因此需要一層 Suspense。 */}
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-1/40">
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-4 py-8 text-xs leading-relaxed text-ink-faint sm:px-6">
        {/*
          Riot 的「Legal Jibber Jabber」同人專案政策要求明顯標示這段聲明。
          請勿移除。
        */}
        <p>
          符文戰場資料庫 was created under Riot Games&apos; &ldquo;Legal Jibber Jabber&rdquo; policy
          using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </p>
        <p>
          本站為非商業同人專案，與 Riot Games 無隸屬關係，不代表官方立場。
          卡牌圖片與資料版權屬 Riot Games 所有。
        </p>

        <div className="space-y-1 border-t border-line pt-3">
          <p className="font-medium text-ink-dim">資料來源</p>
          <p>
            英文卡牌資料與卡面：
            <a
              href="https://playriftbound.com/en-us/card-gallery/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 underline underline-offset-2 hover:text-accent-soft"
            >
              Riot Games 官方卡牌圖鑑
            </a>
          </p>
          <p>
            简体中文卡牌資料與卡面：
            <a
              href="https://playloltcg.com/card.html"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 underline underline-offset-2 hover:text-accent-soft"
            >
              符文战场中国大陆官方網站
            </a>
            （Riot Games × 闪魂）
          </p>
          <p>
            繁體中文卡名：整理自
            <a
              href="https://riftbound.chroniclecore.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 underline underline-offset-2 hover:text-accent-soft"
            >
              符文戰場編年史 ChronicleCore
            </a>
            公開頁面的結構化資料，感謝該站對繁中譯名的整理。
            繁中的能力文字則由官方简体中文逐字轉換為繁體，用詞未在地化 ——
            官方目前尚未推出繁中的線上卡牌資料。
          </p>
        </div>
      </div>
    </footer>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * 為什麼這裡要讀取請求標頭？
   *
   * 兩個原因：
   *
   * 1. CSP nonce。我們的 CSP 採用「每次請求一組隨機 nonce」的嚴格模式
   *    （見 src/middleware.ts），只有帶著當次 nonce 的腳本才能執行。
   *    這是最強的 XSS 防線，但它有一個前提：HTML 必須在「請求當下」產生，
   *    nonce 才有機會寫進去。如果沿用 Next.js 預設的靜態預先產生，
   *    那份 HTML 裡不可能有當次的 nonce，結果就是所有腳本都被 CSP 擋掉、
   *    整站失效（這個問題在開發過程中實測確認過）。
   *
   * 2. 語言。<html lang="..."> 必須跟著使用者選的語言變動，
   *    但 layout 讀不到網址參數，所以 middleware 先驗證過再用標頭傳進來。
   *
   * 呼叫 headers() 會讓整個 App 改為動態渲染，nonce 因此生效。
   * 代價很小：本站沒有資料庫也沒有外部 API，渲染只是把已經打包在程式裡的
   * JSON 轉成 HTML，沒有任何 I/O。
   *
   * 取捨的另一端是把 script-src 放寬成 'unsafe-inline' —— 那會讓 CSP 形同虛設，
   * 也會被 Google CSP Evaluator 標為高風險，因此不採用。
   */
  const headerList = await headers();
  const rawLang = headerList.get('x-text-lang') ?? '';
  const lang: TextLang = isTextLang(rawLang) ? rawLang : DEFAULT_TEXT_LANG;

  return (
    <html lang={HTML_LANG[lang]}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
        >
          {t(lang).skipToContent}
        </a>
        <SiteHeader lang={lang} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
