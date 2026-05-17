package com.familysafety.agent

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class NotificationAgent : NotificationListenerService() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private lateinit var store: MessageStore
    private val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())

    override fun onCreate() {
        super.onCreate()
        store = MessageStore(applicationContext)
        Log.i(TAG, "NotificationAgent baslatildi")
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (pkg !in Config.watchedPackages) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString("android.title") ?: return
        val text  = extras.getCharSequence("android.text")?.toString() ?: return
        val key   = sbn.key ?: return

        store.save(key, pkg, title, text)

        val payload = JSONObject().apply {
            put("event",            "posted")
            put("package",          pkg)
            put("title",            title)
            put("text",             text)
            put("notification_key", key)
            put("timestamp",        fmt.format(Date(sbn.postTime)))
        }
        scope.launch { ApiClient.sendNotification(payload) }
    }

    override fun onNotificationRemoved(
        sbn: StatusBarNotification,
        rankingMap: RankingMap?,
        reason: Int
    ) {
        val pkg = sbn.packageName ?: return
        if (pkg !in Config.watchedPackages) return

        // reason 8 = REASON_APP_CANCEL → uygulama bildirimi kendisi kapattı = mesaj silindi
        if (reason != REASON_APP_CANCEL) return

        val saved = store.getAndRemove(sbn.key ?: return) ?: return

        val payload = JSONObject().apply {
            put("event",              "deleted")
            put("package",            pkg)
            put("title",              saved.getString("title"))
            put("text",               saved.getString("text"))
            put("notification_key",   sbn.key)
            put("timestamp",          fmt.format(Date()))
            put("original_posted_at", fmt.format(Date(saved.getLong("posted_at"))))
        }
        scope.launch { ApiClient.sendNotification(payload) }
        Log.i(TAG, "Silinen mesaj tespit edildi — $pkg: ${saved.getString("title")}")
    }

    companion object {
        private const val TAG = "NotificationAgent"
    }
}
