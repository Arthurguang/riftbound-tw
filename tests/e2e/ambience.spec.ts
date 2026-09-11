import { expect, test, type Page } from '@playwright/test';

/**
 * 背景動畫與音樂。
 *
 * 2026-09-11 查的研究與規範，全部寫成測試釘住：
 *   · 自動播放聲音讓人反感、瀏覽器也會擋；WCAG 1.4.2 → 音樂預設關閉，按了才播、隨時能停
 *   · WCAG 2.2.2 → 動畫能暫停；有人對畫面晃動會頭暈 → 尊重「減少動態效果」
 *   · 會動的東西會搶注意力（NN/g）→ 工具頁比較淡，而且畫布點不到、不擋任何按鈕
 */

const backdrop = (page: Page) => page.locator('canvas.battle-backdrop');
const controls = (page: Page) => page.getByTestId('ambience-controls');
const musicButton = (page: Page) => controls(page).getByRole('button', { name: '背景音樂' });
const pauseButton = (page: Page) => controls(page).getByRole('button', { name: '暫停背景動畫' });

test.describe('背景動畫', () => {
  test('首頁有背景動畫，預設就在動，而且是完整濃度', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(backdrop(page)).toHaveAttribute('data-motion', 'running');
    await expect(backdrop(page)).toHaveAttribute('data-intensity', '1');
  });

  test('工具頁的動畫比較淡', async ({ page }) => {
    await page.goto('/cards', { waitUntil: 'domcontentloaded' });
    await expect(backdrop(page)).toHaveAttribute('data-motion', 'running');
    const intensity = Number(await backdrop(page).getAttribute('data-intensity'));
    expect(intensity).toBeLessThan(1);
  });

  test('畫布點不到，不會擋住任何按鈕', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const pointerEvents = await backdrop(page).evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');
  });

  test('可以暫停，而且重新整理後仍然記得', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await pauseButton(page).click();
    await expect(pauseButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(backdrop(page)).toHaveAttribute('data-motion', 'still');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(pauseButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(backdrop(page)).toHaveAttribute('data-motion', 'still');
  });

  test('系統設定「減少動態效果」時，動畫保持靜止', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(backdrop(page)).toHaveAttribute('data-motion', 'still');
  });

  test('可以切換三種動畫風格（試看）', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    for (const variant of ['runes', 'mixed', 'embers']) {
      await controls(page).locator(`[data-variant="${variant}"]`).click();
      await expect(backdrop(page)).toHaveAttribute('data-backdrop', variant);
    }
  });
});

test.describe('背景音樂', () => {
  test('預設關閉 —— 不做任何形式的自動播放', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('按下才開始，再按一次就停', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('站內換頁時音樂不會中斷', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');

    await page.locator('header').getByRole('link', { name: '卡牌圖鑑', exact: true }).click();
    await page.waitForURL(/\/cards$/);
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('重新整理後回到靜音 —— 音樂開關不會被記住', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });
});
