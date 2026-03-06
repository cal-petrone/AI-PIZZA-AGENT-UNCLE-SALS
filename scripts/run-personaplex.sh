#!/usr/bin/env bash
# Run PersonaPlex server (macOS, CPU offload). Requires HF_TOKEN set.
# Usage: export HF_TOKEN='your_token' && bash scripts/run-personaplex.sh
set -e
PERSONAPLEX_DIR="${PERSONAPLEX_DIR:-$HOME/personaplex}"
if [ -z "$HF_TOKEN" ]; then
  echo "Error: HF_TOKEN is not set."
  echo "1. Get a Read token: https://huggingface.co/settings/tokens"
  echo "2. Run: export HF_TOKEN='your_token_here'"
  echo "3. Then run this script again."
  exit 1
fi
cd "$PERSONAPLEX_DIR"
source venv/bin/activate
SSL_DIR=$(mktemp -d)
echo "Starting PersonaPlex (CPU offload). Open the URL it prints in your browser."
# --device cpu avoids CUDA entirely (required on Mac / no NVIDIA GPU)
exec python -m moshi.server --ssl "$SSL_DIR" --device cpu --cpu-offload
