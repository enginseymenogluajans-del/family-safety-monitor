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
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Canlı ekran akışı yöneticisi.
 * start() → ImageReader döngüsü başlar, her kare Socket.io "screen_frame" eventiyle gönderilir.
 * stop()  → VirtualDisplay ve ImageReader serbest bırakılır.
 */
object ScreenStreamManager {

    private const val TAG = "ScreenStreamManager"
    private const val FRAME_INTERVAL_MS = 400L   // ~2.5 FPS
    private const val JPEG_QUALITY = 45           // Bant genişliği tasarrufu

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

    // ── Akış Başlat ───────────────────────────────────────────────────────────

    fun startStreaming(widthPx: Int, heightPx: Int, densityDpi: Int) {
        val projection = mediaProjection ?: run {
            Log.e(TAG, "MediaProjection null — akış başlatılamıyor")
            return
        }
        if (streaming) return
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

            val b64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
            val payload = JSONObject().apply {
                put("profileId", Config.profileId)
                put("frame", b64)
                put("ts", System.currentTimeMillis())
            }
            SocketManager.emit("screen_frame", payload)
        } catch (e: Exception) {
            Log.e(TAG, "Kare yakalanamadı: ${e.message}")
        }
    }
}
