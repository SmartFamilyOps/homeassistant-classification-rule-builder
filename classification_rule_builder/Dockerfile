FROM ghcr.io/home-assistant/base:3.24

ARG BUILD_VERSION
ARG BUILD_ARCH

LABEL \
  io.hass.name="SmartFamilyOps Classification Rule Builder" \
  io.hass.description="Safe rule catalogue and Jinja generator for SmartFamilyOps device discovery" \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache nodejs

COPY run.sh /run.sh
COPY src /app/src
COPY public /app/public
RUN chmod 0755 /run.sh

WORKDIR /app
CMD ["/run.sh"]
