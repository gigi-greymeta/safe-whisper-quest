// Push tokens are stored encrypted (AES-256-GCM) with PUSH_TOKEN_KEY, a base64 32-byte secret
// set only on the Edge Functions, so a database dump alone doesn't reveal them.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(): Promise<CryptoKey> {
  const raw = Deno.env.get("PUSH_TOKEN_KEY");
  if (!raw) throw new Error("PUSH_TOKEN_KEY is not set");
  return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(token)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function openToken(sealed: string): Promise<string> {
  const [iv, ct] = sealed.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct)));
}

export async function sha256Hex(value: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
