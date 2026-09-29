# Backend

`api`, `kyc`, `payments` and `relayer` (PLAN §7) in one Bun process, with Postgres. Deployed with Docker on the Hostinger VPS (#50).

## Run

```sh
cp .env.example .env              # then set POSTGRES_PASSWORD (and DATABASE_URL to match)
docker compose up -d --build      # Postgres + backend on 127.0.0.1:3000
curl 127.0.0.1:3000/health
```

For development, run only the database in Docker:

```sh
docker compose up -d postgres
bun run dev
bun test                          # schema tests need DATABASE_URL; they are skipped without it
```

Migrations in `migrations/` apply on start, in name order, each once. Never edit one that has shipped: add the next number.

## Rules the database enforces (PLAN §7.2)

- Money is `bigint` in the currency's smallest unit (AUSD: 6 decimals), with the currency beside it. Helpers in `@matocard/core`.
- `payments.provider_event_id` is unique: a replayed webhook cannot be recorded twice.
- A payment starts `PENDING` and moves only `PENDING → PAID → CREDITED_ONCHAIN → SETTLED | REVERSED`, or `PENDING → FAILED`. A trigger refuses any other step and logs every step in `payment_transitions`.
- `ledger` and `payment_transitions` are append-only; payments are never deleted.
- A ledger posting is exactly one of debit or credit.

## Environment

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres URL. Compose sets it for the container |
| `POSTGRES_PASSWORD` | Compose only |
| `POSTGRES_PORT` | Host port for Postgres, default 5433, bound to localhost |
| `PORT` | Host port for the backend, default 3000, bound to localhost (Caddy fronts it on the VPS) |
