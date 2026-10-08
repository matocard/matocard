import { createHmac } from "node:crypto";
import type { SQL } from "bun";
import { getAddress, type Hex } from "viem";
import type { Chain } from "./chain";
import type { Config } from "./config";
import { once } from "./db";
import { sameSecret, UserError } from "./http";

const DIDIT = "https://verification.didit.me";

type Verification = {
  status?: string;
  issuing_state?: string;
  document_type?: string;
  document_number?: string;
  full_name?: string;
};

/**
 * The onchain identity hash (D4): one document, one account. Keyed with a
 * server secret so the hash cannot be brute-forced back into a document number.
 */
export function identityHash(salt: string, v: Verification, sandboxWallet?: string): Hex {
  const norm = (s: string | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parts = [norm(v.issuing_state), norm(v.document_type), norm(v.document_number)];
  if (parts.some((p) => !p)) throw new Error("verification has no document to hash");
  // ponytail: Didit's sandbox hands every tester the same document; keep demo accounts apart there only
  if (sandboxWallet) parts.push(sandboxWallet.toLowerCase());
  return `0x${createHmac("sha256", salt).update(parts.join("|")).digest("hex")}`;
}

/** Didit KYC (#47): session, webhook, then setVerified and a MON drip in `work()`. */
export function createKyc(sql: SQL, chain: Chain, config: Config) {
  const { didit } = config;

  async function decision(sessionId: string) {
    if (!didit.apiKey) throw new UserError("Didit is not configured on this server", 503);
    const res = await fetch(`${DIDIT}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
      headers: { "x-api-key": didit.apiKey },
    });
    if (!res.ok) throw new Error(`Didit decision answered ${res.status}`);
    return (await res.json()) as {
      status?: string;
      vendor_data?: string;
      id_verifications?: Verification[];
    };
  }

  return {
    async start(user: { id: string; wallet: string; kyc_status: string }) {
      if (user.kyc_status === "approved") throw new UserError("already verified", 409);
      if (!didit.apiKey || !didit.workflowId)
        throw new UserError("Didit is not configured on this server", 503);
      const res = await fetch(`${DIDIT}/v3/session/`, {
        method: "POST",
        headers: { "x-api-key": didit.apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          workflow_id: didit.workflowId,
          vendor_data: user.wallet,
          ...(config.xendit.returnUrl ? { callback: config.xendit.returnUrl } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Didit session answered ${res.status}: ${await res.text()}`);
      const session = (await res.json()) as { session_id: string; url: string };
      await sql`UPDATE users SET kyc_session_id = ${session.session_id}, kyc_status = 'pending'
                WHERE id = ${user.id}`;
      return { url: session.url };
    },

    async webhook(req: Request): Promise<Response> {
      // Didit signs the raw bytes; read them before anything parses the body
      const raw = await req.text();
      const expected = didit.webhookSecret
        ? createHmac("sha256", didit.webhookSecret).update(raw).digest("hex")
        : undefined;
      if (!sameSecret(req.headers.get("x-signature"), expected))
        return new Response("bad signature", { status: 401 });
      const sent = Number(req.headers.get("x-timestamp"));
      if (!Number.isFinite(sent) || Math.abs(Date.now() / 1000 - sent) > 300) {
        return new Response("stale", { status: 401 });
      }
      const event = JSON.parse(raw) as {
        event_id?: string;
        session_id?: string;
        status?: string;
        environment?: string;
      };
      const sessionId = event.session_id;
      if (!sessionId) return new Response("ignored");
      // Didit resends with the same event_id; without one, a replay is harmless anyway
      const handled = await once(sql, "didit", event.event_id ?? crypto.randomUUID(), async () => {
        const [user] = await sql`SELECT id, wallet FROM users WHERE kyc_session_id = ${sessionId}`;
        if (!user) return;
        if (event.status === "Declined") {
          await sql`UPDATE users SET kyc_status = 'rejected' WHERE id = ${user.id} AND kyc_status = 'pending'`;
        } else if (event.status === "Approved") {
          // the webhook says approved; the decision endpoint is the source for the document
          const d = await decision(sessionId);
          const doc =
            d.status === "Approved"
              ? d.id_verifications?.find((v) => v.status === "Approved")
              : undefined;
          if (!doc) return;
          const hash = identityHash(
            config.identitySalt,
            doc,
            event.environment === "sandbox" ? user.wallet : undefined,
          );
          const [taken] =
            await sql`SELECT id FROM users WHERE identity_hash = ${hash} AND id <> ${user.id}`;
          if (taken) {
            await sql`UPDATE users SET kyc_status = 'duplicate' WHERE id = ${user.id}`;
          } else {
            // kyc_status stays pending until the hash is onchain; work() does that
            await sql`UPDATE users SET identity_hash = ${hash}, holder_name = ${doc.full_name?.trim() || null}
                      WHERE id = ${user.id} AND identity_hash IS NULL`;
          }
        }
      });
      if (!handled) return new Response("duplicate");
      return new Response("ok");
    },

    /** Binds verified identities onchain, then drips MON once per identity. */
    async work() {
      const queued = await sql`
        SELECT id, wallet, identity_hash FROM users
        WHERE identity_hash IS NOT NULL AND kyc_status = 'pending'`;
      for (const u of queued) {
        // setVerified reads the chain first, so repeating it after a lost answer is safe
        const failures = (await chain.attempts(u.id)).filter((a) => a.status === "failed").length;
        if (failures >= 3) continue;
        try {
          const { hash } = await chain.setVerified(getAddress(u.wallet), u.identity_hash, u.id);
          await sql`UPDATE users SET kyc_status = 'approved', verified_tx_hash = ${hash} WHERE id = ${u.id}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/IdentityTaken|another identity/.test(message)) {
            await sql`UPDATE users SET kyc_status = 'duplicate' WHERE id = ${u.id}`;
          } else {
            console.error(`setVerified ${u.id} failed:`, message);
          }
        }
      }

      const thirsty = await sql`
        SELECT id, wallet FROM users WHERE kyc_status = 'approved' AND dripped_at IS NULL`;
      for (const u of thirsty) {
        const drips = (await chain.attempts(u.id)).filter((a) => a.kind === "drip");
        if (drips.some((a) => a.status === "confirmed")) {
          await sql`UPDATE users SET dripped_at = now() WHERE id = ${u.id}`;
          continue;
        }
        // one that was sent but never answered is for a person to check (rule 7)
        if (drips.some((a) => a.status !== "failed") || drips.length >= 3) continue;
        try {
          await chain.drip(getAddress(u.wallet), u.id);
          await sql`UPDATE users SET dripped_at = now() WHERE id = ${u.id}`;
        } catch (error) {
          console.error(`drip ${u.id} failed:`, error instanceof Error ? error.message : error);
        }
      }
    },
  };
}

export type Kyc = ReturnType<typeof createKyc>;
