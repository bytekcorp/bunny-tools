import type { ParsedInvocation } from '../../../manifest/types.js';
import { createApp } from '../../../core/containers.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { name?: string };
  const flags = inv.flags as { image?: string; region?: string; port?: string };
  if (!args.name) {
    progress.fail('Usage: bunny containers:app:create <name> [--image=<docker-image>] [--region=<r>] [--port=<n>]');
    return 1;
  }
  const app = await createApp({
    name: args.name,
    ...(flags.image ? { image: flags.image } : {}),
    ...(flags.region ? { region: flags.region } : {}),
    ...(flags.port ? { port: Number.parseInt(flags.port, 10) } : {}),
  });
  progress.succeed(`Created container app ${app.Name} (id=${app.Id}).`);
  return 0;
}
