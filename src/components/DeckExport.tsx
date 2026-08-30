'use client';

import { useRef, useState } from 'react';
import { cardName } from '@/lib/cards';
import {
  collectionFromCsv,
  collectionToCsv,
  deckRows,
  downloadText,
  missingToCsv,
  safeFilename,
  toCsv,
  toPlainText,
  zoneLabel,
} from '@/lib/deck-export';
import { downloadBlob, renderDeckImage } from '@/lib/deck-image';
import type { Collection, MissingEntry } from '@/lib/collection';
import type { Deck } from '@/lib/deck-rules';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/** 匯入 CSV 的大小上限。檔案來自使用者，不能無限制讀進記憶體。 */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

export function DeckExport({
  deck,
  deckName,
  byId,
  cards,
  lang,
  missing,
  collection,
  trackCollection,
  saveFailed,
  onCollectionReplace,
  onTrackChange,
}: {
  deck: Deck;
  deckName: string;
  byId: Map<string, Card>;
  cards: Card[];
  lang: TextLang;
  missing: MissingEntry[];
  collection: Collection;
  trackCollection: boolean;
  saveFailed: boolean;
  onCollectionReplace: (next: Collection) => void;
  onTrackChange: (on: boolean) => void;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = deckRows(deck, byId);
  const isEmpty = rows.length === 0;

  const say = (kind: NonNullable<Notice>['kind'], text: string) => setNotice({ kind, text });

  // ── 匯出 ───────────────────────────────────────────────────────

  const copyToClipboard = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say('ok', `已複製${what}`);
    } catch {
      // 有些瀏覽器在非 HTTPS 或未取得權限時會拒絕
      say('error', '瀏覽器不允許複製，請改用下載');
    }
  };

  const exportText = () =>
    copyToClipboard(toPlainText(deck, byId, lang, deckName), '牌表文字');

  const exportShareUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    return copyToClipboard(url, '分享網址');
  };

  const exportCsv = () => {
    downloadText(safeFilename(deckName, 'csv'), toCsv(deck, byId, lang), 'text/csv');
    say('ok', 'CSV 已下載（Excel 可直接開啟）');
  };

  const exportPng = async () => {
    setBusy(true);
    try {
      const blob = await renderDeckImage(deck, byId, lang, deckName);
      if (!blob) {
        say('error', '這個瀏覽器不支援圖片輸出，請改用其他格式');
        return;
      }
      downloadBlob(safeFilename(deckName, 'png'), blob);
      say('ok', '圖片已下載');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = () => {
    // 用瀏覽器內建的列印功能，在對話框裡選「另存為 PDF」
    say('ok', '請在列印視窗選擇「另存為 PDF」');
    window.print();
  };

  const exportMissing = () => {
    downloadText(
      safeFilename(`${deckName}-缺卡清單`, 'csv'),
      missingToCsv(missing, byId, lang),
      'text/csv',
    );
    say('ok', '缺卡清單已下載');
  };

  // ── 收藏的匯出／匯入 ───────────────────────────────────────────

  const exportCollection = () => {
    downloadText(
      safeFilename('我的收藏', 'csv'),
      collectionToCsv(collection, byId, lang),
      'text/csv',
    );
    say('ok', '收藏已備份');
  };

  const importCollection = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      say('error', '檔案太大（上限 2MB），這應該不是收藏備份檔');
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      // 檔案內容是不可信輸入，collectionFromCsv 會逐列驗證卡號與張數
      const result = collectionFromCsv(text, cards);
      if (result.imported === 0) {
        say('error', '檔案裡沒有可辨識的卡號，請確認是本站匯出的收藏 CSV');
        return;
      }
      onCollectionReplace(result.collection);
      say(
        result.skipped > 0 ? 'warn' : 'ok',
        result.skipped > 0
          ? `匯入 ${result.imported} 筆，略過 ${result.skipped} 筆無法辨識的資料`
          : `匯入 ${result.imported} 筆`,
      );
    } catch {
      say('error', '讀取檔案失敗');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const btn =
    'rounded-lg border border-line px-3 py-2 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <>
      <section className="mb-5 rounded-lg border border-line bg-surface-1 p-3">
        <h3 className="mb-2 text-sm font-semibold text-ink">匯出與分享</h3>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button type="button" onClick={exportShareUrl} disabled={isEmpty} className={btn}>
            複製分享網址
          </button>
          <button type="button" onClick={exportText} disabled={isEmpty} className={btn}>
            複製牌表文字
          </button>
          <button type="button" onClick={exportCsv} disabled={isEmpty} className={btn}>
            下載 CSV
          </button>
          <button type="button" onClick={exportPdf} disabled={isEmpty} className={btn}>
            列印／PDF
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={isEmpty || busy}
            className={btn}
          >
            {busy ? '產生中…' : '下載圖片'}
          </button>
        </div>

        {notice && (
          <p
            role="status"
            className={`mt-2 text-xs ${
              notice.kind === 'ok'
                ? 'text-emerald-300'
                : notice.kind === 'warn'
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }`}
          >
            {notice.text}
          </p>
        )}
      </section>

      {/* ── 收藏管理 ── */}
      <section className="mb-5 rounded-lg border border-line bg-surface-1 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">我的收藏</h3>
          <label className="flex items-center gap-1.5 text-xs text-ink-dim">
            <input
              type="checkbox"
              checked={trackCollection}
              onChange={(e) => onTrackChange(e.target.checked)}
              className="accent-current"
            />
            開啟
          </label>
        </div>

        <p className="mb-2 text-xs leading-relaxed text-ink-faint">
          記錄你實際擁有哪些卡、各幾張，就能算出照這副牌組還缺什麼。
          <br />
          資料只存在<strong className="text-ink-dim">這台裝置的這個瀏覽器</strong>
          ，不會上傳到任何地方 —— 也就是說換手機看不到、清除瀏覽資料會消失。
          <strong className="text-ink-dim">請定期備份。</strong>
        </p>

        {saveFailed && (
          <p className="mb-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">
            瀏覽器儲存失敗（可能是無痕模式或空間不足），這次的變更關掉頁面就會消失。
          </p>
        )}

        {trackCollection && (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={exportCollection}
                disabled={Object.keys(collection).length === 0}
                className={btn}
              >
                備份收藏
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className={btn}
              >
                還原備份
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importCollection(file);
                }}
              />
            </div>

            <p className="text-xs text-ink-faint">
              已標記 {Object.keys(collection).length} 種卡，共{' '}
              {Object.values(collection).reduce((a, b) => a + b, 0)} 張。
              到右側卡片下方的「擁有」欄位增減張數。
            </p>
          </>
        )}
      </section>

      {/* ── 缺卡清單 ── */}
      {trackCollection && !isEmpty && (
        <section className="mb-5 rounded-lg border border-line bg-surface-1 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">還需要蒐集</h3>
            {missing.length > 0 && (
              <button type="button" onClick={exportMissing} className={btn}>
                下載清單
              </button>
            )}
          </div>

          {missing.length === 0 ? (
            <p className="text-xs text-emerald-300">這副牌組你已經湊齊了。</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-faint">
                共缺 {missing.reduce((sum, m) => sum + m.short, 0)} 張，
                {missing.length} 種。異畫版與普通版視為同一張卡（官方以卡名計算張數上限）。
              </p>
              <ul className="space-y-1">
                {missing.map((entry) => {
                  const card = byId.get(entry.cardId);
                  if (!card) return null;
                  return (
                    <li
                      key={entry.cardId}
                      className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {cardName(card, lang)}
                      </span>
                      <span className="shrink-0 font-mono text-[0.7rem] text-ink-faint">
                        {card.code}
                      </span>
                      <span className="shrink-0 text-amber-400">
                        {entry.owned}/{entry.needed}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── 列印專用版面（畫面上看不到，只在列印/存 PDF 時出現） ── */}
      <div id="deck-print" aria-hidden="true">
        <h1>{deckName}</h1>
        {(['legend', 'champion', 'main', 'runes', 'battlefields'] as const).map((zone) => {
          const inZone = rows.filter((r) => r.zone === zone);
          if (inZone.length === 0) return null;
          const total = inZone.reduce((sum, r) => sum + r.qty, 0);
          return (
            <div key={zone}>
              <h2>
                {zoneLabel(zone, lang)}（{total}）
              </h2>
              <ul>
                {inZone.map(({ card, qty }) => (
                  <li key={card.id}>
                    {qty} × {cardName(card, lang)}
                    {lang !== 'en' && ` / ${card.name}`} （{card.code}）
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p>符文戰場資料庫 · 本頁由瀏覽器列印功能產生</p>
      </div>
    </>
  );
}
