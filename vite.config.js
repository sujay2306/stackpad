import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';

// Fills public/sw.js (as copied into the build) with a precache list and a content version,
// so the service worker caches the app shell and every built asset for offline use.
function swPrecache() {
  let outDir;
  return {
    name: 'stackpad-sw-precache',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const walk = (dir) => readdirSync(dir, { withFileTypes: true })
        .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
      const files = walk(outDir)
        .map((f) => '/' + relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== '/sw.js' && !f.endsWith('.map') && !f.startsWith('/.'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = readFileSync(swPath, 'utf8')
        .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({ build: { chunkSizeWarningLimit: 800 }, plugins: [swPrecache()] });
