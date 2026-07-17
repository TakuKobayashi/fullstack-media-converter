package com.convertmate.ui

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.convertmate.model.JobStatus
import com.convertmate.model.SUPPORTED_CONVERSIONS
import com.convertmate.ui.components.JobRow
import com.convertmate.util.ShareHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: ConversionViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    // Multi-file picker
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris -> if (uris.isNotEmpty()) viewModel.addFiles(uris) }

    Scaffold(
        containerColor = AppColors.navy,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .background(
                                    brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                        listOf(AppColors.indigo, AppColors.coral)
                                    ),
                                    shape = RoundedCornerShape(6.dp),
                                ),
                            contentAlignment = Alignment.Center,
                        ) { Text("⚡", fontSize = 14.sp) }
                        Text("ConvertMate", fontWeight = FontWeight.Bold, color = AppColors.cream)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AppColors.navy2,
                    titleContentColor = AppColors.cream,
                ),
                actions = {
                    if (state.jobs.isNotEmpty()) {
                        IconButton(onClick = { viewModel.clearAll() }) {
                            Icon(Icons.Default.Clear, "Clear all", tint = AppColors.muted)
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (!state.isRunning) {
                FloatingActionButton(
                    onClick = { filePicker.launch(arrayOf("image/*", "video/*")) },
                    containerColor = AppColors.indigo,
                    contentColor = AppColors.cream,
                ) {
                    Icon(Icons.Default.Add, "Add files")
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(Modifier.height(16.dp))

            // ── Controls bar ──────────────────────────────────────────
            if (state.jobs.isNotEmpty()) {
                ControlsBar(
                    outputFormat = state.outputFormat,
                    quality = state.quality,
                    concurrency = state.concurrency,
                    isRunning = state.isRunning,
                    onFormatChange = viewModel::setOutputFormat,
                    onQualityChange = viewModel::setQuality,
                    onConcurrencyChange = viewModel::setContraency,
                )
                Spacer(Modifier.height(12.dp))
            }

            // ── Action buttons ────────────────────────────────────────
            if (state.jobs.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val pendingCount = state.jobs.count { it.status == JobStatus.PENDING }
                    Button(
                        onClick = { viewModel.startConversion() },
                        enabled = !state.isRunning && pendingCount > 0,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AppColors.indigo,
                            disabledContainerColor = AppColors.navy3,
                        ),
                        shape = RoundedCornerShape(10.dp),
                    ) {
                        if (state.isRunning) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = AppColors.indigo3)
                            Spacer(Modifier.width(8.dp))
                            Text("Converting…")
                        } else {
                            Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Convert $pendingCount file${if (pendingCount != 1) "s" else ""}")
                        }
                    }

                    val doneCount = state.jobs.count { it.status == JobStatus.DONE }
                    if (doneCount > 1) {
                        OutlinedButton(
                            onClick = {
                                viewModel.buildZip()
                            },
                            shape = RoundedCornerShape(10.dp),
                            border = ButtonDefaults.outlinedButtonBorder.copy(
                                brush = androidx.compose.ui.graphics.SolidColor(AppColors.indigo),
                            ),
                        ) {
                            Icon(Icons.Default.Archive, null, tint = AppColors.indigo3, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("ZIP", color = AppColors.indigo3)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            // ── ZIP share trigger ─────────────────────────────────────
            LaunchedEffect(state.zipUri) {
                state.zipUri?.let { uri -> ShareHelper.shareZip(context, uri) }
            }

            // ── Summary row ───────────────────────────────────────────
            if (state.jobs.isNotEmpty()) {
                SummaryRow(
                    total = state.jobs.size,
                    done = state.jobs.count { it.status == JobStatus.DONE },
                    errors = state.jobs.count { it.status == JobStatus.ERROR },
                    processing = state.jobs.count { it.status == JobStatus.PROCESSING },
                )
                Spacer(Modifier.height(12.dp))
            }

            // ── Empty state ───────────────────────────────────────────
            if (state.jobs.isEmpty()) {
                EmptyState(onAddFiles = { filePicker.launch(arrayOf("image/*", "video/*")) })
            }

            // ── Job list ──────────────────────────────────────────────
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.jobs, key = { it.id }) { job ->
                    JobRow(
                        job = job,
                        onRemove = { viewModel.removeJob(job.id) },
                        onShare = { ShareHelper.shareFile(context, job) },
                    )
                }
                item { Spacer(Modifier.height(80.dp)) } // FAB clearance
            }
        }
    }
}

@Composable
private fun ControlsBar(
    outputFormat: String,
    quality: Int,
    concurrency: Int,
    isRunning: Boolean,
    onFormatChange: (String) -> Unit,
    onQualityChange: (Int) -> Unit,
    onConcurrencyChange: (Int) -> Unit,
) {
    Surface(
        color = AppColors.navy2,
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Output format selector
            val outputFormats = SUPPORTED_CONVERSIONS.map { it.to }.distinct()
            var expanded by remember { mutableStateOf(false) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Output Format", color = AppColors.muted, style = MaterialTheme.typography.labelMedium)
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { if (!isRunning) expanded = it }) {
                    OutlinedTextField(
                        value = outputFormat.uppercase(),
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.menuAnchor().width(120.dp),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = AppColors.cream),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedBorderColor = AppColors.navy3,
                            focusedBorderColor = AppColors.indigo2,
                            unfocusedContainerColor = AppColors.navy3,
                            focusedContainerColor = AppColors.navy3,
                        ),
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, containerColor = AppColors.navy2) {
                        outputFormats.forEach { fmt ->
                            DropdownMenuItem(
                                text = { Text(fmt.uppercase(), color = AppColors.cream) },
                                onClick = { onFormatChange(fmt); expanded = false },
                            )
                        }
                    }
                }
            }

            // Quality slider
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Quality", color = AppColors.muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(60.dp))
                Slider(
                    value = quality.toFloat(),
                    onValueChange = { onQualityChange(it.toInt()) },
                    valueRange = 60f..100f,
                    steps = 7,
                    enabled = !isRunning,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(
                        thumbColor = AppColors.indigo2,
                        activeTrackColor = AppColors.indigo2,
                        inactiveTrackColor = AppColors.navy3,
                    ),
                )
                Text("$quality", color = AppColors.cream, style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(28.dp))
            }

            // Concurrency selector
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Threads", color = AppColors.muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(60.dp))
                listOf(1, 2, 3, 4, 6).forEach { n ->
                    FilterChip(
                        selected = concurrency == n,
                        onClick = { if (!isRunning) onConcurrencyChange(n) },
                        label = { Text("$n") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = AppColors.indigo,
                            selectedLabelColor = AppColors.cream,
                            containerColor = AppColors.navy3,
                            labelColor = AppColors.muted,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(total: Int, done: Int, errors: Int, processing: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColors.navy2, RoundedCornerShape(10.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        SummaryItem(label = "Total", value = "$total", color = AppColors.cream)
        SummaryItem(label = "Done", value = "$done", color = AppColors.indigo2)
        if (processing > 0) SummaryItem(label = "Running", value = "$processing", color = AppColors.indigo3)
        if (errors > 0)     SummaryItem(label = "Errors", value = "$errors", color = AppColors.coral)
    }
}

@Composable
private fun SummaryItem(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text(label, color = AppColors.muted, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun EmptyState(onAddFiles: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("📂", fontSize = 56.sp)
        Text("Drop files to convert", color = AppColors.cream, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
        Text(
            "Images, videos, documents.\nBatch convert hundreds at once.",
            color = AppColors.muted,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Button(
            onClick = onAddFiles,
            colors = ButtonDefaults.buttonColors(containerColor = AppColors.indigo),
            shape = RoundedCornerShape(10.dp),
        ) {
            Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Select Files")
        }
    }
}
