import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

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

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

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
