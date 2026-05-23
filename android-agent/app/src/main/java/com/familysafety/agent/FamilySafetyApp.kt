package com.familysafety.agent

import android.app.Application
import android.util.Log

class FamilySafetyApp : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.e("FSA", "Application onCreate — uygulama başlatıldı")

        // Global uncaught exception handler — crash'i Logcat'e yaz
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("FSA", "UNCAUGHT EXCEPTION [${thread.name}]: ${throwable.message}", throwable)
            // Tüm stack trace'i yaz
            throwable.cause?.let { Log.e("FSA", "Caused by: ${it.message}", it) }
            // Sisteme ilet (normal crash dialog gösterir)
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
