package com.convertmate.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.convertmate.model.ConversionJob
import com.convertmate.model.JobStatus

object ShareHelper {
    /** Share a single converted file via Android share sheet */
    fun shareFile(context: Context, job: ConversionJob) {
        val uri = job.resultUri ?: return
        val mime = mimeFor(job.outputFormat)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share converted file"))
    }

    /** Share ZIP of all done results */
    fun shareZip(context: Context, zipUri: Uri) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, zipUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share ZIP"))
    }

    private fun mimeFor(ext: String) = when (ext) {
        "jpg", "jpeg" -> "image/jpeg"
        "png"         -> "image/png"
        "webp"        -> "image/webp"
        "gif"         -> "image/gif"
        "mp4"         -> "video/mp4"
        "mov"         -> "video/quicktime"
        "pdf"         -> "application/pdf"
        else          -> "application/octet-stream"
    }
}
