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
 * Canlı ekran akışı yöneticisi — MeshCentral ScreenCaptureService.kt referans alınarak yazıldı.
 *
 * Önemli değişiklikler:
 * - VirtualDisplay flags: OWN_CONTENT_ONLY | PUBLIC  (AUTO_MIRROR yerine)
 * - Frame döngüsü: setOnImageAvailableListener  (polling yerine)
 * - Rate limiting: lastEmitTime ile 500ms throttle
 */
object ScreenStreamManager {

    private const val TAG = "ScreenStreamManager"
    private const val MIN_INTERVAL_MS = 500L  // ~2 FPS
    private const val JPEG_QUALITY = 45

    private val httpClient = OkHttpClient()

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile private var streaming = false
    @Volatile private var lastEmitTime = 0L

    fun setMediaProjection(projection: MediaProjection) {
        mediaProjection = projection
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
        lastEmitTime = 0L

        // MeshCentral: arka plan thread'de kendi Looper'ı olan Handler
        handlerThread = HandlerThread("ScreenStream").also { it.start() }
        handler = Handler(handlerThread!!.looper)

        imageReader = ImageReader.newInstance(widthPx, heightPx, PixelFormat.RGBA_8888, 2)

        // MeshCentral'dan alınan flag kombinasyonu (production-tested)
        val flags = DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY or
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC

        // Handler hem createVirtualDisplay'e hem listener'a geçiliyor — MeshCentral pattern
        virtualDisplay = projection.createVirtualDisplay(
            "screencap", widthPx, heightPx, densityDpi,
            flags,
            imageReader!!.surface, null, handler
        )

        // MediaProjection durduğunda temizlik — MeshCentral MediaProjectionStopCallback
        projection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                handler?.post { stop() }
            }
        }, handler)

        // Event-driven — sistem kare hazır olduğunda çağırır (polling değil)
        imageReader!!.setOnImageAvailableListener({ reader ->
            if (!streaming) return@setOnImageAvailableListener
            val now = System.currentTimeMillis()
            if (now - lastEmitTime < MIN_INTERVAL_MS) {
                // Throttle: bu kareyi at, ama image'ı mutlaka kapat
                reader.acquireLatestImage()?.close()
                return@setOnImageAvailableListener
            }
            lastEmitTime = now
            processFrame(reader, widthPx, heightPx)
        }, handler)

        Log.d(TAG, "Ekran akışı başladı (${widthPx}x${heightPx}), flags=$flags")
    }

    // ── Akış Durdur ───────────────────────────────────────────────────────────

    fun stop() {
        streaming = false
        try {
            imageReader?.setOnImageAvailableListener(null, null)
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

    // ── Kare İşle ─────────────────────────────────────────────────────────────

    private fun processFrame(reader: ImageReader, width: Int, height: Int) {
        try {
            val image = reader.acquireLatestImage() ?: return

            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride  // RGBA_8888 → 4
            val rowStride = planes[0].rowStride      // >= width * 4 (padding olabilir)
            val rowPadding = rowStride - pixelStride * width

            // MeshCentral pattern: geniş bitmap oluştur, padding dahil
            val wideBitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888
            )
            wideBitmap.copyPixelsFromBuffer(buffer)
            image.close()

            // Sağdaki padding piksellerini kırp → asıl ekran boyutu
            val bitmap = if (rowPadding > 0) {
                Bitmap.createBitmap(wideBitmap, 0, 0, width, height)
                    .also { wideBitmap.recycle() }
            } else {
                wideBitmap
            }

            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
            bitmap.recycle()

            val jpegBytes = stream.toByteArray()
            if (jpegBytes.isEmpty()) {
                Log.w(TAG, "JPEG boş — kare atlanıyor")
                return
            }

            // Signal server (port 8001) → dashboard'a ilet
            val b64 = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
            val payload = JSONObject().apply {
                put("profileId", Config.profileId)
                put("frame", b64)
                put("ts", System.currentTimeMillis())
            }
            SocketManager.emitSignal("screen_frame", payload)
            Log.v(TAG, "Kare gönderildi: ${jpegBytes.size} bytes")

            // Supabase Storage — direkt upload + Realtime broadcast
            uploadToSupabase(jpegBytes)

        } catch (e: Exception) {
            Log.e(TAG, "processFrame hatası: ${e.message}")
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

    // ── Supabase Realtime Broadcast ───────────────────────────────────────────

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
