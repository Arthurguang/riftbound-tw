'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BattlefieldBackdrop } from './BattlefieldBackdrop';
import { backdropIntensity, STORAGE_KEYS } from '@/lib/ambience';
import { isWebAudioSupported, startBattleMusic, type BattleMusic } from '@/lib/battle-music';

/**
 * 全站的背景氛圍：動畫＋音樂的狀態都放在這裡。
 *
 * 放在 layout 裡，站內換頁時不會重新掛載 —— 音樂不會因為換頁而中斷，
 * 動畫也不會每換一頁就重來一次。
 *
 * 控制按鈕（AmbienceControls）放在頁首，不浮在內容上，
 * 才不會擋住復盤桌面、牌組編輯器這些需要點來點去的地方。
 */

type AmbienceState = {
  paused: boolean;
  togglePaused: () => void;
  musicOn: boolean;
  /** 瀏覽器能不能即時合成聲音；不能時音樂按鈕停用並說明原因。 */
  musicSupported: boolean;
  toggleMusic: () => void;
};

const AmbienceContext = createContext<AmbienceState | null>(null);

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 無痕模式或瀏覽器擋住儲存時存不了，不影響功能
  }
}

export function AmbienceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [paused, setPaused] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  // 伺服器端先假設支援（按鈕照常顯示），掛載後再依瀏覽器實際情況更正
  const [musicSupported, setMusicSupported] = useState(true);
  const music = useRef<BattleMusic | null>(null);

  // 掛載後才讀瀏覽器的狀態（伺服器端沒有 localStorage，也不知道支不支援聲音）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時讀取瀏覽器專屬狀態
    if (readStored(STORAGE_KEYS.paused) === '1') setPaused(true);
    setMusicSupported(isWebAudioSupported());
  }, []);

  // 離開網站（元件卸載）時一定把聲音關掉
  useEffect(() => () => music.current?.stop(), []);

  const togglePaused = () => {
    const next = !paused;
    setPaused(next);
    writeStored(STORAGE_KEYS.paused, next ? '1' : '0');
  };

  // 只會從按鈕的點擊呼叫 —— 瀏覽器規定與 WCAG 1.4.2 都要求聲音由使用者啟動、可隨時停止
  const toggleMusic = () => {
    if (music.current) {
      music.current.stop();
      music.current = null;
      setMusicOn(false);
      return;
    }
    music.current = startBattleMusic();
    setMusicOn(music.current !== null);
  };

  return (
    <AmbienceContext.Provider
      value={{ paused, togglePaused, musicOn, musicSupported, toggleMusic }}
    >
      <BattlefieldBackdrop intensity={backdropIntensity(pathname)} paused={paused} />
      {children}
    </AmbienceContext.Provider>
  );
}

export function AmbienceControls() {
  const state = useContext(AmbienceContext);
  if (!state) return null;
  const { paused, togglePaused, musicOn, musicSupported, toggleMusic } = state;

  const iconButton =
    'flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs transition-colors';

  return (
    <div className="flex items-center gap-1.5" data-testid="ambience-controls">
      <button
        type="button"
        aria-label="暫停背景動畫"
        aria-pressed={paused}
        title={paused ? '背景動畫已暫停，點一下恢復' : '暫停背景動畫'}
        onClick={togglePaused}
        className={`${iconButton} ${paused ? 'border-arcane text-arcane-soft' : 'border-line text-ink-dim hover:text-ink'}`}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <button
        type="button"
        aria-label="背景音樂"
        aria-pressed={musicOn}
        disabled={!musicSupported}
        title={
          !musicSupported
            ? '這個瀏覽器不支援即時合成的背景音樂'
            : musicOn
              ? '背景音樂播放中，點一下關閉'
              : '播放背景音樂（程式即時合成）'
        }
        onClick={toggleMusic}
        className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40 ${musicOn ? 'border-accent text-accent-soft' : 'border-line text-ink-dim hover:text-ink'}`}
      >
        ♪{musicOn ? ' 開' : ''}
      </button>
    </div>
  );
}
