// Playwright config — calibration verification harness.
// Phase 1: minimal setup, single browser, single project. Test directory
// pattern matches tests/plant-calibration/*.spec.ts.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/plant-calibration',
  fullyParallel: false,           // single dev server, sequential scrub
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/plant-calibration',
  use: {
    baseURL: 'http://localhost:8090',
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],
  // Reuse the dev server that's already running on :8090.
});
