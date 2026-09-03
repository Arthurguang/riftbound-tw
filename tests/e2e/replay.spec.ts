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
async function controlsOf(page: Page, side: 'you' | 'opponent') {
  await openRail(page, side);
  return page.locator(`[data-testid="game-controls"][data-controls-side="${side}"]`);
}

async function battlefieldOf(page: Page, side: 'you' | 'opponent') {
  await openRail(page, side);
  return page.locator(`[data-testid="battlefield-zone"][data-controls-side="${side}"]`);
}

/**
 * 打開右側欄的某一個分頁。
 *
 * 側欄一次只展開一組（使用者反映「匯入牌組後右側列還是需要滾動」），
 * 所以要操作某一方的控制項之前，得先按那一方的分頁 ——
 * 這跟真人使用的順序一樣。
 */
async function openRail(page: Page, tab: 'turn' | 'card' | 'opponent' | 'you') {
  await page.locator(`[data-rail-tab="${tab}"]`).click();
}

/**
 * 重設成開局狀態。
 *
 * 這顆按鈕在「回合」那一組，而且**一次重設雙方** ——
 * 重設是整局的事，只重設一邊沒有意義。
 */
async function resetOpening(page: Page) {
  await openRail(page, 'turn');
  await page.getByTestId('reset-opening').click();
}

/** 回合那一組（開局設定、回合數、回合狀態）。 */
async function turnBox(page: Page) {
  await openRail(page, 'turn');
  return page.getByTestId('turn-control');
}

/**
 * 編輯面板 —— 匯入牌組、加卡、備牌、符文都在這裡。
 *
 * 盤面上的卡片磚也是 button 而且叫得出卡名，所以「加入某張卡」一定要
 * 指名編輯面板，否則會同時命中盤面上那張。
 */
/**
 * 打開某一方的編輯面板，並切到指定的區塊。
 *
 * 每一方的控制項又拆成四塊（牌組／加卡／符文／分析），一次只顯示一塊 ——
 * 使用者要求「加卡、機率、可打性各自獨立成一個區塊，按按鈕才跳出細節」。
 * 所以要操作哪一塊，就得先按那一塊的按鈕，跟真人使用的順序一樣。
 */
async function editOf(
  page: Page,
  side: 'you' | 'opponent',
  section: 'deck' | 'sideboard' | 'add' | 'runes' | 'analysis' = 'add',
) {
  await openRail(page, side);
  const panel = page.locator(`[data-edit-side="${side}"]`);
  await panel.locator(`[data-side-tab="${section}"]`).click();
  return panel;
}

/** 盤面上某一區的某張卡（卡片磚）。 */
const cardIn = (page: Page, side: 'you' | 'opponent', zone: string, name: string) =>
  zoneOf(page, side, zone).getByRole('button', { name: new RegExp(`${name}(\s|$|　|×)`) });

/** 點盤面上的卡，把它選進檢視面板。 */
async function inspect(page: Page, side: 'you' | 'opponent', zone: string, name: string) {
  await cardIn(page, side, zone, name).first().click();
  return page.getByTestId('card-inspector');
}

/** 在指定的一方匯入一副小牌組。 */
async function importDeck(page: Page, side: 'you' | 'opponent', lines: string[]) {
  const scope = await editOf(page, side, 'deck');
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
      const edit = await editOf(page, side);
      await edit.getByRole('button', { name: '戰一', exact: true }).click();
      await edit
        .getByRole('button', { name: side === 'you' ? '烈焰灼魂者' : '劈砍', exact: true })
        .click();
    }

    const bf = page.locator('[data-battlefield="0"]');
    await expect(
      bf.locator('[data-owner="opponent"]').getByRole('button', { name: /劈砍/ }),
    ).toHaveCount(1);
    await expect(
      bf.locator('[data-owner="you"]').getByRole('button', { name: /烈焰灼魂者/ }),
    ).toHaveCount(1);

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
      (await editOf(page, 'you', 'add')).getByPlaceholder('搜尋卡名或卡號…'),
    ).toBeVisible();
  });
});

/*
 * 回合是**雙方交替**的：先手打奇數回合、對手打偶數回合。
 * 所以推進一回合時，符文只加給**該回合的玩家** —— 這也是雙方符文
 * 張數本來就會不一樣的原因。
 *
 * ⚠️ 官方核心規則 PDF 是 CID 字型，中文抽不出可讀文字，這個編號慣例
 * 沒能從官方文件逐字查證，採用的是實體對局與各家模擬器的通行做法。
 */
/*
 * 符文是資源，每一張各自有活躍／休眠（414、415），所以牌桌上它是
 * **獨立的一塊、而且一張一張攤開** —— 疊成一張加數量角標就沒辦法指定
 * 「這三張橫著、那兩張直著」。
 */
/*
 * 搬移按鈕就長在卡片旁邊。
 *
 * 使用者反映「點了卡還要把滑鼠移到右側才能選搬到哪」很麻煩。
 * 每張卡都掛按鈕會把版面塞爆（卡圖只有 48px 寬），所以折衷成
 * 「選中的那張才在這一區底部長出一列」。
 */
/*
 * 衍生物（token）不在任何牌組裡 —— 它是靠卡牌效果生成的，
 * 例如 OGN-117 維克特：在對手回合打出卡時，額外打出一名「侍從」。
 *
 * 所以候選清單必須**永遠**列出衍生物，而且場上出現衍生物不該跳
 * 「不在這副牌組裡」的警告 —— 那完全是正常的局面。
 */
test.describe('衍生物', () => {
  test('候選清單一律列出衍生物，即使牌組裡沒有', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const add = await editOf(page, 'you', 'add');
    const tokens = add.locator('[data-token="true"]');
    // OGN 共四張衍生物：三種侍從加上精靈
    await expect(tokens).toHaveCount(4);
  });

  test('可以把衍生物放到場上，而且不會跳「不在牌組裡」', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const add = await editOf(page, 'you', 'add');
    await add.getByRole('button', { name: '基地', exact: true }).click();
    await add.locator('[data-token="true"]').first().click();

    await expect(zoneOf(page, 'you', 'base').locator('[data-card]')).toHaveCount(1);
    await expect(page.getByText(/不在這副牌組裡/)).toHaveCount(0);
  });
});

test.describe('在盤面上直接搬卡', () => {
  test('選中一張卡，這一區底部會長出搬移列', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const hand = zoneOf(page, 'you', 'hand');
    // 還沒選就沒有搬移列
    await expect(hand.getByTestId('zone-move-bar')).toHaveCount(0);

    await hand.locator('[data-card]').first().click();
    await expect(hand.getByTestId('zone-move-bar')).toBeVisible();
  });

  test('手牌可以直接送到放逐區', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const hand = zoneOf(page, 'you', 'hand');
    await hand.locator('[data-card]').first().click();
    await hand.getByTestId('zone-move-bar').getByRole('button', { name: '放逐區', exact: true }).click();

    await expect(cardIn(page, 'you', 'exile', '烈焰灼魂者')).toHaveCount(1);
    await expect(cardIn(page, 'you', 'hand', '烈焰灼魂者')).toHaveCount(0);
  });

  test('搬完之後選取跟著卡片走', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const hand = zoneOf(page, 'you', 'hand');
    await hand.locator('[data-card]').first().click();
    await hand.getByTestId('zone-move-bar').getByRole('button', { name: '廢牌堆', exact: true }).click();

    // 搬到廢牌堆之後，搬移列出現在廢牌堆那一區
    await expect(zoneOf(page, 'you', 'discard').getByTestId('zone-move-bar')).toBeVisible();
    await expect(hand.getByTestId('zone-move-bar')).toHaveCount(0);
  });
});

/*
 * 局間換牌在賽制上發生於匯入牌表之後、下一局開始之前（601.1.c），
 * 所以匯入完就主動問一次，換完再用新牌組重開。
 */
test.describe('局間換牌的流程', () => {
  test('匯入牌組後會問要不要換牌', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const prompt = page.getByTestId('sideboard-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('要局間換牌嗎');

    await prompt.getByRole('button', { name: '去換牌' }).click();
    await expect(
      page.locator('[data-edit-side="you"] [data-side-section="sideboard"]'),
    ).toBeVisible();
  });

  test('選「不換」就把提示收起來', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    await page.getByTestId('sideboard-prompt').getByRole('button', { name: '不換，直接開始' }).click();
    await expect(page.getByTestId('sideboard-prompt')).toHaveCount(0);
  });

  test('備牌那一塊有「換好了就重新開局」', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await importDeck(page, 'opponent', SMALL_DECK);

    // 兩方各有一顆，要指名是你那一組的
    const panel = await editOf(page, 'you', 'sideboard');
    await panel.getByTestId('restart-after-sideboard').click();

    // 重開之後雙方都回到開局：各四張手牌
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');
    await expect(sideOf(page, 'opponent').getByTestId('side-summary')).toContainText('手牌 4');
  });
});

test.describe('場上符文的區塊', () => {
  test('符文自成一塊，跟其他常駐物分開', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    await expect(page.locator('[data-side="you"] [data-testid="rune-row"]')).toBeVisible();
    await expect(zoneOf(page, 'you', 'base')).toContainText('基地');
  });

  test('符文一張一張攤開，不是疊成一張', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'runes')).getByRole('button', { name: '補到 2 張' }).click();

    // 兩張符文 = 兩個可以各自點的格子
    await expect(page.locator('[data-side="you"] [data-testid="rune-row"] [data-rune]')).toHaveCount(2);
  });

  test('點一下切換活躍與休眠（414、415）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'runes')).getByRole('button', { name: '補到 2 張' }).click();

    const row = page.locator('[data-side="you"] [data-testid="rune-row"]');
    const first = row.locator('[data-rune]').first();
    await expect(row.getByTestId('rune-active')).toHaveText('2');

    await first.click();
    await expect(row.getByTestId('rune-active')).toHaveText('1');
    await expect(row.locator('[data-rune][data-dormant="true"]')).toHaveCount(1);

    // 再點一次變回活躍
    await row.locator('[data-rune]').first().click();
    await expect(row.getByTestId('rune-active')).toHaveText('2');
  });

  test('點兩下放回牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you', 'runes')).getByRole('button', { name: '補到 2 張' }).click();

    const row = page.locator('[data-side="you"] [data-testid="rune-row"]');
    await expect(row.locator('[data-rune]')).toHaveCount(2);

    await row.locator('[data-rune]').first().dblclick();
    await expect(row.locator('[data-rune]')).toHaveCount(1);
  });
});

test.describe('回合數與先後手', () => {
  /** 從牌桌上的摘要讀某一方的活躍符文數（摘要永遠看得到，不受側欄分頁影響）。 */
  const runesOf = (page: Page, side: 'you' | 'opponent') =>
    page.locator(`[data-side="${side}"] [data-testid="side-summary"]`);

  test('重設成開局狀態會一次重設雙方，符文照先後手給（315.3.b、485.7）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await importDeck(page, 'opponent', SMALL_DECK);

    await resetOpening(page);

    // 雙方各抽四張（116）
    await expect(runesOf(page, 'you')).toContainText('手牌 4');
    await expect(runesOf(page, 'opponent')).toContainText('手牌 4');

    // 先手 2 張、後手 3 張
    await expect(runesOf(page, 'you')).toContainText('活躍符文 2');
    await expect(runesOf(page, 'opponent')).toContainText('活躍符文 3');
  });

  test('推進回合會抽牌（315.4.b），首次召符文已含在開局裡', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await importDeck(page, 'opponent', SMALL_DECK);
    await resetOpening(page);

    const turns = await turnBox(page);

    // 第 2 回合是對手自己的第一個回合 → 抽牌，但符文不再增加
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'opponent')).toContainText('手牌 5');
    await expect(runesOf(page, 'opponent')).toContainText('活躍符文 3');

    // 第 3 回合輪到你，是你的第二個回合 → 抽牌且加兩張符文
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'you')).toContainText('手牌 5');
    await expect(runesOf(page, 'you')).toContainText('活躍符文 4');
  });

  test('先後手跟回合數是分開的兩塊', async ({ page }) => {
    await gotoReplay(page);
    await openRail(page, 'turn');

    // 先後手決定一次就不會再動，所以獨立出來
    const setup = page.getByTestId('match-setup');
    await expect(setup.getByRole('button', { name: '先手' })).toBeVisible();
    await expect(setup).toContainText('決定後就不會再變');

    // 回合數是復盤時一直在調的
    const turns = await turnBox(page);
    await expect(turns.locator('#replay-turn')).toBeVisible();
    // 先後手不該混在回合那一塊裡
    await expect(turns.getByRole('button', { name: '先手' })).toHaveCount(0);
  });

  test('推進一回合，符文只加給該回合的玩家（315.3.b）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await importDeck(page, 'opponent', SMALL_DECK);

    const turns = await turnBox(page);
    await expect(runesOf(page, 'you')).toContainText('活躍符文 0');

    /*
     * 你是先手 → 第 2 回合是對手的，而那是**對手自己的第一個回合**。
     * 首次召出已經算在「重設成開局狀態」裡（先手 2、後手 3），
     * 所以推進到那一回合**只抽牌、不加符文** —— 這正是使用者說的
     * 「輪到對手，他有 3 個符文，但那一回合不會增加」。
     *
     * 這個測試沒有按重設，起點是 0，所以第 2 回合之後對手仍然是 0。
     */
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'opponent')).toContainText('活躍符文 0');
    await expect(runesOf(page, 'you')).toContainText('活躍符文 0');

    // 第 3 回合是你自己的第二個回合 → 這次會加兩張
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'you')).toContainText('活躍符文 2');
    await expect(runesOf(page, 'opponent')).toContainText('活躍符文 0');

    // 第 4 回合是對手的第二個回合 → 也加兩張
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'opponent')).toContainText('活躍符文 2');
    await expect(runesOf(page, 'you')).toContainText('活躍符文 2');
  });

  test('回合數決定輪到誰', async ({ page }) => {
    await gotoReplay(page);
    const turns = await turnBox(page);

    // 你是先手 → 第 1 回合是你的
    await expect(page.getByTestId('strip-you')).toContainText('回合方');

    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(page.getByTestId('strip-opponent')).toContainText('回合方');
    await expect(page.getByTestId('strip-you')).not.toContainText('回合方');
  });

  test('退回上一回合會把符文減回去', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const turns = await turnBox(page);
    // 第 2（對手）、第 3（你）→ 你有 2 張
    await turns.getByRole('button', { name: '下一回合' }).click();
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'you')).toContainText('活躍符文 2');

    // 退回第 2 回合 → 那 2 張是你在第 3 回合拿的，要收回去
    await turns.getByRole('button', { name: '上一回合' }).click();
    await expect(runesOf(page, 'you')).toContainText('活躍符文 0');
  });

  test('到符文牌組張數就不再增加', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await openRail(page, 'turn');

    // 直接跳到很後面的回合，雙方都會召滿 12 張
    await page.locator('#replay-turn').fill('40');
    await expect(runesOf(page, 'you')).toContainText('活躍符文 12');

    const turns = await turnBox(page);
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(runesOf(page, 'you')).toContainText('活躍符文 12');
  });
});

test.describe('卡片檢視面板', () => {
  test('點盤面上的卡會在檢視面板顯示大圖', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    // 還沒選任何卡時是提示文字
    await expect(page.getByTestId('card-inspector')).toContainText('點盤面上任何一張卡');

    const panel = await inspect(page, 'you', 'hand', '烈焰灼魂者');
    await expect(panel).toContainText('烈焰灼魂者');
    await expect(panel).toContainText('你的手牌');
    // 大圖來自官方卡圖 CDN
    await expect(panel.locator('img')).toHaveAttribute('src', /rgpub.io|playloltcg/);
  });

  test('檢視面板可以把卡搬到別的區域', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    const panel = await inspect(page, 'you', 'hand', '烈焰灼魂者');
    await panel.getByRole('button', { name: '廢牌堆', exact: true }).click();

    await expect(cardIn(page, 'you', 'discard', '烈焰灼魂者')).toHaveCount(1);
    await expect(cardIn(page, 'you', 'hand', '烈焰灼魂者')).toHaveCount(0);
  });

  test('關掉之後回到提示狀態', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    const panel = await inspect(page, 'you', 'hand', '烈焰灼魂者');
    await panel.getByRole('button', { name: '關閉' }).click();
    await expect(page.getByTestId('card-inspector')).toContainText('點盤面上任何一張卡');
  });
});

test.describe('對局復盤', () => {
  test('沒有牌組時提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect(
      await (await editOf(page, 'you', 'deck')).getByText(/先匯入這一方的牌組/),
    ).toBeVisible();
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
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 1');
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 5');
  });

  test('可以把卡從手牌搬到廢牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    const panel = await inspect(page, 'you', 'hand', '烈焰灼魂者');
    await panel.getByRole('button', { name: '廢牌堆', exact: true }).click();

    await expect(cardIn(page, 'you', 'discard', '烈焰灼魂者')).toHaveCount(1);
    // 搬動不影響牌堆總數
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 5');
  });

  test('擺超過牌組張數會被指出來，而不是安靜修正', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 牌組只有 3 張，按 4 次
    const add = (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true });
    for (let i = 0; i < 4; i += 1) await add.click();

    await expect(page.getByText(/盤面上有卡片超過牌組裡的張數/)).toBeVisible();
  });

  test('從當下牌堆算出的機率會隨盤面改變', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const section = (await editOf(page, 'you', 'analysis')).getByTestId('next-draw-odds');
    await expect(section).toBeVisible();

    // 牌堆 6 張、目標 3 張，抽 1 張 = 3/6 = 50%
    await expect(section).toContainText('50.0%');

    // 把 3 張都放進廢牌堆後，機率變 0
    const add = (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true });
    await (await editOf(page, 'you')).getByRole('button', { name: '廢牌堆', exact: true }).click();
    for (let i = 0; i < 3; i += 1) await add.click();

    await expect(
      (await editOf(page, 'you', 'analysis')).getByTestId('next-draw-odds'),
    ).not.toContainText('烈焰灼魂者');
  });

  test('基地上的符文決定手牌裡哪些付得起', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // Cleave 1 費、Blazing Scorcher 5 費，都放進手牌
    await (await editOf(page, 'you')).getByRole('button', { name: '劈砍', exact: true }).click();
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    await expect(hand).toBeVisible();

    // 還沒放符文 → 兩張都付不起
    await expect(hand).toContainText('基地上 0 張符文');

    // 放 2 張符文到基地
    await (await editOf(page, 'you')).getByRole('button', { name: '基地', exact: true }).click();
    const rune = (await editOf(page, 'you')).getByRole('button', { name: '狂怒符文', exact: true });
    await rune.click();
    await rune.click();

    await expect(
      (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand'),
    ).toContainText('基地上 2 張符文');
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
      await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();
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

  test('先後手會改變公式算出的應召符文張數', async ({ page }) => {
    await gotoReplay(page);
    const turns = await turnBox(page);

    // 先手第 1 回合 2 張（315.3.b）
    await expect(turns).toContainText(/應召出過\s*2\s*張/);

    await page.getByTestId('match-setup').getByRole('button', { name: '後手' }).click();
    /*
     * 改成後手之後第 1 回合就變成對手的 —— 你自己還沒打過任何回合，
     * 所以照公式應召出過 0 張。這正是「先後手會改變結果」要驗的事。
     */
    await expect(turns).toContainText(/應召出過\s*0\s*張/);
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

    const controls = (await controlsOf(page, 'you'));
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

    const runes = (await editOf(page, 'you', 'runes')).locator('[data-runes]');
    await expect(runes).toBeVisible();
    await expect(runes).toContainText('場上符文');
    await expect(runes).toContainText('107.1.c');
  });

  test('加減符文會改變可用資源', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const runesPanel = await editOf(page, 'you', 'runes');
    const total = runesPanel.getByTestId('rune-total');
    await expect(total).toHaveText('0');

    const plus = runesPanel.getByRole('button', { name: /^增加場上的/ });
    await plus.click();
    await plus.click();
    await expect(total).toHaveText('2');

    await runesPanel.getByRole('button', { name: /^減少場上的/ }).click();
    await expect(total).toHaveText('1');
  });

  test('一鍵補到該回合應有的張數', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    // 第 1 回合先手應召出 2 張（315.3.b）
    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('2');

    /*
     * 改到第 7 回合。回合是雙方交替的，你打奇數回合 ——
     * 到第 7 回合你自己打過 4 個回合，照公式應召出 8 張。
     */
    await openRail(page, 'turn');
    await page.locator('#replay-turn').fill('7');
    const you2 = await editOf(page, 'you', 'runes');
    await you2.getByRole('button', { name: '補到 8 張' }).click();
    await expect(you2.getByTestId('rune-total')).toHaveText('8');
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

    const zone = (await battlefieldOf(page, 'you'));
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
    await expect(
      await (await battlefieldOf(page, 'you')).getByText(/這一方的牌組裡還沒有戰場/),
    ).toBeVisible();
  });
});

test.describe('單位的位置（規則 198.1）', () => {
  test('單位可以從基地移到戰場', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    await (await editOf(page, 'you', 'add')).getByRole('button', { name: '基地', exact: true }).click();
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const panel = await inspect(page, 'you', 'base', '烈焰灼魂者');
    await panel.getByRole('button', { name: '戰場一', exact: true }).click();

    await expect(cardIn(page, 'you', 'bf0', '烈焰灼魂者')).toHaveCount(1);
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

    const zone = (await editOf(page, 'you', 'deck')).getByTestId('champion-zone');
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
    await expect(cardIn(page, 'you', 'champion', '凱莎')).toHaveCount(1);
  });

  test('可以取消選定英雄，那張卡就回到牌堆', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', [
      ...WITH_LEGEND.slice(0, 2),
      '【主牌組】',
      "3 Kai'Sa, Survivor",
    ]);
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 2');

    const select = (await editOf(page, 'you', 'deck')).getByTestId('champion-select');
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
      await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }),
    ).toBeVisible();
    await expect(
      await (await editOf(page, 'you')).getByRole('button', { name: '劈砍', exact: true }),
    ).toHaveCount(0);
  });

  test('可以把備牌換進主牌組，牌堆跟著變', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', WITH_SIDEBOARD);

    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 3');

    await (await editOf(page, 'you', 'sideboard'))
      .getByRole('button', { name: /^調整主牌組與備牌/ })
      .click();
    await (await editOf(page, 'you', 'sideboard'))
      .getByRole('button', { name: /把 劈砍 換進主牌組/ })
      .click();

    // 主牌組多一張 → 牌堆 4
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('牌堆 4');
    // 換進來之後就能在盤面上操作了
    await expect(
      await (await editOf(page, 'you')).getByRole('button', { name: '劈砍', exact: true }),
    ).toBeVisible();
  });
});

test.describe('直接選擇加到哪一區', () => {
  test('六個區域都能直接選，不用先加到基地再搬', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const scope = await editOf(page, 'you');
    for (const label of ['手牌', '基地', '戰一', '戰二', '廢牌堆', '放逐']) {
      await expect(scope.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // 直接加到戰場二
    await (await editOf(page, 'you')).getByRole('button', { name: '戰二', exact: true }).click();
    await (await editOf(page, 'you')).getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    await expect(cardIn(page, 'you', 'bf1', '烈焰灼魂者')).toHaveCount(1);
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

    // 符文與加卡分屬不同區塊，各自切過去
    await (await editOf(page, 'you', 'runes')).getByRole('button', { name: '補到 2 張' }).click();

    const add = await editOf(page, 'you', 'add');
    for (const name of ['劈砍', '勒索', '烈焰灼魂者']) {
      const button = add.getByRole('button', { name, exact: true });
      if (await button.count()) await button.click();
    }
  }

  test('四種狀態切換得到，並顯示對應條號', async ({ page }) => {
    await gotoReplay(page);

    await openRail(page, 'turn');
    const label = page.getByTestId('turn-state-label');
    await expect(label).toHaveText('普通開環');
    await expect(page.getByTestId('turn-state')).toContainText('310.1');

    await openRail(page, 'turn');
    await page.getByLabel(/結算鏈上有東西/).check();
    await expect(label).toHaveText('普通閉環');
    await expect(page.getByTestId('turn-state')).toContainText('309.1.a');

    await page.getByLabel(/結算鏈上有東西/).uncheck();
    await openRail(page, 'turn');
    await page.getByLabel(/正在法術對決或戰鬥中/).check();
    await expect(label).toHaveText('法術對決開環');
    await expect(page.getByTestId('turn-state')).toContainText('308.1.a');

    await openRail(page, 'turn');
    await page.getByLabel(/結算鏈上有東西/).check();
    await expect(label).toHaveText('法術對決閉環');
  });

  test('普通開環：你的回合什麼都打得出來', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    await expect(hand).toBeVisible();
    // 三張都是「時機可」
    await expect(hand.getByText('時機不可')).toHaveCount(0);
  });

  test('法術對決：沒有迅捷或反應的卡打不出來（308.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await openRail(page, 'turn');
    await page.getByLabel(/正在法術對決或戰鬥中/).check();

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    // 烈焰灼魂者兩個關鍵字都沒有 → 時機不可
    await expect(hand.getByText('時機不可')).toHaveCount(1);
    // 迅捷與反應那兩張還是可以
    await expect(hand.getByText('時機可')).toHaveCount(2);
  });

  test('閉環：只剩反應（309.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await openRail(page, 'turn');
    await page.getByLabel(/結算鏈上有東西/).check();

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    // 只有帶反應的那一張可以
    await expect(hand.getByText('時機可')).toHaveCount(1);
    await expect(hand.getByText('時機不可')).toHaveCount(2);
  });

  test('不是你的回合時，只有反應打得出來（310.1.a）', async ({ page }) => {
    await gotoReplay(page);
    await setUpHand(page);
    await openRail(page, 'turn');
    await page.getByRole('button', { name: '對手的回合' }).click();

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    await expect(hand.getByText('時機可')).toHaveCount(1);
  });

  test('時機與資源分開顯示 —— 打不出來的原因不同', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', TIMING_DECK);

    // 不補符文，把 5 費的烈焰灼魂者放進手牌
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '烈焰灼魂者', exact: true })
      .click();

    const hand = (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand');
    // 普通開環 → 時機可，但沒有符文 → 資源不足
    await expect(hand).toContainText('時機可');
    await expect(hand).toContainText('資源差');
  });

  test('回合狀態會編進網址', async ({ page }) => {
    await gotoReplay(page);

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await openRail(page, 'turn');
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

    const you = await editOf(page, 'you', 'add');
    await you.getByRole('button', { name: '基地', exact: true }).click();
    await you.getByRole('button', { name: '烈焰灼魂者', exact: true }).click();

    /*
     * 休眠現在用「把卡打橫」表示（414.1 在實體對局就是這樣），
     * 不再是一個寫著「休眠」的徽章 —— 所以查的是卡片自己標的狀態。
     */
    await expect(cardIn(page, 'you', 'base', '烈焰灼魂者')).toHaveAttribute('data-dormant', '1');
  });

  test('符文加到場上預設是活躍（430.2.a）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();

    // 兩張都活躍 → 可用資源 2
    await expect(you.getByTestId('rune-total')).toHaveText('2');
    await expect(you.locator('[data-runes]')).toContainText('全活躍');
  });

  test('休眠的符文不算可用資源（164.2.a、414.1）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('2');

    // 切一張進休眠
    await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('1');
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('活躍符文 1');
  });

  test('全部喚醒會把所有東西變回活躍（415.3.a）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('1');

    await page.locator('[data-side="you"]').getByRole('button', { name: '全部喚醒' }).click();
    await expect(you.getByTestId('rune-total')).toHaveText('2');
  });

  test('休眠影響手牌能不能打出 —— 資源少了', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    // 劈砍 1 費，兩張活躍符文夠付
    await (await editOf(page, 'you', 'add'))
      .getByRole('button', { name: '劈砍', exact: true })
      .click();
    await expect(
      (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand'),
    ).toContainText('資源夠');

    // 把兩張符文都休眠 → 付不起（切過別的區塊，要回到符文那一塊）
    const runesPanel = await editOf(page, 'you', 'runes');
    const toggle = runesPanel.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ });
    await toggle.click();
    await toggle.click();
    await expect(
      (await editOf(page, 'you', 'analysis')).getByTestId('playable-hand'),
    ).toContainText('資源差');
  });

  test('休眠狀態會編進網址', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', SMALL_DECK);

    const you = await editOf(page, 'you', 'runes');
    await you.getByRole('button', { name: '補到 2 張' }).click();
    // 先確認前置狀態到位，再做下一步 —— 否則可能點在還沒更新的畫面上
    await expect(you.getByTestId('rune-total')).toHaveText('2');

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await you.getByRole('button', { name: /^切換 狂怒符文 的休眠張數/ }).click();
      await expect(you.getByTestId('rune-total')).toHaveText('1');
    });

    await page.goto(shared, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
    await expect((await editOf(page, 'you', 'runes')).getByTestId('rune-total')).toHaveText('1');
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

    await resetOpening(page);

    // 主牌組 9 張 − 英雄區域 1 張 − 手牌 4 張 = 牌堆 4 張
    const summary = sideOf(page, 'you').getByTestId('side-summary');
    await expect(summary).toContainText('手牌 4');
    await expect(summary).toContainText('牌堆 4');
  });

  test('抽一張會從牌堆移到手牌（315.4.b）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);
    await resetOpening(page);

    await (await controlsOf(page, 'you')).getByRole('button', { name: '抽一張' }).click();

    const summary = sideOf(page, 'you').getByTestId('side-summary');
    await expect(summary).toContainText('手牌 5');
    await expect(summary).toContainText('牌堆 3');
  });

  /*
   * 「推進 X 一個回合」那顆按鈕拿掉了 —— 回合是雙方交替的，一顆掛在
   * 某一方底下的按鈕會讓人以為推進之後還是同一個人的回合。
   * 推進回合改由回合數那一組負責，符文只加給該回合的玩家。
   */
  test('推進回合會給該回合的玩家召符文', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);
    await resetOpening(page);

    // 重設會照規則把符文設好：先手第 1 回合 2 張（315.3.b）
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('活躍符文 2');

    const turns = await turnBox(page);
    // 第 2 回合是對手的，你不會再拿到符文
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('活躍符文 2');

    // 第 3 回合回到你 → 再召兩張，共 4 張
    await turns.getByRole('button', { name: '下一回合' }).click();
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('活躍符文 4');
  });

  test('手牌調度換掉的張數等於補回的張數（117）', async ({ page }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);

    await resetOpening(page);
    const controls = await controlsOf(page, 'you');
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');

    // 選一張換掉
    await controls.getByRole('button', { name: /^(凱莎|烈焰灼魂者|劈砍)/ }).first().click();
    await controls.getByRole('button', { name: /^換掉這 1 張$/ }).click();

    // 手牌張數不變 —— 換一張補一張
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 4');
  });

  test('沒有牌組時提示要先匯入', async ({ page }) => {
    await gotoReplay(page);
    await expect((await controlsOf(page, 'you'))).toContainText('先匯入 你 的牌組');
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
    await expect(await controlsOf(page, 'you')).toContainText('先匯入 你 的牌組');

    // 對手那一組可以直接抽牌，不必先切到你那一組
    await (await controlsOf(page, 'opponent')).getByRole('button', { name: '抽一張' }).click();

    await expect(sideOf(page, 'opponent').getByTestId('side-summary')).toContainText('手牌 1');
    // 你這方沒被動到
    await expect(sideOf(page, 'you').getByTestId('side-summary')).toContainText('手牌 0');
  });

  /*
   * 控制項現在全部在右側欄，桌子固定不動（使用者反映「要一直捲滾輪太麻煩」）。
   * 分組的意圖沒變，只是從「桌子上下」改成「側欄裡上下」——
   * 這條測試守的是**每一方的控制項各自成組、對手在前**，不是它們的絕對位置。
   */
  test('每一方的控制項各自成組，且都在右側欄裡', async ({ page }) => {
    await gotoReplay(page);

    const rail = page.getByTestId('board-rail');
    await expect(rail.locator('[data-block-side="opponent"]')).toHaveCount(1);
    await expect(rail.locator('[data-block-side="you"]')).toHaveCount(1);

    /*
     * 側欄一次只展開一組 —— 按哪個分頁才顯示哪一組。
     * 這正是使用者要的：「直接把右側的欄位變成一系列的按鈕，
     * 按下按鈕才跳出要調整的細節」。
     */
    await openRail(page, 'opponent');
    await expect(rail.locator('[data-rail-content="opponent"]')).toBeVisible();
    await expect(rail.locator('[data-rail-content="you"]')).toBeHidden();

    await openRail(page, 'you');
    await expect(rail.locator('[data-rail-content="you"]')).toBeVisible();
    await expect(rail.locator('[data-rail-content="opponent"]')).toBeHidden();

    // 戰場選擇與匯入各自跟著自己那一組
    await expect((await battlefieldOf(page, 'opponent'))).toHaveCount(1);
    await expect((await battlefieldOf(page, 'you'))).toHaveCount(1);
    // 逐一開啟才數得到 —— 收起來的那組對輔助技術是隱藏的
    for (const side of ['opponent', 'you'] as const) {
      await editOf(page, side, 'deck');
      await expect(
        page.locator(`[data-block-side="${side}"]`).getByRole('button', { name: /^匯入牌組/ }),
      ).toHaveCount(1);
    }
  });

  /*
   * 使用者的原話：「要一直用滑鼠滾輪滾動來檢視，這樣太麻煩」。
   * 桌子必須在一個畫面裡看完 —— 這條測試就是釘住這件事。
   */
  test('整張桌子在一個畫面裡看得完，不用捲', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await gotoReplay(page);

    const table = await page.getByTestId('board-table').boundingBox();
    expect(table!.y + table!.height).toBeLessThanOrEqual(800);

    // 三段都在：對手、戰場、你
    await expect(page.getByTestId('strip-opponent')).toBeVisible();
    await expect(page.getByTestId('battlefield-row')).toBeVisible();
    await expect(page.getByTestId('strip-you')).toBeVisible();
  });

  test('打完的盤面照樣能分享', async ({ page, context }) => {
    await gotoReplay(page);
    await importDeck(page, 'you', PLAYABLE);

    const shared = await shareUrl(page, 'data-board-code', 'b', async () => {
      await resetOpening(page);
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
