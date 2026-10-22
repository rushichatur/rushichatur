package com.rushichatur.kharcha.ui

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.ingest.Notifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.YearMonth

class MainActivity : ComponentActivity() {
    private val openTxn = mutableStateOf<Long?>(null)
    private val resumeTick = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Repository.init(this)
        Notifier.ensureChannel(this)
        handle(intent)
        setContent {
            KharchaTheme {
                App(
                    openTxn = openTxn.value,
                    onTxnHandled = { openTxn.value = null },
                    resumeTick = resumeTick.intValue,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        resumeTick.intValue++
    }

    private fun handle(intent: Intent?) {
        val id = intent?.getLongExtra(Notifier.EXTRA_TXN_ID, -1L) ?: -1L
        if (id >= 0) {
            openTxn.value = id
            Notifier.cancel(this, id)
        }
    }
}

enum class Tab(val label: String, val emoji: String) {
    HOME("Home", "🏠"), REVIEW("Review", "📝"), HISTORY("History", "📜"), SETUP("Setup", "⚙️")
}

@Composable
fun App(openTxn: Long?, onTxnHandled: () -> Unit, resumeTick: Int) {
    val version by Repository.changes.collectAsState()
    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    var month by rememberSaveable { mutableStateOf(YearMonth.now()) }
    var showAdd by remember { mutableStateOf(false) }

    LaunchedEffect(openTxn) { if (openTxn != null) tab = Tab.REVIEW }

    val pendingCount by produceState(0, version) {
        value = withContext(Dispatchers.IO) { Repository.pendingCount() }
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = {
                            if (t == Tab.REVIEW && pendingCount > 0) {
                                BadgedBox(badge = { Badge { Text("$pendingCount") } }) { Text(t.emoji, fontSize = 20.sp) }
                            } else {
                                Text(t.emoji, fontSize = 20.sp)
                            }
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
        floatingActionButton = {
            if (tab == Tab.HOME || tab == Tab.HISTORY) {
                FloatingActionButton(onClick = { showAdd = true }) { Text("+", fontSize = 26.sp) }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.HOME -> HomeScreen(month, { month = it }, version, pendingCount) { tab = Tab.REVIEW }
                Tab.REVIEW -> ReviewScreen(openTxn, onTxnHandled, version)
                Tab.HISTORY -> HistoryScreen(month, { month = it }, version)
                Tab.SETUP -> SetupScreen(resumeTick)
            }
        }
    }

    if (showAdd) AddExpenseDialog(onDismiss = { showAdd = false })
}

@Composable
fun KharchaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme()
        else -> lightColorScheme()
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
