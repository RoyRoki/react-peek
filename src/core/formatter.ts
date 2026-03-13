import type { ComponentInfo, FormatOptions } from './types';

function formatSource(info: ComponentInfo): string | null {
  if (!info.source) return null;
  const col = info.source.columnNumber ? `:${info.source.columnNumber}` : '';
  return `${info.source.fileName}:${info.source.lineNumber}${col}`;
}

function formatPropValue(v: unknown): string {
  if (typeof v === 'string') {
    // Already serialized by safeStringify (e.g. "[Function]", "{ ... }") — don't double-quote
    if (v.startsWith('[') || v.startsWith('{') || v.startsWith('<')) return v;
    return `"${v}"`;
  }
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  return String(v);
}

function formatProps(props: Record<string, unknown>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  // Skip noisy layout/style props for brevity
  const SKIP = new Set(['className', 'style', 'wrapperStyle', 'chartWidth', 'chartHeight', 'margin', 'width', 'height']);
  const filtered = entries.filter(([k]) => !SKIP.has(k));
  const show = filtered.length > 0 ? filtered : entries.slice(0, 4);
  const parts = show.slice(0, 6).map(([k, v]) => `${k}: ${formatPropValue(v)}`);
  const suffix = show.length > 6 ? ', ...' : '';
  return `{ ${parts.join(', ')}${suffix} }`;
}

export function formatForClipboard(
  info: ComponentInfo,
  parent: ComponentInfo | null,
  path: ComponentInfo[],
  options: FormatOptions
): string {
  const lines: string[] = [];

  const sourceStr = formatSource(info);

  let treeHierarchy = '';
  if (path.length > 1) {
    let treeNames = path.map((c) => c.name);
    if (treeNames.length === 8) {
      treeNames = [...treeNames.slice(0, 3), '...', ...treeNames.slice(3)];
    }
    treeHierarchy = treeNames.join(' > ');
  }

  lines.push('### Component Metadata');
  
  lines.push(`- **Name:** \`${info.name}\``);

  if (info.framework && info.framework !== 'unknown') {
    lines.push(`- **Type:** ${info.framework === 'nextjs' ? 'Next.js' : info.framework === 'remix' ? 'Remix' : 'React'} Component`);
  }

  if (sourceStr) {
    lines.push(`- **File Path:** \`${sourceStr}\``);
  }

  if (parent) {
    lines.push(`- **Parent:** ${parent.name}`);
  }

  if (treeHierarchy) {
    lines.push(`- **Hierarchy:** ${treeHierarchy}`);
  }

  if (options.includeProps && Object.keys(info.props).length > 0) {
    lines.push(`- **Props:** ${formatProps(info.props)}`);
  }

  if (options.extended) {
    if (options.route) {
      lines.push(`- **Route:** ${options.route}`);
    }
    if (options.windowSize) {
      const { width, height } = options.windowSize;
      const viewType = width >= 768 ? 'Desktop' : 'Mobile';
      lines.push(`- **View:** ${width}x${height} (${viewType})`);
    }
    if (info.isThirdParty) {
      lines.push(`- **Note:** Third-party component`);
    }
  }

  return lines.join('\n');
}

export function formatInfoLabel(info: ComponentInfo): string {
  const src = info.source ? formatSource(info) : 'no source';
  return `${info.name} — ${src}`;
}
