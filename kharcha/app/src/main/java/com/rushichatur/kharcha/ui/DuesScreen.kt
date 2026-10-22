package com.rushichatur.kharcha.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rushichatur.kharcha.core.Money
import com.rushichatur.kharcha.data.Due
import com.rushichatur.kharcha.data.DueKind
import com.rushichatur.kharcha.data.DuePayment
import com.rushichatur.kharcha.data.Repository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun DuesScreen(kind: DueKind, onKindChange: (DueKind) -> Unit, version: Int) {
    val dues by produceState(emptyList<Due>(), version) {
        value = withContext(Dispatchers.IO) { Repository.dues() }
    }
    var showSettled by remember { mutableStateOf(false) }
    var paying by remember { mutableStateOf<Due?>(null) }
    var editing by remember { mutableStateOf<Due?>(null) }

    val open = dues.filter { !it.settled }
    val lentPending = open.filter { it.kind == DueKind.LENT }.sumOf { it.pendingPaise }
    val freelancePending = open.filter { it.kind == DueKind.FREELANCE }.sumOf { it.pendingPaise }
    val openOfKind = open.filter { it.kind == kind }
    val settledOfKind = dues.filter { it.settled && it.kind == kind }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Money owed to you", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("Still to receive", style = MaterialTheme.typography.labelLarge)
                    Text(Money.format(lentPending + freelancePending), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.padding(top = 4.dp))
                    Text("🤝 From people: ${Money.format(lentPending)}")
                    Text("💼 From freelance: ${Money.format(freelancePending)}")
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DueKind.entries.forEach { k ->
                    FilterChip(selected = kind == k, onClick = { onKindChange(k) }, label = { Text("${k.emoji} ${k.label}") })
                }
            }
        }
        if (openOfKind.isEmpty()) {
            item {
                Text(
                    if (kind == DueKind.LENT) {
                        "Nobody owes you money right now.\n\nTap + to note money you lent. Or, when you pay a friend on GPay, tap \"I lent this\" in the Review tab."
                    } else {
                        "No pending freelance payments.\n\nTap + to add a project with its total fee, then log each payment as it comes in."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        items(openOfKind, key = { it.id }) { d -> DueCard(d, onPay = { paying = d }, onEdit = { editing = d }) }

        if (settledOfKind.isNotEmpty()) {
            item {
                TextButton(onClick = { showSettled = !showSettled }) {
                    Text(if (showSettled) "Hide settled (${settledOfKind.size})" else "Show settled (${settledOfKind.size})")
                }
            }
            if (showSettled) {
                items(settledOfKind, key = { it.id }) { d -> DueCard(d, onPay = { paying = d }, onEdit = { editing = d }) }
            }
        }
    }

    paying?.let { d -> RecordPaymentDialog(d) { paying = null } }
    editing?.let { d -> DueDialog(defaultKind = d.kind, existing = d) { editing = null } }
}

@Composable
private fun DueCard(d: Due, onPay: () -> Unit, onEdit: () -> Unit) {
    val scope = rememberCoroutineScope()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(d.name, style = MaterialTheme.typography.titleMedium)
                    if (d.client.isNotBlank()) Text("Client: ${d.client}", style = MaterialTheme.typography.bodySmall, color = muted)
                    Text("Since ${d.createdAt.dayLabel()}", style = MaterialTheme.typography.bodySmall, color = muted)
                }
                Column(horizontalAlignment = Alignment.End) {
                    if (d.settled) {
                        Text("✅ Settled", fontWeight = FontWeight.SemiBold)
                    } else {
                        Text(Money.format(d.pendingPaise), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Text("pending", style = MaterialTheme.typography.bodySmall, color = muted)
                    }
                }
            }
            LinearProgressIndicator(
                progress = { if (d.totalPaise == 0L) 1f else (d.receivedPaise.toFloat() / d.totalPaise).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                "Received ${Money.format(d.receivedPaise)} of ${Money.format(d.totalPaise)}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (d.note.isNotBlank()) Text(d.note, style = MaterialTheme.typography.bodySmall, color = muted)
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onEdit) { Text("Edit") }
                if (d.settled) {
                    TextButton(onClick = { scope.launch(Dispatchers.IO) { Repository.setDueSettled(d.id, false) } }) { Text("Reopen") }
                } else {
                    TextButton(onClick = { scope.launch(Dispatchers.IO) { Repository.setDueSettled(d.id, true) } }) { Text("Mark settled") }
                }
                Spacer(Modifier.weight(1f))
                FilledTonalButton(onClick = onPay) { Text(if (d.kind == DueKind.LENT) "Got money" else "Got paid") }
            }
        }
    }
}

private fun String.amountInput() = filter { it.isDigit() || it == '.' }

@Composable
private fun RecordPaymentDialog(d: Due, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf(if (d.pendingPaise > 0) Money.plain(d.pendingPaise) else "") }
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val history by produceState(emptyList<DuePayment>(), d.id, d.receivedPaise) {
        value = withContext(Dispatchers.IO) { Repository.duePayments(d.id) }
    }
    val paise = Money.parsePaise(amount)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (d.kind == DueKind.LENT) "Money back from ${d.name}" else "Payment for ${d.name}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Pending: ${Money.format(d.pendingPaise)}", fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.amountInput() },
                    label = { Text("Amount received (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (history.isNotEmpty()) {
                    HorizontalDivider()
                    Text("Received so far", style = MaterialTheme.typography.labelLarge)
                    history.forEach { p ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(p.timestamp.dayLabel(), style = MaterialTheme.typography.bodySmall)
                                if (p.note.isNotBlank()) Text(p.note, style = MaterialTheme.typography.bodySmall)
                            }
                            Text(Money.format(p.amountPaise), fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.width(4.dp))
                            TextButton(onClick = { scope.launch(Dispatchers.IO) { Repository.deleteDuePayment(p.id, d.id) } }) { Text("✕") }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null, onClick = {
                val p = paise ?: return@TextButton
                scope.launch(Dispatchers.IO) { Repository.recordDuePayment(d.id, p, note) }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

/** Add a new loan / project, or edit an existing one. */
@Composable
fun DueDialog(defaultKind: DueKind, existing: Due? = null, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(existing?.kind ?: defaultKind) }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var client by remember { mutableStateOf(existing?.client ?: "") }
    var total by remember { mutableStateOf(existing?.let { Money.plain(it.totalPaise) } ?: "") }
    var received by remember { mutableStateOf("") }
    var note by remember { mutableStateOf(existing?.note ?: "") }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val totalPaise = Money.parsePaise(total)
    val receivedPaise = Money.parsePaise(received) ?: 0L
    val lent = kind == DueKind.LENT

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                when {
                    existing != null -> "Edit"
                    lent -> "Money you lent"
                    else -> "Freelance project"
                }
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (existing == null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = lent, onClick = { kind = DueKind.LENT }, label = { Text("🤝 Lent") })
                        FilterChip(selected = !lent, onClick = { kind = DueKind.FREELANCE }, label = { Text("💼 Freelance") })
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(if (lent) "Person's name" else "Project name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!lent) {
                    OutlinedTextField(
                        value = client,
                        onValueChange = { client = it },
                        label = { Text("Client (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = total,
                    onValueChange = { total = it.amountInput() },
                    label = { Text(if (lent) "Amount lent (₹)" else "Total project fee (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (existing == null) {
                    OutlinedTextField(
                        value = received,
                        onValueChange = { received = it.amountInput() },
                        label = { Text(if (lent) "Already paid back (₹, optional)" else "Advance already received (₹, optional)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (existing != null) {
                    TextButton(onClick = {
                        if (!confirmDelete) {
                            confirmDelete = true
                        } else {
                            scope.launch(Dispatchers.IO) { Repository.deleteDue(existing.id) }
                            onDismiss()
                        }
                    }) {
                        Text(if (confirmDelete) "Tap again to delete" else "Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && totalPaise != null, onClick = {
                val t = totalPaise ?: return@TextButton
                scope.launch(Dispatchers.IO) {
                    if (existing == null) {
                        Repository.addDue(kind, name, if (lent) "" else client, t, note, alreadyReceivedPaise = receivedPaise)
                    } else {
                        Repository.updateDue(existing.id, name, if (lent) "" else client, t, note)
                    }
                }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
