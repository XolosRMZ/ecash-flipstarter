export interface Utxo {
  txid: string;
  vout: number;
  value: bigint; // satoshis
  scriptPubKey: string; // hex locking script
}

export interface UnsignedTx {
  inputs: {
    txid: string;
    vout: number;
    value: bigint;
    scriptPubKey: string;
  }[];
  outputs: {
    value: bigint;
    scriptPubKey: string;
  }[];
  locktime?: number;
}

export interface BroadcastResult {
  txid: string;
}
