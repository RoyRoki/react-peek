import type { BridgeMessage, ComponentInfo, FormatOptions } from '../core/types';
import { formatForClipboard, formatInfoLabel } from '../core/formatter';

// State
let active = false;
let currentInfo: ComponentInfo | null = null;
let currentParent: ComponentInfo | null = null;
let currentPath: ComponentInfo[] = [];
let currentRect: DOMRect | null = null;
let currentRoute = '';
let showProps = true;
let mainWorldReady = false;
let hovering = false;

// DOM elements
let overlayEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;
let panelEl: HTMLDivElement | null = null;
let containerEl: HTMLDivElement | null = null;

// Throttle
let rafId: number | null = null;

// Bridge: send message to main world, get response
let msgCounter = 0;
const pendingCallbacks = new Map<string, (payload: any) => void>();

function sendToMain(type: BridgeMessage['type'], payload: any): Promise<any> {
  return new Promise((resolve) => {
    const id = `rp_${++msgCounter}`;
    pendingCallbacks.set(id, resolve);
    document.dispatchEvent(
      new CustomEvent('__REACTPEEK_CMD__', {
        detail: { type, payload, id } as BridgeMessage,
      })
    );
    // Timeout fallback
    setTimeout(() => {
      if (pendingCallbacks.has(id)) {
        pendingCallbacks.delete(id);
        resolve(null);
      }
    }, 500);
  });
}

// Listen for responses from main world
document.addEventListener('__REACTPEEK__', ((e: CustomEvent<BridgeMessage>) => {
  const msg = e.detail;
  const cb = pendingCallbacks.get(msg.id);
  if (cb) {
    pendingCallbacks.delete(msg.id);
    cb(msg.payload);
  }
}) as EventListener);

// Inject main world script
function injectMainWorldScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/content-main.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// UI: Create overlay container (Shadow DOM isolated)
function createUI() {
  containerEl = document.createElement('div');
  containerEl.id = '__reactpeek-container';
  containerEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const shadow = containerEl.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .rp-overlay {
      position: fixed;
      pointer-events: none;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      border-radius: 4px;
      transition: all 0.1s ease;
      display: none;
      z-index: 2147483646;
    }
    .rp-overlay.third-party {
      border-color: #9ca3af;
      background: rgba(156, 163, 175, 0.08);
    }
    .rp-overlay.no-source {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
    }
    .rp-label {
      position: fixed;
      background: #1e293b;
      color: #e2e8f0;
      font: 600 11px/1.4 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      display: none;
      z-index: 2147483647;
      max-width: 500px;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .rp-panel {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: #0f172a;
      color: #e2e8f0;
      font: 12px/1.5 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #334155;
      pointer-events: auto;
      display: none;
      z-index: 2147483647;
      max-width: 480px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    }
    .rp-panel-title {
      font-weight: 700;
      font-size: 13px;
      color: #60a5fa;
      margin-bottom: 6px;
    }
    .rp-panel-row {
      color: #94a3b8;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rp-panel-row span {
      color: #e2e8f0;
    }
    .rp-panel-hint {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #1e293b;
      color: #64748b;
      font-size: 10px;
    }
    .rp-panel-hint kbd {
      background: #1e293b;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #334155;
      font-size: 10px;
    }
    .rp-badge {
      position: fixed;
      top: 8px;
      right: 8px;
      background: #3b82f6;
      color: white;
      font: 600 11px/1 system-ui, sans-serif;
      padding: 6px 10px;
      border-radius: 6px;
      z-index: 2147483647;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(59,130,246,0.4);
    }
  `;
  shadow.appendChild(style);

  overlayEl = document.createElement('div');
  overlayEl.className = 'rp-overlay';
  shadow.appendChild(overlayEl);

  labelEl = document.createElement('div');
  labelEl.className = 'rp-label';
  shadow.appendChild(labelEl);

  panelEl = document.createElement('div');
  panelEl.className = 'rp-panel';
  shadow.appendChild(panelEl);

  // Active badge
  const badge = document.createElement('div');
  badge.className = 'rp-badge';
  badge.textContent = 'ReactPeek ON';
  badge.id = 'rp-badge';
  shadow.appendChild(badge);

  document.body.appendChild(containerEl);
}

function destroyUI() {
  containerEl?.remove();
  containerEl = null;
  overlayEl = null;
  labelEl = null;
  panelEl = null;
}

function updateOverlay(rect: DOMRect | null, info: ComponentInfo | null) {
  if (!overlayEl || !labelEl) return;
  if (!rect || !info) {
    overlayEl.style.display = 'none';
    labelEl.style.display = 'none';
    return;
  }

  overlayEl.style.display = 'block';
  overlayEl.style.top = `${rect.top}px`;
  overlayEl.style.left = `${rect.left}px`;
  overlayEl.style.width = `${rect.width}px`;
  overlayEl.style.height = `${rect.height}px`;

  overlayEl.className = 'rp-overlay';
  if (info.isThirdParty) overlayEl.classList.add('third-party');
  else if (!info.source) overlayEl.classList.add('no-source');

  labelEl.style.display = 'block';
  labelEl.textContent = formatInfoLabel(info);
  // Position label above the overlay
  const labelTop = rect.top - 24;
  labelEl.style.top = `${labelTop < 4 ? rect.bottom + 4 : labelTop}px`;
  labelEl.style.left = `${Math.max(4, rect.left)}px`;
}

function updatePanel(info: ComponentInfo | null, parent: ComponentInfo | null, path: ComponentInfo[]) {
  if (!panelEl) return;
  if (!info) {
    panelEl.style.display = 'none';
    return;
  }

  const srcStr = info.source ? `${info.source.fileName}:${info.source.lineNumber}` : 'unavailable';
  const parentStr = parent ? parent.name : 'none';
  const propsStr =
    showProps && Object.keys(info.props).length > 0
      ? Object.entries(info.props)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
          .join(', ')
      : '';
  const treePath = path.map((c) => c.name).join(' > ');

  panelEl.style.display = 'block';
  panelEl.innerHTML = `
    <div class="rp-panel-title">${info.name}</div>
    <div class="rp-panel-row">File: <span>${srcStr}</span></div>
    <div class="rp-panel-row">Parent: <span>${parentStr}</span></div>
    ${propsStr ? `<div class="rp-panel-row">Props: <span>${propsStr}</span></div>` : ''}
    <div class="rp-panel-row">Tree: <span>${treePath}</span></div>
    <div class="rp-panel-hint">
      <kbd>Click</kbd> copy &nbsp;
      <kbd>E</kbd> extended copy &nbsp;
      <kbd>&uarr;&darr;&larr;&rarr;</kbd> navigate &nbsp;
      <kbd>P</kbd> props &nbsp;
      <kbd>Esc</kbd> exit
    </div>
  `;
}

// Event handlers
function onMouseMove(e: MouseEvent) {
  if (!active) return;
  if (rafId) return; // Throttle to 1 per frame

  rafId = requestAnimationFrame(async () => {
    rafId = null;
    const result = await sendToMain('REACTPEEK_INSPECT', { x: e.clientX, y: e.clientY });
    if (!result) return;

    currentInfo = result.info;
    currentParent = result.parent;
    currentPath = result.path;
    currentRect = result.rect;
    currentRoute = window.location.pathname;
    hovering = true;

    updateOverlay(result.rect, result.info);
    updatePanel(result.info, result.parent, result.path);
  });
}

function copyToClipboard(extended: boolean) {
  if (!currentInfo) return;

  const options: FormatOptions = {
    extended,
    includeProps: showProps,
    includeTree: extended,
    route: currentRoute,
  };

  const text = formatForClipboard(currentInfo, currentParent, currentPath, options);
  navigator.clipboard.writeText(text).then(() => {
    // Flash the overlay green
    if (overlayEl) {
      overlayEl.style.borderColor = '#22c55e';
      overlayEl.style.background = 'rgba(34, 197, 94, 0.15)';
      setTimeout(() => {
        if (overlayEl && currentInfo) {
          overlayEl.style.borderColor = '';
          overlayEl.style.background = '';
        }
      }, 300);
    }
    // Flash panel
    if (panelEl) {
      const orig = panelEl.querySelector('.rp-panel-title');
      if (orig) {
        const prevText = orig.textContent;
        orig.textContent = 'Copied!';
        setTimeout(() => {
          if (orig) orig.textContent = prevText;
        }, 800);
      }
    }
  });
}

function onClick(e: MouseEvent) {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  copyToClipboard(false);
}

async function navigate(direction: 'up' | 'down' | 'left' | 'right') {
  const result = await sendToMain('REACTPEEK_NAVIGATE', { direction });
  if (!result) return;

  currentInfo = result.info;
  currentParent = result.parent;
  currentPath = result.path;
  currentRect = result.rect;

  updateOverlay(result.rect, result.info);
  updatePanel(result.info, result.parent, result.path);
}

function onKeyDown(e: KeyboardEvent) {
  if (!active) return;

  switch (e.key) {
    case 'Escape':
      deactivate();
      break;
    case 'ArrowUp':
      e.preventDefault();
      navigate('up');
      break;
    case 'ArrowDown':
      e.preventDefault();
      navigate('down');
      break;
    case 'ArrowLeft':
      e.preventDefault();
      navigate('left');
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigate('right');
      break;
    case 'e':
    case 'E':
      e.preventDefault();
      copyToClipboard(true);
      break;
    case 'p':
    case 'P':
      e.preventDefault();
      showProps = !showProps;
      updatePanel(currentInfo, currentParent, currentPath);
      break;
    case 'Enter':
    case 'c':
    case 'C':
      e.preventDefault();
      copyToClipboard(false);
      break;
  }
}

function activate() {
  if (active) return;
  active = true;
  createUI();
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  // Prevent links/buttons from activating while inspecting
  document.addEventListener('mousedown', blockEvent, true);
  document.addEventListener('mouseup', blockEvent, true);
}

function deactivate() {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('mousedown', blockEvent, true);
  document.removeEventListener('mouseup', blockEvent, true);
  destroyUI();
  currentInfo = null;
  currentParent = null;
  currentPath = [];
  currentRect = null;
}

function blockEvent(e: Event) {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// Listen for toggle from extension popup/shortcut
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REACTPEEK_TOGGLE') {
    if (active) {
      deactivate();
    } else {
      activate();
    }
  }
  if (msg.type === 'REACTPEEK_STATUS') {
    return true; // Will respond asynchronously if needed
  }
});

// Inject the main world script on load
injectMainWorldScript();
