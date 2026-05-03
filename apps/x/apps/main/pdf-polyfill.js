/**
 * Polyfill for browser APIs that pdfjs-dist requires in Node.js environment.
 * This file is injected by esbuild during bundling.
 */

// DOMMatrix polyfill
if (typeof globalThis.DOMMatrix === "undefined") {
  try {
    // Try to load the recommended package and be resilient to different export shapes
    const pkg = require("@thednp/dommatrix");
    const Candidate = pkg && (pkg.DOMMatrix || pkg.default || pkg);

    if (typeof Candidate === "function") {
      // Direct constructor/class
      globalThis.DOMMatrix = Candidate;
    } else if (
      Candidate &&
      typeof Candidate === "object" &&
      typeof Candidate.DOMMatrix === "function"
    ) {
      // Named export nested on the package
      globalThis.DOMMatrix = Candidate.DOMMatrix;
    } else {
      throw new Error("@thednp/dommatrix did not export a constructor");
    }
  } catch (e) {
    console.warn(
      "DOMMatrix: failed to load @thednp/dommatrix, using JS fallback –",
      e && e.message,
    );
    // Fallback minimal DOMMatrix implementation (sufficient for pdfjs transforms)
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
        if (init) {
          if (typeof init === "string") {
            const matches = init.match(/matrix\(([^)]+)\)/);
            if (matches) {
              const values = matches[1].split(",").map(Number);
              [this.a, this.b, this.c, this.d, this.e, this.f] = values;
            }
          } else if (Array.isArray(init)) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          } else if (init && typeof init === "object") {
            // support plain object
            this.a = init.a ?? this.a;
            this.b = init.b ?? this.b;
            this.c = init.c ?? this.c;
            this.d = init.d ?? this.d;
            this.e = init.e ?? this.e;
            this.f = init.f ?? this.f;
          }
        }
      }
      static fromMatrix(init) {
        return new DOMMatrix(init);
      }
      multiply(other) {
        // basic 2D matrix multiply (this * other)
        const a = this.a * other.a + this.c * other.b;
        const b = this.b * other.a + this.d * other.b;
        const c = this.a * other.c + this.c * other.d;
        const d = this.b * other.c + this.d * other.d;
        const e = this.a * other.e + this.c * other.f + this.e;
        const f = this.b * other.e + this.d * other.f + this.f;
        return new DOMMatrix([a, b, c, d, e, f]);
      }
    };
  }
}

// DOMPoint polyfill
if (typeof globalThis.DOMPoint === "undefined") {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
    static fromPoint(other) {
      return new DOMPoint(other.x, other.y, other.z, other.w);
    }
  };
}

// DOMRect polyfill
if (typeof globalThis.DOMRect === "undefined") {
  globalThis.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.right = x + width;
      this.bottom = y + height;
      this.left = x;
    }
    static fromRect(other) {
      return new DOMRect(other.x, other.y, other.width, other.height);
    }
  };
}

// window polyfill (minimal)
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

// document polyfill (minimal)
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    currentScript: null,
    createElement: () => ({}),
    getElementsByTagName: () => [],
  };
}

console.log("✅ PDF polyfills injected");
