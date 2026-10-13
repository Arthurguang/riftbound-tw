/**
 * 計分板的三語文案。
 *
 * 跟規則說明頁一樣的規矩：任何牽涉規則的句子都要寫得出出處。
 * 這一頁只有一條那種句子（勝利分數），出處是官方新手指南。
 */

import type { TextLang } from './i18n';

type Tri = Record<TextLang, string>;

const tri = (zhTW: string, zhCN: string, en: string): Tri => ({
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
});

export const SCORE_STRINGS = {
  title: tri('計分板', '计分板', 'Scoreboard'),
  intro: tri(
    '實體對戰用的記分工具：加減分、記回合，分數會留在這台裝置上。',
    '实体对战用的记分工具：加减分、记回合，分数会留在这台设备上。',
    'A scorekeeper for tabletop play: tap to score, track the round, and your numbers stay on this device.',
  ),
  playerA: tri('玩家一', '玩家一', 'Player 1'),
  playerB: tri('玩家二', '玩家二', 'Player 2'),
  addPoint: tri('加 1 分', '加 1 分', 'Add 1 point'),
  subPoint: tri('減 1 分', '减 1 分', 'Subtract 1 point'),
  targetLabel: tri('勝利分數', '胜利分数', 'Points to win'),
  roundLabel: tri('回合', '回合', 'Round'),
  nextRound: tri('下一回合', '下一回合', 'Next round'),
  prevRound: tri('上一回合', '上一回合', 'Previous round'),
  facingLabel: tri('對坐模式', '对坐模式', 'Face-to-face'),
  facingHint: tri(
    '把上面那一側轉 180 度，坐對面的人才看得正。',
    '把上面那一侧转 180 度，坐对面的人才看得正。',
    'Flips the top panel so the player across the table reads it upright.',
  ),
  awakeLabel: tri('螢幕不休眠', '屏幕不休眠', 'Keep screen on'),
  awakeUnsupported: tri(
    '這個瀏覽器不支援',
    '这个浏览器不支持',
    'Not supported in this browser',
  ),
  undo: tri('復原', '撤销', 'Undo'),
  newGame: tri('開新的一局', '开新的一局', 'New game'),
  newGameConfirm: tri(
    '要把雙方分數與回合歸零嗎？',
    '要把双方分数与回合归零吗？',
    'Reset both scores and the round counter?',
  ),
  reached: (n: number): Tri =>
    tri(`已達 ${n} 分`, `已达 ${n} 分`, `Reached ${n}`),
  /*
   * 達到勝利分數時只寫這一句。
   * 本站不宣告誰贏 —— 得分時機、效果結算都要規則引擎才算得出來，
   * 那條線（官方政策第 1 條：automated rule enforcement）我們不碰。
   */
  reachedNote: tri(
    '依官方新手指南，拿到 8 分即獲勝（多人團隊賽為 11 分）。本站只負責記分，不判定勝負。',
    '依官方新手指南，拿到 8 分即获胜（多人团队赛为 11 分）。本站只负责记分，不判定胜负。',
    'The official Quick Start Guide says 8 points wins (11 in team games). This page only counts — it does not call the game.',
  ),
  storageNote: tri(
    '分數只存在這台裝置的瀏覽器裡，超過 12 小時會自動從新的一局開始。',
    '分数只存在这台设备的浏览器里，超过 12 小时会自动从新的一局开始。',
    'Scores stay in this browser only, and start fresh after 12 hours.',
  ),
} as const;
