'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import { BoardZonePanel } from './BoardZonePanel';
import { CardBackPile } from './BoardCard';
import { StackedPile } from './StackedPile';
import { RuneRow } from './RuneRow';
import { drawCards, summonRunes } from '@/lib/board-actions';
import type { Selection } from './CardInspector';
import {
  activeRunesOnBase,
  handSize,
  isInPlayZone,
  mightAt,
  moveCard,
  remainingDeck,
  buffOn,
  setBuff,
  setDormant,
  setInPile,
  setScore,
  splitBaseByRunes,
  VICTORY_SCORE,
  wakeAll,
  type BoardState,
  type BoardZone,
  type PlayerBoard,
} from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面 —— 一張固定的牌桌。
 *
 * ── 為什麼要「固定」 ────────────────────────────────────────────
 * 先前的版本是把各個區域一塊塊往下疊。資訊都在，但要一直捲滾輪才看得完，
 * 使用者的原話是「太麻煩」。實體對局時整張桌子是**同時**在眼前的，
 * 復盤要的就是這個：一眼看完雙方場面，不必來回捲。
 *
 * 所以改成填滿視窗高度的三段式格線：
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ 對手：手牌 / 場上         英雄 牌堆 廢 逐 摘要   │  ← 上（順序鏡像）
 *   ├────────────────────────────────────────────────┤
 *   │  戰場一（對手的／你的） │ 戰場二（同左）         │  ← 中，雙方共用
 *   ├────────────────────────────────────────────────┤
 *   │ 你：場上 / 手牌           英雄 牌堆 廢 逐 摘要   │  ← 下
 *   └────────────────────────────────────────────────┘
 *
 * 每一段內部塞不下時自己捲，但**頁面本身不捲** —— 桌子永遠在原地。
 * 編輯用的控制項全部移到右側欄，不佔桌面。
 *
 * 對手的手牌貼著畫面上緣、場上靠近中間的戰場；你這邊相反。
 * 這樣雙方的「場上」都緊鄰戰場，跟實體對局坐下來的樣子一致。
 * 側欄（英雄／牌堆／廢牌堆／放逐）兩方順序相同，上下對齊方便對照。
 */

/**
 * 一方在某個戰場的戰力合計。
 *
 * 卡面與增益分開顯示（「12 + 5」），因為復盤時常要判斷
 * 「這些增益消失之後還打不打得贏」—— 只給總和就看不出來了。
 */
function MightTotal({
  label,
  might,
  tone,
}: {
  label: string;
  might: { base: number; buff: number; total: number };
  tone: string;
}) {
  return (
    <span
      className="rounded bg-surface-2 px-1 font-mono"
      data-might-total={label}
      title={`${label}：卡面 ${might.base} ＋ 增益 ${might.buff} ＝ ${might.total}（單純加總，不是戰鬥結果）`}
    >
      <span className="text-ink-faint">{label} </span>
      <span className={tone}>{might.base}</span>
      {might.buff > 0 && <span className="text-emerald-300">+{might.buff}</span>}
    </span>
  );
}

function ZoneCell({
  zone,
  player,
  isOpponent,
  byId,
  lang,
  art,
  onChange,
  label,
  selection,
  onSelect,
  className,
}: {
  zone: BoardZone;
  player: PlayerBoard;
  isOpponent: boolean;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: PlayerBoard) => void;
  label?: string;
  selection: Selection | null;
  onSelect: (sel: Selection) => void;
  className?: string;
}) {
  const side = isOpponent ? 'opponent' : 'you';
  const selectedHere =
    selection && selection.side === side && selection.zone === zone ? selection.cardId : undefined;

  return (
    <BoardZonePanel
      zone={zone}
      owner={side}
      label={label}
      pile={player[zone]}
      byId={byId}
      lang={lang}
      art={art}
      className={className}
      dormant={isInPlayZone(zone) ? player.dormant[zone] : undefined}
      buffs={isInPlayZone(zone) ? player.buffs[zone] : undefined}
      onBuffDrop={
        isInPlayZone(zone)
          ? (cardId, amount) =>
              onChange(setBuff(player, zone, cardId, buffOn(player, zone, cardId) + amount))
          : undefined
      }
      selectedCardId={selectedHere}
      onSelect={(cardId) => onSelect({ side, zone, cardId })}
      onMove={(cardId, to) => {
        onChange(moveCard(player, zone, to, cardId));
        // 選取跟著卡片走，不然搬完之後右側的檢視面板會指到空的
        onSelect({ side, zone: to, cardId });
      }}
      onRemove={(cardId) => {
        onChange({
          ...player,
          [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) - 1),
        });
      }}
      extra={
        zone === 'hand' && isOpponent ? (
          <label className="ml-auto flex items-center gap-1 text-[0.65rem] text-ink-dim">
            未知
            <input
              type="number"
              min={0}
              max={99}
              value={player.unknownHand}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                onChange({
                  ...player,
                  unknownHand: Math.max(0, Math.min(99, Math.round(next))),
                });
              }}
              className="w-10 rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
              aria-label="對手手牌中你不知道內容的張數"
            />
          </label>
        ) : undefined
      }
    />
  );
}

/** 一方的一整條 —— 場上與手牌在左，英雄與各種牌堆在右。 */
function PlayerBand({
  player,
  label,
  isOpponent,
  byId,
  lang,
  art,
  onChange,
  selection,
  onSelect,
}: {
  player: PlayerBoard;
  label: string;
  isOpponent: boolean;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: PlayerBoard) => void;
  selection: Selection | null;
  onSelect: (sel: Selection) => void;
}) {
  const remaining = remainingDeck(player);
  const runes = activeRunesOnBase(player, byId);
  const legend = player.deck.legendId ? byId.get(player.deck.legendId) : undefined;

  const cell = (zone: BoardZone, cellLabel: string, className: string) => (
    <ZoneCell
      zone={zone}
      label={cellLabel}
      className={className}
      player={player}
      isOpponent={isOpponent}
      byId={byId}
      lang={lang}
      art={art}
      onChange={onChange}
      selection={selection}
      onSelect={onSelect}
    />
  );

  const grow = '';

  /*
   * 符文與其他常駐物資料上同住基地（107.1.c），但操作方式完全不同 ——
   * 符文是資源，每一張各自有活躍／休眠，要能一張一張指定。
   * 所以顯示時拆成兩塊，資料仍然是同一疊。
   */
  const { runes: runePile, others: basePile } = splitBaseByRunes(player, byId);

  const runeBlock = (
    <RuneRow
      key="runes"
      runes={runePile}
      dormant={player.dormant.base}
      byId={byId}
      lang={lang}
      art={art}
      onDormantChange={(cardId, count) => onChange(setDormant(player, 'base', cardId, count))}
      onRemove={(cardId) =>
        onChange({
          ...player,
          base: setInPile(player.base, cardId, (player.base[cardId] ?? 0) - 1),
        })
      }
    />
  );

  const baseBlock = (
    <div key="base" className="min-w-0">
      <BoardZonePanel
        zone="base"
        owner={isOpponent ? 'opponent' : 'you'}
        label="基地"
        pile={basePile}
        byId={byId}
        lang={lang}
        art={art}
        className={grow}
        dormant={player.dormant.base}
        buffs={player.buffs.base}
        onBuffDrop={(cardId, amount) =>
          onChange(setBuff(player, 'base', cardId, buffOn(player, 'base', cardId) + amount))
        }
        selectedCardId={
          selection && selection.side === (isOpponent ? 'opponent' : 'you') &&
          selection.zone === 'base'
            ? selection.cardId
            : undefined
        }
        onSelect={(cardId) =>
          onSelect({ side: isOpponent ? 'opponent' : 'you', zone: 'base', cardId })
        }
        onMove={(cardId, to) => {
          onChange(moveCard(player, 'base', to, cardId));
          onSelect({ side: isOpponent ? 'opponent' : 'you', zone: to, cardId });
        }}
        onRemove={(cardId) =>
          onChange({
            ...player,
            base: setInPile(player.base, cardId, (player.base[cardId] ?? 0) - 1),
          })
        }
      />
    </div>
  );

  const handBlock = <div key="hand">{cell('hand', '手牌', grow)}</div>;
  const runeWrap = (
    <div key="runewrap" className="min-w-0">
      {runeBlock}
    </div>
  );

  /*
   * 符文與「場上（非符文）」**並排**，手牌自己一列。
   *
   * 一開始是三塊直向堆疊，但一條帶狀區大約只有 250px 高，
   * 分成三塊每塊剩不到 90px —— 一張卡就 68px 加上標題列，塞不下就互相重疊，
   * 連點擊都會被隔壁的標題攔截。並排之後每一列有一半的高度，寬鬆很多。
   */
  const fieldRow = (
    <div key="field" className="grid gap-2 sm:grid-cols-2">
      {runeWrap}
      {baseBlock}
    </div>
  );

  // 對手在上方，順序要鏡像 —— 場上靠近中間的戰場
  const stack = isOpponent ? [handBlock, fieldRow] : [fieldRow, handBlock];

  return (
    <div
      className="flex w-full gap-2"
      data-side={isOpponent ? 'opponent' : 'you'}
      data-testid={isOpponent ? 'strip-opponent' : 'strip-you'}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">{stack}</div>

      {/* 側欄：傳奇、英雄區域、牌堆、廢牌堆、放逐、摘要 */}
      <div className="flex shrink-0 gap-2 overflow-x-auto">
        {/*
         * 傳奇區域（103.2.a）。傳奇整場都在場上，不會進出牌堆，
         * 所以直接從牌組設定畫出來，不需要另一個可搬動的區域 ——
         * 位置就擺在選定英雄旁邊，跟實體對局一樣。
         */}
        <div
          className="flex w-[76px] shrink-0 flex-col rounded-lg border border-line bg-surface-1 p-1.5"
          data-zone="legend"
          data-owner={isOpponent ? 'opponent' : 'you'}
          data-legend-dormant={player.legendDormant ? 'true' : 'false'}
        >
          <h4
            className="mb-1 shrink-0 whitespace-nowrap text-xs font-semibold text-ink"
            title="傳奇區域（官方規則 103.2.a）"
          >
            傳奇 <span className="font-mono text-[0.6rem] font-normal text-ink-faint">103.2.a</span>
          </h4>
          {legend ? (
            <>
            <button
              type="button"
              onClick={() =>
                onSelect({
                  side: isOpponent ? 'opponent' : 'you',
                  zone: 'legend',
                  cardId: legend.id,
                })
              }
              aria-pressed={
                selection?.zone === 'legend' &&
                selection.side === (isOpponent ? 'opponent' : 'you')
              }
              title={cardName(legend, lang)}
              aria-label={`傳奇區域的 ${cardName(legend, lang)}`}
              data-card={legend.id}
              className={`rounded transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-none ${
                selection?.zone === 'legend' &&
                selection.side === (isOpponent ? 'opponent' : 'you')
                  ? 'ring-2 ring-accent'
                  : ''
              }`}
            >
              <img
                src={cardImageUrl(legend, 160, art)}
                alt={cardName(legend, lang)}
                loading="lazy"
                referrerPolicy="no-referrer"
                className={`h-[68px] w-[48px] rounded object-cover transition-transform ${
                  player.legendDormant ? 'rotate-90 opacity-80' : ''
                }`}
              />
            </button>
            {/*
             * 傳奇也有活躍／休眠（107.4.c 它是遊戲物體）。
             * 很多傳奇的技能以休眠為費用，一回合只能用一次 —— 用過就打橫。
             * 跟場上的卡一樣用轉 90 度表示，喚醒階段一起變回來（415.3.a）。
             */}
            <button
              type="button"
              onClick={() => onChange({ ...player, legendDormant: !player.legendDormant })}
              aria-pressed={player.legendDormant}
              aria-label={`${isOpponent ? '對手' : '你'}的傳奇：${
                player.legendDormant ? '休眠中，點一下喚醒' : '活躍中，點一下設為休眠'
              }`}
              title="傳奇的技能用過之後設為休眠（打橫）；下一個喚醒階段會自動變回活躍（415.3.a）"
              data-testid="legend-dormant-toggle"
              className={`mt-1.5 rounded border px-1 py-0.5 text-[0.6rem] ${
                player.legendDormant
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                  : 'border-line text-ink-dim hover:border-accent hover:text-accent-soft'
              }`}
            >
              {player.legendDormant ? '休眠中' : '活躍'}
            </button>
            </>
          ) : (
            <p className="rounded border border-dashed border-line px-1 py-3 text-center text-[0.65rem] text-ink-faint">
              未指定
            </p>
          )}
        </div>

        {cell('champion', '英雄', 'w-[110px] shrink-0 overflow-auto')}

        {/*
         * 牌堆可以直接點：抽一張（315.4.b）、召一張符文（315.3.b）。
         *
         * 遊戲中「抽一張」「多召一張符文」是卡牌效果隨時會做的事，
         * 每次都跑去右側欄按按鈕太慢 —— 牌堆就在桌上，點它最直覺。
         */}
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-1 px-2">
          <CardBackPile
            count={remaining.mainSize}
            label="牌堆"
            rule="108.4"
            actionHint="點一下抽一張（315.4.b）"
            onClick={() => onChange(drawCards(player, 1))}
          />
          <CardBackPile
            count={remaining.runeSize}
            label="符文堆"
            rule="108.5"
            actionHint="點一下召出一張符文到基地（315.3.b、430.2.a）"
            onClick={() => onChange(summonRunes(player, 1))}
          />
        </div>

        {/* 廢牌堆與放逐區：桌上各一疊，點開照進入順序檢視（見 StackedPile） */}
        {(['discard', 'exile'] as const).map((zone) => (
          <StackedPile
            key={zone}
            zone={zone}
            player={player}
            side={isOpponent ? 'opponent' : 'you'}
            byId={byId}
            lang={lang}
            art={art}
            onChange={onChange}
            onInspect={(cardId) =>
              onSelect({ side: isOpponent ? 'opponent' : 'you', zone, cardId })
            }
            selected={
              selection?.zone === zone && selection.side === (isOpponent ? 'opponent' : 'you')
            }
          />
        ))}

        <div className="flex w-[120px] shrink-0 flex-col justify-center gap-1 rounded-lg border border-line bg-surface/40 px-2 py-1">
          <span className="text-xs font-semibold text-ink">{label}</span>
          <span className="text-[0.65rem] leading-tight text-ink-dim" data-testid="side-summary">
            手牌 {handSize(player)}　牌堆 {remaining.mainSize}　活躍符文 {runes}
          </span>
          {/*
           * 分數由使用者手動加減：據守、征服、卡牌效果都會得分，
           * 判斷「這時候該不該得分」需要規則引擎，本站不做。
           * 同樣不判定勝負 —— 只顯示勝利分數當作參考。
           */}
          <div
            className="flex items-center gap-1"
            data-testid="score"
            data-score={player.score}
            title={`分數（勝利分數預設 ${VICTORY_SCORE} 分；分數不會低於 0）`}
          >
            <button
              type="button"
              onClick={() => onChange(setScore(player, player.score - 1))}
              disabled={player.score <= 0}
              aria-label={`${isOpponent ? '對手' : '你'}的分數減 1`}
              className="h-5 w-5 rounded border border-line text-xs leading-none text-ink-dim hover:border-accent hover:text-accent-soft disabled:opacity-30"
            >
              −
            </button>
            <span className="min-w-[3.2rem] text-center text-xs text-ink">
              <strong className="text-base">{player.score}</strong>
              <span className="text-[0.6rem] text-ink-faint"> / {VICTORY_SCORE} 分</span>
            </span>
            <button
              type="button"
              onClick={() => onChange(setScore(player, player.score + 1))}
              aria-label={`${isOpponent ? '對手' : '你'}的分數加 1`}
              className="h-5 w-5 rounded border border-line text-xs leading-none text-ink-dim hover:border-accent hover:text-accent-soft"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange(wakeAll(player))}
            title="喚醒階段：把控制的所有非法術遊戲物體設為活躍（415.3.a）"
            className="rounded border border-line px-1 py-0.5 text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
          >
            全部喚醒
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardTable({
  board,
  byId,
  lang,
  art,
  onChange,
  selection,
  onSelect,
}: {
  board: BoardState;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: BoardState) => void;
  selection: Selection | null;
  onSelect: (sel: Selection) => void;
}) {
  const setSide = (side: 'you' | 'opponent') => (next: PlayerBoard) =>
    onChange({ ...board, [side]: next });

  const ring = (side: 'you' | 'opponent') =>
    board.activePlayer === side ? 'border-accent/50' : 'border-line';

  return (
    <div className="grid min-h-0 grid-rows-[1fr_1.1fr_1fr] gap-2" data-testid="board-table">
      {/* ── 對手（上） ── */}
      <div className={`min-h-0 overflow-auto rounded-lg border p-2 ${ring('opponent')}`}>
        <PlayerBand
          player={board.opponent}
          label={`對手${board.activePlayer === 'opponent' ? '（回合方）' : ''}`}
          isOpponent
          byId={byId}
          lang={lang}
          art={art}
          onChange={setSide('opponent')}
          selection={selection}
          onSelect={onSelect}
        />
      </div>

      {/* ── 戰場（中間，雙方共用） ── */}
      <div className="grid min-h-0 gap-2 md:grid-cols-2" data-testid="battlefield-row">
        {([0, 1] as const).map((index) => {
          const zone = index === 0 ? ('bf0' as const) : ('bf1' as const);
          const cardId = board.battlefields[index];
          const card = cardId ? byId.get(cardId) : undefined;

          return (
            <section
              key={zone}
              data-battlefield={index}
              className="battlefield-plate flex min-h-0 flex-col rounded-lg border border-accent/40 p-2"
            >
              <div className="mb-1 flex shrink-0 items-center gap-2">
                {/* 戰場卡本身也擺在桌上 —— 它有自己的能力，復盤時要看得到 */}
                {card ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({ side: 'you', zone: 'battlefield', cardId: card.id })
                    }
                    title={cardName(card, lang)}
                    aria-label={`${index === 0 ? '戰場一' : '戰場二'}：${cardName(card, lang)}`}
                    data-card={card.id}
                    className={`shrink-0 rounded transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-none ${
                      selection?.zone === 'battlefield' && selection.cardId === card.id
                        ? 'ring-2 ring-accent'
                        : ''
                    }`}
                  >
                    <img
                      src={cardImageUrl(card, 160, art)}
                      alt={cardName(card, lang)}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-[40px] w-[57px] rounded object-cover"
                    />
                  </button>
                ) : (
                  <span className="flex h-[40px] w-[57px] shrink-0 items-center justify-center rounded border border-dashed border-line text-[0.6rem] text-ink-faint">
                    未選
                  </span>
                )}

                <h3 className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-ink">
                  {index === 0 ? '戰場一' : '戰場二'}
                  <span className="font-normal text-ink-dim">
                    {card ? cardName(card, lang) : '尚未選擇'}
                  </span>
                  <span
                    className="rounded bg-surface-2 px-1 font-mono text-[0.6rem] font-normal text-ink-faint"
                    title="位置包含基地與各個戰場"
                  >
                    198.1
                  </span>
                </h3>

                {/*
                 * 雙方在這個戰場的戰力合計。
                 *
                 * 這是**單純的加總**，不是戰鬥結果 —— 誰能參戰、有沒有被
                 * 效果排除、休眠算不算，那些需要規則引擎，本站不做。
                 * 卡面與增益分開寫，才看得出「增益消失之後還剩多少」。
                 */}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.65rem]">
                  <MightTotal
                    label="對手"
                    might={mightAt(board.opponent, zone, byId)}
                    tone="text-rose-300"
                  />
                  <span className="text-ink-faint">vs</span>
                  <MightTotal
                    label="你"
                    might={mightAt(board.you, zone, byId)}
                    tone="text-accent-soft"
                  />
                </span>
              </div>

              <div className="grid min-h-0 flex-1 grid-rows-2 gap-1.5 [&>*:first-child]:border-b [&>*:first-child]:border-dashed [&>*:first-child]:border-accent/30 [&>*:first-child]:pb-1.5">
                <ZoneCell
                  zone={zone}
                  label="對手的"
                  className="min-h-0 overflow-auto"
                  player={board.opponent}
                  isOpponent
                  byId={byId}
                  lang={lang}
                  art={art}
                  onChange={setSide('opponent')}
                  selection={selection}
                  onSelect={onSelect}
                />
                <ZoneCell
                  zone={zone}
                  label="你的"
                  className="min-h-0 overflow-auto"
                  player={board.you}
                  isOpponent={false}
                  byId={byId}
                  lang={lang}
                  art={art}
                  onChange={setSide('you')}
                  selection={selection}
                  onSelect={onSelect}
                />
              </div>
            </section>
          );
        })}
      </div>

      {/* ── 你（下） ── */}
      <div className={`min-h-0 overflow-auto rounded-lg border p-2 ${ring('you')}`}>
        <PlayerBand
          player={board.you}
          label={`你${board.activePlayer === 'you' ? '（回合方）' : ''}`}
          isOpponent={false}
          byId={byId}
          lang={lang}
          art={art}
          onChange={setSide('you')}
          selection={selection}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
