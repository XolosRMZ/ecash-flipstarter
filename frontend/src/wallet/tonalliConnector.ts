export interface WalletProvider {
  getAddress(): Promise<string>;
  signAndBroadcast(rawUnsignedHex: string): Promise<{ txid: string }>;
}

export function getTonalliWallet(): WalletProvider | null {
  // TODO: implement real Tonalli/RMZWallet connector (e.g., window.tonalli)
  console.warn('Tonalli wallet connector not implemented yet.');
  return null;
}
