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
