#!/bin/sh
set -eu

npx prisma migrate deploy
npm run db:seed

exec "$@"
