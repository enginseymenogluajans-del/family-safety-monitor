package com.familysafety.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val isBoot = action == Intent.ACTION_BOOT_COMPLETED          // standart
                || action == "android.intent.action.QUICKBOOT_POWERON" // Xiaomi/HTC
                || action == "android.intent.action.LOCKED_BOOT_COMPLETED" // API 24+ şifreli cihaz
        if (!isBoot) return

        val serviceIntent = Intent(context, MainService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
