import { readdirSync } from "node:fs";
import { join } from "node:path";

export function* walk(dir, skipDirs, fileNameRe) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) yield* walk(join(dir, entry.name), skipDirs, fileNameRe);
    } else if (fileNameRe.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}
