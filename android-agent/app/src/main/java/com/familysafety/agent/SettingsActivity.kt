package com.familysafety.agent

import android.app.AlertDialog
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class SettingsActivity : AppCompatActivity() {

    private val http = OkHttpClient()
    private val json = "application/json".toMediaType()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val prefs = getSharedPreferences("config", MODE_PRIVATE)

        // ── Geri butonu ─────────────────────────────────────────────────────
        findViewById<ImageButton>(R.id.btnBack).setOnClickListener { finish() }

        // ── Profil bilgileri ─────────────────────────────────────────────────
        val tvBackendUrl = findViewById<TextView>(R.id.tvBackendUrlInfo)
        val tvProfileId  = findViewById<TextView>(R.id.tvProfileIdInfo)
        tvBackendUrl.text = Config.backendUrl
        tvProfileId.text  = Config.profileId

        // ── Bağlantı ─────────────────────────────────────────────────────────
        findViewById<Button>(R.id.btnRefreshConnection).setOnClickListener {
            Thread {
                SocketManager.connect(this)
            }.start()
            Toast.makeText(this, "Bağlantı yenileniyor…", Toast.LENGTH_SHORT).show()
        }

        findViewById<Button>(R.id.btnLogin).setOnClickListener {
            CoroutineScope(Dispatchers.IO).launch {
                val ok = testBackendConnection()
                withContext(Dispatchers.Main) {
                    if (ok) Toast.makeText(this@SettingsActivity, "Backend bağlantısı başarılı ✓", Toast.LENGTH_SHORT).show()
                    else    Toast.makeText(this@SettingsActivity, "Bağlantı başarısız. URL'yi kontrol edin.", Toast.LENGTH_LONG).show()
                }
            }
        }

        findViewById<Button>(R.id.btnLogout).setOnClickListener {
            SocketManager.disconnect()
            prefs.edit().remove("backend_url").remove("profile_id").apply()
            Config.backendUrl = "http://192.168.1.175:8000"
            Config.profileId  = "default"
            tvBackendUrl.text = Config.backendUrl
            tvProfileId.text  = Config.profileId
            Toast.makeText(this, "Çıkış yapıldı.", Toast.LENGTH_SHORT).show()
        }

        // ── Şifre değiştir ───────────────────────────────────────────────────
        val etCurrent = findViewById<EditText>(R.id.etCurrentPassword)
        val etNew     = findViewById<EditText>(R.id.etNewPassword)
        val etConfirm = findViewById<EditText>(R.id.etConfirmPassword)

        // Dashboard şifresi SharedPreferences'ta yoktur (sadece .env'de).
        // Bu panel uygulama kaldırma şifresini (app_password) değiştirir.
        // Dashboard şifresini değiştirmek için backend .env düzenlenmeli.
        findViewById<Button>(R.id.btnChangePassword).setOnClickListener {
            val current = etCurrent.text.toString()
            val newPwd  = etNew.text.toString()
            val confirm = etConfirm.text.toString()
            val saved   = prefs.getString("app_password", "") ?: ""

            if (newPwd != confirm) {
                Toast.makeText(this, "Şifreler eşleşmiyor!", Toast.LENGTH_SHORT).show(); return@setOnClickListener
            }
            if (newPwd.length < 4) {
                Toast.makeText(this, "Şifre en az 4 karakter olmalı.", Toast.LENGTH_SHORT).show(); return@setOnClickListener
            }
            if (saved.isNotEmpty() && current != saved) {
                Toast.makeText(this, "Mevcut şifre yanlış!", Toast.LENGTH_SHORT).show(); return@setOnClickListener
            }
            prefs.edit().putString("app_password", newPwd).apply()
            syncAppPasswordToBackend(newPwd)
            etCurrent.text.clear(); etNew.text.clear(); etConfirm.text.clear()
            Toast.makeText(this, "Şifre güncellendi ✓", Toast.LENGTH_SHORT).show()
            updateAppPasswordStatus()
        }

        // ── Şifre ipucu ──────────────────────────────────────────────────────
        val tvHint  = findViewById<TextView>(R.id.tvCurrentHint)
        val etHint  = findViewById<EditText>(R.id.etPasswordHint)

        val savedHint = prefs.getString("password_hint", "") ?: ""
        tvHint.text = if (savedHint.isNotEmpty()) "İpucu: $savedHint" else "İpucu yok"

        findViewById<Button>(R.id.btnSaveHint).setOnClickListener {
            val hint = etHint.text.toString().trim()
            prefs.edit().putString("password_hint", hint).apply()
            tvHint.text = if (hint.isNotEmpty()) "İpucu: $hint" else "İpucu yok"
            etHint.text.clear()
            Toast.makeText(this, "İpucu kaydedildi ✓", Toast.LENGTH_SHORT).show()
        }

        // ── Gizli Mod ────────────────────────────────────────────────────────────
        val tvIconStatus = findViewById<TextView>(R.id.tvIconStatus)
        tvIconStatus.text = if (isIconHidden()) "✗ Simge gizli" else "✓ Simge görünür"
        tvIconStatus.setTextColor(if (isIconHidden()) 0xFFF44336.toInt() else 0xFF4CAF50.toInt())

        findViewById<Button>(R.id.btnToggleIcon).setOnClickListener {
            showHideIconSection()
        }

        // ── Uygulama kaldırma şifresi ────────────────────────────────────────
        updateAppPasswordStatus()

        val etAppPwd = findViewById<EditText>(R.id.etAppPassword)

        findViewById<Button>(R.id.btnSetAppPassword).setOnClickListener {
            val pwd = etAppPwd.text.toString().trim()
            if (pwd.length < 4) {
                Toast.makeText(this, "Şifre en az 4 karakter olmalı.", Toast.LENGTH_SHORT).show(); return@setOnClickListener
            }
            prefs.edit().putString("app_password", pwd).apply()
            syncAppPasswordToBackend(pwd)
            etAppPwd.text.clear()
            Toast.makeText(this, "Uygulama şifresi ayarlandı ✓", Toast.LENGTH_SHORT).show()
            updateAppPasswordStatus()
        }

        findViewById<Button>(R.id.btnClearAppPassword).setOnClickListener {
            prefs.edit().remove("app_password").apply()
            syncAppPasswordToBackend("")
            Toast.makeText(this, "Şifre kaldırıldı.", Toast.LENGTH_SHORT).show()
            updateAppPasswordStatus()
        }
    }

    private fun updateAppPasswordStatus() {
        val prefs   = getSharedPreferences("config", MODE_PRIVATE)
        val hasPass = prefs.getString("app_password", "").isNullOrEmpty().not()
        val tv      = findViewById<TextView>(R.id.tvAppPasswordStatus)
        tv.text = if (hasPass) "✓ Şifre aktif" else "Şifre ayarlanmamış"
        tv.setTextColor(if (hasPass) 0xFF4CAF50.toInt() else 0xFF888888.toInt())
    }

    private fun syncAppPasswordToBackend(password: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val body = JSONObject().apply { put("password", password) }
                    .toString().toRequestBody(json)
                val req = Request.Builder()
                    .url("${Config.backendUrl}/api/app-password/${Config.profileId}")
                    .post(body)
                    .addHeader("X-API-Key", Config.API_KEY)
                    .build()
                http.newCall(req).execute().close()
            } catch (_: Exception) {}
        }
    }

    private fun testBackendConnection(): Boolean {
        return try {
            val req = Request.Builder()
                .url("${Config.backendUrl}/health")
                .addHeader("X-API-Key", Config.API_KEY)
                .build()
            http.newCall(req).execute().use { it.isSuccessful }
        } catch (_: Exception) { false }
    }

    private fun isIconHidden(): Boolean {
        val alias = ComponentName(this, "${packageName}.MainActivityAlias")
        return packageManager.getComponentEnabledSetting(alias) ==
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }

    private fun setIconHidden(hide: Boolean) {
        val alias = ComponentName(this, "${packageName}.MainActivityAlias")
        val state = if (hide)
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        else
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        packageManager.setComponentEnabledSetting(alias, state, PackageManager.DONT_KILL_APP)
    }

    fun showHideIconSection() {
        val hidden = isIconHidden()
        AlertDialog.Builder(this)
            .setTitle("Uygulama Simgesi")
            .setMessage(
                if (hidden) "Simge şu an GİZLİ.\n\nUygulamayı yeniden göstermek istiyor musunuz?"
                else "Simgeyi ana ekrandan gizlemek istiyor musunuz?\n\nUygulamayı açmak için: Ayarlar → Uygulamalar → Family Safety Agent"
            )
            .setPositiveButton(if (hidden) "Göster" else "Gizle") { _, _ ->
                setIconHidden(!hidden)
                Toast.makeText(
                    this,
                    if (!hidden) "Simge gizlendi." else "Simge gösterildi.",
                    Toast.LENGTH_LONG
                ).show()
            }
            .setNegativeButton("İptal", null)
            .show()
    }
}
