# Android Deploy & Verify Agent

Autonomous deploy pipeline. Never declare success until all 6 steps pass and the verification artifact is written.

Package: `com.familysafety.agent`
APK path: `android-agent/app/build/outputs/apk/debug/app-debug.apk`
Verify file: `.claude/verification/android-deploy.json`

---

## STEP 1 — Build

```powershell
cd android-agent
.\gradlew assembleDebug 2>&1
```

Parse output for:

- `BUILD SUCCESSFUL` → continue
- `BUILD FAILED` → stop, report exact error, do not proceed
- `versionCode` from `app/build.gradle` before building:

```powershell
Select-String -Path app\build.gradle -Pattern "versionCode\s+(\d+)" | Select-Object -First 1
```

Record `EXPECTED_VERSION_CODE`.

---

## STEP 2 — Artifact verification (mtime < 60s)

```powershell
$apk = "app\build\outputs\apk\debug\app-debug.apk"
$mtime = (Get-Item $apk).LastWriteTime
$age = (Get-Date) - $mtime
if ($age.TotalSeconds -gt 60) { Write-Error "APK is stale ($([int]$age.TotalSeconds)s old)" }
Write-Host "APK age: $([int]$age.TotalSeconds) seconds — OK"
```

FAIL if APK is older than 60 seconds.

---

## STEP 3 — ADB install

```powershell
cd ..  # back to project root
adb install -r android-agent\app\build\outputs\apk\debug\app-debug.apk
```

Parse output:

- `Success` → continue
- `INSTALL_FAILED_*` → stop, report error code

---

## STEP 4 — Verify installed versionCode on device

```powershell
$installed = adb shell dumpsys package com.familysafety.agent | Select-String "versionCode"
Write-Host $installed
```

Compare `versionCode` in output against `EXPECTED_VERSION_CODE`.
FAIL if they do not match — old APK is still on device.

---

## STEP 5 — Launch app and check logcat for crashes (30 seconds)

```powershell
# Launch app
adb shell am start -n com.familysafety.agent/.MainActivity

# Wait 2 seconds then tail logcat for 30 seconds
Start-Sleep 2
$crashes = adb logcat -d | Select-String "FATAL EXCEPTION|AndroidRuntime|FSA_Main.*CRASH" | Select-Object -Last 20
if ($crashes) {
    Write-Error "CRASH DETECTED:`n$crashes"
} else {
    Write-Host "No crashes detected in logcat — OK"
}
```

FAIL if any FATAL EXCEPTION or crash line found after launch.

---

## STEP 6 — Write verification artifact and report

Only if steps 1-5 all passed:

```powershell
$artifact = @{
    timestamp     = [int](Get-Date -UFormat %s)
    versionCode   = $EXPECTED_VERSION_CODE
    installedCode = $INSTALLED_VERSION_CODE
    apkAgeSecs    = $AGE_SECONDS
    crashFree     = $true
    device        = (adb devices | Select-String "device$" | Select-Object -First 1).ToString()
    builtAt       = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
} | ConvertTo-Json

Set-Content -Path ".claude\verification\android-deploy.json" -Value $artifact
Write-Host "Verification artifact written."
```

Then paste the full JSON output and all step results before writing "deploy successful".

**NEVER write "success", "deployed", or "build succeeded" without pasting the artifact JSON.**
