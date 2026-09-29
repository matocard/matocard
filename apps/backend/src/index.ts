import { connect, migrate } from "./db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = connect(url);
const applied = await migrate(sql);
if (applied.length) console.log(`migrated: ${applied.join(", ")}`);

// ponytail: one process for api, kyc, payments and relayer (PLAN §7.1); their routes land here as they are built
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/health": async () => {
      await sql`SELECT 1`;
      return Response.json({ ok: true });
    },
  },
  fetch: () => new Response("Not found", { status: 404 }),
});
console.log(`backend on :${server.port}`);
