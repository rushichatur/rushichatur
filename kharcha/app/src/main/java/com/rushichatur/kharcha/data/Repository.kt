package com.rushichatur.kharcha.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.rushichatur.kharcha.core.Categorizer
import com.rushichatur.kharcha.core.Category
import com.rushichatur.kharcha.core.ParsedTxn
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class Source { SMS, NOTIFICATION, MANUAL }
enum class Status { PENDING, CONFIRMED, IGNORED }

data class Txn(
    val id: Long,
    val amountPaise: Long,
    val merchant: String,
    val vpa: String?,
    val category: Category?,
    val suggested: Category?,
    val note: String,
    val timestamp: Long,
    val source: Source,
    val sourceApp: String?,
    val account: String?,
    val ref: String?,
    val raw: String?,
    val status: Status,
    val holdingId: Long?,
)

enum class DueKind(val label: String, val emoji: String) {
    LENT("Lent", "🤝"),
    FREELANCE("Freelance", "💼"),
    BORROWED("Borrowed", "🙏");

    /** True when the money comes to you; false for money you borrowed and must repay. */
    val owedToYou: Boolean get() = this != BORROWED
}

enum class IncomeKind(val label: String, val emoji: String) {
    SALARY("Salary", "💰"),
    FREELANCE("Freelance", "💼"),
    INTEREST("Interest & dividends", "🏦"),
    GIFT("Gift", "🎁"),
    OTHER("Other", "➕"),
}

data class Income(
    val id: Long,
    val kind: IncomeKind,
    val source: String,
    val amountPaise: Long,
    val timestamp: Long,
    val note: String,
    /** Set when this income came from logging a freelance payment in Dues. */
    val duePaymentId: Long?,
)

enum class HoldingKind(val label: String, val emoji: String) {
    MUTUAL_FUND("Mutual funds", "📊"),
    STOCK("Stocks", "📈"),
    OTHER("Other (FD, gold, PPF…)", "🪙"),
}

/** One mutual fund, stock, FD etc. Invested = what you had before adding it + every payment linked to it. */
data class Holding(
    val id: Long,
    val kind: HoldingKind,
    val name: String,
    val openingPaise: Long,
    val addedPaise: Long,
    val valuePaise: Long,
    val valueUpdatedAt: Long,
    val createdAt: Long,
) {
    val investedPaise: Long get() = openingPaise + addedPaise
    val gainPaise: Long get() = valuePaise - investedPaise
}

/** Money owed between you and someone: a loan either way, or a freelance project fee. */
data class Due(
    val id: Long,
    val kind: DueKind,
    val name: String,
    val client: String,
    val totalPaise: Long,
    val receivedPaise: Long,
    val note: String,
    val createdAt: Long,
    val settled: Boolean,
) {
    val pendingPaise: Long get() = (totalPaise - receivedPaise).coerceAtLeast(0)
}

data class DuePayment(val id: Long, val amountPaise: Long, val timestamp: Long, val note: String)

/** Result of saving an incoming payment. */
sealed class InsertResult {
    data class New(val txn: Txn) : InsertResult()
    data object Duplicate : InsertResult()
}

private class Db(context: Context) : SQLiteOpenHelper(context, "kharcha.db", null, 3) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE txn(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount INTEGER NOT NULL,
                merchant TEXT NOT NULL,
                vpa TEXT,
                category TEXT,
                suggested TEXT,
                note TEXT NOT NULL DEFAULT '',
                ts INTEGER NOT NULL,
                source TEXT NOT NULL,
                source_app TEXT,
                account TEXT,
                ref TEXT,
                raw TEXT,
                status TEXT NOT NULL,
                holding_id INTEGER)"""
        )
        db.execSQL("CREATE INDEX txn_ts ON txn(ts)")
        db.execSQL("CREATE TABLE rule(merchant_key TEXT PRIMARY KEY, category TEXT NOT NULL)")
        createDueTables(db)
        createIncomeAndHoldingTables(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Existing data is always kept; upgrades only add tables and columns.
        if (oldVersion < 2) createDueTables(db)
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE txn ADD COLUMN holding_id INTEGER")
            createIncomeAndHoldingTables(db)
            // Freelance payments logged before this version count as income too.
            db.execSQL(
                """INSERT INTO income(kind, source, amount, ts, note, due_payment_id)
                   SELECT 'FREELANCE', d.name, p.amount, p.ts, p.note, p.id
                   FROM due_payment p JOIN due d ON d.id = p.due_id WHERE d.kind = 'FREELANCE'"""
            )
        }
    }

    private fun createIncomeAndHoldingTables(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE income(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                source TEXT NOT NULL,
                amount INTEGER NOT NULL,
                ts INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                due_payment_id INTEGER)"""
        )
        db.execSQL("CREATE INDEX income_ts ON income(ts)")
        db.execSQL(
            """CREATE TABLE holding(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                opening INTEGER NOT NULL DEFAULT 0,
                value INTEGER NOT NULL DEFAULT 0,
                value_ts INTEGER NOT NULL,
                created INTEGER NOT NULL)"""
        )
    }

    private fun createDueTables(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE due(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                client TEXT NOT NULL DEFAULT '',
                total INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created INTEGER NOT NULL,
                settled INTEGER NOT NULL DEFAULT 0)"""
        )
        db.execSQL(
            """CREATE TABLE due_payment(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                due_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                ts INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '')"""
        )
        db.execSQL("CREATE INDEX due_payment_due ON due_payment(due_id)")
    }
}

/** Single place that reads and writes expenses. Every write bumps [changes] so open screens refresh. */
object Repository {
    private lateinit var db: Db
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes

    private const val DEDUPE_WINDOW_MS = 10 * 60 * 1000L

    fun init(context: Context) {
        if (!::db.isInitialized) db = Db(context.applicationContext)
    }

    private fun bump() = _changes.update { it + 1 }

    // ---- Incoming payments ----

    @Synchronized
    fun saveIncoming(
        parsed: ParsedTxn,
        source: Source,
        sourceApp: String?,
        timestamp: Long,
        raw: String,
        autoFileKnown: Boolean,
    ): InsertResult {
        val w = db.writableDatabase
        findDuplicate(parsed, source, timestamp)?.let { existing ->
            // Same payment seen twice (e.g. bank SMS + GPay notification). Fill in anything we were missing.
            val cv = ContentValues()
            if (existing.ref == null && parsed.ref != null) cv.put("ref", parsed.ref)
            if (existing.merchant == UNKNOWN && parsed.merchant != null) cv.put("merchant", parsed.merchant)
            if (existing.vpa == null && parsed.vpa != null) cv.put("vpa", parsed.vpa)
            if (existing.account == null && parsed.account != null) cv.put("account", parsed.account)
            if (cv.size() > 0) {
                w.update("txn", cv, "id=?", arrayOf(existing.id.toString()))
                bump()
            }
            return InsertResult.Duplicate
        }

        val merchant = parsed.merchant ?: UNKNOWN
        val learned = ruleFor(parsed.merchant) ?: ruleFor(parsed.vpa)
        val suggestion = learned ?: Categorizer.suggest(parsed.merchant, parsed.vpa, raw)
        val autoConfirm = autoFileKnown && learned != null

        val cv = ContentValues().apply {
            put("amount", parsed.amountPaise)
            put("merchant", merchant)
            put("vpa", parsed.vpa)
            put("suggested", suggestion?.name)
            put("category", if (autoConfirm) learned!!.name else null)
            put("ts", timestamp)
            put("source", source.name)
            put("source_app", sourceApp)
            put("account", parsed.account)
            put("ref", parsed.ref)
            put("raw", raw)
            put("status", if (autoConfirm) Status.CONFIRMED.name else Status.PENDING.name)
        }
        val id = w.insert("txn", null, cv)
        bump()
        return InsertResult.New(get(id)!!)
    }

    private fun findDuplicate(p: ParsedTxn, source: Source, ts: Long): Txn? {
        if (p.ref != null) {
            query("ref=?", arrayOf(p.ref)).firstOrNull()?.let { return it }
        }
        val near = query(
            "amount=? AND ts BETWEEN ? AND ?",
            arrayOf(p.amountPaise.toString(), (ts - DEDUPE_WINDOW_MS).toString(), (ts + DEDUPE_WINDOW_MS).toString()),
        )
        return near.firstOrNull { t ->
            when {
                t.timestamp == ts -> true // same message imported twice
                t.source != source && t.source != Source.MANUAL -> true // SMS + app notification for one payment
                source == Source.NOTIFICATION && t.source == Source.NOTIFICATION -> true // app re-posted its notification
                else -> false
            }
        }
    }

    // ---- Reads ----

    fun get(id: Long): Txn? = query("id=?", arrayOf(id.toString())).firstOrNull()

    fun pending(): List<Txn> = query("status=?", arrayOf(Status.PENDING.name), "ts DESC")

    fun pendingCount(): Int = db.readableDatabase
        .rawQuery("SELECT COUNT(*) FROM txn WHERE status=?", arrayOf(Status.PENDING.name))
        .use { if (it.moveToFirst()) it.getInt(0) else 0 }

    fun confirmedBetween(from: Long, to: Long): List<Txn> =
        query("status=? AND ts>=? AND ts<?", arrayOf(Status.CONFIRMED.name, from.toString(), to.toString()), "ts DESC")

    // ---- Writes ----

    fun confirm(id: Long, category: Category, note: String? = null) {
        val cv = ContentValues().apply {
            put("category", category.name)
            put("status", Status.CONFIRMED.name)
            if (note != null) put("note", note.trim())
        }
        db.writableDatabase.update("txn", cv, "id=?", arrayOf(id.toString()))
        if (category != Category.INVESTMENT) setTxnHolding(id, null)
        get(id)?.let { t ->
            if (t.source != Source.MANUAL) {
                learn(t.merchant.takeIf { it != UNKNOWN }, category)
                learn(t.vpa, category)
            }
        }
        bump()
    }

    fun ignore(id: Long) {
        val cv = ContentValues().apply { put("status", Status.IGNORED.name) }
        db.writableDatabase.update("txn", cv, "id=?", arrayOf(id.toString()))
        bump()
    }

    fun delete(id: Long) {
        setTxnHolding(id, null)
        db.writableDatabase.delete("txn", "id=?", arrayOf(id.toString()))
        bump()
    }

    fun addManual(
        amountPaise: Long, what: String, category: Category,
        timestamp: Long = System.currentTimeMillis(), holdingId: Long? = null,
    ) {
        val cv = ContentValues().apply {
            put("amount", amountPaise)
            put("merchant", what.ifBlank { category.label })
            put("category", category.name)
            put("suggested", category.name)
            put("ts", timestamp)
            put("source", Source.MANUAL.name)
            put("status", Status.CONFIRMED.name)
        }
        val id = db.writableDatabase.insert("txn", null, cv)
        if (holdingId != null) setTxnHolding(id, holdingId)
        bump()
    }

    /** Confirms every pending expense that already has a suggested category. Returns how many. */
    fun acceptAllSuggestions(): Int {
        val list = pending().filter { it.suggested != null }
        list.forEach { confirm(it.id, it.suggested!!) }
        return list.size
    }

    // ---- Learned merchant -> category rules ----

    private fun learn(merchantOrVpa: String?, category: Category) {
        val key = Categorizer.merchantKey(merchantOrVpa) ?: return
        val cv = ContentValues().apply {
            put("merchant_key", key)
            put("category", category.name)
        }
        db.writableDatabase.insertWithOnConflict("rule", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun ruleFor(merchantOrVpa: String?): Category? {
        val key = Categorizer.merchantKey(merchantOrVpa) ?: return null
        return db.readableDatabase
            .rawQuery("SELECT category FROM rule WHERE merchant_key=?", arrayOf(key))
            .use { if (it.moveToFirst()) Category.fromName(it.getString(0)) else null }
    }

    // ---- Money owed to you: loans to people and pending freelance payments ----

    fun dues(): List<Due> = db.readableDatabase.rawQuery(
        """SELECT d.*, COALESCE((SELECT SUM(p.amount) FROM due_payment p WHERE p.due_id = d.id), 0) AS received
           FROM due d ORDER BY d.settled ASC, d.created DESC""",
        null,
    ).use { c ->
        buildList {
            while (c.moveToNext()) {
                add(
                    Due(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        kind = DueKind.valueOf(c.str("kind")!!),
                        name = c.str("name") ?: "",
                        client = c.str("client") ?: "",
                        totalPaise = c.getLong(c.getColumnIndexOrThrow("total")),
                        receivedPaise = c.getLong(c.getColumnIndexOrThrow("received")),
                        note = c.str("note") ?: "",
                        createdAt = c.getLong(c.getColumnIndexOrThrow("created")),
                        settled = c.getInt(c.getColumnIndexOrThrow("settled")) != 0,
                    )
                )
            }
        }
    }

    fun duePayments(dueId: Long): List<DuePayment> = db.readableDatabase.query(
        "due_payment", null, "due_id=?", arrayOf(dueId.toString()), null, null, "ts DESC",
    ).use { c ->
        buildList {
            while (c.moveToNext()) {
                add(
                    DuePayment(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        amountPaise = c.getLong(c.getColumnIndexOrThrow("amount")),
                        timestamp = c.getLong(c.getColumnIndexOrThrow("ts")),
                        note = c.str("note") ?: "",
                    )
                )
            }
        }
    }

    fun addDue(
        kind: DueKind, name: String, client: String, totalPaise: Long, note: String,
        alreadyReceivedPaise: Long = 0, createdAt: Long = System.currentTimeMillis(),
    ): Long {
        val cv = ContentValues().apply {
            put("kind", kind.name)
            put("name", name.trim())
            put("client", client.trim())
            put("total", totalPaise)
            put("note", note.trim())
            put("created", createdAt)
        }
        val id = db.writableDatabase.insert("due", null, cv)
        if (alreadyReceivedPaise > 0) {
            recordDuePayment(id, alreadyReceivedPaise, if (kind == DueKind.FREELANCE) "Advance" else "Paid before adding", createdAt)
        } else {
            bump()
        }
        return id
    }

    fun updateDue(id: Long, name: String, client: String, totalPaise: Long, note: String) {
        val cv = ContentValues().apply {
            put("name", name.trim())
            put("client", client.trim())
            put("total", totalPaise)
            put("note", note.trim())
        }
        db.writableDatabase.update("due", cv, "id=?", arrayOf(id.toString()))
        refreshSettled(id)
        bump()
    }

    /** Logs money you got back. The entry closes itself once everything is paid. */
    fun recordDuePayment(dueId: Long, amountPaise: Long, note: String = "", ts: Long = System.currentTimeMillis()) {
        val cv = ContentValues().apply {
            put("due_id", dueId)
            put("amount", amountPaise)
            put("ts", ts)
            put("note", note.trim())
        }
        val paymentId = db.writableDatabase.insert("due_payment", null, cv)
        val due = dues().firstOrNull { it.id == dueId }
        if (due?.kind == DueKind.FREELANCE) {
            addIncome(IncomeKind.FREELANCE, due.name, amountPaise, ts, note, duePaymentId = paymentId)
        }
        refreshSettled(dueId, allowReopen = false)
        bump()
    }

    fun deleteDuePayment(paymentId: Long, dueId: Long) {
        db.writableDatabase.delete("income", "due_payment_id=?", arrayOf(paymentId.toString()))
        db.writableDatabase.delete("due_payment", "id=?", arrayOf(paymentId.toString()))
        refreshSettled(dueId)
        bump()
    }

    fun setDueSettled(id: Long, settled: Boolean) {
        val cv = ContentValues().apply { put("settled", if (settled) 1 else 0) }
        db.writableDatabase.update("due", cv, "id=?", arrayOf(id.toString()))
        bump()
    }

    fun deleteDue(id: Long) {
        db.writableDatabase.delete(
            "income", "due_payment_id IN (SELECT id FROM due_payment WHERE due_id=?)", arrayOf(id.toString()),
        )
        db.writableDatabase.delete("due_payment", "due_id=?", arrayOf(id.toString()))
        db.writableDatabase.delete("due", "id=?", arrayOf(id.toString()))
        bump()
    }

    /** Turns a pending payment (e.g. GPay to a friend) into money lent, so it no longer counts as spending. */
    fun lendFromTxn(txnId: Long, personName: String) {
        val t = get(txnId) ?: return
        val name = personName.ifBlank { t.merchant.takeIf { it != UNKNOWN } ?: t.vpa ?: "Someone" }
        addDue(DueKind.LENT, name, "", t.amountPaise, "", createdAt = t.timestamp)
        ignore(txnId)
    }

    private fun refreshSettled(dueId: Long, allowReopen: Boolean = true) {
        val d = dues().firstOrNull { it.id == dueId } ?: return
        val shouldBeSettled = d.receivedPaise >= d.totalPaise
        if (shouldBeSettled != d.settled && (shouldBeSettled || allowReopen)) {
            val cv = ContentValues().apply { put("settled", if (shouldBeSettled) 1 else 0) }
            db.writableDatabase.update("due", cv, "id=?", arrayOf(dueId.toString()))
        }
    }

    // ---- Income ----

    fun incomeBetween(from: Long, to: Long): List<Income> = db.readableDatabase.query(
        "income", null, "ts>=? AND ts<?", arrayOf(from.toString(), to.toString()), null, null, "ts DESC",
    ).use { c ->
        buildList {
            while (c.moveToNext()) {
                add(
                    Income(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        kind = IncomeKind.valueOf(c.str("kind")!!),
                        source = c.str("source") ?: "",
                        amountPaise = c.getLong(c.getColumnIndexOrThrow("amount")),
                        timestamp = c.getLong(c.getColumnIndexOrThrow("ts")),
                        note = c.str("note") ?: "",
                        duePaymentId = c.str("due_payment_id")?.toLongOrNull(),
                    )
                )
            }
        }
    }

    fun addIncome(
        kind: IncomeKind, source: String, amountPaise: Long, ts: Long, note: String, duePaymentId: Long? = null,
    ) {
        val cv = ContentValues().apply {
            put("kind", kind.name)
            put("source", source.trim().ifBlank { kind.label })
            put("amount", amountPaise)
            put("ts", ts)
            put("note", note.trim())
            put("due_payment_id", duePaymentId)
        }
        db.writableDatabase.insert("income", null, cv)
        bump()
    }

    fun updateIncome(id: Long, kind: IncomeKind, source: String, amountPaise: Long, ts: Long, note: String) {
        val cv = ContentValues().apply {
            put("kind", kind.name)
            put("source", source.trim().ifBlank { kind.label })
            put("amount", amountPaise)
            put("ts", ts)
            put("note", note.trim())
        }
        db.writableDatabase.update("income", cv, "id=?", arrayOf(id.toString()))
        bump()
    }

    fun deleteIncome(id: Long) {
        db.writableDatabase.delete("income", "id=?", arrayOf(id.toString()))
        bump()
    }

    // ---- Investments: mutual funds, stocks and others ----

    fun holdings(): List<Holding> = db.readableDatabase.rawQuery(
        """SELECT h.*, COALESCE((SELECT SUM(t.amount) FROM txn t
                                 WHERE t.holding_id = h.id AND t.status = 'CONFIRMED'), 0) AS added
           FROM holding h ORDER BY h.kind, h.name COLLATE NOCASE""",
        null,
    ).use { c ->
        buildList {
            while (c.moveToNext()) {
                add(
                    Holding(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        kind = HoldingKind.valueOf(c.str("kind")!!),
                        name = c.str("name") ?: "",
                        openingPaise = c.getLong(c.getColumnIndexOrThrow("opening")),
                        addedPaise = c.getLong(c.getColumnIndexOrThrow("added")),
                        valuePaise = c.getLong(c.getColumnIndexOrThrow("value")),
                        valueUpdatedAt = c.getLong(c.getColumnIndexOrThrow("value_ts")),
                        createdAt = c.getLong(c.getColumnIndexOrThrow("created")),
                    )
                )
            }
        }
    }

    /** [openingPaise] is what you had invested before you started using Kharcha. */
    fun addHolding(kind: HoldingKind, name: String, openingPaise: Long, valuePaise: Long?) {
        val now = System.currentTimeMillis()
        val cv = ContentValues().apply {
            put("kind", kind.name)
            put("name", name.trim())
            put("opening", openingPaise)
            put("value", valuePaise ?: openingPaise)
            put("value_ts", now)
            put("created", now)
        }
        db.writableDatabase.insert("holding", null, cv)
        bump()
    }

    fun updateHolding(id: Long, kind: HoldingKind, name: String, openingPaise: Long) {
        val cv = ContentValues().apply {
            put("kind", kind.name)
            put("name", name.trim())
            put("opening", openingPaise)
        }
        db.writableDatabase.update("holding", cv, "id=?", arrayOf(id.toString()))
        bump()
    }

    fun updateHoldingValue(id: Long, valuePaise: Long) {
        val cv = ContentValues().apply {
            put("value", valuePaise)
            put("value_ts", System.currentTimeMillis())
        }
        db.writableDatabase.update("holding", cv, "id=?", arrayOf(id.toString()))
        bump()
    }

    /** Removes the holding. Linked payments stay in your expenses as Investment. */
    fun deleteHolding(id: Long) {
        val cv = ContentValues().apply { putNull("holding_id") }
        db.writableDatabase.update("txn", cv, "holding_id=?", arrayOf(id.toString()))
        db.writableDatabase.delete("holding", "id=?", arrayOf(id.toString()))
        bump()
    }

    /** Adds money to a fund/stock: saved as an Investment expense for the month and added to its value. */
    fun investInHolding(holdingId: Long, amountPaise: Long, ts: Long) {
        val h = holdings().firstOrNull { it.id == holdingId } ?: return
        addManual(amountPaise, h.name, Category.INVESTMENT, ts, holdingId)
    }

    /** Links a payment to a holding (or unlinks with null) and moves its amount into that holding's value. */
    fun setTxnHolding(txnId: Long, holdingId: Long?) {
        val t = get(txnId) ?: return
        if (t.holdingId == holdingId) return
        val w = db.writableDatabase
        if (t.holdingId != null) {
            w.execSQL("UPDATE holding SET value = MAX(0, value - ?) WHERE id = ?", arrayOf<Any>(t.amountPaise, t.holdingId))
        }
        if (holdingId != null) {
            w.execSQL("UPDATE holding SET value = value + ? WHERE id = ?", arrayOf<Any>(t.amountPaise, holdingId))
        }
        val cv = ContentValues().apply { if (holdingId == null) putNull("holding_id") else put("holding_id", holdingId) }
        w.update("txn", cv, "id=?", arrayOf(txnId.toString()))
        bump()
    }

    // ---- Helpers ----

    const val UNKNOWN = "Unknown"

    private fun query(where: String, args: Array<String>, order: String? = null): List<Txn> =
        db.readableDatabase.query("txn", null, where, args, null, null, order).use { c ->
            buildList { while (c.moveToNext()) add(c.toTxn()) }
        }

    private fun Cursor.str(col: String): String? = getColumnIndexOrThrow(col).let { if (isNull(it)) null else getString(it) }

    private fun Cursor.toTxn() = Txn(
        id = getLong(getColumnIndexOrThrow("id")),
        amountPaise = getLong(getColumnIndexOrThrow("amount")),
        merchant = str("merchant") ?: UNKNOWN,
        vpa = str("vpa"),
        category = Category.fromName(str("category")),
        suggested = Category.fromName(str("suggested")),
        note = str("note") ?: "",
        timestamp = getLong(getColumnIndexOrThrow("ts")),
        source = Source.valueOf(str("source")!!),
        sourceApp = str("source_app"),
        account = str("account"),
        ref = str("ref"),
        raw = str("raw"),
        status = Status.valueOf(str("status")!!),
        holdingId = str("holding_id")?.toLongOrNull(),
    )
}
