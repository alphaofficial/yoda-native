#!/usr/bin/env bash
set -euo pipefail

REPO="alphaofficial/yoda-native"
APP_NAME="Yoda.app"
APPLICATIONS_DIR="/Applications"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

if [[ "$OS" != "darwin" ]]; then
  printf 'Yoda desktop installer only supports macOS. Detected: %s\n' "$OS" >&2
  exit 1
fi

case "$ARCH" in
  arm64) ASSET_ARCH="arm64" ;;
  *) printf 'Unsupported architecture: %s\n' "$ARCH" >&2; exit 1 ;;
esac

LATEST_URL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest")"
VERSION="${LATEST_URL##*/}"
VERSION="${VERSION#v}"
ASSET="Yoda-${VERSION}-${ASSET_ARCH}-mac.zip"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

printf 'Latest Yoda release: v%s\n' "$VERSION"
printf 'Asset: %s\n' "$ASSET"
read -r -p 'Install this version to /Applications? [y/N] ' CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) printf 'Install cancelled.\n'; exit 0 ;;
esac

printf 'Downloading Yoda...\n'
curl -fL "$URL" -o "$TMP_DIR/$ASSET"

printf 'Extracting Yoda...\n'
ditto -x -k "$TMP_DIR/$ASSET" "$TMP_DIR"

printf 'Installing Yoda to %s...\n' "$APPLICATIONS_DIR"
rm -rf "$APPLICATIONS_DIR/$APP_NAME"
ditto "$TMP_DIR/$APP_NAME" "$APPLICATIONS_DIR/$APP_NAME"

printf 'Removing macOS quarantine attributes...\n'
xattr -cr "$APPLICATIONS_DIR/$APP_NAME" 2>/dev/null || true

printf 'Installed %s\n' "$APPLICATIONS_DIR/$APP_NAME"
printf 'Done!\n'
