// vitest setupFile — skip the entire e2e suite when BUNNY_E2E !== '1'.
// Tests `it.skipIf(skip)(...)` against the exported flag; no globalThis hacks.
// Also asserts BUNNY_ACCOUNT_KEY is present when the gate is open, since
// every e2e file needs it.

export const E2E_ENABLED = process.env['BUNNY_E2E'] === '1';

if (E2E_ENABLED) {
  if (!process.env['BUNNY_ACCOUNT_KEY']) {
    // Surface this loudly — a missing account key would produce many tests
    // failing with auth errors instead of one clear setup error.
    throw new Error(
      'BUNNY_E2E=1 requires BUNNY_ACCOUNT_KEY to be set. Refusing to run e2e against an unauthenticated client.',
    );
  }
}
