#!/usr/bin/env bash
set -e  # Exit on error

# Check if version argument is provided
VERSION=${1:-"0.0.0"}  # Default to 0.0.0 if no version provided

# Update version in pyproject.toml
sed -i "s/^version = .*/version = \"$VERSION\"/" pyproject.toml

# Update version in __init__.py
sed -i "s/^__version__ = .*/__version__ = \"$VERSION\"/" src/icloudpd_web/__init__.py

# Build Next.js webapp
echo "Building Next.js webapp..."
cd web
npm install
npm run build
cd ..

# Build Python package
echo "Building Python package..."
uv build

uv publish

# Build Docker image
echo "Building Docker image..."
docker build --build-arg VERSION="$VERSION" -t spicadust/icloudpd-web:latest .
docker tag spicadust/icloudpd-web:latest spicadust/icloudpd-web:latest
docker push spicadust/icloudpd-web:latest
