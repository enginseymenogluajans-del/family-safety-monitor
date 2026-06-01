package com.familysafety.agent

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class UpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "UpdateManager"
        private const val CHANNEL_ID = "ota_updates"
        private const val NOTIF_ID_CHECK = 9001
        private const val NOTIF_ID_PROGRESS = 9002
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun checkForUpdates() {
        Thread {
            try {
                val currentBuild = BuildConfig.VERSION_CODE
                val response = client.newCall(
                    Request.Builder()
                        .url("${Config.backendUrl}/api/app/version")
                        .addHeader("X-API-Key", Config.API_KEY)
                        .build()
                ).execute()

                if (!response.isSuccessful) return@Thread

                val body = response.body?.string() ?: return@Thread
                val json = JSONObject(body)
                val serverBuild = json.optString("build", "0").toIntOrNull() ?: 0
                val serverVersion = json.optString("version", "")
                val changelog = json.optString("changelog", "")
                val downloadUrl = json.optString("url", "")

                if (serverBuild > currentBuild) {
                    Log.i(TAG, "Güncelleme mevcut: v$serverVersion (build $serverBuild)")
                    showUpdateNotification(serverVersion, changelog, downloadUrl)
                } else {
                    Log.i(TAG, "Uygulama güncel (build $currentBuild)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Güncelleme kontrolü başarısız: ${e.message}")
            }
        }.start()
    }

    fun downloadAndInstall(downloadUrl: String) {
        Thread {
            try {
                createNotificationChannel()
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

                val progressBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download)
                    .setContentTitle("Family Guard güncelleniyor")
                    .setContentText("APK indiriliyor...")
                    .setProgress(100, 0, true)
                    .setOngoing(true)

                nm.notify(NOTIF_ID_PROGRESS, progressBuilder.build())

                val response = client.newCall(
                    Request.Builder()
                        .url(downloadUrl)
                        .addHeader("X-API-Key", Config.API_KEY)
                        .build()
                ).execute()

                if (!response.isSuccessful) {
                    nm.cancel(NOTIF_ID_PROGRESS)
                    Log.e(TAG, "APK indirme başarısız: ${response.code}")
                    return@Thread
                }

                val apkFile = File(context.getExternalFilesDir(null), "family-guard-update.apk")
                response.body?.byteStream()?.use { input ->
                    apkFile.outputStream().use { output ->
                        val total = response.body?.contentLength() ?: -1L
                        var downloaded = 0L
                        val buffer = ByteArray(8192)
                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (total > 0) {
                                val pct = (downloaded * 100 / total).toInt()
                                progressBuilder.setProgress(100, pct, false)
                                    .setContentText("İndiriliyor... %$pct")
                                nm.notify(NOTIF_ID_PROGRESS, progressBuilder.build())
                            }
                        }
                    }
                }

                nm.cancel(NOTIF_ID_PROGRESS)
                Log.i(TAG, "APK indirildi: ${apkFile.absolutePath}")
                installApk(apkFile)

            } catch (e: Exception) {
                Log.e(TAG, "İndirme hatası: ${e.message}")
            }
        }.start()
    }

    private fun installApk(apkFile: File) {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        context.startActivity(intent)
    }

    private fun showUpdateNotification(version: String, changelog: String, downloadUrl: String) {
        createNotificationChannel()

        val installIntent = Intent(context, UpdateInstallReceiver::class.java).apply {
            putExtra("download_url", downloadUrl)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, 0, installIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Family Guard v$version hazır")
            .setContentText(changelog.ifBlank { "Yeni güncelleme mevcut" })
            .setStyle(NotificationCompat.BigTextStyle().bigText(changelog))
            .addAction(0, "GÜNCELLE", pendingIntent)
            .setAutoCancel(true)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID_CHECK, notif)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Uygulama Güncellemeleri",
                NotificationManager.IMPORTANCE_HIGH
            )
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }
}
