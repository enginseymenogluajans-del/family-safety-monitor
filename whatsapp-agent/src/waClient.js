"use strict";

const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");

const AUTH_DIR = path.join(__dirname, "..", ".wwebjs_auth");

// puppeteer-core v21+ doesn't auto-detect system Chrome — provide path explicitly
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : null,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createClient() {
  const executablePath = findChrome();
  if (executablePath) {
    console.log("[WA] Chrome bulundu:", executablePath);
  } else {
    console.warn("[WA] Chrome bulunamadı — puppeteer varsayılanı denenecek");
  }

  return new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: "new",
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        "--safebrowsing-disable-auto-update",
      ],
    },
  });
}

module.exports = { createClient };
