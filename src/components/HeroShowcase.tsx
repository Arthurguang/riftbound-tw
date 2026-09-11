'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAmbiencePaused } from './Ambience';
import { frontIndex, ringRadius, shortestStep } from '@/lib/showcase';
import type { TextLang } from '@/lib/i18n';

/**
 * 首頁主視覺：傳奇展示台。
 *
 * 所有傳奇圍成一圈，像展示間的轉盤一樣自動慢慢轉，一位一位轉到正前方；
 * 點任何一張卡，跳出這位傳奇的說明（卡圖、領域、能力文字、完整卡片頁的連結）。
 *
 * ── 資安 ────────────────────────────────────────────────────────
 * 每張卡的角度要依傳奇數量計算，但本站 CSP 不允許 HTML 的 style 屬性。
 * 這裡改由程式在掛載後設定 element.style.transform（CSSOM）—— CSP 不限制這種寫法，
 * 攻擊者也無法藉此注入樣式（值全部是程式算出來的數字）。
 * 說明文字由伺服器端先渲染好再傳進來（details），首頁的瀏覽器程式不必載入整份卡牌資料。
 *
 * ── 不干擾、可操作 ──────────────────────────────────────────────
 * 以下情況轉盤會停：滑鼠移上去、鍵盤焦點在裡面、說明視窗開著、
 * 頁首按了「暫停背景動畫」、系統設定「減少動態效果」（WCAG 2.2.2）。
 * 鍵盤移到哪張卡，那張就轉到正前方；另有「上一位／下一位」按鈕。
 * 自動轉動時說明文字不朗讀（aria-live 關閉），停下來才朗讀，避免每幾秒打斷一次。
 */

export type ShowcaseLegend = {
  id: string;
  /** 英雄名（例如「凱莎」），展示台下方的說明用 */
  name: string;
  /** 完整卡名 */
  title: string;
  subtitle: string | null;
  image: string;
  largeImage: string;
  href: string;
  /** 伺服器端先渲染好的領域與能力文字 */
  details: ReactNode;
};

/** 每位傳奇在正前方停留的時間 */
const STEP_MS = 3200;
/** 與 globals.css 的 .showcase-card 寬度一致 */
const CARD_WIDTH = 132;

const STRINGS: Record<
  TextLang,
  {
    region: string;
    hint: string;
    prev: string;
    next: string;
    open: (title: string) => string;
    full: string;
    close: string;
  }
> = {
  'zh-TW': {
    region: '傳奇展示台',
    hint: '點卡片看說明',
    prev: '上一位',
    next: '下一位',
    open: (title) => `${title}：看傳奇說明`,
    full: '看完整卡片頁 →',
    close: '關閉',
  },
  'zh-CN': {
    region: '传奇展示台',
    hint: '点卡片看说明',
    prev: '上一位',
    next: '下一位',
    open: (title) => `${title}：看传奇说明`,
    full: '看完整卡片页 →',
    close: '关闭',
  },
  en: {
    region: 'Legend showcase',
    hint: 'Click a card for details',
    prev: 'Previous',
    next: 'Next',
    open: (title) => `${title}: view details`,
    full: 'Full card page →',
    close: 'Close',
  },
};

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function HeroShowcase({ lang, legends }: { lang: TextLang; legends: ShowcaseLegend[] }) {
  const s = STRINGS[lang];
  const count = legends.length;
  const angle = count > 0 ? 360 / count : 0;
  const radius = ringRadius(CARD_WIDTH, count);

  const [turn, setTurn] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const ambiencePaused = useAmbiencePaused();
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );

  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const front = frontIndex(turn, count);
  const current = legends[front];
  const opened = legends.find((legend) => legend.id === openId) ?? null;
  const autoPaused = hovering || focused || ambiencePaused || reduceMotion || opened !== null;

  // 每張卡在圓周上的位置（CSSOM，見檔案開頭的說明）
  useEffect(() => {
    cardRefs.current.forEach((el, index) => {
      if (el) el.style.transform = `rotateY(${index * angle}deg) translateZ(${radius}px)`;
    });
  }, [angle, radius, count]);

  // 整個轉盤轉到正面是第 front 張的角度
  useEffect(() => {
    const ring = ringRef.current;
    if (ring) ring.style.transform = `translateZ(${-radius}px) rotateY(${-turn * angle}deg)`;
  }, [turn, angle, radius]);

  // 自動轉動
  useEffect(() => {
    if (autoPaused || count < 2) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), STEP_MS);
    return () => window.clearInterval(timer);
  }, [autoPaused, count]);

  // 說明視窗：瀏覽器內建的 <dialog> 會處理焦點鎖定與 Esc 關閉
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (opened && !dialog.open) dialog.showModal();
    if (!opened && dialog.open) dialog.close();
  }, [opened]);

  const bringToFront = (index: number) =>
    setTurn((t) => t + shortestStep(frontIndex(t, count), index, count));

  if (count === 0) return null;

  return (
    <div className="relative">
      <section
        aria-roledescription="carousel"
        aria-label={s.region}
        data-testid="hero-showcase"
        data-front={front}
        data-auto={autoPaused ? 'paused' : 'running'}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
        className="relative"
      >
        <div aria-hidden="true" className="hero-ember-glow pointer-events-none absolute -inset-[8%]" />
        <div className="showcase-mask relative h-[300px] lg:h-[360px]">
          <div className="showcase-stage absolute inset-0 scale-[0.82] lg:scale-100">
            <div ref={ringRef} className="showcase-ring">
              {legends.map((legend, index) => (
                <button
                  key={legend.id}
                  ref={(el) => {
                    cardRefs.current[index] = el;
                  }}
                  type="button"
                  data-showcase-card={legend.id}
                  data-front={index === front ? 'true' : undefined}
                  aria-label={s.open(legend.title)}
                  onFocus={() => bringToFront(index)}
                  onClick={() => {
                    bringToFront(index);
                    setOpenId(legend.id);
                  }}
                  className={`showcase-card ${index === front ? 'is-front' : ''}`}
                >
                  <img
                    src={legend.image}
                    alt=""
                    loading={Math.abs(shortestStep(0, index, count)) <= 3 ? 'eager' : 'lazy'}
                    referrerPolicy="no-referrer"
                    className="card-frame--portrait w-full rounded-xl object-cover ring-1 ring-white/10"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={s.prev}
            onClick={() => setTurn((t) => t - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1/80 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ‹
          </button>
          <p aria-live={autoPaused ? 'polite' : 'off'} className="min-w-[11rem] text-center text-sm">
            <span className="font-semibold text-ink">{current?.name}</span>
            <span className="ml-2 text-xs text-ink-faint">{s.hint}</span>
          </p>
          <button
            type="button"
            aria-label={s.next}
            onClick={() => setTurn((t) => t + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-1/80 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ›
          </button>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby="legend-dialog-title"
        data-testid="legend-dialog"
        onClose={() => setOpenId(null)}
        onClick={(event) => {
          // 點到視窗外面的遮罩也關閉
          if (event.target === event.currentTarget) setOpenId(null);
        }}
        className="legend-dialog"
      >
        {opened && (
          <div className="relative grid gap-6 p-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:p-7">
            <img
              src={opened.largeImage}
              alt={opened.title}
              referrerPolicy="no-referrer"
              className="card-frame--portrait w-full max-w-[260px] justify-self-center rounded-xl object-cover shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)]"
            />
            <div className="flex min-w-0 flex-col gap-4">
              <div className="pr-8">
                <h2 id="legend-dialog-title" className="text-2xl font-bold text-ink">
                  {opened.title}
                </h2>
                {opened.subtitle && <p className="mt-1 text-sm text-ink-dim">{opened.subtitle}</p>}
              </div>
              {opened.details}
              <Link
                href={opened.href}
                className="mt-auto self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent-soft"
              >
                {s.full}
              </Link>
            </div>
            <button
              type="button"
              aria-label={s.close}
              onClick={() => setOpenId(null)}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-dim transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
