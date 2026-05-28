"use strict";
// Stop hook — blocks session termination if the active test is still failing.

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(".claude", "verification", "active-test.json");
const MAX_AGE_SECS = 3600; // ignore stale state files older than 1 hour

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    if (!fs.existsSync(STATE_FILE)) process.exit(0);

    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const age = Math.floor(Date.now() / 1000) - (state.updated_at || 0);

    // Stale or already passing — allow stop
    if (age > MAX_AGE_SECS || state.status !== "failing") process.exit(0);

    const iter = state.iteration ?? "?";
    const max = state.max_iterations ?? 20;
    const cmd = state.test_command ?? state.test_file ?? "(unknown)";

    process.stdout.write(
      JSON.stringify({
        continue: false,
        stopReason: [
          `🔴 STOP BLOCKED — Active test is still FAILING`,
          `Test:      ${cmd}`,
          `Branch:    ${state.branch || "(unknown)"}`,
          `Iteration: ${iter} / ${max}`,
          ``,
          `Fix the failing test before ending the session, or delete`,
          `${STATE_FILE} to force-allow exit.`,
        ].join("\n"),
      }),
    );
  } catch (_) {
    // Parse error or missing fields — don't block
    process.exit(0);
  }
});
