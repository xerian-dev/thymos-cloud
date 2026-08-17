#!/bin/bash
set -euo pipefail

# Configuration
APP_NAME="ThymosTicket"
BUNDLE_ID="cloud.thymos.ticket"
VERSION="${1:-1.0.0}"
BUILD_DIR=".build/release"
APP_BUNDLE="${APP_NAME}.app"
DMG_NAME="${APP_NAME}-${VERSION}.dmg"
STAGING_DIR=".build/dmg-staging"

echo "=== Building ${APP_NAME} v${VERSION} ==="

# 1. Build release binary
echo "→ Building release binary..."
swift build -c release

# 2. Create .app bundle structure
echo "→ Creating app bundle..."
rm -rf "${BUILD_DIR}/${APP_BUNDLE}"
mkdir -p "${BUILD_DIR}/${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${BUILD_DIR}/${APP_BUNDLE}/Contents/Resources"

# Copy binary
cp "${BUILD_DIR}/${APP_NAME}" "${BUILD_DIR}/${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

# Copy icon
cp "Sources/Resources/AppIcon.icns" "${BUILD_DIR}/${APP_BUNDLE}/Contents/Resources/AppIcon.icns"

# Copy any bundled resources from the Swift build
if [ -d "${BUILD_DIR}/${APP_NAME}_${APP_NAME}.bundle" ]; then
    cp -R "${BUILD_DIR}/${APP_NAME}_${APP_NAME}.bundle" "${BUILD_DIR}/${APP_BUNDLE}/Contents/Resources/"
fi

# Create Info.plist
cat > "${BUILD_DIR}/${APP_BUNDLE}/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticTermination</key>
    <true/>
    <key>NSSupportsSuddenTermination</key>
    <true/>
</dict>
</plist>
PLIST

# 3. Create DMG
echo "→ Creating DMG..."
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}"
cp -R "${BUILD_DIR}/${APP_BUNDLE}" "${STAGING_DIR}/"
ln -s /Applications "${STAGING_DIR}/Applications"

rm -f "${BUILD_DIR}/${DMG_NAME}"
hdiutil create \
    -volname "${APP_NAME}" \
    -srcfolder "${STAGING_DIR}" \
    -ov \
    -format UDZO \
    "${BUILD_DIR}/${DMG_NAME}"

# Cleanup staging
rm -rf "${STAGING_DIR}"

echo ""
echo "=== Done ==="
echo "DMG: ${BUILD_DIR}/${DMG_NAME}"
echo "App: ${BUILD_DIR}/${APP_BUNDLE}"
