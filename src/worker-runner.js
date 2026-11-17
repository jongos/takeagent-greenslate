import { Worker } from 'node:worker_threads';

// Internal primitive. Public callers must use the fixed XLSX worker entry.
export function runBoundedWorker(url, workerData, { timeoutMs = 5000, responseBytes = 4 * 1024 * 1024 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000 || !Number.isInteger(responseBytes) || responseBytes < 1 || responseBytes > 4 * 1024 * 1024) return Promise.reject(new Error('Invalid worker limits'));
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(url, { workerData, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 }, stdout: true, stderr: true }); }
    catch { reject(new Error('XLSX worker could not start')); return; }
    // Do not expose parser output or source data through logs.
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = async (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try { await worker.terminate(); } catch { /* already terminated */ }
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('XLSX worker timed out')), timeoutMs);
    worker.once('error', () => finish(new Error('XLSX worker failed')));
    worker.once('exit', () => { if (!settled) finish(new Error('XLSX worker exited without a result')); });
    worker.once('message', message => {
      if (!message || message.ok !== true || typeof message.json !== 'string') return finish(new Error('XLSX preview rejected'));
      if (Buffer.byteLength(message.json, 'utf8') > responseBytes) return finish(new Error('XLSX response exceeds limit'));
      try { finish(null, JSON.parse(message.json)); } catch { finish(new Error('Invalid XLSX worker response')); }
    });
  });
}
