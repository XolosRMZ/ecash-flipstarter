// Ventana de conciliación (D-2 (a), decisión de Fernando 12:03): `minAgeSeconds` es como mínimo
// la expiración de la factura más un margen de reintento documentado. Valor exacto:
//   minAgeSeconds = expirySeconds + RECONCILE_RETRY_MARGIN_SECONDS
//   con expirySeconds por defecto 300 (INF-045 §5.1, TEYOLIA_X402_EXPIRY_SECONDS; RQ-10)
//   y RECONCILE_RETRY_MARGIN_SECONDS = 300  ->  600 s con la configuración por defecto.
// Justificación del margen: una factura solo pasa a PAID antes de `expiresAt`; el cliente cuyo
// grant falló tras `commitPaid` reintenta con la misma prueba (idempotente, T-02). El margen le
// da otra ventana completa de expiración (300 s) para ese reintento antes de que la conciliación
// marque RECONCILIATION_REQUIRED, que es definitivo para la factura (D-5: 409 + revisión humana).
// Medido desde `settled_at` (el hecho económico). Una factura con settled_at + minAge <= now se marca.

export const DEFAULT_EXPIRY_SECONDS = 300;
export const RECONCILE_RETRY_MARGIN_SECONDS = 300;
export const MAX_EXPIRY_SECONDS = 3600;

export class ExpiryConfigError extends Error {}

/** Lee TEYOLIA_X402_EXPIRY_SECONDS: entero 1..3600; ausente -> 300; inválido -> error (fail-closed). */
export function readExpirySeconds(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env['TEYOLIA_X402_EXPIRY_SECONDS'];
  if (raw === undefined || raw === '') return DEFAULT_EXPIRY_SECONDS;
  if (!/^[1-9][0-9]{0,3}$/.test(raw) || Number(raw) > MAX_EXPIRY_SECONDS) throw new ExpiryConfigError('TEYOLIA_X402_EXPIRY_SECONDS');
  return Number(raw);
}

export function reconcileMinAgeSeconds(expirySeconds: number): number {
  if (!Number.isInteger(expirySeconds) || expirySeconds < 1 || expirySeconds > MAX_EXPIRY_SECONDS) {
    throw new RangeError('expirySeconds debe ser un entero en [1, 3600]');
  }
  return expirySeconds + RECONCILE_RETRY_MARGIN_SECONDS;
}
