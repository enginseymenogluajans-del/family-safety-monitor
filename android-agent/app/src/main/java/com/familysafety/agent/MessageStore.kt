package com.familysafety.agent

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

// Gelen bildirimleri saklar; silinme tespiti için karşılaştırma yapar.
class MessageStore(context: Context) : SQLiteOpenHelper(context, "msg_store.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE messages (
                key        TEXT PRIMARY KEY,
                package    TEXT,
                title      TEXT,
                text       TEXT,
                posted_at  INTEGER
            )"""
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        db.execSQL("DROP TABLE IF EXISTS messages")
        onCreate(db)
    }

    fun save(key: String, pkg: String, title: String, text: String) {
        val cv = ContentValues().apply {
            put("key", key)
            put("package", pkg)
            put("title", title)
            put("text", text)
            put("posted_at", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict(
            "messages", null, cv, SQLiteDatabase.CONFLICT_REPLACE
        )
        pruneOld()
    }

    // Kaydı döndürür ve siler — silinme olayında kullanılır.
    fun getAndRemove(key: String): JSONObject? {
        val db = writableDatabase
        val c = db.query("messages", null, "key=?", arrayOf(key), null, null, null)
        if (!c.moveToFirst()) { c.close(); return null }
        val obj = JSONObject().apply {
            put("package",   c.getString(c.getColumnIndexOrThrow("package")))
            put("title",     c.getString(c.getColumnIndexOrThrow("title")))
            put("text",      c.getString(c.getColumnIndexOrThrow("text")))
            put("posted_at", c.getLong(c.getColumnIndexOrThrow("posted_at")))
        }
        c.close()
        db.delete("messages", "key=?", arrayOf(key))
        return obj
    }

    private fun pruneOld() {
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        writableDatabase.delete("messages", "posted_at < ?", arrayOf(cutoff.toString()))
    }
}
