package com.familysafety.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SafetyAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "SafetyAccessibility"

        // Risk kelimeleri — Türkçe + İngilizce
        val riskKeywords = listOf(
            // Şiddet / tehlike
            "öldür", "öldüreceğim", "saldır", "bıçak", "silah", "bomba",
            "kill", "murder", "attack", "weapon", "bomb",
            // Kendine zarar
            "intihar", "kendimi keseceğim", "ölmek istiyorum",
            "suicide", "self harm", "cut myself", "wanna die",
            // Siber zorbalık
            "seni döveceğim", "rezil et", "ifşa", "şantaj",
            "beat you up", "expose", "blackmail", "threaten",
            // Uyuşturucu / alkol (reşit olmayan)
            "esrar", "uyuşturucu", "eroin", "kokain",
            "weed", "drugs", "heroin", "cocaine",
            // Kaçma / gizlenme
            "kaçacağım", "evden gidiyorum", "kimse bilmesin",
            "run away", "leaving home", "nobody knows",
            // Test
            "tehlike",
        )

        @Volatile
        var instance: SafetyAccessibilityService? = null
    }

    // Handler tabanlı debounce
    private val handler = Handler(Looper.getMainLooper())
    private var lastText = ""
    private var lastPackage = ""

    private val sendRunnable = Runnable {
        val pkg  = lastPackage
        val text = lastText
        if (text.isNotEmpty() && pkg.isNotEmpty()) {
            Thread {
                try {
                    sendKeystroke(pkg, text)
                } catch (e: Exception) {
                    Log.e(TAG, "sendKeystroke hata: ${e.message}")
                }
            }.start()
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100L
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        Log.d(TAG, "AccessibilityService bağlandı")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        handler.removeCallbacks(sendRunnable)
        Log.d(TAG, "AccessibilityService kapandı")
    }

    // ── Event ──────────────────────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) return
        val packageName = event.packageName?.toString() ?: return
        val text        = event.text.joinToString(" ").trim()

        if (text.isEmpty() || text == lastText) return

        // Sistem paketlerini atla
        if (packageName.startsWith("com.android.") ||
            packageName.startsWith("android") ||
            packageName == "com.google.android.inputmethod.latin") return

        lastText    = text
        lastPackage = packageName

        // Önceki zamanlayıcıyı iptal et, 1 saniye bekle
        handler.removeCallbacks(sendRunnable)
        handler.postDelayed(sendRunnable, 1000L)
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
    }

    // ── Gönderim ───────────────────────────────────────────────────────────────

    private fun sendKeystroke(packageName: String, text: String) {
        val appName        = resolveAppName(packageName)
        val matchedKeyword = riskKeywords.firstOrNull { text.contains(it, ignoreCase = true) }
        val isRisk         = matchedKeyword != null

        if (isRisk) Log.w(TAG, "RISK KEYWORD: '$matchedKeyword' in [$appName]")
        else        Log.d(TAG, "Debounce → [$appName] ${text.take(40)}")

        val payload = JSONObject().apply {
            put("app_name",      appName)
            put("package",       packageName)
            put("text",          text)
            put("timestamp",     System.currentTimeMillis())
            put("is_risk_alert", isRisk)
            if (matchedKeyword != null) put("risk_keyword", matchedKeyword)
        }
        post("${Config.backendUrl}/api/android-keystrokes/${Config.profileId}", payload.toString())
    }

    // ── HTTP ───────────────────────────────────────────────────────────────────

    private fun post(urlStr: String, body: String) {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("X-API-Key", Config.API_KEY)
        conn.doOutput = true
        conn.connectTimeout = 4000
        conn.readTimeout = 4000
        try {
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }
            val code = conn.responseCode
            Log.d(TAG, "POST → $code")
        } finally {
            conn.disconnect()
        }
    }

    private fun resolveAppName(packageName: String): String {
        return try {
            val pm = applicationContext.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        } catch (e: Exception) {
            packageName.split(".").lastOrNull() ?: packageName
        }
    }

    // ── Uzaktan Tıklama ────────────────────────────────────────────────────────

    fun performRemoteClick(xPercent: Float, yPercent: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        try {
            val metrics = resources.displayMetrics
            val path = Path().apply {
                moveTo(xPercent * metrics.widthPixels, yPercent * metrics.heightPixels)
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0L, 100L))
                .build()
            dispatchGesture(gesture, null, null)
        } catch (e: Exception) {
            Log.e(TAG, "Gesture hata: ${e.message}")
        }
    }
}
