"use strict";
// PostToolUse hook — Android build sonrası APK'nın 60s'den yeni olup olmadığını kontrol eder.
// BUILD SUCCESSFUL çıktısı tespit edilince tetiklenir.

const fs = require("fs");
const path = require("path");

const APK_PATH = path.join(
  "android-agent",
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk",
);

const MAX_AGE_SECS = 60;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const cmd = (input.tool_input && input.tool_input.command) || "";
    const output = (input.tool_response && input.tool_response.output) || "";

    // Sadece Android build komutlarında tetiklen
    const isBuild = /gradlew.*assemble|assembleDebug|BUILD SUCCESSFUL/i.test(
      cmd + " " + output,
    );
    if (!isBuild) return process.exit(0);

    // APK var mı?
    if (!fs.existsSync(APK_PATH)) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: [
              "⚠️  APK BULUNAMADI",
              `Beklenen konum: ${APK_PATH}`,
              "Build gerçekten tamamlandı mı? Gradle çıktısını kontrol edin.",
            ].join("\n"),
          },
        }),
      );
      return;
    }

    // APK yaşını kontrol et
    const stat = fs.statSync(APK_PATH);
    const ageSecs = Math.floor((Date.now() - stat.mtimeMs) / 1000);

    if (ageSecs > MAX_AGE_SECS) {
      // Eski APK — kullanıcıyı uyar
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: [
              `⚠️  ESKİ APK — ${ageSecs}s önce oluşturulmuş (limit: ${MAX_AGE_SECS}s)`,
              `APK: ${APK_PATH}`,
              "",
              "Build başarısız olmuş olabilir. Doğrulama için çalıştırın:",
              "  adb shell dumpsys package com.familysafety.agent | findstr versionName",
              "",
              "Yeni APK yüklü olmadan başarı ilan etme.",
            ].join("\n"),
          },
        }),
      );
    } else {
      // Taze APK — doğrulama artefaktını yaz, sessizce geç
      const verifyDir = path.join(".claude", "verification");
      if (!fs.existsSync(verifyDir)) {
        fs.mkdirSync(verifyDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(verifyDir, "android-deploy.json"),
        JSON.stringify(
          {
            timestamp: Math.floor(Date.now() / 1000),
            apkPath: APK_PATH,
            apkAgeSecs: ageSecs,
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      // Taze — engelleme yok
    }
  } catch (_) {
    process.exit(0); // parse hatası — engelleme
  }
});
