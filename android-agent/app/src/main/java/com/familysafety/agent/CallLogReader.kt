package com.familysafety.agent

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import android.provider.ContactsContract
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * ContentResolver ile cihazdan arama geçmişini okur, backend'e POST eder.
 * Her 30 saniyede bir günceller.
 */
object CallLogReader {
    private const val TAG = "CallLogReader"
    private const val INTERVAL_MS = 30_000L
    private const val LIMIT = 100

    @Volatile private var running = false
    private var thread: Thread? = null

    fun start(context: Context) {
        if (running) return
        running = true
        thread = Thread {
            Log.d(TAG, "Arama geçmişi okuyucu başlatıldı")
            while (running) {
                try {
                    readAndSend(context)
                } catch (e: Exception) {
                    Log.e(TAG, "Arama okuma hatası: ${e.message}")
                }
                try {
                    Thread.sleep(INTERVAL_MS)
                } catch (_: InterruptedException) {
                    break
                }
            }
            Log.d(TAG, "Arama okuyucu durdu")
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

        // Orijinal + olası formatlar sırayla denenir
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
        if (context.checkSelfPermission(android.Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_CALL_LOG izni yok — atlanıyor")
            return
        }

        val cursor = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(
                CallLog.Calls._ID,
                CallLog.Calls.NUMBER,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
                CallLog.Calls.TYPE
            ),
            null, null,
            "${CallLog.Calls.DATE} DESC"
        ) ?: run {
            Log.w(TAG, "CallLog cursor null")
            return
        }

        val calls = JSONArray()
        try {
            var count = 0
            while (cursor.moveToNext() && count < LIMIT) {
                val typeInt = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                val direction = when (typeInt) {
                    CallLog.Calls.INCOMING_TYPE  -> "incoming"
                    CallLog.Calls.OUTGOING_TYPE  -> "outgoing"
                    CallLog.Calls.MISSED_TYPE    -> "missed"
                    CallLog.Calls.REJECTED_TYPE  -> "missed"
                    else -> "unknown"
                }
                val number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: ""
                val obj = JSONObject().apply {
                    put("id",           cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls._ID)))
                    put("phone_number", number)
                    put("contact_name", getContactName(context, number))
                    put("timestamp",    cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE)))
                    put("duration",     cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)))
                    put("direction",    direction)
                }
                calls.put(obj)
                count++
            }
        } finally {
            cursor.close()
        }

        if (calls.length() == 0) {
            Log.d(TAG, "Arama kaydı bulunamadı")
            return
        }

        postToBackend(calls)
    }

    private fun postToBackend(calls: JSONArray) {
        try {
            val url = URL("${Config.backendUrl}/api/android-calls/${Config.profileId}")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-API-Key", Config.API_KEY)
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use {
                it.write(calls.toString())
            }
            val code = conn.responseCode
            Log.d(TAG, "Arama POST → HTTP $code (${calls.length()} kayıt)")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Arama backend gönderimi hatası: ${e.message}")
        }
    }
}
