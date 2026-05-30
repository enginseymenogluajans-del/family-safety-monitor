package com.familysafety.agent

import android.content.Context
import android.content.Intent
import android.util.Log

class SafetyDeviceAdminReceiver : android.app.admin.DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device Admin aktifleştirildi")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device Admin devre dışı bırakıldı — şifre doğrulama başlatılıyor")
        val checkIntent = Intent(context, PasswordCheckActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        context.startActivity(checkIntent)
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        val prefs = context.getSharedPreferences("config", Context.MODE_PRIVATE)
        val hasPassword = prefs.getString("app_password", "").isNullOrEmpty().not()
        return if (hasPassword)
            "Bu işlem için ebeveyn şifresi gereklidir. Devam ederseniz şifre doğrulaması yapılacak."
        else
            "Uygulamayı kaldırmak için ebeveyn şifresi gereklidir."
    }
}
