/**
 * Argon2id key derivation via hash-wasm (WASM).
 * Memory-hard: resists GPU/ASIC brute-force attacks.
 * 
 * Parameters tuned for browser use:
 *  - 64 MB memory cost
 *  - 3 iterations
 *  - 1 parallelism (browser single-threaded)
 *  - 256-bit output
 */

import { argon2id } from "hash-wasm";

const ARGON2_MEMORY_COST = 65536; // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32; // 256 bits

export async function deriveKeyWithArgon2id(
  password: string,
  salt: Uint8Array
): Promise<string> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_COST,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "hex",
  });
  return hash;
}
