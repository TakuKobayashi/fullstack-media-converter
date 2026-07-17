import { ConversionJob, ConversionEngine, ConversionOptions, JobStatus } from '@convertmate/shared';

export type QueueEventType = 'job:start' | 'job:progress' | 'job:done' | 'job:error' | 'queue:done';
export type QueueListener = (event: { type: QueueEventType; job?: ConversionJob }) => void;

/**
 * Concurrency-controlled queue for conversion jobs.
 * Platform-agnostic: works in browser (Web Worker) and Node.js.
 */
export class ConversionQueue {
  private jobs: ConversionJob[] = [];
  private running = 0;
  private listeners: QueueListener[] = [];
  private aborted = false;

  constructor(
    private engine: ConversionEngine,
    public concurrency = 3,
    private options: ConversionOptions = {},
  ) {}

  add(job: ConversionJob): void {
    this.jobs.push({ ...job, status: 'pending', progress: 0 });
  }

  addMany(jobs: ConversionJob[]): void {
    jobs.forEach(j => this.add(j));
  }

  on(listener: QueueListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(type: QueueEventType, job?: ConversionJob) {
    this.listeners.forEach(l => l({ type, job }));
  }

  abort() { this.aborted = true; }

  async run(): Promise<ConversionJob[]> {
    this.aborted = false;
    const pending = [...this.jobs.filter(j => j.status === 'pending')];
    const results: ConversionJob[] = [];

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.aborted) { resolve(); return; }
        while (this.running < this.concurrency && pending.length > 0) {
          const job = pending.shift()!;
          this.running++;
          this.processJob(job).then(done => {
            results.push(done);
            this.running--;
            tick();
            if (pending.length === 0 && this.running === 0) resolve();
          });
        }
        if (pending.length === 0 && this.running === 0) resolve();
      };
      tick();
    });

    this.emit('queue:done');
    return results;
  }

  private async processJob(job: ConversionJob): Promise<ConversionJob> {
    job.status = 'processing';
    job.progress = 0;
    this.emit('job:start', job);
    try {
      const result = await this.engine.convert(job, this.options);
      // Respect the engine's own status — some engines (e.g. BrowserVideoEngine)
      // catch internally and return status: 'error' instead of throwing.
      // Overwriting to 'done' here previously masked every such failure.
      if (result.status === 'error') {
        this.emit('job:error', result);
        return result;
      }
      result.status = 'done';
      result.progress = 100;
      this.emit('job:done', result);
      return result;
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      this.emit('job:error', job);
      return job;
    }
  }

  get snapshot(): ConversionJob[] { return [...this.jobs]; }
  get total(): number { return this.jobs.length; }
  get done(): number { return this.jobs.filter(j => j.status === 'done').length; }
  get errors(): number { return this.jobs.filter(j => j.status === 'error').length; }
}
