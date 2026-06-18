#!/bin/bash
# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-License-Identifier: Apache-2.0
#
# Cloud-init / OCI initialization script. Runs as root at first boot.
# Installs Docker + tools so the instance is ready to run Lumina on SSH-in.
# Used both by oci-launch.sh and as a paste-in for the OCI Console
# "Initialization script" field.
apt-get update
apt-get install -y curl git
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
