// Superficie vendorizada de x402-XEC 0f409de (PR-2b C4; dictamen PR-2 P2-L4).
// Entrada sintética para `check-graph --surface vendor` y para la sonda de T-11d: carga lo que
// PR-4 montará (middleware y store SQLite) sin tocar src/. Los imports son dinámicos (fase 2),
// como en dist/main.js tras el guard.
export async function loadVendorSurface() {
  const express = await import('@x402-xec/express');
  const core = await import('@x402-xec/core');
  const sqlite = await import('@x402-xec/core/sqlite');
  return { express, core, sqlite };
}
