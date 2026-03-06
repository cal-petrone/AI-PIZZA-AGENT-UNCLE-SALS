#!/usr/bin/env bash
# Generate a patched moshi/utils/compile.py for CPU-only (no CUDA) PersonaPlex.
# Local – Cursor can run this on your Mac. Then copy the output to your VM.
# Usage: bash scripts/personaplex-compile-patch.sh [personaplex_dir]
# Default personaplex_dir: ~/personaplex
# Output: ./personaplex-compile-patched.py (in project root)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PERSONAPLEX_DIR="${1:-$HOME/personaplex}"
COMPILE_PY="$PERSONAPLEX_DIR/moshi/moshi/utils/compile.py"
OUTPUT="$PROJECT_ROOT/personaplex-compile-patched.py"

if [ ! -f "$COMPILE_PY" ]; then
  echo "Not found: $COMPILE_PY"
  echo "Clone PersonaPlex first: git clone https://github.com/NVIDIA/personaplex.git $PERSONAPLEX_DIR"
  exit 1
fi

python3 - "$COMPILE_PY" "$OUTPUT" << 'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    s = f.read()
s = s.replace(
    "from torch import cuda",
    "try:\n    from torch import cuda\nexcept (AssertionError, AttributeError):\n    cuda = None  # PyTorch not compiled with CUDA (macOS / CPU-only Linux)"
)
idx = s.find("def _is_cuda_graph_enabled() -> bool:\n    if _disable_cuda_graph:")
if idx != -1:
    s = s[:idx] + "def _is_cuda_graph_enabled() -> bool:\n    if cuda is None or _disable_cuda_graph:" + s[idx + len("def _is_cuda_graph_enabled() -> bool:\n    if _disable_cuda_graph:"):]
with open(dst, "w") as f:
    f.write(s)
PY

echo "Patched file written to: $OUTPUT"
echo ""
echo "On the VM, copy and replace:"
echo "  scp $OUTPUT user@YOUR_VM_IP:/tmp/compile.py"
echo "  ssh user@YOUR_VM_IP 'cp /tmp/compile.py ~/personaplex/moshi/moshi/utils/compile.py'"
echo "(Replace user and YOUR_VM_IP with your VM user and IP.)"
