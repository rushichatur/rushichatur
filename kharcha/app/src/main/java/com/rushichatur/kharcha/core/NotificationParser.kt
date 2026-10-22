package com.rushichatur.kharcha.core

/** Reads "You paid ₹200 to Swiggy"-style notifications from UPI apps. */
object NotificationParser {

    val PAYMENT_APPS = mapOf(
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "com.phonepe.app" to "PhonePe",
        "net.one97.paytm" to "Paytm",
        "in.org.npci.upiapp" to "BHIM",
        "in.amazon.mShop.android.shopping" to "Amazon Pay",
        "com.dreamplug.androidapp" to "CRED",
    )

    private const val I = "(?i)"
    private val ignore = Regex(
        I + "(paid you|sent you|you received|received|credited|requested|request|failed|declined|pending|" +
            "cashback|reward|scratch|offer|remind|due|refund|expired|cancelled)"
    )
    private val paidWords = Regex(I + "\\b(paid|sent|payment successful|payment of|debited|transferred)\\b")
    private val amountRegex = Regex(I + "(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)")
    private val toRegex = Regex(
        I + "\\bto\\s+(.+?)(?=\\s+(?:on|using|via|from|with|for|is|was)\\b|\\s*[,|•·]|\\.\\s|\\.$|\\s*$)"
    )

    fun parse(packageName: String, title: String, text: String): ParsedTxn? {
        if (packageName !in PAYMENT_APPS) return null
        val full = "$title | $text".replace(Regex("\\s+"), " ").trim()
        if (ignore.containsMatchIn(full)) return null
        if (!paidWords.containsMatchIn(full)) return null
        val amount = amountRegex.find(full)?.let { Money.parsePaise(it.groupValues[1]) } ?: return null

        var merchant = toRegex.findAll(full)
            .mapNotNull { SmsParser.cleanMerchant(it.groupValues[1]) }
            .firstOrNull()
        if (merchant == null && title.isNotBlank() && !amountRegex.containsMatchIn(title) && !paidWords.containsMatchIn(title)) {
            merchant = SmsParser.cleanMerchant(title)
        }
        val vpa = Regex(I + "([a-z0-9.\\-_]+@[a-z]+)").find(full)?.groupValues?.get(1)?.lowercase()
        return ParsedTxn(amountPaise = amount, merchant = merchant, vpa = vpa, account = null, ref = null)
    }
}
