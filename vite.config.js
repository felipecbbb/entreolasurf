import { resolve } from 'path';
import { readdirSync, statSync } from 'fs';

// Auto-discover all index.html files (excluding dist/)
function discoverPages(root) {
  const pages = { main: resolve(root, 'index.html') };
  for (const entry of readdirSync(root)) {
    if (entry === 'dist' || entry === 'node_modules' || entry.startsWith('.')) continue;
    const dir = resolve(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    const html = resolve(dir, 'index.html');
    try {
      statSync(html);
      pages[entry] = html;
    } catch { /* no index.html */ }
  }
  return pages;
}

export default {
  root: '.',
  build: {
    rollupOptions: {
      input: discoverPages(resolve(import.meta.dirname)),
    },
  },
};
