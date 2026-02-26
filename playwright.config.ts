import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL || 'http://127.0.0.1:8787';
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
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: 'cd mcp-server && LOCAL_DEV=1 PORT=8787 node --loader ts-node/esm server.ts',
    url: 'http://127.0.0.1:8787/ready',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL,
    headless: true,
  },
  projects,
});
