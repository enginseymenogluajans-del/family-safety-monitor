package com.familysafety.agent

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.HandlerThread
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

object LocationHelper {
    private const val TAG = "LocationHelper"
    private const val INTERVAL_MS = 30_000L  // 30 saniyede bir güncelle
    private const val MIN_DISTANCE_M = 0f

    private val client = OkHttpClient()

    private var handlerThread: HandlerThread? = null
    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null

    @Volatile private var tracking = false

    // ── Sürekli Takip ─────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun startTracking(context: Context) {
        if (tracking) return
        tracking = true

        handlerThread = HandlerThread("LocationTracker").also { it.start() }
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationManager = lm

        locationListener = LocationListener { location ->
            Log.d(TAG, "Konum: ${location.latitude}, ${location.longitude} ±${location.accuracy}m")
            sendLocationToServer(location)
        }

        try {
            val looper = handlerThread!!.looper
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, INTERVAL_MS, MIN_DISTANCE_M,
                    locationListener!!, looper
                )
                Log.d(TAG, "GPS provider aktif")
            } else {
                Log.w(TAG, "GPS provider kapalı")
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, INTERVAL_MS, MIN_DISTANCE_M,
                    locationListener!!, looper
                )
                Log.d(TAG, "Network provider aktif")
            }

            // İlk konum: son bilinen konumu hemen gönder
            val last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            last?.let {
                Log.d(TAG, "Son bilinen konum gönderiliyor")
                sendLocationToServer(it)
            }

            Log.d(TAG, "GPS sürekli takibi başladı")
        } catch (e: Exception) {
            Log.e(TAG, "GPS başlatma hatası: ${e.message}")
        }
    }

    fun stop() {
        tracking = false
        try {
            locationListener?.let { locationManager?.removeUpdates(it) }
            handlerThread?.quitSafely()
        } catch (e: Exception) {
            Log.e(TAG, "GPS durdurma hatası: ${e.message}")
        }
        locationListener = null
        locationManager = null
        handlerThread = null
        Log.d(TAG, "GPS takibi durduruldu")
    }

    // ── Tek Seferlik (socket komutu için) ────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun fetchAndSendLocation(context: Context) {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

        val oneShot = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                sendLocationToServer(location)
                lm.removeUpdates(this)
            }
        }

        try {
            val last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            last?.let { sendLocationToServer(it) }

            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, oneShot)
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0L, 0f, oneShot)
        } catch (e: Exception) {
            Log.e(TAG, "fetchAndSendLocation hatası: ${e.message}")
        }
    }

    // ── Backend'e Gönder ─────────────────────────────────────────────────────

    private fun sendLocationToServer(location: Location) {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val data = JSONObject().apply {
            put("lat",       location.latitude)
            put("lng",       location.longitude)
            put("accuracy",  location.accuracy)
            put("timestamp", sdf.format(Date(location.time)))
        }

        val body = data.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder()
            .url("${Config.backendUrl}/api/location/${Config.profileId}")
            .addHeader("X-API-Key", Config.API_KEY)
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                Log.e(TAG, "Konum gönderilemedi: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                response.close()
                Log.d(TAG, "Konum gönderildi → HTTP ${response.code}")
            }
        })
    }
}
