'use client';

import { BAN_LIST_VERSION } from '@/lib/ban-list';
import { NOT_CHECKED, RULES_VERSION, type LegalityResult } from '@/lib/deck-rules';
import type { TextLang } from '@/lib/i18n';

/**
 * 合法性檢查結果。
 *
 * 每一條訊息都附上官方規則條號 —— 這不是裝飾。
 * 本專案先前曾憑印象寫錯過遊戲規則並上線，因此現在的原則是：
 * 凡是規則相關的斷言，都必須讓使用者能自行查證出處。
 */
export function DeckLegality({ result, lang }: { result: LegalityResult; lang: TextLang }) {
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');

  return (
    <section className="mb-5" data-testid="deck-legality">
      <div
        className={`rounded-lg border px-3 py-2 ${
          result.legal
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-line bg-surface-1'
        }`}
      >
        <p
          className={`text-sm font-medium ${result.legal ? 'text-emerald-300' : 'text-ink'}`}
          data-legal={result.legal}
        >
          {result.legal
            ? warnings.length === 0
              ? '✓ 符合核心規則的構築限制'
              : `✓ 沒有違規，但有 ${warnings.length} 項提醒`
            : `尚未完成：${errors.length} 項待處理`}
        </p>

        {(errors.length > 0 || warnings.length > 0) && (
          <ul className="mt-2 space-y-1.5" data-testid="legality-issues">
            {[...errors, ...warnings].map((issue, index) => (
              <li key={`${issue.rule}-${index}`} className="flex gap-2 text-xs leading-relaxed">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1 font-mono text-[0.65rem] ${
                    issue.severity === 'error'
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                  /* 禁卡提醒帶的是禁卡表版本日期，不是規則條號 —— 別標錯 */
                  title={
                    issue.rule.startsWith('禁卡表') ? '官方禁卡表版本' : '官方核心規則條號'
                  }
                >
                  {issue.rule}
                </span>
                <span className={issue.severity === 'error' ? 'text-ink-dim' : 'text-amber-200/80'}>
                  {issue.message[lang]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-dim">
          這個檢查涵蓋什麼、不涵蓋什麼
        </summary>
        <p className="mt-1.5 rounded-lg border border-line px-3 py-2 text-xs leading-relaxed text-ink-dim">
          {NOT_CHECKED[lang]}
        </p>
        <p className="mt-1 text-[0.7rem] text-ink-faint">
          規則依據：{RULES_VERSION.document}（{RULES_VERSION.updated}）
        </p>
        {/*
          禁卡表是人工維護、沒有 API 的資料，會過期。
          把版本日期與官方出處放在使用者看得到的地方，他才有辦法自己判斷可不可信。
        */}
        <p className="mt-0.5 text-[0.7rem] text-ink-faint">
          禁卡表依據：{BAN_LIST_VERSION.document}（{BAN_LIST_VERSION.updated}）·{' '}
          <a
            href={BAN_LIST_VERSION.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink-dim"
          >
            官方公告
          </a>
        </p>
      </details>
    </section>
  );
}
