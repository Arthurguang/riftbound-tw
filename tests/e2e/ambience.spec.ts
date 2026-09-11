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

/*
 * Windows 上的 Playwright WebKit 沒有 Web Audio（真的 Safari 有）。
 * 需要真的發出聲音的測試在那裡跳過；「不支援時要停用並說明」另有一條測試涵蓋。
 */
const hasWebAudio = (page: Page) =>
  page.evaluate(
    () =>
      typeof window.AudioContext === 'function' ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === 'function',
  );
const NO_WEB_AUDIO = '這個測試瀏覽器沒有 Web Audio（Windows 上的 Playwright WebKit）';

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

  /*
   * 2026-09-11 實測：WebKit 每次更新畫面都會重畫整片固定背景，復盤頁的操作被拖慢 2 倍多，
   * CI 的 WebKit 因此逾時。復盤的牌桌本來就蓋滿畫面，所以復盤頁不放背景。
   */
  test('對局復盤頁不放背景；換回其他頁面背景會回來', async ({ page }) => {
    await page.goto('/replay', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect(backdrop(page)).toHaveCount(0);
    await expect(page.getByTestId('nebula-backdrop')).toHaveCount(0);

    await page.locator('header').getByRole('link', { name: '卡牌圖鑑', exact: true }).click();
    await page.waitForURL(/\/cards$/);
    await expect(backdrop(page)).toHaveCount(1);
    await expect(page.getByTestId('nebula-backdrop')).toHaveCount(1);
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

  test('試看用的風格切換已經拿掉（使用者選定了戰火餘燼）', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(controls(page).locator('[data-variant]')).toHaveCount(0);
    await expect(controls(page).getByRole('button')).toHaveCount(2);
  });
});

test.describe('背景音樂', () => {
  test('預設關閉 —— 不做任何形式的自動播放', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('按下才開始，再按一次就停', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    test.skip(!(await hasWebAudio(page)), NO_WEB_AUDIO);
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('站內換頁時音樂不會中斷', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    test.skip(!(await hasWebAudio(page)), NO_WEB_AUDIO);
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');

    await page.locator('header').getByRole('link', { name: '卡牌圖鑑', exact: true }).click();
    await page.waitForURL(/\/cards$/);
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('重新整理後回到靜音 —— 音樂開關不會被記住', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    test.skip(!(await hasWebAudio(page)), NO_WEB_AUDIO);
    await musicButton(page).click();
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(musicButton(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('瀏覽器不支援時，按鈕停用並說明原因，不會按了沒反應', async ({ page }) => {
    await page.addInitScript(() => {
      // 模擬一個沒有 Web Audio 的瀏覽器
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(musicButton(page)).toBeDisabled();
    await expect(musicButton(page)).toHaveAttribute('title', /不支援/);
  });
});
