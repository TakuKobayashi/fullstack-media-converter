package com.convertmate.conversion

import android.content.Context
import android.net.Uri
import com.convertmate.model.ConversionJob
import com.convertmate.model.ConversionOptions
import com.convertmate.model.JobStatus

/**
 * Platform-agnostic interface — same concept as packages/core ConversionEngine.
 * Implementations: ImageConversionEngine, VideoConversionEngine.
 */
interface ConversionEngine {
    fun canConvert(inputFormat: String, outputFormat: String): Boolean
    suspend fun convert(
        context: Context,
        job: ConversionJob,
        options: ConversionOptions,
        onProgress: (Int) -> Unit,
    ): ConversionJob
}
