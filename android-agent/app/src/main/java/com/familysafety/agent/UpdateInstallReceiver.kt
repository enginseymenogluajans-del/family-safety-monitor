package com.familysafety.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val url = intent.getStringExtra("download_url") ?: return
        UpdateManager(context).downloadAndInstall(url)
    }
}
