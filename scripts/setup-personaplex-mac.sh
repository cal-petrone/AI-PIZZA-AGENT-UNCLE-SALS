#!/usr/bin/env bash
# PersonaPlex setup on macOS (Apple Silicon). Run this after Homebrew is installed.
# Usage: bash scripts/setup-personaplex-mac.sh
set -e
echo "=== PersonaPlex macOS setup ==="

# 1. Install Opus and Python via Homebrew (if brew is available)
if command -v brew &>/dev/null; then
  echo "Installing opus and python..."
  brew install opus python@3.11 2>/dev/null || true
else
  echo "Homebrew not found. Install it first: https://brew.sh"
  echo "Then run: brew install opus python@3.11"
  exit 1
fi

# 2. Clone PersonaPlex to home directory
PERSONAPLEX_DIR="$HOME/personaplex"
if [ -d "$PERSONAPLEX_DIR" ]; then
  echo "PersonaPlex already cloned at $PERSONAPLEX_DIR. Pulling latest..."
  (cd "$PERSONAPLEX_DIR" && git pull) || true
else
  echo "Cloning PersonaPlex..."
  git clone https://github.com/NVIDIA/personaplex.git "$PERSONAPLEX_DIR"
fi
cd "$PERSONAPLEX_DIR"

# 3. Create virtualenv and install (PersonaPlex needs Python >= 3.10)
PYTHON_CMD=python3
if command -v python3.11 &>/dev/null; then
  PYTHON_CMD=python3.11
elif [ -x /opt/homebrew/bin/python3.11 ]; then
  PYTHON_CMD=/opt/homebrew/bin/python3.11
fi
echo "Creating virtualenv with $PYTHON_CMD and installing moshi..."
rm -rf venv
"$PYTHON_CMD" -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install moshi/.
pip install accelerate

echo ""
echo "=== Setup done. Next steps (run these yourself): ==="
echo "1. Get your HuggingFace token from: https://huggingface.co/settings/tokens"
echo "2. Accept the PersonaPlex license: https://huggingface.co/nvidia/personaplex-7b-v1"
echo "3. In Terminal, run:"
echo "   cd $PERSONAPLEX_DIR"
echo "   source venv/bin/activate"
echo "   export HF_TOKEN=your_token_here"
echo "   SSL_DIR=\$(mktemp -d) && python -m moshi.server --ssl \"\$SSL_DIR\" --cpu-offload"
echo "4. Open the URL it prints (e.g. https://localhost:8998) in your browser."
echo ""
