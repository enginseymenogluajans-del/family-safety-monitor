package com.familysafety.agent

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Canlı ekran akışı yöneticisi.
 * start() → ImageReader döngüsü başlar, her kare Socket.io "screen_frame" eventiyle gönderilir.
 * stop()  → VirtualDisplay ve ImageReader serbest bırakılır.
 */
object ScreenStreamManager {

    private const val TAG = "ScreenStreamManager"
    private const val FRAME_INTERVAL_MS = 500L   // 2 FPS — Supabase direkt upload
    private const val JPEG_QUALITY = 45

    private val httpClient = OkHttpClient()

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile
    private var streaming = false

    fun setMediaProjection(projection: MediaProjection) {
        this.mediaProjection = projection
    }

    fun isProjectionReady(): Boolean = mediaProjection != null

    // ── Akış Başlat ───────────────────────────────────────────────────────────

    fun startStreaming(widthPx: Int, heightPx: Int, densityDpi: Int) {
        val projection = mediaProjection ?: run {
            Log.e(TAG, "MediaProjection null — akış başlatılamıyor")
            return
        }
        if (streaming) {
            Log.w(TAG, "Akış zaten aktif — durdurup yeniden başlatılıyor")
            stop()
        }
        streaming = true

        handlerThread = HandlerThread("ScreenStream").also { it.start() }
        handler = Handler(handlerThread!!.looper)

        imageReader = ImageReader.newInstance(widthPx, heightPx, PixelFormat.RGBA_8888, 2)
        virtualDisplay = projection.createVirtualDisplay(
            "LiveStream", widthPx, heightPx, densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface, null, handler
        )

        scheduleNextFrame(widthPx, heightPx)
        Log.d(TAG, "Ekran akışı başladı (${widthPx}x${heightPx})")
    }

    // ── Akış Durdur ───────────────────────────────────────────────────────────

    fun stop() {
        streaming = false
        try {
            virtualDisplay?.release()
            imageReader?.close()
            handlerThread?.quitSafely()
        } catch (e: Exception) {
            Log.e(TAG, "Akış durdurulurken hata: ${e.message}")
        }
        virtualDisplay = null
        imageReader = null
        handlerThread = null
        handler = null
        Log.d(TAG, "Ekran akışı durduruldu")
    }

    // ── Kare Döngüsü ──────────────────────────────────────────────────────────

    private fun scheduleNextFrame(width: Int, height: Int) {
        if (!streaming) return
        handler?.postDelayed({
            captureAndEmit(width, height)
            scheduleNextFrame(width, height)
        }, FRAME_INTERVAL_MS)
    }

    private fun captureAndEmit(width: Int, height: Int) {
        val reader = imageReader ?: return
        try {
            val image = reader.acquireLatestImage() ?: return
            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            val rowPadding = rowStride - pixelStride * width

            val bitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)
            image.close()

            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
            bitmap.recycle()

            val jpegBytes = stream.toByteArray()

            // Socket.io — lokal ağda hızlı fallback
            val b64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
            val payload = JSONObject().apply {
                put("profileId", Config.profileId)
                put("frame", b64)
                put("ts", System.currentTimeMillis())
            }
            SocketManager.emit("screen_frame", payload)

            // Supabase Storage — direkt upload + Realtime broadcast
            uploadToSupabase(jpegBytes)
        } catch (e: Exception) {
            Log.e(TAG, "Kare yakalanamadı: ${e.message}")
        }
    }

    // ── Supabase Storage — direkt upload (üzerine yaz) ───────────────────────

    private fun uploadToSupabase(jpegBytes: ByteArray) {
        try {
            val path = "${Config.profileId}/live.jpg"
            val body = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
            val request = Request.Builder()
                .url("${Config.SUPABASE_URL}/storage/v1/object/screenshots/$path")
                .addHeader("apikey", Config.SUPABASE_SERVICE_KEY)
                .addHeader("Authorization", "Bearer ${Config.SUPABASE_SERVICE_KEY}")
                .addHeader("x-upsert", "true")
                .put(body)
                .build()
            httpClient.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                    Log.w(TAG, "Supabase upload hatası: ${e.message}")
                }
                override fun onResponse(call: okhttp3.Call, response: Response) {
                    response.close()
                    if (response.isSuccessful) broadcastToRealtime()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Supabase upload exception: ${e.message}")
        }
    }

    // ── Supabase Realtime Broadcast — dashboard'a "kare hazır" sinyali ───────

    private fun broadcastToRealtime() {
        try {
            val messages = org.json.JSONArray().apply {
                put(JSONObject().apply {
                    put("topic", "realtime:screen-${Config.profileId}")
                    put("event", "broadcast")
                    put("payload", JSONObject().apply {
                        put("event", "frame")
                        put("payload", JSONObject().apply {
                            put("ts", System.currentTimeMillis())
                            put("profileId", Config.profileId)
                        })
                    })
                })
            }
            val body = JSONObject().apply { put("messages", messages) }
                .toString().toRequestBody("application/json".toMediaTypeOrNull())
            val request = Request.Builder()
                .url("${Config.SUPABASE_URL}/realtime/v1/api/broadcast")
                .addHeader("apikey", Config.SUPABASE_SERVICE_KEY)
                .addHeader("Authorization", "Bearer ${Config.SUPABASE_SERVICE_KEY}")
                .post(body)
                .build()
            httpClient.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                    Log.w(TAG, "Realtime broadcast hatası: ${e.message}")
                }
                override fun onResponse(call: okhttp3.Call, response: Response) {
                    response.close()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Realtime broadcast exception: ${e.message}")
        }
    }
}
