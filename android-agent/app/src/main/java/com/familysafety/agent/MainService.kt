package com.familysafety.agent

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import android.util.Log

class MainService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundNotification()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("MainService", "Service started")

        // onCreate sadece bir kere çalışır — socket bağlantısını her onStartCommand'da kontrol et
        if (!SocketManager.isSignalConnected()) {
            Log.d("MainService", "Socket bağlı değil, bağlanıyor...")
            Thread { SocketManager.connect(this) }.start()
        } else {
            Log.d("MainService", "Socket zaten bağlı")
        }

        // MediaProjection token'ı MainActivity'den al
        val resultCode = intent?.getIntExtra("resultCode", -1) ?: -1
        val projData   = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            intent?.getParcelableExtra("data", Intent::class.java)
        else
            @Suppress("DEPRECATION") intent?.getParcelableExtra("data")

        if (resultCode != -1 && projData != null) {
            val pm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val projection = pm.getMediaProjection(resultCode, projData)
            ScreenshotHelper.setMediaProjection(projection)
            ScreenStreamManager.setMediaProjection(projection)
            Log.d("MainService", "MediaProjection alındı ve ayarlandı")
        }

        return START_STICKY
    }

    private fun startForegroundNotification() {
        val channelId = "family_safety_monitor"
        val channelName = "Safety Service"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(chan)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setOngoing(true)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("Sistem Koruması Aktif")
            .setContentText("Uygulama arka planda güvenliği sağlıyor.")
            .setPriority(NotificationManager.IMPORTANCE_LOW)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(
                1, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                1, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(1, notification)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        SocketManager.disconnect()
    }
}
