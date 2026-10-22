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
)

enum class DueKind(val label: String, val emoji: String) {
    LENT("Lent to people", "🤝"),
    FREELANCE("Freelance projects", "💼"),
}

/** Money someone owes you: a loan to a friend, or a freelance project fee. */
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

private class Db(context: Context) : SQLiteOpenHelper(context, "kharcha.db", null, 2) {
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
                status TEXT NOT NULL)"""
        )
        db.execSQL("CREATE INDEX txn_ts ON txn(ts)")
        db.execSQL("CREATE TABLE rule(merchant_key TEXT PRIMARY KEY, category TEXT NOT NULL)")
        createDueTables(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Existing expenses are kept; new tables are only added.
        if (oldVersion < 2) createDueTables(db)
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
        db.writableDatabase.delete("txn", "id=?", arrayOf(id.toString()))
        bump()
    }

    fun addManual(amountPaise: Long, what: String, category: Category, timestamp: Long = System.currentTimeMillis()) {
        val cv = ContentValues().apply {
            put("amount", amountPaise)
            put("merchant", what.ifBlank { category.label })
            put("category", category.name)
            put("suggested", category.name)
            put("ts", timestamp)
            put("source", Source.MANUAL.name)
            put("status", Status.CONFIRMED.name)
        }
        db.writableDatabase.insert("txn", null, cv)
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
        if (alreadyReceivedPaise > 0) recordDuePayment(id, alreadyReceivedPaise, "Received before adding") else bump()
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
        db.writableDatabase.insert("due_payment", null, cv)
        refreshSettled(dueId, allowReopen = false)
        bump()
    }

    fun deleteDuePayment(paymentId: Long, dueId: Long) {
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
    )
}
