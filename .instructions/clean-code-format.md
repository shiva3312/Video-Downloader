# Clean Code, Formatting & Performance Standards

This module defines coding conventions, TypeScript typing requirements, and performance rules.

---

## 1. TypeScript & Code Style

* **Strict Mode:** Do not use `any` unless strictly interfacing with un-typed external DOM events, and cast immediately.
* **Discriminated Unions for Messages:** All messages between contexts (ISOLATED ↔ MAIN, Popup ↔ Content) must use explicit type signatures:
  ```ts
  export type MainBridgeMessage =
    | { source: 'VD_MAIN'; type: 'PROGRESS'; url: string; percent: number; loadedBytes: number; totalBytes: number | null; speed: number; format: string }
    | { source: 'VD_MAIN'; type: 'RECONNECTING'; url: string; attempt: number }
    | { source: 'VD_MAIN'; type: 'SUCCESS'; url: string }
    | { source: 'VD_MAIN'; type: 'ERROR'; url: string; error: string };
  ```
* **Explicit Guard Checks:** Always verify `event.data?.source` before processing cross-window messages.

---

## 2. React 18 Patterns

* **Functional Components Only:** Use standard React hooks (`useState`, `useEffect`, `useRef`).
* **Safe State Cloning:** Always shallow-copy task records when emitting store updates:
  ```ts
  this.tasks.set(url, { ...task });
  this.notify();
  ```
  This guarantees that React's state comparison detects reference changes and re-renders components reliably.
* **Inline Key Handling:** In lists, never use arbitrary array indices as keys if a unique identifier (`task.url`, `task.id`, `video.src`) exists.

---

## 3. High-Throughput Stream Performance

* **Zero-Copy Arrays:** Collect raw chunks from the `ReadableStream` reader directly into `Uint8Array[]` without intermediate base64 or string encoding:
  ```ts
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  ```
* **UI Progress Throttling:** Network streams can deliver hundreds of chunks per second. **Always throttle progress messages** to ~100ms–150ms intervals (`Date.now() - lastProgressTime >= 150`) to keep the browser UI responsive at 60 FPS while dedicating 99% of CPU time to network throughput.
