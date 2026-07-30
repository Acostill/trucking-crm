const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './demo',
  testMatch: 'virtual-employee.spec.js',
  outputDir: './demo/artifacts/test-results',
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 15 * 1000
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['line']
  ],
  use: {
    baseURL: process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000',
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    screenshot: 'only-on-failure',
    trace: 'on',
    video: 'retain-on-failure',
    viewport: {
      width: 1500,
      height: 900
    },
    launchOptions: {
      slowMo: Number(process.env.DEMO_SLOW_MO || 180)
    }
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {
          width: 1500,
          height: 900
        }
      }
    }
  ]
});
