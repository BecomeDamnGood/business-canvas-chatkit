import { defineConfig, devices } from '@playwright/test';

const projects = [{ name: 'default' }];

if (process.env.PW_HEADED === '1') {
  projects.push({
    name: 'headed',
    use: {
      headless: false,
      launchOptions: { slowMo: 400 },
    },
  });
}

if (process.env.PW_WEBKIT === '1') {
  projects.push({
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  });
}

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:8787',
    headless: true,
  },
  projects,
});
