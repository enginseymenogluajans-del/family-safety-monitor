package com.familysafety.agent

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import org.json.JSONObject

object MicrophoneManager {

    private const val TAG = "MicrophoneManager"
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT

    @Volatile private var recording = false
    private var audioRecord: AudioRecord? = null
    private var recordThread: Thread? = null

    fun startRecording(context: Context) {
        if (recording) return
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Mikrofon izni yok")
            return
        }

        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBuf == AudioRecord.ERROR || minBuf == AudioRecord.ERROR_BAD_VALUE) {
            Log.e(TAG, "AudioRecord desteklenmiyor")
            return
        }
        val bufferSize = minBuf.coerceAtLeast(SAMPLE_RATE * 2)

        val ar = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )
        } catch (e: Exception) {
            Log.e(TAG, "AudioRecord oluşturulamadı: ${e.message}")
            return
        }

        if (ar.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord başlatılamadı")
            ar.release()
            return
        }

        audioRecord = ar
        recording = true

        recordThread = Thread {
            try {
                ar.startRecording()
                Log.d(TAG, "Mikrofon kaydı başladı — ${SAMPLE_RATE}Hz mono PCM16")

                val chunkSize = SAMPLE_RATE * 2  // 1 saniyelik PCM 16-bit mono
                val buffer = ByteArray(chunkSize)

                while (recording) {
                    var offset = 0
                    while (offset < chunkSize && recording) {
                        val read = ar.read(buffer, offset, chunkSize - offset)
                        if (read > 0) offset += read else break
                    }
                    if (offset > 0) sendChunk(buffer.copyOf(offset))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Kayıt thread hatası: ${e.message}")
            } finally {
                try { ar.stop() } catch (_: Exception) {}
                ar.release()
                audioRecord = null
                recording = false
                Log.d(TAG, "Mikrofon kaydı durdu")
            }
        }.also { it.start() }
    }

    fun stopRecording() {
        if (!recording) return
        recording = false
        recordThread?.join(2000)
        recordThread = null
        Log.d(TAG, "Mikrofon durduruldu")
    }

    private fun sendChunk(pcmBytes: ByteArray) {
        val b64 = Base64.encodeToString(pcmBytes, Base64.NO_WRAP)
        val payload = JSONObject().apply {
            put("profileId", Config.profileId)
            put("chunk", b64)
            put("sampleRate", SAMPLE_RATE)
            put("ts", System.currentTimeMillis())
        }
        SocketManager.emit("audio_frame", payload)
    }
}
