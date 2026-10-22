# Kharcha – automatic expense tracker (Android)

Kharcha picks up your payments on its own and only asks you one thing: **what was this for?**

- **Bank SMS**: reads debit alerts from HDFC, SBI, ICICI, Axis, Kotak and other Indian banks (UPI, card, EMI, ATM).
- **GPay / PhonePe / Paytm / BHIM / CRED notifications**: gets the shop name from the payment app.
- When the same payment shows up as both an SMS and an app notification, it's counted once.
- Each new payment posts a notification like **"₹450 at Swiggy. Looks like 🍔 Food"** with one-tap buttons (`✓ Food`, `Online Orders`, `Other…`).
- It **remembers** your choice per shop, so the next Swiggy payment is pre-filled. You can switch on *Auto-file* to skip the question for shops you've sorted before.
- Categories: Food, Online Orders, Groceries, Investment, EMI & Loans, Bills & Recharge, Travel & Fuel, Entertainment, Health, Shopping, Friends & Family, Other.
- Monthly total and breakdown by category, history with filters, and manual entry for cash.
- **Private**: the app has no internet permission, so your data stays on your phone.

## Install on your phone

1. Open the repo's **Actions** tab on GitHub → the latest green **Kharcha Android build** run → download **Kharcha-apk** (a zip holding `Kharcha.apk`).
2. Unzip it and open `Kharcha.apk`. Allow "Install unknown apps" when Android asks.
3. Open Kharcha → **Setup** tab → turn on the three switches (SMS, notification access, alerts).
   - If Android says **"Restricted setting"**: App info → ⋮ (top right) → **Allow restricted settings**, then try again.
4. Optional: in Setup, tap **Last 30 days** to import past bank SMS, then sort them in **Review** (or use *Accept all suggestions*).

Every build is signed with the same key (`app/kharcha.keystore`), so installing a newer APK updates the app without losing data.

## Why Android only, and why not the Play Store

- iPhones don't let apps read SMS or other apps' notifications, so this can't work on iOS.
- Google Play only allows SMS permissions for default SMS apps, so Kharcha is installed directly from the APK.
- Google Pay has no public API for your transaction history, so the app reads its notifications instead.

## Code map

| Path | What it does |
| --- | --- |
| `core/SmsParser.kt` | Turns a bank SMS into amount, shop, account and reference no. Ignores credits, OTPs, reminders, failed payments and collect requests |
| `core/NotificationParser.kt` | Same for GPay / PhonePe / Paytm notifications |
| `core/Categorizer.kt` | Guesses a category from the shop name |
| `data/Repository.kt` | SQLite storage, duplicate detection, remembered shop → category choices |
| `ingest/` | SMS receiver, notification listener, the "what was this for?" notification |
| `ui/` | Jetpack Compose screens: Home, Review, History, Setup |

Build locally with Android Studio, or run `./gradlew testDebugUnitTest assembleDebug` from this folder.
