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
if ! command -v node &> /dev/null; then echo -e "${RED}  ✗ Node.js is not installed. Install it first: https://nodejs.org${NC}"; exit 1; fi
echo -e "${GREEN}  ✓ Node.js $(node -v)${NC}"
if ! command -v npm &> /dev/null; then echo -e "${RED}  ✗ npm is not installed.${NC}"; exit 1; fi
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
  
  # ─── YouTube API Key ───
  echo -e "${CYAN}A YouTube Data API v3 key is required for search and live detection.${NC}"
  echo -e "${CYAN}Get one at: https://console.cloud.google.com/apis/credentials${NC}"
  echo ""
  while true; do
    read -p "$(echo -e ${YELLOW}"Enter your YouTube Data API v3 key: "${NC})" api_key
    if [ -z "$api_key" ]; then
      echo -e "${YELLOW}  ⚠ Skipping. Search and live detection won't work.${NC}"
      break
    fi
    echo -e "  ${YELLOW}Validating key...${NC}"
    status=$(curl -s -o /dev/null -w "%{http_code}" "https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=test&maxResults=1&key=$api_key" 2>/dev/null)
    if [ "$status" = "200" ]; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
      else
        sed -i "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
      fi
      echo -e "${GREEN}  ✓ API key is valid and saved${NC}"
      break
    elif [ "$status" = "403" ]; then
      echo -e "${RED}  ✗ Key is invalid or YouTube Data API v3 is not enabled.${NC}"
      echo -e "${RED}    Enable it at: https://console.cloud.google.com/apis/library/youtube.googleapis.com${NC}"
    elif [ "$status" = "429" ]; then
      echo -e "${YELLOW}  ⚠ Key is valid but quota exceeded. It will still work for the app.${NC}"
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
      else
        sed -i "s/YOUTUBE_API_KEY=\"\"/YOUTUBE_API_KEY=\"$api_key\"/" .env
      fi
      echo -e "${GREEN}  ✓ API key saved${NC}"
      break
    else
      echo -e "${RED}  ✗ Validation failed (HTTP $status). Check the key and try again.${NC}"
    fi
  done
  echo ""

  # ─── OAuth (Optional) ───
  read -p "$(echo -e ${YELLOW}"Do you want to configure Google OAuth for broadcast management? (y/n): "${NC})" setup_oauth
  if [[ "$setup_oauth" == "y" || "$setup_oauth" == "Y" ]]; then
    # Client ID
    while true; do
      read -p "$(echo -e ${YELLOW}"Enter OAuth Client ID: "${NC})" oauth_id
      if [ -z "$oauth_id" ]; then
        echo -e "${YELLOW}  ⚠ Skipped OAuth configuration.${NC}"
        break
      fi
      if [[ "$oauth_id" != *.apps.googleusercontent.com ]]; then
        echo -e "${RED}  ✗ Invalid format. Client ID should end with .apps.googleusercontent.com${NC}"
      else
        break
      fi
    done
    
    if [ -n "$oauth_id" ]; then
      # Client Secret
      while true; do
        read -p "$(echo -e ${YELLOW}"Enter OAuth Client Secret: "${NC})" oauth_secret
        if [ -z "$oauth_secret" ]; then
          echo -e "${YELLOW}  ⚠ Skipped OAuth configuration.${NC}"
          break
        fi
        if [ ${#oauth_secret} -lt 10 ]; then
          echo -e "${RED}  ✗ Secret seems too short. Double-check the value.${NC}"
        else
          break
        fi
      done

      if [ -n "$oauth_secret" ]; then
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
  fi
  echo ""
else
  echo -e "${GREEN}▸ .env already exists, keeping existing configuration${NC}"
  echo ""
fi

# ─── External access ───
echo -e "${CYAN}If this server runs on a VPS and needs external access,${NC}"
echo -e "${CYAN}enter the hostname so Vite allows connections from it.${NC}"
read -p "$(echo -e ${YELLOW}"Enter external hostname/IP (or press Enter to skip): "${NC})" ext_host
if [ -n "$ext_host" ]; then
  # Validate DNS resolution
  if [[ "$ext_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${GREEN}  ✓ Valid IP format${NC}"
  elif host "$ext_host" &>/dev/null; then
    echo -e "${GREEN}  ✓ Hostname resolves${NC}"
  else
    echo -e "${YELLOW}  ⚠ Hostname does not resolve via DNS, but we'll use it anyway${NC}"
  fi

  if ! grep -q "VITE_ALLOWED_HOSTS" .env; then
    echo "VITE_ALLOWED_HOSTS=$ext_host" >> .env
  fi
  if grep -q "APP_URL=\"\"" .env 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|APP_URL=\"\"|APP_URL=\"http://$ext_host:3000\"|" .env
    else
      sed -i "s|APP_URL=\"\"|APP_URL=\"http://$ext_host:3000\"|" .env
    fi
  fi
  echo -e "${GREEN}  ✓ External access configured for $ext_host${NC}"
fi
echo ""

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

read -p "$(echo -e ${YELLOW}"Start the dev server now? (y/n): "${NC})" start_now
if [[ "$start_now" == "y" || "$start_now" == "Y" ]]; then
  echo ""
  echo -e "${GREEN}Starting server...${NC}"
  npm run dev
fi
