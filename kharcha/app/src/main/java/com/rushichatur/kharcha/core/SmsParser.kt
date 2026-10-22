package com.rushichatur.kharcha.core

/** A money-out event pulled from a bank SMS or a payment-app notification. */
data class ParsedTxn(
    val amountPaise: Long,
    val merchant: String?,
    val vpa: String?,
    val account: String?,
    val ref: String?,
)

/**
 * Reads Indian bank / UPI SMS and keeps only money that left your account.
 * Credits, OTPs, reminders, failed payments and collect requests are ignored.
 */
object SmsParser {

    private const val I = "(?i)"

    private val ignorePhrases = Regex(
        I + "(is your otp|otp is|otp for|\\botp to\\b|one time password|verification code|" +
            "will be debited|to be debited|will be deducted|is due|due on|due date|due by|" +
            "has requested|requested money|collect request|request of|" +
            "\\bfailed\\b|declined|unsuccessful|reversed|refund|" +
            "cashback|\\boffer\\b|get upto|win )"
    )

    private val debitWords = Regex(
        I + "\\b(debited|debit of|spent|sent|paid|withdrawn|withdrawal|purchase|purchased|deducted|txn of|transaction of)\\b"
    )
    private val creditWords = Regex(I + "\\b(credited|received|deposited)\\b")

    private val amountRegex = Regex(I + "(?:rs\\.?|inr|₹)\\s*:?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)")
    private val bareAmountRegex = Regex(
        I + "\\b(?:debited|spent|sent|paid|deducted)\\s+(?:by|for|of|with)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\b"
    )
    private val balanceHint = Regex(I + "(bal|balance|lmt|limit)[^0-9]{0,12}$")

    private val accountRegex = Regex(
        I + "\\b(?:a/c|ac|acct|account|card)\\s*(?:no\\.?|number)?\\s*(?:ending(?:\\s+with)?)?\\s*[x*.\\s]*([0-9]{3,6})\\b"
    )
    private val refRegex = Regex(
        I + "\\b(?:ref(?:erence)?|rrn|utr|txn\\s*id|transaction\\s*id)\\s*(?:no\\.?|number|num|id)?\\s*[:.\\-]?\\s*([0-9a-z]{6,})"
    )

    private const val STOP =
        "(?=\\s+(?:ref|on\\b|upi\\b|via\\b|vide\\b|using\\b|thru\\b|through\\b|from\\b|avl|avail|bal\\b|txn\\b|with\\b|" +
            "is\\b|has\\b|not\\b|if\\b|and\\b|dated?\\b|at\\b|for\\b)|\\s*[,;(]|\\.\\s|\\.$|\\s*$)"

    private val vpaRegex = Regex("([a-zA-Z0-9.\\-_]{2,})@([a-zA-Z]{2,})")
    private val merchantPatterns = listOf(
        Regex(I + "\\bto\\s+(?:vpa\\s+)?([a-z0-9.\\-_]+@[a-z]+)"),
        Regex(I + "upi/p2[am]/\\d+/([^/\\n]+?)(?=\\s*(?:/|not you|\\n|$))"),
        Regex(I + "\\btrf to\\s+(.+?)(?=\\s*ref|\\.|$)"),
        Regex(I + "\\b(?:to|at)\\s+(.+?)$STOP"),
        Regex(I + "\\btowards\\s+(.+?)$STOP"),
        Regex(I + "\\binfo:?\\s*(.+?)$STOP"),
    )

    /** Sender IDs like "VM-HDFCBK". Messages from personal phone numbers are never treated as bank alerts. */
    fun isFromBank(sender: String): Boolean {
        val compact = sender.replace(Regex("[\\s+\\-()]"), "")
        if (compact.isEmpty()) return false
        return !compact.all { it.isDigit() }
    }

    fun parse(sender: String, body: String): ParsedTxn? {
        if (!isFromBank(sender)) return null
        return parseBody(body)
    }

    fun parseBody(body: String): ParsedTxn? {
        val text = body.replace(Regex("\\s+"), " ").trim()
        if (ignorePhrases.containsMatchIn(text)) return null

        val debit = debitWords.find(text) ?: return null
        val credit = creditWords.find(text)
        if (credit != null && credit.range.first < debit.range.first) return null

        val amount = findAmount(text) ?: return null
        val vpa = findVpa(text)
        return ParsedTxn(
            amountPaise = amount,
            merchant = findMerchant(text),
            vpa = vpa,
            account = accountRegex.find(text)?.groupValues?.get(1),
            ref = refRegex.findAll(text).map { it.groupValues[1] }.firstOrNull { r -> r.any { it.isDigit() } },
        )
    }

    private fun findAmount(text: String): Long? {
        for (m in amountRegex.findAll(text)) {
            val before = text.substring(0, m.range.first)
            if (balanceHint.containsMatchIn(before.takeLast(20))) continue
            Money.parsePaise(m.groupValues[1])?.let { return it }
        }
        return bareAmountRegex.find(text)?.let { Money.parsePaise(it.groupValues[1]) }
    }

    private fun findVpa(text: String): String? {
        val m = Regex(I + "\\bto\\s+(?:vpa\\s+)?([a-z0-9.\\-_]+@[a-z]+)").find(text) ?: return null
        return m.groupValues[1].lowercase()
    }

    internal fun findMerchant(text: String): String? {
        for (p in merchantPatterns) {
            for (m in p.findAll(text)) {
                val cleaned = cleanMerchant(m.groupValues[1]) ?: continue
                return cleaned
            }
        }
        return null
    }

    fun cleanMerchant(raw: String): String? {
        var s = raw.trim().trimEnd('.', ',', ';', ':', '-', ')', '(').trim()
        s = s.replace(Regex(I + "^(vpa|m/s\\.?|mr\\.?|ms\\.?|mrs\\.?)\\s+"), "")
        val vpa = vpaRegex.matchEntire(s)
        if (vpa != null) s = vpaToName(vpa.groupValues[1]) ?: return s.lowercase()
        s = s.replace(Regex("\\s+"), " ").trim()
        if (s.length < 2 || s.length > 40) return null
        val lower = s.lowercase()
        if (lower.first().isDigit()) return null
        if (Regex("^(rs\\.?|inr|₹|your|you|a/c|ac |acct|account|the |card|self\\b|date\\b)").containsMatchIn(lower)) return null
        if (lower.contains("a/c") || lower.contains("xx")) return null
        return titleCase(s)
    }

    /** "swiggy.stores" -> "Swiggy Stores". Phone-number handles stay as they are (null). */
    private fun vpaToName(local: String): String? {
        if (local.count { it.isDigit() } >= 8) return null
        val words = local.replace(Regex("[._\\-]"), " ").replace(Regex("\\d+"), " ").trim()
        if (words.length < 2) return null
        return words
    }

    private fun titleCase(s: String): String {
        val hasLower = s.any { it.isLowerCase() }
        if (hasLower && s.first().isUpperCase()) return s
        return s.lowercase().split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercaseChar() } }
    }
}
