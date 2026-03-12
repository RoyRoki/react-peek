import type { BridgeMessage, ComponentInfo, Fiber } from '../core/types';
import {
  getFiberFromElement,
  getFiberFromElementOrAncestor,
  getNearestUserFiber,
  getNearestComponentFiber,
  getParentComponentFiber,
  getFirstChildComponentFiber,
  getNextSiblingComponentFiber,
  getPrevSiblingComponentFiber,
  getComponentPath,
  getDOMElementFromFiber,
  isReactPage,
} from '../core/fiber-resolver';
import { resolveComponentInfo, resolveParentInfo } from '../core/source-resolver';

// Store currently selected fiber for navigation
let currentFiber: Fiber | null = null;

function buildResponse(fiber: Fiber) {
  const info = resolveComponentInfo(fiber);
  const parent = resolveParentInfo(fiber);
  const pathFibers = getComponentPath(fiber);
  const path = pathFibers.map((f) => resolveComponentInfo(f));

  // Get the DOM element for overlay positioning
  const element = getDOMElementFromFiber(fiber);
  const rect = element?.getBoundingClientRect() ?? null;

  return { info, parent, path, rect };
}

function handleInspect(payload: { x: number; y: number }) {
  const element = document.elementFromPoint(payload.x, payload.y);
  if (!element) return null;

  const fiber = getFiberFromElementOrAncestor(element);
  if (!fiber) return null;

  const component = getNearestUserFiber(fiber);
  if (!component) return null;

  currentFiber = component;
  return buildResponse(component);
}

function handleNavigate(payload: { direction: 'up' | 'down' | 'left' | 'right' }) {
  if (!currentFiber) return null;

  let target: Fiber | null = null;
  switch (payload.direction) {
    case 'up':
      target = getParentComponentFiber(currentFiber);
      break;
    case 'down':
      target = getFirstChildComponentFiber(currentFiber);
      break;
    case 'right':
      target = getNextSiblingComponentFiber(currentFiber);
      break;
    case 'left':
      target = getPrevSiblingComponentFiber(currentFiber);
      break;
  }

  if (!target) return null;
  currentFiber = target;
  return buildResponse(target);
}

function handleDetect() {
  const isReact = isReactPage();
  let framework: ComponentInfo['framework'] = 'unknown';

  if (isReact) {
    if (typeof (window as any).__NEXT_DATA__ !== 'undefined' || typeof (window as any).__next_f !== 'undefined') {
      framework = 'nextjs';
    } else if (typeof (window as any).__remixContext !== 'undefined') {
      framework = 'remix';
    } else {
      framework = 'react';
    }
  }

  return { isReact, framework, route: window.location.pathname };
}

// Listen for commands from isolated world
document.addEventListener('__REACTPEEK_CMD__', ((e: CustomEvent<BridgeMessage>) => {
  const msg = e.detail;
  let result: any = null;
  let responseType: BridgeMessage['type'];

  switch (msg.type) {
    case 'REACTPEEK_INSPECT':
      result = handleInspect(msg.payload);
      responseType = 'REACTPEEK_RESULT';
      break;
    case 'REACTPEEK_NAVIGATE':
      result = handleNavigate(msg.payload);
      responseType = 'REACTPEEK_NAV_RESULT';
      break;
    case 'REACTPEEK_DETECT':
      result = handleDetect();
      responseType = 'REACTPEEK_DETECT_RESULT';
      break;
    default:
      return;
  }

  document.dispatchEvent(
    new CustomEvent('__REACTPEEK__', {
      detail: { type: responseType!, payload: result, id: msg.id } satisfies BridgeMessage,
    })
  );
}) as EventListener);

// Signal that main world script is ready
document.dispatchEvent(
  new CustomEvent('__REACTPEEK__', {
    detail: { type: 'REACTPEEK_DETECT_RESULT', payload: { ready: true }, id: 'init' } satisfies BridgeMessage,
  })
);
