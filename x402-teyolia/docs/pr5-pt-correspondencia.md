# PR-5 — Tabla de correspondencia PT-01..PT-07 ↔ INF-042 §11 ↔ tests (diseño previo al código)

Este archivo es el **primer commit de PR-5**. Precede a cualquier cambio de código o de tests
(dictamen del Auditor «Reconciliación gate TA-2», §9 punto 3 y §12 condición 3). Su objeto es que
el diseño se pueda auditar antes que la implementación.

**Reglas de diseño**

* **Política nueva:** no se añade ninguna lógica de política a `src/` (aprobación humana,
  presupuesto, revocación, CAE). Si alguna fila la necesitara, habría que detenerse y pedir nota de
  diseño y auditoría.
* **Casos nuevos:** solo en `test/`, con adaptadores inyectados y fixtures sintéticos
  (DEC-AX-09 (a)). El CAE se simula con un adaptador en `test/fixtures/x402/cae-sim.mjs`, porque
  tonalli-agents es privado y no se leyó (RO-02).
* **Límites:** límites en cero y kill switch (DEC-AX-08 (a)). Sin red, sin Chronik real, sin
  llaves y sin fondos. El proceso real sigue en 503 (E-8, PR4-A).
* **Rol del CAE en este proceso:** el proceso x402 es el lado vendedor (verifica la prueba y
  concede el recurso). El CAE autoriza intenciones del agente comprador (INF-023, «CAE decide
  política»), así que no es una entrada del proceso x402. Las PT de CAE se prueban de dos maneras:
  1. ninguna señal con forma de CAE sustituye a la prueba de pago;
  2. un agente comprador simulado en `test/` que no paga en ningún caso que no sea de aprobación.
  Ninguna de las dos añade código a `src/`.
* **Etiquetas:** HECHO = verificado en `f23146f`; PROPUESTA = caso que añade PR-5; N/A = no aplica,
  con su justificación.

## Tabla

| PT (INF-045 §6.4 / INF-023 §6) | Sub-caso | Vector INF-042 §11 | Test existente en `f23146f` (HECHO) | Caso nuevo en PR-5 (PROPUESTA, solo `test/`) |
| :---- | :---- | :---- | :---- | :---- |
| **PT-01** Versiones desconocidas; H2A v2 frente a C1/C3B v1 | `x402Version: 2`, campo extra, alias doble, red distinta | R-10, R-11, R-12 | `pr4.vectors` «R-10 / R-11 / R-12 …» | **PT-01a:** `x402Version` en 0, 3, `"1"`, 1.5 o ausente → 400 `MALFORMED_PROOF`, sin PAID y sin grant |
| | Cabecera H2A v2 `PAYMENT-SIGNATURE` | — (M4-S) | — | **Fuera de PR-5:** M4-S y PR-5b (Q-11.6, DM-3). No se adelanta aquí |
| **PT-02** CAE `unavailable`, `rejected` y `needs_human_approval` | Señal CAE sin prueba | — | — | **PT-02a:** cabeceras o campos con forma de decisión CAE o aprobación humana, sin prueba válida → nunca 200, sin grant |
| | Agente comprador con CAE simulado | — | — | **PT-02b:** CAE `unavailable`, `rejected`, versión desconocida, `needs_human_approval` sin aprobación, decisión vencida o revocada durante la espera → el agente simulado no paga; el proceso queda sin PAID y sin grant. Solo `approved` (o `needs_human_approval` con aprobación simulada) llega a 200, una vez |
| | Expiración en cada frontera | R-06, L-01, P-R1, T-14 | `pr4.vectors` R-06, L-01, P-R1 y T-14; `c66.h1` (umbral de conciliación); `d4-d5-l01` (ventana de 86 400 s) | La expiración de la decisión CAE simulada está en PT-02b |
| | Revocación durante la espera | R-14 | `pr4.vectors` R-14 (OFF desde el arranque) | **PT-02c:** factura emitida con ON y proceso reiniciado con OFF (revocación) → 503 con la misma prueba, sin grant |
| **PT-03** Imports o campos extra con secretos o raw tx | Campo extra en la prueba | R-10 | `pr4.vectors` R-10 | **PT-03a:** campos `rawTx`, `privateKey`, `seed` o `mnemonic` en la prueba → 400 `MALFORMED_PROOF`; la respuesta no repite el valor; Chronik no se consulta |
| | Variables de entorno con llaves | — (T-10) | `env-guard.t10` T-10a, T-10b, T-10d | — |
| | Imports o símbolos de firma | — (T-11) | `graph.t11` T-11a, T-11b, T-11c | — |
| **PT-04** Misma key con otro payload; dos workers; crash tras commit; lease vencido; replay entre proyectos o redes | **Lease vencido** | — | — | **N/A:** no hay leases (nota E-6, aceptada en el dictamen #65 §6; G-12 monohost, un solo escritor). RQ-17 se reabre antes de multi-host o de cualquier efecto externo |
| | Resto de sub-casos (trazabilidad; no se añade nada) | T-04, T-08, P-R2; T-05, P-R4; T-02, T-03, P-R6; R-12, R-13, P-R3 | `store-grant.pr3` T-02…T-05 y T-08; `pr4.vectors` P-R2, P-R3, P-R4, P-R6, R-12, R-13 | — |
| **PT-05** Receipt sin verificación; TXID incorrecto; receptor o importe insuficientes; `invoiceHash` distinto; mempool no final; reorg; caída de Chronik; receipt tardío; expiración tras firmar | TXID incorrecto | R-01 | `pr4.vectors` R-01 | — |
| | Receptor o importe | R-02, R-03 | `pr4.vectors` R-02 y R-03 ×2 | — |
| | `invoiceHash` distinto o fabricado | R-04, R-05 | `pr4.vectors` R-04 / R-05 | — |
| | Mempool no final; finalidad discrepante | R-09, A-03, C-05 | `pr4.vectors` R-09, A-03 y C-05 | — |
| | Reorg | R-09, C-05, A-02 | Sin finalidad no hay 200 (R-09, C-05). Un bloque cuenta como confirmación (A-02); un reorg posterior a la concesión queda en el modelo de INF-042 (INFERENCIA) | — (sin política nueva) |
| | Caída o respuesta malformada de Chronik | R-07, R-08 | `pr4.vectors` R-07 y R-08 | — |
| | Receipt tardío; expiración tras firmar | L-01, B-01 | `pr4.vectors` L-01 y B-01; `c66.h2` (carrera de liquidación frente al escaneo) | — |
| | Receipt sin verificación | — | — | **PT-05a:** prueba con la tx o los outputs incrustados (`tx`, `outputs`) → 400; una prueba bien formada siempre consulta Chronik del servidor (fixture) antes de 200 |
| **PT-06** Settlement con efecto ya aplicado; settlement con recurso bloqueado → reconciliación sin segundo pago | Efecto ya aplicado | T-01, P-R1 | `store-grant.pr3` T-01; `pr4.vectors` P-R1 | — |
| | Recurso bloqueado: conciliación | T-03; D-5 | `store-grant.pr3` T-03; `d4-d5-l01` D-5; `c66.h2` | — |
| | Recurso bloqueado: revocación y reactivación | — | — | **PT-06a:** pago con ON, reinicio con OFF (503) y reactivación antes de `expiresAt` → la misma prueba da 200 GRANTED, un solo grant, sin factura nueva. **PT-06b:** reactivación tras `expiresAt` → 402 `INVOICE_EXPIRED`, `LATE_PAYMENT_REVIEW` (reembolso manual), 0 grants y ningún segundo cobro |
| **PT-07** Presupuesto acumulado y comisiones; campaña aprobada sin autoridad de gasto; kill switch y límites cero | Límites cero y no configurables | — | `killswitch` «límites en cero» | **PT-07a:** presupuesto simulado (en `test/`) que lee `ZERO_LIMITS` del `dist/` real: rechaza toda reserva ≥ 1 sat, acumulada o con comisión. `limitsZero = true` en el health con OFF y con ON |
| | Campaña aprobada sin autoridad | C-01, C-02 | `pr4.vectors` C-01 / C-02 (rechazo de `TEYOLIA_MONETARY_FLOWS_ENABLED`) | — |
| | Kill switch | R-14, C-03, C-04 | `killswitch` (matriz), `pr4.vectors` R-14 y C-03 | — |
| **T-06** (fila pedida por el Auditor) | La ruta x402 no alcanza finalize ni legacy ni lee variables de llaves | T-06 | Por composición: `graph.t11` T-11a/b/c y `env-guard.t10` T-10a/b | Solo la fila. Un test propio es opcional en PR-6 |
| **W-01** (lado servidor) | Índice > 100; el gap de 20–100 no la ve | W-01 | `pr4.vectors` W-01 | — (lo de RMZWallet es TA-3) |

## Lo que esta tabla no hace

* **M4-S:** no implementa M4-S (PR-5b).
* **Contratos:** no cambia `src/policy.ts`, el kill switch ni los límites, y no amplía la allowlist.
* **Política:** no introduce un CAE, un ledger de presupuesto ni una aprobación humana en el proceso.
