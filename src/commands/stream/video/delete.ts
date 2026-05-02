import type { ParsedInvocation } from '../../../manifest/types.js';
import { deleteVideo } from '../../../core/stream.js';
import { confirm, isInteractive } from '../../../ui/prompt.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { library?: string; video?: string };
  const flags = inv.flags as { yes?: boolean };
  if (!args.library || !args.video) {
    progress.fail('Usage: bunny stream:video:delete <library> <videoGuid> [--yes]');
    return 1;
  }
  if (!flags.yes) {
    if (!isInteractive()) {
      progress.fail('Pass --yes in non-interactive shells.');
      return 1;
    }
    const ok = await confirm({ message: `Delete video ${args.video} from library ${args.library}?`, default: false });
    if (!ok) return 1;
  }
  await deleteVideo(args.library, args.video);
  progress.succeed(`Deleted video ${args.video}.`);
  return 0;
}
