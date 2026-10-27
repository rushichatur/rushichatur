package com.rushichatur.kharcha.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.rushichatur.kharcha.core.Category
import com.rushichatur.kharcha.core.Money
import com.rushichatur.kharcha.data.Due
import com.rushichatur.kharcha.data.Holding
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.data.Settings
import com.rushichatur.kharcha.data.Source
import com.rushichatur.kharcha.data.Txn
import com.rushichatur.kharcha.ingest.Ingestor
import com.rushichatur.kharcha.ingest.Notifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.YearMonth

private val screenPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp)

@Composable
private fun ScreenTitle(text: String) {
    Text(text, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
}

private fun Txn.title() = note.ifBlank { merchant }
private fun Txn.sourceLabel() = when (source) {
    Source.SMS -> "Bank SMS"
    Source.NOTIFICATION -> sourceApp ?: "UPI app"
    Source.MANUAL -> "Added by you"
}

// ------------------------------------------------------------------ Home

@Composable
fun HomeScreen(
    month: YearMonth,
    onMonthChange: (YearMonth) -> Unit,
    version: Int,
    pendingCount: Int,
    go: (Tab) -> Unit,
) {
    val m by produceState(MonthMoney(), month, version) {
        value = withContext(Dispatchers.IO) { MonthMoney.load(month) }
    }
    val dues by produceState(emptyList<Due>(), version) {
        value = withContext(Dispatchers.IO) { Repository.dues().filter { !it.settled } }
    }
    val owedToYou = dues.filter { it.kind.owedToYou }.sumOf { it.pendingPaise }
    val youOwe = dues.filter { !it.kind.owedToYou }.sumOf { it.pendingPaise }
    val spending = m.txns.filter { it.category != Category.INVESTMENT }
    val total = m.spentPaise
    val byCategory = spending.groupBy { it.category ?: Category.OTHER }
        .mapValues { (_, list) -> list.sumOf { it.amountPaise } }
        .entries.sortedByDescending { it.value }

    LazyColumn(contentPadding = screenPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Kharcha", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = { go(Tab.HISTORY) }) { Text("📜 History") }
                TextButton(onClick = { go(Tab.SETUP) }) { Text("⚙️ Setup") }
            }
        }
        item { MonthSwitcher(month, onMonthChange) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("Spent this month", style = MaterialTheme.typography.labelLarge)
                    Text(Money.format(total), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Text("${spending.size} expenses · investments not included", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("This month", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Box(Modifier.clickable { go(Tab.INCOME) }) { SummaryLine("💰", "Earned", Money.format(m.earnedPaise)) }
                    if (m.borrowedPaise > 0) {
                        Box(Modifier.clickable { go(Tab.DUES) }) { SummaryLine("🙏", "Borrowed", Money.format(m.borrowedPaise)) }
                    }
                    SummaryLine("🧾", "Spent", "-" + Money.format(m.spentPaise))
                    Box(Modifier.clickable { go(Tab.INVEST) }) { SummaryLine("📈", "Invested", "-" + Money.format(m.investedPaise)) }
                    HorizontalDivider(Modifier.padding(vertical = 6.dp))
                    SummaryLine(
                        "🏦", "Left over", Money.format(m.leftOverPaise),
                        color = if (m.leftOverPaise < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        bold = true,
                    )
                    if (m.earnedPaise == 0L) {
                        Text(
                            "Add your salary in the 💰 Income tab to see what's left over.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        if (pendingCount > 0) {
            item {
                Card(
                    Modifier.fillMaxWidth().clickable { go(Tab.REVIEW) },
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("📝", fontSize = 24.sp)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "$pendingCount payment${if (pendingCount == 1) "" else "s"} waiting for a category. Tap to sort.",
                            Modifier.weight(1f),
                        )
                    }
                }
            }
        }
        if (owedToYou > 0 || youOwe > 0) {
            item {
                Card(Modifier.fillMaxWidth().clickable { go(Tab.DUES) }) {
                    Column(Modifier.padding(16.dp)) {
                        if (owedToYou > 0) SummaryLine("🤝", "People owe you", Money.format(owedToYou))
                        if (youOwe > 0) SummaryLine("🙏", "You owe", Money.format(youOwe), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
        if (spending.isEmpty()) {
            item {
                Text(
                    "Nothing confirmed for this month yet.\n\nPay with GPay / PhonePe or by card and you'll get a " +
                        "notification asking what it was for. Open ⚙️ Setup first to give permissions.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
        } else {
            item { Text("Spending by category", style = MaterialTheme.typography.titleMedium) }
            items(byCategory, key = { it.key.name }) { (cat, amount) ->
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${cat.emoji}  ${cat.label}", Modifier.weight(1f))
                        Text(Money.format(amount), fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { if (total == 0L) 0f else amount.toFloat() / total },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Review

@Composable
fun ReviewScreen(focusId: Long?, onFocusHandled: () -> Unit, version: Int) {
    val pending by produceState<List<Txn>?>(null, version) {
        value = withContext(Dispatchers.IO) { Repository.pending() }
    }
    val holdings by produceState(emptyList<Holding>(), version) {
        value = withContext(Dispatchers.IO) { Repository.holdings() }
    }
    val list = pending ?: return
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val withSuggestion = list.count { it.suggested != null }

    LaunchedEffect(focusId, list) {
        if (focusId == null) return@LaunchedEffect
        val idx = list.indexOfFirst { it.id == focusId }
        if (idx >= 0) listState.animateScrollToItem(idx + 1)
        onFocusHandled()
    }

    LazyColumn(state = listState, contentPadding = screenPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ScreenTitle("Where did this go?")
                if (list.isNotEmpty()) {
                    Text(
                        "Pick a category for each payment. Kharcha remembers your choice for that shop next time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (withSuggestion > 1) {
                    FilledTonalButton(onClick = { scope.launch(Dispatchers.IO) { Repository.acceptAllSuggestions() } }) {
                        Text("✓ Accept all $withSuggestion suggestions")
                    }
                }
            }
        }
        if (list.isEmpty()) {
            item {
                Text(
                    "🎉\nAll caught up!",
                    Modifier.fillMaxWidth().padding(top = 48.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }
        items(list, key = { it.id }) { txn -> ReviewCard(txn, highlighted = txn.id == focusId, holdings = holdings) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReviewCard(txn: Txn, highlighted: Boolean, holdings: List<Holding>) {
    var selected by remember(txn.id) { mutableStateOf(txn.suggested) }
    var holdingId by remember(txn.id) { mutableStateOf<Long?>(null) }
    var note by remember(txn.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Card(
        Modifier.fillMaxWidth(),
        border = if (highlighted) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        if (txn.merchant == Repository.UNKNOWN) "Unknown payee" else txn.merchant,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${txn.sourceLabel()} · ${txn.timestamp.dayTimeLabel()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(Money.format(txn.amountPaise), fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                placeholder = {
                    Text(if (txn.merchant == Repository.UNKNOWN) "Where did you spend this?" else "Note (optional), e.g. dinner with friends")
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            CategoryChips(selected) { selected = it }
            if (selected == Category.INVESTMENT && holdings.isNotEmpty()) {
                Text("Which investment? (optional)", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    holdings.forEach { h ->
                        FilterChip(
                            selected = holdingId == h.id,
                            onClick = { holdingId = if (holdingId == h.id) null else h.id },
                            label = { Text("${h.kind.emoji} ${h.name}") },
                        )
                    }
                }
            }
            Button(
                enabled = selected != null,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val c = selected ?: return@Button
                    val h = holdingId.takeIf { c == Category.INVESTMENT }
                    scope.launch(Dispatchers.IO) {
                        Repository.confirm(txn.id, c, note)
                        if (h != null) Repository.setTxnHolding(txn.id, h)
                    }
                    Notifier.cancel(context, txn.id)
                },
            ) { Text("Save") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = {
                    scope.launch(Dispatchers.IO) { Repository.ignore(txn.id) }
                    Notifier.cancel(context, txn.id)
                }) { Text("Not an expense") }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = {
                    scope.launch(Dispatchers.IO) { Repository.lendFromTxn(txn.id, note) }
                    Notifier.cancel(context, txn.id)
                }) { Text("🤝 I lent this") }
            }
        }
    }
}

// ------------------------------------------------------------------ History

@Composable
fun HistoryScreen(month: YearMonth, onMonthChange: (YearMonth) -> Unit, version: Int) {
    val txns by produceState(emptyList<Txn>(), month, version) {
        value = withContext(Dispatchers.IO) { Repository.confirmedBetween(month.startMillis(), month.endMillis()) }
    }
    var filter by remember { mutableStateOf<Category?>(null) }
    var editing by remember { mutableStateOf<Txn?>(null) }
    val shown = txns.filter { filter == null || it.category == filter }
    val days = shown.groupBy { it.timestamp.dayLabel() }

    LazyColumn(contentPadding = screenPadding, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item { ScreenTitle("History") }
        item { MonthSwitcher(month, onMonthChange) }
        item {
            val present = txns.mapNotNull { it.category }.distinct().sortedBy { it.ordinal }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { FilterChip(selected = filter == null, onClick = { filter = null }, label = { Text("All") }) }
                items(present) { c ->
                    FilterChip(selected = filter == c, onClick = { filter = if (filter == c) null else c }, label = { Text("${c.emoji} ${c.label}") })
                }
            }
        }
        if (shown.isEmpty()) {
            item {
                Text(
                    "No expenses here yet.",
                    Modifier.padding(top = 24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            item {
                Text(
                    "Total: ${Money.format(shown.sumOf { it.amountPaise })}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
        }
        days.forEach { (day, list) ->
            item(key = "h$day") {
                Column {
                    Row(Modifier.padding(top = 12.dp)) {
                        Text(day, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                        Text(Money.format(list.sumOf { it.amountPaise }), style = MaterialTheme.typography.labelLarge)
                    }
                    HorizontalDivider(Modifier.padding(top = 4.dp))
                }
            }
            items(list, key = { it.id }) { t ->
                Row(
                    Modifier.fillMaxWidth().clickable { editing = t }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(t.category?.emoji ?: "📦", fontSize = 22.sp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.title(), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${t.category?.label ?: "Other"} · ${t.timestamp.timeLabel()} · ${t.sourceLabel()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(Money.format(t.amountPaise), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    editing?.let { t -> EditDialog(t) { editing = null } }
}

@Composable
private fun EditDialog(txn: Txn, onDismiss: () -> Unit) {
    var category by remember { mutableStateOf(txn.category) }
    var note by remember { mutableStateOf(txn.note) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${Money.format(txn.amountPaise)} · ${txn.merchant}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(txn.timestamp.dayTimeLabel(), style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note") }, singleLine = true)
                CategoryChips(category) { category = it }
                TextButton(onClick = {
                    scope.launch(Dispatchers.IO) { Repository.delete(txn.id) }
                    onDismiss()
                }) { Text("Delete expense", color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = category != null, onClick = {
                val c = category ?: return@TextButton
                scope.launch(Dispatchers.IO) { Repository.confirm(txn.id, c, note) }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ------------------------------------------------------------------ Setup

private fun Context.has(permission: String) =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

@Composable
fun SetupScreen(resumeTick: Int) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var localTick by remember { mutableIntStateOf(0) }
    val tick = resumeTick + localTick

    val smsOk = remember(tick) { context.has(Manifest.permission.RECEIVE_SMS) && context.has(Manifest.permission.READ_SMS) }
    val listenerOk = remember(tick) {
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
    val alertsOk = remember(tick) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    var autoFile by remember { mutableStateOf(Settings.autoFileKnown(context)) }
    var importStatus by remember { mutableStateOf<String?>(null) }

    val askPermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        localTick++
    }

    var backupStatus by remember { mutableStateOf<String?>(null) }
    var restoreUri by remember { mutableStateOf<Uri?>(null) }
    val saveBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        backupStatus = "Saving…"
        scope.launch {
            backupStatus = withContext(Dispatchers.IO) {
                runCatching {
                    val out = context.contentResolver.openOutputStream(uri) ?: error("Couldn't open that location")
                    out.use { Repository.backupTo(it) }
                }.fold({ "✅ Backup saved. Keep this file safe." }, { "Couldn't save the backup: ${it.message}" })
            }
        }
    }
    val pickBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> restoreUri = uri }

    restoreUri?.let { uri ->
        AlertDialog(
            onDismissRequest = { restoreUri = null },
            title = { Text("Restore this backup?") },
            text = { Text("Everything currently in Kharcha on this phone will be replaced by the backup.") },
            confirmButton = {
                TextButton(onClick = {
                    restoreUri = null
                    backupStatus = "Restoring…"
                    scope.launch {
                        backupStatus = withContext(Dispatchers.IO) {
                            runCatching {
                                val input = context.contentResolver.openInputStream(uri) ?: error("Couldn't open that file")
                                Repository.restoreFrom(input)
                            }.fold(
                                { "✅ Backup restored." },
                                { if (it is Repository.NotABackup) it.message else "Couldn't restore: ${it.message}" },
                            )
                        }
                    }
                }) { Text("Replace my data") }
            },
            dismissButton = { TextButton(onClick = { restoreUri = null }) { Text("Cancel") } },
        )
    }

    fun requestSmsAndAlerts() {
        val perms = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) perms += Manifest.permission.POST_NOTIFICATIONS
        askPermissions.launch(perms.toTypedArray())
    }

    fun openAppInfo() {
        context.startActivity(
            Intent(AndroidSettings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        )
    }

    fun runImport(days: Int) {
        importStatus = "Reading your SMS…"
        scope.launch {
            val n = withContext(Dispatchers.IO) { Ingestor.importInbox(context, days) }
            importStatus = if (n == 0) "No new bank payments found in the last $days days." else "Found $n payments. Open the Review tab to sort them."
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ScreenTitle("Setup")
        Text(
            "Turn on these three things so Kharcha can spot your payments automatically.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        SetupStep(
            done = smsOk,
            title = "1. Read bank SMS",
            body = "Catches every UPI, card and EMI debit your bank texts you about.",
            action = "Allow",
            onAction = ::requestSmsAndAlerts,
        )
        SetupStep(
            done = listenerOk,
            title = "2. Read GPay / PhonePe / Paytm alerts",
            body = "Gets the shop name straight from your payment app. Find Kharcha in the list and switch it on.",
            action = "Open settings",
            onAction = { context.startActivity(Intent(AndroidSettings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
        )
        SetupStep(
            done = alertsOk,
            title = "3. Ask me what each payment was for",
            body = "Shows a notification with one-tap category buttons.",
            action = "Allow",
            onAction = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    askPermissions.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                } else {
                    openAppInfo()
                }
            },
        )

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Setting greyed out or says \"Restricted setting\"?", fontWeight = FontWeight.SemiBold)
                Text(
                    "Android blocks SMS and notification access for apps installed outside the Play Store. " +
                        "Open App info → tap ⋮ (top right) → \"Allow restricted settings\", then come back and try again.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedButton(onClick = ::openAppInfo) { Text("Open App info") }
            }
        }

        HorizontalDivider()
        Text("Find past payments", style = MaterialTheme.typography.titleMedium)
        Text(
            "Scan bank SMS already on your phone. They'll show up in Review (no notifications).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = smsOk, onClick = { runImport(30) }) { Text("Last 30 days") }
            OutlinedButton(enabled = smsOk, onClick = { runImport(90) }) { Text("Last 90 days") }
        }
        importStatus?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

        HorizontalDivider()
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Auto-file shops I've sorted before", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Skip the question when you pay a shop you've already given a category.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = autoFile, onCheckedChange = {
                autoFile = it
                Settings.setAutoFileKnown(context, it)
            })
        }

        HorizontalDivider()
        Text("Backup", style = MaterialTheme.typography.titleMedium)
        Text(
            "Saves all your expenses, income, dues and investments to one file. Keep it in Google Drive " +
                "(pick Drive in the save screen) so you can restore it after reinstalling or on a new phone. " +
                "The file includes your bank SMS text, so keep it private.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { saveBackup.launch("Kharcha-backup-${LocalDate.now()}.db") }) { Text("💾 Save backup") }
            OutlinedButton(onClick = { pickBackup.launch(arrayOf("*/*")) }) { Text("Restore") }
        }
        backupStatus?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

        HorizontalDivider()
        Text(
            "🔒 Everything stays on this phone. Kharcha has no internet permission, so your SMS and spending never leave the device.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SetupStep(done: Boolean, title: String, body: String, action: String, onAction: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(12.dp))
            if (done) Text("✅", fontSize = 22.sp) else Button(onClick = onAction) { Text(action) }
        }
    }
}
