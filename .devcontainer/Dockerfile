FROM ghcr.io/mietzen/docker-mise-devcontainer:latest

USER root

# Install system dependencies for Cockpit, ZFS testing, and Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    cockpit-bridge \
    cockpit-ws \
    zfsutils-linux \
    smartmontools \
    dpkg-dev \
    rpm \
    libpam-systemd \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

USER vscode
