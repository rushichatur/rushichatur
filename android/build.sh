#!/usr/bin/env bash
# Builds LiteOffice.apk without Android Studio or Gradle.
# Needs (Ubuntu/Debian): sudo apt-get install aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign default-jdk
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
KEYSTORE=${KEYSTORE:-liteoffice.keystore}
KS_PASS=${KS_PASS:-liteoffice}
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/assets"

# 1. The web app goes into assets/office
cp -r ../office "$OUT/assets/office"
rm -f "$OUT/assets/office/README.md"

# 2. Compile Java -> dex
javac --release 8 -nowarn -Xlint:-options -encoding UTF-8 -cp "$ANDROID_JAR" -d "$OUT/classes" $(find src -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"

# 3. Package resources + assets, add code, align, sign
aapt package -f -M AndroidManifest.xml -S res -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias liteoffice \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Lite Office" >/dev/null 2>&1
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias liteoffice --out LiteOffice.apk "$OUT/aligned.apk"
apksigner verify LiteOffice.apk
echo "Built $(pwd)/LiteOffice.apk ($(du -h LiteOffice.apk | cut -f1))"
