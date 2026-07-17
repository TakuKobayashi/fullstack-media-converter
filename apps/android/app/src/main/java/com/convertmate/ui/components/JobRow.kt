package com.convertmate.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.convertmate.model.ConversionJob
import com.convertmate.model.JobStatus
import com.convertmate.ui.AppColors
import com.convertmate.util.ZipHelper

@Composable
fun JobRow(
    job: ConversionJob,
    onRemove: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = job.progress / 100f,
        label = "progress_${job.id}",
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = AppColors.navy2,
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = fileEmoji(job.inputFormat), fontSize = 20.sp)

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = job.file.name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = AppColors.cream,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FormatBadge(job.inputFormat)
                        Text("→", color = AppColors.muted, fontSize = 11.sp)
                        FormatBadge(job.outputFormat, highlight = true)
                        Text(
                            text = ZipHelper.formatBytes(job.file.size),
                            color = AppColors.muted,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }

                when (job.status) {
                    JobStatus.PENDING -> {
                        Icon(Icons.Default.HourglassEmpty, null, tint = AppColors.muted, modifier = Modifier.size(18.dp))
                        IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, "Remove", tint = AppColors.muted, modifier = Modifier.size(16.dp))
                        }
                    }
                    JobStatus.PROCESSING -> {
                        CircularProgressIndicator(
                            progress = { animatedProgress },
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.5.dp,
                            color = AppColors.indigo2,
                            trackColor = AppColors.navy3,
                        )
                    }
                    JobStatus.DONE -> {
                        Icon(Icons.Default.CheckCircle, null, tint = AppColors.indigo2, modifier = Modifier.size(20.dp))
                        TextButton(onClick = onShare, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
                            Text("Share", color = AppColors.indigo3, fontSize = 12.sp)
                        }
                    }
                    JobStatus.ERROR -> {
                        Icon(Icons.Default.Error, null, tint = AppColors.coral, modifier = Modifier.size(20.dp))
                    }
                }
            }

            if (job.status == JobStatus.PROCESSING) {
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)),
                    color = AppColors.indigo2,
                    trackColor = AppColors.navy3,
                )
            }

            if (job.status == JobStatus.ERROR && job.error != null) {
                Spacer(Modifier.height(6.dp))
                Text(text = job.error, color = AppColors.coral, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun FormatBadge(format: String, highlight: Boolean = false) {
    Box(
        modifier = Modifier
            .background(
                color = if (highlight) AppColors.indigo.copy(alpha = 0.2f) else AppColors.navy3,
                shape = RoundedCornerShape(4.dp),
            )
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text = format.uppercase(),
            color = if (highlight) AppColors.indigo3 else AppColors.muted,
            fontSize = 10.sp,
        )
    }
}

private fun fileEmoji(format: String) = when (format) {
    "heic", "avif", "webp", "jpg", "jpeg", "png", "gif" -> "🖼️"
    "mp4", "mov" -> "🎬"
    "pdf" -> "📄"
    else -> "📁"
}
