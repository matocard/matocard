# Caddy with Hostinger's DNS provider: the certificate is proven through a DNS
# record (ACME DNS-01), so HTTPS works on any port, even where another server
# already holds 80 and 443.
FROM caddy:2.11-builder AS build
RUN xcaddy build --with github.com/sbrunk/caddy-dns-hostinger@v0.1.3

FROM caddy:2.11
COPY --from=build /usr/bin/caddy /usr/bin/caddy
