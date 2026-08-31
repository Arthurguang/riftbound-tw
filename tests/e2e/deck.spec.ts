import { readFile, stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { urlAfter } from './url-assert';

/**
 * 牌組編輯器的端對端驗證。
 *
 * 除了功能本身，這裡也順帶驗證兩件資安相關的事：
 *   · 收藏功能真的只寫進 localStorage，不會發出任何網路請求
 *   · 惡意網址不會讓頁面壞掉或注入內容
 */

/** 等到元件掛載完成再操作 —— 否則會在 hydration 前就點下去。 */
async function gotoDeck(page: Page, query = '') {
  await page.goto(`/deck${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
}

/** 切到某個區域分頁。 */
async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
}

test.describe('牌組編輯器', () => {
  test('開啟時是空牌組，並列出所有待處理項目', async ({ page }) => {
    await gotoDeck(page);
    await expect(page.getByRole('heading', { name: '牌組編輯器', level: 1 })).toBeVisible();

    const legality = page.getByTestId('deck-legality');
    await expect(legality).toContainText('尚未完成');
    // 每一條都要附官方條號
    await expect(legality).toContainText('103.2');
    await expect(legality).toContainText('485.4.a');
  });

  test('選傳奇後，主牌組只顯示特性相符的卡', async ({ page }) => {
    await gotoDeck(page);

    await page.getByRole('button', { name: '選為傳奇' }).first().click();
    await expect(page.getByRole('button', { name: '已選為傳奇' })).toBeVisible();

    await openTab(page, '主牌組');
    const filterLabel = page.getByText('只顯示符合');
    await expect(filterLabel).toBeVisible();

    const list = page.getByTestId('picker-list').locator('> li');
    const filteredCount = await list.count();

    // 取消篩選後應該看到更多卡 —— 證明篩選確實有作用
    await page.getByLabel(/^只顯示符合/).uncheck();
    const allCount = await list.count();
    expect(allCount).toBeGreaterThan(filteredCount);
  });

  test('加入卡片會反映到牌組與網址', async ({ page }) => {
    await gotoDeck(page);
    await openTab(page, '符文');

    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();

    // 牌組面板顯示張數
    await expect(page.getByRole('heading', { name: /符文牌組\s*2/ })).toBeVisible();
    // 網址帶上編碼。要等它真的帶到 2 張才重整 ——
    // router.replace 是非同步的，太早重整會讀到只有 1 張的舊網址。
    await expect(page).toHaveURL(/[?&]d=2%7C/); // 格式版本 2（含備牌）
    await expect(page).toHaveURL(/x2/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
    await expect(page.getByRole('heading', { name: /符文牌組\s*2/ })).toBeVisible();
  });

  test('清空會把牌組與網址一起還原', async ({ page }) => {
    await gotoDeck(page);
    await openTab(page, '戰場');
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await expect(page).toHaveURL(/[?&]d=/);

    await page.getByRole('button', { name: '清空' }).click();
    await expect(page).toHaveURL(/\/deck$/);
  });

  test('分享網址可以還原同一副牌組', async ({ page, context }) => {
    await gotoDeck(page);
    await openTab(page, '符文');

    const shared = await urlAfter(page, async () => {
      await page.getByRole('button', { name: /^加入牌組/ }).first().click();
      await expect(page).toHaveURL(/[?&]d=/);
    });

    // 用另一個分頁開同一個網址 —— 模擬別人收到連結
    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-deck-ready="true"]')).toBeAttached();
    await expect(other.getByRole('heading', { name: /符文牌組\s*1/ })).toBeVisible();
    await other.close();
  });

  test('惡意網址被安全丟棄，頁面照常運作', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoDeck(
      page,
      `?d=${encodeURIComponent("1|<script>alert(1)</script>|__proto__|evil999x99|'; DROP TABLE--|")}`,
    );

    // 頁面正常，牌組為空，並且明白告訴使用者有東西被略過
    await expect(page.getByRole('heading', { name: '牌組編輯器', level: 1 })).toBeVisible();
    await expect(page.getByText(/無法辨識的內容已被略過/)).toBeVisible();
    await expect(page.getByTestId('deck-legality')).toContainText('尚未完成');
    expect(errors).toEqual([]);
  });

  test('收藏功能不會送出任何網路請求', async ({ page }) => {
    await gotoDeck(page);

    // 記下所有非靜態資源的請求
    const posts: string[] = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) posts.push(req.url());
    });

    await page.getByLabel('開啟').check();
    await openTab(page, '符文');
    await page.getByRole('button', { name: /^增加擁有張數/ }).first().click();

    await expect(page.getByText(/已標記 1 種卡/)).toBeVisible();
    expect(posts).toEqual([]);
  });

  test('收藏會留在瀏覽器，重新整理後還在', async ({ page }) => {
    await gotoDeck(page);
    await page.getByLabel('開啟').check();
    await openTab(page, '符文');
    await page.getByRole('button', { name: /^增加擁有張數/ }).first().click();
    await expect(page.getByText(/已標記 1 種卡/)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
    await expect(page.getByText(/已標記 1 種卡/)).toBeVisible();
  });

  test('缺卡清單會算出還差幾張', async ({ page }) => {
    await gotoDeck(page);
    await page.getByLabel('開啟').check();

    await openTab(page, '符文');
    // 牌組放 2 張，手上只有 1 張 → 缺 1 張
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^增加擁有張數/ }).first().click();

    // 列印用的隱藏版面也有同樣的文字，所以要指名畫面上的那個面板
    const panel = page.getByTestId('deck-missing');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('共缺 1 張');
  });

  test('匯出的檔案真的有內容', async ({ page }, testInfo) => {
    // Firefox 的下載處理在 CI 容器裡不穩定，這裡只在 Chromium/WebKit 驗
    test.skip(testInfo.project.name === 'firefox', 'Firefox 下載行為不穩定');

    await gotoDeck(page);
    await openTab(page, '符文');
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();

    // PNG：畫布輸出。空白圖片會小得離譜，用大小當作「有畫東西」的下限。
    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下載圖片' }).click(),
    ]);
    expect(png.suggestedFilename()).toMatch(/.png$/);
    const pngPath = await png.path();
    expect(pngPath).toBeTruthy();
    expect((await stat(pngPath!)).size).toBeGreaterThan(3000);

    // CSV：必須有 BOM，否則 Excel 開中文會亂碼
    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下載 CSV' }).click(),
    ]);
    const content = await readFile((await csv.path())!, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain('卡號');
    // 沒開收藏就不該多出欄位
    expect(content).not.toContain('還缺');
  });

  test('開啟收藏後，同一份匯出檔案裡就看得到缺卡', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'firefox', 'Firefox 下載行為不穩定');

    await gotoDeck(page);
    await page.getByLabel('開啟').check();
    await openTab(page, '符文');

    // 牌組放 2 張，手上只有 1 張
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();
    await page.getByRole('button', { name: /^增加擁有張數/ }).first().click();
    await expect(page.getByTestId('deck-missing')).toContainText('共缺 1 張');

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下載 CSV' }).click(),
    ]);
    const content = await readFile((await csv.path())!, 'utf8');

    // 牌表與缺卡在同一份檔案裡
    const lines = content.split(String.fromCharCode(13) + String.fromCharCode(10));
    expect(lines[0]).toContain('擁有');
    expect(lines[0]).toContain('還缺');
    expect(lines[1]).toMatch(/,1,1$/); // 擁有 1、還缺 1
    expect(lines.filter((l) => l.trim() === '')).toEqual([]);
  });

  test('列印版面只印牌表，不會多出空白頁', async ({ page }, testInfo) => {
    // page.pdf() 只有 Chromium 支援
    test.skip(testInfo.project.name !== 'chromium', 'page.pdf() 僅 Chromium 支援');

    await gotoDeck(page);
    await openTab(page, '符文');
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();

    const pdf = await page.pdf({ format: 'A4' });
    const text = pdf.toString('latin1');
    const pages = text.match(/\/Type\s*\/Page[^s]/g) ?? [];

    // 列印版面若留在頁面深處只用 visibility 隱藏，會佔著版面高度印出好幾張空白紙
    expect(pages).toHaveLength(1);

    // 列印版面是用 portal 掛在 body 底下的
    const isDirectChild = await page.evaluate(
      () => document.getElementById('deck-print')?.parentElement === document.body,
    );
    expect(isDirectChild).toBe(true);
  });

  test('CSP 沒有因為新頁面而被違反', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) {
        violations.push(m.text());
      }
    });

    await gotoDeck(page);
    await openTab(page, '主牌組');
    await page.getByRole('button', { name: /^加入牌組/ }).first().click();

    expect(violations).toEqual([]);
  });
});

test.describe('匯入牌組', () => {
  test('貼上牌表就能產生牌組', async ({ page }) => {
    await gotoDeck(page);
    await page.getByRole('button', { name: /^匯入牌組/ }).click();

    const box = page.getByLabel('牌表內容');
    await box.fill(['我的測試牌組', '', '【符文牌組】', '12 Fury Rune'].join('\n'));

    await page.getByRole('button', { name: '檢查' }).click();
    await expect(page.getByTestId('import-result')).toContainText('認出 1 種卡');
    await expect(page.getByTestId('import-result')).toContainText('我的測試牌組');

    await page.getByRole('button', { name: /^匯入 1 種卡$/ }).click();

    await expect(page.getByRole('heading', { name: /符文牌組\s*12/ })).toBeVisible();
    // 牌組名稱也一起帶進來
    await expect(page.getByLabel('牌組名稱')).toHaveValue('我的測試牌組');
    // 網址跟著更新，可以直接去算機率
    await expect(page).toHaveURL(/[?&]d=2%7C/);
  });

  test('認不得的行會列出來，不會安靜吞掉', async ({ page }) => {
    await gotoDeck(page);
    await page.getByRole('button', { name: /^匯入牌組/ }).click();

    await page.getByLabel('牌表內容').fill(['12 Fury Rune', '3 這張卡不存在'].join('\n'));
    await page.getByRole('button', { name: '檢查' }).click();

    const result = page.getByTestId('import-result');
    await expect(result).toContainText('認出 1 種卡');
    await expect(result).toContainText('有 1 行無法辨識');
    await expect(result).toContainText('這張卡不存在');
  });

  test('貼上惡意內容不會產生任何卡片，也不會讓頁面壞掉', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoDeck(page);
    await page.getByRole('button', { name: /^匯入牌組/ }).click();
    await page
      .getByLabel('牌表內容')
      .fill(['<script>alert(1)</script>', '3 __proto__', '3 constructor'].join('\n'));
    await page.getByRole('button', { name: '檢查' }).click();

    await expect(page.getByTestId('import-result')).toContainText('沒有認出任何卡牌');
    expect(errors).toEqual([]);
  });
});

test.describe('備牌區', () => {
  test('可以把主牌組的卡加進備牌', async ({ page }) => {
    await gotoDeck(page);
    await openTab(page, '主牌組');

    await page.getByRole('button', { name: /^加入備牌/ }).first().click();
    await page.getByRole('button', { name: /^加入備牌/ }).first().click();

    await expect(page.getByRole('heading', { name: /備牌\s*2/ })).toBeVisible();
    await expect(page).toHaveURL(/[?&]d=2%7C/);
  });

  test('備牌會編進分享網址', async ({ page, context }) => {
    await gotoDeck(page);
    await openTab(page, '主牌組');
    const shared = await urlAfter(page, async () => {
      await page.getByRole('button', { name: /^加入備牌/ }).first().click();
      await expect(page).toHaveURL(/[?&]d=/);
    });

    const other = await context.newPage();
    await other.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('[data-deck-ready="true"]')).toBeAttached();
    await expect(other.getByRole('heading', { name: /備牌\s*1/ })).toBeVisible();
    await other.close();
  });

  test('同名卡主牌組加備牌超過 3 張會被提醒（601.1.c.3）', async ({ page }) => {
    await gotoDeck(page);
    await openTab(page, '主牌組');

    // 主牌組放 3 張
    const add = page.getByRole('button', { name: /^加入牌組/ }).first();
    for (let i = 0; i < 3; i += 1) await add.click();
    // 備牌再放 1 張 → 合計 4 張
    await page.getByRole('button', { name: /^加入備牌/ }).first().click();

    await expect(page.getByTestId('deck-legality')).toContainText('103.2.b');
    await expect(page.getByTestId('deck-legality')).toContainText('含選定英雄與備牌');
  });
});
