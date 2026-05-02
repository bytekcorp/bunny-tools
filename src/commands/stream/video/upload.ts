import type { ParsedInvocation } from '../../../manifest/types.js';
import { uploadVideo } from '../../../core/stream.js';
import { createProgress } from '../../../ui/progress.js';

export async function run(inv: ParsedInvocation): Promise<number> {
  const progress = createProgress();
  const args = inv.args as { library?: string; file?: string };
  const flags = inv.flags as { title?: string; collection?: string };
  if (!args.library || !args.file) {
    progress.fail('Usage: bunny stream:video:upload <library> <file> [--title=<...>] [--collection=<id>]');
    return 1;
  }
  progress.start(`Uploading ${args.file} to library ${args.library}`);
  const r = await uploadVideo(args.library, args.file, flags.title, flags.collection);
  progress.succeed(`Uploaded ${r.bytes} bytes (guid=${r.guid}).`);
  return 0;
}
