#!/usr/bin/env bash
# Generate ES256 (P-256 ECDSA) keypair for JWT signing.
# Run once per environment. Private key must never leave the host.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
KEYS_DIR="${SCRIPT_DIR}/../keys"
mkdir -p "${KEYS_DIR}"

PRIV="${KEYS_DIR}/jwt-private.pem"
PUB="${KEYS_DIR}/jwt-public.pem"

if [[ -f "${PRIV}" || -f "${PUB}" ]]; then
  echo "Keys already exist in ${KEYS_DIR}. Refusing to overwrite." >&2
  exit 1
fi

# `openssl genpkey` emits PKCS#8 directly (what jose.importPKCS8 expects);
# the older `ecparam -genkey` path produces SEC1, which is not compatible.
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "${PRIV}"
openssl ec -in "${PRIV}" -pubout -out "${PUB}"

chmod 600 "${PRIV}"
chmod 644 "${PUB}"

echo "Generated ES256 keypair:"
echo "  ${PRIV}"
echo "  ${PUB}"
