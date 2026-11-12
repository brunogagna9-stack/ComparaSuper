// Pruebas automáticas de ComparáSúper (Playwright, de Microsoft, código abierto).
// Corren solas en GitHub antes de publicar cada cambio de la web, en PC y en celular.
// Para correrlas en tu compu: npm install && npx playwright install chromium && npm test
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://localhost:8765/", serviceWorkers: "allow", locale: "es-AR", ...(process.env.PW_CHROME ? { channel: "chrome" } : {}) },
  webServer: { command: "python3 -m http.server 8765 -d site", port: 8765, reuseExistingServer: true },
  // las capturas (@visual) corren aparte, con "npm run visual"
  grepInvert: process.env.VISUAL ? undefined : /@visual/,
  grep: process.env.VISUAL ? /@visual/ : undefined,
  snapshotPathTemplate: "tests/capturas/{projectName}/{arg}{ext}",
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
});
