/**
 * Turns a token AsyncIterable into a plain-text ReadableStream, defensively.
 *
 * The Claude SDK's stream can throw *after* every real token has already
 * been delivered (a rare stream-end edge case) — in that case a naive
 * `controller.close()` on success followed by an error-path
 * `controller.enqueue()`/`close()` throws "Controller is already closed"
 * uncaught inside the Route Handler, which tears down the response mid-air.
 * Every controller call here is guarded so a second failure never throws.
 */
export function toSafeTextStream(
  source: AsyncIterable<string>,
  label: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true; // consumer/controller already gone
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed — nothing to do */
        }
      };

      try {
        for await (const token of source) {
          if (closed) break;
          safeEnqueue(token);
        }
        safeClose();
      } catch (err) {
        console.error(`${label} stream failed:`, err);
        safeEnqueue(
          `\n\n[zhaksartu error] ${err instanceof Error ? err.message : "stream failed"}`
        );
        safeClose();
      }
    },
  });
}
