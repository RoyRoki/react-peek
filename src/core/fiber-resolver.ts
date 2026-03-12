import type { Fiber } from './types';

const FIBER_KEY_PREFIX = '__reactFiber$';
const INTERNAL_KEY_PREFIX = '__reactInternalInstance$';
const PROPS_KEY_PREFIX = '__reactProps$';

export function getFiberKey(element: Element): string | null {
  const keys = Object.keys(element);
  for (const key of keys) {
    if (key.startsWith(FIBER_KEY_PREFIX) || key.startsWith(INTERNAL_KEY_PREFIX)) {
      return key;
    }
  }
  return null;
}

export function getFiberFromElement(element: Element): Fiber | null {
  const key = getFiberKey(element);
  if (!key) return null;
  return (element as any)[key] as Fiber | null;
}

/**
 * Walk up the DOM tree until we find an element with a React fiber attached.
 * Many leaf nodes (SVGs, spans, text wrappers) don't have fibers directly —
 * the fiber lives on a parent container element.
 */
export function getFiberFromElementOrAncestor(element: Element): Fiber | null {
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const fiber = getFiberFromElement(current);
    if (fiber) return fiber;
    current = current.parentElement;
  }
  return null;
}

export function getPropsFromElement(element: Element): Record<string, unknown> | null {
  const keys = Object.keys(element);
  for (const key of keys) {
    if (key.startsWith(PROPS_KEY_PREFIX)) {
      return (element as any)[key];
    }
  }
  return null;
}

export function isUserComponent(fiber: Fiber): boolean {
  return typeof fiber.type === 'function' || (typeof fiber.type === 'object' && fiber.type !== null);
}

function getFiberSourceFile(fiber: Fiber): string {
  if ((fiber as any)._debugSource?.fileName) return (fiber as any)._debugSource.fileName;
  const stack = (fiber as any)._debugStack;
  if (stack?.stack) {
    const line = (stack.stack as string).split('\n').find((l) => l.includes('at ') && !l.includes('node_modules/react'));
    if (line) return line;
  }
  return '';
}

export function isThirdPartyFiber(fiber: Fiber): boolean {
  const src = getFiberSourceFile(fiber);
  if (!src) return false;
  return src.includes('node_modules') || src.includes('.vite/deps') || src.includes('chunk-');
}

// Exact names that are always noise
const NOISY_EXACT = new Set([
  '', 'Anonymous',
  // React internals
  'Suspense', 'SuspenseList', 'Profiler', 'StrictMode', 'Fragment',
  // React Router
  'BrowserRouter', 'HashRouter', 'MemoryRouter', 'StaticRouter',
  'Router', 'Routes', 'Route', 'Outlet', 'Navigate', 'NavLink', 'Link',
  'RenderedRoute', 'Navigation', 'Location',
  // Generic React patterns
  'Provider', 'Consumer', 'ForwardRef', 'Memo',
  // Recharts internals visible in the wild
  'CartesianChart2', 'RechartsStoreProvider', 'CartesianChartRoot',
  'ResponsiveContainerContextProvider', 'AllZIndexPortals', 'ClipPathProvider',
  'LegendContent', 'DefaultLegendContent', 'Items',
]);

// Suffix/prefix patterns that indicate library wrappers
const NOISY_PATTERNS = [
  /Provider$/, /Consumer$/, /Context$/, /Store$/,
  /Portal$/, /Boundary$/, /Wrapper$/,
  /^Recharts/, /^Cartesian/, /^Responsive/, /^ClipPath/, /^AllZ/,
];

export function isNoisyComponent(fiber: Fiber): boolean {
  // Get the real name from the fiber type (not the display name we compute)
  const rawName: string =
    fiber.type?.name ||
    fiber.type?.displayName ||
    fiber.type?.render?.name ||
    fiber.type?.render?.displayName ||
    fiber.type?.type?.name ||
    '';

  if (NOISY_EXACT.has(rawName)) return true;
  if (NOISY_PATTERNS.some((p) => p.test(rawName))) return true;
  if (isThirdPartyFiber(fiber)) return true;
  return false;
}

export function getNearestComponentFiber(fiber: Fiber): Fiber | null {
  let current: Fiber | null = fiber;
  while (current) {
    if (isUserComponent(current)) {
      return current;
    }
    current = current.return;
  }
  return null;
}

/** Find the nearest user-space (non-library) component fiber. */
export function getNearestUserFiber(fiber: Fiber): Fiber | null {
  let current: Fiber | null = fiber;
  while (current) {
    if (isUserComponent(current) && !isNoisyComponent(current)) {
      return current;
    }
    current = current.return;
  }
  // Fallback: just return nearest component even if noisy
  return getNearestComponentFiber(fiber);
}

export function getParentComponentFiber(fiber: Fiber): Fiber | null {
  let current = fiber.return;
  while (current) {
    if (isUserComponent(current)) {
      return current;
    }
    current = current.return;
  }
  return null;
}

export function getFirstChildComponentFiber(fiber: Fiber): Fiber | null {
  let current = fiber.child;
  while (current) {
    if (isUserComponent(current)) {
      return current;
    }
    const deeper = getFirstChildComponentFiber(current);
    if (deeper) return deeper;
    current = current.sibling;
  }
  return null;
}

export function getNextSiblingComponentFiber(fiber: Fiber): Fiber | null {
  const parent = fiber.return;
  if (!parent) return null;

  let foundSelf = false;
  let current = parent.child;
  while (current) {
    if (current === fiber) {
      foundSelf = true;
    } else if (foundSelf) {
      if (isUserComponent(current)) return current;
      const child = getNearestComponentFiber(current);
      if (child && child !== fiber) return child;
    }
    current = current.sibling;
  }
  return null;
}

export function getPrevSiblingComponentFiber(fiber: Fiber): Fiber | null {
  const parent = fiber.return;
  if (!parent) return null;

  let prev: Fiber | null = null;
  let current = parent.child;
  while (current) {
    if (current === fiber) {
      return prev;
    }
    if (isUserComponent(current)) {
      prev = current;
    }
    current = current.sibling;
  }
  return null;
}

export function getDOMElementFromFiber(fiber: Fiber): Element | null {
  if (fiber.stateNode instanceof Element) {
    return fiber.stateNode;
  }
  let child = fiber.child;
  while (child) {
    if (child.stateNode instanceof Element) {
      return child.stateNode;
    }
    if (child.child) {
      const result = getDOMElementFromFiber(child);
      if (result) return result;
    }
    child = child.sibling;
  }
  return null;
}

export function isReactPage(): boolean {
  const body = document.body;
  if (!body) return false;
  const firstElement = body.firstElementChild;
  if (!firstElement) return false;
  return getFiberKey(firstElement) !== null || getFiberKey(body) !== null;
}

export function getComponentPath(fiber: Fiber): Fiber[] {
  const path: Fiber[] = [];
  let current: Fiber | null = fiber;
  while (current) {
    if (isUserComponent(current) && !isNoisyComponent(current)) {
      path.unshift(current);
    }
    current = current.return;
  }
  // Keep at most 8 levels — trim from the root end, always keep leaf
  if (path.length > 8) {
    return [...path.slice(0, 3), ...path.slice(path.length - 5)];
  }
  return path;
}
