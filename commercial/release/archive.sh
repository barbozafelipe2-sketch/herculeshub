#!/usr/bin/env bash
set -euo pipefail
environment="${1:-Sandbox}"
if [[ "$environment" != "Sandbox" && "$environment" != "Production" ]]; then
  echo "Use: bash commercial/release/archive.sh Sandbox|Production" >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "O archive assinado precisa de macOS com Xcode e sua conta Apple configurada." >&2
  exit 1
fi
release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$release_dir/../.." && pwd)"
cd "$repo_root"
node commercial/release/prepare.mjs render --environment "$environment" --archive
node commercial/engine/scripts/prepare-native-assets.mjs
xcodegen generate --spec commercial/ios/project.yml
scheme="HerculesHub-$environment"
destination="$repo_root/commercial/release/generated/$environment"
mkdir -p "$destination"
xcodebuild -project commercial/ios/HerculesHub.xcodeproj -scheme "$scheme" -destination 'generic/platform=iOS' -archivePath "$destination/HerculesHub.xcarchive" -allowProvisioningUpdates ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon archive
xcodebuild -exportArchive -archivePath "$destination/HerculesHub.xcarchive" -exportOptionsPlist "commercial/release/generated/ExportOptions.$environment.plist" -exportPath "$destination/IPA" -allowProvisioningUpdates
echo "Archive e IPA em $destination. Nenhum envio foi feito à Apple."

