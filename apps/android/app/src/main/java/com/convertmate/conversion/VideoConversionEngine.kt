package com.convertmate.conversion

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import androidx.core.net.toUri
import com.convertmate.model.ConversionJob
import com.convertmate.model.ConversionOptions
import com.convertmate.model.JobStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer
import java.util.UUID

/**
 * Video conversion engine using Android's MediaMuxer + MediaExtractor.
 * MOV → MP4: remux only (no re-encode), instant and lossless for H.264/AAC streams.
 * MP4 → GIF: frame extraction via MediaMetadataRetriever → Bitmap sequence → AnimatedGif.
 * 
 * For MOV→MP4 the container is changed but codec streams are preserved — fast and no quality loss.
 */
class VideoConversionEngine : ConversionEngine {
    override fun canConvert(inputFormat: String, outputFormat: String): Boolean =
        (inputFormat == "mov" && outputFormat == "mp4") ||
        (inputFormat == "mp4" && outputFormat == "gif") ||
        (inputFormat == "mp4" && outputFormat == "mov")

    override suspend fun convert(
        context: Context,
        job: ConversionJob,
        options: ConversionOptions,
        onProgress: (Int) -> Unit,
    ): ConversionJob = withContext(Dispatchers.IO) {
        try {
            val outputFile = createOutputFile(context, job.file.name, job.outputFormat)
            when {
                job.outputFormat == "gif" -> convertToGif(context, job.file.uri, outputFile, onProgress)
                else -> remuxVideo(context, job.file.uri, outputFile, onProgress)
            }
            job.copy(status = JobStatus.DONE, progress = 100, resultUri = outputFile.toUri())
        } catch (e: Exception) {
            job.copy(status = JobStatus.ERROR, error = e.message)
        }
    }

    /**
     * MOV ↔ MP4: stream-copy remux via MediaMuxer.
     * No re-encode → instant, lossless, works for H.264/AAC payloads.
     */
    private fun remuxVideo(context: Context, uri: Uri, output: File, onProgress: (Int) -> Unit) {
        val extractor = MediaExtractor()
        val fd = context.contentResolver.openFileDescriptor(uri, "r")
            ?: throw IllegalArgumentException("Cannot open URI")
        fd.use { extractor.setDataSource(it.fileDescriptor) }

        val muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val trackMap = mutableMapOf<Int, Int>()

        for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("video/") || mime.startsWith("audio/")) {
                trackMap[i] = muxer.addTrack(format)
            }
        }

        muxer.start()
        val buffer = ByteBuffer.allocate(4 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()

        trackMap.keys.forEach { extractor.selectTrack(it) }

        // Get total duration for progress
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(context, uri)
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 1L
        retriever.release()

        while (true) {
            buffer.clear()
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) break
            val trackIndex = extractor.sampleTrackIndex
            val muxTrack = trackMap[trackIndex] ?: run { extractor.advance(); continue }

            info.offset = 0
            info.size = size
            info.presentationTimeUs = extractor.sampleTime
            info.flags = extractor.sampleFlags

            muxer.writeSampleData(muxTrack, buffer, info)

            // Progress based on timestamp
            val progress = ((extractor.sampleTime.toFloat() / (durationMs * 1000f)) * 90).toInt().coerceIn(0, 90)
            onProgress(10 + progress)

            extractor.advance()
        }

        muxer.stop()
        muxer.release()
        extractor.release()
        onProgress(100)
    }

    /**
     * MP4 → GIF: extract frames at 10fps, encode as animated GIF.
     * Uses AndroidGifEncoder (pure Kotlin, no native deps).
     */
    private fun convertToGif(context: Context, uri: Uri, output: File, onProgress: (Int) -> Unit) {
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(context, uri)

        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            ?.toLong() ?: 0L
        val fps = 10
        val frameCount = ((durationMs / 1000.0) * fps).toInt().coerceAtLeast(1)
        val frameDelayMs = (1000 / fps)

        val encoder = AnimatedGifEncoder()
        encoder.setDelay(frameDelayMs)
        encoder.setRepeat(0)
        encoder.setQuality(10)
        output.outputStream().use { out ->
            encoder.start(out)
            for (i in 0 until frameCount) {
                val timeUs = (i * 1_000_000L / fps)
                val frame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                if (frame != null) {
                    // Scale down for GIF file size
                    val scaled = android.graphics.Bitmap.createScaledBitmap(
                        frame, minOf(frame.width, 480),
                        (frame.height * minOf(frame.width, 480).toFloat() / frame.width).toInt(),
                        true
                    )
                    encoder.addFrame(scaled)
                    if (scaled !== frame) scaled.recycle()
                    frame.recycle()
                }
                onProgress(10 + ((i.toFloat() / frameCount) * 85).toInt())
            }
            encoder.finish()
        }
        retriever.release()
        onProgress(100)
    }

    private fun createOutputFile(context: Context, originalName: String, outputFormat: String): File {
        val base = originalName.substringBeforeLast('.')
        val dir = File(context.cacheDir, "convertmate_output").also { it.mkdirs() }
        return File(dir, "${base}_${UUID.randomUUID().toString().take(6)}.${outputFormat}")
    }
}
