'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 一顆問號按鈕，點了才展開說明。
 *
 * ── 為什麼要有這個 ──────────────────────────────────────────────
 *
 * 側欄每一塊功能底下原本都跟著一段規則說明。那些內容是有價值的
 * （本專案的原則是「凡是規則相關的斷言都要能查證」），但**它們只有第一次
 * 需要讀**，之後每次都佔著位置。使用者反映「最上面四個按鈕的區塊太小了」——
 * 空間就是被這些說明吃掉的。
 *
 * 改成點了才看，說明一個字都沒刪，但預設不佔高度。
 *
 * ── 為什麼是自己寫而不是用 title 屬性 ──────────────────────────
 *
 * title 的原生提示要滑鼠停留一秒才出現、手機上根本沒有、而且不能換行
 * 或標重點。這些說明有好幾句還帶規則條號，需要真的排版。
 *
 * ── 為什麼要自己算位置 ──────────────────────────────────────────
 *
 * 第一版用 absolute 相對按鈕定位，結果**被裁掉了**：側欄的面板區是
 * overflow-y-auto，而依 CSS 規格，一個軸不是 visible 時另一個軸的 visible
 * 也會變成 auto —— 所以水平方向照樣會裁。實測面板左緣 810px、容器左緣 889px，
 * 有 79px 直接看不到。側欄本身只有約 177px 寬，把面板縮到塞得下也不實際。
 *
 * 所以改用 position: fixed —— 它以視窗為基準，不受任何祖先的 overflow 影響。
 *
 * ── 這樣不會違反 CSP 嗎 ─────────────────────────────────────────
 *
 * 不會，而且是實測過的。全站 style-src 沒有開 unsafe-inline，但那擋的是
 * **HTML 原始碼裡的 style 屬性**；透過 CSSOM（element.style.top = ...）設定
 * 不在 CSP 的管轄範圍內。在實際部署的頁面上試過，樣式生效且沒有任何違規回報。
 *
 * 這裡刻意用 ref + CSSOM 直接設定，而不是 React 的 style prop ——
 * 意圖比較明確，也不必去猜 React 內部用哪種方式寫入。
 */
export function HelpTip({
  label,
  children,
  align = 'right',
}: {
  /** 給螢幕閱讀器用的說明，例如「戰力加成的說明」。 */
  label: string;
  children: React.ReactNode;
  /** 面板往左或往右展開 —— 靠近側欄右緣的用 right，避免超出畫面。 */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  /** 面板寬度（px）—— 要和下面 Tailwind 的 w-64 一致。 */
  const PANEL_W = 256;
  /** 離視窗邊緣至少留這麼多，免得貼邊。 */
  const EDGE = 8;

  /**
   * 把面板擺在按鈕正下方，並夾在視窗範圍內。
   *
   * 夾住這件事是必要的：這顆按鈕常常就在視窗右緣附近，
   * 不夾的話面板會有一半跑到畫面外 —— 那跟被裁掉沒兩樣。
   */
  const place = useCallback(() => {
    const btn = btnRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const left = Math.min(
      Math.max(EDGE, align === 'right' ? r.right - PANEL_W : r.left),
      window.innerWidth - PANEL_W - EDGE,
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(r.bottom + 4)}px`;
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  /*
   * 捲動或改變視窗大小時跟著移動。
   *
   * scroll 用捕獲階段監聽：面板可能開在側欄那種**內層**捲動容器裡，
   * 內層捲動不會冒泡到 window，只有捕獲階段抓得到。
   */
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  /*
   * 點別處或按 Esc 就收起來。
   *
   * 沒有這段的話，側欄上同時開好幾個說明會疊在一起 ——
   * 本來要省空間，反而更亂。
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        data-help-tip={open ? 'open' : 'closed'}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem] leading-none transition-colors ${
          open
            ? 'border-accent bg-accent/15 text-accent-soft'
            : 'border-line text-ink-faint hover:border-surface-3 hover:text-ink-dim'
        }`}
      >
        ?
      </button>

      {open && (
        <span
          ref={panelRef}
          role="note"
          data-testid="help-tip-panel"
          className="fixed top-0 left-0 z-30 w-64 rounded-lg border border-line bg-surface-2 p-2.5 text-[0.7rem] leading-relaxed text-ink-dim shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
