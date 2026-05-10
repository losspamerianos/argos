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

openssl ecparam -name prime256v1 -genkey -noout -out "${PRIV}"
openssl ec -in "${PRIV}" -pubout -out "${PUB}"

chmod 600 "${PRIV}"
chmod 644 "${PUB}"

echo "Generated ES256 keypair:"
echo "  ${PRIV}"
echo "  ${PUB}"
