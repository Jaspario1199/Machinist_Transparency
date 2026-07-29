#!/usr/bin/env bash
#
# CONTRIBUTING.md rule 5: never commit credentials, production IP addresses,
# customer data or controlled drawings.
#
# Run locally before pushing:
#     bash scripts/scan-secrets.sh
#
# Exits non-zero if anything suspicious is found.
set -uo pipefail

cd "$(dirname "$0")/.."

EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.github)
FOUND=0

report() {
  echo "::error::$1"
  echo "$2"
  FOUND=1
}

# Private-range IPv4 addresses. Configuration templates must use placeholders
# such as "replace-with-approved-host", never a real machine address.
if matches=$(grep -rInE \
  '\b(10\.[0-9]{1,3}|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}\b' \
  "${EXCLUDES[@]}" . ); then
  report "Possible production IP address committed" "$matches"
fi

# Credential-shaped assignments with a non-placeholder value.
if matches=$(grep -rInE \
  '(password|passwd|secret|api[_-]?key|access[_-]?token)[[:space:]]*[:=][[:space:]]*.{6,}' \
  "${EXCLUDES[@]}" --include='*.py' --include='*.js' --include='*.mjs' \
  --include='*.yaml' --include='*.yml' --include='*.json' --include='*.env*' . ); then
  report "Possible credential committed" "$matches"
fi

if [ "$FOUND" -eq 0 ]; then
  echo "Secret scan clean."
fi
exit "$FOUND"
