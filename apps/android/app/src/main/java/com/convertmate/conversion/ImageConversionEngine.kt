package com.convertmate.conversion

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.core.net.toUri
import com.convertmate.model.ConversionJob
import com.convertmate.model.ConversionOptions
import com.convertmate.model.JobStatus
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Image conversion engine using Android's built-in Bitmap APIs.
 * Handles: JPG, PNG, WEBP, HEIC (via ImageDecoder API 28+).
 * No native libs needed for standard formats.
 */
class ImageConversionEngine : ConversionEngine {
    private val imageFormats = setOf("jpg", "jpeg", "png", "webp", "heic", "avif", "gif")

    override fun canConvert(inputFormat: String, outputFormat: String): Boolean =
        inputFormat in imageFormats && outputFormat in imageFormats

    override suspend fun convert(
        context: Context,
        job: ConversionJob,
        options: ConversionOptions,
        onProgress: (Int) -> Unit,
    ): ConversionJob {
        onProgress(10)
        return try {
            val bitmap = decodeBitmap(context, job.file.uri)
                ?: return job.copy(status = JobStatus.ERROR, error = "Failed to decode image")

            onProgress(40)

            val outputFile = createOutputFile(context, job.file.name, job.outputFormat)
            val compressFormat = when (job.outputFormat) {
                "png"  -> Bitmap.CompressFormat.PNG
                "webp" -> Bitmap.CompressFormat.WEBP_LOSSY
                else   -> Bitmap.CompressFormat.JPEG
            }

            // For JPEG output: flatten transparency onto white background
            val finalBitmap = if (compressFormat == Bitmap.CompressFormat.JPEG && bitmap.hasAlpha()) {
                flattenAlpha(bitmap)
            } else bitmap

            onProgress(70)

            FileOutputStream(outputFile).use { out ->
                finalBitmap.compress(compressFormat, options.quality, out)
            }

            if (finalBitmap !== bitmap) finalBitmap.recycle()
            bitmap.recycle()

            onProgress(100)
            job.copy(
                status = JobStatus.DONE,
                progress = 100,
                resultUri = outputFile.toUri(),
            )
        } catch (e: Exception) {
            job.copy(status = JobStatus.ERROR, error = e.message)
        }
    }

    private fun decodeBitmap(context: Context, uri: Uri): Bitmap? {
        // ImageDecoder (API 28+) handles HEIC, AVIF, WEBP natively
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            val source = android.graphics.ImageDecoder.createSource(context.contentResolver, uri)
            android.graphics.ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
                decoder.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = true
            }
        } else {
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        }
    }

    private fun flattenAlpha(src: Bitmap): Bitmap {
        val result = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(src, 0f, 0f, Paint())
        return result
    }

    private fun createOutputFile(context: Context, originalName: String, outputFormat: String): File {
        val base = originalName.substringBeforeLast('.')
        val dir = File(context.cacheDir, "convertmate_output").also { it.mkdirs() }
        return File(dir, "${base}_${UUID.randomUUID().toString().take(6)}.${outputFormat}")
    }
}
