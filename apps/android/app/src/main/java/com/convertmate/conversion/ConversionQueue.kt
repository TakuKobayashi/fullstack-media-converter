package com.convertmate.conversion

import android.content.Context
import com.convertmate.model.ConversionJob
import com.convertmate.model.ConversionOptions
import com.convertmate.model.JobStatus
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * Concurrency-controlled batch queue.
 * Mirrors packages/core ConversionQueue — same design, Kotlin coroutines instead of JS promises.
 */
class ConversionQueue(
    private val context: Context,
    private val imageEngine: ImageConversionEngine = ImageConversionEngine(),
    private val videoEngine: VideoConversionEngine = VideoConversionEngine(),
) {
    suspend fun runAll(
        jobs: List<ConversionJob>,
        options: ConversionOptions,
        onJobUpdate: (ConversionJob) -> Unit,
    ): List<ConversionJob> = coroutineScope {
        val semaphore = Semaphore(options.concurrency)
        jobs.map { job ->
            async {
                semaphore.withPermit {
                    onJobUpdate(job.copy(status = JobStatus.PROCESSING, progress = 0))
                    val engine = pickEngine(job.inputFormat, job.outputFormat)
                    if (engine == null) {
                        val err = job.copy(status = JobStatus.ERROR, error = "Unsupported: ${job.inputFormat} → ${job.outputFormat}")
                        onJobUpdate(err); err
                    } else {
                        val result = engine.convert(context, job, options) { p ->
                            onJobUpdate(job.copy(status = JobStatus.PROCESSING, progress = p))
                        }
                        onJobUpdate(result)
                        result
                    }
                }
            }
        }.awaitAll()
    }

    private fun pickEngine(input: String, output: String): ConversionEngine? = when {
        imageEngine.canConvert(input, output) -> imageEngine
        videoEngine.canConvert(input, output) -> videoEngine
        else -> null
    }
}
