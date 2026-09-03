/**
 * 回合變化時的符文增減。
 *
 * 這裡最重要的一條是「**加減差額，不覆蓋成公式值**」——
 * 實際對局的場上符文幾乎一定比公式少（回收取得符能後那張永久離場，
 * 164.2.b），所以直接覆蓋會把使用者辛苦重建的盤面洗掉。
 */

import { describe, expect, it } from 'vitest';
import { adjustRunesOnBase } from '../../src/lib/board-actions';
import { EMPTY_PLAYER, pileSize, type PlayerBoard } from '../../src/lib/board-state';
import { TURN_RULES, runesSummonedByTurn } from '../../src/lib/draw-model';
import { ALL_CARDS } from '../../src/lib/cards';

const runes = ALL_CARDS.filter((c) => c.types.includes('rune'));
const a = runes[0]!;
const b = runes.find((c) => c.id !== a.id)!;

const CAP = TURN_RULES.runeDeckSize;

function player(base: Record<string, number> = {}): PlayerBoard {
  return {
    ...EMPTY_PLAYER,
    deck: {
      ...EMPTY_PLAYER.deck,
      runes: { [a.id]: 8, [b.id]: 4 },
    },
    base,
  };
}

describe('依回合增減基地上的符文', () => {
  it('前進一回合加兩張', () => {
    const after = adjustRunesOnBase(player(), TURN_RULES.runesPerTurn, CAP);
    expect(pileSize(after.base)).toBe(2);
  });

  it('後退一回合減兩張', () => {
    const start = player({ [a.id]: 4 });
    const after = adjustRunesOnBase(start, -TURN_RULES.runesPerTurn, CAP);
    expect(pileSize(after.base)).toBe(2);
  });

  it('到上限就不再增加（103.3.a 符文牌組 12 張）', () => {
    const after = adjustRunesOnBase(player(), 99, CAP);
    expect(pileSize(after.base)).toBe(CAP);
  });

  it('已經滿了再前進也不會超過', () => {
    const full = adjustRunesOnBase(player(), CAP, CAP);
    const more = adjustRunesOnBase(full, TURN_RULES.runesPerTurn, CAP);
    expect(pileSize(more.base)).toBe(CAP);
  });

  it('不會減到負的', () => {
    const after = adjustRunesOnBase(player({ [a.id]: 1 }), -10, CAP);
    expect(pileSize(after.base)).toBe(0);
  });

  it('不會放上超過牌組張數的同一種符文', () => {
    // 牌組只有 a:8、b:4，全部補滿後每一種都不能超過牌組
    const after = adjustRunesOnBase(player(), CAP, CAP);
    expect(after.base[a.id] ?? 0).toBeLessThanOrEqual(8);
    expect(after.base[b.id] ?? 0).toBeLessThanOrEqual(4);
  });

  /*
   * 這條是這個設計的核心。
   *
   * 使用者在第 5 回合把符文手動調成 7 張（因為回收過 3 張，164.2.b）。
   * 推到第 6 回合時，正確行為是 7 + 2 = 9 —— 而不是覆蓋成公式的 12。
   */
  it('保留使用者手動調整過的張數，只加差額', () => {
    const manual = adjustRunesOnBase(player(), 7, CAP);
    expect(pileSize(manual.base)).toBe(7);

    const nextTurn = adjustRunesOnBase(manual, TURN_RULES.runesPerTurn, CAP);
    expect(pileSize(nextTurn.base)).toBe(9);
    // 不是公式值
    expect(pileSize(nextTurn.base)).not.toBe(runesSummonedByTurn(6, true));
  });

  it('從乾淨的盤面一路推進，結果會與公式一致', () => {
    // 先手：第 1 回合 2 張，之後每回合 +2，上限 12
    let p = adjustRunesOnBase(player(), runesSummonedByTurn(1, true), CAP);
    for (let turn = 2; turn <= 10; turn += 1) {
      p = adjustRunesOnBase(p, TURN_RULES.runesPerTurn, CAP);
      expect(pileSize(p.base)).toBe(runesSummonedByTurn(turn, true));
    }
  });

  it('後手的起始多一張，之後每回合一樣 +2（485.7）', () => {
    let p = adjustRunesOnBase(player(), runesSummonedByTurn(1, false), CAP);
    expect(pileSize(p.base)).toBe(3);

    for (let turn = 2; turn <= 6; turn += 1) {
      p = adjustRunesOnBase(p, TURN_RULES.runesPerTurn, CAP);
      expect(pileSize(p.base)).toBe(runesSummonedByTurn(turn, false));
    }
  });

  it('沒有符文牌組時什麼都不做', () => {
    const empty = EMPTY_PLAYER;
    expect(adjustRunesOnBase(empty, 2, CAP)).toBe(empty);
  });

  it('差額為 0 時回傳原物件，不製造無謂的更新', () => {
    const p = player({ [a.id]: 3 });
    expect(adjustRunesOnBase(p, 0, CAP)).toBe(p);
  });

  it('是決定性的 —— 同樣的輸入永遠得到同樣的結果', () => {
    const one = adjustRunesOnBase(player(), 7, CAP);
    const two = adjustRunesOnBase(player(), 7, CAP);
    expect(one.base).toEqual(two.base);
  });

  it('推過去再推回來，張數會回到原本的數字', () => {
    const start = adjustRunesOnBase(player(), 5, CAP);
    const forward = adjustRunesOnBase(start, TURN_RULES.runesPerTurn, CAP);
    const back = adjustRunesOnBase(forward, -TURN_RULES.runesPerTurn, CAP);
    expect(pileSize(back.base)).toBe(pileSize(start.base));
  });

  it('不會動到基地上的非符文卡', () => {
    const unit = ALL_CARDS.find((c) => c.types.includes('unit'))!;
    const withUnit = player({ [unit.id]: 2 });
    const after = adjustRunesOnBase(withUnit, 4, CAP);
    expect(after.base[unit.id]).toBe(2);
  });
});
