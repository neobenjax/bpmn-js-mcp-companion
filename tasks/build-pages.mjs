import fs from 'node:fs';
import path from 'node:path';
import cp from 'cpy';
import { deleteAsync as del } from 'del';

const siteDir = '_site';

async function run() {
  if (!fs.existsSync('dist/bpmn-modeler.production.min.js')) {
    throw new Error('dist/ not found. Run "npm run distro" first.');
  }

  console.log(`Cleaning ${siteDir}...`);
  await del(siteDir);
  fs.mkdirSync(siteDir, { recursive: true });

  console.log(`Copying app/** to ${siteDir}/`);
  await cp('app/**', siteDir);

  console.log(`Copying dist/** to ${siteDir}/dist/`);
  await cp('dist/**', path.join(siteDir, 'dist'));

  // Disable Jekyll processing on GitHub Pages
  fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');

  console.log('GitHub Pages bundle ready in _site/');
}

run().catch((err) => {
  console.error('Failed to build pages bundle:', err);
  process.exit(1);
});
