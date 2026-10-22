package com.rushichatur.kharcha.core

import java.math.BigDecimal

object Money {
    /** "1,250.50" -> 125050 paise. Returns null for anything that isn't a positive amount. */
    fun parsePaise(text: String): Long? {
        val clean = text.replace(",", "").trim().trimEnd('.')
        val value = clean.toBigDecimalOrNull() ?: return null
        if (value <= BigDecimal.ZERO) return null
        return value.movePointRight(2).toLong()
    }

    /** 12345650 paise -> "123456.50" (for pre-filling input boxes). */
    fun plain(paise: Long): String {
        val r = paise / 100
        val p = paise % 100
        return if (p == 0L) "$r" else "$r." + p.toString().padStart(2, '0')
    }

    /** 12345600 paise -> "₹1,23,456" (Indian digit grouping, paise shown only when non-zero). */
    fun format(paise: Long): String {
        val negative = paise < 0
        val abs = kotlin.math.abs(paise)
        val rupees = abs / 100
        val p = abs % 100
        val digits = rupees.toString()
        val grouped = if (digits.length <= 3) {
            digits
        } else {
            val last3 = digits.takeLast(3)
            val rest = digits.dropLast(3)
            rest.reversed().chunked(2).joinToString(",").reversed() + "," + last3
        }
        val paiseText = if (p == 0L) "" else "." + p.toString().padStart(2, '0')
        return (if (negative) "-" else "") + "₹" + grouped + paiseText
    }
}
