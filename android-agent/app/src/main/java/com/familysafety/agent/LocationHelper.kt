package com.familysafety.agent

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object LocationHelper {
    private val client = OkHttpClient()

    @SuppressLint("MissingPermission")
    fun fetchAndSendLocation(context: Context) {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                sendLocationToServer(location)
                locationManager.removeUpdates(this)
            }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        try {
            // Önce son bilinen konumu al
            val lastLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            
            lastLocation?.let { sendLocationToServer(it) }

            // Güncel konum için istek at
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 0L, 0f, listener
            )
            locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER, 0L, 0f, listener
            )
        } catch (e: Exception) {
            Log.e("LocationHelper", "Error fetching location", e)
        }
    }

    private fun sendLocationToServer(location: Location) {
        val data = JSONObject()
        data.put("lat", location.latitude)
        data.put("lng", location.longitude)
        data.put("accuracy", location.accuracy)
        data.put("timestamp", System.currentTimeMillis())

        val requestBody = data.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder()
            .url("${Config.backendUrl}/api/location/${Config.profileId}")
            .addHeader("X-API-Key", Config.API_KEY)
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                Log.e("LocationHelper", "Failed to send location", e)
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("LocationHelper", "Location sent successfully")
            }
        })
    }
}
