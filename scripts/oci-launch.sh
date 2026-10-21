#!/bin/bash
# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-License-Identifier: Apache-2.0
#
# Retry-launch an Oracle Cloud Always Free Ampere A1 instance until capacity
# opens. The A1 free shape is heavily oversubscribed in most regions; this loop
# keeps trying every availability domain until a slot frees up.
#
# Prerequisites (see INSTALL.md "Out of capacity? Automate retries with the OCI CLI"):
#   1. OCI CLI installed and configured (`oci setup config`).
#   2. An SSH key at ~/.ssh/id_ed25519.pub.
#   3. cloud-init.sh next to this script (installs Docker at first boot).
#
# Configuration (your OCIDs) is kept OUT of this script -- it lives in a local,
# gitignored `oci-launch.env` next to this file. Set it up once:
#   cp scripts/oci-launch.env.example scripts/oci-launch.env
#   # then fill in COMP / SUBNET / IMAGE / ADS (the commands that print them
#   # are in that INSTALL.md section, step 2)
# Then run:
#   ./scripts/oci-launch.sh
#
# Stops immediately on real errors (bad OCID, auth); only "Out of host
# capacity" / "LimitExceeded" triggers a retry.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_INIT="${SCRIPT_DIR}/cloud-init.sh"
SSH_KEY="${HOME}/.ssh/id_ed25519.pub"
CONFIG_FILE="${SCRIPT_DIR}/oci-launch.env"
LOG=/tmp/oci-launch.log

# ---- Load your account-specific values from the gitignored config ----------
# Defaults so `set -u` doesn't trip before the guards below.
COMP="" SUBNET="" IMAGE="" ADS=()
OCPUS=1 MEMORY_GB=6   # within Always Free (max 4 OCPU / 24 GB total); 1/6 = console default
# shellcheck source=/dev/null
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

[ -f "$CONFIG_FILE" ] || { echo "missing $CONFIG_FILE — copy oci-launch.env.example to it and fill in your OCIDs"; exit 1; }
[ -n "$COMP" ]   || { echo "COMP not set in $CONFIG_FILE";   exit 1; }
[ -n "$SUBNET" ] || { echo "SUBNET not set in $CONFIG_FILE"; exit 1; }
[ -n "$IMAGE" ]  || { echo "IMAGE not set in $CONFIG_FILE";  exit 1; }
[ "${#ADS[@]}" -gt 0 ] || { echo "ADS not set in $CONFIG_FILE"; exit 1; }
[ -f "$CLOUD_INIT" ] || { echo "missing $CLOUD_INIT (it belongs next to this script)"; exit 1; }
[ -f "$SSH_KEY" ]    || { echo "missing $SSH_KEY — run ssh-keygen first"; exit 1; }

while true; do
  for AD in "${ADS[@]}"; do
    echo "$(date '+%H:%M:%S')  trying $AD ..."
    if oci compute instance launch \
        --compartment-id "$COMP" \
        --availability-domain "$AD" \
        --shape VM.Standard.A1.Flex \
        --shape-config "{\"ocpus\":${OCPUS},\"memoryInGBs\":${MEMORY_GB}}" \
        --image-id "$IMAGE" \
        --subnet-id "$SUBNET" \
        --assign-public-ip true \
        --display-name lumina \
        --hostname-label lumina \
        --ssh-authorized-keys-file "$SSH_KEY" \
        --user-data-file "$CLOUD_INIT" \
        --wait-for-state RUNNING 2>&1 | tee "$LOG"; then
      echo "✅ launched in $AD"
      exit 0
    fi
    if grep -q "Out of host capacity\|LimitExceeded\|TooManyRequests" "$LOG"; then
      echo "   no capacity or rate limited, next AD"
    else
      echo "❌ non-capacity error — check $LOG"
      exit 1
    fi
  done
  sleep 300   # all ADs full — wait before next sweep (5 min avoids rate limiting)
done
