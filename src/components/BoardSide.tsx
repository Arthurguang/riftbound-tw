'use client';

import { useMemo, useState } from 'react';
import { BAN_LIST_VERSION, bannedAmong } from '@/lib/ban-list';
import { cardName } from '@/lib/cards';
import { DeckImport } from './DeckImport';
import { RuneTracker } from './RuneTracker';
import { SideboardSwap } from './SideboardSwap';
import { ChampionZone } from './ChampionZone';
import {
  foreignCards,
  hasDeck,
  remainingDeck,
  entersDormant,
  isInPlayZone,
  setDormant,
  setInPile,
  type BoardZone,
  type PlayerBoard,
} from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面上的一方。
 *
 * 「你」與「對手」用同一個元件，差別只在對手預設用「未知手牌張數」——
 * 依規則 108.7.c 手牌是私密資訊、108.7.e 張數是公開資訊。
 */
/**
 * 「加到」可以直接選任何區域。
 *
 * 第一版刻意只讓人加到基地或手牌，再用搬移按鈕移到戰場 —— 使用者反映
 * 這樣復盤太慢。直接選目的地才對，少一步就是少一步。
 */
const ADD_TARGETS = ['hand', 'base', 'bf0', 'bf1', 'discard', 'exile'] as const;
const ADD_LABELS: Record<(typeof ADD_TARGETS)[number], string> = {
  hand: '手牌',
  base: '基地',
  bf0: '戰一',
  bf1: '戰二',
  discard: '廢牌堆',
  exile: '放逐',
};

export function BoardSide({
  title,
  player,
  cards,
  byId,
  lang,
  art,
  isOpponent,
  turn,
  onThePlay,
  onRestart,
  onChange,
}: {
  /** 顯示的名稱，同時也是各輸入框 id 的前綴。 */
  title: string;
  player: PlayerBoard;
  cards: Card[];
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  isOpponent: boolean;
  /** 目前回合，用來提示照規則應該召出幾張符文。 */
  /**
   * 這一方**自己**打過幾個回合。
   *
   * 不是全域回合數 —— 回合雙方交替，抽牌與召符文都是「每人在自己的回合
   * 各做一次」，所以符文追蹤要用這一方自己的回合數才算得對。
   */
  turn: number;
  onThePlay: boolean;
  /** 局間換牌之後用新牌組重新開局（雙方一起）。 */
  onRestart: () => void;
  /** 現在是不是這一方的回合（310.1.a）。 */
  onChange: (next: PlayerBoard) => void;
}) {
  const [adding, setAdding] = useState<BoardZone>('hand');
  const [query, setQuery] = useState('');

  /**
   * 這一方的控制項再拆成幾塊，一次只顯示一塊。
   *
   * 使用者要求「加卡、機率、可打性各自獨立成一個區塊，按按鈕才跳出細節」——
   * 攤開的話光是一方就有六七個區塊，側欄又會變回要一直捲。
   *
   * 全部保持掛載、只切換顯示：切走再切回來時，搜尋字串與「加到哪一區」
   * 這些選擇不會被重置。
   */
  const [section, setSection] = useState<'deck' | 'sideboard' | 'add' | 'runes'>('deck');

  /**
   * 剛匯入完牌組時提示可以局間換牌。
   *
   * 賽制上換牌就發生在匯入牌表之後、下一局開始之前（601.1.c），
   * 所以那個時機主動問一次，使用者不必自己去找按鈕在哪。
   */
  const [justImported, setJustImported] = useState(false);

  const remaining = useMemo(() => remainingDeck(player), [player]);
  const foreign = useMemo(() => foreignCards(player, byId), [player, byId]);

  /**
   * 這一方牌組裡的禁卡。
   *
   * 復盤是**練習工具**，不是賽事檢查 —— 所以只提醒，不擋任何操作。
   * 但正因為復盤常拿來練賽前的牌組，這裡不講的話使用者可能練了整晚
   * 才在賽場上知道有一張不能帶。
   *
   * 備牌也要算進去：局間換牌會把它換上場（601.1.c）。
   */
  const bannedInDeck = useMemo(() => {
    const ids = [
      ...Object.keys(player.deck.main),
      ...Object.keys(player.deck.runes),
      ...Object.keys(player.deck.battlefields),
      ...Object.keys(player.deck.sideboard),
      ...(player.deck.legendId ? [player.deck.legendId] : []),
    ];
    const inDeck = ids.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));
    return bannedAmong(inDeck, 'constructed');
  }, [player.deck, byId]);

  /** 這個卡池裡的所有衍生物。 */
  const tokens = useMemo(() => cards.filter((c) => c.subtype === 'token'), [cards]);

  /**
   * 可以加進盤面的候選卡：以這副牌組為主，找不到時退回全部卡片。
   *
   * **衍生物一律列入**，即使牌組裡沒有 —— 它本來就不會被放進牌組，
   * 而是靠卡牌效果生成的（例如 OGN-117 維克特會打出「隨從」）。
   * 復盤時場上出現衍生物很正常，找不到就擺不出那個局面。
   */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = hasDeck(player)
      ? [
          ...[
            ...Object.keys(player.deck.main),
            ...Object.keys(player.deck.runes),
            ...Object.keys(player.deck.battlefields),
            // 備牌不列入：對局中它不在場上（403.4、403.5）
            ...(player.deck.legendId ? [player.deck.legendId] : []),
          ]
            .map((id) => byId.get(id))
            .filter((c): c is Card => Boolean(c)),
          ...tokens,
        ]
      : cards;

    const filtered =
      q === ''
        ? pool
        : pool.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.zh.tw?.name ?? '').toLowerCase().includes(q) ||
              (c.zh.cn?.name ?? '').toLowerCase().includes(q) ||
              c.code.toLowerCase().includes(q),
          );

    return filtered.sort((a, b) => a.number - b.number).slice(0, 40);
  }, [player, byId, cards, tokens, query]);

  const addCard = (zone: BoardZone, cardId: string) => {
    const card = byId.get(cardId);
    const next: PlayerBoard = {
      ...player,
      [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) + 1),
    };

    /*
     * 進場的預設狀態依卡種而定：
     *   143.4、359.2.c　單位以休眠狀態進場
     *   359.2.d　　　　 非單位裝備以活躍狀態進場
     *   430.2.a　　　　 符文預設以活躍狀態召出
     *
     * 這只是預設 —— [急速] 之類的效果會改變它（143.4.a），使用者可以自己切。
     */
    if (card && isInPlayZone(zone) && entersDormant(card)) {
      const already = next.dormant[zone][cardId] ?? 0;
      onChange(setDormant(next, zone, cardId, already + 1));
      return;
    }
    onChange(next);
  };


  return (
    <div
      className="min-w-0 rounded-lg border border-line p-3"
      data-edit-side={isOpponent ? 'opponent' : 'you'}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">編輯：{title}</h3>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {(
          [
            { id: 'deck', label: '牌組' },
            { id: 'sideboard', label: '備牌' },
            { id: 'add', label: '加卡' },
            { id: 'runes', label: '符文' },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
            data-side-tab={s.id}
            className={`rounded border px-2 py-1 text-[0.7rem] transition-colors ${
              section === s.id
                ? 'border-accent bg-accent/10 text-accent-soft'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div hidden={section !== 'deck'} data-side-section="deck">
      <DeckImport
        cards={cards}
        byId={byId}
        onImport={(deck) => {
          onChange({
            ...player,
            deck,
            /*
             * 匯入後直接把選定英雄放進英雄區域。
             * 103.2.a.1：遊戲開始時這張卡置於英雄區域 —— 它不在牌堆裡，
             * 不自動擺出來的話牌堆張數會多算一張。
             */
            champion: deck.championId ? setInPile({}, deck.championId, 1) : {},
          });
          setJustImported(true);
        }}
      />

      {bannedInDeck.length > 0 && (
        <div
          className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs"
          data-testid="board-ban-notice"
        >
          <p className="font-medium text-rose-200">
            這副牌組有 {bannedInDeck.length} 張卡在正式賽事被禁用
          </p>
          <ul className="mt-1 space-y-0.5 text-rose-200/75">
            {bannedInDeck.map(({ card, entry }) => (
              <li key={card.id}>
                · {cardName(card, lang)}
                {entry.official !== card.name && `（官方列為「${entry.official}」）`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[0.7rem] text-rose-200/55">
            復盤不受限制，照樣可以擺 · 依據 {BAN_LIST_VERSION.updated} 版禁卡表
          </p>
        </div>
      )}

      {justImported && (
        <div
          className="mt-2 rounded-lg border border-accent/40 bg-accent/5 p-2 text-xs text-ink-dim"
          data-testid="sideboard-prompt"
        >
          牌組匯入好了。
          <strong className="text-ink">要局間換牌嗎？</strong>
          <span className="text-ink-faint">（601.1.c —— 換完會用新的牌組重新開局）</span>
          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setSection('sideboard');
                setJustImported(false);
              }}
              className="rounded border border-accent px-2 py-1 text-[0.7rem] text-accent-soft hover:bg-accent/10"
            >
              去換牌
            </button>
            <button
              type="button"
              onClick={() => setJustImported(false)}
              className="rounded border border-line px-2 py-1 text-[0.7rem] text-ink-dim hover:text-ink"
            >
              不換，直接開始
            </button>
          </div>
        </div>
      )}
      </div>

      {!hasDeck(player) ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-faint">
          先匯入這一方的牌組，才能算出牌堆裡還剩什麼
        </p>
      ) : (
        <>
          <div hidden={section !== 'deck'} data-side-section="deck-more">
          <ChampionZone
            player={player}
            byId={byId}
            lang={lang}
            art={art}
            onChange={onChange}
          />

          </div>

          <div hidden={section !== 'sideboard'} data-side-section="sideboard">
          <SideboardSwap
            deck={player.deck}
            byId={byId}
            lang={lang}
            onChange={(deck) => onChange({ ...player, deck })}
          />

          {/*
           * 局間換牌換完，這一局就要用新的牌組重來（601.1.c）——
           * 不重開的話場上還留著舊牌組抽出來的牌，那個盤面是不存在的。
           */}
          <button
            type="button"
            onClick={onRestart}
            className="mt-2 w-full rounded border border-accent px-2 py-1.5 text-xs text-accent-soft hover:bg-accent/10"
            data-testid="restart-after-sideboard"
          >
            換好了，用新牌組重新開局（雙方）
          </button>

          </div>

          <div hidden={section !== 'runes'} data-side-section="runes">
          <RuneTracker
            player={player}
            byId={byId}
            lang={lang}
            art={art}
            turn={turn}
            onThePlay={onThePlay}
            onChange={onChange}
          />
          </div>

          <div hidden={section !== 'add'} data-side-section="add">

          {/* 加卡到盤面 */}
          <div className="mb-3 space-y-2 rounded-lg border border-line bg-surface-1 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-dim">加到</span>
              {ADD_TARGETS.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  aria-pressed={adding === zone}
                  onClick={() => setAdding(zone)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    adding === zone
                      ? 'bg-accent/15 text-accent-soft'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {ADD_LABELS[zone]}
                </button>
              ))}
            </div>

            <label htmlFor={`board-search-${title}`} className="sr-only">
              搜尋要加入的卡
            </label>
            <input
              id={`board-search-${title}`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋卡名或卡號…"
              className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />

            <ul className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {candidates.map((card) => {
                const isToken = card.subtype === 'token';
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => addCard(adding, card.id)}
                      data-token={isToken ? 'true' : undefined}
                      title={
                        isToken ? '衍生物：不在任何牌組裡，由卡牌效果生成' : undefined
                      }
                      className={`rounded border px-1.5 py-0.5 text-[0.7rem] transition-colors ${
                        isToken
                          ? 'border-violet-500/50 text-violet-300 hover:border-violet-400'
                          : 'border-line text-ink-dim hover:border-accent hover:text-accent-soft'
                      }`}
                    >
                      {cardName(card, lang)}
                      {isToken && <span className="ml-0.5 text-[0.6rem] opacity-70">衍</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>


          {/* 擺錯的提示 */}
          {remaining.overflow.length > 0 && (
            <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
              <p className="text-rose-300">盤面上有卡片超過牌組裡的張數：</p>
              <ul className="mt-1 space-y-0.5">
                {remaining.overflow.map((o) => {
                  const card = byId.get(o.cardId);
                  return (
                    <li key={o.cardId} className="text-rose-200/80">
                      {card ? cardName(card, lang) : o.cardId}：牌組 {o.inDeck} 張，盤面已有{' '}
                      {o.onBoard} 張
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {foreign.length > 0 && (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200/80">
              盤面上有 {foreign.length} 種卡不在這副牌組裡。遊戲中確實可能出現
              （指示物、被效果加入的卡），但這會讓牌堆的計算失準，請確認是否為預期。
            </p>
          )}

          </div>

        </>
      )}
    </div>
  );
}
