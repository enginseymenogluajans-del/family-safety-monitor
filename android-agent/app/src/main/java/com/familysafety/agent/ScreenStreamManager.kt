package com.familysafety.agent

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Build
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService

/**
 * Canlı ekran akışı — scrcpy SurfaceEncoder yaklaşımı
 *
 * Siyah ekran sorunu nedeni: ImageReader(RGBA_8888) CPU buffer yolu,
 * bazı cihazlarda VirtualDisplay render başlamadan önce siyah frame döner.
 *
 * Çözüm: MediaCodec.createInputSurface() → GPU Surface → VirtualDisplay
 * GPU doğrudan encoder surface'ına render eder, CPU copy yok, siyah ekran yok.
 *
 * Çift VirtualDisplay mimarisi:
 *   1. primaryVd  → encoder surface (tam çözünürlük, H.264)  → Socket.io
 *   2. snapshotVd → ImageReader    (1/4 çözünürlük, JPEG)    → Supabase
 */
object ScreenStreamManager {

    private const val TAG = "ScreenStreamManager"
    private const val SNAP_DIVIDER = 4       // Supabase snapshot çözünürlüğü 1/4
    private const val SUPABASE_EVERY_N = 30  // Her N H.264 karede bir JPEG snapshot (~2s)

    private val httpClient = OkHttpClient()

    private var mediaProjection: MediaProjection? = null
    private var encoder: MediaCodec? = null
    private var primaryVd: VirtualDisplay? = null
    private var snapshotReader: ImageReader? = null
    private var snapshotVd: VirtualDisplay? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var snapshotExecutor: ExecutorService? = null

    @Volatile private var streaming = false
    @Volatile private var frameCount = 0

    fun setMediaProjection(projection: MediaProjection) {
        mediaProjection = projection
    }

    fun isProjectionReady(): Boolean = mediaProjection != null

    // ── Akış Başlat ──────────────────────────────────────────────────────────

    fun startStreaming(widthPx: Int, heightPx: Int, densityDpi: Int) {
        val projection = mediaProjection ?: run {
            Log.e(TAG, "MediaProjection null — akış başlatılamıyor")
            return
        }
        if (streaming) stop()
        streaming = true
        frameCount = 0

        handlerThread = HandlerThread("ScreenStream").also { it.start() }
        handler = Handler(handlerThread!!.looper)
        snapshotExecutor = Executors.newSingleThreadExecutor()

        // ── MediaCodec H.264 encoder (scrcpy SurfaceEncoder yaklaşımı) ────────
        val format = MediaFormat.createVideoFormat(
            MediaFormat.MIMETYPE_VIDEO_AVC, widthPx, heightPx
        ).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, 2_000_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 20)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
            )
            // scrcpy: ilk kareyi 100ms içinde gönder, kötü kalite sonrası recover
            setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L)
            // scrcpy: gerçek zamanlı öncelik (API 23+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                setInteger(MediaFormat.KEY_PRIORITY, 0)
            }
            // scrcpy: 1 kare tampon — minimum gecikme (API 26+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                setInteger(MediaFormat.KEY_LATENCY, 1)
            }
        }

        val enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        enc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val encoderSurface = enc.createInputSurface()

        // Async callback — H.264 buffer'larını alır ve iletir
        enc.setCallback(object : MediaCodec.Callback() {
            // Surface mode: encoder giriş GPU tarafından yönetilir
            override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {}

            override fun onOutputBufferAvailable(
                codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo
            ) {
                if (!streaming) {
                    codec.releaseOutputBuffer(index, false)
                    return
                }
                try {
                    val buf = codec.getOutputBuffer(index) ?: return
                    if (info.size > 0) {
                        val bytes = ByteArray(info.size)
                        buf.get(bytes)
                        sendH264Frame(bytes, info)

                        val n = ++frameCount
                        if (n % SUPABASE_EVERY_N == 0) {
                            // Encoder thread'ini bloke etmemek için ayrı thread'de çalıştır
                            snapshotExecutor?.execute { captureSnapshotForSupabase() }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "onOutputBufferAvailable hata: ${e.message}")
                } finally {
                    codec.releaseOutputBuffer(index, false)
                }
            }

            override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
                Log.d(TAG, "Encoder format: $format")
            }

            override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
                Log.e(TAG, "MediaCodec hatası: ${e.diagnosticInfo}")
            }
        }, handler)

        enc.start()
        encoder = enc

        // ── VirtualDisplay 1: encoder surface (tam çözünürlük, GPU yolu) ──────
        primaryVd = projection.createVirtualDisplay(
            "ScreenCapture", widthPx, heightPx, densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            encoderSurface, null, handler
        )

        // ── VirtualDisplay 2: snapshot (1/4 çözünürlük, JPEG Supabase) ────────
        val snapW = ((widthPx / SNAP_DIVIDER) and 1.inv())   // çift sayıya yuvarlama
        val snapH = ((heightPx / SNAP_DIVIDER) and 1.inv())
        snapshotReader = ImageReader.newInstance(snapW, snapH, PixelFormat.RGBA_8888, 2)
        snapshotVd = projection.createVirtualDisplay(
            "ScreenSnapshot", snapW, snapH, densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            snapshotReader!!.surface, null, handler
        )

        projection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                handler?.post {
                    mediaProjection = null
                    stop()
                }
            }
        }, handler)

        Log.d(TAG, "MediaCodec akışı başladı: ${widthPx}x${heightPx} snapshot:${snapW}x${snapH}")
    }

    // ── Akış Durdur ──────────────────────────────────────────────────────────

    fun stop() {
        streaming = false
        try {
            primaryVd?.release()
            snapshotVd?.release()
            snapshotReader?.close()
            encoder?.stop()
            encoder?.release()
            handlerThread?.quitSafely()
            snapshotExecutor?.shutdown()
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Durdurma hatası: ${e.message}")
        }
        primaryVd = null
        snapshotVd = null
        snapshotReader = null
        encoder = null
        handlerThread = null
        handler = null
        snapshotExecutor = null
        mediaProjection = null
        Log.d(TAG, "Ekran akışı durduruldu")
    }

    // ── H.264 frame → Socket.io ──────────────────────────────────────────────

    private fun sendH264Frame(bytes: ByteArray, info: MediaCodec.BufferInfo) {
        val isConfig   = (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
        val isKeyFrame = (info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val payload = JSONObject().apply {
            put("profileId", Config.profileId)
            put("frame", b64)
            put("ts", System.currentTimeMillis())
            put("isKeyFrame", isKeyFrame)
            put("isConfig", isConfig)
        }
        SocketManager.emitSignal("screen_frame", payload)
        Log.v(TAG, "H.264: ${bytes.size}B keyFrame=$isKeyFrame config=$isConfig")
    }

    // ── Snapshot → Supabase JPEG ─────────────────────────────────────────────

    private fun captureSnapshotForSupabase() {
        val reader = snapshotReader ?: return
        val image = reader.acquireLatestImage() ?: return
        var wideBmp: Bitmap? = null
        var bitmap: Bitmap? = null
        try {
            val plane      = image.planes[0]
            val buf        = plane.buffer
            val pixStride  = plane.pixelStride
            val rowStride  = plane.rowStride
            val rowPadding = rowStride - pixStride * image.width
            val bmpW       = image.width + rowPadding / pixStride

            wideBmp = Bitmap.createBitmap(bmpW, image.height, Bitmap.Config.ARGB_8888)
            wideBmp.copyPixelsFromBuffer(buf)

            bitmap = if (rowPadding > 0) {
                Bitmap.createBitmap(wideBmp, 0, 0, image.width, image.height)
                    .also { wideBmp?.recycle(); wideBmp = null }
            } else wideBmp.also { wideBmp = null }

            val out = ByteArrayOutputStream(image.width * image.height / 8)
            bitmap?.compress(Bitmap.CompressFormat.JPEG, 50, out)
            val jpegBytes = out.toByteArray()
            if (jpegBytes.isNotEmpty()) uploadToSupabase(jpegBytes)

        } catch (e: Exception) {
            Log.e(TAG, "Snapshot hatası: ${e.message}")
        } finally {
            image.close()
            wideBmp?.recycle()
            bitmap?.recycle()
        }
    }

    // ── Supabase Storage upload ───────────────────────────────────────────────

    private fun uploadToSupabase(jpegBytes: ByteArray) {
        try {
            val path  = "${Config.profileId}/live.jpg"
            val body  = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
            val req   = Request.Builder()
                .url("${Config.SUPABASE_URL}/storage/v1/object/screenshots/$path")
                .addHeader("apikey", Config.SUPABASE_SERVICE_KEY)
                .addHeader("Authorization", "Bearer ${Config.SUPABASE_SERVICE_KEY}")
                .addHeader("x-upsert", "true")
                .put(body)
                .build()
            httpClient.newCall(req).enqueue(object : Callback {
                override fun onFailure(call: okhttp3.Call, e: IOException) {
                    Log.w(TAG, "Supabase upload hatası: ${e.message}")
                }
                override fun onResponse(call: okhttp3.Call, response: Response) {
                    if (response.isSuccessful) { response.close(); broadcastToRealtime() }
                    else { Log.e(TAG, "Supabase HTTP ${response.code}"); response.close() }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Supabase upload exception: ${e.message}")
        }
    }

    // ── Supabase Realtime broadcast ───────────────────────────────────────────

    private fun broadcastToRealtime() {
        try {
            val messages = JSONArray().apply {
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
            val req = Request.Builder()
                .url("${Config.SUPABASE_URL}/realtime/v1/api/broadcast")
                .addHeader("apikey", Config.SUPABASE_SERVICE_KEY)
                .addHeader("Authorization", "Bearer ${Config.SUPABASE_SERVICE_KEY}")
                .post(body)
                .build()
            httpClient.newCall(req).enqueue(object : Callback {
                override fun onFailure(call: okhttp3.Call, e: IOException) {}
                override fun onResponse(call: okhttp3.Call, response: Response) { response.close() }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Realtime broadcast exception: ${e.message}")
        }
    }
}
