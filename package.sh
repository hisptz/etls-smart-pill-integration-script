#!/bin/bash

cp .env.example build/script/

PKG_VERSION=$(node -p "require('./package.json').version")
PKG_NAME=$(node -p "require('./package.json').name")

echo "Packaging script $PKG_NAME version $PKG_VERSION..."

cd build || exit 1
BUNDLE_NAME="$PKG_NAME-$PKG_VERSION.zip"
cd script || exit 1

bestzip ../"$BUNDLE_NAME" *
cd ../..
echo "Done."
