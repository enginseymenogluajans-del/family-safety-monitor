package com.familysafety.agent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var projectionManager: MediaProjectionManager
    private val SCREEN_CAPTURE_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        val etUrl     = findViewById<EditText>(R.id.etBackendUrl)
        val etProfile = findViewById<EditText>(R.id.etProfileId)
        val tvStatus  = findViewById<TextView>(R.id.tvStatus)
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
            updateStatus(tvStatus)
        }

        btnPerm.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        btnStart.setOnClickListener {
            startScreenCaptureRequest()
        }

        updateStatus(tvStatus)
    }

    private fun startScreenCaptureRequest() {
        startActivityForResult(
            projectionManager.createScreenCaptureIntent(),
            SCREEN_CAPTURE_REQUEST_CODE
        )
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == SCREEN_CAPTURE_REQUEST_CODE && resultCode == Activity.RESULT_OK && data != null) {
            val projection = projectionManager.getMediaProjection(resultCode, data)
            ScreenshotHelper.setMediaProjection(projection)
            ScreenStreamManager.setMediaProjection(projection)
            
            // Servisi Başlat
            val serviceIntent = Intent(this, MainService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            Toast.makeText(this, "İzleme Başlatıldı", Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        findViewById<TextView>(R.id.tvStatus)?.let { updateStatus(it) }
    }

    private fun updateStatus(tv: TextView) {
        val enabled = isListenerEnabled()
        tv.text = buildString {
            append(if (enabled) "✓ Bildirim erişimi aktif\n" else "✗ Bildirim erişimi gerekli!\n")
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
