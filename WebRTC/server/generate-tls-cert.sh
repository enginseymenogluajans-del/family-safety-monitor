#!/usr/bin/env bash
# Self-signed TLS sertifikası oluşturur (geliştirme / LAN kullanımı için)
# Üretim ortamında Let's Encrypt / Certbot kullanın.
#
# Kullanım:
#   bash generate-tls-cert.sh
#   → certs/server.key + certs/server.crt oluşturulur
#
# server.js'de aktifleştirmek için:
#   const https = require('https');
#   const fs    = require('fs');
#   const server = https.createServer({
#     key:  fs.readFileSync('./certs/server.key'),
#     cert: fs.readFileSync('./certs/server.crt'),
#   }, app);

set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

DAYS=365
KEY="$CERT_DIR/server.key"
CRT="$CERT_DIR/server.crt"
CN="family-safety-local"

echo "▶  Özel anahtar oluşturuluyor…"
openssl genrsa -out "$KEY" 2048

echo "▶  Sertifika imzalama isteği (CSR) oluşturuluyor…"
openssl req -new -key "$KEY" \
  -subj "/C=TR/ST=Istanbul/L=Istanbul/O=FamilySafety/CN=$CN" \
  -out "$CERT_DIR/server.csr"

echo "▶  Self-signed sertifika imzalanıyor ($DAYS gün)…"
openssl x509 -req -days "$DAYS" \
  -in  "$CERT_DIR/server.csr" \
  -signkey "$KEY" \
  -out "$CRT"

rm -f "$CERT_DIR/server.csr"

echo ""
echo "✅  Sertifika oluşturuldu:"
echo "    Anahtar : $KEY"
echo "    Sertifika: $CRT"
echo ""
echo "⚠️  CVE-2024-53263 notu: Git LFS kullanıyorsanız v3.6.1+ sürümüne güncelleyin."
echo "    git lfs version  →  3.6.1 veya üzeri olmalı"
echo ""
echo "    Güncelleme: https://github.com/git-lfs/git-lfs/releases/tag/v3.6.1"
