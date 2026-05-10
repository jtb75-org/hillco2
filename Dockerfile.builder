# syntax=docker/dockerfile:1
#
# Builder image for hillco2 CI.
#
# Bakes the tools every CI workflow in this repo (and the hillco2-gitops
# repo) actually uses: kaniko, kustomize, ruff, node20, gh, jq, yq.
# Replaces the previous external `atlas/builder:latest` reference, which
# was a moving tag managed outside this codebase. Diffs to the build
# environment now land in PRs alongside the code that depends on them.
#
# Built and pushed by .github/workflows/build-builder.yml on changes to
# this file. Consumers pin by image digest, never by tag.

FROM gcr.io/kaniko-project/executor:debug AS kaniko_src

FROM python:3.12-slim-bookworm

ARG KUSTOMIZE_VERSION=5.5.0
ARG NODE_MAJOR=20
ARG RUFF_VERSION=0.15.12

ENV DEBIAN_FRONTEND=noninteractive

# System tooling: shell utilities, certs, git, gnupg (for gh apt key),
# jq, tar. gh + node come from third-party apt repos so they have to
# be installed after gnupg is present.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash ca-certificates curl git gnupg jq tar; \
    install -d /etc/apt/keyrings; \
    \
    # gh CLI
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /etc/apt/keyrings/githubcli.gpg; \
    chmod 644 /etc/apt/keyrings/githubcli.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list; \
    \
    # node20 from NodeSource
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -; \
    \
    apt-get update; \
    apt-get install -y --no-install-recommends gh nodejs; \
    \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*

# yq (mikefarah). Pinned to latest at build time; kept simple because
# yq doesn't break consumers across minor versions in our usage.
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

# kaniko: copy the whole /kaniko/ tree, since the executor relies on a
# few sibling files (CA bundle, scratch dirs). Consumers run
# /kaniko/executor — the canonical path inside the kaniko image.
COPY --from=kaniko_src /kaniko/ /kaniko/

# Smoke-test the assembly so a broken layer fails the build instead of
# surfacing as a confusing CI error later.
RUN set -eux; \
    /kaniko/executor version 2>&1 | head -1; \
    kustomize version; \
    ruff --version; \
    node --version; \
    npm --version; \
    gh --version | head -1; \
    jq --version; \
    yq --version; \
    git --version
