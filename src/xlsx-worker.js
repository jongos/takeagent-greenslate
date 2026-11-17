import { parentPort, workerData } from 'node:worker_threads';
import { previewXlsx } from './xlsx-internal.js';

try {
  const { bytes, metadata, access, sheetName, now, responseBytes } = workerData;
  const result = await previewXlsx(Buffer.from(bytes), metadata, access, { sheetName, now: new Date(now) });
  const json = JSON.stringify(result);
  if (Buffer.byteLength(json, 'utf8') > responseBytes) throw new Error('Response limit');
  parentPort.postMessage({ ok: true, json });
} catch {
  parentPort.postMessage({ ok: false });
}
