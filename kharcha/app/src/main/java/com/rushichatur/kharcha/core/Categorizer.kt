package com.rushichatur.kharcha.core

/** Guesses a category from the merchant name. Categories you confirm yourself always win (see Repository). */
object Categorizer {

    // Checked in order: more specific categories first (e.g. "Swiggy Instamart" is Groceries, not Food).
    private val keywords: List<Pair<Category, List<String>>> = listOf(
        Category.INVESTMENT to listOf(
            "zerodha", "groww", "upstox", "angel one", "angelone", "kuvera", "coin", "mutual fund", "mutualfund",
            "sip", "nps", "ppf", "indmoney", "paytm money", "paytmmoney", "smallcase", "etmoney", "iccl",
            "indian clearing", "nse clearing", "bse", "kfintech", "cams", "dhan", "sharekhan", "5paisa",
            "motilal", "icicidirect", "icici direct", "hdfc sec", "safegold", "digigold", "fixed deposit",
        ),
        Category.EMI to listOf(
            "emi", "loan", "bajaj fin", "bajajfin", "bajaj finance", "home credit", "hdb fin", "hdbfin",
            "tata capital", "kreditbee", "moneyview", "money view", "lazypay", "simpl", "zestmoney", "fibe",
            "navi", "finance",
        ),
        Category.GROCERIES to listOf(
            "blinkit", "zepto", "instamart", "bigbasket", "big basket", "jiomart", "dmart", "d mart", "grofers",
            "kirana", "supermarket", "super market", "mart", "more retail", "ratnadeep", "spencer",
            "natures basket", "milk", "dairy", "vegetable", "fruits", "country delight", "milkbasket", "grocery",
            "provision",
        ),
        Category.FOOD to listOf(
            "swiggy", "zomato", "eatsure", "dominos", "domino", "pizza", "mcdonald", "kfc", "burger", "starbucks",
            "cafe", "coffee", "restaurant", "dhaba", "biryani", "chai", "tea", "bakery", "bakers", "haldiram",
            "subway", "food", "foods", "eat", "kitchen", "hotel", "canteen", "juice", "sweets", "wow momo",
        ),
        Category.ONLINE to listOf(
            "amazon", "flipkart", "myntra", "meesho", "ajio", "nykaa", "snapdeal", "tata cliq", "tatacliq",
            "firstcry", "lenskart", "purplle", "shopsy", "croma", "reliance digital", "shopify", "razorpay",
        ),
        Category.ENTERTAINMENT to listOf(
            "netflix", "spotify", "hotstar", "disney", "prime video", "primevideo", "youtube", "bookmyshow",
            "pvr", "inox", "cinepolis", "sonyliv", "zee5", "jiocinema", "gaana", "google play", "playstore",
            "steam", "district", "movie", "cinema",
        ),
        Category.TRAVEL to listOf(
            "uber", "ola", "rapido", "irctc", "redbus", "makemytrip", "goibibo", "indigo", "air india", "akasa",
            "spicejet", "metro", "fastag", "cleartrip", "yatra", "ixigo", "petrol", "fuel", "hpcl", "bpcl",
            "iocl", "indian oil", "indianoil", "shell", "nayara", "parking", "toll", "railway", "bus", "cab",
            "taxi", "filling station", "service station",
        ),
        Category.BILLS to listOf(
            "airtel", "jio", "vodafone", "vi", "bsnl", "electricity", "bescom", "msedcl", "mahadiscom",
            "tata power", "adani", "torrent", "broadband", "fibernet", "act", "hathway", "recharge", "bill",
            "bills", "dth", "tata play", "tataplay", "dish tv", "gas", "indane", "water", "lic", "insurance",
            "policybazaar", "cred", "credit card", "rent", "nobroker", "society", "maintenance", "mygate",
        ),
        Category.HEALTH to listOf(
            "pharmacy", "apollo", "1mg", "pharmeasy", "netmeds", "medplus", "hospital", "clinic", "medical",
            "medicals", "chemist", "diagnostic", "lab", "labs", "practo", "cult", "cultfit", "gym", "fitness",
            "healthify", "dental",
        ),
        Category.SHOPPING to listOf(
            "trends", "zudio", "westside", "lifestyle", "max fashion", "pantaloons", "decathlon", "ikea",
            "shoppers stop", "uniqlo", "mall", "fashion", "footwear", "bata", "puma", "nike", "adidas",
            "garments", "textiles", "electronics", "store", "stores", "retail",
        ),
    )

    private val compiled: List<Pair<Category, List<Regex>>> = keywords.map { (cat, words) ->
        cat to words.map { w ->
            val e = Regex.escape(w)
            // Long words may be glued to other text ("swiggyinstamart"); short ones must stand alone.
            if (w.length >= 5) Regex(e) else Regex("(?<![a-z0-9])$e(?![a-z0-9])")
        }
    }

    private val strongBodySignals = listOf(
        Category.EMI to Regex("(?i)\\b(emi|loan)\\b"),
        Category.INVESTMENT to Regex("(?i)\\b(sip|mutual fund|mf)\\b"),
    )

    private val personalVpa = Regex("(?i)@ok(axis|sbi|icici|hdfcbank)$|^\\d{10}@")

    /** Lower-case letters/digits only; used to remember your choice for a merchant. */
    fun merchantKey(merchant: String?): String? =
        merchant?.lowercase()?.filter { it.isLetterOrDigit() }?.takeIf { it.length >= 2 }

    fun suggest(merchant: String?, vpa: String? = null, rawText: String? = null): Category? {
        val name = listOfNotNull(merchant, vpa?.substringBefore('@')).joinToString(" ").lowercase()
        if (name.isNotBlank()) {
            for ((cat, regexes) in compiled) {
                if (regexes.any { it.containsMatchIn(name) }) return cat
            }
        }
        if (rawText != null) {
            for ((cat, r) in strongBodySignals) if (r.containsMatchIn(rawText)) return cat
        }
        if (vpa != null && personalVpa.containsMatchIn(vpa)) return Category.PEOPLE
        return null
    }
}
