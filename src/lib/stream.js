export async function* readDataLines(body, sse = true, signal) {
  const reader = body.getReader();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let data = [];
  const lineData = (line) => {
    if (!sse) return line || undefined;
    if (line === "") { const event = data.length ? data.join("\n") : undefined; data = []; return event; }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    return undefined;
  };
  try {
    signal?.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1);
        const result = lineData(line); if (result !== undefined) yield result;
      }
      if (done) break;
    }
    if (buffer) { const result = lineData(buffer.replace(/\r$/, "")); if (result !== undefined) yield result; }
    if (sse && data.length) yield data.join("\n");
  } finally { signal?.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
