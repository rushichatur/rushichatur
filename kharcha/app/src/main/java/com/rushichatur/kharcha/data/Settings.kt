package com.rushichatur.kharcha.data

import android.content.Context

object Settings {
    private fun prefs(c: Context) = c.getSharedPreferences("kharcha", Context.MODE_PRIVATE)

    /** When on, payments to merchants you've categorised before are filed without asking. Off by default. */
    fun autoFileKnown(c: Context) = prefs(c).getBoolean("auto_file_known", false)
    fun setAutoFileKnown(c: Context, on: Boolean) = prefs(c).edit().putBoolean("auto_file_known", on).apply()
}
