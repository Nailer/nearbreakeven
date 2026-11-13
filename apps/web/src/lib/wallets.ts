/** The wallets offered for signing (NEAR testnet). MyNearWallet stopped accepting new app connections in 2026. */
export const WALLETS = [
  { id: "meteor-wallet", label: "Meteor Wallet", kind: "Web or extension" },
  { id: "intear-wallet", label: "Intear Wallet", kind: "Web" },
  { id: "here-wallet", label: "HERE Wallet", kind: "Mobile or web" },
  { id: "sender", label: "Sender", kind: "Browser extension" },
] as const;
