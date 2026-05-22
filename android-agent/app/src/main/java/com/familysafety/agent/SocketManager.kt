package com.familysafety.agent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException

object SocketManager {
    private val TAG = "SocketManager"
    private var socket: Socket? = null
    private var signalSocket: Socket? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    fun connect(context: Context) {
        Log.d(TAG, "Socket bağlanıyor... backend=${Config.backendUrl}")
        connectBackend(context)
        connectSignalServer(context)
    }

    // ── Backend (port 8000) — genel komutlar ─────────────────────────────────

    private fun connectBackend(context: Context) {
        if (socket?.connected() == true) return
        socket?.disconnect()
        socket = null

        try {
            val options = IO.Options().apply {
                query = "profileId=${Config.profileId}"
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 2000
                reconnectionDelayMax = 10000
                timeout = 20000
            }

            socket = IO.socket(Config.backendUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Backend bağlandı: ${Config.backendUrl}")
                registerDevice(socket!!)
            }
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e(TAG, "Backend bağlantı hatası: ${args.firstOrNull()}")
            }
            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.w(TAG, "Backend bağlantısı kesildi")
            }

            socket?.on("take_screenshot") {
                Log.d(TAG, "Komut: take_screenshot")
                ScreenshotHelper.takeScreenshot(context)
            }
            socket?.on("get_location") {
                Log.d(TAG, "Komut: get_location")
                LocationHelper.fetchAndSendLocation(context)
            }
            socket?.on("start_screen_stream") {
                Log.d(TAG, "Komut: start_screen_stream")
                mainHandler.post {
                    val m = context.resources.displayMetrics
                    ScreenStreamManager.startStreaming(m.widthPixels, m.heightPixels, m.densityDpi)
                }
            }
            socket?.on("stop_screen_stream") {
                Log.d(TAG, "Komut: stop_screen_stream")
                ScreenStreamManager.stop()
            }
            socket?.on("start_camera_stream") {
                Log.d(TAG, "Komut: start_camera_stream")
                mainHandler.post { CameraStreamManager.startStreaming(context) }
            }
            socket?.on("stop_camera_stream") {
                Log.d(TAG, "Komut: stop_camera_stream")
                mainHandler.post { CameraStreamManager.stop() }
            }
            socket?.on("remote_click") { args ->
                try {
                    val data = args[0] as? JSONObject ?: return@on
                    val xPct = data.getDouble("x_percent").toFloat()
                    val yPct = data.getDouble("y_percent").toFloat()
                    SafetyAccessibilityService.instance?.performRemoteClick(xPct, yPct)
                } catch (e: Exception) {
                    Log.e(TAG, "remote_click hatası: ${e.message}")
                }
            }

            socket?.connect()
            Log.d(TAG, "Backend bağlantısı başlatılıyor: ${Config.backendUrl}")
        } catch (e: URISyntaxException) {
            Log.e(TAG, "Backend URI hatası: ${e.message}")
        }
    }

    // ── Signal Server (port 8001) — canlı kontrol ────────────────────────────

    fun connectSignalServer(context: Context) {
        if (signalSocket?.connected() == true) return
        signalSocket?.disconnect()
        signalSocket = null

        val url = Config.signalServerUrl
        Log.d(TAG, "Signal server bağlantısı başlatılıyor: $url")

        try {
            val options = IO.Options().apply {
                query = "profileId=${Config.profileId}"
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 3000
                reconnectionDelayMax = 15000
                timeout = 20000
            }

            signalSocket = IO.socket(url, options)

            signalSocket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Signal server bağlandı: $url")
                val info = JSONObject().apply {
                    put("profileId", Config.profileId)
                    put("model", android.os.Build.MODEL)
                    put("manufacturer", android.os.Build.MANUFACTURER)
                    put("os_version", android.os.Build.VERSION.RELEASE)
                    put("platform", "android")
                    put("app_state", "active")
                }
                signalSocket?.emit("device-register", info)
                signalSocket?.emit("register", "android")
                Log.d(TAG, "Cihaz kaydı gönderildi — profileId=${Config.profileId}")
            }

            signalSocket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val err = args.firstOrNull()
                val msg = (err as? Exception)?.message ?: err?.toString() ?: "bilinmeyen hata"
                Log.e(TAG, "Signal server bağlantı hatası [$url]: $msg")
            }

            signalSocket?.on(Socket.EVENT_DISCONNECT) { args ->
                val reason = args.firstOrNull()?.toString() ?: "?"
                Log.w(TAG, "Signal server bağlantısı kesildi ($reason) — yeniden bağlanılacak")
            }

            // Dashboard'dan gelen canlı kontrol komutları — MAIN THREAD'de çalıştır
            signalSocket?.on("command") { args ->
                try {
                    val data = args[0] as? JSONObject ?: return@on
                    val type = data.optString("type", "")
                    Log.d(TAG, "Signal komut alındı: $type")

                    mainHandler.post {
                        when (type) {
                            "screen" -> {
                                val m = context.resources.displayMetrics
                                if (ScreenStreamManager.isProjectionReady()) {
                                    ScreenStreamManager.startStreaming(
                                        m.widthPixels, m.heightPixels, m.densityDpi
                                    )
                                    Log.d(TAG, "Ekran akışı başlatıldı")
                                } else {
                                    Log.e(TAG, "MediaProjection hazır değil — kullanıcının izin vermesi gerekiyor")
                                    notifyProjectionNeeded()
                                }
                            }
                            "camera" -> {
                                CameraStreamManager.startStreaming(context)
                                Log.d(TAG, "Kamera akışı başlatıldı")
                            }
                            "stop" -> {
                                ScreenStreamManager.stop()
                                CameraStreamManager.stop()
                                Log.d(TAG, "Tüm akışlar durduruldu")
                            }
                            "photo" -> {
                                if (ScreenStreamManager.isProjectionReady()) {
                                    ScreenshotHelper.takeScreenshot(context)
                                } else {
                                    Log.e(TAG, "MediaProjection yok — fotoğraf alınamıyor")
                                    notifyProjectionNeeded()
                                }
                            }
                            "audio" -> Log.d(TAG, "Ses stream: gelecek sürümde")
                            else -> Log.w(TAG, "Bilinmeyen komut: $type")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Komut işleme hatası: ${e.message}")
                }
            }

            signalSocket?.on("alert") { args ->
                try {
                    val data = args[0] as? JSONObject ?: return@on
                    val type = data.optString("type", "")
                    val message = data.optString("message", "")
                    Log.w(TAG, "Alert: $type — $message")
                } catch (e: Exception) {
                    Log.e(TAG, "Alert hatası: ${e.message}")
                }
            }

            signalSocket?.connect()
        } catch (e: URISyntaxException) {
            Log.e(TAG, "Signal server URI hatası: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Signal server başlatma hatası: ${e.message}")
        }
    }

    // MediaProjection hazır değilse kullanıcıya bildirim gönder
    private fun notifyProjectionNeeded() {
        val payload = JSONObject().apply {
            put("profileId", Config.profileId)
            put("data", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
            put("error", "MediaProjection izni gerekli — cihazda uygulamayı açın ve izin verin")
        }
        signalSocket?.emit("snapshot", payload)
    }

    // ── Ortak ───────────────────────────────────────────────────────────────

    private fun registerDevice(s: Socket) {
        val data = JSONObject().apply {
            put("profileId", Config.profileId)
            put("model", android.os.Build.MODEL)
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("os_version", android.os.Build.VERSION.RELEASE)
        }
        s.emit("register", data)
    }

    fun reconnectSignalServer(context: Context) {
        Log.d(TAG, "Signal server yeniden bağlanıyor...")
        connectSignalServer(context)
    }

    fun disconnect() {
        socket?.disconnect(); socket = null
        signalSocket?.disconnect(); signalSocket = null
    }

    fun emit(event: String, data: JSONObject) {
        socket?.emit(event, data)
    }

    fun emitSignal(event: String, data: JSONObject) {
        if (signalSocket?.connected() == true) {
            signalSocket?.emit(event, data)
        } else {
            Log.w(TAG, "emitSignal: $event — signal socket bağlı değil")
        }
    }

    fun isSignalConnected() = signalSocket?.connected() == true
}
