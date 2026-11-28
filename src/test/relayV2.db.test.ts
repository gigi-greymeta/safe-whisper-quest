// @vitest-environment node
// Applies every Supabase migration to an in-process Postgres (PGlite), with small
// stand-ins for Supabase's cron, Realtime and roles, then checks what the
// anonymous role (the public app key) can and cannot do.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { deriveInboxSecrets, deriveRelayV2Queues } from "@/crypto/relayV2";
import { generateIdentityKeyPair, exportKeyPair, publicKeyToBase64 } from "@/crypto/keys";

const root = join(__dirname, "../../supabase");
const SUPABASE_STANDINS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create schema extensions;
  create schema cron;
  create table cron.job (jobname text);
  create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';
  create function cron.unschedule(text) returns boolean language sql as 'select true';
  create publication supabase_realtime;
  create schema realtime;
  create table realtime.sent (payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
    language sql as 'insert into realtime.sent values (payload, event, topic, private)';
`;

let db: PGlite;
const asAnon = async <T>(sql: string, params: unknown[] = []) => {
  await db.exec("set role anon");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const denied = async (sql: string, params: unknown[] = []) => {
  try {
    const rows = await asAnon(sql, params);
    return rows.length === 0 ? "empty" : "allowed";
  } catch {
    return "denied";
  }
};

type Person = { privateKey: JsonWebKey; publicKey: JsonWebKey; fingerprint: string };
const person = async (): Promise<Person> => {
  const keys = await exportKeyPair(await generateIdentityKeyPair());
  return { ...keys, fingerprint: publicKeyToBase64(keys.publicKey) };
};

let alice: Person;
let bob: Person;
let bobInbox: string;
let bobSecrets: Awaited<ReturnType<typeof deriveInboxSecrets>>;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STANDINS);
  for (const name of readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(root, "migrations", name), "utf8").replace(/create extension if not exists pg_cron;/gi, "");
    await db.exec(sql);
  }
  alice = await person();
  bob = await person();
  // Bob's inbox for messages from Alice, as both phones derive it.
  const fromBob = await deriveRelayV2Queues(bob.privateKey, bob.fingerprint, alice.publicKey, alice.fingerprint);
  const fromAlice = await deriveRelayV2Queues(alice.privateKey, alice.fingerprint, bob.publicKey, bob.fingerprint);
  expect(fromAlice.outbox).toBe(fromBob.inbox);
  expect(fromAlice.inbox).toBe(fromBob.outbox);
  bobInbox = fromBob.inbox;
  bobSecrets = await deriveInboxSecrets(bob.privateKey, bobInbox);
}, 60_000);

describe("relay v2 (owner-only inboxes)", () => {
  it("inbox ids are secret 64-hex values, unrelated to the public fingerprints", () => {
    expect(bobInbox).toMatch(/^[0-9a-f]{64}$/);
    expect(bobSecrets.token).toMatch(/^[0-9a-f]{64}$/);
    expect(bobSecrets.topic).toMatch(/^[0-9a-f]{32}$/);
  });

  it("the server's token hash matches the app's", async () => {
    const [row] = (await db.query<{ h: string }>("select public.relay_token_hash($1) as h", [bobSecrets.token])).rows;
    expect(row.h).toBe(bobSecrets.tokenHash);
  });

  it("only the owner can read and delete; senders can only send", async () => {
    expect((await asAnon<{ ok: boolean }>("select public.relay_register_inbox($1,$2,$3) as ok", [bobInbox, bobSecrets.tokenHash, bobSecrets.topic]))[0].ok).toBe(true);
    expect((await asAnon<{ ok: boolean }>("select public.relay_inbox_ready($1) as ok", [bobInbox]))[0].ok).toBe(true);

    await asAnon("select public.relay_send($1,$2,$3)", [bobInbox, '{"d":"ciphertext","p":""}', "iv-1"]);

    // The doorbell rang on Bob's private topic, with no content.
    const rings = (await db.query<{ topic: string; payload: unknown; private: boolean }>("select * from realtime.sent")).rows;
    expect(rings.at(-1)).toMatchObject({ topic: `inbox:${bobSecrets.topic}`, payload: {}, private: false });

    // Not readable or deletable through the table, and invisible to a wrong token.
    expect(await denied("select * from public.relay_messages where queue_id = $1", [bobInbox])).toBe("empty");
    expect(await denied("delete from public.relay_messages where queue_id = $1 returning id", [bobInbox])).toBe("empty");
    const aliceToken = (await deriveInboxSecrets(alice.privateKey, bobInbox)).token;
    expect(await asAnon("select * from public.relay_fetch($1,$2)", [bobInbox, aliceToken])).toEqual([]);
    const [{ id }] = (await db.query<{ id: string }>("select id from public.relay_messages where queue_id = $1", [bobInbox])).rows;
    expect((await asAnon<{ n: number }>("select public.relay_ack($1,$2,$3) as n", [bobInbox, aliceToken, [id]]))[0].n).toBe(0);

    // Bob reads it and acknowledges it; then it is gone from the server.
    const fetched = await asAnon<{ id: string; encrypted_payload: string }>("select * from public.relay_fetch($1,$2)", [bobInbox, bobSecrets.token]);
    expect(fetched).toHaveLength(1);
    expect((await asAnon<{ n: number }>("select public.relay_ack($1,$2,$3) as n", [bobInbox, bobSecrets.token, [fetched[0].id]]))[0].n).toBe(1);
    expect((await db.query("select 1 from public.relay_messages where queue_id = $1", [bobInbox])).rows).toHaveLength(0);
  });

  it("direct inserts into v2 inboxes are refused, so caps can't be bypassed", async () => {
    expect(await denied("insert into public.relay_messages (queue_id, recipient_fingerprint, encrypted_payload, iv) values ($1,$1,'x','y') returning id", [bobInbox])).toBe("denied");
    await expect(asAnon("select public.relay_send($1,$2,$3)", [bobInbox, "x".repeat(524289), "iv"])).rejects.toThrow(/too large/);
  });

  it("a second registration with another token cannot take over an inbox", async () => {
    const impostor = await deriveInboxSecrets(alice.privateKey, bobInbox);
    expect((await asAnon<{ ok: boolean }>("select public.relay_register_inbox($1,$2,$3) as ok", [bobInbox, impostor.tokenHash, impostor.topic]))[0].ok).toBe(false);
    expect((await asAnon<{ ok: boolean }>("select public.relay_delete_inbox($1,$2) as ok", [bobInbox, impostor.token]))[0].ok).toBe(false);
  });

  it("inbox rows can't be listed, and directory keys can't be rewritten", async () => {
    expect(await denied("select * from public.pairwise_queues")).toBe("denied");
    expect(await denied("update public.public_key_registry set public_key_jwk = '{}' returning id")).toBe("denied");
  });

  it("a verified deletion can scrub every registry field except id and display name", async () => {
    const inserted = (await db.query<{ id: string }>(
      "insert into public.public_key_registry (fingerprint, display_name, public_key_jwk, archived_at) values ($1, $2, $3::jsonb, now()) returning id",
      [alice.fingerprint, "Alice", JSON.stringify(alice.publicKey)],
    )).rows[0];
    await db.exec("alter table public.public_key_registry add column future_metadata text");
    await db.query("update public.public_key_registry set future_metadata = 'clear me' where id = $1", [inserted.id]);

    // Anonymous callers cannot invoke the privileged scrub function.
    expect(await denied("select public.scrub_public_key_registry_entry($1)", [alice.fingerprint])).toBe("denied");
    const result = (await db.query<{ count: number }>(
      "select public.scrub_public_key_registry_entry($1) as count",
      [alice.fingerprint],
    )).rows[0];
    expect(result.count).toBe(1);

    const row = (await db.query<Record<string, unknown>>(
      "select * from public.public_key_registry where id = $1",
      [inserted.id],
    )).rows[0];
    expect(row.id).toBe(inserted.id);
    expect(row.display_name).toBe("Alice");
    for (const [column, value] of Object.entries(row)) {
      if (column !== "id" && column !== "display_name") expect(value).toBeNull();
    }
    expect((await db.query<{ count: number }>(
      "select public.scrub_public_key_registry_entry($1) as count",
      [alice.fingerprint],
    )).rows[0].count).toBe(0);
  });

  it("v1 inboxes keep working for older app versions until the lock-down", async () => {
    const v1 = "0123456789abcdef0123456789abcdef";
    await asAnon("insert into public.pairwise_queues (queue_id, owner_fingerprint) values ($1, 'fp')", [v1]);
    await asAnon("insert into public.relay_messages (queue_id, recipient_fingerprint, encrypted_payload, iv) values ($1,$1,'x','y')", [v1]);
    expect(await asAnon("select id from public.relay_messages where queue_id = $1", [v1])).toHaveLength(1);
    expect(await asAnon("delete from public.relay_messages where queue_id = $1 returning id", [v1])).toHaveLength(1);
  });

  it("after the lock-down the table is closed entirely and v2 still works", async () => {
    await db.exec(readFileSync(join(root, "lockdown", "relay_v1_lockdown.sql"), "utf8"));
    expect(await denied("select * from public.relay_messages")).toBe("denied");
    expect(await denied("insert into public.relay_messages (queue_id, recipient_fingerprint, encrypted_payload, iv) values ('0123456789abcdef0123456789abcdef','a','x','y') returning id")).toBe("denied");
    expect(await denied("insert into public.pairwise_queues (queue_id, owner_fingerprint) values ('fedcba9876543210fedcba9876543210','fp') returning id")).toBe("denied");

    await asAnon("select public.relay_send($1,$2,$3)", [bobInbox, "after", "iv"]);
    const rows = await asAnon<{ id: string }>("select * from public.relay_fetch($1,$2)", [bobInbox, bobSecrets.token]);
    expect(rows).toHaveLength(1);
    expect((await asAnon<{ ok: boolean }>("select public.relay_delete_inbox($1,$2) as ok", [bobInbox, bobSecrets.token]))[0].ok).toBe(true);
    expect((await db.query("select 1 from public.relay_messages where queue_id = $1", [bobInbox])).rows).toHaveLength(0);
  });
});
