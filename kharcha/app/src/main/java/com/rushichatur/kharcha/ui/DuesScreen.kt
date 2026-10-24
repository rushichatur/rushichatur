package com.rushichatur.kharcha.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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

/** Wording that changes with the kind of due. */
private object DueText {
    fun settleButton(k: DueKind) = when (k) {
        DueKind.LENT -> "Got money"
        DueKind.FREELANCE -> "Got paid"
        DueKind.BORROWED -> "Paid back"
    }

    fun progress(d: Due) = when (d.kind) {
        DueKind.BORROWED -> "Repaid ${Money.format(d.receivedPaise)} of ${Money.format(d.totalPaise)}"
        else -> "Received ${Money.format(d.receivedPaise)} of ${Money.format(d.totalPaise)}"
    }

    fun pendingLabel(k: DueKind) = if (k == DueKind.BORROWED) "you owe" else "pending"

    fun paymentTitle(d: Due) = when (d.kind) {
        DueKind.LENT -> "Money back from ${d.name}"
        DueKind.FREELANCE -> "Payment for ${d.name}"
        DueKind.BORROWED -> "Repayment to ${d.name}"
    }

    fun paymentAmount(k: DueKind) = if (k == DueKind.BORROWED) "Amount you paid back (₹)" else "Amount received (₹)"
    fun paidSoFar(k: DueKind) = if (k == DueKind.BORROWED) "Paid back so far" else "Received so far"

    fun empty(k: DueKind) = when (k) {
        DueKind.LENT -> "Nobody owes you money right now.\n\nTap + to note money you lent. Or, when you pay a friend on GPay, tap \"I lent this\" in the Review tab."
        DueKind.FREELANCE -> "No pending freelance payments.\n\nTap + to add a project with its total fee, then log each payment as it comes in. Payments you log here also count as income."
        DueKind.BORROWED -> "You don't owe anyone right now.\n\nTap + to note money you took from family or friends, then log each repayment."
    }

    fun dialogTitle(k: DueKind) = when (k) {
        DueKind.LENT -> "Money you lent"
        DueKind.FREELANCE -> "Freelance project"
        DueKind.BORROWED -> "Money you borrowed"
    }

    fun nameLabel(k: DueKind) = when (k) {
        DueKind.LENT -> "Lent to (person's name)"
        DueKind.FREELANCE -> "Project name"
        DueKind.BORROWED -> "Borrowed from (e.g. Mom, Rahul)"
    }

    fun totalLabel(k: DueKind) = when (k) {
        DueKind.LENT -> "Amount lent (₹)"
        DueKind.FREELANCE -> "Total project fee (₹)"
        DueKind.BORROWED -> "Amount borrowed (₹)"
    }

    fun alreadyLabel(k: DueKind) = when (k) {
        DueKind.FREELANCE -> "Advance already received (₹, optional)"
        else -> "Already paid back (₹, optional)"
    }
}

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
    val youOwe = open.filter { it.kind == DueKind.BORROWED }.sumOf { it.pendingPaise }
    val openOfKind = open.filter { it.kind == kind }
    val settledOfKind = dues.filter { it.settled && it.kind == kind }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Dues", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("You'll receive", style = MaterialTheme.typography.labelLarge)
                    Text(Money.format(lentPending + freelancePending), fontSize = 32.sp, fontWeight = FontWeight.Bold)
                    Text("🤝 From people: ${Money.format(lentPending)}")
                    Text("💼 From freelance: ${Money.format(freelancePending)}")
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    Text("You owe", style = MaterialTheme.typography.labelLarge)
                    Text("🙏 ${Money.format(youOwe)}", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DueKind.entries.forEach { k ->
                    FilterChip(selected = kind == k, onClick = { onKindChange(k) }, label = { Text("${k.emoji} ${k.label}") })
                }
            }
        }
        if (openOfKind.isEmpty()) {
            item {
                Text(
                    DueText.empty(kind),
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
    editing?.let { d -> DueDialog(defaultKind = d.kind, defaultTs = d.createdAt, existing = d) { editing = null } }
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
                        Text(
                            Money.format(d.pendingPaise),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (d.kind == DueKind.BORROWED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                        )
                        Text(DueText.pendingLabel(d.kind), style = MaterialTheme.typography.bodySmall, color = muted)
                    }
                }
            }
            LinearProgressIndicator(
                progress = { if (d.totalPaise == 0L) 1f else (d.receivedPaise.toFloat() / d.totalPaise).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(DueText.progress(d), style = MaterialTheme.typography.bodySmall)
            if (d.note.isNotBlank()) Text(d.note, style = MaterialTheme.typography.bodySmall, color = muted)
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onEdit) { Text("Edit") }
                if (d.settled) {
                    TextButton(onClick = { scope.launch(Dispatchers.IO) { Repository.setDueSettled(d.id, false) } }) { Text("Reopen") }
                } else {
                    TextButton(onClick = { scope.launch(Dispatchers.IO) { Repository.setDueSettled(d.id, true) } }) { Text("Mark settled") }
                }
                Spacer(Modifier.weight(1f))
                FilledTonalButton(onClick = onPay) { Text(DueText.settleButton(d.kind)) }
            }
        }
    }
}

@Composable
private fun RecordPaymentDialog(d: Due, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf(if (d.pendingPaise > 0) Money.plain(d.pendingPaise) else "") }
    var note by remember { mutableStateOf("") }
    var ts by remember { mutableStateOf(System.currentTimeMillis()) }
    val scope = rememberCoroutineScope()
    val history by produceState(emptyList<DuePayment>(), d.id, d.receivedPaise) {
        value = withContext(Dispatchers.IO) { Repository.duePayments(d.id) }
    }
    val paise = Money.parsePaise(amount)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(DueText.paymentTitle(d)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Pending: ${Money.format(d.pendingPaise)}", fontWeight = FontWeight.SemiBold)
                AmountField(amount, { amount = it }, DueText.paymentAmount(d.kind))
                DateButton(ts) { ts = it }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (history.isNotEmpty()) {
                    HorizontalDivider()
                    Text(DueText.paidSoFar(d.kind), style = MaterialTheme.typography.labelLarge)
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
                scope.launch(Dispatchers.IO) { Repository.recordDuePayment(d.id, p, note, ts) }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

/** Add a new loan / project / borrowing, or edit an existing one. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DueDialog(defaultKind: DueKind, defaultTs: Long, existing: Due? = null, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(existing?.kind ?: defaultKind) }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var client by remember { mutableStateOf(existing?.client ?: "") }
    var total by remember { mutableStateOf(existing?.let { Money.plain(it.totalPaise) } ?: "") }
    var received by remember { mutableStateOf("") }
    var note by remember { mutableStateOf(existing?.note ?: "") }
    var ts by remember { mutableStateOf(defaultTs) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val totalPaise = Money.parsePaise(total)
    val receivedPaise = Money.parsePaise(received) ?: 0L
    val freelance = kind == DueKind.FREELANCE

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing != null) "Edit" else DueText.dialogTitle(kind)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (existing == null) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        DueKind.entries.forEach { k ->
                            FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text("${k.emoji} ${k.label}") })
                        }
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(DueText.nameLabel(kind)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (freelance) {
                    OutlinedTextField(
                        value = client,
                        onValueChange = { client = it },
                        label = { Text("Client (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                AmountField(total, { total = it }, DueText.totalLabel(kind))
                if (existing == null) {
                    AmountField(received, { received = it }, DueText.alreadyLabel(kind))
                    DateButton(ts) { ts = it }
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
                val c = if (freelance) client else ""
                scope.launch(Dispatchers.IO) {
                    if (existing == null) {
                        Repository.addDue(kind, name, c, t, note, alreadyReceivedPaise = receivedPaise, createdAt = ts)
                    } else {
                        Repository.updateDue(existing.id, name, c, t, note)
                    }
                }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
