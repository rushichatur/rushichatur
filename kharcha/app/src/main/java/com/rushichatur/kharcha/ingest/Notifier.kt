package com.rushichatur.kharcha.ingest

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.rushichatur.kharcha.R
import com.rushichatur.kharcha.core.Category
import com.rushichatur.kharcha.core.Money
import com.rushichatur.kharcha.data.Repository
import com.rushichatur.kharcha.data.Txn
import com.rushichatur.kharcha.ui.MainActivity

/** Posts the "₹450 at Swiggy — what was this for?" notification with one-tap category buttons. */
object Notifier {
    private const val CHANNEL = "confirm_expense"
    const val EXTRA_TXN_ID = "txn_id"
    const val EXTRA_CATEGORY = "category"

    fun ensureChannel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Confirm expenses", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Asks what each new payment was for"
                }
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun askToConfirm(c: Context, txn: Txn) {
        val nmc = NotificationManagerCompat.from(c)
        if (!nmc.areNotificationsEnabled()) return
        ensureChannel(c)

        val amount = Money.format(txn.amountPaise)
        val title = if (txn.merchant == Repository.UNKNOWN) "$amount spent" else "$amount at ${txn.merchant}"
        val text = txn.suggested?.let { "Looks like ${it.emoji} ${it.label}. Tap ✓ to confirm or pick another." }
            ?: "Where did you spend this? Tap to pick a category."

        val builder = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rupee)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openReview(c, txn.id))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        val quick = buildList {
            txn.suggested?.let { add(it) }
            addAll(listOf(Category.FOOD, Category.ONLINE, Category.INVESTMENT, Category.EMI).filter { it != txn.suggested })
        }.take(2)
        quick.forEachIndexed { i, cat ->
            val label = if (i == 0 && txn.suggested == cat) "✓ ${cat.label}" else cat.label
            builder.addAction(0, label, confirmIntent(c, txn.id, cat))
        }
        builder.addAction(0, "Other…", openReview(c, txn.id))

        nmc.notify(txn.id.toInt(), builder.build())
    }

    fun cancel(c: Context, txnId: Long) = NotificationManagerCompat.from(c).cancel(txnId.toInt())

    private fun openReview(c: Context, id: Long): PendingIntent {
        val i = Intent(c, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_TXN_ID, id)
        }
        return PendingIntent.getActivity(c, (id * 16).toInt(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun confirmIntent(c: Context, id: Long, cat: Category): PendingIntent {
        val i = Intent(c, ConfirmActionReceiver::class.java).apply {
            putExtra(EXTRA_TXN_ID, id)
            putExtra(EXTRA_CATEGORY, cat.name)
        }
        return PendingIntent.getBroadcast(c, (id * 16 + cat.ordinal + 1).toInt(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}

/** Handles taps on the category buttons inside the notification. */
class ConfirmActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getLongExtra(Notifier.EXTRA_TXN_ID, -1)
        val cat = Category.fromName(intent.getStringExtra(Notifier.EXTRA_CATEGORY)) ?: return
        if (id < 0) return
        Repository.init(context)
        Repository.confirm(id, cat)
        Notifier.cancel(context, id)
    }
}
