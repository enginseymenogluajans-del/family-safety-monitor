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

            socket?.connect()
        } catch (e: URISyntaxException) {
            Log.e("SocketManager", "Socket connection error", e)
        }
    }

    private fun registerDevice() {
        val data = JSONObject()
        data.put("profileId", Config.profileId)
        data.put("device", android.os.Build.MODEL)
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
