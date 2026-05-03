import type { ParsedInvocation } from '../../manifest/types.js';
import { createStorageZone } from '../../core/zones.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { name?: string };
  const flags = inv.flags as { region?: string; replicate?: string; tier?: string };
  if (!args.name) {
    progress.fail('Usage: bunny storage-zone:create <name> [--region=<r>] [--replicate=<r,r>] [--tier=Standard|Edge]');
    return 1;
  }
  // Bunny accepts only uppercase region codes (NY/LA/SG/...). Users naturally
  // type lowercase, so we normalize here rather than fail with a 400.
  const region = flags.region ? flags.region.toUpperCase() : undefined;
  const replicationRegions = flags.replicate
    ? flags.replicate.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : undefined;
  const zoneTier = flags.tier === 'Edge' ? 1 : flags.tier === 'Standard' ? 0 : undefined;
  const zone = await createStorageZone({
    name: args.name,
    ...(region ? { region } : {}),
    ...(replicationRegions ? { replicationRegions } : {}),
    ...(zoneTier !== undefined ? { zoneTier } : {}),
  });
  progress.succeed(`Created storage zone ${zone.Name} (id=${zone.Id}, region=${zone.Region}).`);
  return 0;
}
