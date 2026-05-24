"use strict";

const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");

const AUTH_DIR = path.join(__dirname, "..", ".wwebjs_auth");

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
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
    console.error(
      "[WA] HATA: Chrome bulunamadı. CHROME_PATH env değişkenini ayarlayın.",
    );
  }

  const puppeteerOpts = {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
    ],
  };

  // executablePath yalnızca bulunursa geçilir — undefined geçmek puppeteer'ı çökertir
  if (executablePath) puppeteerOpts.executablePath = executablePath;

  try {
    return new Client({
      authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
      puppeteer: puppeteerOpts,
    });
  } catch (err) {
    console.error("[WA] Client oluşturulamadı:", err.message);
    console.error(err.stack);
    throw err;
  }
}

module.exports = { createClient };
