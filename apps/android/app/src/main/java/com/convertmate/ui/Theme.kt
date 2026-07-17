package com.convertmate.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Mirror the Web design system: navy + indigo + coral
private val Navy     = Color(0xFF0D1117)
private val Navy2    = Color(0xFF161B22)
private val Navy3    = Color(0xFF21262D)
private val Indigo   = Color(0xFF6E40C9)
private val Indigo2  = Color(0xFF8B5CF6)
private val Indigo3  = Color(0xFFA78BFA)
private val Coral    = Color(0xFFF25C54)
private val Cream    = Color(0xFFF0EDE8)
private val Muted    = Color(0xFF8B949E)

private val DarkColors = darkColorScheme(
    primary       = Indigo2,
    onPrimary     = Cream,
    secondary     = Coral,
    onSecondary   = Cream,
    background    = Navy,
    onBackground  = Cream,
    surface       = Navy2,
    onSurface     = Cream,
    surfaceVariant = Navy3,
    onSurfaceVariant = Muted,
    outline       = Color(0xFF30363D),
    error         = Coral,
)

@Composable
fun ConvertMateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        content = content,
    )
}

// Expose for use in composables
object AppColors {
    val navy     = Navy
    val navy2    = Navy2
    val navy3    = Navy3
    val indigo   = Indigo
    val indigo2  = Indigo2
    val indigo3  = Indigo3
    val coral    = Coral
    val cream    = Cream
    val muted    = Muted
}
