#!/usr/bin/env bash
# Reconstrucción reproducible de los tarballs vendorizados de x402-XEC 0f409de (PR-2b C3; INF-042 §5.1, D-01).
# Uso: scripts/build-x402-vendor.sh ‹dir-salida›
# Requiere Node v22.13.1 y pnpm 10.28.0 (los bytes .tgz dependen de zlib/Node y de pnpm; ver
# vendor/x402-xec-0f409de/PROVENANCE.json). X402_VENDOR_ALLOW_OTHER_TOOLS=1 solo para la matriz.
# Red: solo github.com (fetch del commit) y registry.npmjs.org (pnpm install --frozen-lockfile).
set -euo pipefail
OUT="$(mkdir -p "$1" && cd "$1" && pwd)"
COMMIT=0f409dea2959b397ecc4bb84d71519ec6e3aec04
REPO=https://github.com/xolosArmy/x402-XEC.git
NODE_WANT=v22.13.1
PNPM_WANT=10.28.0
if [ "${X402_VENDOR_ALLOW_OTHER_TOOLS:-0}" != 1 ]; then
  [ "$(node --version)" = "$NODE_WANT" ] || { echo "build-x402-vendor: se requiere Node $NODE_WANT (hay $(node --version))" >&2; exit 2; }
  [ "$(pnpm --version)" = "$PNPM_WANT" ] || { echo "build-x402-vendor: se requiere pnpm $PNPM_WANT (hay $(pnpm --version))" >&2; exit 2; }
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git init -q "$WORK/src"
git -C "$WORK/src" fetch -q --depth 1 "$REPO" "$COMMIT"
git -C "$WORK/src" checkout -q FETCH_HEAD
test "$(git -C "$WORK/src" rev-parse HEAD)" = "$COMMIT"
cd "$WORK/src"
export SOURCE_DATE_EPOCH="$(git log -1 --format=%ct)" TZ=UTC LC_ALL=C
# --filter excluye x402-xec-agent-bridge (trae tonalli-core por codeload; frontera RMZWallet).
pnpm install --frozen-lockfile --ignore-scripts --filter "@x402-xec/core" --filter "@x402-xec/express" >/dev/null
pnpm --filter "@x402-xec/core" run build >/dev/null
pnpm --filter "@x402-xec/express" run build >/dev/null
(cd packages/x402-xec-core && pnpm pack --pack-destination "$OUT" >/dev/null)
(cd packages/x402-xec-express && pnpm pack --pack-destination "$OUT" >/dev/null)
cd "$OUT"
for f in x402-xec-core-0.1.0.tgz x402-xec-express-0.1.0.tgz; do
  printf '%s  %s  tar=%s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f" "$(gzip -dc "$f" | sha256sum | cut -d' ' -f1)"
done
echo "tools: node $(node --version) pnpm $(pnpm --version)"
