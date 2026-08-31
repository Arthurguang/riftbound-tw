import { expect, test, type Page } from '@playwright/test';

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

/** 取得某一方的面板。用明確的 data-side 而不是靠 DOM 結構去猜。 */
const sideOf = (page: Page, side: 'you' | 'opponent') =>
  page.locator(`[data-side="${side}"]`);

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

test.describe('對局復盤', () => {
  test('沒有牌組時提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect(page.getByText(/先匯入這一方的牌組/).first()).toBeVisible();
  });

  test('匯入牌組後算得出牌堆剩幾張', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 主牌組 6 張，什麼都還沒擺 → 牌堆 6 張
    await expect(sideOf(page, 'you').getByText(/牌堆 6/)).toBeVisible();
  });

  test('把卡放進手牌會從牌堆扣掉', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 預設加到手牌
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(sideOf(page, 'you').getByText(/手牌 1/)).toBeVisible();
    await expect(sideOf(page, 'you').getByText(/牌堆 5/)).toBeVisible();
  });

  test('可以把卡從手牌搬到廢牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await sideOf(page, 'you').getByRole('button', { name: /從手牌搬到廢牌堆$/ }).first().click();

    const discard = sideOf(page, 'you').locator('[data-zone="discard"]');
    await expect(discard).toContainText('烈焰灼魂者');
    // 搬動不影響牌堆總數
    await expect(sideOf(page, 'you').getByText(/牌堆 5/)).toBeVisible();
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

    const affordable = sideOf(page, 'you').getByRole('heading', { name: /手牌裡現在付得起的/ });
    await expect(affordable).toBeVisible();

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
    await expect(page).toHaveURL(/[?&]b=b2/); // 格式版本 2（含戰場）
    const beforeCard = page.url();

    await sideOf(page, 'you').getByRole('button', { name: '烈焰灼魂者', exact: true }).click();
    await expect(sideOf(page, 'you').getByText(/手牌 1/)).toBeVisible();

    /*
     * router.replace 寫網址是非同步的。太早複製會拿到「還沒加手牌」那一版，
     * 第二頁自然看不到手牌 —— 要等網址真的變了再取。
     */
    await expect.poll(() => page.url()).not.toBe(beforeCard);
    const shared = page.url();

    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(other.locator('[data-side="you"]').getByText(/手牌 1/)).toBeVisible();
    await expect(other.locator('[data-side="you"]').getByText(/牌堆 5/)).toBeVisible();
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

    const zone = page.getByTestId('battlefield-zone');
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
    await page.locator('#battlefield-0').selectOption({ label: '團結祭壇' });

    await expect(page).toHaveURL(/[?&]b=b2/);
    const shared = page.url();

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

    const bf0 = sideOf(page, 'you').locator('[data-zone="bf0"]');
    await expect(bf0).toContainText('烈焰灼魂者');
  });
});
