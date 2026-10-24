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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rushichatur.kharcha.core.Category
import com.rushichatur.kharcha.core.Money
import com.rushichatur.kharcha.data.Holding
import com.rushichatur.kharcha.data.HoldingKind
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.data.Txn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.YearMonth
import java.time.format.DateTimeFormatter

private val monthName = DateTimeFormatter.ofPattern("MMMM")

@Composable
private fun gainColor(gain: Long): Color =
    if (gain < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary

private fun gainText(gain: Long, base: Long): String =
    Money.signed(gain) + (Money.percent(gain, base)?.let { " ($it)" } ?: "")

@Composable
fun InvestScreen(month: YearMonth, onMonthChange: (YearMonth) -> Unit, version: Int, defaultTs: Long) {
    val holdings by produceState(emptyList<Holding>(), version) {
        value = withContext(Dispatchers.IO) { Repository.holdings() }
    }
    val monthTxns by produceState(emptyList<Txn>(), month, version) {
        value = withContext(Dispatchers.IO) {
            Repository.confirmedBetween(month.startMillis(), month.endMillis()).filter { it.category == Category.INVESTMENT }
        }
    }
    var adding by remember { mutableStateOf<Holding?>(null) }
    var valuing by remember { mutableStateOf<Holding?>(null) }
    var editing by remember { mutableStateOf<Holding?>(null) }

    val totalValue = holdings.sumOf { it.valuePaise }
    val totalInvested = holdings.sumOf { it.investedPaise }
    val gain = totalValue - totalInvested
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val holdingNames = holdings.associate { it.id to it.name }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("Investments", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("Total portfolio value", style = MaterialTheme.typography.labelLarge)
                    Text(Money.format(totalValue), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Text("Invested ${Money.format(totalInvested)}")
                    if (holdings.isNotEmpty()) {
                        Text(gainText(gain, totalInvested), fontWeight = FontWeight.SemiBold, color = gainColor(gain))
                    }
                    if (holdings.isNotEmpty()) {
                        HorizontalDivider(Modifier.padding(vertical = 10.dp))
                        HoldingKind.entries.forEach { k ->
                            val list = holdings.filter { it.kind == k }
                            if (list.isNotEmpty()) SummaryLine(k.emoji, k.label, Money.format(list.sumOf { it.valuePaise }))
                        }
                    }
                }
            }
        }

        item { MonthSwitcher(month, onMonthChange) }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Invested in ${month.format(monthName)}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        Text(Money.format(monthTxns.sumOf { it.amountPaise }), fontWeight = FontWeight.Bold)
                    }
                    if (monthTxns.isEmpty()) {
                        Text(
                            "Nothing yet. SIPs and stock buys from your bank SMS show up here once you mark them as 📈 Investment.",
                            style = MaterialTheme.typography.bodySmall,
                            color = muted,
                        )
                    }
                    monthTxns.forEach { t ->
                        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.holdingId?.let { holdingNames[it] } ?: t.note.ifBlank { t.merchant }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(t.timestamp.dayLabel(), style = MaterialTheme.typography.bodySmall, color = muted)
                            }
                            Text(Money.format(t.amountPaise))
                        }
                    }
                }
            }
        }

        if (holdings.isEmpty()) {
            item {
                Text(
                    "Add your mutual funds and stocks with +.\n\nEnter how much you've already invested and today's value " +
                        "(from Groww, Zerodha, Kuvera…). Kharcha has no internet, so it can't fetch live prices. " +
                        "Tap \"Update value\" now and then to keep it current.",
                    color = muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        HoldingKind.entries.forEach { k ->
            val list = holdings.filter { it.kind == k }
            if (list.isNotEmpty()) {
                item(key = "h_${k.name}") {
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${k.emoji} ${k.label}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        Text(Money.format(list.sumOf { it.valuePaise }), fontWeight = FontWeight.SemiBold)
                    }
                }
                items(list, key = { it.id }) { h ->
                    HoldingCard(h, onAdd = { adding = h }, onValue = { valuing = h }, onEdit = { editing = h })
                }
            }
        }
    }

    adding?.let { h -> AddMoneyDialog(h, defaultTs) { adding = null } }
    valuing?.let { h -> UpdateValueDialog(h) { valuing = null } }
    editing?.let { h -> HoldingDialog(existing = h) { editing = null } }
}

@Composable
private fun HoldingCard(h: Holding, onAdd: () -> Unit, onValue: () -> Unit, onEdit: () -> Unit) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(h.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("Invested ${Money.format(h.investedPaise)}", style = MaterialTheme.typography.bodySmall, color = muted)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(Money.format(h.valuePaise), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(gainText(h.gainPaise, h.investedPaise), style = MaterialTheme.typography.bodySmall, color = gainColor(h.gainPaise))
                }
            }
            Text("Value updated ${h.valueUpdatedAt.dayLabel()}", style = MaterialTheme.typography.bodySmall, color = muted)
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onEdit) { Text("Edit") }
                TextButton(onClick = onValue) { Text("Update value") }
                Spacer(Modifier.weight(1f))
                FilledTonalButton(onClick = onAdd) { Text("+ Add money") }
            }
        }
    }
}

@Composable
private fun AddMoneyDialog(h: Holding, defaultTs: Long, onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var ts by remember { mutableStateOf(defaultTs) }
    val scope = rememberCoroutineScope()
    val paise = Money.parsePaise(amount)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add money to ${h.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Use this for SIPs or buys that didn't come in as a bank SMS. It counts as this month's investment.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                AmountField(amount, { amount = it }, "Amount (₹)")
                DateButton(ts) { ts = it }
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null, onClick = {
                val p = paise ?: return@TextButton
                scope.launch(Dispatchers.IO) { Repository.investInHolding(h.id, p, ts) }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun UpdateValueDialog(h: Holding, onDismiss: () -> Unit) {
    var value by remember { mutableStateOf(Money.plain(h.valuePaise)) }
    val scope = rememberCoroutineScope()
    val paise = Money.parsePaise(value) ?: if (value == "0") 0L else null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Current value") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Check today's value of ${h.name} in your broker app and enter it here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                AmountField(value, { value = it }, "Current value (₹)")
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null, onClick = {
                val p = paise ?: return@TextButton
                scope.launch(Dispatchers.IO) { Repository.updateHoldingValue(h.id, p) }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Add a new fund / stock, or edit one. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HoldingDialog(existing: Holding? = null, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(existing?.kind ?: HoldingKind.MUTUAL_FUND) }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var opening by remember { mutableStateOf(existing?.let { if (it.openingPaise > 0) Money.plain(it.openingPaise) else "" } ?: "") }
    var value by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val openingPaise = Money.parsePaise(opening) ?: 0L
    val valuePaise = Money.parsePaise(value)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing != null) "Edit investment" else "Add investment") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    HoldingKind.entries.forEach { k ->
                        FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text("${k.emoji} ${k.label}") })
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(if (kind == HoldingKind.STOCK) "Stock name (e.g. Reliance)" else "Name (e.g. Parag Parikh Flexi Cap)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                AmountField(opening, { opening = it }, "Invested so far (₹)")
                if (existing == null) {
                    AmountField(value, { value = it }, "Current value (₹, optional)")
                    Text(
                        "Leave the current value empty if you don't know it; it starts equal to what you invested.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (existing.addedPaise > 0) {
                    Text(
                        "Plus ${Money.format(existing.addedPaise)} added through Kharcha payments.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (existing != null) {
                    TextButton(onClick = {
                        if (!confirmDelete) {
                            confirmDelete = true
                        } else {
                            scope.launch(Dispatchers.IO) { Repository.deleteHolding(existing.id) }
                            onDismiss()
                        }
                    }) {
                        Text(if (confirmDelete) "Tap again to delete" else "Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = {
                scope.launch(Dispatchers.IO) {
                    if (existing == null) {
                        Repository.addHolding(kind, name, openingPaise, valuePaise)
                    } else {
                        Repository.updateHolding(existing.id, kind, name, openingPaise)
                    }
                }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
