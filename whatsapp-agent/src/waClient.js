"use strict";

const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");

const AUTH_DIR = path.join(__dirname, "..", ".wwebjs_auth");

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-first-run",
        "--no-zygote",
      ],
    },
  });
}

module.exports = { createClient };
