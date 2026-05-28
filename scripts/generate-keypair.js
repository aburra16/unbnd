#!/usr/bin/env node
// Generates a fresh nostr keypair and prints both the hex pubkey and the
// bech32 nsec to stdout. Used once per environment to populate
// OWNER_PUBKEY in `.env`. Does not write to any file — the developer is
// responsible for storing the nsec safely.
//
// Usage:
//   node scripts/generate-keypair.js
//
// Implementation note: this script uses only Node built-ins so it can run
// before any pnpm install. It generates a secp256k1 private key via
// `crypto.randomBytes`, derives the public key using a minimal secp256k1
// reference implementation embedded inline. For production key generation
// (e.g. when claiming a real Nostr identity), use a vetted library such as
// `nostr-tools`.

import { randomBytes } from "node:crypto";

// secp256k1 curve parameters
const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 2n ** 256n - 432420386565659656852420866394968145599n;
const Gx = 55066263022277343669578718895168534326250603453777594175500187360389116729240n;
const Gy = 32670510020758816978083085130507043184471273380659243275938904335757337482424n;

function mod(a, m = P) {
  const r = a % m;
  return r >= 0n ? r : r + m;
}
function invMod(a, m = P) {
  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod(oldS, m);
}
function pointAdd(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (x1 === x2 && y1 === mod(-y2)) return null;
  const m =
    x1 === x2 && y1 === y2
      ? mod(3n * x1 * x1 * invMod(2n * y1))
      : mod((y2 - y1) * invMod(mod(x2 - x1)));
  const xr = mod(m * m - x1 - x2);
  const yr = mod(m * (x1 - xr) - y1);
  return [xr, yr];
}
function scalarMul(k, p) {
  let r = null;
  let acc = p;
  while (k > 0n) {
    if (k & 1n) r = pointAdd(r, acc);
    acc = pointAdd(acc, acc);
    k >>= 1n;
  }
  return r;
}

function bytesToHex(buf) {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bigintToHex(n) {
  let s = n.toString(16);
  if (s.length < 64) s = "0".repeat(64 - s.length) + s;
  return s;
}

// Generate private key in [1, N-1]
let priv;
do {
  priv = BigInt("0x" + bytesToHex(randomBytes(32)));
} while (priv === 0n || priv >= N);

const pub = scalarMul(priv, [Gx, Gy]);
if (!pub) throw new Error("keypair: scalar multiplication returned identity");
const xOnlyHex = bigintToHex(pub[0]);

// Bech32 encode the private key as nsec
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const out = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >>> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}
function bech32CreateChecksum(hrp, data) {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = bech32Polymod(values) ^ 1;
  const out = [];
  for (let p = 0; p < 6; p++) out.push((mod >>> (5 * (5 - p))) & 31);
  return out;
}
function bech32Encode(hrp, data) {
  const checksum = bech32CreateChecksum(hrp, data);
  return hrp + "1" + [...data, ...checksum].map((d) => CHARSET[d]).join("");
}
function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxV = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxV);
    }
  }
  if (pad && bits > 0) ret.push((acc << (to - bits)) & maxV);
  return ret;
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const privHex = bigintToHex(priv);
const nsec = bech32Encode("nsec", convertBits(hexToBytes(privHex), 8, 5, true));
const npub = bech32Encode("npub", convertBits(hexToBytes(xOnlyHex), 8, 5, true));

process.stdout.write(`pubkey (hex):  ${xOnlyHex}\n`);
process.stdout.write(`npub:          ${npub}\n`);
process.stdout.write(`nsec:          ${nsec}\n`);
process.stdout.write(`\n`);
process.stdout.write(
  `Paste the hex pubkey into OWNER_PUBKEY in your .env file.\n`,
);
process.stdout.write(
  `Store the nsec somewhere safe. Anyone with it can sign as this identity.\n`,
);
