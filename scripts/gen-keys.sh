#!/usr/bin/env bash
# Generate ES256 (P-256 ECDSA) keypair for JWT signing.
# Output is PKCS#8, compatible with jose.importPKCS8.
# Run once per environment. Private key must never leave the host.
set -euo pipefail

# Restrictive umask so the private key is created mode 0600 atomically,
# not first 0644 then chmodded.
umask 077

command -v openssl >/dev/null 2>&1 || {
  echo "openssl not found in PATH" >&2
  exit 127
}

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
KEYS_DIR="${SCRIPT_DIR}/../keys"
mkdir -p "${KEYS_DIR}"

PRIV="${KEYS_DIR}/jwt-private.pem"
PUB="${KEYS_DIR}/jwt-public.pem"

if [[ -f "${PRIV}" || -f "${PUB}" ]]; then
  echo "Keys already exist in ${KEYS_DIR}. Refusing to overwrite." >&2
  exit 1
fi

# Atomic write: produce in a temp file in the same directory, then rename.
TMP_PRIV="$(mktemp "${KEYS_DIR}/.jwt-private.XXXXXX")"
TMP_PUB="$(mktemp "${KEYS_DIR}/.jwt-public.XXXXXX")"
trap 'rm -f "${TMP_PRIV}" "${TMP_PUB}"' EXIT

# `openssl genpkey` emits PKCS#8 directly (jose.importPKCS8 expects PKCS#8).
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "${TMP_PRIV}"
openssl ec -in "${TMP_PRIV}" -pubout -out "${TMP_PUB}" 2>/dev/null

chmod 600 "${TMP_PRIV}"
chmod 644 "${TMP_PUB}"

# `mv -n` is atomic on the same filesystem and refuses to overwrite, closing
# the TOCTOU race against another concurrent invocation of this script.
mv -n "${TMP_PRIV}" "${PRIV}"
mv -n "${TMP_PUB}"  "${PUB}"

echo "Generated ES256 keypair (PKCS#8):"
echo "  ${PRIV}"
echo "  ${PUB}"
