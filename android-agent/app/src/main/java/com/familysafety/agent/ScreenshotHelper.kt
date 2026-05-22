package com.familysafety.agent

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream

object ScreenshotHelper {
    private var mediaProjection: MediaProjection? = null
    private val client = OkHttpClient()

    fun setMediaProjection(projection: MediaProjection) {
        this.mediaProjection = projection
    }

    fun takeScreenshot(context: Context) {
        val projection = mediaProjection ?: run {
            Log.e("ScreenshotHelper", "MediaProjection null — izin eksik olabilir")
            return
        }

        val metrics = context.resources.displayMetrics
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val density = metrics.densityDpi

        val imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        val virtualDisplay = projection.createVirtualDisplay(
            "Screenshot", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.surface, null, null
        )

        Handler(Looper.getMainLooper()).postDelayed({
            val image = imageReader.acquireLatestImage()
            if (image != null) {
                val planes = image.planes
                val buffer = planes[0].buffer
                val pixelStride = planes[0].pixelStride
                val rowStride = planes[0].rowStride
                val rowPadding = rowStride - pixelStride * width

                val bitmap = Bitmap.createBitmap(
                    width + rowPadding / pixelStride,
                    height, Bitmap.Config.ARGB_8888
                )
                bitmap.copyPixelsFromBuffer(buffer)
                image.close()
                virtualDisplay.release()

                processScreenshot(bitmap)
            }
        }, 500)
    }

    private fun processScreenshot(bitmap: Bitmap) {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
        bitmap.recycle()
        val byteArray = stream.toByteArray()

        // Dashboard'a anlık snapshot olarak gönder (signal server)
        sendSnapshotToSignal(byteArray)

        // Arka planda backend'e de yükle (Supabase bridge)
        uploadToBackend(byteArray)
    }

    // ── Signal Server'a snapshot gönder ──────────────────────────────────────

    private fun sendSnapshotToSignal(byteArray: ByteArray) {
        val b64 = Base64.encodeToString(byteArray, Base64.NO_WRAP)
        val payload = JSONObject().apply {
            put("profileId", Config.profileId)
            put("data", "data:image/jpeg;base64,$b64")
            put("ts", System.currentTimeMillis())
        }
        SocketManager.emit("snapshot", payload)
        Log.d("ScreenshotHelper", "Snapshot backend'e gönderildi (${byteArray.size} byte)")
    }

    // ── Backend upload (Supabase bridge) ─────────────────────────────────────

    private fun uploadToBackend(byteArray: ByteArray) {
        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("profileId", Config.profileId)
            .addFormDataPart(
                "image", "screenshot.jpg",
                byteArray.toRequestBody("image/jpeg".toMediaTypeOrNull(), 0, byteArray.size)
            )
            .build()

        val request = Request.Builder()
            .url("${Config.backendUrl}/upload-screenshot")
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                Log.w("ScreenshotHelper", "Backend upload başarısız, Supabase'e fallback")
                uploadToSupabaseStorage(byteArray)
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("ScreenshotHelper", "Backend upload: ${response.code}")
                response.body?.close()
            }
        })
    }

    private fun uploadToSupabaseStorage(byteArray: ByteArray) {
        val filename = "${Config.profileId}_${System.currentTimeMillis()}.jpg"
        val objectPath = "${Config.profileId}/$filename"
        val url = "${Config.SUPABASE_URL}/storage/v1/object/screenshots/$objectPath"

        val requestBody = byteArray.toRequestBody("image/jpeg".toMediaTypeOrNull())
        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .addHeader("apikey", Config.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer ${Config.SUPABASE_ANON_KEY}")
            .addHeader("x-upsert", "true")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                Log.e("ScreenshotHelper", "Supabase upload başarısız: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("ScreenshotHelper", "Supabase upload: ${response.code}")
                response.body?.close()
            }
        })
    }
}
