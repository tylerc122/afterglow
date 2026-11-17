#!/bin/bash
# Builds release/Afterglow.app from the castlabs Electron binary.
# Same layout electron-packager produces, minus the dependency.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

OUT=release/Afterglow.app
rm -rf "$OUT"
mkdir -p release
cp -R node_modules/electron/dist/Electron.app "$OUT"

# the app itself: main process + built web app, nothing from node_modules needed at runtime
APP="$OUT/Contents/Resources/app"
mkdir -p "$APP"
cp -R electron dist "$APP/"
cat > "$APP/package.json" <<JSON
{ "name": "afterglow", "productName": "Afterglow", "version": "$(node -p "require('./package.json').version")", "main": "electron/main.cjs" }
JSON

# rename the bundle so the dock, menu bar and Cmd-Tab all say Afterglow
PL="$OUT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Afterglow" "$PL"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Afterglow" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Afterglow" "$PL"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier app.afterglow.desktop" "$PL"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile afterglow.icns" "$PL"
cp build/afterglow.icns "$OUT/Contents/Resources/afterglow.icns"

# Spotify's license server only talks to apps with a production Widevine VMP
# signature (castlabs ships a dev one, Spotify answers it with HTTP 500 and every
# song fails). castlabs' free EVS service signs it. On macOS this has to happen
# BEFORE codesign. One-time setup: .venv-evs/bin/evs-account signup
# The signature only covers the Electron framework, which doesn't change between
# our builds, so it's cached in build/vmp and reused. sign-pkg checks it first and
# only asks castlabs for a new one when it's missing or about to expire.
SIG="$OUT/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Electron Framework.sig"
CACHED="build/vmp/Electron Framework.sig"
[ -f "$CACHED" ] && cp "$CACHED" "$SIG"
if [ -x .venv-evs/bin/evs-vmp ] && .venv-evs/bin/evs-vmp --no-ask sign-pkg release; then
  mkdir -p build/vmp && cp "$SIG" "$CACHED"
  echo "VMP signed"
else
  echo "WARNING: not VMP signed, Spotify will refuse to play in this build (run .venv-evs/bin/evs-account signup)"
fi

# editing the bundle breaks Electron's code signature, re-sign ad hoc so macOS will run it
codesign --force --deep --sign - "$OUT" >/dev/null 2>&1
echo "built $OUT"
