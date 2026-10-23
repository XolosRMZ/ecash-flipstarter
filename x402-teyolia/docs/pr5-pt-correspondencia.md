# 2026-10-23 — PR-5 — Tabla PT v1.1

*Xolo Arquitecto (TA-2) · tabla PT-01..PT-07 ↔ INF-042 §11 ↔ tests, v1.1 · 23 de octubre de 2026 · horas en CDMX (UTC-6)*

> **Cambio respecto de la v1.0** (MD `1C2Yv-OFVpHU_PJcoilNYcYMh6EvdXIt4`, sha256 `538d8cce27e359ccbc0d0d1f5a1d67fd252506d24fa004aac72a37ad59627cd7`). Esta versión incorpora las condiciones del §10 punto 1 del dictamen de Xolo Auditor sobre la tabla (Doc `1C_jzIzd3nl8z_U_SU4Xik_MD13P_kQ3oFDfcOjZzvrg`, self-hash `eb6601e4e322f930508cc192f6a81a05d15694382e623e8ace2b279f695df220`, PASS con observaciones). También recoge la decisión de Fernando de las 14:16 sobre M5-V1 (opción A).
>
> Viaja con el diff de PR-5. `x402-teyolia/docs/pr5-pt-correspondencia.md` es idéntico byte a byte a este MD. No autoriza push, merge, cambios de workflow, Chronik real, red, llaves, firma, fondos ni broadcast.

## §0 Metadatos e integridad

| Campo | Valor |
| :---- | :---- |
| Base | `xolosArmy/ecash-flipstarter` main = `f23146fdb3e6de06164163d48aad78b8f5b449b0` (árbol `039b4357d4debe1d359e4a774656aeef0c732710`) |
| Fuentes (leídas como datos) | INF-045 §6.4 (PT-01..PT-07), §6.2 y §6.1 (= INF-042 §11). Registro de decisiones `1TR32zXkJk9GuHfUEwz_kmxVhGPhk1cKKuKaoudPzC2c`, filas 2026-10-23 14:05 y 14:16 (leídas). Reconciliación v2 de CoS `1F-VwwqjsI_Ss6WtljahW2h_JfO1vX7KNvprnH_x9IyU`. Verificación v2 del Auditor `1EKGjG6XGzyCxVRagLbpm2uOLfQRCKLhL37kkDK9ToNg`. Dictamen del Auditor sobre la tabla v1.0 `1C_jzIzd3nl8z_U_SU4Xik_MD13P_kQ3oFDfcOjZzvrg` |
| Decisiones aplicadas (fila 14:05, leída) | **DM-1:** endpoint fijo, `TEYOLIA_X402_CHRONIK_URL`, solo como contrato; C-05 con fixtures. **DM-2:** `expirySeconds` = 300 s sin cambio. La fe de erratas del criterio 6 de INF-045 §9.2 **ya está registrada** (comentario `doco.A6Qn67_eXMcbpIqCUJkRDg` en INF-045); lo que va al gate de TA-3 es la **medición operativa real** (PT5-09). **DM-3:** M4-S no es «relacionado con RMZWallet»; PR-5b va sin Antigravity ni E-7 (no empezado). **DM-6:** el paso M5-V1 va dentro del job requerido `x402-teyolia (Node 22.13.1)`; el push espera el SHA final auditado. **DM-7:** no empezado |
| Decisión aplicada (fila 14:16, leída) | **M5-V1, opción A:** `commit` y `distManifestSha256` en el nivel superior de `/teyolia-x402/health`. Es un **cambio de contrato del health**, ya decidido |
| Prefijos | **P-4/Lx** = revisión P-4 del diseño de PR-1. **P4-Lx (PR-4)** = dictamen de PR-4. **PT5-xx** = dictamen del Auditor sobre la tabla PT v1.0 |
| Etiquetas | HECHO = verificado en `f23146f` o en el candidato. PROPUESTA = caso que añade PR-5, solo en `test/`. N/A = no aplica, con justificación. INFERENCIA = lectura mía. **SIMULACIÓN** = prueba de un simulador de `test/`, no evidencia del proceso x402 |
| Integridad | SHA-256 (UTF-8, LF, sin BOM, salto final) de este Markdown con el valor de esta celda en 64 ceros: **`2ca37c43dd6ab9a8b09082ae236f51e00b4ac44fac228fb38bdcf1d250dd9685`**. El SHA-256 del archivo se reporta aparte |

## 1 Reglas de diseño

* **Sin política nueva en `src/`.** No se añade a `src/` ninguna lógica de aprobación humana, presupuesto, revocación, CAE ni rechazo 4xx de `PAYMENT-SIGNATURE`. Ninguna fila de esta tabla la necesita. Desde la fila 14:16, `src/` cambia **solo** en:
  * M5-V1: lectura de `build-info.json` y health;
  * P4-L1 (PR-4);
  * P66Δ-L1;
  * P4-L3 (PR-4).
* **Casos nuevos solo en `test/`.** Usan adaptadores inyectados y fixtures sintéticos (DEC-AX-09 (a)). El CAE se simula en `test/fixtures/x402/cae-sim.mjs` (tonalli-agents es privado; RO-02).
* **Pares de control.** Cada vector de servidor nuevo lleva su par positivo y negativo por fixture (PT5-10). Como `src/` no cambia para las PT, esos vectores también pasan en `f23146f`. Son vectores de caracterización, no de regresión de un cambio.
* **Límites.** Límites en cero y kill switch (DEC-AX-08 (a)). Sin red, sin Chronik real (C-05 con fixtures, DM-1), sin llaves y sin fondos. El proceso real sigue en 503 (E-8).
* **Papel del CAE (INFERENCIA de diseño).** El proceso x402 es el vendedor y el CAE autoriza al agente comprador, así que el CAE no es una entrada del proceso.
  * La evidencia del **proceso** es PT-02a: la invariante «CAE approval != payment authorization» (INF-040 §2.1).
  * PT-02b y el presupuesto de PT-07a son **SIMULACIÓN de contrato** (INF-045 §6.4: «CAE se simula con un adaptador»).

## 2 Tabla PT-01..PT-07 ↔ INF-042 §11 ↔ tests

| PT (INF-045 §6.4) | Sub-caso | Vector INF-042 §11 | Test existente en `f23146f` (HECHO) | Caso nuevo en PR-5 (solo `test/`) |
| :---- | :---- | :---- | :---- | :---- |
| **PT-01** Versiones desconocidas; H2A v2 frente a C1/C3B v1 — **PARCIAL: cierra con PR-5b** | `x402Version: 2`, campo extra, alias doble, red distinta | R-10, R-11, R-12 | `pr4.vectors` R-10 / R-11 / R-12 | **PT-01a:** `x402Version` en 0, 3, `"1"`, 1.5, `null` o ausente → 400 `MALFORMED_PROOF`, sin PAID, sin grant y sin consultar Chronik (el esquema es `z.literal(1)`; `VERSION_MISMATCH` es inalcanzable). Par positivo: la misma prueba con `x402Version: 1` da 200 |
| | Cabecera H2A v2 `PAYMENT-SIGNATURE`: servidor | — | — | **PT-01b (caracterización):** el servidor **ignora** `PAYMENT-SIGNATURE`; el middleware H2A v2 no está montado. Sola → 402 con la oferta C3B, 0 grants, 0 consultas a Chronik. Con una `payment-proof` C3B válida → 200 GRANTED. Par negativo: con una prueba inválida, nunca 200. «Rechazo» se lee aquí como «nunca se acepta como pago»; un 4xx ante la mera presencia de la cabecera sería lógica nueva en `src/` y necesita decisión |
| | Cabecera H2A v2: cliente C3B sintético (M4-S) | — (M4-S, INF-045 §6.3) | — | **PR-5b** (DM-3: sin Antigravity ni E-7; no empezado). PR-5b fija la lectura de «rechazo». Hasta su merge, PT-01 no cuenta en verde |
| **PT-02** CAE `unavailable`, `rejected`, `needs_human_approval`; expiración en cada frontera; revocación durante la espera | Señal CAE sin prueba (**evidencia del proceso**) | — | — | **PT-02a:** cabeceras o campos con forma de decisión CAE o de aprobación humana, sin prueba válida → nunca 200 y sin grant |
| | Agente comprador con CAE simulado (**SIMULACIÓN**) | — | — | **PT-02b (simulación de contrato):** el agente simulado no paga, y el proceso queda sin PAID ni grant, en estos casos: CAE `unavailable`; `rejected`; versión o decisión desconocida; decisión vencida; `needs_human_approval` sin aprobación, con la aprobación de otra intención, o con vencimiento o revocación durante la espera. Solo `approved`, o `needs_human_approval` con la aprobación enlazada, llega a 200, una vez |
| | Expiración en cada frontera | R-06, L-01, P-R1, T-14 | `pr4.vectors` R-06, L-01, P-R1 y T-14; `c66.h1`; `d4-d5-l01` | La expiración de la decisión simulada está en PT-02b. `expirySeconds` = 300 s (DM-2) |
| | Revocación durante la espera | R-14 | `pr4.vectors` R-14 (OFF desde el arranque) | **PT-02c:** factura emitida con ON y proceso reiniciado con OFF (revocación) → 503 con la misma prueba, sin grant. Con OFF, `openPersistence` no abre nada y la ruta da 503 antes del middleware (INFERENCIA aceptada por el Auditor) |
| **PT-03** Imports o campos extra con secretos o raw tx | Campo extra en la prueba | R-10 | `pr4.vectors` R-10 | **PT-03a:** `rawTx`, `privateKey`, `seed` o `mnemonic` en la prueba → 400 `MALFORMED_PROOF`, sin consultar Chronik y **sin eco del valor**. El error de zod sí nombra la clave, que elige el propio cliente (PT5-15). Par positivo: la misma prueba sin esos campos da 200 |
| | Variables de entorno con llaves | — (T-10) | `env-guard.t10` T-10a, T-10b, T-10c, T-10d, T-10h | — |
| | Imports o símbolos de firma | — (T-11) | `graph.t11` T-11a, T-11b, T-11c; T-11d | — |
| **PT-04** Misma key con otro payload; dos workers; crash tras commit; lease vencido; replay entre proyectos o redes | **Lease vencido** | — | — | **N/A.** No hay leases (nota E-6; INF-045 §9.1 E-6). G-12 = topología monohost y monoescritor (INF-044 §10.1), y es un límite documentado, no un control (P3-I3). El dictamen PR-3 §6 aceptó la nota E-6 con **dos condiciones**: (i) todo efecto adicional va a un outbox transaccional con clave `invoice_hash`; (ii) RQ-17 se reabre antes de cualquier efecto externo o despliegue multi-host |
| | Resto de sub-casos (solo trazabilidad) | T-04, **T-08**, P-R2; T-05, P-R4; T-02, T-03, P-R6; R-12, R-13, P-R3 | `store-grant.pr3` T-02…T-05 y **T-08** (l.56, «choque solo en settled_txid o solo en nonce → 409», sin la etiqueta T-08 en el nombre; PT5-13); `pr4.vectors` P-R2, P-R3, P-R4, P-R6, R-12 y R-13 | — |
| **PT-05** Receipt sin verificación; TXID incorrecto; receptor o importe insuficientes; `invoiceHash` distinto; mempool no final; reorg; caída de Chronik; receipt tardío; expiración tras firmar | TXID incorrecto | R-01 | `pr4.vectors` R-01 | — |
| | Receptor o importe | R-02, R-03 | `pr4.vectors` R-02 y R-03 ×2 | — |
| | `invoiceHash` distinto o fabricado | R-04, R-05 | `pr4.vectors` R-04 / R-05 | — |
| | Mempool no final; finalidad discrepante (antes de conceder) | R-09, A-03, C-05 | `pr4.vectors` R-09, A-03 y C-05 (fixtures, DM-1) | — |
| | **Reorg posterior a la concesión** | — (HUECO de las fuentes: no tratan el grant tras un reorg) | — | **PT-05b (caracterización: sin revocación, residual TA-3):** 200 GRANTED; luego la tx desaparece → 402 `TX_NOT_FOUND`, con una consulta más a la Chronik del servidor; vuelve sin finalidad → 402 `TRANSACTION_NOT_FINAL`; otro txid para la misma factura → 409 `TXID_CONFLICT`. En todos, el grant (1) y su `deliveryCount` siguen sin cambio y la factura sigue PAID. La conciliación posterior no marca nada. Con A-02 (bloque sin `isFinal`), al retirar el bloque → 402 `TRANSACTION_NOT_FINAL` y el grant y PAID persisten. Par positivo: la tx vuelve a ser final, o nunca hay reorg → 200 `EFFECT_REPLAYED`. Sin riesgo de fondos en TA-2 (R3, `ZERO_LIMITS`); la finalidad ante reorg pasa a las precondiciones del gate de TA-3 (PT5-11) |
| | Caída o respuesta malformada de Chronik | R-07, R-08 | `pr4.vectors` R-07 y R-08 | — |
| | Receipt tardío; expiración tras firmar | L-01, B-01 | `pr4.vectors` L-01 y B-01; `c66.h2` | — |
| | Receipt sin verificación | — | — | **PT-05a:** una prueba con la tx o los outputs incrustados (`tx`, `outputs`, `isFinal`) → 400. Par positivo: la prueba bien formada consulta la Chronik del servidor (fixture) antes de dar 200 |
| **PT-06** Settlement con efecto ya aplicado; settlement con recurso bloqueado → reconciliación sin segundo pago | Efecto ya aplicado | T-01, P-R1 | `store-grant.pr3` T-01; `pr4.vectors` P-R1 | — |
| | Recurso bloqueado: conciliación | T-03; D-5 | `store-grant.pr3` T-03; `d4-d5-l01` D-5; `c66.h2` | — |
| | Recurso bloqueado: revocación y reactivación | — | — | **PT-06a:** pago con ON, reinicio con OFF (503) y reactivación antes de `expiresAt` → la misma prueba da 200 GRANTED, con un solo grant y sin factura nueva. **PT-06b** (solo lo verificable, PT5-08): reactivación tras `expiresAt` → 402 `INVOICE_EXPIRED`, **sin oferta** y **sin fila ISSUED nueva**, 0 grants. La marca `LATE_PAYMENT_REVIEW` aparece con la sonda de fixture `hasFunds`; par negativo: sin fondos, no hay marca. El servidor no puede impedir que el cliente pague **otra** factura |
| **PT-07** Presupuesto acumulado y comisiones; una campaña aprobada no da autoridad de gasto; kill switch y límites cero | Límites cero y no configurables | — | `killswitch` «límites en cero» | **PT-07a:** el presupuesto simulado que lee `ZERO_LIMITS` del `dist/` real rechaza toda reserva de 1 sat o más, acumulada o con comisión (**SIMULACIÓN de contrato**). La evidencia del proceso es `ZERO_LIMITS` congelado y `limitsZero = true` en el health con OFF, con ON sin adaptadores y con ON con adaptadores |
| | Campaña aprobada sin autoridad | C-01, C-02 | `pr4.vectors` C-01 / C-02 | — |
| | Kill switch | R-14, C-03, C-04 | `killswitch` (matriz); `pr4.vectors` R-14 y C-03 | — |
| **T-06** — **ABIERTO hasta PR-6** (PT5-02) | La ruta x402 no alcanza finalize ni el legacy, no lee variables de llaves (INF-042 §11.4) ni ninguna `TEYOLIA_REFUND_ORACLE_*` privada (§9.2) | T-06 | **Composición actual:** T-10a/b/c/h (variables de llaves y deny-by-default); T-11a/b/c/d (alcance estático y en runtime de finalize y del legacy); T-18. **Falta:** la rama de red, **T-12** (el `fetch` global hacia `127.0.0.1:3011` no lo ve T-11), y la de archivos legacy, **T-13** (`.env`, unit y estado del legacy). Las dos están en PR-6 | Sin test nuevo en PR-5. El plan asigna T-06 a PR-6; un test propio allí es lo recomendado |
| **W-01** (lado servidor) | Índice > 100; el gap de 20–100 no la ve | W-01 | `pr4.vectors` W-01 (l.308–325) | — (el escaneo real de RMZWallet, la rama xpub dedicada, M4-E2E, Antigravity y E-7 son del gate de TA-3; EN-1) |

## 3 Lo que esta tabla no hace, y lo que cambia de contrato

* **No implementa M4-S** (PR-5b, DM-3).
* **No introduce política en el proceso.** No añade CAE, ledger de presupuesto, aprobación humana, revocación ni rechazo 4xx de `PAYMENT-SIGNATURE`.
* **No cambia** `src/policy.ts`, el kill switch, los límites ni la allowlist, y no hay variables de entorno nuevas. `TEYOLIA_X402_CHRONIK_URL` ya está en la allowlist (DM-1) y no se cablea.
* **Sí cambia, por decisión de Fernando (14:16), el contrato del health (M5-V1, opción A).** `/teyolia-x402/health` pasa a devolver `{status, component, x402Enabled, limitsZero, commit, distManifestSha256}`. Lo fijan **dos** tests, los dos con igualdad exacta (líneas en `f23146f`):
  * `killswitch.test.mjs` l.83: claves exactas;
  * T-10f, `env-guard.t10.test.mjs` l.124: objeto exacto y formato 40/64 hex. Su l.128 («ningún valor del entorno en el body») se conserva.
* **`distManifestSha256` del health es un valor DECLARADO, no medido.** El proceso lo lee de `dist/build-info.json` y no recalcula el manifiesto (residual PT5-04 (iv), pendiente de Fernando). La identidad real se comprueba con M5-V1 por rebuild y, en mx2, hasheando `dist/`.

## 4 Pendiente de decisión de Fernando (aislado en el candidato, sin decidir)

1. **Recálculo del manifiesto al arrancar** (dictamen §9 punto 1, PT5-04 (iv)). Por ahora no se recalcula y queda como residual documentado. El recálculo está preparado en un commit aparte, fuera de la rama del candidato. Sustituye solo `src/build-identity.ts` y ajusta sus tests.
2. **Qué commit se expone en `pull_request`** (dictamen §9 punto 2, PT5-04 (i)). En `pull_request`, HEAD es el merge commit sintético. El Auditor recomienda el head del PR. El paso de CI deja esa elección parametrizada dentro del commit de CI, sin variables de entorno nuevas en el runtime.

## 5 Para enterado (dictamen §9 punto 3)

* PT-05b se añade como caracterización, sin revocación.
* T-06 cierra con PR-6.
* PT-01 cierra con PR-5b.
* La finalidad ante reorg pasa a la lista de precondiciones del gate de TA-3 (PT5-11; PR-8).
