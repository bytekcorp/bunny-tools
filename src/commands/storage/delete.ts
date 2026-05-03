import type { ParsedInvocation } from '../../manifest/types.js';
import { deletePath, resolveActiveZone } from '../../core/storage-ops.js';
import { confirm, isInteractive } from '../../ui/prompt.js';
import { createProgress } from '../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { path?: string };
  const flags = inv.flags as { zone?: string; recursive?: boolean; yes?: boolean; region?: string };
  if (!args.path) {
    progress.fail('Usage: bunny storage delete <path> [--zone=<name>]');
    return 1;
  }
  if (args.path === '/' || args.path === '') {
    progress.fail('Refusing to delete zone root. Use `bunny storagezone delete` instead.');
    return 1;
  }
  let zone: string;
  try {
    zone = await resolveActiveZone(flags.zone);
  } catch (err) {
    progress.fail((err as Error).message);
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes to confirm in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({
      message: `Delete ${flags.recursive ? 'recursively' : 'file'} "${args.path}" on zone ${zone}?`,
      default: false,
    });
    if (!ok) {
      progress.info('Aborted.');
      return 1;
    }
  }
  const count = await deletePath(zone, args.path, {
    ...(flags.recursive ? { recursive: true } : {}),
    ...(flags.region ? { region: flags.region } : {}),
  });
  progress.succeed(`Deleted ${count} entr${count === 1 ? 'y' : 'ies'} from ${zone}.`);
  return 0;
}
