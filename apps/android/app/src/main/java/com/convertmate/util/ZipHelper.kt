package com.convertmate.util

import android.content.Context
import android.net.Uri
import com.convertmate.model.ConversionJob
import com.convertmate.model.JobStatus
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object ZipHelper {
    /**
     * Package all DONE job outputs into a single ZIP in the cache dir.
     * Returns the ZIP file URI for sharing.
     */
    fun zipResults(context: Context, jobs: List<ConversionJob>): Uri? {
        val done = jobs.filter { it.status == JobStatus.DONE && it.resultUri != null }
        if (done.isEmpty()) return null

        val zipFile = File(context.cacheDir, "convertmate_${System.currentTimeMillis()}.zip")
        ZipOutputStream(zipFile.outputStream().buffered()).use { zos ->
            done.forEach { job ->
                val uri = job.resultUri ?: return@forEach
                val entryName = job.file.name.substringBeforeLast('.') + ".${job.outputFormat}"
                zos.putNextEntry(ZipEntry(entryName))
                context.contentResolver.openInputStream(uri)?.use { it.copyTo(zos) }
                zos.closeEntry()
            }
        }
        return androidx.core.content.FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            zipFile,
        )
    }

    fun formatBytes(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${"%.1f".format(bytes / 1024.0)} KB"
        else -> "${"%.1f".format(bytes / 1024.0 / 1024.0)} MB"
    }
}
