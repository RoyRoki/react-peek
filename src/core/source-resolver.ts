import type { Fiber, ComponentInfo, SourceLocation } from './types';
import { getParentComponentFiber } from './fiber-resolver';

// ─── Component name ──────────────────────────────────────────────────────────

export function getComponentName(fiber: Fiber): string {
  const type = fiber.type;
  if (!type) return 'Unknown';
  if (typeof type === 'string') return type;
  if (type.displayName) return type.displayName;
  if (type.name) return type.name;
  if (type.render?.displayName) return type.render.displayName;
  if (type.render?.name) return type.render.name;
  if (type.type?.displayName) return type.type.displayName;
  if (type.type?.name) return type.type.name;
  return 'Anonymous';
}

// ─── Stack frame parsing ──────────────────────────────────────────────────────

interface StackFrame {
  name: string;
  location: string;
  lineNum: number;
  colNum?: number;
}

const RUNTIME_SKIP_PATTERNS = [
  'react_jsx-dev-runtime',
  'react_jsx-runtime',
  'react-dom_client',
  '/react-dom/',
  '/react/',
  'node_modules/react',
  'node_modules/react-dom',
  '.vite/deps/chunk-',
  'webpack/bootstrap',
  '(webpack)',
];

function isRuntimeFrame(location: string): boolean {
  return RUNTIME_SKIP_PATTERNS.some((p) => location.includes(p));
}

function parseStackFrame(line: string): StackFrame | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('at ')) return null;
  // "at Name (loc:line:col)"
  const withName = trimmed.match(/^at\s+(\S+)\s+\((.+):(\d+):(\d+)\)$/);
  if (withName) {
    return { name: withName[1], location: withName[2], lineNum: +withName[3], colNum: +withName[4] };
  }
  // "at loc:line:col"
  const noName = trimmed.match(/^at\s+(.+):(\d+):(\d+)$/);
  if (noName) {
    return { name: '', location: noName[1], lineNum: +noName[2], colNum: +noName[3] };
  }
  return null;
}

function cleanPath(location: string): string {
  // webpack-internal:///(app-pages-browser)/./src/... → src/...
  const wp = location.match(/webpack-internal:\/\/\/[^/]*\/\.\/(.*)/);
  if (wp) return wp[1];

  // http://localhost:PORT/src/... → src/...
  const http = location.match(/https?:\/\/[^/]+\/(.*)/);
  if (http) {
    // strip query (?v=xxx&t=xxx)
    return http[1].replace(/\?.*$/, '');
  }

  // Absolute path → try to extract project-relative
  if (location.startsWith('/') && !location.includes('node_modules')) {
    const rel = location.match(/\/(src|app|pages|components|lib|utils|hooks|features|stores)\/.*/);
    if (rel) return rel[0].slice(1);
  }

  return location;
}

function isUsableFrame(frame: StackFrame): boolean {
  if (isRuntimeFrame(frame.location)) return false;
  const cleaned = cleanPath(frame.location);
  if (cleaned.includes('node_modules')) return false;
  if (cleaned.includes('.vite/deps')) return false;
  if (cleaned.includes('chunk-')) return false;
  // Must look like a source file
  return /\.(tsx?|jsx?|mjs|cjs)/.test(cleaned);
}

function findFrameInStack(stackStr: string, componentName: string): SourceLocation | null {
  const lines = stackStr.split('\n');
  let firstGood: SourceLocation | null = null;

  for (const line of lines) {
    const frame = parseStackFrame(line);
    if (!frame || !isUsableFrame(frame)) continue;

    const fileName = cleanPath(frame.location);

    // Prefer frame whose function name matches the component
    if (frame.name === componentName || frame.name.endsWith(`.${componentName}`)) {
      return { fileName, lineNumber: frame.lineNum, columnNumber: frame.colNum };
    }

    if (!firstGood) firstGood = { fileName, lineNumber: frame.lineNum, columnNumber: frame.colNum };
  }

  return firstGood;
}

// ─── Source strategies ────────────────────────────────────────────────────────

function resolveFromDebugSource(fiber: Fiber): SourceLocation | null {
  if (!(fiber as any)._debugSource) return null;
  const s = (fiber as any)._debugSource;
  return { fileName: s.fileName, lineNumber: s.lineNumber, columnNumber: s.columnNumber };
}

function resolveFromInspectorAttrs(fiber: Fiber): SourceLocation | null {
  let el: Element | null = null;
  if (fiber.stateNode instanceof Element) el = fiber.stateNode;
  else if (fiber.child?.stateNode instanceof Element) el = fiber.child.stateNode;
  if (!el) return null;

  const path = el.getAttribute('data-inspector-relative-path');
  const line = el.getAttribute('data-inspector-line');
  const col = el.getAttribute('data-inspector-column');
  if (path && line) {
    return { fileName: path, lineNumber: +line, columnNumber: col ? +col : undefined };
  }
  return null;
}

/**
 * React 19 + Vite strategy:
 * The fiber's _debugStack points to where THIS component was *used* (in the parent).
 * But children created INSIDE this component's render have a _debugStack that includes
 * a frame from THIS component's file. Walk up to 4 child levels to find it.
 */
function resolveFromChildStack(fiber: Fiber, componentName: string): SourceLocation | null {
  let child = fiber.child;
  let depth = 0;
  while (child && depth < 4) {
    const stack = (child as any)._debugStack;
    if (stack?.stack) {
      const result = findFrameInStack(stack.stack as string, componentName);
      if (result) return result;
    }
    child = child.child;
    depth++;
  }
  return null;
}

/** Fallback: parse the fiber's own _debugStack (points to parent, less accurate) */
function resolveFromOwnStack(fiber: Fiber, componentName: string): SourceLocation | null {
  const stack = (fiber as any)._debugStack;
  if (!stack?.stack) return null;
  return findFrameInStack(stack.stack as string, componentName);
}

function resolveFromOwnerChain(fiber: Fiber): SourceLocation | null {
  let owner = (fiber as any)._debugOwner;
  while (owner) {
    const s = resolveFromDebugSource(owner);
    if (s) return s;
    owner = owner._debugOwner;
  }
  return null;
}

function resolveSource(fiber: Fiber, componentName: string): SourceLocation | null {
  // 1. _debugSource (React ≤18)
  const s1 = resolveFromDebugSource(fiber);
  if (s1) return s1;

  // 2. data-inspector-* (React 19 + babel plugin)
  const s2 = resolveFromInspectorAttrs(fiber);
  if (s2) return s2;

  // 3. Child _debugStack (React 19 + Vite — most reliable for component definition)
  const s3 = resolveFromChildStack(fiber, componentName);
  if (s3) return s3;

  // 4. Own _debugStack (points to usage site, not definition — less accurate)
  const s4 = resolveFromOwnStack(fiber, componentName);
  if (s4) return s4;

  // 5. _debugOwner chain
  const s5 = resolveFromOwnerChain(fiber);
  if (s5) return s5;

  return null;
}

// ─── Props serialization ──────────────────────────────────────────────────────

function safeStringify(value: unknown, seen = new WeakSet()): string {
  if (value === null) return 'null';
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  if (Array.isArray(value)) {
    const items = value.slice(0, 3).map((v) => safeStringify(v, seen));
    return `[${items.join(', ')}${value.length > 3 ? ', ...' : ''}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 4);
  const parts = entries.map(([k, v]) => `${k}: ${safeStringify(v, seen)}`);
  const extra = Object.keys(value as object).length > 4 ? ', ...' : '';
  return `{ ${parts.join(', ')}${extra} }`;
}

const SKIP_PROPS = new Set([
  'children', 'key', 'ref',
  'className', 'style', 'wrapperStyle',
  'chartWidth', 'chartHeight', 'margin', 'width', 'height',
  'payload', // recharts data arrays — massive noise
]);

function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (SKIP_PROPS.has(key)) continue;
    if (typeof value === 'function') {
      result[key] = '[Function]';
    } else if (typeof value === 'object' && value !== null) {
      if ((value as any).$$typeof) {
        const name = (value as any).type?.displayName || (value as any).type?.name || 'Component';
        result[key] = `<${name} />`;
      } else {
        result[key] = safeStringify(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Framework detection ──────────────────────────────────────────────────────

function detectFramework(): ComponentInfo['framework'] {
  if ((window as any).__NEXT_DATA__ !== undefined || (window as any).__next_f !== undefined) return 'nextjs';
  if ((window as any).__remixContext !== undefined) return 'remix';
  return 'react';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function resolveComponentInfo(fiber: Fiber): ComponentInfo {
  const name = getComponentName(fiber);
  const source = resolveSource(fiber, name);
  const props = fiber.memoizedProps ? serializeProps(fiber.memoizedProps as Record<string, unknown>) : {};
  const isThirdParty = source?.fileName.includes('node_modules') || source?.fileName.includes('.vite/deps') || false;
  const framework = detectFramework();
  return { name, source, props, isThirdParty, framework };
}

export function resolveParentInfo(fiber: Fiber): ComponentInfo | null {
  const parent = getParentComponentFiber(fiber);
  if (!parent) return null;
  return resolveComponentInfo(parent);
}
