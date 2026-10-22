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

/** Result of saving an incoming payment. */
sealed class InsertResult {
    data class New(val txn: Txn) : InsertResult()
    data object Duplicate : InsertResult()
}

private class Db(context: Context) : SQLiteOpenHelper(context, "kharcha.db", null, 1) {
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
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
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
