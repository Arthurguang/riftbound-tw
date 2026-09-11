import Link from 'next/link';
import { HomeWheelHero, type LegendView } from '@/components/HomeWheelHero';
import { RegionAtlas, type RegionView } from '@/components/RegionAtlas';
import { ALL_CARDS, TAXONOMY } from '@/lib/cards';
import { SET_LABELS, TYPE_LABELS } from '@/lib/labels';
import { readTextLang, t, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import { playDomains, RING, type PlayDomain } from '@/lib/runeterra-core';
import {
  championTagOf,
  originLegends,
  REGIONS,
  regionOfChampion,
  regionStat,
  tagLabel,
} from '@/lib/runeterra';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const INTRO = {
  'zh-TW': {
    body: '查詢符文戰場的卡牌資料，支援繁體中文、简体中文與英文三語切換，卡面也能在英文與简中之間切換。搜尋可跨語言比對——打「阿璃」「阿狸」或「Ahri」都找得到同一張卡。',
    enter: '進入卡牌圖鑑',
    browseLegends: '瀏覽所有傳奇',
    contents: '收錄內容',
    aboutTitle: '關於這個網站',
    about: [
      '卡牌資料在網站建置時就從官方來源抓取並打包成靜態檔案，網站運作期間不會向任何外部服務發出請求，也不會蒐集使用者資料。全站沒有帳號系統、沒有 cookie、沒有第三方追蹤腳本。',
      '接下來預計加入規則說明與關鍵字辭典、牌組編輯器、抽牌機率計算器等功能。',
    ],
  },
  'zh-CN': {
    body: '查询符文战场的卡牌资料，支持繁体中文、简体中文与英文三语切换，卡面也能在英文与简中之间切换。搜索可跨语言比对——输入「阿狸」或「Ahri」都能找到同一张卡。',
    enter: '进入卡牌图鉴',
    browseLegends: '浏览所有传奇',
    contents: '收录内容',
    aboutTitle: '关于这个网站',
    about: [
      '卡牌资料在网站构建时就从官方来源抓取并打包成静态文件，网站运行期间不会向任何外部服务发出请求，也不会收集用户资料。全站没有账号系统、没有 cookie、没有第三方追踪脚本。',
      '接下来计划加入规则说明与关键字词典、卡组编辑器、抽卡概率计算器等功能。',
    ],
  },
  en: {
    body: 'Browse Riftbound card data in Traditional Chinese, Simplified Chinese, or English. Card art can be switched between the English and Simplified Chinese printings. Search matches across all three languages.',
    enter: 'Open card gallery',
    browseLegends: 'Browse all Legends',
    contents: 'Contents',
    aboutTitle: 'About this site',
    about: [
      'Card data is fetched from official sources at build time and bundled as static files. The site makes no external requests at runtime and collects no user data. There are no accounts, no cookies, and no third-party tracking scripts.',
      'Planned next: rules reference and keyword glossary, a deck builder, and a draw-probability calculator.',
    ],
  },
} as const;

export default async function HomePage({ searchParams }: PageProps) {
  const raw = (await searchParams).lang;
  const lang = readTextLang({ lang: Array.isArray(raw) ? raw[0] : raw });
  const strings = t(lang);
  const intro = INTRO[lang];

  const langQuery = lang === DEFAULT_TEXT_LANG ? '' : `lang=${lang}`;
  const withLang = (path: string, extra = '') => {
    const qs = [extra, langQuery].filter(Boolean).join('&');
    return qs === '' ? path : `${path}?${qs}`;
  };

  const typeCounts = TAXONOMY.types.map((type) => ({
    type,
    count: ALL_CARDS.filter((card) => card.types.includes(type)).length,
  }));

  /*
   * 陣圖與區域的資料都在伺服器端算好，只把畫面要用的幾個欄位傳給瀏覽器 ——
   * 不把整份卡牌資料送進首頁的客戶端程式。
   */
  const legends: LegendView[] = originLegends(ALL_CARDS).flatMap((card) => {
    const [a, b] = playDomains(card);
    const champion = championTagOf(card);
    if (!a || !b || !champion) return [];
    const region = regionOfChampion(ALL_CARDS, champion);
    return [
      {
        id: card.id,
        name: tagLabel(champion, lang),
        region: region ? tagLabel(region, lang) : null,
        a,
        b,
        href: withLang(`/cards/${card.id}`),
      },
    ];
  });

  const domainHref = Object.fromEntries(
    RING.map((domain) => [domain, withLang('/cards', `domain=${domain}`)]),
  ) as Record<PlayDomain, string>;

  const regions: RegionView[] = REGIONS.map((region) => {
    const stat = regionStat(ALL_CARDS, region.tag);
    return {
      tag: region.tag,
      name: tagLabel(region.tag, lang),
      subName: lang === 'en' ? null : region.tag,
      color: region.color,
      count: stat.count,
      domains: stat.domains,
      champions: stat.champions.map((c) => tagLabel(c, lang)),
      lore: region.lore[lang],
      href: withLang('/cards', `tag=${encodeURIComponent(region.tag)}`),
    };
  }).sort((x, y) => y.count - x.count);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      <HomeWheelHero lang={lang} legends={legends} domainHref={domainHref}>
        <p className="text-xs font-bold tracking-[0.28em] text-accent uppercase">
          {strings.siteTagline}
        </p>
        <h1 className="text-4xl leading-tight font-bold tracking-wide text-ink sm:text-5xl">
          {strings.siteName}
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-ink-dim">{intro.body}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={withLang('/cards')}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-soft"
          >
            {intro.enter}
          </Link>
          <Link
            href={withLang('/cards', 'type=legend')}
            className="rounded-lg border border-line px-5 py-2.5 text-sm text-ink-dim transition-colors hover:border-accent hover:text-ink"
          >
            {intro.browseLegends}
          </Link>
        </div>
      </HomeWheelHero>

      <RegionAtlas lang={lang} regions={regions} />

      <section className="border-t border-surface-2 py-14">
        <h2 className="text-2xl font-bold text-ink">{intro.contents}</h2>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TAXONOMY.sets.map((set) => (
            <div key={set.id} className="rounded-xl border border-line bg-surface-1 p-4">
              <dt className="text-xs text-ink-faint">
                {SET_LABELS[set.id][lang]}
                {lang !== 'en' && (
                  <span className="ml-1 text-ink-faint/70">{SET_LABELS[set.id].en}</span>
                )}
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">{set.count}</dd>
            </div>
          ))}
        </dl>

        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {typeCounts.map(({ type, count }) => (
            <li key={type}>
              <Link
                href={withLang('/cards', `type=${type}`)}
                className="block rounded-xl border border-line bg-surface-1 p-4 transition-colors hover:border-accent"
              >
                <span className="text-xs text-ink-faint">{TYPE_LABELS[type][lang]}</span>
                <span className="mt-1 block text-xl font-semibold text-ink">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-2xl pb-6">
        <h2 className="text-2xl font-bold text-ink">{intro.aboutTitle}</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-dim">
          {intro.about.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
