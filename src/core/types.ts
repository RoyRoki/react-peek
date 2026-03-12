export interface SourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface ComponentInfo {
  name: string;
  source: SourceLocation | null;
  props: Record<string, unknown>;
  isThirdParty: boolean;
  framework: 'react' | 'nextjs' | 'remix' | 'unknown';
  children?: ComponentInfo[];
}

export interface TreePosition {
  current: ComponentInfo;
  parent: ComponentInfo | null;
  path: ComponentInfo[];
}

export interface FormatOptions {
  extended: boolean;
  includeProps: boolean;
  includeTree: boolean;
  route?: string;
}

export interface Fiber {
  tag: number;
  type: any;
  stateNode: any;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedProps: Record<string, unknown>;
  _debugSource?: SourceLocation;
  _debugOwner?: Fiber | null;
  _debugStack?: Error | null;  // React 19+
  _debugTask?: unknown;
  elementType: any;
}

export interface BridgeMessage {
  type:
    | 'REACTPEEK_INSPECT'
    | 'REACTPEEK_RESULT'
    | 'REACTPEEK_NAVIGATE'
    | 'REACTPEEK_NAV_RESULT'
    | 'REACTPEEK_DETECT'
    | 'REACTPEEK_DETECT_RESULT';
  payload: any;
  id: string;
}
