import { afterEach, expect, test, vi } from "vitest";
import {
  API_URL,
  ApiError,
  authorization,
  big,
  getMe,
  getVerifyRecord,
  sessionMessage,
} from "../backend";

afterEach(() => vi.unstubAllGlobals());

test("the session message is byte for byte what apps/backend verifies", () => {
  // apps/backend/src/api.ts: `Sign in to Matocard\n${wallet.toLowerCase()}\nuntil ${until}`
  expect(sessionMessage("0xABCdef0000000000000000000000000000000001", 1_800_000_000)).toBe(
    "Sign in to Matocard\n0xabcdef0000000000000000000000000000000001\nuntil 1800000000",
  );
});

test("a signed route sends Authorization: Matocard <wallet>.<until>.<signature>", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ score: "55" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const session = { wallet: "0xA11CE", until: 1_800_000_000, signature: "0xs1g" as const };
  await getMe(session);
  expect(authorization(session)).toBe("Matocard 0xA11CE.1800000000.0xs1g");
  expect(fetch).toHaveBeenCalledWith(`${API_URL}/me`, {
    method: "GET",
    headers: { authorization: "Matocard 0xA11CE.1800000000.0xs1g" },
    body: undefined,
  });
});

test("the backend's own error message reaches the screen, with its status", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ error: "not an account" }), { status: 404 }),
  );
  const failure = getVerifyRecord("nope");
  await expect(failure).rejects.toBeInstanceOf(ApiError);
  await expect(failure).rejects.toMatchObject({ message: "not an account", status: 404 });
});

test("amounts stay bigints, and an unread one stays unread", () => {
  expect(big("134529147")).toBe(134_529_147n);
  expect(big(null)).toBeUndefined();
  expect(big(undefined)).toBeUndefined();
});
