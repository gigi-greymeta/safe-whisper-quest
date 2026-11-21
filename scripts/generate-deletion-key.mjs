// Generates the server ECDH key for the delete-identity Edge Function.
// Usage:  node scripts/generate-deletion-key.mjs
// Then:   supabase secrets set DELETION_KEY_PRIVATE_JWK='<printed JSON>'
// Keep it secret. Rotating it is safe: clients fetch the public half on demand.
const { privateKey } = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", privateKey);
console.log(JSON.stringify({ kty, crv, x, y, d }));
