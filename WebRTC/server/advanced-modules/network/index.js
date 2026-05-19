const dns2 = require("dns2");
const blocklist = require("./blocklist");

const UPSTREAM = "8.8.8.8";
const DNS_PORT = parseInt(process.env.DNS_PORT) || 5353;

function isBlocked(hostname) {
  const h = hostname.replace(/\.$/, "").toLowerCase();
  if (blocklist.has(h)) return true;
  // Check parent domains (e.g., "ads.example.com" → "example.com")
  const parts = h.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (blocklist.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function init(io) {
  const server = dns2.createServer({
    udp: true,
    handle: async (request, send, rinfo) => {
      const response = dns2.Packet.createResponseFromRequest(request);
      const [question] = request.questions;
      if (!question) {
        send(response);
        return;
      }

      const hostname = question.name;
      const clientIp = rinfo.address;

      if (isBlocked(hostname)) {
        // Sinkhole: return 0.0.0.0 for A, empty for others
        if (question.type === dns2.Packet.TYPE.A) {
          response.answers.push({
            name: hostname,
            type: dns2.Packet.TYPE.A,
            class: dns2.Packet.CLASS.IN,
            ttl: 300,
            address: "0.0.0.0",
          });
        }
        const event = { hostname, clientIp, ts: Date.now() };
        io.emit("network:blocked", event);
        console.log(`🚫 DNS blocked: ${hostname} ← ${clientIp}`);
        send(response);
        return;
      }

      // Forward to upstream resolver
      try {
        const upstream = new dns2({ nameServers: [UPSTREAM] });
        const result = await upstream.resolve(
          hostname,
          question.type === dns2.Packet.TYPE.AAAA ? "AAAA" : "A",
        );
        if (result.answers) response.answers.push(...result.answers);
      } catch {
        // Return empty answer on upstream failure — don't crash
      }
      send(response);
    },
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(
        `⚠️  DNS sinkhole: UDP port ${DNS_PORT} zaten kullanımda — atlanıyor (sinyal sunucusu etkilenmez)`,
      );
    } else {
      console.error("DNS server error:", err.message);
    }
  });

  try {
    server.listen({ udp: DNS_PORT });
    console.log(
      `🛡️  DNS sinkhole ready  →  UDP :${DNS_PORT}  (upstream: ${UPSTREAM})`,
    );
  } catch (err) {
    console.warn(
      `⚠️  DNS sinkhole başlatılamadı (${err.message}) — sinyal sunucusu çalışmaya devam ediyor`,
    );
  }

  // HTTP management endpoints (app injected via init(app, io) signature variant)
  return server;
}

function initWithApp(app, io) {
  // Blocklist management routes
  app.get("/advanced/network/blocklist", (_req, res) => {
    res.json({ domains: [...blocklist].sort() });
  });

  app.post("/advanced/network/blocklist/add", (req, res) => {
    const { domain } = req.body || {};
    if (!domain) return res.status(400).json({ error: "domain required" });
    blocklist.add(domain.toLowerCase().trim());
    res.json({ ok: true, domain });
  });

  app.delete("/advanced/network/blocklist/:domain", (req, res) => {
    const removed = blocklist.delete(
      decodeURIComponent(req.params.domain).toLowerCase(),
    );
    res.json({ ok: removed });
  });

  return init(io);
}

module.exports = { init: initWithApp };
