#!/usr/bin/env bash
set -e

# ─── YouTube Stream Manager — Setup Script ───
# Run this once after cloning to configure the project.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║       YouTube Stream Manager — Setup                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Install dependencies ───
echo "▸ Installing dependencies..."
npm install
echo "  ✓ Done"
echo ""

# ─── 2. Create .env from template ───
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "▸ Created .env from .env.example"
else
  echo "▸ .env already exists, skipping"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   NEXT STEPS                                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  1. Edit .env with your YouTube API credentials:"
echo "     nano .env"
echo ""
echo "  2. Get credentials from Google Cloud Console:"
echo "     https://console.cloud.google.com/apis/credentials"
echo ""
echo "     Required:"
echo "     · YouTube Data API v3 → enable + create API key"
echo ""
echo "     Optional (for OAuth + broadcast management):"
echo "     · Create OAuth 2.0 Client ID (Web application)"
echo "     · Add redirect URI: http://localhost:3000/api/auth/google/callback"
echo "     · Set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET in .env"
echo ""
echo "  3. Start the development server:"
echo "     npm run dev"
echo ""
echo "  4. Open in browser:"
echo "     http://localhost:3000"
echo ""
