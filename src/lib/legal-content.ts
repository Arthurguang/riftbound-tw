/**
 * 使用條款與隱私權政策的內容。
 *
 * ── 為什麼要有這兩頁 ────────────────────────────────────────────
 * Riot 開發者入口網站的常見問答寫明：審核申請時要能「看到網站、
 * 查看使用條款（Terms of Service）與隱私權政策（Privacy Policy）」。
 * 本站沒有收集任何個人資料，但「沒有收集」這件事本身也要寫清楚。
 *
 * ── 寫的原則：每一句都要跟程式碼對得上 ─────────────────────────
 * 隱私權政策最常見的問題是「寫得很漂亮，但跟實際行為不符」。
 * 這裡列的每一項儲存都查過原始碼（2026-09-19）：
 *   localStorage   背景動畫／音樂偏好（lib/ambience.ts）、收藏紀錄與開關（lib/collection.ts）
 *   sessionStorage 牌組編輯器與復盤盤面（lib/session-state.ts）、圖鑑捲動位置（lib/gallery-scroll.ts）
 *   cookie         無（tests/e2e/security.spec.ts 有測試釘住）
 *   第三方請求     無（同上，「零第三方請求」測試）
 * 日後加了任何儲存或外部服務，這裡要跟著改 —— 否則政策就變成假的。
 *
 * ⚠️ 這兩份不是律師寫的。它們誠實描述本站實際做了什麼，但不是法律意見。
 */

import type { TextLang } from './i18n';

type Tri = Record<TextLang, string>;

export type LegalSection = {
  heading: Tri;
  /** 每一段一個元素。 */
  body: Tri[];
};

export type LegalDoc = {
  title: Tri;
  intro: Tri;
  sections: LegalSection[];
};

/** 最後更新日期。內容有實質變動時要改這裡。 */
export const LEGAL_UPDATED = '2026-09-19';

export const LEGAL_STRINGS = {
  updated: {
    'zh-TW': '最後更新',
    'zh-CN': '最后更新',
    en: 'Last updated',
  },
  contactTitle: {
    'zh-TW': '聯絡我們',
    'zh-CN': '联系我们',
    en: 'Contact',
  },
  contactLink: {
    'zh-TW': '到 GitHub Issues 留言',
    'zh-CN': '到 GitHub Issues 留言',
    en: 'Open an issue on GitHub',
  },
  terms: { 'zh-TW': '使用條款', 'zh-CN': '使用条款', en: 'Terms of Service' },
  privacy: { 'zh-TW': '隱私權政策', 'zh-CN': '隐私政策', en: 'Privacy Policy' },
} as const satisfies Record<string, Tri>;

const t = (zhTW: string, zhCN: string, en: string): Tri => ({ 'zh-TW': zhTW, 'zh-CN': zhCN, en });

/** 聯絡段落（兩份文件共用）。連結由頁面另外畫，這裡只放說明文字。 */
const CONTACT_BODY: Tri[] = [
  t(
    '本站透過 GitHub Issues 聯絡。Issues 是公開的，任何人都看得到，請不要在上面留下電子郵件、電話或其他個人資料。',
    '本站通过 GitHub Issues 联系。Issues 是公开的，任何人都看得到，请不要在上面留下电子邮件、电话或其他个人资料。',
    'We can be reached through GitHub Issues. Issues are public, so please do not post your email address, phone number, or any other personal information there.',
  ),
  t(
    'Riot Games 或其他權利人若希望本站修改或移除任何內容，也請透過同一個管道提出，我們會盡快處理。',
    'Riot Games 或其他权利人若希望本站修改或移除任何内容，也请通过同一个渠道提出，我们会尽快处理。',
    'If Riot Games or any other rights holder would like us to change or remove any content, please use the same channel and we will act on it promptly.',
  ),
];

export const TERMS: LegalDoc = {
  title: LEGAL_STRINGS.terms,
  intro: t(
    '使用守夜圖鑑（Ashvigil，以下稱「本站」）即表示你同意以下條款。',
    '使用守夜图鉴（Ashvigil，以下称“本站”）即表示你同意以下条款。',
    'By using Ashvigil (守夜圖鑑, "the site"), you agree to the following terms.',
  ),
  sections: [
    {
      heading: t('本站是什麼', '本站是什么', 'What this site is'),
      body: [
        t(
          '本站是《符文戰場》（Riftbound）的非商業同人專案，提供卡牌圖鑑、規則說明、牌組編輯器、抽牌機率計算與對局復盤工具，服務繁體中文玩家。',
          '本站是《符文战场》（Riftbound）的非商业同人项目，提供卡牌图鉴、规则说明、卡组编辑器、抽牌概率计算与对局复盘工具，服务繁体中文玩家。',
          'Ashvigil is a non-commercial fan project for Riftbound, the trading card game by Riot Games. It offers a card library, rules explanations, a deck builder, a draw-odds calculator, and a replay board, for Traditional Chinese-speaking players.',
        ),
        t(
          '本站依 Riot Games 的「Legal Jibber Jabber」政策製作，與 Riot Games 沒有隸屬關係，也未獲 Riot Games 背書或贊助。',
          '本站依 Riot Games 的“Legal Jibber Jabber”政策制作，与 Riot Games 没有隶属关系，也未获 Riot Games 背书或赞助。',
          'Ashvigil was created under Riot Games\' "Legal Jibber Jabber" policy. It is not affiliated with, endorsed by, or sponsored by Riot Games.',
        ),
        t(
          '本站完全免費：沒有廣告、沒有付費功能、沒有會員帳號。',
          '本站完全免费：没有广告、没有付费功能、没有会员账号。',
          'The site is completely free: no ads, no paid features, and no user accounts.',
        ),
      ],
    },
    {
      heading: t('智慧財產權', '知识产权', 'Intellectual property'),
      body: [
        t(
          '《符文戰場》的名稱、卡牌圖片、卡牌文字、美術與相關商標，版權皆屬 Riot Games, Inc. 所有，本站依上述政策使用。請勿將本站上的卡牌素材用於 Riot Games 政策不允許的用途。',
          '《符文战场》的名称、卡牌图片、卡牌文字、美术与相关商标，版权均属 Riot Games, Inc. 所有，本站依上述政策使用。请勿将本站上的卡牌素材用于 Riot Games 政策不允许的用途。',
          'Riftbound, its card images, card text, artwork, and related trademarks are the property of Riot Games, Inc. and are used here under the policy above. Please do not use card assets from this site in ways Riot Games\' policies do not allow.',
        ),
        t(
          '本站的原始碼公開在 GitHub 上。',
          '本站的源代码公开在 GitHub 上。',
          "The site's source code is publicly available on GitHub.",
        ),
      ],
    },
    {
      heading: t('內容的正確性', '内容的准确性', 'Accuracy of content'),
      body: [
        t(
          '中文翻譯是社群翻譯，一律與官方英文原文並列；兩者有出入時，以官方英文為準。',
          '中文翻译是社区翻译，一律与官方英文原文并列；两者有出入时，以官方英文为准。',
          'Chinese translations are fan translations and are always shown alongside the official English text. Where they differ, the official English text prevails.',
        ),
        t(
          '規則說明僅供參考。實際對局以 Riot Games 的官方規則與裁判的判定為準。',
          '规则说明仅供参考。实际对局以 Riot Games 的官方规则与裁判的判定为准。',
          "Rules explanations are for reference only. In actual play, Riot Games' official rules and judges' rulings prevail.",
        ),
        t(
          '機率計算是數學結果，不是對局建議。本站不提供勝率、使用率或對戰數據。',
          '概率计算是数学结果，不是对局建议。本站不提供胜率、使用率或对战数据。',
          'Probability calculations are mathematical results, not gameplay advice. The site does not provide win rates, play rates, or matchup data.',
        ),
        t(
          '本站內容依現況提供，我們盡力維持正確，但不保證沒有錯誤。',
          '本站内容依现状提供，我们尽力维持准确，但不保证没有错误。',
          'All content is provided "as is". We do our best to keep it accurate but cannot guarantee it is error-free.',
        ),
      ],
    },
    {
      heading: t('對局復盤工具', '对局复盘工具', 'The replay board'),
      body: [
        t(
          '對局復盤是研究用的記錄工具：由使用者自己手動擺出盤面、記錄一局的過程。它不是遊戲，沒有配對、沒有線上對戰、不判定勝負，也不保證依規則執行 —— 每一步怎麼走都由使用者決定。',
          '对局复盘是研究用的记录工具：由用户自己手动摆出盘面、记录一局的过程。它不是游戏，没有匹配、没有在线对战、不判定胜负，也不保证依规则执行 —— 每一步怎么走都由用户决定。',
          'The replay board is a study tool for manually recording a board state and how a game unfolded. It is not a game: there is no matchmaking, no online play, no win/loss determination, and no rules enforcement. Every move is made by the user.',
        ),
      ],
    },
    {
      heading: t('使用方式', '使用方式', 'Acceptable use'),
      body: [
        t(
          '歡迎自由瀏覽與使用本站的工具。請勿攻擊本站、嘗試繞過本站的安全防護，或以自動化方式大量抓取、干擾網站運作。',
          '欢迎自由浏览与使用本站的工具。请勿攻击本站、尝试绕过本站的安全防护，或以自动化方式大量抓取、干扰网站运作。',
          "You are welcome to browse the site and use its tools freely. Please do not attack the site, attempt to bypass its security measures, or scrape it in bulk or otherwise disrupt its operation with automated tools.",
        ),
      ],
    },
    {
      heading: t('服務的變動', '服务的变动', 'Changes to the service'),
      body: [
        t(
          '本站可能隨時修改、暫停或停止任何功能，包括依 Riot Games 的要求調整或下架，恕不另行通知。',
          '本站可能随时修改、暂停或停止任何功能，包括依 Riot Games 的要求调整或下架，恕不另行通知。',
          'We may change, suspend, or discontinue any feature at any time, including in response to a request from Riot Games, without prior notice.',
        ),
        t(
          '在法律允許的範圍內，本站不對因使用或無法使用本站而產生的任何損失負責。',
          '在法律允许的范围内，本站不对因使用或无法使用本站而产生的任何损失负责。',
          'To the extent permitted by law, we are not liable for any loss arising from the use of, or inability to use, the site.',
        ),
      ],
    },
    {
      heading: t('條款的修改', '条款的修改', 'Changes to these terms'),
      body: [
        t(
          '條款若有修改，會更新本頁上方的日期。修改後繼續使用本站，即表示你同意修改後的條款。',
          '条款若有修改，会更新本页上方的日期。修改后继续使用本站，即表示你同意修改后的条款。',
          'If these terms change, the date at the top of this page will be updated. Continuing to use the site after a change means you accept the updated terms.',
        ),
      ],
    },
    { heading: LEGAL_STRINGS.contactTitle, body: CONTACT_BODY },
  ],
};

export const PRIVACY: LegalDoc = {
  title: LEGAL_STRINGS.privacy,
  intro: t(
    '一句話：本站不收集你的個人資料。以下說明本站實際做了什麼。',
    '一句话：本站不收集你的个人资料。以下说明本站实际做了什么。',
    'In short: Ashvigil does not collect your personal information. Here is exactly what the site does.',
  ),
  sections: [
    {
      heading: t('本站不做的事', '本站不做的事', 'What we do not do'),
      body: [
        t(
          '沒有會員帳號、不需要登入。',
          '没有会员账号、不需要登录。',
          'There are no user accounts and no sign-in.',
        ),
        t(
          '不使用 cookie。',
          '不使用 cookie。',
          'We do not use cookies.',
        ),
        t(
          '不使用任何流量分析、追蹤或廣告服務。',
          '不使用任何流量分析、追踪或广告服务。',
          'We do not use any analytics, tracking, or advertising services.',
        ),
        t(
          '不載入任何第三方的程式、字型或圖片 —— 卡牌圖片也由本站自己提供，你的瀏覽器瀏覽本站時不會連到其他網站。',
          '不载入任何第三方的程序、字体或图片 —— 卡牌图片也由本站自己提供，你的浏览器浏览本站时不会连到其他网站。',
          'We do not load any third-party scripts, fonts, or images. Card images are served by the site itself, so your browser does not contact any other website while you use Ashvigil.',
        ),
      ],
    },
    {
      heading: t('存在你瀏覽器裡的資料', '存在你浏览器里的数据', 'Data stored in your browser'),
      body: [
        t(
          '有些設定會存在你自己的瀏覽器裡（localStorage），方便下次使用：背景動畫與音樂的開關，以及你在牌組編輯器記錄的卡牌收藏。這些資料只存在你的裝置上，不會傳給本站或任何人。',
          '有些设置会存在你自己的浏览器里（localStorage），方便下次使用：背景动画与音乐的开关，以及你在卡组编辑器记录的卡牌收藏。这些数据只存在你的设备上，不会传给本站或任何人。',
          'A few settings are saved in your own browser (localStorage) for next time: whether background animation and music are on, and the card collection you record in the deck builder. This data stays on your device and is never sent to us or anyone else.',
        ),
        t(
          '牌組編輯器與對局復盤正在編輯的內容、以及卡牌圖鑑的捲動位置，會暫存在這個分頁裡（sessionStorage），關閉分頁就會清除。',
          '卡组编辑器与对局复盘正在编辑的内容、以及卡牌图鉴的滚动位置，会暂存在这个标签页里（sessionStorage），关闭标签页就会清除。',
          'Work in progress in the deck builder and replay board, and your scroll position in the card library, are kept temporarily in the current tab (sessionStorage) and are cleared when you close the tab.',
        ),
        t(
          '你隨時可以在瀏覽器設定裡清除這些資料。',
          '你随时可以在浏览器设置里清除这些数据。',
          'You can clear this data at any time in your browser settings.',
        ),
      ],
    },
    {
      heading: t('網址裡的資料', '网址里的数据', 'Data in links'),
      body: [
        t(
          '牌組與復盤盤面會編進網址，方便分享。你把連結傳給別人時，對方就能看到連結裡的牌組或盤面內容。',
          '卡组与复盘盘面会编进网址，方便分享。你把链接传给别人时，对方就能看到链接里的卡组或盘面内容。',
          'Decks and replay boards are encoded in the page address so they can be shared. Anyone you send such a link to can see the deck or board it contains.',
        ),
      ],
    },
    {
      heading: t('網站主機', '网站主机', 'Hosting'),
      body: [
        t(
          '本站架設在 Vercel。跟所有網站一樣，主機在傳送網頁時會處理技術性的連線資料（例如 IP 位址、瀏覽器類型、造訪的頁面），用於提供服務與防範攻擊，依 Vercel 的隱私權政策處理。本站沒有使用 Vercel 的流量分析功能。',
          '本站架设在 Vercel。跟所有网站一样，主机在传送网页时会处理技术性的连接数据（例如 IP 地址、浏览器类型、访问的页面），用于提供服务与防范攻击，依 Vercel 的隐私政策处理。本站没有使用 Vercel 的流量分析功能。',
          "Ashvigil is hosted on Vercel. As with any website, the host processes technical connection data (such as IP address, browser type, and the pages requested) to deliver the site and protect it from attacks, under Vercel's privacy policy. We do not use Vercel's analytics features.",
        ),
      ],
    },
    {
      heading: t('外部連結', '外部链接', 'External links'),
      body: [
        t(
          '本站有連到 Riot Games 官方網站等外部網站的連結。只有在你點擊時才會前往，前往後適用該網站自己的隱私權政策。',
          '本站有链接到 Riot Games 官方网站等外部网站的链接。只有在你点击时才会前往，前往后适用该网站自己的隐私政策。',
          "The site links to external websites such as Riot Games' official sites. You only visit them when you click a link, and their own privacy policies then apply.",
        ),
      ],
    },
    {
      heading: t('政策的修改', '政策的修改', 'Changes to this policy'),
      body: [
        t(
          '政策若有修改，會更新本頁上方的日期。本站的原始碼公開在 GitHub 上，任何變動都查得到。',
          '政策若有修改，会更新本页上方的日期。本站的源代码公开在 GitHub 上，任何变动都查得到。',
          "If this policy changes, the date at the top of this page will be updated. The site's source code is public on GitHub, so every change can be traced.",
        ),
      ],
    },
    { heading: LEGAL_STRINGS.contactTitle, body: CONTACT_BODY },
  ],
};
