import { createMockEl } from './helpers/mockElement';

type TestWindow = typeof globalThis & {
  cancelAnimationFrame?: (handle: number) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
};

const testWindow = globalThis as TestWindow;

function applyCreateOpts(el: ReturnType<typeof createMockEl>, opts?: any) {
  if (!opts) return el;
  if (typeof opts === 'string') {
    el.addClass(opts);
    return el;
  }
  if (opts.cls) el.addClass(opts.cls);
  if (opts.text) el.textContent = opts.text;
  if (opts.attr) {
    for (const [name, value] of Object.entries(opts.attr)) {
      el.setAttribute(name, String(value));
    }
  }
  opts.parent?.appendChild?.(el);
  return el;
}

function hasRealDom(): boolean {
  return typeof document !== 'undefined'
    && typeof document.createElement === 'function'
    && typeof Element !== 'undefined'
    && document.createElement('div') instanceof Element;
}

if (hasRealDom()) {
  const applyDomOpts = (el: Element, opts?: any) => {
    if (!opts) return el;
    if (typeof opts === 'string') {
      el.classList.add(...opts.split(/\s+/).filter(Boolean));
      return el;
    }
    if (opts.cls) {
      el.classList.add(...String(opts.cls).split(/\s+/).filter(Boolean));
    }
    if (opts.text) el.textContent = opts.text;
    if (opts.attr) {
      for (const [name, value] of Object.entries(opts.attr)) {
        el.setAttribute(name, String(value));
      }
    }
    opts.parent?.appendChild?.(el);
    return el;
  };

  (globalThis as any).createDiv = (opts?: unknown) => applyDomOpts(document.createElement('div'), opts);
  (globalThis as any).createSpan = (opts?: unknown) => applyDomOpts(document.createElement('span'), opts);
  (globalThis as any).createEl = (tag: string, opts?: unknown) => applyDomOpts(document.createElement(tag), opts);
  (globalThis as any).createSvg = (tag: string, opts?: unknown) =>
    applyDomOpts(document.createElementNS('http://www.w3.org/2000/svg', tag), opts);
  (globalThis as any).createFragment = () => document.createDocumentFragment();
} else {
  (globalThis as any).createDiv = (opts?: unknown) => applyCreateOpts(createMockEl('div'), opts);
  (globalThis as any).createSpan = (opts?: unknown) => applyCreateOpts(createMockEl('span'), opts);
  (globalThis as any).createEl = (tag: string, opts?: unknown) => applyCreateOpts(createMockEl(tag), opts);
  (globalThis as any).createSvg = (tag: string, opts?: unknown) => applyCreateOpts(createMockEl(tag), opts);
  (globalThis as any).createFragment = () => {
    const children: unknown[] = [];
    return {
      appendChild(child: unknown) {
        children.push(child);
        return child;
      },
      insertBefore(el: unknown) {
        children.unshift(el);
      },
      get firstChild() {
        return children[0] ?? null;
      },
    };
  };
}

if (!testWindow.requestAnimationFrame) {
  testWindow.requestAnimationFrame = (callback: FrameRequestCallback): number => (
    Number(setTimeout(() => callback(Date.now()), 0))
  );
}

if (!testWindow.cancelAnimationFrame) {
  testWindow.cancelAnimationFrame = (handle: number): void => {
    clearTimeout(handle);
  };
}

if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
    writable: true,
  });
}
