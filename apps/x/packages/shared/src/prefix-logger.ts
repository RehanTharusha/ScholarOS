// create a PrefixLogger class that wraps console.log with a prefix
// and allows chaining with a parent logger
export class PrefixLogger {
  private prefix: string;
  private parent: PrefixLogger | null;

  constructor(prefix: string, parent: PrefixLogger | null = null) {
    this.prefix = prefix;
    this.parent = parent;
  }

  log(...args: unknown[]) {
    const timestamp = new Date().toISOString();
    const prefix = "[" + this.prefix + "]";

    if (this.parent) {
      this.parent.log(prefix, ...args);
    } else {
      try {
        console.log(timestamp, prefix, ...args);
      } catch (err: unknown) {
        // Ignore EPIPE errors (broken pipe - happens when stdout is closed)
        if (err instanceof Error && "code" in err && err.code === "EPIPE") {
          return;
        }
        throw err;
      }
    }
  }

  child(childPrefix: string): PrefixLogger {
    return new PrefixLogger(childPrefix, this);
  }
}
