#!/bin/bash

cp .env.example build/script/
cp build-readme.md build/script/README.md
cp package.json build/script/package.json
cp start-server.sh build/script/start-server.sh
cp start-interval-integration.sh build/script/start-interval-integration.sh
cp start-auto-integration.sh build/script/start-auto-integration.sh

PKG_VERSION=$(node -p "require('./package.json').version")
PKG_NAME=$(node -p "require('./package.json').name")

echo "Packaging script $PKG_NAME version $PKG_VERSION..."

cd build || exit 1
BUNDLE_NAME="$PKG_NAME-$PKG_VERSION.zip"
cd script || exit 1

bestzip ../"$BUNDLE_NAME" *
cd ../..
echo "Done."
