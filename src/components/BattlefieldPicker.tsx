'use client';

import { cardImageUrl, cardName, cardTextToPlain } from '@/lib/cards';
import { cardText } from '@/lib/cards';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 戰場區域（107.2）。
 *
 * 1v1 場上有**兩處**戰場（485.4「戰場數量：2」），各由一名玩家從自己
 * 構築時放進牌組的 3 張裡選一張帶進來（485.4.a、485.5）。
 *
 * 所以這裡是兩個槽：左邊從你的牌組選，右邊從對手的牌組選。
 * 戰場有自己的能力，復盤時知道是哪一處差很多。
 */
export function BattlefieldPicker({
  battlefields,
  yourOptions,
  opponentOptions,
  byId,
  lang,
  art,
  onChange,
}: {
  battlefields: [string | null, string | null];
  /** 你牌組裡的 3 張戰場 */
  yourOptions: Card[];
  /** 對手牌組裡的 3 張戰場 */
  opponentOptions: Card[];
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: [string | null, string | null]) => void;
}) {
  const slots = [
    { index: 0 as const, label: '你帶來的戰場', options: yourOptions },
    { index: 1 as const, label: '對手帶來的戰場', options: opponentOptions },
  ];

  return (
    <section
      className="mb-4 rounded-lg border border-line bg-surface-1 p-3"
      data-testid="battlefield-zone"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-semibold text-ink">戰場區域</h2>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="官方規則條號"
        >
          107.2
        </span>
        <span className="text-xs text-ink-faint">
          1v1 場上有兩處戰場，各由一名玩家從自己的 3 張裡選一張帶進來（485.4、485.5）
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map(({ index, label, options }) => {
          const selectedId = battlefields[index];
          const selected = selectedId ? byId.get(selectedId) : undefined;

          return (
            <div key={index} className="rounded border border-line p-2">
              <label
                htmlFor={`battlefield-${index}`}
                className="mb-1 block text-xs text-ink-dim"
              >
                {label}
              </label>

              {options.length === 0 ? (
                <p className="text-[0.7rem] text-ink-faint">
                  這一方的牌組裡還沒有戰場 —— 匯入含戰場的牌表後就能選
                </p>
              ) : (
                <select
                  id={`battlefield-${index}`}
                  value={selectedId ?? ''}
                  onChange={(e) => {
                    const next: [string | null, string | null] = [...battlefields];
                    next[index] = e.target.value === '' ? null : e.target.value;
                    onChange(next);
                  }}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                >
                  <option value="">（尚未選定）</option>
                  {options.map((card) => (
                    <option key={card.id} value={card.id}>
                      {cardName(card, lang)}
                    </option>
                  ))}
                </select>
              )}

              {selected && (
                <div className="mt-2 flex gap-2">
                  <img
                    src={cardImageUrl(selected, 200, art)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-14 w-20 shrink-0 rounded object-cover"
                  />
                  <p className="min-w-0 flex-1 text-[0.7rem] leading-relaxed text-ink-dim">
                    {cardTextToPlain(cardText(selected, lang)) || '（這張戰場沒有能力文字）'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
