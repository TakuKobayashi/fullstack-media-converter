package com.convertmate.model

import android.net.Uri

enum class JobStatus { PENDING, PROCESSING, DONE, ERROR }

data class ConversionFile(
    val id: String,
    val name: String,
    val size: Long,
    val uri: Uri,
)

data class ConversionJob(
    val id: String,
    val file: ConversionFile,
    val inputFormat: String,
    val outputFormat: String,
    val status: JobStatus = JobStatus.PENDING,
    val progress: Int = 0,
    val error: String? = null,
    val resultUri: Uri? = null,
)

data class ConversionOptions(
    val quality: Int = 92,
    val keepExif: Boolean = true,
    val concurrency: Int = 3,
)

data class ConversionRoute(val from: String, val to: String, val label: String)

val SUPPORTED_CONVERSIONS = listOf(
    ConversionRoute("webp", "jpg",  "WebP → JPG"),
    ConversionRoute("webp", "png",  "WebP → PNG"),
    ConversionRoute("png",  "jpg",  "PNG → JPG"),
    ConversionRoute("jpg",  "png",  "JPG → PNG"),
    ConversionRoute("jpeg", "png",  "JPEG → PNG"),
    ConversionRoute("heic", "jpg",  "HEIC → JPG"),
    ConversionRoute("heic", "png",  "HEIC → PNG"),
    ConversionRoute("avif", "jpg",  "AVIF → JPG"),
    ConversionRoute("avif", "png",  "AVIF → PNG"),
    ConversionRoute("mov",  "mp4",  "MOV → MP4"),
    ConversionRoute("mp4",  "gif",  "MP4 → GIF"),
    ConversionRoute("jpg",  "pdf",  "JPG → PDF"),
    ConversionRoute("png",  "pdf",  "PNG → PDF"),
)

fun guessFormat(filename: String): String =
    filename.substringAfterLast('.').lowercase()

fun canConvert(from: String, to: String): Boolean =
    SUPPORTED_CONVERSIONS.any { it.from == from && it.to == to }
