// M4-S (PR-5b; RQ-13; INF-044 §10.1 M4; INF-045 §6.3): cliente C3B SINTÉTICO, solo de tests.
// No existe en src/ ni en dist/, no tiene llaves, no firma, no transmite y no usa red: el transporte
// y el «wallet» son adaptadores inyectados (DEC-AX-09 (a)). El wallet sintético solo registra en el
// FixtureTxProvider una tx de fixture que paga el `payTo` de la factura; no hay fondos.
//
// Contrato congelado por INF-044 §10.1 M4 que este cliente cumple:
//   - cabeceras y formatos de x402-XEC 0f409de tal cual (INF-042 §5 y §6): oferta en
//     `x-x402-payment-offer` (decodePaymentOfferHeader estricto), `payment-required: true`, prueba
//     X402SettlementProofV1 en `payment-proof` (base64url canónico, INF-042 §6.3);
//   - x402 v1, scheme `exact`, red `xec:mainnet`, asset XEC, una sola entrada en `accepts`;
//   - RECHAZO de `PAYMENT-SIGNATURE` (flujo C1 de autorización firmada) y de H2A v2
//     (`xec-prepaid-utxo`, x402Version 2): sin conversión silenciosa (INF-042 §5, G-05). Ante una
//     oferta así el cliente se detiene sin pagar y sin enviar nada más.
// Cadena (INF-042 §9.1, reducida a lo sintético): oferta -> solicitud de pago al wallet -> recibo
// -> createSettlementProofFromReceipt -> reintento con `payment-proof`.
import { canonicalize, computeInvoiceHash, computeResourceHash, createSettlementProofFromReceipt } from '@x402-xec/core';
import { X402_PAYMENT_OFFER_HEADER, decodePaymentOfferHeader } from '@x402-xec/express';
import { payingTx } from './chronik-fixtures.mjs';

/** Cabeceras que el cliente puede emitir. Nunca PAYMENT-SIGNATURE, X-PAYMENT ni alias de prueba. */
export const CLIENT_HEADER_ALLOWLIST = Object.freeze(['payment-proof']);
export const FORBIDDEN_CLIENT_HEADERS = Object.freeze(['payment-signature', 'x-payment', 'settlement-proof', 'x402-settlement-proof']);

export class C3BClientRejection extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'C3BClientRejection'; this.code = code; }
}

const reject = (code, detail) => { throw new C3BClientRejection(code, detail); };
const lower = (h) => Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

/**
 * Valida un 402 según el contrato M4. Devuelve { offer, invoiceHash } o lanza C3BClientRejection.
 * `expect` = { publicOrigin, method, path, now }: el cliente comprueba que la factura es para SU
 * petición (resourceHash) y que no ha vencido.
 */
export function acceptOffer(res, expect) {
  if (res.status !== 402) reject('NOT_402', `estado ${res.status}`);
  const h = lower(res.headers);
  const body = res.json;
  const accept0 = Array.isArray(body?.accepts) ? body.accepts[0] : undefined;
  // Rechazo explícito de PAYMENT-SIGNATURE (C1) y de H2A v2 antes de cualquier otra cosa.
  if (accept0 && Object.hasOwn(accept0, 'paymentHeader')) reject('PAYMENT_SIGNATURE_OFFER', `accepts[0].paymentHeader=${accept0.paymentHeader}`);
  if (accept0?.scheme === 'xec-prepaid-utxo' || body?.x402Version === 2) reject('H2A_V2_OFFER', `scheme=${accept0?.scheme} x402Version=${body?.x402Version}`);
  if (h['payment-signature'] !== undefined) reject('PAYMENT_SIGNATURE_OFFER', 'cabecera PAYMENT-SIGNATURE en la respuesta');
  if (h['payment-required'] !== 'true') reject('NOT_C3B_OFFER', 'falta payment-required: true');
  const raw = h[X402_PAYMENT_OFFER_HEADER];
  if (typeof raw !== 'string') reject('NOT_C3B_OFFER', `falta ${X402_PAYMENT_OFFER_HEADER}`);
  let offer;
  try { offer = decodePaymentOfferHeader(raw); } catch (e) { reject('MALFORMED_OFFER', e.message); }
  const invoiceHash = computeInvoiceHash(offer.invoice);
  if (offer.invoiceId !== invoiceHash) reject('MALFORMED_OFFER', 'invoiceId');
  if (body?.invoiceId !== offer.invoiceId || canonicalize(body?.invoice ?? null) !== canonicalize(offer.invoice)
      || canonicalize(body?.accepts ?? null) !== canonicalize(offer.accepts)) reject('OFFER_BODY_MISMATCH', 'cabecera y cuerpo del 402 difieren');
  const a = offer.accepts[0];
  if (offer.x402Version !== 1 || a.scheme !== 'exact' || a.network !== 'xec:mainnet' || a.asset !== 'XEC' || a.proofHeader !== 'payment-proof') {
    reject('UNSUPPORTED_OFFER', 'no es x402 v1 exact xec:mainnet');
  }
  const resourceHash = computeResourceHash({ serverOrigin: expect.publicOrigin, method: expect.method, path: expect.path });
  if (offer.invoice.resourceHash !== resourceHash) reject('RESOURCE_MISMATCH', 'la factura no es para esta petición');
  if (!(expect.now < offer.invoice.expiresAt)) reject('OFFER_EXPIRED', 'expiresAt vencido');
  return { offer, invoiceHash };
}

/** Wallet sintético: «paga» registrando una tx de fixture al payTo. Sin llaves, firma ni broadcast. */
export class SyntheticWallet {
  calls = 0;
  #n = 0;
  constructor(provider, { now, txOpts = {} } = {}) { this.provider = provider; this.now = now; this.txOpts = txOpts; }
  settle({ payTo, amountSats }) {
    this.calls += 1;
    const id = `c3b${(++this.#n).toString(16)}`.padStart(64, '0');   // txid sintético de 64 hex
    this.provider.set(id, { ...payingTx({ payTo, sats: BigInt(amountSats), timeFirstSeen: this.now(), ...this.txOpts }), txid: id });
    return { status: 'settled', network: 'xec:mainnet', txid: id };
  }
}

/** Codifica la prueba en base64url canónico (forma preferida, INF-042 §6.3). */
export const encodeProof = (proof) => Buffer.from(canonicalize(proof), 'utf8').toString('base64url');

/**
 * Cliente M4-S. `send(method, path, headers)` es el transporte inyectado (loopback del harness).
 * Registra todas las cabeceras que emite en `sent` para poder afirmar que nunca envía
 * PAYMENT-SIGNATURE.
 */
export class SyntheticC3BClient {
  sent = [];
  constructor({ send, wallet, publicOrigin, now }) { Object.assign(this, { sendRaw: send, wallet, publicOrigin, now }); }
  async #send(method, path, headers = {}) {
    for (const k of Object.keys(headers)) {
      if (!CLIENT_HEADER_ALLOWLIST.includes(k.toLowerCase())) throw new Error(`cliente M4-S: cabecera no permitida ${k}`);
    }
    this.sent.push({ method, path, headers: { ...headers } });
    return this.sendRaw(method, path, headers);
  }
  /** Cadena completa: oferta -> pago sintético -> recibo -> prueba -> reintento. */
  async access(path, method = 'GET') {
    const first = await this.#send(method, path);
    const { offer, invoiceHash } = acceptOffer(first, { publicOrigin: this.publicOrigin, method, path, now: this.now() });
    const receipt = this.wallet.settle({ payTo: offer.invoice.payTo, amountSats: offer.invoice.amountSats, invoiceHash });
    const proof = createSettlementProofFromReceipt(receipt, invoiceHash);
    const header = encodeProof(proof);
    const second = await this.#send(method, path, { 'payment-proof': header });
    return { first, offer, invoiceHash, receipt, proof, proofHeader: header, second };
  }
  /** Reentrega con la misma prueba (DEC-AX-04: recuperar operación consumada). */
  async redeliver(path, proofHeader, method = 'GET') { return this.#send(method, path, { 'payment-proof': proofHeader }); }
}
