package com.rushichatur.kharcha.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.rushichatur.kharcha.core.Category
import com.rushichatur.kharcha.core.Money
import com.rushichatur.kharcha.data.Repository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val monthFmt = DateTimeFormatter.ofPattern("MMMM yyyy")
private val dayFmt = DateTimeFormatter.ofPattern("EEE, d MMM")
private val timeFmt = DateTimeFormatter.ofPattern("h:mm a")
private val dayTimeFmt = DateTimeFormatter.ofPattern("d MMM, h:mm a")

fun Long.toLocal() = Instant.ofEpochMilli(this).atZone(ZoneId.systemDefault())
fun Long.dayLabel(): String = toLocal().format(dayFmt)
fun Long.timeLabel(): String = toLocal().format(timeFmt)
fun Long.dayTimeLabel(): String = toLocal().format(dayTimeFmt)

fun YearMonth.startMillis() = atDay(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
fun YearMonth.endMillis() = plusMonths(1).startMillis()

@Composable
fun MonthSwitcher(month: YearMonth, onChange: (YearMonth) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = { onChange(month.minusMonths(1)) }) { Text("‹ Prev") }
        Text(month.format(monthFmt), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        TextButton(onClick = { onChange(month.plusMonths(1)) }, enabled = month < YearMonth.now()) { Text("Next ›") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CategoryChips(selected: Category?, onSelect: (Category) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Category.entries.forEach { c ->
            FilterChip(
                selected = selected == c,
                onClick = { onSelect(c) },
                label = { Text("${c.emoji} ${c.label}") },
            )
        }
    }
}

@Composable
fun AddExpenseDialog(onDismiss: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var what by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<Category?>(null) }
    val scope = rememberCoroutineScope()
    val paise = Money.parsePaise(amount)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add cash expense") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Amount (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = what,
                    onValueChange = { what = it },
                    label = { Text("Where / what for") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                CategoryChips(category) { category = it }
            }
        },
        confirmButton = {
            TextButton(
                enabled = paise != null && category != null,
                onClick = {
                    val p = paise ?: return@TextButton
                    val c = category ?: return@TextButton
                    scope.launch(Dispatchers.IO) { Repository.addManual(p, what, c) }
                    onDismiss()
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
