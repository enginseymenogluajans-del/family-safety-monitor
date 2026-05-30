package com.familysafety.agent

import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class PasswordCheckActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("config", MODE_PRIVATE)
        val savedPassword = prefs.getString("app_password", "") ?: ""

        if (savedPassword.isEmpty()) {
            // Şifre ayarlanmamış, device admin devre dışı kalabilir
            finish()
            return
        }

        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            hint = "Ebeveyn şifresi"
        }

        AlertDialog.Builder(this)
            .setTitle("Koruma Şifresi")
            .setMessage("Device Admin devre dışı bırakmak için şifreyi girin:")
            .setView(input)
            .setPositiveButton("Onayla") { _, _ ->
                if (input.text.toString() == savedPassword) {
                    // Doğru şifre — device admin disabled olarak kalabilir
                    finish()
                } else {
                    Toast.makeText(this, "Yanlış şifre! Koruma yeniden aktifleştiriliyor.", Toast.LENGTH_LONG).show()
                    requestDeviceAdmin()
                    finish()
                }
            }
            .setNegativeButton("İptal") { _, _ ->
                requestDeviceAdmin()
                finish()
            }
            .setOnCancelListener {
                requestDeviceAdmin()
                finish()
            }
            .show()
    }

    private fun requestDeviceAdmin() {
        val comp = ComponentName(this, SafetyDeviceAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, comp)
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Uygulamanın güvenli çalışması için Cihaz Yöneticisi yetkisi gereklidir.")
        }
        startActivity(intent)
    }
}
