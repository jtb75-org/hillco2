# Single-stage nginx image; the dist/ bundle is built outside the
# Dockerfile by CI (matching the kaniko-no-multi-stage convention used
# by hillco-portal's Tailwind step). For local builds, run
# `npm run build` first and then `docker build .`.

FROM nginx:1.27-alpine

COPY spa/dist /usr/share/nginx/html
COPY spa/nginx.conf /etc/nginx/conf.d/default.conf

ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=${BUILD_COMMIT}
LABEL org.opencontainers.image.revision=${BUILD_COMMIT}

EXPOSE 80
