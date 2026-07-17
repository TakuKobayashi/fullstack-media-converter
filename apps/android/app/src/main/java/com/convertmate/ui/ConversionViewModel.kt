package com.convertmate.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.convertmate.conversion.ConversionQueue
import com.convertmate.model.ConversionFile
import com.convertmate.model.ConversionJob
import com.convertmate.model.ConversionOptions
import com.convertmate.model.JobStatus
import com.convertmate.model.SUPPORTED_CONVERSIONS
import com.convertmate.model.guessFormat
import com.convertmate.util.ZipHelper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class UiState(
    val jobs: List<ConversionJob> = emptyList(),
    val outputFormat: String = "jpg",
    val quality: Int = 92,
    val concurrency: Int = 3,
    val isRunning: Boolean = false,
    val zipUri: Uri? = null,
    val errorMessage: String? = null,
)

class ConversionViewModel(app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val queue = ConversionQueue(app.applicationContext)

    // ── File management ──────────────────────────────────────────────

    fun addFiles(uris: List<Uri>) {
        val context = getApplication<Application>()
        val newJobs = uris.mapNotNull { uri ->
            val name = resolveFileName(context, uri) ?: return@mapNotNull null
            val size = resolveFileSize(context, uri)
            val inputFmt = guessFormat(name)
            // Only add if at least one route exists from this format
            if (SUPPORTED_CONVERSIONS.none { it.from == inputFmt }) return@mapNotNull null
            // Auto-pick the first valid output format if current selection is incompatible
            val outFmt = _state.value.outputFormat.let { current ->
                if (SUPPORTED_CONVERSIONS.any { it.from == inputFmt && it.to == current }) current
                else SUPPORTED_CONVERSIONS.first { it.from == inputFmt }.to
            }
            ConversionJob(
                id = UUID.randomUUID().toString(),
                file = ConversionFile(UUID.randomUUID().toString(), name, size, uri),
                inputFormat = inputFmt,
                outputFormat = outFmt,
            )
        }
        _state.update { it.copy(jobs = it.jobs + newJobs, zipUri = null) }
    }

    fun removeJob(id: String) {
        _state.update { it.copy(jobs = it.jobs.filter { j -> j.id != id }) }
    }

    fun clearAll() {
        _state.update { UiState(outputFormat = it.outputFormat, quality = it.quality, concurrency = it.concurrency) }
    }

    fun setOutputFormat(fmt: String) {
        _state.update { state ->
            val updatedJobs = state.jobs.map { job ->
                if (job.status == JobStatus.PENDING) job.copy(outputFormat = fmt) else job
            }
            state.copy(outputFormat = fmt, jobs = updatedJobs)
        }
    }

    fun setQuality(q: Int) { _state.update { it.copy(quality = q) } }
    fun setContraency(c: Int) { _state.update { it.copy(concurrency = c) } }
    fun dismissError() { _state.update { it.copy(errorMessage = null) } }

    // ── Conversion ───────────────────────────────────────────────────

    fun startConversion() {
        val pending = _state.value.jobs.filter { it.status == JobStatus.PENDING }
        if (pending.isEmpty() || _state.value.isRunning) return

        _state.update { it.copy(isRunning = true, zipUri = null) }
        val options = ConversionOptions(
            quality = _state.value.quality,
            concurrency = _state.value.concurrency,
        )

        viewModelScope.launch {
            queue.runAll(pending, options) { updatedJob ->
                _state.update { state ->
                    state.copy(jobs = state.jobs.map { if (it.id == updatedJob.id) updatedJob else it })
                }
            }
            _state.update { it.copy(isRunning = false) }
        }
    }

    fun buildZip() {
        viewModelScope.launch {
            val context = getApplication<Application>()
            val uri = ZipHelper.zipResults(context, _state.value.jobs)
            _state.update { it.copy(zipUri = uri) }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun resolveFileName(context: android.content.Context, uri: Uri): String? {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && idx >= 0) return cursor.getString(idx)
        }
        return uri.lastPathSegment
    }

    private fun resolveFileSize(context: android.content.Context, uri: Uri): Long {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
            if (cursor.moveToFirst() && idx >= 0) return cursor.getLong(idx)
        }
        return 0L
    }

    val doneCount get() = _state.value.jobs.count { it.status == JobStatus.DONE }
    val errorCount get() = _state.value.jobs.count { it.status == JobStatus.ERROR }
    val pendingCount get() = _state.value.jobs.count { it.status == JobStatus.PENDING }
}
