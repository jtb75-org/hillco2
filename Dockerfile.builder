# syntax=docker/dockerfile:1
#
# Builder image for hillco2 CI (lint + validate workloads).
#
# Bakes the tooling that the lint job and the hillco2-gitops validate
# workflow actually use: ruff, kustomize, node20+npm, gh, jq, yq, git,
# curl. Versions are pinned via ARGs.
#
# Deliberately single-stage: kaniko has known multi-stage push-auth
# issues (between stages it deletes the build container's filesystem,
# wiping any kaniko docker-config we'd written before invoking the
# executor). The same convention is documented in build-and-push.yml's
# "build assets outside the Dockerfile" comment.
#
# kaniko itself is NOT baked in here. The kaniko-using jobs (the build
# step in build-and-push.yml, and build-builder.yml below) continue to
# run inside zot.lan.ng20.org/atlas/builder:latest, which already
# ships /opt/kaniko/executor. A follow-up can pin atlas/builder to a
# specific digest to close the supply-chain loop without trying to
# self-host kaniko in this image.
#
# Built and pushed by .github/workflows/build-builder.yml on changes
# to this file. Consumers pin by image digest.

FROM python:3.12-slim-bookworm

ARG KUSTOMIZE_VERSION=5.5.0
ARG NODE_MAJOR=20
ARG RUFF_VERSION=0.15.12

ENV DEBIAN_FRONTEND=noninteractive

# Shell utilities, certs, git, gnupg (for gh apt key), jq, tar.
# gh + node come from third-party apt repos so they have to be
# installed after gnupg is present.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash ca-certificates curl git gnupg jq tar; \
    install -d /etc/apt/keyrings; \
    \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /etc/apt/keyrings/githubcli.gpg; \
    chmod 644 /etc/apt/keyrings/githubcli.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list; \
    \
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -; \
    \
    apt-get update; \
    apt-get install -y --no-install-recommends gh nodejs; \
    \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*

# yq (mikefarah)
RUN ARCH=$(dpkg --print-architecture); \
    curl -fsSL -o /usr/local/bin/yq \
      "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${ARCH}"; \
    chmod +x /usr/local/bin/yq

# kustomize
RUN ARCH=$(dpkg --print-architecture); \
    curl -fsSL -o /tmp/kustomize.tar.gz \
      "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/v${KUSTOMIZE_VERSION}/kustomize_v${KUSTOMIZE_VERSION}_linux_${ARCH}.tar.gz"; \
    tar -xzf /tmp/kustomize.tar.gz -C /usr/local/bin; \
    rm /tmp/kustomize.tar.gz

# ruff (astral-sh prebuilt static binary)
RUN ARCH=$(uname -m); \
    case "${ARCH}" in \
      x86_64) RUFF_ARCH="x86_64-unknown-linux-musl" ;; \
      aarch64|arm64) RUFF_ARCH="aarch64-unknown-linux-musl" ;; \
      *) echo "unsupported arch ${ARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/ruff.tar.gz \
      "https://github.com/astral-sh/ruff/releases/download/${RUFF_VERSION}/ruff-${RUFF_ARCH}.tar.gz"; \
    tar -xzf /tmp/ruff.tar.gz -C /tmp; \
    mv /tmp/ruff-*/ruff /usr/local/bin/ruff; \
    chmod +x /usr/local/bin/ruff; \
    rm -rf /tmp/ruff.tar.gz /tmp/ruff-*

# Smoke-test. pipefail is required for `cmd | head` to fail when cmd
# is missing — without it, head's success status hides the real error.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN set -eux; \
    test -x /usr/local/bin/kustomize; \
    test -x /usr/local/bin/ruff; \
    test -x /usr/local/bin/yq; \
    kustomize version; \
    ruff --version; \
    node --version; \
    npm --version; \
    gh --version | head -1; \
    jq --version; \
    yq --version; \
    git --version
