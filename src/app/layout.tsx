import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { AmbienceControls, AmbienceProvider } from '@/components/Ambience';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NavLinks } from '@/components/NavLinks';
import { CONTACT_URL, SITE_ORIGIN } from '@/lib/site';
import { HTML_LANG, isTextLang, t, DEFAULT_TEXT_LANG, type TextLang } from '@/lib/i18n';
import './globals.css';

/*
 * 站名：守夜圖鑑 / Ashvigil。
 *
 * 2026-09-12 改名。原本叫「符文戰場資料庫」，但「符文戰場」是 Riot 的商標，
 * 而 Legal Jibber Jabber 第 5 條唯一明文禁止的就是「用 Riot 商標註冊網域」。
 * 站名本身雖然沒被禁，但既然要換網域，品牌一起換才不會兩個名字各說各話。
 *
 * 遊戲名改放在**標題與內文**裡（下面的 title 與 description）——
 * 這是 Scryfall、Piltover Archive、巴哈姆特都在用的做法：
 * 品牌放網域，遊戲名放標題，搜尋流量不會少，網域則乾淨。
 *
 * 「圖鑑」這個後綴是刻意選的：台灣玩家對資訊站／情報站／資料庫／圖鑑有信任感。
 * 絕不能用「數據庫」——那是對岸用語，在台灣會被當成內容農場。
 */
export const metadata: Metadata = {
  // 分享預覽等需要完整網址的地方，一律以正式網域為準。
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: '守夜圖鑑 Ashvigil — 符文戰場 Riftbound 繁體中文玩家資源',
    template: '%s｜守夜圖鑑 Ashvigil',
  },
  description:
    '符文戰場（Riftbound）繁體中文玩家資源站。起源系列卡牌圖鑑，支援繁中／简中／英文三語切換、英文與简中卡面切換，以及全文搜尋與多條件篩選。',
  robots: { index: true, follow: true },
  applicationName: '守夜圖鑑 Ashvigil',
};

export const viewport: Viewport = {
  themeColor: '#0e0d22',
  width: 'device-width',
  initialScale: 1,
};

/**
 * 站徽：一個六邊形，六個角各是一個領域的顏色。
 * 顏色寫在 SVG 的 fill 屬性上（呈現屬性，CSP 不擋），順序與首頁的領域徽章相同。
 */
const MARK_POINTS: ReadonlyArray<[number, number, string]> = [
  [13, 3.5, '#e0533d'],
  [21.23, 8.25, '#3da8c8'],
  [21.23, 17.75, '#a05fd6'],
  [13, 22.5, '#4fae63'],
  [4.77, 17.75, '#e08a3d'],
  [4.77, 8.25, '#d8b23f'],
];

function SiteMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="12.2" stroke="#5fc8e6" strokeOpacity="0.35" />
      <polygon
        points={MARK_POINTS.map(([x, y]) => `${x},${y}`).join(' ')}
        stroke="#a3e3f4"
        strokeOpacity="0.7"
        strokeWidth="1.1"
      />
      {MARK_POINTS.map(([x, y, color]) => (
        <circle key={color} cx={x} cy={y} r="2.1" fill={color} />
      ))}
    </svg>
  );
}

function SiteHeader({ lang }: { lang: TextLang }) {
  const strings = t(lang);
  return (
    /*
      刻意不用毛玻璃（backdrop-blur）：頁首固定在畫面上方、底下是持續播放的背景動畫，
      每一格都得重算整條頁首的模糊。在沒有顯示卡的環境（CI、低階手機）會把整頁拖慢，
      2026-09-11 CI 的 WebKit 因此在復盤頁接連逾時。改用接近不透明的底色，看起來幾乎一樣。
    */
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95">
      <nav className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <SiteMark />
          <span className="font-serif text-base font-bold tracking-wide text-ink">
            {strings.siteName}
          </span>
        </Link>
        <NavLinks
          items={[
            { href: '/cards', label: strings.navGallery },
            { href: '/rules', label: strings.navRules },
            { href: '/deck', label: strings.navDeck },
            { href: '/odds', label: strings.navOdds },
            { href: '/replay', label: strings.navReplay },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* 背景動畫與音樂的開關。放在頁首而不是浮在畫面上，才不會擋住工具頁的按鈕。 */}
          <AmbienceControls />
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
          Ashvigil（守夜圖鑑）was created under Riot Games&apos; &ldquo;Legal Jibber Jabber&rdquo; policy
          using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </p>
        {/*
          Riot 開發者政策（policies/general）另外要求一段**字句不同**的聲明。
          兩份文件各要求一段，所以兩段都放。請勿移除。
        */}
        <p>
          Ashvigil（守夜圖鑑）isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or
          opinions of Riot Games or anyone officially involved in producing or managing Riot Games
          properties. Riot Games, and all associated properties are trademarks or registered
          trademarks of Riot Games, Inc.
        </p>
        <p>
          本站為非商業同人專案，與 Riot Games 無隸屬關係，不代表官方立場。
          卡牌圖片與資料版權屬 Riot Games 所有。
        </p>

        {/*
          Riot 審核開發者申請時要能看到使用條款與隱私權政策（developer.riotgames.com/docs/faqs）。
          中英並列：審核人員讀英文，使用者讀中文。
        */}
        <nav aria-label="法律與聯絡" className="flex flex-wrap gap-x-4 gap-y-1" data-testid="legal-links">
          <Link href="/terms" className="underline underline-offset-2 hover:text-accent-soft">
            使用條款 Terms of Service
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-accent-soft">
            隱私權政策 Privacy Policy
          </Link>
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-accent-soft"
          >
            聯絡我們 Contact（GitHub Issues）
          </a>
        </nav>

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
  const nonce = headerList.get('x-nonce') ?? undefined;

  return (
    <html lang={HTML_LANG[lang]}>
      <head>
        {/*
          Trusted Types 的 default 政策：讓 Next.js 換頁時能載入本站自己的程式檔，
          其他一律照擋。必須在 Next.js 的程式之前就位，詳見檔案開頭的說明。
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- 必須同步執行，才能保證政策比 Next.js 先就位；檔案不到 2KB，不影響載入速度 */}
        <script src="/trusted-types-policy.js" nonce={nonce} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/*
          背景氛圍（動畫＋音樂）包住整頁：它在 layout 裡，站內換頁時不會重新掛載，
          音樂不會因為換頁中斷。它本身不產生任何外框元素，不影響版面。
        */}
        <AmbienceProvider>
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
        </AmbienceProvider>
      </body>
    </html>
  );
}
