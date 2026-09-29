-- PLAN §7.3. Money is bigint in the currency's smallest unit (see @matocard/core),
-- with the currency beside it. The money-handling rules of PLAN §7.2 that a
-- database can hold are enforced here, not in app code.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet        text NOT NULL UNIQUE CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  kyc_status    text NOT NULL DEFAULT 'none'
                CHECK (kyc_status IN ('none', 'pending', 'approved', 'rejected')),
  identity_hash text UNIQUE CHECK (identity_hash ~ '^0x[0-9a-f]{64}$'),
  country       text CHECK (country ~ '^[A-Z]{2}$'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fx_quotes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair       text NOT NULL CHECK (pair ~ '^[A-Z]+/[A-Z]+$'),
  rate       numeric NOT NULL CHECK (rate > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users,
  kind              text NOT NULL CHECK (kind IN ('topup', 'repay')),
  method            text NOT NULL CHECK (method IN ('card', 'bank', 'qr')),
  -- rule 2: a replayed webhook can never be recorded twice
  provider_event_id text UNIQUE,
  fiat_amount       bigint NOT NULL CHECK (fiat_amount > 0),
  currency          text NOT NULL CHECK (currency IN ('MYR', 'IDR', 'USD')),
  quote_id          uuid REFERENCES fx_quotes,
  ausd_amount       bigint NOT NULL CHECK (ausd_amount > 0),
  status            text NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'FAILED', 'PAID', 'CREDITED_ONCHAIN', 'SETTLED', 'REVERSED')),
  tx_hash           text CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users,
  kind                     text NOT NULL CHECK (kind IN ('cashout', 'merchant')),
  recipient_json           jsonb NOT NULL,
  ausd_amount              bigint NOT NULL CHECK (ausd_amount > 0),
  fiat_amount              bigint NOT NULL CHECK (fiat_amount > 0),
  currency                 text NOT NULL CHECK (currency IN ('MYR', 'IDR', 'USD')),
  quote_id                 uuid REFERENCES fx_quotes,
  onchain_tx_hash          text CHECK (onchain_tx_hash ~ '^0x[0-9a-f]{64}$'),
  provider_disbursement_id text UNIQUE,
  status                   text NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'SENT_ONCHAIN', 'DISBURSED', 'FAILED')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- rule 3: every status change of a payment, never updated or deleted
CREATE TABLE payment_transitions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id  uuid NOT NULL REFERENCES payments,
  from_status text,
  to_status   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- rule 4: append-only double entry. Each posting is one side of one entry.
CREATE TABLE ledger (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_type   text NOT NULL CHECK (ref_type IN ('payment', 'payout')),
  ref_id     uuid NOT NULL,
  account    text NOT NULL,
  debit      bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit     bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency   text NOT NULL CHECK (currency IN ('AUSD', 'MYR', 'IDR', 'USD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit = 0) <> (credit = 0))
);

-- PLAN §7.2 rule 3, plus FAILED for a checkout that is never paid.
CREATE FUNCTION payment_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'payment %: must start as PENDING, not %', NEW.id, NEW.status;
    END IF;
    INSERT INTO payment_transitions (payment_id, from_status, to_status)
      VALUES (NEW.id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status, NEW.status) NOT IN (
      ('PENDING', 'PAID'), ('PENDING', 'FAILED'),
      ('PAID', 'CREDITED_ONCHAIN'),
      ('CREDITED_ONCHAIN', 'SETTLED'), ('CREDITED_ONCHAIN', 'REVERSED')
    ) THEN
      RAISE EXCEPTION 'payment %: % -> % is not allowed', OLD.id, OLD.status, NEW.status;
    END IF;
    INSERT INTO payment_transitions (payment_id, from_status, to_status)
      VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payments_status
  AFTER INSERT OR UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_status_guard();

CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER ledger_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

CREATE TRIGGER payment_transitions_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_transitions
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

CREATE TRIGGER payments_no_delete
  BEFORE DELETE OR TRUNCATE ON payments
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
