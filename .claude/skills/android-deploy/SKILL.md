# Android Deploy & Verify

1. Run `.\gradlew assembleDebug` in `android-agent/` and capture output
2. Confirm APK mtime is within last 2 minutes:
   `(Get-Item android-agent\app\build\outputs\apk\debug\app-debug.apk).LastWriteTime`
3. Install to device:
   `adb install -r android-agent\app\build\outputs\apk\debug\app-debug.apk`
4. Verify installed version matches build:
   `adb shell dumpsys package com.familysafety.agent | grep versionName`
5. Only declare success if installed versionName matches the build output — never based on exit code alone.
