package com.familysafety.agent

import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object ContactsReader {
    private const val TAG = "ContactsReader"
    private const val INTERVAL_MS = 5 * 60_000L  // 5 dakika
    private const val LIMIT = 500

    @Volatile private var running = false
    private var thread: Thread? = null

    fun start(context: Context) {
        if (running) return
        running = true
        thread = Thread {
            Log.d(TAG, "Rehber okuyucu başlatıldı")
            while (running) {
                try {
                    readAndSend(context)
                } catch (e: Exception) {
                    Log.e(TAG, "Rehber okuma hatası: ${e.message}")
                }
                try {
                    Thread.sleep(INTERVAL_MS)
                } catch (_: InterruptedException) {
                    break
                }
            }
            Log.d(TAG, "Rehber okuyucu durdu")
        }.also { it.isDaemon = true; it.start() }
    }

    fun stop() {
        running = false
        thread?.interrupt()
        thread = null
    }

    private fun readAndSend(context: Context) {
        if (context.checkSelfPermission(android.Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_CONTACTS izni yok — atlanıyor")
            return
        }

        val contacts = mutableListOf<JSONObject>()
        val phones   = buildPhonesMap(context)
        val emails   = buildEmailsMap(context)

        val cursor = context.contentResolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(
                ContactsContract.Contacts._ID,
                ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
            ),
            null, null,
            "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC"
        ) ?: return

        var count = 0
        cursor.use { c ->
            while (c.moveToNext() && count < LIMIT) {
                val id   = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts._ID)) ?: continue
                val name = c.getString(c.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)) ?: ""

                val phoneList  = phones[id]  ?: emptyList()
                val emailList  = emails[id]  ?: emptyList()

                val obj = JSONObject().apply {
                    put("contact_id",   id)
                    put("name",         name)
                    put("phone_number", phoneList.firstOrNull() ?: "")
                    put("phones",       JSONArray(phoneList))
                    put("emails",       JSONArray(emailList))
                }
                contacts.add(obj)
                count++
            }
        }

        if (contacts.isEmpty()) return

        val payload = JSONObject().apply {
            put("profile_id", Config.profileId)
            put("contacts",   JSONArray(contacts))
        }

        postToBackend(payload.toString())
        Log.d(TAG, "${contacts.size} kişi gönderildi")
    }

    private fun buildPhonesMap(context: Context): Map<String, List<String>> {
        val map = mutableMapOf<String, MutableList<String>>()
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            ),
            null, null, null
        ) ?: return map
        cursor.use { c ->
            while (c.moveToNext()) {
                val cid    = c.getString(0) ?: continue
                val number = c.getString(1) ?: continue
                map.getOrPut(cid) { mutableListOf() }.add(number.trim())
            }
        }
        return map
    }

    private fun buildEmailsMap(context: Context): Map<String, List<String>> {
        val map = mutableMapOf<String, MutableList<String>>()
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Email.CONTACT_ID,
                ContactsContract.CommonDataKinds.Email.ADDRESS,
            ),
            null, null, null
        ) ?: return map
        cursor.use { c ->
            while (c.moveToNext()) {
                val cid   = c.getString(0) ?: continue
                val email = c.getString(1) ?: continue
                map.getOrPut(cid) { mutableListOf() }.add(email.trim())
            }
        }
        return map
    }

    private fun postToBackend(jsonBody: String) {
        val url = "${Config.backendUrl}/api/android-contacts/${Config.profileId}"
        try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod  = "POST"
            conn.doOutput       = true
            conn.connectTimeout = 8_000
            conn.readTimeout    = 8_000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-API-Key", Config.API_KEY)
            OutputStreamWriter(conn.outputStream).use { it.write(jsonBody) }
            conn.responseCode  // tetikle
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Backend POST hatası: ${e.message}")
        }
    }
}
