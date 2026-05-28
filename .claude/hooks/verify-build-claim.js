"use strict";
// PostToolUse hook — intercepts Bash output claiming build success.
// If no fresh verification artifact exists, injects a warning back to Claude.

const fs = require("fs");
const path = require("path");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const output = (input.tool_response && input.tool_response.output) || "";

    const claimsBuildSuccess =
      /BUILD SUCCESSFUL|build succeeded|Installed|deployed|install.*success/i.test(
        output,
      );
    if (!claimsBuildSuccess) process.exit(0);

    const VERIFY_FILES = [
      path.join(".claude", "verification", "android-deploy.json"),
      path.join(".claude", "verification", "electron-deploy.json"),
    ];

    const MAX_AGE_SECS = 300; // 5 minutes
    const now = Math.floor(Date.now() / 1000);

    // Accept if ANY fresh artifact exists
    for (const f of VERIFY_FILES) {
      if (!fs.existsSync(f)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        const age = now - (data.timestamp || 0);
        if (age <= MAX_AGE_SECS) process.exit(0); // verified — let it through
      } catch (_) {}
    }

    // No fresh artifact — inject warning
    const msg = [
      "⚠️  BUILD CLAIM INTERCEPTED",
      "A build success claim was detected but no fresh verification artifact exists.",
      "Required: .claude/verification/android-deploy.json OR electron-deploy.json",
      "with a timestamp newer than 5 minutes.",
      "",
      "Run /deploy-android or /deploy-electron to produce verified output.",
      'Do not write "success", "deployed", or "build succeeded" until the artifact is pasted.',
    ].join("\n");

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: msg,
        },
      }),
    );
  } catch (_) {
    process.exit(0); // parse error — don't block
  }
});
