import { test } from "node:test";
import assert from "node:assert/strict";

import { createSpendWallet, spendWalletFromPrivateKey } from "../src/wallet.js";

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;

test("createSpendWallet returns a fresh address and matching private key", () => {
  const wallet = createSpendWallet();
  assert.match(wallet.address, HEX40);
  assert.match(wallet.privateKey, HEX64);
  assert.equal(wallet.account.address, wallet.address);
});

test("createSpendWallet generates a different wallet each call", () => {
  const a = createSpendWallet();
  const b = createSpendWallet();
  assert.notEqual(a.address, b.address);
  assert.notEqual(a.privateKey, b.privateKey);
});

test("spendWalletFromPrivateKey rehydrates the same address", () => {
  const original = createSpendWallet();
  const rehydrated = spendWalletFromPrivateKey(original.privateKey);
  assert.equal(rehydrated.address, original.address);
  assert.equal(rehydrated.privateKey, original.privateKey);
});

test("privateKey is non-enumerable — the marketed safe-to-log property, pinned", () => {
  // A refactor back to a plain object literal would pass every other test
  // while silently re-exposing the key to console.log/JSON.stringify/
  // structured loggers. This is the regression test for the security
  // feature the README advertises.
  const wallet = createSpendWallet();
  assert.ok(!Object.keys(wallet).includes("privateKey"), "Object.keys must omit privateKey");
  assert.ok(!JSON.stringify(wallet).includes(wallet.privateKey), "JSON.stringify must omit privateKey");
  assert.ok(
    !Object.entries(wallet).some(([, v]) => v === wallet.privateKey),
    "Object.entries must omit privateKey"
  );
  assert.ok(!("privateKey" in { ...wallet }), "spread copies must omit privateKey");
  // ...while direct property access still works exactly like a plain field.
  assert.match(wallet.privateKey, /^0x[0-9a-f]{64}$/i);
});
