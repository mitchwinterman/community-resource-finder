import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT || "4173", 10);
const baseURL = `http://127.0.0.1:${port}`;

const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const firefoxPath = "C:\\Program Files\\Mozilla Firefox\\firefox.exe";

const hasChrome = fs.existsSync(chromePath);
const hasEdge = fs.existsSync(edgePath);
const hasFirefox = fs.existsSync(firefoxPath);

const chromiumChannel = hasChrome ? "chrome" : hasEdge ? "msedge" : undefined;
const chromiumProjects = chromiumChannel
  ? [
      {
        name: hasChrome ? "chrome-desktop" : "edge-desktop",
        use: {
          browserName: "chromium",
          channel: chromiumChannel,
          ...devices["Desktop Chrome"],
          viewport: { width: 1440, height: 1024 }
        }
      },
      ...(hasChrome && hasEdge
        ? [
            {
              name: "edge-desktop",
              use: {
                browserName: "chromium",
                channel: "msedge",
                ...devices["Desktop Edge"],
                viewport: { width: 1366, height: 900 }
              }
            }
          ]
        : []),
      {
        name: "tablet-chromium",
        use: {
          browserName: "chromium",
          channel: chromiumChannel,
          ...devices["iPad (gen 7)"],
          viewport: { width: 820, height: 1180 }
        }
      },
      {
        name: "mobile-chromium",
        use: {
          browserName: "chromium",
          channel: chromiumChannel,
          ...devices["Pixel 5"]
        }
      }
    ]
  : [];

const firefoxProjects = hasFirefox
  ? [
      {
        name: "firefox-desktop",
        use: {
          browserName: "firefox",
          ...devices["Desktop Firefox"],
          viewport: { width: 1366, height: 900 },
          launchOptions: {
            executablePath: firefoxPath
          }
        }
      }
    ]
  : [];

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `node tools/static-server.mjs`,
    port,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000
  },
  projects: [
    ...chromiumProjects,
    ...firefoxProjects
  ]
});
