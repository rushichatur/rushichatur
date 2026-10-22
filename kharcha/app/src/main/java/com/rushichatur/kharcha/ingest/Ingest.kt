package com.rushichatur.kharcha.ingest

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.rushichatur.kharcha.core.NotificationParser
import com.rushichatur.kharcha.core.SmsParser
import com.rushichatur.kharcha.data.InsertResult
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.data.Settings
import com.rushichatur.kharcha.data.Source
import com.rushichatur.kharcha.data.Status
import kotlin.concurrent.thread

object Ingestor {
    fun onSms(c: Context, sender: String, body: String, ts: Long, notify: Boolean = true): Boolean {
        val parsed = SmsParser.parse(sender, body) ?: return false
        return save(c, Source.SMS, sender, parsed, ts, body, notify)
    }

    fun onPaymentNotification(c: Context, pkg: String, title: String, text: String, ts: Long): Boolean {
        val parsed = NotificationParser.parse(pkg, title, text) ?: return false
        val app = NotificationParser.PAYMENT_APPS[pkg]
        return save(c, Source.NOTIFICATION, app, parsed, ts, "$title\n$text", notify = true)
    }

    private fun save(
        c: Context, source: Source, from: String?, parsed: com.rushichatur.kharcha.core.ParsedTxn,
        ts: Long, raw: String, notify: Boolean,
    ): Boolean {
        Repository.init(c)
        val result = Repository.saveIncoming(parsed, source, from, ts, raw, Settings.autoFileKnown(c))
        if (result is InsertResult.New) {
            if (notify && result.txn.status == Status.PENDING) Notifier.askToConfirm(c, result.txn)
            return true
        }
        return false
    }

    /** Reads bank SMS already in the inbox from the last [days] days. Returns how many new expenses were found. */
    fun importInbox(c: Context, days: Int): Int {
        val since = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000
        var found = 0
        c.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf("address", "body", "date"),
            "date > ?",
            arrayOf(since.toString()),
            "date ASC",
        )?.use { cur ->
            while (cur.moveToNext()) {
                val sender = cur.getString(0) ?: continue
                val body = cur.getString(1) ?: continue
                if (onSms(c, sender, body, cur.getLong(2), notify = false)) found++
            }
        }
        return found
    }
}

/** Fires for every incoming SMS; only bank debit alerts are kept. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return
        val sender = parts[0].originatingAddress ?: return
        val body = parts.joinToString("") { it.messageBody ?: "" }
        val ts = parts[0].timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis()
        val app = context.applicationContext
        val pending = goAsync()
        thread {
            try { Ingestor.onSms(app, sender, body, ts) } finally { pending.finish() }
        }
    }
}

/** Watches notifications from GPay, PhonePe, Paytm etc. Needs "Notification access" turned on. */
class PaymentNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg !in NotificationParser.PAYMENT_APPS) return
        val n = sbn.notification
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val title = n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: n.extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        val app = applicationContext
        thread { Ingestor.onPaymentNotification(app, pkg, title, text, sbn.postTime) }
    }
}
