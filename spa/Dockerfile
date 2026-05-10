# Single-stage nginx image; the dist/ bundle is built outside the
# Dockerfile by CI (matching the kaniko-no-multi-stage convention used
# by hillco-portal's Tailwind step). For local builds, run
# `npm run build` first and then `docker build .`.
#
# nginx-unprivileged runs as uid 101 and listens on 8080, so we can run
# the pod with runAsNonRoot=true and bind without root capability.

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY spa/dist /usr/share/nginx/html
COPY spa/nginx.conf /etc/nginx/conf.d/default.conf

ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=${BUILD_COMMIT}
LABEL org.opencontainers.image.revision=${BUILD_COMMIT}

EXPOSE 8080
