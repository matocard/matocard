-- What the relayer, payments and kyc need beyond PLAN §7.3.

-- kyc: 'duplicate' is an identity already bound to another wallet (D4)
ALTER TABLE users DROP CONSTRAINT users_kyc_status_check;
ALTER TABLE users ADD CONSTRAINT users_kyc_status_check
  CHECK (kyc_status IN ('none', 'pending', 'approved', 'rejected', 'duplicate'));
ALTER TABLE users ADD COLUMN kyc_session_id text UNIQUE;
-- MON drip, once per verified identity (PLAN §7.2 rule 6)
ALTER TABLE users ADD COLUMN dripped_at timestamptz;

-- payments: the Xendit session behind a payment, and what the deposit became.
-- `method` is what the payer actually used, taken from the paid channel, so a
-- card payment always gets the card hold whatever was picked in the app.
ALTER TABLE payments ADD COLUMN provider_session_id text UNIQUE;
ALTER TABLE payments ADD COLUMN checkout_url text;
ALTER TABLE payments ADD COLUMN channel_code text;
ALTER TABLE payments ADD COLUMN shares numeric(78, 0);
ALTER TABLE payments ADD COLUMN settles_at timestamptz;
-- a refund or chargeback on a top-up: 'received' until handled, then 'reversed'
-- (taken back inside the hold) or 'lost' (after it, an operator loss, R1)
ALTER TABLE payments ADD COLUMN chargeback text CHECK (chargeback IN ('received', 'reversed', 'lost'));

ALTER TABLE payouts ADD COLUMN failure text;

-- Webhook deliveries already handled, per provider (PLAN §7.2 rule 2)
CREATE TABLE webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Every transaction the relayer sends, before it is sent (PLAN §7.2 rules 6–7):
-- the audit trail, the source of the daily caps, and what is checked before a resend.
CREATE TABLE relayer_txs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       text NOT NULL,
  wallet     text NOT NULL,
  -- the payment, payout or user the transaction is for: checked before any resend
  ref        uuid,
  amount     numeric(78, 0) NOT NULL DEFAULT 0,
  nonce      integer,
  tx_hash    text UNIQUE,
  status     text NOT NULL DEFAULT 'queued'
             CHECK (status IN ('queued', 'sent', 'confirmed', 'reverted', 'failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX relayer_txs_caps ON relayer_txs (kind, created_at);
CREATE INDEX relayer_txs_ref ON relayer_txs (ref);

-- A chargeback can land before the top-up was credited: PAID -> REVERSED.
CREATE OR REPLACE FUNCTION payment_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
      ('PAID', 'CREDITED_ONCHAIN'), ('PAID', 'REVERSED'),
      ('CREDITED_ONCHAIN', 'SETTLED'), ('CREDITED_ONCHAIN', 'REVERSED')
    ) THEN
      RAISE EXCEPTION 'payment %: % -> % is not allowed', OLD.id, OLD.status, NEW.status;
    END IF;
    INSERT INTO payment_transitions (payment_id, from_status, to_status)
      VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;

-- kyc: set once the identity hash is on chain, and the worker's queue until then
ALTER TABLE users ADD COLUMN verified_tx_hash text;
