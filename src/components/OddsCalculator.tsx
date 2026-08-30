'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cardName } from '@/lib/cards';
import { buildCodeIndex, decodeDeck } from '@/lib/deck-url';
import { totalCards, type Deck } from '@/lib/deck-rules';
import {
  TURN_RULES,
  earliestTurn,
  formatPercent,
  oddsAfterMulligan,
  oddsByTurn,
  resourceCurve,
  runeOddsByTurn,
  runesNeeded,
  unpayableDomains,
} from '@/lib/draw-model';
import { distribution } from '@/lib/probability';
import { DOMAIN_LABELS } from '@/lib/labels';
import { DomainDot } from './CardBadges';
import { readTextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/** 表格要算到第幾回合。第 6 回合符文就召完了，多看兩回合足夠。 */
const TURNS = 8;

/** 機率長條。寬度用 CSS 類別，因為 CSP 不允許 inline style。 */
function Bar({ value, label }: { value: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full bg-accent prob-w-${percent}`} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-dim">
        {label ?? formatPercent(value)}
      </span>
    </div>
  );
}

/** 數字輸入。所有輸入都會夾在合理範圍內，不讓奇怪的值進到計算裡。 */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs text-ink-dim">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.max(min, Math.min(max, Math.round(next))));
        }}
        className="w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />
    </label>
  );
}

export function OddsCalculator({ cards }: { cards: Card[] }) {
  const searchParams = useSearchParams();
  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const lang = readTextLang(params);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const codeIndex = useMemo(() => buildCodeIndex(cards), [cards]);

  // 網址是使用者可編造的輸入，decodeDeck 會逐項比對真實卡片
  const decoded = useMemo(
    () => decodeDeck(params.get('d') ?? '', codeIndex),
    [params, codeIndex],
  );
  const deck: Deck = decoded.deck;
  const deckSize = totalCards(deck.main);
  const hasDeck = deckSize > 0;

  const [onThePlay, setOnThePlay] = useState(true);

  // ── 快速計算 ──────────────────────────────────────────────────
  const [population, setPopulation] = useState(40);
  const [copies, setCopies] = useState(3);
  const [draws, setDraws] = useState<number>(TURN_RULES.openingHand);
  const [wanted, setWanted] = useState(1);

  const quickInput = {
    population,
    successes: Math.min(copies, population),
    draws: Math.min(draws, population),
  };
  const quickResult = useMemo(() => {
    const dist = distribution(quickInput);
    const atLeastWanted = dist
      .slice(Math.min(wanted, dist.length))
      .reduce((sum, p) => sum + p, 0);
    return { dist, atLeastWanted: wanted <= 0 ? 1 : atLeastWanted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [population, copies, draws, wanted]);

  // ── 牌組分析 ──────────────────────────────────────────────────

  /** 主牌組裡每一種卡的逐回合抽到機率（依張數多寡排序）。 */
  const deckRows = useMemo(() => {
    if (!hasDeck) return [];
    return Object.entries(deck.main)
      .map(([id, qty]) => ({ card: byId.get(id), qty }))
      .filter((e): e is { card: Card; qty: number } => Boolean(e.card))
      .sort((a, b) => b.qty - a.qty || (a.card.number ?? 0) - (b.card.number ?? 0))
      .map(({ card, qty }) => ({
        card,
        qty,
        odds: oddsByTurn(deckSize, qty, 1, TURNS),
        needed: runesNeeded(card),
        playable: earliestTurn(card, onThePlay),
      }));
  }, [hasDeck, deck.main, byId, deckSize, onThePlay]);

  const curve = useMemo(
    () => (hasDeck ? resourceCurve(deck.main, byId, onThePlay, TURNS) : []),
    [hasDeck, deck.main, byId, onThePlay],
  );

  /** 各特性符文逐回合召出的機率。符文牌堆也要洗牌（114），所以這也是機率問題。 */
  const [runeWanted, setRuneWanted] = useState(1);
  const runeOdds = useMemo(
    () => (hasDeck ? runeOddsByTurn(deck.runes, byId, onThePlay, TURNS, runeWanted) : []),
    [hasDeck, deck.runes, byId, onThePlay, runeWanted],
  );

  const unpayable = useMemo(
    () => (hasDeck ? unpayableDomains(deck.main, deck.runes, byId) : []),
    [hasDeck, deck.main, deck.runes, byId],
  );

  /** 選定英雄的開局機率 —— 這是最常被問的一題。 */
  const championOdds = useMemo(() => {
    if (!hasDeck || !deck.championId) return null;
    const card = byId.get(deck.championId);
    const qty = deck.main[deck.championId] ?? 0;
    if (!card || qty === 0) return null;
    return {
      card,
      qty,
      opening: oddsAfterMulligan(deckSize, qty, 0),
      afterMulligan: oddsAfterMulligan(deckSize, qty, TURN_RULES.mulliganMax),
    };
  }, [hasDeck, deck.championId, deck.main, byId, deckSize]);

  const cell = 'px-2 py-1.5 text-right font-mono text-xs';
  const head = 'px-2 py-1.5 text-right text-xs font-medium text-ink-dim';

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">機率計算</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-dim">
          這裡的每個數字都是用超幾何分布<strong className="text-ink">精確</strong>
          算出來的，不是模擬、不是估計 —— 你可以自己拿計算機驗算。
        </p>
      </header>

      {/* ── 快速計算 ── */}
      <section className="mb-8 rounded-lg border border-line bg-surface-1 p-4">
        <h2 className="mb-3 text-base font-semibold text-ink">快速計算</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            id="odds-population"
            label="牌組張數"
            value={population}
            min={1}
            max={200}
            onChange={setPopulation}
          />
          <NumberField
            id="odds-copies"
            label="這張牌放幾張"
            value={copies}
            min={0}
            max={population}
            onChange={setCopies}
          />
          <NumberField
            id="odds-draws"
            label="抽幾張"
            value={draws}
            min={0}
            max={population}
            onChange={setDraws}
          />
          <NumberField
            id="odds-wanted"
            label="至少要幾張"
            value={wanted}
            min={0}
            max={Math.max(1, copies)}
            onChange={setWanted}
          />
        </div>

        <p className="mt-4 text-sm text-ink">
          抽 {Math.min(draws, population)} 張裡至少有 {wanted} 張的機率：
          <strong
            className="ml-2 text-xl font-semibold text-accent-soft"
            data-testid="quick-result"
          >
            {formatPercent(quickResult.atLeastWanted)}
          </strong>
        </p>

        {quickResult.dist.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium text-ink-dim">剛好抽到幾張的分布</h3>
            <ul className="space-y-1.5">
              {quickResult.dist.map((p, k) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs text-ink-dim">{k} 張</span>
                  <div className="min-w-0 flex-1">
                    <Bar value={p} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── 牌組分析 ── */}
      {!hasDeck ? (
        <section className="rounded-lg border border-dashed border-line p-6 text-center">
          <p className="text-sm text-ink-dim">
            想分析自己的牌組？到{' '}
            <Link href="/deck" className="text-accent-soft hover:underline">
              牌組編輯器
            </Link>{' '}
            組好牌後，按「計算機率」就會把牌組帶過來。
          </p>
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">
              主牌組 <strong>{deckSize}</strong> 張
              {decoded.dropped > 0 && (
                <span className="ml-2 text-xs text-amber-400">
                  （網址中有 {decoded.dropped} 段無法辨識，已略過）
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-dim">資源曲線依</span>
              <div className="flex rounded-lg border border-line p-0.5">
                {[
                  { on: true, label: '先手' },
                  { on: false, label: '後手' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={onThePlay === option.on}
                    onClick={() => setOnThePlay(option.on)}
                    className={`rounded px-3 py-1 text-xs transition-colors ${
                      onThePlay === option.on
                        ? 'bg-accent/15 text-accent-soft'
                        : 'text-ink-dim hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Link href={`/deck?d=${params.get('d') ?? ''}`} className="text-xs text-ink-dim hover:text-accent-soft">
                回牌組編輯器
              </Link>
            </div>
          </div>

          {/* 選定英雄 */}
          {championOdds && (
            <section className="mb-8 rounded-lg border border-line bg-surface-1 p-4">
              <h2 className="mb-3 text-base font-semibold text-ink">
                選定英雄：{cardName(championOdds.card, lang)}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-dim">開局 4 張就抽到（規則 116）</dt>
                  <dd className="text-lg font-semibold text-ink">
                    {formatPercent(championOdds.opening)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-dim">
                    手牌調度換 2 張後抽到（規則 117）
                  </dt>
                  <dd className="text-lg font-semibold text-accent-soft">
                    {formatPercent(championOdds.afterMulligan)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                調度的算法依官方順序（117.1→117.3）：先擱置最多兩張、抽等量的牌、
                <strong className="text-ink-dim">最後才把擱置的牌洗回去</strong>
                。所以補抽的牌是從不含那兩張的牌堆裡抽的。
                這裡假設你會把兩張非目標牌換掉 —— 真實取捨當然更複雜。
              </p>
            </section>
          )}

          {/* 逐回合抽到機率 */}
          <section className="mb-8">
            <h2 className="mb-1 text-base font-semibold text-ink">逐回合抽到的機率</h2>
            <p className="mb-3 text-xs text-ink-faint">
              「至少抽到 1 張」的機率。開局 4 張（116），之後每回合抽 1 張（315.4.b）。
              不含任何卡牌能力提供的額外抽牌。
            </p>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="bg-surface-2/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-ink-dim">
                      卡名
                    </th>
                    <th className={head}>張數</th>
                    <th className={head}>開局</th>
                    {Array.from({ length: 5 }, (_, i) => (
                      <th key={i} className={head}>
                        T{i + 1}
                      </th>
                    ))}
                    <th className={head} title="只看資源，不看有沒有抽到">
                      可施放
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deckRows.map(({ card, qty, odds, playable, needed }) => (
                    <tr key={card.id} className="border-t border-line">
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/cards/${card.id}`}
                          className="text-ink hover:text-accent-soft"
                        >
                          {cardName(card, lang)}
                        </Link>
                      </td>
                      <td className={cell}>{qty}</td>
                      {odds.slice(0, 6).map((row) => (
                        <td key={row.turn} className={cell}>
                          {formatPercent(row.probability)}
                        </td>
                      ))}
                      <td className={cell}>
                        {playable === null
                          ? needed === null
                            ? '—'
                            : '付不起'
                          : `T${playable}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 資源曲線 */}
          <section className="mb-8">
            <h2 className="mb-1 text-base font-semibold text-ink">資源曲線</h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-faint">
              每回合召出 2 張符文（315.3.b），後手第一個召出階段多 1 張（485.7），
              上限是符文牌組的 12 張（103.3.a）。
              打出一張卡需要「法力費用 + 符能費用」張符文（131.2、131.3、164.2）。
            </p>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="bg-surface-2/50">
                  <tr>
                    <th className={head}>回合</th>
                    <th className={head}>符文</th>
                    <th className={head}>看過的牌</th>
                    <th className={head}>付得起的牌</th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-ink-dim">
                      佔主牌組
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {curve.map((row) => (
                    <tr key={row.turn} className="border-t border-line">
                      <td className={cell}>T{row.turn}</td>
                      <td className={cell}>{row.runes}</td>
                      <td className={cell}>{Math.min(deckSize, row.cardsSeen)}</td>
                      <td className={cell}>
                        {row.affordable} / {deckSize}
                      </td>
                      <td className="px-2 py-1.5">
                        <Bar
                          value={row.affordableRatio}
                          label={formatPercent(row.affordableRatio)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {runeOdds.length > 0 && (
              <div className="mt-5">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">各特性符文召出的機率</h3>
                  <label htmlFor="rune-wanted" className="flex items-center gap-1.5 text-xs text-ink-dim">
                    至少
                    <select
                      id="rune-wanted"
                      value={runeWanted}
                      onChange={(e) => setRuneWanted(Number(e.target.value))}
                      className="rounded border border-line bg-surface-1 px-1.5 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    張
                  </label>
                </div>
                <p className="mb-2 text-xs leading-relaxed text-ink-faint">
                  符文牌堆一樣要洗牌（規則 114），召出是從牌堆頂部抽取（430.1），
                  牌堆順序是隱密資訊（108.5.d）—— 所以「這回合有沒有你要的顏色」是機率問題。
                  一張符文只換得到 1 點符能（164.2.b），符能費用要 2 點以上時就要選「至少 2 張」。
                </p>

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead className="bg-surface-2/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-xs font-medium text-ink-dim">
                          特性
                        </th>
                        <th className={head}>牌組裡</th>
                        {Array.from({ length: 6 }, (_, i) => (
                          <th key={i} className={head}>
                            T{i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runeOdds.map((row) => (
                        <tr key={row.domain} className="border-t border-line">
                          <td className="px-2 py-1.5">
                            <span className="flex items-center gap-1.5 text-ink">
                              <DomainDot domain={row.domain} />
                              {DOMAIN_LABELS[row.domain][lang]}
                            </span>
                          </td>
                          <td className={cell}>{row.inDeck}</td>
                          {row.byTurn.slice(0, 6).map((p, i) => (
                            <td key={i} className={cell}>
                              {formatPercent(p)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unpayable.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-300">
                  有 {unpayable.length} 種卡的符能費用，你的符文牌組付不起
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
                  符能有特性之分（163.2.a），特性與召出它的符文相同（163.2.a.1）。
                  這幾張卡需要的特性，你的符文牌組裡沒有：
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {unpayable.map((id) => {
                    const card = byId.get(id);
                    if (!card) return null;
                    return (
                      <li key={id}>
                        <Link
                          href={`/cards/${id}`}
                          className="rounded border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200 hover:border-amber-400"
                        >
                          {cardName(card, lang)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── 這個工具算得準到什麼程度 ── */}
      <section className="rounded-lg border border-line bg-surface-1 p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">這些數字準到什麼程度</h2>
        <div className="space-y-2 text-xs leading-relaxed text-ink-dim">
          <p>
            <strong className="text-ink">抽牌機率是精確的。</strong>
            用超幾何分布算出來，整個計算過程都用精確整數運算（因為組合數會大到
            一般數字算不準），只在最後一步才轉成小數。你可以自己驗算。
          </p>
          <p>
            <strong className="text-ink">資源曲線是下限，不是實際可用量。</strong>
            回收符文取得符能後，那張符文會永久離場（164.2.b）。
            這張表算的是「這回合場上至少要有幾張符文才付得起」，
            沒有扣掉前幾回合已經回收掉的。實際會比這個緊。
          </p>
          <p>
            <strong className="text-ink">不含任何卡牌能力。</strong>
            額外抽牌、資源加速、搜尋牌庫都沒有算進去 ——
            那需要一個看得懂 376 張卡各自能力的規則引擎。
          </p>
          <p>
            <strong className="text-ink">這不是勝率。</strong>
            勝率要嘛需要規則引擎自動對打幾千局，要嘛需要你自己記錄真實對局。
            用機率公式推不出勝率，任何宣稱能算的數字都是編的。
          </p>
        </div>
      </section>
    </div>
  );
}
