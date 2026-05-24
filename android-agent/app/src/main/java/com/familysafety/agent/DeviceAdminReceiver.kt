package com.familysafety.agent

import android.content.Context
import android.content.Intent
import android.util.Log

class SafetyDeviceAdminReceiver : android.app.admin.DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device Admin aktifleştirildi")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.d("DeviceAdmin", "Device Admin devre dışı bırakıldı")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Uygulamayı kaldırmak için ebeveyn şifresi gereklidir."
    }
}
