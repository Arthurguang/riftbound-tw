'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BattlefieldBackdrop } from './BattlefieldBackdrop';
import {
  BACKDROP_VARIANTS,
  backdropIntensity,
  isBackdropVariant,
  STORAGE_KEYS,
  type BackdropVariant,
} from '@/lib/ambience';
import { startBattleMusic, type BattleMusic } from '@/lib/battle-music';

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
  variant: BackdropVariant;
  setVariant: (variant: BackdropVariant) => void;
  paused: boolean;
  togglePaused: () => void;
  musicOn: boolean;
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
  const [variant, setVariantState] = useState<BackdropVariant>('embers');
  const [paused, setPaused] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const music = useRef<BattleMusic | null>(null);

  // 掛載後才讀瀏覽器存的偏好（伺服器端沒有 localStorage）
  useEffect(() => {
    const storedVariant = readStored(STORAGE_KEYS.variant);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時讀取瀏覽器專屬狀態
    if (isBackdropVariant(storedVariant)) setVariantState(storedVariant);
    if (readStored(STORAGE_KEYS.paused) === '1') setPaused(true);
  }, []);

  // 離開網站（元件卸載）時一定把聲音關掉
  useEffect(() => () => music.current?.stop(), []);

  const setVariant = (next: BackdropVariant) => {
    setVariantState(next);
    writeStored(STORAGE_KEYS.variant, next);
  };

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
      value={{ variant, setVariant, paused, togglePaused, musicOn, toggleMusic }}
    >
      <BattlefieldBackdrop
        variant={variant}
        intensity={backdropIntensity(pathname)}
        paused={paused}
      />
      {children}
    </AmbienceContext.Provider>
  );
}

const VARIANT_LABEL: Record<BackdropVariant, string> = {
  embers: '餘燼',
  runes: '光痕',
  mixed: '混合',
};

export function AmbienceControls() {
  const state = useContext(AmbienceContext);
  if (!state) return null;
  const { variant, setVariant, paused, togglePaused, musicOn, toggleMusic } = state;

  const iconButton =
    'flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs transition-colors';

  return (
    <div className="flex items-center gap-1.5" data-testid="ambience-controls">
      {/* 試看用：三種動畫風格。使用者選定之後會拿掉這一組，只留選中的那一種。 */}
      <div
        role="group"
        aria-label="背景動畫風格（試看）"
        className="flex items-center gap-0.5 rounded-full border border-line p-0.5"
      >
        {BACKDROP_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={variant === v}
            data-variant={v}
            onClick={() => setVariant(v)}
            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
              variant === v ? 'bg-arcane text-surface' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {VARIANT_LABEL[v]}
          </button>
        ))}
      </div>
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
        title={musicOn ? '背景音樂播放中，點一下關閉' : '播放背景音樂（程式即時合成）'}
        onClick={toggleMusic}
        className={`${iconButton} ${musicOn ? 'border-accent text-accent-soft' : 'border-line text-ink-dim hover:text-ink'}`}
      >
        ♪{musicOn ? ' 開' : ''}
      </button>
    </div>
  );
}
