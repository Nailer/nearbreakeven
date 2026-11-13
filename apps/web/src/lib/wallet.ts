// biome-ignore lint/style/useNodejsImportProtocol: the npm "buffer" polyfill for browsers, not Node's module
import { Buffer } from "buffer";
import { setupWalletSelector, type Wallet, type WalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { ATTEST_DEPOSIT_YOCTO, CALL_GAS, type ChainAttestation, LEDGER_CONTRACT, NETWORK } from "@nearbreakeven/evidence";

// Some browser wallets call Buffer on their own.
(globalThis as any).Buffer ??= Buffer;

let selectorPromise: Promise<WalletSelector> | null = null;

function getSelector(): Promise<WalletSelector> {
  selectorPromise ??= setupWalletSelector({
    network: NETWORK,
    modules: [setupMeteorWallet(), setupIntearWallet(), setupHereWallet(), setupSender()],
  });
  return selectorPromise;
}

export const WALLETS = [
  { id: "meteor-wallet", label: "Meteor Wallet", kind: "Web or extension" },
  { id: "intear-wallet", label: "Intear Wallet", kind: "Web" },
  { id: "here-wallet", label: "HERE Wallet", kind: "Mobile or web" },
  { id: "sender", label: "Sender", kind: "Browser extension" },
] as const;

export async function connect(walletId: string): Promise<string> {
  const selector = await getSelector();
  const wallet = await selector.wallet(walletId);
  const accounts = await wallet.signIn({ contractId: undefined as any, methodNames: [] } as any);
  const id = accounts[0]?.accountId ?? (await wallet.getAccounts())[0]?.accountId;
  if (!id) throw new Error("The wallet did not return an account.");
  return id;
}

async function current(): Promise<{ wallet: Wallet; accountId: string } | null> {
  const selector = await getSelector();
  if (!selector.isSignedIn()) return null;
  const wallet = await selector.wallet();
  const accountId = (await wallet.getAccounts())[0]?.accountId;
  return accountId ? { wallet, accountId } : null;
}

export async function connectedAccount(): Promise<string | null> {
  return (await current())?.accountId ?? null;
}

/** Signs out. Some wallets never answer signOut, so after 5 s the session is forgotten locally. */
export async function disconnect() {
  const w = await current();
  if (!w) return;
  const answered = await Promise.race([
    w.wallet.signOut().then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((res) => setTimeout(() => res(false), 5000)),
  ]);
  if (answered) return;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("near-wallet-selector:")) localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing stored to forget */
  }
  selectorPromise = null;
}

export interface AttestArgs {
  run_id: number;
  snapshot_sha256: string;
  results_sha256: string;
  method: "snapshot" | "live";
  note?: string;
}

/**
 * Sends `attest` to the ledger from the connected wallet, with 0.01 NEAR for
 * storage. wallet-selector 10 wants near-api-js style actions.
 */
export async function attest(args: AttestArgs): Promise<{ hash: string; attestation: ChainAttestation | null }> {
  const w = await current();
  if (!w) throw new Error("Connect a wallet first.");
  const outcome: any = await w.wallet.signAndSendTransaction({
    receiverId: LEDGER_CONTRACT,
    actions: [
      {
        functionCall: {
          methodName: "attest",
          args: new TextEncoder().encode(JSON.stringify(args)),
          gas: BigInt(CALL_GAS),
          deposit: BigInt(ATTEST_DEPOSIT_YOCTO),
        },
      },
    ] as any,
  });
  const failure = outcome?.status?.Failure;
  if (failure) throw new Error(failureText(failure));
  const hash: string = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? "";
  let attestation: ChainAttestation | null = null;
  const b64 = outcome?.status?.SuccessValue;
  if (b64) {
    try {
      attestation = JSON.parse(atob(b64));
    } catch {
      attestation = null;
    }
  }
  return { hash, attestation };
}

function failureText(f: any): string {
  const s = JSON.stringify(f);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/);
  return m ? `The ledger refused: ${m[1]}.` : `The transaction failed: ${s.slice(0, 160)}`;
}
