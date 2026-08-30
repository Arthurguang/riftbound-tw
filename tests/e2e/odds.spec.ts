import { expect, test, type Page } from '@playwright/test';

/**
 * 機率計算頁的端對端驗證。
 *
 * 重點在「畫面上顯示的數字，跟數學算出來的一致」——
 * 單元測試已經證明公式正確，這裡證明介面沒有在中間把它弄壞。
 */

async function gotoOdds(page: Page, query = '') {
  await page.goto(`/odds${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '機率計算', level: 1 })).toBeVisible();
  // 等 React 接手再操作 —— 否則打字只改到 DOM，狀態不會更新
  await expect(page.locator('[data-odds-ready="true"]')).toBeAttached();
}

/**
 * 把數字填進其中一個欄位。
 *
 * 這是受控的數字輸入框：每次按鍵都會觸發 React 重新渲染並把值夾在範圍內。
 * 在負載下偶爾會掉掉一次按鍵，欄位變空就被夾成 0，算出來的機率當然不對。
 * 所以輸入後要驗證欄位真的變成預期的值，沒有的話整段重來。
 */
async function setField(page: Page, label: string, value: number) {
  const input = page.getByLabel(label);
  await expect(async () => {
    await input.click({ clickCount: 3 }); // 三連點選取整個數值
    await input.pressSequentially(String(value), { delay: 30 });
    await expect(input).toHaveValue(String(value), { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

test.describe('機率計算', () => {
  test('預設值算出正確的機率', async ({ page }) => {
    await gotoOdds(page);
    // 40 張牌組放 3 張，抽 4 張至少 1 張 = 1 − C(37,4)/C(40,4) ≈ 27.7%
    await expect(page.getByTestId('quick-result')).toHaveText('27.7%');
  });

  test('撲克牌的經典題目算得對', async ({ page }) => {
    await gotoOdds(page);
    // 52 張抽 5 張，至少 1 張 A（4 張）≈ 34.1%
    await setField(page, '牌組張數', 52);
    await setField(page, '這張牌放幾張', 4);
    await setField(page, '抽幾張', 5);
    await expect(page.getByTestId('quick-result')).toHaveText('34.1%');
  });

  test('放 0 張時機率為 0，放滿時為 100%', async ({ page }) => {
    await gotoOdds(page);
    await setField(page, '這張牌放幾張', 0);
    await expect(page.getByTestId('quick-result')).toHaveText('0%');

    await setField(page, '這張牌放幾張', 40);
    await expect(page.getByTestId('quick-result')).toHaveText('100%');
  });

  test('分布的每一項加起來是 100%', async ({ page }) => {
    await gotoOdds(page);
    const texts = await page.locator('section').first().locator('li span.font-mono').allTextContents();
    const sum = texts
      .map((t) => Number.parseFloat(t.replace('%', '')))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => a + b, 0);
    // 各項四捨五入到小數一位，總和允許些微誤差
    expect(sum).toBeGreaterThan(99.5);
    expect(sum).toBeLessThan(100.5);
  });

  test('沒有牌組時引導使用者去牌組編輯器', async ({ page }) => {
    await gotoOdds(page);
    await expect(page.getByRole('link', { name: '牌組編輯器' }).last()).toBeVisible();
    await expect(page.getByRole('heading', { name: '逐回合抽到的機率' })).toBeHidden();
  });

  test('惡意網址不會讓頁面壞掉', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoOdds(
      page,
      `?d=${encodeURIComponent("1|<script>alert(1)</script>|__proto__|evil999x99|'; DROP--|")}`,
    );

    await expect(page.getByTestId('quick-result')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('從牌組編輯器可以把牌組帶過來', async ({ page }) => {
    await page.goto('/deck', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();

    await page.getByRole('tab', { name: '主牌組', exact: true }).click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();

    await page.getByRole('link', { name: '計算機率' }).click();

    await expect(page.getByRole('heading', { name: '機率計算', level: 1 })).toBeVisible();
    await expect(page.locator('[data-odds-ready="true"]')).toBeAttached();
    await expect(page.getByText(/主牌組\s*2\s*張/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '逐回合抽到的機率' })).toBeVisible();
  });

  test('先手後手切換會改變資源曲線', async ({ page }) => {
    await page.goto('/deck', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
    await page.getByRole('tab', { name: '主牌組', exact: true }).click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('link', { name: '計算機率' }).click();
    await expect(page.locator('[data-odds-ready="true"]')).toBeAttached();

    const firstRow = page.getByRole('row').filter({ hasText: 'T1' }).last();

    // 先手第 1 回合 2 張符文（315.3.b）
    await expect(firstRow).toContainText('2');

    // 後手第 1 回合 3 張（485.7）
    await page.getByRole('button', { name: '後手' }).click();
    await expect(firstRow).toContainText('3');
  });

  test('CSP 沒有因為新頁面而被違反', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) {
        violations.push(m.text());
      }
    });

    await gotoOdds(page);
    await setField(page, '牌組張數', 52);
    expect(violations).toEqual([]);
  });
});

test.describe('符文機率', () => {
  /** 組一副雙色符文的牌組，再去機率頁。 */
  async function buildTwoColourRuneDeck(page: Page) {
    await page.goto('/deck', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
    await page.getByRole('button', { name: /^匯入牌組/ }).click();
    await page
      .getByLabel('牌表內容')
      .fill(['【符文牌組】', '6 Fury Rune', '6 Calm Rune', '【主牌組】', '3 Cleave'].join('\n'));
    await page.getByRole('button', { name: '檢查' }).click();
    await page.getByRole('button', { name: /^匯入 \d+ 種卡$/ }).click();
    await page.getByRole('link', { name: '計算機率' }).click();
    await expect(page.locator('[data-odds-ready="true"]')).toBeAttached();
    await expect(page.getByRole('heading', { name: '各特性符文召出的機率' })).toBeVisible();
  }

  test('雙色 6/6，先手第 1 回合至少 1 張的機率是 77.3%', async ({ page }) => {
    await buildTwoColourRuneDeck(page);
    // 1 − C(6,2)/C(12,2) = 1 − 15/66 = 0.7727…
    const row = page.getByRole('row').filter({ hasText: '熾烈' });
    await expect(row).toContainText('77.3%');
  });

  test('第 6 回合符文召完，機率變成 100%', async ({ page }) => {
    await buildTwoColourRuneDeck(page);
    const row = page.getByRole('row').filter({ hasText: '熾烈' });
    await expect(row).toContainText('100%');
  });

  test('切到「至少 2 張」機率會下降', async ({ page }) => {
    await buildTwoColourRuneDeck(page);
    const row = page.getByRole('row').filter({ hasText: '熾烈' });
    await expect(row).toContainText('77.3%');

    await page.locator('#rune-wanted').selectOption('2');
    // 至少 2 張、第 1 回合只召 2 張 → C(6,2)/C(12,2) = 15/66 ≈ 22.7%
    await expect(row).toContainText('22.7%');
    await expect(row).not.toContainText('77.3%');
  });
});
