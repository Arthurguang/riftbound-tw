import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * 頁面「活過來」（hydration 完成、按鈕都接上事件）之後才是 true。
 *
 * 伺服器先送出畫好的 HTML，瀏覽器下載完程式後才接手；接手之前按鈕看得到但按了沒反應。
 * 元件用它在最外層標上 data-ready，端對端測試等到這個標記才開始操作 ——
 * 2026-09-11 對正式站跑測試時，網頁程式要從網路下載，測試在接手前就點了，點擊被吃掉。
 *
 * 用 useSyncExternalStore 而不是「掛載後 setState」：伺服器端與 hydration 當下都是 false，
 * 接手完成後才重新渲染成 true，也不會觸發 react-hooks/set-state-in-effect。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
