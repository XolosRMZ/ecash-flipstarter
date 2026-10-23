// CAE SIMULADO (PR-5, PT-02/PT-07; INF-045 §6.4). Solo test/: nada de esto existe en src/ ni dist/.
// tonalli-agents es privado y no se leyó (RO-02). Este adaptador imita la superficie pública
// descrita en INF-023: decisiones exactas approved | rejected | needs_human_approval; cualquier
// fallo, versión desconocida o discrepancia cierra el flujo. Modela al AGENTE COMPRADOR, no al
// proceso x402: el proceso x402 no consulta ningún CAE.

export const CAE_VERSION = 1;

/** CAE simulado. `script(intent)` devuelve la respuesta o lanza (unavailable). */
export function simulatedCae(script) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async decide(intent) { calls += 1; return script(intent); },
  };
}

/**
 * Agente comprador simulado, fail-closed (regla de INF-023: approved de CAE es política, no
 * firma; needs_human_approval exige una aprobación humana enlazada; vencido o revocado bloquea).
 * Devuelve { pay: true } solo si se puede pagar; nunca construye ni firma nada: el «pago» del test
 * es una tx sintética de fixture.
 */
export async function agentMayPay({ cae, intent, now, human, revoked = () => false }) {
  let d;
  try {
    d = await cae.decide(intent);
  } catch {
    return { pay: false, reason: 'CAE_UNAVAILABLE' };
  }
  if (!d || d.version !== CAE_VERSION) return { pay: false, reason: 'CAE_VERSION' };
  if (!(Number.isSafeInteger(d.expiresAt) && now() < d.expiresAt)) return { pay: false, reason: 'CAE_EXPIRED' };
  if (d.decision === 'rejected') return { pay: false, reason: 'CAE_REJECTED' };
  if (d.decision === 'needs_human_approval') {
    const a = human ? await human(d) : null;
    if (revoked()) return { pay: false, reason: 'REVOKED' };
    if (!(Number.isSafeInteger(d.expiresAt) && now() < d.expiresAt)) return { pay: false, reason: 'CAE_EXPIRED' };
    if (!a || a.approved !== true || a.intentDigest !== intent.digest) return { pay: false, reason: 'HUMAN_NOT_APPROVED' };
    return { pay: true, reason: 'HUMAN_APPROVED' };
  }
  if (d.decision !== 'approved') return { pay: false, reason: 'CAE_UNKNOWN_DECISION' };
  if (revoked()) return { pay: false, reason: 'REVOKED' };
  return { pay: true, reason: 'APPROVED' };
}

/** Presupuesto simulado con los límites REALES de dist/policy.js (ZERO_LIMITS en TA-2). */
export function simulatedBudget(limits) {
  let reserved = 0n;
  return {
    get reserved() { return reserved; },
    reserve(amountSats, feeSats = 0n) {
      const total = amountSats + feeSats;
      if (total <= 0n) return { ok: false, reason: 'NON_POSITIVE' };
      if (total > limits.maxAmountPerOperationSats) return { ok: false, reason: 'PER_OPERATION' };
      if (reserved + total > limits.maxAggregateSats) return { ok: false, reason: 'AGGREGATE' };
      if (reserved + total > limits.agentBudgetSats) return { ok: false, reason: 'AGENT_BUDGET' };
      reserved += total;
      return { ok: true };
    },
  };
}
