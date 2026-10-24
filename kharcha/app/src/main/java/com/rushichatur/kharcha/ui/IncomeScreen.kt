package com.rushichatur.kharcha.ui

import androidx.compose.foundation.clickable
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
import com.rushichatur.kharcha.data.Due
import com.rushichatur.kharcha.data.DueKind
import com.rushichatur.kharcha.data.Income
import com.rushichatur.kharcha.data.IncomeKind
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.data.Txn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.YearMonth

/** Everything Home and Income need for one month, loaded together. */
data class MonthMoney(
    val txns: List<Txn> = emptyList(),
    val income: List<Income> = emptyList(),
    val borrowed: List<Due> = emptyList(),
) {
    val spentPaise get() = txns.filter { it.category != Category.INVESTMENT }.sumOf { it.amountPaise }
    val investedPaise get() = txns.filter { it.category == Category.INVESTMENT }.sumOf { it.amountPaise }
    val earnedPaise get() = income.sumOf { it.amountPaise }
    val borrowedPaise get() = borrowed.sumOf { it.totalPaise }

    /** What's left of your earnings after spending and investing. */
    val leftOverPaise get() = earnedPaise - spentPaise - investedPaise

    companion object {
        fun load(month: YearMonth): MonthMoney {
            val from = month.startMillis()
            val to = month.endMillis()
            return MonthMoney(
                txns = Repository.confirmedBetween(from, to),
                income = Repository.incomeBetween(from, to),
                borrowed = Repository.dues().filter { it.kind == DueKind.BORROWED && it.createdAt.inMonth(month) },
            )
        }
    }
}

@Composable
fun SummaryLine(emoji: String, label: String, amount: String, color: Color = Color.Unspecified, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(emoji, Modifier.width(30.dp))
        Text(label, Modifier.weight(1f), fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal)
        Text(amount, color = color, fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold)
    }
}

@Composable
fun IncomeScreen(month: YearMonth, onMonthChange: (YearMonth) -> Unit, version: Int, goDues: () -> Unit) {
    val m by produceState(MonthMoney(), month, version) {
        value = withContext(Dispatchers.IO) { MonthMoney.load(month) }
    }
    var editing by remember { mutableStateOf<Income?>(null) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("Income", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item { MonthSwitcher(month, onMonthChange) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("Earned this month", style = MaterialTheme.typography.labelLarge)
                    Text(Money.format(m.earnedPaise), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    if (m.borrowedPaise > 0) {
                        Text("+ ${Money.format(m.borrowedPaise)} borrowed from family & friends")
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Where it went", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.padding(top = 4.dp))
                    SummaryLine("💰", "Earned", Money.format(m.earnedPaise))
                    SummaryLine("🧾", "Spent", "-" + Money.format(m.spentPaise))
                    SummaryLine("📈", "Invested", "-" + Money.format(m.investedPaise))
                    HorizontalDivider(Modifier.padding(vertical = 6.dp))
                    SummaryLine(
                        "🏦", "Left over", Money.format(m.leftOverPaise),
                        color = if (m.leftOverPaise < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        bold = true,
                    )
                    if (m.leftOverPaise < 0 && m.earnedPaise > 0) {
                        Text(
                            "You spent and invested more than you earned this month.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }

        item { Text("Earnings", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
        if (m.income.isEmpty()) {
            item {
                Text(
                    "Nothing added for this month yet. Tap + to add your salary or any other income.",
                    color = muted,
                )
            }
        }
        items(m.income, key = { "i${it.id}" }) { inc ->
            val linked = inc.duePaymentId != null
            Row(
                Modifier.fillMaxWidth()
                    .then(if (linked) Modifier else Modifier.clickable { editing = inc })
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(inc.kind.emoji, fontSize = 22.sp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(inc.source, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${inc.kind.label} · ${inc.timestamp.dayLabel()}" + if (linked) " · from Dues" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = muted,
                    )
                }
                Text(Money.format(inc.amountPaise), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            }
        }

        if (m.borrowed.isNotEmpty()) {
            item { Text("Borrowed this month", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            items(m.borrowed, key = { "b${it.id}" }) { d ->
                Row(
                    Modifier.fillMaxWidth().clickable(onClick = goDues).padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("🙏", fontSize = 22.sp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("From ${d.name}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${d.createdAt.dayLabel()} · " + if (d.settled) "repaid" else "${Money.format(d.pendingPaise)} still to repay",
                            style = MaterialTheme.typography.bodySmall,
                            color = muted,
                        )
                    }
                    Text(Money.format(d.totalPaise), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    editing?.let { inc -> IncomeDialog(defaultTs = inc.timestamp, existing = inc) { editing = null } }
}

/** Add earnings, or money borrowed from someone (which is saved in Dues so you can track repaying it). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun IncomeDialog(defaultTs: Long, existing: Income? = null, onDismiss: () -> Unit) {
    var kind by remember { mutableStateOf(existing?.kind ?: IncomeKind.SALARY) }
    var borrowed by remember { mutableStateOf(false) }
    var source by remember { mutableStateOf(existing?.source ?: "") }
    var amount by remember { mutableStateOf(existing?.let { Money.plain(it.amountPaise) } ?: "") }
    var note by remember { mutableStateOf(existing?.note ?: "") }
    var ts by remember { mutableStateOf(defaultTs) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val paise = Money.parsePaise(amount)

    val sourceLabel = when {
        borrowed -> "Borrowed from (e.g. Mom, Rahul)"
        kind == IncomeKind.SALARY -> "Company (optional)"
        kind == IncomeKind.FREELANCE -> "Project / client (optional)"
        else -> "From (optional)"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing != null) "Edit income" else "Add money in") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    IncomeKind.entries.forEach { k ->
                        FilterChip(
                            selected = !borrowed && kind == k,
                            onClick = { kind = k; borrowed = false },
                            label = { Text("${k.emoji} ${k.label}") },
                        )
                    }
                    if (existing == null) {
                        FilterChip(selected = borrowed, onClick = { borrowed = true }, label = { Text("🙏 Borrowed") })
                    }
                }
                if (borrowed) {
                    Text(
                        "Borrowed money isn't counted as earnings. It's saved in Dues so you can track paying it back.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedTextField(
                    value = source,
                    onValueChange = { source = it },
                    label = { Text(sourceLabel) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                AmountField(amount, { amount = it }, "Amount (₹)")
                DateButton(ts) { ts = it }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (existing != null) {
                    TextButton(onClick = {
                        if (!confirmDelete) {
                            confirmDelete = true
                        } else {
                            scope.launch(Dispatchers.IO) { Repository.deleteIncome(existing.id) }
                            onDismiss()
                        }
                    }) {
                        Text(if (confirmDelete) "Tap again to delete" else "Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null && (!borrowed || source.isNotBlank()), onClick = {
                val p = paise ?: return@TextButton
                scope.launch(Dispatchers.IO) {
                    when {
                        borrowed -> Repository.addDue(DueKind.BORROWED, source, "", p, note, createdAt = ts)
                        existing == null -> Repository.addIncome(kind, source, p, ts, note)
                        else -> Repository.updateIncome(existing.id, kind, source, p, ts, note)
                    }
                }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
