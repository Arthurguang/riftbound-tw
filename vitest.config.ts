import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // 單元測試只跑 tests/unit；瀏覽器端的測試由 Playwright 負責。
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
