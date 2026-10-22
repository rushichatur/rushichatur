package com.rushichatur.kharcha.core

enum class Category(val label: String, val emoji: String) {
    FOOD("Food", "🍔"),
    ONLINE("Online Orders", "🛒"),
    GROCERIES("Groceries", "🥦"),
    INVESTMENT("Investment", "📈"),
    EMI("EMI & Loans", "🏦"),
    BILLS("Bills & Recharge", "💡"),
    TRAVEL("Travel & Fuel", "🚕"),
    ENTERTAINMENT("Entertainment", "🎬"),
    HEALTH("Health", "💊"),
    SHOPPING("Shopping", "🛍️"),
    PEOPLE("Friends & Family", "👥"),
    OTHER("Other", "📦");

    companion object {
        fun fromName(name: String?): Category? = entries.firstOrNull { it.name == name }
    }
}
