package com.familysafety.agent

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream

object ScreenshotHelper {
    private var mediaProjection: MediaProjection? = null
    private val client = OkHttpClient()

    fun setMediaProjection(projection: MediaProjection) {
        this.mediaProjection = projection
    }

    fun takeScreenshot(context: Context) {
        val projection = mediaProjection ?: run {
            Log.e("ScreenshotHelper", "MediaProjection is null. Permission might be missing.")
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

        // Küçük bir gecikme ekranın render edilmesi için iyidir
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

                // Sunucuya gönder
                uploadScreenshot(bitmap)
            }
        }, 500)
    }

    private fun uploadScreenshot(bitmap: Bitmap) {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
        val byteArray = stream.toByteArray()

        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("profileId", Config.profileId)
            .addFormDataPart("image", "screenshot.jpg", 
                byteArray.toRequestBody("image/jpeg".toMediaTypeOrNull(), 0, byteArray.size))
            .build()

        val request = Request.Builder()
            .url("${Config.backendUrl}/upload-screenshot")
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                Log.e("ScreenshotHelper", "Upload failed", e)
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("ScreenshotHelper", "Upload success: ${response.body?.string()}")
            }
        })
    }
}
