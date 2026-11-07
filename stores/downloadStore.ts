export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  title?: string;
  format: string; // e.g. 'MP4', 'MKV', 'WEBM'
  resolution?: string; // e.g. '1080p', '720p'
  thumbnail?: string; // Data URL preview
  status: 'downloading' | 'paused' | 'completed' | 'error';
  isReconnecting?: boolean;
  percent: number;
  loadedBytes: number;
  totalBytes: number | null;
  speed: number; // bytes per second
  errorMessage?: string;
  startedAt: number;
  savedBlob?: Blob;
}

type Listener = () => void;

class DownloadStore {
  private tasks: Map<string, DownloadTask> = new Map();
  private listeners: Set<Listener> = new Set();

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  public getTask(url: string): DownloadTask | undefined {
    return this.tasks.get(url);
  }

  public getActiveCount(): number {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'downloading').length;
  }

  public addTask(
    url: string,
    filename: string,
    resolution?: string,
    format: string = 'MP4',
    title?: string,
    thumbnail?: string
  ): DownloadTask {
    const existing = this.tasks.get(url);
    if (existing && existing.status === 'downloading') {
      return existing;
    }

    const task: DownloadTask = {
      id: url,
      url,
      filename,
      title: title || filename.replace(/\.[a-zA-Z0-9]+$/, ''),
      format: format.toUpperCase(),
      resolution,
      thumbnail: thumbnail || existing?.thumbnail,
      status: 'downloading',
      isReconnecting: false,
      percent: existing?.percent || 0,
      loadedBytes: existing?.loadedBytes || 0,
      totalBytes: existing?.totalBytes || null,
      speed: 0,
      startedAt: existing?.startedAt || Date.now(),
    };

    this.tasks.set(url, task);
    this.notify();
    return task;
  }

  public renameTask(url: string, newFilename: string) {
    const task = this.tasks.get(url);
    if (task) {
      // Ensure extension is retained
      let ext = task.format.toLowerCase();
      if (!newFilename.toLowerCase().endsWith(`.${ext}`)) {
        task.filename = `${newFilename}.${ext}`;
      } else {
        task.filename = newFilename;
      }
      task.title = newFilename.replace(/\.[a-zA-Z0-9]+$/, '');
      this.notify();

      window.postMessage(
        {
          source: 'VD_ISOLATED',
          type: 'RENAME_DOWNLOAD',
          url,
          filename: task.filename,
        },
        '*'
      );
    }
  }

  public updateProgress(
    url: string,
    percent: number,
    loadedBytes: number,
    totalBytes: number | null,
    format?: string,
    speed?: number
  ) {
    const task = this.tasks.get(url);
    if (task) {
      task.percent = percent;
      task.loadedBytes = loadedBytes;
      task.totalBytes = totalBytes;
      task.isReconnecting = false;
      task.status = 'downloading';
      if (format) {
        task.format = format.toUpperCase();
      }
      if (typeof speed === 'number') {
        task.speed = speed;
      }
      this.notify();
    }
  }

  public setReconnecting(url: string, isReconnecting: boolean) {
    const task = this.tasks.get(url);
    if (task && task.status === 'downloading') {
      task.isReconnecting = isReconnecting;
      if (isReconnecting) {
        task.speed = 0;
      }
      this.notify();
    }
  }

  public setCompleted(url: string, blob?: Blob) {
    const task = this.tasks.get(url);
    if (task) {
      task.status = 'completed';
      task.isReconnecting = false;
      task.percent = 100;
      task.speed = 0;
      if (blob) task.savedBlob = blob;
      this.notify();
    }
  }

  public setError(url: string, errorMessage: string) {
    const task = this.tasks.get(url);
    if (task) {
      task.status = 'error';
      task.isReconnecting = false;
      task.errorMessage = errorMessage;
      task.speed = 0;
      this.notify();
    }
  }

  public pauseTask(url: string) {
    const task = this.tasks.get(url);
    if (task && task.status === 'downloading') {
      task.status = 'paused';
      task.isReconnecting = false;
      task.speed = 0;
      this.notify();
      window.postMessage({ source: 'VD_ISOLATED', type: 'PAUSE_DOWNLOAD', url }, '*');
    }
  }

  public resumeTask(url: string) {
    const task = this.tasks.get(url);
    if (task && task.status === 'paused') {
      task.status = 'downloading';
      task.isReconnecting = false;
      this.notify();
      window.postMessage({ source: 'VD_ISOLATED', type: 'RESUME_DOWNLOAD', url }, '*');
    }
  }

  public deleteTask(url: string) {
    window.postMessage({ source: 'VD_ISOLATED', type: 'CANCEL_DOWNLOAD', url }, '*');
    this.tasks.delete(url);
    this.notify();
  }

  public clearCompleted() {
    for (const [url, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'error') {
        this.tasks.delete(url);
      }
    }
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }
}

export const downloadStore = new DownloadStore();
