#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       YouTube Stream Manager — Setup                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Check prerequisites ───
echo -e "${YELLOW}▸ Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}  ✗ Node.js is not installed. Install it first: https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Node.js $(node -v)${NC}"

if ! command -v npm &> /dev/null; then
  echo -e "${RED}  ✗ npm is not installed.${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ npm $(npm -v)${NC}"
echo ""

# ─── Install dependencies ───
echo -e "${YELLOW}▸ Installing npm dependencies...${NC}"
npm install --loglevel=warn 2>&1 | tail -1
echo -e "${GREEN}  ✓ Done${NC}"
echo ""

# ─── Configure .env ───
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}▸ .env file created from .env.example${NC}"
  echo ""
  
  # Prompt for YouTube API Key
  echo -e "${CYAN}YouTube API Key is required for search and live detection.${NC}"
  read -p "$(echo -e ${YELLOW}"Enter your YouTube Data API v3 key (or press Enter to skip): "${NC})" api_key
  if [ -n "$api_key" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
    else
      sed -i "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
    fi
    echo -e "${GREEN}  ✓ API key saved${NC}"
  else
    echo -e "${YELLOW}  ⚠ Skipped. Search and live detection will use fallback mode.${NC}"
  fi
  echo ""

  # Prompt for OAuth (optional)
  read -p "$(echo -e ${YELLOW}"Do you want to configure Google OAuth for broadcast management? (y/n): "${NC})" setup_oauth
  if [[ "$setup_oauth" == "y" || "$setup_oauth" == "Y" ]]; then
    read -p "$(echo -e ${YELLOW}"Enter OAuth Client ID: "${NC})" oauth_id
    read -p "$(echo -e ${YELLOW}"Enter OAuth Client Secret: "${NC})" oauth_secret
    
    if [ -n "$oauth_id" ]; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/OAUTH_CLIENT_ID=\"\"/OAUTH_CLIENT_ID=\"$oauth_id\"/" .env
        sed -i '' "s/OAUTH_CLIENT_SECRET=\"\"/OAUTH_CLIENT_SECRET=\"$oauth_secret\"/" .env
      else
        sed -i "s/OAUTH_CLIENT_ID=\"\"/OAUTH_CLIENT_ID=\"$oauth_id\"/" .env
        sed -i "s/OAUTH_CLIENT_SECRET=\"\"/OAUTH_CLIENT_SECRET=\"$oauth_secret\"/" .env
      fi
      echo -e "${GREEN}  ✓ OAuth credentials saved${NC}"
      echo -e "${YELLOW}  → Add this redirect URI to Google Cloud Console:${NC}"
      echo -e "    ${CYAN}http://localhost:3000/api/auth/google/callback${NC}"
    fi
  fi
  echo ""
else
  echo -e "${GREEN}▸ .env already exists, keeping existing configuration${NC}"
  echo ""
fi

# ─── Summary ───
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Setup Complete                                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Start the dev server:${NC}"
echo -e "    npm run dev"
echo ""
echo -e "  ${GREEN}Open in browser:${NC}"
echo -e "    http://localhost:3000"
echo ""

# Offer to start
read -p "$(echo -e ${YELLOW}"Start the dev server now? (y/n): "${NC})" start_now
if [[ "$start_now" == "y" || "$start_now" == "Y" ]]; then
  echo ""
  echo -e "${GREEN}Starting server...${NC}"
  npm run dev
fi
