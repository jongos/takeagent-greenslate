import { runBoundedWorker } from './worker-runner.js';

export const workerLimits = Object.freeze({ inputBytes: 2 * 1024 * 1024, metadataBytes: 256 * 1024, responseBytes: 4 * 1024 * 1024, timeoutMs: 5000 });

// Fixed worker URL and hard maximums. This entry never imports the XLSX parser
// into the host thread. Lower time/response bounds can be chosen by the host.
export async function previewXlsxIsolated(buffer, metadata, access, { sheetName, now = new Date(), timeoutMs = workerLimits.timeoutMs, responseBytes = workerLimits.responseBytes } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > workerLimits.inputBytes) throw new Error('Input byte limit');
  if (typeof sheetName !== 'string' || !sheetName || sheetName.length > 128 || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid XLSX options');
  // JSON boundary prevents callbacks, prototypes and excess metadata transfer.
  let encoded;
  try { encoded = JSON.stringify({ metadata, access }); } catch { throw new Error('Invalid XLSX metadata'); }
  if (Buffer.byteLength(encoded, 'utf8') > workerLimits.metadataBytes) throw new Error('Metadata byte limit');
  const clean = JSON.parse(encoded);
  return runBoundedWorker(new URL('./xlsx-worker.js', import.meta.url), { bytes: buffer, ...clean, sheetName, now: now.toISOString(), responseBytes }, { timeoutMs, responseBytes });
}
