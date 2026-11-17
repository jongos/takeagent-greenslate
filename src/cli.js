import { readFile } from 'node:fs/promises';
import { preview } from './adapter.js';
const [path, tenantId, projectId] = process.argv.slice(2);
if (!path || !tenantId || !projectId) { console.error('Usage: npm run preview -- report.json tenant-id project-id'); process.exitCode = 1; }
else {
  try { console.log(JSON.stringify(preview(JSON.parse(await readFile(path, 'utf8')), { tenantId, projectId }), null, 2)); }
  catch { console.error('Preview rejected. Validate profile, access, selected columns, metadata and source totals.'); process.exitCode = 1; }
}
