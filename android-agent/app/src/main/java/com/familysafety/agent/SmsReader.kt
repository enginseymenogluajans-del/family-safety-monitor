package com.familysafety.agent

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * ContentResolver ile cihazdan SMS okur, backend'e POST eder.
 * Her 30 saniyede bir günceller.
 */
object SmsReader {
    private const val TAG = "SmsReader"
    private const val INTERVAL_MS = 30_000L
    private const val LIMIT = 100

    @Volatile private var running = false
    private var thread: Thread? = null

    fun start(context: Context) {
        if (running) return
        running = true
        thread = Thread {
            Log.d(TAG, "SMS okuyucu başlatıldı")
            while (running) {
                try {
                    readAndSend(context)
                } catch (e: Exception) {
                    Log.e(TAG, "SMS okuma hatası: ${e.message}")
                }
                try {
                    Thread.sleep(INTERVAL_MS)
                } catch (_: InterruptedException) {
                    break
                }
            }
            Log.d(TAG, "SMS okuyucu durdu")
        }.also { it.isDaemon = true; it.start() }
    }

    fun stop() {
        running = false
        thread?.interrupt()
        thread = null
    }

    private fun getContactName(context: Context, phoneNumber: String): String {
        if (phoneNumber.isBlank()) return phoneNumber

        // READ_CONTACTS runtime izni kontrolü
        if (context.checkSelfPermission(android.Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "getContactName: READ_CONTACTS izni yok — $phoneNumber")
            return phoneNumber
        }

        // Numarayı normalize et: sadece rakamlar, son 10 hane
        val digitsOnly = phoneNumber.filter { it.isDigit() }
        val last10 = if (digitsOnly.length > 10) digitsOnly.takeLast(10) else digitsOnly

        // Önce orijinal numarayı dene, bulamazsan son-10-hane ile tekrar dene
        val candidates = linkedSetOf(phoneNumber, "+90$last10", "0$last10", last10)
        for (candidate in candidates) {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(candidate)
            )
            context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val name = cursor.getString(0)
                    Log.d(TAG, "getContactName: $phoneNumber → $name (eşleşen: $candidate)")
                    return name
                }
            }
        }

        Log.d(TAG, "getContactName: $phoneNumber → isim bulunamadı")
        return phoneNumber
    }

    private fun readAndSend(context: Context) {
        if (context.checkSelfPermission(android.Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_SMS izni yok — atlanıyor")
            return
        }

        val cursor = context.contentResolver.query(
            Uri.parse("content://sms"),
            arrayOf("_id", "address", "body", "date", "type"),
            null, null, "date DESC"
        ) ?: run {
            Log.w(TAG, "SMS cursor null")
            return
        }

        val messages = JSONArray()
        try {
            var count = 0
            while (cursor.moveToNext() && count < LIMIT) {
                val typeInt = cursor.getInt(cursor.getColumnIndexOrThrow("type"))
                val direction = when (typeInt) {
                    1 -> "incoming"
                    2 -> "outgoing"
                    3 -> "draft"
                    else -> "unknown"
                }
                val address = cursor.getString(cursor.getColumnIndexOrThrow("address")) ?: ""
                val obj = JSONObject().apply {
                    put("id",           cursor.getLong(cursor.getColumnIndexOrThrow("_id")))
                    put("sender",       address)
                    put("contact_name", getContactName(context, address))
                    put("text",         cursor.getString(cursor.getColumnIndexOrThrow("body")) ?: "")
                    put("timestamp",    cursor.getLong(cursor.getColumnIndexOrThrow("date")))
                    put("direction",    direction)
                    put("risk_level",   "none")
                    put("is_redacted",  false)
                }
                messages.put(obj)
                count++
            }
        } finally {
            cursor.close()
        }

        if (messages.length() == 0) {
            Log.d(TAG, "SMS bulunamadı")
            return
        }

        postToBackend(messages)
    }

    private fun postToBackend(messages: JSONArray) {
        try {
            val url = URL("${Config.backendUrl}/api/android-sms/${Config.profileId}")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-API-Key", Config.API_KEY)
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use {
                it.write(messages.toString())
            }
            val code = conn.responseCode
            Log.d(TAG, "SMS POST → HTTP $code (${messages.length()} mesaj)")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "SMS backend gönderimi hatası: ${e.message}")
        }
    }
}
