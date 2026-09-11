'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useAmbiencePaused } from './Ambience';
import { angleForIndex, frontFromAngle, ringRadius, snapAngle } from '@/lib/showcase';
import type { TextLang } from '@/lib/i18n';

/**
 * 首頁主視覺：傳奇展示台。
 *
 * 所有傳奇圍成一圈，像展示間的轉盤一樣**持續慢慢轉**（使用者要求：不要轉一格停一下）。
 * 可以按住左右拖曳轉到想看的傳奇，放開後對齊最近的一張、再繼續慢慢轉；
 * 點正前方的卡，跳出這位傳奇的說明（卡圖、領域、能力文字、完整卡片頁的連結）。
 *
 * ── 資安 ────────────────────────────────────────────────────────
 * 卡片與轉盤的角度由程式設定 element.style.transform（CSSOM）。
 * 本站 CSP 不允許 HTML 的 style 屬性，但不限制這種寫法；值全部是程式算出來的數字。
 * 說明文字由伺服器端先渲染好再傳進來（details），首頁的瀏覽器程式不必載入整份卡牌資料。
 *
 * ── 效能 ────────────────────────────────────────────────────────
 * 每一格只改一個 transform，不重畫圖片；自己轉的時候最多每秒 30 格（拖曳時每格都更新，跟手）。
 * 展示台捲出畫面時整個迴圈停掉；分頁切到背景時瀏覽器也會自動停。
 * 側邊變暗用 opacity、正面發光用 box-shadow —— 都不必每格重新計算濾鏡。
 *
 * ── 什麼時候不自己轉 ────────────────────────────────────────────
 * 頁首按了「暫停背景動畫」、系統設定「減少動態效果」（WCAG 2.2.2）、說明視窗開著、
 * 用鍵盤選卡的時候（卡會轉到正前方並停住，不然焦點會被轉走）。滑鼠移上去**不會**停。
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

/** 每秒轉幾度：一圈一分鐘 */
const SPEED_DEG_PER_SEC = 6;
/** 與 globals.css 的 .showcase-card 寬度一致 */
const CARD_WIDTH = 180;
/** 拖曳一像素轉幾度 */
const DRAG_DEG_PER_PX = 0.3;
/** 移動超過這個距離才算拖曳，否則當成點擊 */
const DRAG_THRESHOLD_PX = 6;
/** 放開後對齊、按上一位／下一位時轉過去的時間 */
const EASE_MS = 500;
/** 自己轉的時候最多每秒 30 格 */
const FRAME_MS = 1000 / 30;

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
    hint: '可以拖曳轉動，點正面的卡看說明',
    prev: '上一位',
    next: '下一位',
    open: (title) => `${title}：看傳奇說明`,
    full: '看完整卡片頁 →',
    close: '關閉',
  },
  'zh-CN': {
    region: '传奇展示台',
    hint: '可以拖曳转动，点正面的卡看说明',
    prev: '上一位',
    next: '下一位',
    open: (title) => `${title}：看传奇说明`,
    full: '看完整卡片页 →',
    close: '关闭',
  },
  en: {
    region: 'Legend showcase',
    hint: 'Drag to spin, click the front card for details',
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

const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Tween = { from: number; to: number; start: number; duration: number };
type Drag = { pointerId: number; startX: number; startAngle: number; active: boolean };

export function HeroShowcase({ lang, legends }: { lang: TextLang; legends: ShowcaseLegend[] }) {
  const s = STRINGS[lang];
  const count = legends.length;
  const angleStep = count > 0 ? 360 / count : 0;
  const radius = ringRadius(CARD_WIDTH, count);

  const [front, setFront] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const ambiencePaused = useAmbiencePaused();
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );

  const sectionRef = useRef<HTMLElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 動畫迴圈用的狀態：每格都會變，放在 ref 裡，不觸發重新渲染
  const angleRef = useRef(0);
  const frontRef = useRef(0);
  const tweenRef = useRef<Tween | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** 剛拖曳完的那一下「點擊」不算數 */
  const suppressClickRef = useRef(false);

  const opened = legends.find((legend) => legend.id === openId) ?? null;
  const autoPaused = ambiencePaused || reduceMotion || keyboardFocus || opened !== null;
  const motionState = dragging ? 'dragging' : autoPaused ? 'paused' : 'running';

  // 迴圈裡要讀最新的「要不要自己轉」，用 ref 同步，才不必每次變動都重啟迴圈
  const autoPausedRef = useRef(autoPaused);
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    autoPausedRef.current = autoPaused;
    reduceMotionRef.current = reduceMotion;
  }, [autoPaused, reduceMotion]);

  // 每張卡在圓周上的位置（CSSOM，見檔案開頭的說明）
  useEffect(() => {
    cardRefs.current.forEach((el, index) => {
      if (el) el.style.transform = `rotateY(${index * angleStep}deg) translateZ(${radius}px)`;
    });
  }, [angleStep, radius, count]);

  // 動畫迴圈：持續轉動、拖曳跟手、對齊與上一位／下一位的過場
  useEffect(() => {
    const ring = ringRef.current;
    const section = sectionRef.current;
    if (!ring || !section || count === 0) return;

    let raf = 0;
    let last = 0;
    let lastApplied = 0;

    const apply = (angle: number) => {
      ring.style.transform = `translateZ(${-radius}px) rotateY(${-angle}deg)`;
      const next = frontFromAngle(angle, count);
      if (next !== frontRef.current) {
        frontRef.current = next;
        setFront(next);
      }
    };

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
      last = time;

      const tween = tweenRef.current;
      const interactive = tween !== null || dragRef.current?.active === true;
      if (tween && tween.start < 0) tween.start = time;
      if (tween) {
        const progress =
          tween.duration <= 0 ? 1 : Math.min(1, Math.max(0, (time - tween.start) / tween.duration));
        angleRef.current = tween.from + (tween.to - tween.from) * easeOut(progress);
        if (progress >= 1) tweenRef.current = null;
      } else if (!dragRef.current?.active && !autoPausedRef.current) {
        angleRef.current += SPEED_DEG_PER_SEC * dt;
      } else if (!interactive) {
        return; // 停住、也沒在拖：不必重畫
      }

      if (interactive || time - lastApplied >= FRAME_MS) {
        lastApplied = time;
        apply(angleRef.current);
      }
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // 展示台捲出畫面時停掉迴圈（省電）
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting ?? true) start();
      else stop();
    });
    observer.observe(section);

    apply(angleRef.current);
    start();
    return () => {
      stop();
      observer.disconnect();
    };
  }, [count, radius]);

  // 說明視窗：瀏覽器內建的 <dialog> 會處理焦點鎖定與 Esc 關閉
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (opened && !dialog.open) dialog.showModal();
    if (!opened && dialog.open) dialog.close();
  }, [opened]);

  // 起點時間先記成「未開始」，由動畫迴圈在下一格用那一格的時間戳記補上
  // （React 的規則不允許在元件裡直接讀時間）
  const tweenTo = (to: number) => {
    tweenRef.current = {
      from: angleRef.current,
      to,
      start: -1,
      duration: reduceMotionRef.current ? 0 : EASE_MS,
    };
  };
  const rotateTo = (index: number) => tweenTo(angleForIndex(angleRef.current, index, count));

  // ── 拖曳 ──
  // 移動超過一點點才開始拖曳並捕捉指標；只是點一下的話，照常觸發卡片的點擊
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startAngle: angleRef.current,
      active: false,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      tweenRef.current = null;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    // 往左拖，卡片往左走
    angleRef.current = drag.startAngle - dx * DRAG_DEG_PER_PX;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.active) {
      setDragging(false);
      tweenTo(snapAngle(angleRef.current, count)); // 對齊最近的一張，之後繼續慢慢轉
    }
  };

  if (count === 0) return null;
  const current = legends[front];

  return (
    <div className="relative">
      <section
        ref={sectionRef}
        aria-roledescription="carousel"
        aria-label={s.region}
        data-testid="hero-showcase"
        data-front={front}
        data-auto={motionState}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setKeyboardFocus(false);
          }
        }}
        className="relative"
      >
        <div aria-hidden="true" className="hero-ember-glow pointer-events-none absolute -inset-[6%]" />
        <div
          data-testid="showcase-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="showcase-mask showcase-drag relative h-[340px] md:h-[400px] lg:h-[460px]"
        >
          <div className="showcase-stage absolute inset-0 scale-[0.68] md:scale-[0.82] lg:scale-100">
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
                  onFocus={(event) => {
                    // 只有鍵盤操作才轉過去並停住；滑鼠點擊不算
                    if (event.currentTarget.matches(':focus-visible')) {
                      setKeyboardFocus(true);
                      rotateTo(index);
                    }
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    rotateTo(index);
                    setOpenId(legend.id);
                  }}
                  className={`showcase-card ${index === front ? 'is-front' : ''}`}
                >
                  <img
                    src={legend.image}
                    alt=""
                    draggable={false}
                    loading={Math.abs(angleForIndex(0, index, count)) <= angleStep * 3 ? 'eager' : 'lazy'}
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
            onClick={() => rotateTo(frontRef.current - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-1/80 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ‹
          </button>
          <p
            aria-live={motionState === 'running' ? 'off' : 'polite'}
            className="min-w-[14rem] text-center text-sm"
          >
            <span className="font-semibold text-ink">{current?.name}</span>
            <span className="ml-2 text-xs text-ink-faint">{s.hint}</span>
          </p>
          <button
            type="button"
            aria-label={s.next}
            onClick={() => rotateTo(frontRef.current + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-1/80 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
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
