#!/usr/bin/env bash
# scripts/deploy.sh — trigger a Vercel production deploy via Deploy Hook.
#
# Kenapa hook, bukan `git push`: project ini Hobby + repo private, dan Vercel
# memblok auto-deploy on-push (commit author bukan member project). Deploy Hook
# dipicu oleh URL (bukan author commit) → lolos blok itu. Build commit TERAKHIR
# di branch `main`.
#
# Pakai: push dulu kode-mu ke main, lalu jalankan:
#   ./scripts/deploy.sh
#
# Hook URL disimpan di .env.local sbg VERCEL_DEPLOY_HOOK (gitignored — rahasia
# tidak ikut ke-commit).

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  # ambil hanya baris VERCEL_DEPLOY_HOOK, buang tanda kutip
  HOOK="$(grep -E '^VERCEL_DEPLOY_HOOK=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
fi

if [ -z "${HOOK:-}" ]; then
  echo "❌ VERCEL_DEPLOY_HOOK belum ada di .env.local" >&2
  exit 1
fi

echo "🚀 Memicu deploy production (commit terakhir di main)…"
RESP="$(curl -s -X POST "$HOOK")"
echo "$RESP"
echo
echo "✅ Terkirim. Pantau progresnya di Vercel → Deployments."
