package com.convertmate

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.convertmate.ui.ConversionViewModel
import com.convertmate.ui.ConvertMateTheme
import com.convertmate.ui.MainScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ConvertMateTheme {
                val vm: ConversionViewModel = viewModel()
                // Handle share-from-other-app intent
                handleIncomingIntent(intent, vm)
                MainScreen(viewModel = vm)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Re-handle share intents when app is already running
        val vm = androidx.lifecycle.ViewModelProvider(this)[ConversionViewModel::class.java]
        handleIncomingIntent(intent, vm)
    }

    private fun handleIncomingIntent(intent: Intent?, vm: ConversionViewModel) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val uri = intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM) ?: return
                vm.addFiles(listOf(uri))
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris = intent.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM) ?: return
                vm.addFiles(uris)
            }
        }
    }
}
