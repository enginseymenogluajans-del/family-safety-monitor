package com.familysafety.agent

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object ApiClient {
    private const val TAG = "FamilySafetyApi"

    suspend fun sendNotification(payload: JSONObject) = withContext(Dispatchers.IO) {
        try {
            val url = URL("${Config.backendUrl}/api/android-notifications/${Config.profileId}")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use {
                it.write(payload.toString())
            }
            val code = conn.responseCode
            Log.d(TAG, "POST /android-notifications → $code")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Bildirim gönderilemedi: ${e.message}")
        }
    }
}
