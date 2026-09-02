import { expect, test, type Page } from '@playwright/test';
import { shareUrl } from './url-assert';

/**
 * 對局復盤板的端對端驗證。
 *
 * 除了功能，也驗證兩條誠實界線：
 *   · 頁面必須明說它不會給「最佳解」
 *   · 對手的手牌預設只記張數（108.7.c / 108.7.e）
 */

async function gotoReplay(page: Page, query = '') {
  await page.goto(`/replay${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '對局復盤', level: 1 })).toBeVisible();
  await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
}

/**
 * 取得某一方的東西。
 *
 * 版面分成兩塊：上面的牌桌（data-side，顯示與搬移）與下面的編輯面板
 * （data-edit-side，匯入、加卡、備牌、符文）。這個選擇器同時涵蓋兩塊 ——
 * 兩塊裡不會有同名的元素，所以往下找一定只命中一個。
 */
const sideOf = (page: Page, side: 'you' | 'opponent') =>
  page.locator(`[data-side="${side}"], [data-edit-side="${side}"]`);

/**
 * 取得某一方的某個區域。
 *
 * 戰場是雙方共用的（198.1），擺在牌桌中間而不在任一方的區塊裡，
 * 所以要靠區域自己標的 data-owner 來指定是哪一方的。
 */
const zoneOf = (page: Page, side: 'you' | 'opponent', zone: string) =>
  page.locator(`[data-owner="${side}"][data-zone="${zone}"]`);

/**
 * 模擬控制列與戰場選擇現在都是一方一組（各自貼著自己那側的桌緣），
 * 所以取用時一定要指名是哪一方的。
 */
const controlsOf = (page: Page, side: 'you' | 'opponent') =>
  page.locator(`[data-testid="game-controls"][data-controls-side="${side}"]`);

const battlefieldOf = (page: Page, side: 'you' | 'opponent') =>
  page.locator(`[data-testid="battlefield-zone"][data-controls-side="${side}"]`);

/** 在指定的一方匯入一副小牌組。 */
async function importDeck(page: Page, side: 'you' | 'opponent', lines: string[]) {
  const scope = sideOf(page, side);
  await scope.getByRole('button', { name: /^匯入牌組/ }).click();
  await scope.getByLabel('牌表內容').fill(lines.join('\n'));
  await scope.getByRole('button', { name: '檢查' }).click();
  await scope.getByRole('button', { name: /^匯入 \d+ 種卡$/ }).click();
}

const SMALL_DECK = ['【主牌組】', '3 Blazing Scorcher', '3 Cleave', '【符文牌組】', '12 Fury Rune'];

/*
 * 匯入用英文卡名（匯入器三語都認），但介面預設是繁體中文，
 * 所以點按鈕時要用繁中卡名：
 *   Blazing Scorcher → 烈焰灼魂者
 *   Cleave → 劈砍
 *   Fury Rune → 狂怒符文
 */

/*
 * 版面本身也要有測試守著。
 *
 * 這個排法不是美觀問題，是「看得懂」的問題：對手在上、你在下、
 * 戰場擺中間讓雙方單位上下相鄰。哪天有人把它改回兩欄清單，
 * 「這個戰場打不打得贏」就又要左右對照才拼得回來。
 */
test.describe('牌桌版面', () => {
  test('對手在上、你在下', async ({ page }) => {
    await gotoReplay(page);

    const table = page.getByTestId('board-table');
    await expect(table).toBeVisible();

    const opp = await page.getByTestId('strip-opponent').boundingBox();
    const you = await page.getByTestId('strip-you').boundingBox();
    const bf = await page.getByTestId('battlefield-row').boundingBox();

    expect(opp!.y).toBeLessThan(bf!.y);
    expect(bf!.y).toBeLessThan(you!.y);
  });

  test('同一個戰場同時看得到雙方的單位', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await importDeck(page, 'opponent', SMALL_DECK);

    // 雙方各放一張到戰場一
    for (const side of ['you', 'opponent'] as const) {
      const edit = page.locator(`[data-edit-side="${side}"]`);
      await edit.getByRole('button', { name: '戰一', exact: true }).click();
      await edit
        .getByRole('button', { name: side === 'you' ? '烈焰灼魂者' : '劈砍', exact: true })
        .click();
    }

    const bf = page.locator('[data-battlefield="0"]');
    await expect(bf.locator('[data-owner="opponent"]')).toContainText('劈砍');
    await expect(bf.locator('[data-owner="you"]')).toContainText('烈焰灼魂者');

    // 對手的在上、你的在下 —— 跟實體對局的座位一致
    const oppBox = await bf.locator('[data-owner="opponent"]').boundingBox();
    const youBox = await bf.locator('[data-owner="you"]').boundingBox();
    expect(oppBox!.y).toBeLessThan(youBox!.y);
  });

  test('看盤面與改盤面是分開的兩塊', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 牌桌只顯示與搬移，加卡的控制項不在裡面
    const table = page.getByTestId('board-table');
    await expect(table.getByRole('button', { name: /^匯入牌組/ })).toHaveCount(0);
    await expect(table.getByPlaceholder('搜尋卡名或卡號…')).toHaveCount(0);

    // 編輯面板裡沒有區域清單 —— 區域全部在牌桌上
    await expect(page.locator('[data-edit-side="you"] [data-zone]')).toHaveCount(0);
    await expect(
      page.locator('[data-edit-side="you"]').getByPlaceholder('搜尋卡名或卡號…'),
    ).toBeVisible();
  });
});

test.describe('對局復盤', () => {
  test('沒有牌組時提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect(page.getByText(/先匯入這一方的牌組/).first()).toBeVisible();
  });

  test('匯入牌組後算得出牌堆剩幾張', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 主牌組 6 張，什麼都還沒擺 → 牌堆 6 張
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 6');
  });

  test('把卡放進手牌會從牌堆扣掉', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 預設加到手牌
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 1');
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 5');
  });

  test('可以把卡從手牌搬到廢牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await sideOf(page, 'you').getByRole('button', { name: /從手牌搬到廢牌堆$/ }).first().click();

    const discard = sideOf(page, 'you').locator('[data-zone="discard"]');
    await expect(discard).toContainText('烈焰灼魂者');
    // 搬動不影響牌堆總數
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 5');
  });

  test('擺超過牌組張數會被指出來，而不是安靜修正', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 牌組只有 3 張，按 4 次
    const add = sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true });
    for (let i = 0; i < 4; i += 1) await add.click();

    await expect(page.getByText(/盤面上有卡片超過牌組裡的張數/)).toBeVisible();
  });

  test('從當下牌堆算出的機率會隨盤面改變', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const section = sideOf(page, 'you').getByTestId('next-draw-odds');
    await expect(section).toBeVisible();

    // 牌堆 6 張、目標 3 張，抽 1 張 = 3/6 = 50%
    await expect(section).toContainText('50.0%');

    // 把 3 張都放進廢牌堆後，機率變 0
    const add = sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true });
    await sideOf(page, 'you').getByRole('button', { name: '廢牌堆', exact: true }).click();
    for (let i = 0; i < 3; i += 1) await add.click();

    await expect(section).not.toContainText('烈焰灼魂者');
  });

  test('基地上的符文決定手牌裡哪些付得起', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // Cleave 1 費、Blazing Scorcher 5 費，都放進手牌
    await sideOf(page, 'you').getByRole('button', { name: '劈砍', exact: true }).click();
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    await expect(hand).toBeVisible();

    // 還沒放符文 → 兩張都付不起
    await expect(page.getByText('基地上 0 張符文')).toBeVisible();

    // 放 2 張符文到基地
    await sideOf(page, 'you').getByRole('button', { name: '基地', exact: true }).click();
    const rune = sideOf(page, 'you').getByRole('button', { name: '狂怒符文', exact: true });
    await rune.click();
    await rune.click();

    await expect(page.getByText('基地上 2 張符文')).toBeVisible();
  });

  test('對手的手牌預設只記張數（108.7.c / 108.7.e）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'opponent', SMALL_DECK);

    const unknown = page.getByLabel('對手手牌中你不知道內容的張數');
    await expect(unknown).toBeVisible();

    // 你這方沒有這個欄位 —— 自己的手牌你當然知道內容
    await expect(page.getByLabel('對手手牌中你不知道內容的張數')).toHaveCount(1);
  });

  test('盤面會編進網址，可以分享', async ({ page, context }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();
      await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 1');
    });

    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-replay-ready="true"]')).toBeAttached();
    const summary = other.locator('[data-side="you"]').getByTestId('side-summary');
    await expect(summary).toContainText('手牌 1');
    await expect(summary).toContainText('牌堆 5');
    await other.close();
  });

  test('回合數會影響應召出的符文提示', async ({ page }) => {
    await gotoReplay(page);

    // 先手第 1 回合 2 張（315.3.b）
    await expect(page.getByText(/應該召出過\s*2\s*張符文/)).toBeVisible();

    await page.getByRole('button', { name: '後手' }).click();
    // 後手第 1 回合 3 張（485.7）
    await expect(page.getByText(/應該召出過\s*3\s*張符文/)).toBeVisible();
  });

  test('頁面明說不會給最佳解', async ({ page }) => {
    await gotoReplay(page);
    await expect(page.getByText(/不會做：告訴你最佳解/)).toBeVisible();
    await expect(page.getByText(/沒有引擎卻跳出「建議」，那個建議是編的/)).toBeVisible();
  });

  /*
   * 這條守的是「定位」而不是功能。
   *
   * 這個頁面很容易被誤會成對戰系統 —— 它有雙方盤面、會抽牌、會跑回合。
   * 頁面上必須明白寫出「不是對戰系統」，讓使用者一眼知道自己在用什麼。
   * 這個宣告哪天被刪掉或改掉，這條測試要紅。
   */
  test('頁面明說這不是對戰系統', async ({ page }) => {
    await gotoReplay(page);

    // 標題底下就要看得到
    await expect(page.getByTestId('not-a-game')).toContainText('研究工具，不是對戰系統');
    await expect(page.getByTestId('not-a-game')).toContainText('沒有配對');

    // 底部的界線說明也要有，而且擺在第一段
    await expect(page.getByText(/先講最重要的：這不是對戰系統/)).toBeVisible();
    await expect(page.getByText(/不是連到另一個人/)).toBeVisible();
  });

  test('控制列的用詞不會讓人以為在對戰', async ({ page }) => {
    await gotoReplay(page);

    const controls = controlsOf(page, 'you');
    await expect(controls.getByRole('heading', { name: '模擬規則流程' })).toBeVisible();

    // 不該出現「開始遊戲」「對戰」這類說法
    await expect(controls).not.toContainText('對戰');
    await expect(controls).not.toContainText('開始遊戲');
  });

  test('惡意網址被安全丟棄，頁面照常運作', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoReplay(
      page,
      `?b=${encodeURIComponent('b1!1!1!~<script>alert(1)</script>~0~~~!~__proto__x3~0~~~')}`,
    );

    await expect(page.getByRole('heading', { name: '對局復盤', level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('CSP 沒有因為新頁面而被違反', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) {
        violations.push(m.text());
      }
    });

    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    expect(violations).toEqual([]);
  });
});

test.describe('場上符文', () => {
  test('有獨立的符文控制，不用去通用的加卡流程找', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const runes = sideOf(page, 'you').locator('[data-runes]');
    await expect(runes).toBeVisible();
    await expect(runes).toContainText('場上符文');
    await expect(runes).toContainText('107.1.c');
  });

  test('加減符文會改變可用資源', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const total = sideOf(page, 'you').getByTestId('rune-total');
    await expect(total).toHaveText('0');

    const plus = sideOf(page, 'you').getByRole('button', { name: /^增加場上的/ });
    await plus.click();
    await plus.click();
    await expect(total).toHaveText('2');

    await sideOf(page, 'you').getByRole('button', { name: /^減少場上的/ }).click();
    await expect(total).toHaveText('1');
  });

  test('一鍵補到該回合應有的張數', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 第 1 回合先手應召出 2 張（315.3.b）
    await sideOf(page, 'you').getByRole('button', { name: '補到 2 張' }).click();
    await expect(sideOf(page, 'you').getByTestId('rune-total')).toHaveText('2');

    // 改到第 4 回合 → 8 張
    const turn = page.getByLabel(/回合/).first();
    await turn.fill('4');
    await sideOf(page, 'you').getByRole('button', { name: '補到 8 張' }).click();
    await expect(sideOf(page, 'you').getByTestId('rune-total')).toHaveText('8');
  });
});

test.describe('戰場區域', () => {
  const WITH_BATTLEFIELDS = [
    ...SMALL_DECK,
    '【戰場】',
    '1 Altar to Unity',
    '1 Spirit’s Refuge',
  ];

  test('可以選定雙方各帶來的戰場（485.4、485.5）', async ({ page }) => {
    await gotoReplay(page);

    const zone = battlefieldOf(page, 'you');
    await expect(zone).toBeVisible();
    await expect(zone).toContainText('107.2');

    await importDeck(page, 'you', WITH_BATTLEFIELDS);

    const select = page.locator('#battlefield-0');
    await expect(select).toBeEnabled();
    await select.selectOption({ label: '團結祭壇' });
    await expect(zone).toContainText('團結祭壇');
  });

  test('戰場選擇會編進網址，可以分享', async ({ page, context }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', WITH_BATTLEFIELDS);

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await page.locator('#battlefield-0').selectOption({ label: '團結祭壇' });
      // 下拉的選項本來就含這個名字，所以要驗「值」而不是「有沒有這段文字」
      await expect(page.locator('#battlefield-0')).toHaveValue(/ogn/);
    });

    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(other.locator('#battlefield-0')).toHaveValue(/ogn/);
    await other.close();
  });

  test('沒有戰場的牌組會提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect(page.getByText(/這一方的牌組裡還沒有戰場/).first()).toBeVisible();
  });
});

test.describe('單位的位置（規則 198.1）', () => {
  test('單位可以從基地移到戰場', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    await sideOf(page, 'you').getByRole('button', { name: '基地', exact: true }).click();
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await sideOf(page, 'you')
      .getByRole('button', { name: /從基地（場上）搬到戰場一/ })
      .first()
      .click();

    const bf0 = zoneOf(page, 'you', 'bf0');
    await expect(bf0).toContainText('烈焰灼魂者');
  });
});

test.describe('傳奇與選定英雄', () => {
  const WITH_LEGEND = [
    '【傳奇】',
    '1 Daughter of the Void',
    '【主牌組】',
    '3 Blazing Scorcher',
    '【符文牌組】',
    '12 Fury Rune',
  ];

  test('傳奇區域與英雄區域都看得到，並附條號', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', WITH_LEGEND);

    const zone = sideOf(page, 'you').getByTestId('champion-zone');
    await expect(zone).toContainText('傳奇區域');
    await expect(zone).toContainText('107.4');
    await expect(zone).toContainText('選定英雄');
    await expect(zone).toContainText('108.3');
    await expect(zone).toContainText('凱莎-虛空之女');
  });

  test('選定英雄擺進英雄區域後就不算在牌堆裡（133.4）', async ({ page }) => {
    await gotoReplay(page);
    // 只有一個候選時，匯入會自動推斷並擺進英雄區域
    await importDeck(page, 'you', [
      ...WITH_LEGEND.slice(0, 2),
      '【主牌組】',
      "3 Kai'Sa, Survivor",
    ]);

    // 3 張裡有 1 張在英雄區域 → 牌堆剩 2
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 2');
    await expect(sideOf(page, 'you').locator('[data-zone="champion"]')).toContainText('凱莎');
  });

  test('可以取消選定英雄，那張卡就回到牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', [
      ...WITH_LEGEND.slice(0, 2),
      '【主牌組】',
      "3 Kai'Sa, Survivor",
    ]);
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 2');

    const select = sideOf(page, 'you').getByTestId('champion-select');
    await select.selectOption('');

    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 3');
  });
});

test.describe('局間換牌（403.4）', () => {
  const WITH_SIDEBOARD = [
    '【主牌組】',
    '3 Blazing Scorcher',
    '【備牌】',
    '2 Cleave',
  ];

  test('備牌不會出現在盤面的候選卡裡（403.5：第一局不能用備牌）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', WITH_SIDEBOARD);

    await expect(
      sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }),
    ).toBeVisible();
    await expect(
      sideOf(page, 'you').getByRole('button', { name: '劈砍', exact: true }),
    ).toHaveCount(0);
  });

  test('可以把備牌換進主牌組，牌堆跟著變', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', WITH_SIDEBOARD);

    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 3');

    await sideOf(page, 'you').getByRole('button', { name: /^調整主牌組與備牌/ }).click();
    await sideOf(page, 'you').getByRole('button', { name: /把 劈砍 換進主牌組/ }).click();

    // 主牌組多一張 → 牌堆 4
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 4');
    // 換進來之後就能在盤面上操作了
    await expect(
      sideOf(page, 'you').getByRole('button', { name: '劈砍', exact: true }),
    ).toBeVisible();
  });
});

test.describe('直接選擇加到哪一區', () => {
  test('六個區域都能直接選，不用先加到基地再搬', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const scope = sideOf(page, 'you');
    for (const label of ['手牌', '基地', '戰一', '戰二', '廢牌堆', '放逐']) {
      await expect(scope.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // 直接加到戰場二
    await scope.getByRole('button', { name: '戰二', exact: true }).click();
    await scope.getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(zoneOf(page, 'you', 'bf1')).toContainText('烈焰灼魂者');
  });
});

test.describe('回合狀態（規則 307–310）', () => {
  /** Cleave 有 [迅捷]、Shakedown 有 [反應]、Blazing Scorcher 兩者皆無。 */
  const TIMING_DECK = [
    '【主牌組】',
    '3 Cleave',
    '3 Shakedown',
    '3 Blazing Scorcher',
    '【符文牌組】',
    '12 Fury Rune',
  ];

  /** 把三張代表性的卡放進手牌，並補滿符文避免資源不足干擾判讀。 */
  async function setUpHand(page: Page) {
    await importDeck(page, 'you', TIMING_DECK);
    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    for (const name of ['劈砍', '勒索', '烈焰灼魂者']) {
      const button = you.getByRole('button', { name, exact: true });
      if (await button.count()) await button.click();
    }
  }

  test('四種狀態切換得到，並顯示對應條號', async ({ page }) => {
    await gotoReplay(page);

    const label = page.getByTestId('turn-state-label');
    await expect(label).toHaveText('普通開環');
    await expect(page.getByTestId('turn-state')).toContainText('310.1');

    await page.getByLabel(/結算鏈上有東西/).check();
    await expect(label).toHaveText('普通閉環');
    await expect(page.getByTestId('turn-state')).toContainText('309.1.a');

    await page.getByLabel(/結算鏈上有東西/).uncheck();
    await page.getByLabel(/正在法術對決或戰鬥中/).check();
    await expect(label).toHaveText('法術對決開環');
    await expect(page.getByTestId('turn-state')).toContainText('308.1.a');

    await page.getByLabel(/結算鏈上有東西/).check();
    await expect(label).toHaveText('法術對決閉環');
  });

  test('普通開環：你的回合什麼都打得出來', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    await expect(hand).toBeVisible();
    // 三張都是「時機可」
    await expect(hand.getByText('時機不可')).toHaveCount(0);
  });

  test('法術對決：沒有迅捷或反應的卡打不出來（308.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await page.getByLabel(/正在法術對決或戰鬥中/).check();

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    // 烈焰灼魂者兩個關鍵字都沒有 → 時機不可
    await expect(hand.getByText('時機不可')).toHaveCount(1);
    // 迅捷與反應那兩張還是可以
    await expect(hand.getByText('時機可')).toHaveCount(2);
  });

  test('閉環：只剩反應（309.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await page.getByLabel(/結算鏈上有東西/).check();

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    // 只有帶反應的那一張可以
    await expect(hand.getByText('時機可')).toHaveCount(1);
    await expect(hand.getByText('時機不可')).toHaveCount(2);
  });

  test('不是你的回合時，只有反應打得出來（310.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await page.getByRole('button', { name: '對手的回合' }).click();

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    await expect(hand.getByText('時機可')).toHaveCount(1);
  });

  test('時機與資源分開顯示 —— 打不出來的原因不同', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', TIMING_DECK);

    // 不補符文，把 5 費的烈焰灼魂者放進手牌
    await sideOf(page, 'you')
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const hand = sideOf(page, 'you').getByTestId('playable-hand');
    // 普通開環 → 時機可，但沒有符文 → 資源不足
    await expect(hand).toContainText('時機可');
    await expect(hand).toContainText('資源差');
  });

  test('回合狀態會編進網址', async ({ page }) => {
    await gotoReplay(page);

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await page.getByLabel(/正在法術對決或戰鬥中/).check();
      await expect(page.getByTestId('turn-state-label')).toHaveText('法術對決開環');
    });

    await page.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(page.getByTestId('turn-state-label')).toHaveText('法術對決開環');
  });
});

test.describe('活躍與休眠（規則 414、415）', () => {
  test('單位加到場上預設是休眠（143.4、359.2.c）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '基地', exact: true }).click();
    await you.getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(you.locator('[data-zone="base"]')).toContainText('休眠');
  });

  test('符文加到場上預設是活躍（430.2.a）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();

    // 兩張都活躍 → 可用資源 2
    await expect(you.getByTestId('rune-total')).toHaveText('2');
    await expect(you.locator('[data-runes]')).toContainText('全活躍');
  });

  test('休眠的符文不算可用資源（164.2.a、414.1）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('2');

    // 切一張進休眠
    await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('1');
    await expect(you.getByTestId('side-summary')).toContainText('活躍符文 1');
  });

  test('全部喚醒會把所有東西變回活躍（415.3.a）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('1');

    await you.getByRole('button', { name: '全部喚醒' }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('2');
  });

  test('休眠影響手牌能不能打出 —— 資源少了', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    // 劈砍 1 費，兩張活躍符文夠付
    await you.getByRole('button', { name: '劈砍', exact: true }).click();
    await expect(you.getByTestId('playable-hand')).toContainText('資源夠');

    // 把兩張符文都休眠 → 付不起
    const toggle = you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ });
    await toggle.click();
    await toggle.click();
    await expect(you.getByTestId('playable-hand')).toContainText('資源差');
  });

  test('休眠狀態會編進網址', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = sideOf(page, 'you');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    // 先確認前置狀態到位，再做下一步 —— 否則可能點在還沒更新的畫面上
    await expect(you.getByTestId('rune-total')).toHaveText('2');

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
      await expect(you.getByTestId('rune-total')).toHaveText('1');
    });

    await page.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(sideOf(page, 'you').getByTestId('rune-total')).toHaveText('1');
  });
});

test.describe('模擬規則流程', () => {
  const PLAYABLE = [
    '【傳奇】',
    '1 Daughter of the Void',
    '【主牌組】',
    "3 Kai'Sa, Survivor",
    '3 Blazing Scorcher',
    '3 Cleave',
    '【符文牌組】',
    '12 Fury Rune',
  ];

  test('開新的一局會抽四張手牌（規則 116）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);

    await controlsOf(page, 'you').getByRole('button', { name: '重設成開局狀態' }).click();

    // 主牌組 9 張 − 英雄區域 1 張 − 手牌 4 張 = 牌堆 4 張
    const summary = sideOf(page, 'you').getByTestId('side-summary');
    await expect(summary).toContainText('手牌 4');
    await expect(summary).toContainText('牌堆 4');
  });

  test('抽一張會從牌堆移到手牌（315.4.b）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);
    await controlsOf(page, 'you').getByRole('button', { name: '重設成開局狀態' }).click();

    await controlsOf(page, 'you').getByRole('button', { name: '抽一張' }).click();

    const summary = sideOf(page, 'you').getByTestId('side-summary');
    await expect(summary).toContainText('手牌 5');
    await expect(summary).toContainText('牌堆 3');
  });

  test('下一回合會喚醒、召符文、抽牌', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);
    await controlsOf(page, 'you').getByRole('button', { name: '重設成開局狀態' }).click();

    await controlsOf(page, 'you').getByRole('button', { name: /^推進 你 一個回合$/ }).click();

    const summary = sideOf(page, 'you').getByTestId('side-summary');
    // 315.3.b 召兩張符文（先手）、315.4.b 抽一張
    await expect(summary).toContainText('活躍符文 2');
    await expect(summary).toContainText('手牌 5');
  });

  test('手牌調度換掉的張數等於補回的張數（117）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);

    const controls = controlsOf(page, 'you');
    await controls.getByRole('button', { name: '重設成開局狀態' }).click();
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');

    // 選一張換掉
    await controls.getByRole('button', { name: /^(凱莎|烈焰灼魂者|劈砍)/ }).first().click();
    await controls.getByRole('button', { name: /^換掉這 1 張$/ }).click();

    // 手牌張數不變 —— 換一張補一張
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');
  });

  test('沒有牌組時提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect(controlsOf(page, 'you')).toContainText('先匯入 你 的牌組');
  });

  /*
   * 雙方各有自己的一組控制項，不必先切換再按。
   *
   * 原本這裡是一組按鈕加一個「你／對手」切換鈕，這條測試會先點「對手」
   * 再按。改成一方一組之後，切換鈕沒了 —— 直接按對手那一組就好，
   * 這正是這次調整要的效果。
   */
  test('雙方各有自己的一組控制項，互不影響', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'opponent', PLAYABLE);

    // 你這方還沒匯入牌組，你的那一組會這樣說
    await expect(controlsOf(page, 'you')).toContainText('先匯入 你 的牌組');

    // 不必切換，直接按對手那一組
    await controlsOf(page, 'opponent').getByRole('button', { name: '重設成開局狀態' }).click();

    await expect(sideOf(page, 'opponent').getByTestId('side-summary')).toContainText('手牌 4');
    // 你這方沒被動到
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 0');
  });

  test('每一方的控制項都在自己那一側', async ({ page }) => {
    await gotoReplay(page);

    const oppBlock = await page.locator('[data-block-side="opponent"]').boundingBox();
    const table = await page.getByTestId('board-table').boundingBox();
    const youBlock = await page.locator('[data-block-side="you"]').boundingBox();

    // 對手的控制項在牌桌上方，你的在下方
    expect(oppBlock!.y).toBeLessThan(table!.y);
    expect(table!.y).toBeLessThan(youBlock!.y);

    // 戰場選擇與匯入也各自跟著自己那一側
    await expect(battlefieldOf(page, 'opponent')).toHaveCount(1);
    await expect(battlefieldOf(page, 'you')).toHaveCount(1);
    await expect(
      page.locator('[data-block-side="opponent"]').getByRole('button', { name: /^匯入牌組/ }),
    ).toHaveCount(1);
  });

  test('打完的盤面照樣能分享', async ({ page, context }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await controlsOf(page, 'you').getByRole('button', { name: '重設成開局狀態' }).click();
      await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');
    });

    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(other.locator('[data-side="you"]').getByTestId('side-summary')).toContainText(
      '手牌 4',
    );
    await other.close();
  });
});
