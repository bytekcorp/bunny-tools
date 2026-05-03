// `bunny pullzone hostname add` — idempotent state-setter for hostname +
// cert + ForceSSL. Default: link + provision Let's Encrypt cert + enable
// HTTP→HTTPS redirect (production-ready out of the box). Re-running with
// different flags brings the hostname to the new desired state.
//
//   add <pzId> <host>                         link + cert + force-ssl=on
//   add <pzId> <host> --no-force-ssl          link + cert + force-ssl=off
//   add <pzId> <host> --timeout=<sec>         override 90s cert wait
//
// rc.37 collapsed the rc.26-36 enable-ssl + force-ssl subcommands into
// flags here. Existing scripts using those subcommands will fail with
// "unknown command" — see CHANGELOG for migration.

import type { ParsedInvocation } from '../../../manifest/types.js';
import {
  addPullZoneHostname,
  enablePullZoneSSL,
  listPullZoneHostnames,
  setHostnameForceSSL,
} from '../../../core/zones.js';
import { formatBunnyError } from '../../../util/format-error.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { pullZoneId?: string; hostname?: string };
  // Commander treats `--no-foo` as the negation of `--foo`: option name
  // becomes `foo`, default true, passing `--no-foo` sets it to false.
  // Read the negative-form flags via their positive name.
  const flags = inv.flags as {
    forceSsl?: boolean;
    timeout?: string;
  };
  if (!args.pullZoneId || !args.hostname) {
    progress.fail('Usage: bunny pullzone hostname add <pullZoneId> <hostname> [--no-force-ssl]');
    return 1;
  }
  const pzId = Number.parseInt(args.pullZoneId, 10);
  const host = args.hostname;
  const timeoutMs = flags.timeout ? Number.parseInt(flags.timeout, 10) * 1000 : undefined;
  const noForceSsl = flags.forceSsl === false;

  try {
    // Step 1: ensure hostname is linked. listPullZoneHostnames is one GET;
    // skipping the addHostname call when already linked makes re-runs cheap
    // and avoids a Bunny 4xx when the same hostname is added twice.
    const existing = await listPullZoneHostnames(pzId);
    if (!existing.includes(host)) {
      await addPullZoneHostname(pzId, host);
    }

    progress.start(`Linking ${host} and provisioning SSL (may take up to 90s)…`);
    const result = await enablePullZoneSSL(pzId, host, {
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(noForceSsl ? { noForceSSL: true } : {}),
    });

    // State assertion: when --no-force-ssl is passed, ensure ForceSSL=false
    // even if a previous run left it on. enablePullZoneSSL with noForceSSL
    // skips the auto-flip but doesn't actively turn it off; do that here so
    // re-running `add --no-force-ssl` is idempotent on the desired state.
    if (noForceSsl) {
      await setHostnameForceSSL(pzId, host, false);
    }

    const seconds = Math.round(result.waitedMs / 1000);
    const sslState = noForceSsl ? 'no force-ssl' : 'force-ssl on';
    if (result.waitedMs === 0) {
      progress.succeed(`${host} linked, cert ready (${sslState}).`);
    } else {
      progress.succeed(`${host} linked, cert provisioned in ${seconds}s (${sslState}).`);
    }
    return 0;
  } catch (err) {
    progress.fail(formatBunnyError(err));
    return 1;
  }
}
