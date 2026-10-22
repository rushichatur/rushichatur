package com.rushichatur.kharcha.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ParserTest {

    private fun sms(body: String, sender: String = "VM-HDFCBK") = SmsParser.parse(sender, body)

    @Test fun hdfcUpiToVpa() {
        val t = sms("Rs.450.00 debited from A/c XX1234 on 21-10-26 to VPA swiggy@icici (UPI Ref No 629412345678). If not you, call 18002586161")!!
        assertEquals(45000L, t.amountPaise)
        assertEquals("Swiggy", t.merchant)
        assertEquals("swiggy@icici", t.vpa)
        assertEquals("1234", t.account)
        assertEquals("629412345678", t.ref)
        assertEquals(Category.FOOD, Categorizer.suggest(t.merchant, t.vpa))
    }

    @Test fun hdfcSentToPerson() {
        val t = sms("Sent Rs.200.00\nFrom HDFC Bank A/C *1234\nTo RAJESH KUMAR\nOn 21/10/26\nRef 629400000001\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808")!!
        assertEquals(20000L, t.amountPaise)
        assertEquals("Rajesh Kumar", t.merchant)
        assertEquals("629400000001", t.ref)
    }

    @Test fun iciciCardSpend() {
        val t = sms("INR 1,250.00 spent on ICICI Bank Card XX9876 on 21-Oct-26 at AMAZON PAY. Avl Lmt: INR 45,000.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766", "AX-ICICIT")!!
        assertEquals(125000L, t.amountPaise)
        assertEquals("Amazon Pay", t.merchant)
        assertEquals(Category.ONLINE, Categorizer.suggest(t.merchant))
    }

    @Test fun sbiUpi() {
        val t = sms("Dear UPI user A/C X4321 debited by 120.0 on date 21Oct26 trf to ZOMATO Refno 629411112222. If not u? call 1800111109. -SBI", "JD-SBIUPI-S")!!
        assertEquals(12000L, t.amountPaise)
        assertEquals("Zomato", t.merchant)
        assertEquals("629411112222", t.ref)
    }

    @Test fun axisP2m() {
        val t = sms("INR 500.00 debited\nA/c no. XX1234\n21-10-26, 10:15:30\nUPI/P2M/629455556666/ZEPTO MARKETPLACE\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank", "VK-AXISBK")!!
        assertEquals(50000L, t.amountPaise)
        assertEquals("Zepto Marketplace", t.merchant)
        assertEquals(Category.GROCERIES, Categorizer.suggest(t.merchant))
    }

    @Test fun kotakSentToVpa() {
        val t = sms("Sent Rs.100.00 from Kotak Bank AC X1234 to groww.brk@validicici on 21-10-26.UPI Ref 629477778888. Not you, kotak.com/fraud", "AD-KOTAKB")!!
        assertEquals(10000L, t.amountPaise)
        assertEquals("Groww Brk", t.merchant)
        assertEquals(Category.INVESTMENT, Categorizer.suggest(t.merchant, t.vpa))
    }

    @Test fun emiDebit() {
        val body = "Dear Customer, Rs 15,432 has been debited from your A/c XX1234 towards EMI for Loan A/c 98765 on 05-10-2026."
        val t = sms(body)!!
        assertEquals(1543200L, t.amountPaise)
        assertEquals(Category.EMI, Categorizer.suggest(t.merchant, t.vpa, body))
    }

    @Test fun debitedAndCreditedToOtherAccount() {
        val t = sms("Your a/c no. XXXXXX1234 is debited for Rs.5,000.00 on 05-10-2026 and credited to a/c no. XXXXXX5678 (UPI Ref no 629400009999)")!!
        assertEquals(500000L, t.amountPaise)
        assertNull(t.merchant)
    }

    @Test fun personalGpayHandleIsPeople() {
        val t = sms("Rs.300.00 debited from A/c XX1234 on 21-10-26 to VPA 9876543210@okaxis (UPI Ref No 629400001111).")!!
        assertEquals(Category.PEOPLE, Categorizer.suggest(t.merchant, t.vpa))
    }

    @Test fun ignoresCredit() {
        assertNull(sms("Rs.5000.00 credited to a/c XX1234 on 21-10-26 by a/c linked to VPA friend@okhdfcbank (UPI Ref No 629400002222)."))
    }

    @Test fun ignoresOtp() {
        assertNull(sms("123456 is your OTP for txn of Rs 999.00 at AMAZON on HDFC Bank card XX1234. Valid till 10:30. Do not share."))
    }

    @Test fun ignoresUpcomingAutopay() {
        assertNull(sms("Rs 499 will be debited from your a/c XX1234 on 25-10-26 for NETFLIX mandate."))
    }

    @Test fun ignoresCollectRequest() {
        assertNull(sms("SHOP123 has requested money of Rs 250.00 from you on Google Pay. Pay only if you know them."))
    }

    @Test fun ignoresFailed() {
        assertNull(sms("Your transaction of Rs 250.00 to ZOMATO has failed. Amount if debited will be refunded."))
    }

    @Test fun ignoresPersonalSender() {
        assertNull(sms("I paid Rs 500 to the plumber", sender = "+919876543210"))
    }

    @Test fun skipsBalanceAmount() {
        val t = sms("Avl Bal Rs 12,000.00. Rs 250 debited from A/c XX1234 to VPA uber@axis on 21-10-26.")!!
        assertEquals(25000L, t.amountPaise)
        assertEquals(Category.TRAVEL, Categorizer.suggest(t.merchant, t.vpa))
    }

    @Test fun gpayNotification() {
        val t = NotificationParser.parse("com.google.android.apps.nbu.paisa.user", "Paid ₹350 to Dominos Pizza", "Payment successful")!!
        assertEquals(35000L, t.amountPaise)
        assertEquals("Dominos Pizza", t.merchant)
        assertEquals(Category.FOOD, Categorizer.suggest(t.merchant))
    }

    @Test fun phonepeNotificationMerchantInTitle() {
        val t = NotificationParser.parse("com.phonepe.app", "Netflix", "Paid ₹649 successfully")!!
        assertEquals(64900L, t.amountPaise)
        assertEquals("Netflix", t.merchant)
        assertEquals(Category.ENTERTAINMENT, Categorizer.suggest(t.merchant))
    }

    @Test fun ignoresMoneyReceivedNotification() {
        assertNull(NotificationParser.parse("com.google.android.apps.nbu.paisa.user", "Rahul paid you ₹500", "Tap to view"))
    }

    @Test fun ignoresOtherApps() {
        assertNull(NotificationParser.parse("com.whatsapp", "Paid ₹350 to Dominos", ""))
    }

    @Test fun moneyFormat() {
        assertEquals("₹1,23,456", Money.format(12345600))
        assertEquals("₹999", Money.format(99900))
        assertEquals("₹1,000.50", Money.format(100050))
        assertEquals("₹0", Money.format(0))
    }

    @Test fun merchantKey() {
        assertEquals("amazonpay", Categorizer.merchantKey("Amazon Pay"))
        assertNotNull(Categorizer.merchantKey("Zomato"))
    }
}
