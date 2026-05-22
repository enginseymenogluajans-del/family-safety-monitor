#!/usr/bin/env node
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");

// .env okuma — API key'i backend/.env'den al
function loadEnv() {
  const envPath = path.join(__dirname, "../../backend/.env");
  try {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const eq = line.indexOf("=");
        if (eq < 1) return;
        const k = line.slice(0, eq).trim();
        const v = line
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (k && v && !process.env[k]) process.env[k] = v;
      });
  } catch (_) {}
}
loadEnv();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_KEY = process.env.API_KEY || process.env.VITE_API_KEY || "";

async function fetchBackend(endpoint) {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${endpoint}`);
  return res.json();
}

const server = new Server(
  { name: "family-safety-backend", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "backend_health",
      description:
        "Backend servisinin canlı durumunu kontrol eder — tüm servislerin up/down durumu",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "backend_diagnostics",
      description:
        "Bağlı Android cihazların anlık durumunu döndürür (socket ID, profileId, last_seen)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "backend_profiles",
      description: "Kayıtlı profilleri listeler",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;

  const routes = {
    backend_health: "/health",
    backend_diagnostics: "/api/diagnostics/default",
    backend_profiles: "/api/profiles",
  };

  if (!routes[name]) {
    throw new Error(`Bilinmeyen tool: ${name}`);
  }

  try {
    const data = await fetchBackend(routes[name]);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `HATA [${name}]: ${e.message}\nBackend çalışıyor mu? ${BACKEND_URL}/health`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`MCP server başlatılamadı: ${e.message}\n`);
  process.exit(1);
});
