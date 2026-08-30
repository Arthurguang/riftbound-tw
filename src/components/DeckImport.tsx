'use client';

import { useRef, useState } from 'react';
import { IMPORT_EXAMPLE, importDeck, inferChampion } from '@/lib/deck-import';
import type { Deck } from '@/lib/deck-rules';
import type { Card } from '@/lib/types';

/** 貼上或上傳的內容上限。檔案來自使用者，不能無限制讀進記憶體。 */
const MAX_BYTES = 1024 * 1024;

const REASON_LABEL: Record<string, string> = {
  'unknown-card': '找不到這張卡',
  'bad-quantity': '張數不合理',
  ambiguous: '無法判斷是哪一張',
};

/**
 * 牌組匯入。
 *
 * 支援貼上文字或上傳 CSV／txt。**不支援圖片與 PDF**，理由寫在介面上 ——
 * 圖片要文字辨識，辨識錯了會安靜地給你一副錯的牌組，那是最糟的失敗方式。
 */
export function DeckImport({
  cards,
  byId,
  onImport,
}: {
  cards: Card[];
  byId: Map<string, Card>;
  onImport: (deck: Deck, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof importDeck> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = (content: string) => {
    // 貼上的內容是不可信輸入，importDeck 會逐行比對真實卡片
    const parsed = importDeck(content, cards);
    setResult(parsed);
    return parsed;
  };

  const apply = () => {
    const parsed = result ?? run(text);
    if (parsed.imported === 0) return;

    // 牌表通常不標明選定英雄，能唯一推斷時才自動補上
    const championId = inferChampion(parsed.deck, byId);
    onImport({ ...parsed.deck, championId }, parsed.name);

    setOpen(false);
    setText('');
    setResult(null);
  };

  const readFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setResult({
        deck: { legendId: null, championId: null, main: {}, runes: {}, battlefields: {}, sideboard: {} },
        name: null,
        imported: 0,
        issues: [{ line: 0, text: '檔案太大（上限 1MB）', reason: 'unknown-card' }],
      });
      return;
    }
    const content = await file.text();
    setText(content);
    run(content);
    if (fileInput.current) fileInput.current.value = '';
  };

  const btn =
    'rounded-lg border border-line px-3 py-2 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft"
      >
        匯入牌組（貼上牌表或 CSV）
      </button>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-accent/40 bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">匯入牌組</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          className="text-xs text-ink-dim hover:text-ink"
        >
          取消
        </button>
      </div>

      <label htmlFor="import-text" className="sr-only">
        牌表內容
      </label>
      <textarea
        id="import-text"
        value={text}
        rows={8}
        spellCheck={false}
        placeholder={IMPORT_EXAMPLE}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => run(text)} disabled={text.trim() === ''} className={btn}>
          檢查
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={(result?.imported ?? 0) === 0}
          className={btn}
        >
          {result ? `匯入 ${result.imported} 種卡` : '匯入'}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={btn}>
          從檔案讀取
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
      </div>

      {result && (
        <div className="mt-2 space-y-2" data-testid="import-result">
          <p
            className={`text-xs ${
              result.imported > 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {result.imported > 0
              ? `認出 ${result.imported} 種卡${result.name ? `，牌組名稱「${result.name}」` : ''}`
              : '沒有認出任何卡牌'}
          </p>

          {result.issues.length > 0 && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2">
              <p className="mb-1 text-xs text-amber-300">
                有 {result.issues.length} 行無法辨識，這幾行會被略過：
              </p>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                {result.issues.slice(0, 20).map((issue, index) => (
                  <li key={`${issue.line}-${index}`} className="text-[0.7rem] text-amber-200/80">
                    第 {issue.line} 行「{issue.text.slice(0, 40)}」—{' '}
                    {REASON_LABEL[issue.reason] ?? issue.reason}
                  </li>
                ))}
                {result.issues.length > 20 && (
                  <li className="text-[0.7rem] text-amber-200/60">
                    …還有 {result.issues.length - 20} 行
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-dim">
          支援哪些格式？為什麼不能匯入圖片或 PDF？
        </summary>
        <div className="mt-1.5 space-y-1.5 rounded-lg border border-line px-3 py-2 text-xs leading-relaxed text-ink-dim">
          <p>
            <strong className="text-ink">認得的格式：</strong>
            本站匯出的 CSV 與牌表文字；一般抄牌網站的純文字（「3 卡名」「3x 卡名」
            「卡名 x3」都可以）。卡名可以是繁中、简中或英文，也可以直接寫卡號。
            有【備牌】或 Sideboard 標題時會自動放進備牌區。
          </p>
          <p>
            <strong className="text-ink">圖片不支援。</strong>
            要從圖片讀出卡名需要文字辨識，而辨識錯的時候不會報錯 ——
            它會安靜地給你一副錯的牌組。這種失敗方式比不支援更糟。
          </p>
          <p>
            <strong className="text-ink">PDF 不支援。</strong>
            在瀏覽器裡解析任意 PDF 要帶一個大型套件進來，違背本站「零執行期套件」
            的原則。你從本站匯出的 PDF，用同一副牌的 CSV 或分享網址就能還原。
          </p>
          <p>
            認不出來的行一律<strong className="text-ink">略過並列出來</strong>給你看，不會猜。同名卡有多個版本時，
            一律取卡號最小的那張；要指定版本請直接寫卡號。
          </p>
        </div>
      </details>
    </section>
  );
}
