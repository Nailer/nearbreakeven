/**
 * Signing for the scripts (publisher and command-line attester), testnet only.
 * The key comes from NEAR_KEYS (JSON {"account.testnet":"ed25519:..."}, for CI
 * or a host) or from the NEAR CLI keychain (~/.near-credentials/testnet).
 * Nothing is hard-coded and no key is ever written to the repository.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, actions } from "near-api-js";
import { TESTNET_RPC } from "@nearbreakeven/evidence";

export function loadKey(accountId: string): string {
  if (process.env.NEAR_KEYS) {
    const key = (JSON.parse(process.env.NEAR_KEYS) as Record<string, unknown>)[accountId];
    if (typeof key === "string") return key;
    throw new Error(`${accountId} is not in NEAR_KEYS`);
  }
  const path = join(process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials"), "testnet", `${accountId}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw.private_key !== "string") throw new Error(`no private_key in ${path}`);
  return raw.private_key;
}

export interface Sent {
  hash: string;
  ok: boolean;
  value?: unknown;
  failure?: string;
}

/** Calls a change method and returns the transaction hash and the decoded return value. */
export async function call(accountId: string, contractId: string, method: string, args: unknown, deposit = "0", gas = "30000000000000"): Promise<Sent> {
  const account = new Account(accountId, TESTNET_RPC, loadKey(accountId) as any);
  const res: any = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(method, new TextEncoder().encode(JSON.stringify(args)), BigInt(gas), BigInt(deposit))],
    waitUntil: "FINAL",
    throwOnFailure: false,
  } as any);
  const hash = res?.transaction?.hash ?? res?.transaction_outcome?.id ?? "?";
  const status = res?.status;
  if (status && typeof status === "object" && "Failure" in status) return { hash, ok: false, failure: JSON.stringify(status.Failure) };
  const b64 = status?.SuccessValue;
  let value: unknown;
  if (b64) {
    try {
      value = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
      value = undefined;
    }
  }
  return { hash, ok: true, value };
}
