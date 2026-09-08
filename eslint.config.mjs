/*
 * eslint-config-next 16 起改成原生 flat config，直接匯出設定陣列。
 *
 * 先前是用 @eslint/eslintrc 的 FlatCompat 把舊格式包起來。升級到 16 之後
 * 那個包裝會爆「Converting circular structure to JSON」——
 * 因為它把一份本來就是 flat 的設定又轉了一次。
 *
 * 現在直接展開，不再需要 FlatCompat。
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/data/**', // 建置產物
      'next-env.d.ts', // Next.js 自動產生
      'test-results/**',
      'playwright-report/**',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      /*
       * 資安規則：這幾條是防線，不是風格偏好。
       * scripts/check-forbidden-apis.mjs 會做同樣的檢查 ——
       * 兩層都有是刻意的：ESLint 在編輯器裡即時提醒，CI 腳本保證真的擋得住。
       */
      'react/no-danger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      /*
       * 本專案刻意使用原生 <img> 而非 next/image：
       * 官方 CDN 已支援即時轉檔，不需要再經過一層圖片最佳化代理
       * （少一層代理 = 少一個攻擊面）。詳見 src/components/CardTile.tsx。
       */
      '@next/next/no-img-element': 'off',

      /*
       * React Compiler 的最佳化建議降級為警告。
       *
       * eslint-config-next 16 起把這條開成 error，訊息是
       * 「Compilation Skipped: Existing memoization could not be preserved」——
       * 意思是 React Compiler 決定不自動最佳化這個元件，**不是程式有錯**，
       * 行為完全正常。
       *
       * 為了一個效能建議去重寫已經正確、而且刻意這樣寫的記憶化邏輯，
       * 風險大於收益。留成警告，看得到但不會擋住 CI。
       *
       * ⚠️ 注意：上面那幾條資安規則（no-danger / no-eval / no-script-url）
       * 一律維持 error，不適用這個理由。
       */
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },

  {
    /*
     * 安全檢查程式與它們的測試「必須」提到 "javascript:" 這個字串 ——
     * 那正是它們要偵測與阻擋的對象。在這些檔案裡關掉該規則。
     */
    files: ['scripts/**/*.mjs', 'tests/**/*.ts'],
    rules: { 'no-script-url': 'off' },
  },
];

export default config;
