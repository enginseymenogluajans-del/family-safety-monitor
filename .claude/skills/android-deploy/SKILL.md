# Android Deploy & Verify

Build → Timestamp → Install → versionName → Logcat — 5 adımın hepsi geçmeden başarı ilan etme.

Package : `com.familysafety.agent`
APK : `android-agent\app\build\outputs\apk\debug\app-debug.apk`

---

## ADIM 1 — Build

```powershell
cd android-agent
.\gradlew assembleDebug 2>&1
```

- `BUILD SUCCESSFUL` → devam
- `BUILD FAILED` → dur, tam hatayı raporla, devam etme

---

## ADIM 2 — APK timestamp (< 60 saniye)

```powershell
$apk = "app\build\outputs\apk\debug\app-debug.apk"
$age = ((Get-Date) - (Get-Item $apk).LastWriteTime).TotalSeconds
if ($age -gt 60) { Write-Error "APK ESKÜ — $([int]$age)s önce oluşturulmuş" }
Write-Host "APK yaşı: $([int]$age)s — OK"
```

60 saniyeden eski APK varsa build gerçek değil, dur.

---

## ADIM 3 — ADB install

```powershell
cd ..
adb install -r android-agent\app\build\outputs\apk\debug\app-debug.apk
```

- `Success` → devam
- `INSTALL_FAILED_*` → dur, hata kodunu raporla

---

## ADIM 4 — versionName doğrulama

```powershell
adb shell dumpsys package com.familysafety.agent | findstr versionName
```

Çıktıyı yapıştır. `versionName` build.gradle'daki değerle eşleşmeli.
Eşleşmiyorsa cihazda hâlâ eski APK var — başarı ilan etme.

---

## ADIM 5 — Logcat crash kontrolü

```powershell
adb shell am start -n com.familysafety.agent/.MainActivity
Start-Sleep 3
adb logcat -d | Select-String "FATAL EXCEPTION|AndroidRuntime|FSA_Main.*HATA" | Select-Object -Last 15
```

Herhangi bir FATAL EXCEPTION satırı varsa deploy başarısız sayılır.

---

## Doğrulama artefaktı yaz

5 adım geçtikten sonra yapıştır ve `.claude/verification/android-deploy.json` oluştur:

```powershell
@{
    builtAt       = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    apkAgeSecs    = $age
    versionName   = "<yukarıdaki çıktı>"
    crashFree     = $true
    device        = (adb devices | Select-String "device$" | Select-Object -First 1).ToString()
} | ConvertTo-Json | Set-Content ".claude\verification\android-deploy.json"
```

**`versionName` çıktısı yapıştırılmadan "başarılı", "deployed" veya "build tamamlandı" yazma.**
