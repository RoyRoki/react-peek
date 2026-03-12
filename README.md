# ReactPeek

**Click any React component → copy its source location for AI agent prompts.**

The missing bridge between your browser and your AI coding agent. Stop screenshotting UI — just click the component and paste the context.

## The Problem

When doing UI fixes with AI agents (Claude Code, Cursor, Copilot), you:
1. See a UI issue in the browser
2. Take a screenshot
3. Paste it to your agent
4. Agent guesses which file/component you mean
5. Sometimes gets it wrong → wasted tokens, wasted time

## The Solution

1. Press `Cmd+Shift+X` (or click the extension icon)
2. Hover over any component — see its name, file, and line number
3. Click to copy — perfectly formatted for AI agent prompts
4. Paste into your agent — it knows exactly where to look

### What gets copied:

```
// Component: ButtonGroup
// File: src/components/ui/ButtonGroup.tsx:42
// Parent: HeaderActions (src/components/layout/Header.tsx:18)
// Props: { variant: "primary", size: "lg" }
```

## Install (Open Source)

Since this is an open-source project (no Chrome Web Store), you can install it manually:

### Option 1: Load Unpacked Extension

1. Clone this repo:
   ```bash
   git clone https://github.com/RoyRoki/react-peek.git
   cd react-peek
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions`

4. Enable "Developer mode" (top right corner)

5. Click "Load unpacked" → select the `build/` folder

6. Navigate to your React app on `localhost`

### Option 2: Download Release

Download the latest `react-peek.zip` from the [Releases](https://github.com/RoyRoki/react-peek/releases) page:

1. Go to [Releases](https://github.com/RoyRoki/react-peek/releases)
2. Download `react-peek.zip`
3. Extract the zip file
4. In Chrome, go to `chrome://extensions`
5. Enable "Developer mode"
6. Click "Load unpacked" → select the extracted folder

## Usage

| Action | Key |
|--------|-----|
| Toggle inspector | `Cmd+Shift+X` |
| Navigate to parent | `↑` |
| Navigate to child | `↓` |
| Navigate siblings | `← →` |
| Copy (standard) | `Click` or `C` |
| Copy (extended) | `E` |
| Toggle props | `P` |
| Exit | `Esc` |

## How It Works

ReactPeek reads React's internal Fiber tree (available in development mode) to find the component that rendered each DOM element. It extracts:

- **Component name** from `fiber.type.name` or `displayName`
- **Source file + line** from `fiber._debugSource` (React ≤18) or `data-inspector-*` attributes (React 19+)
- **Props** from `fiber.memoizedProps`
- **Component tree** by walking `fiber.return`

### React 19 Note

React 19 removed `_debugSource` from Fiber nodes. ReactPeek will still show component names and tree structure, but for file paths you'll need [`@react-dev-inspector/babel-plugin`](https://react-dev-inspector.zthxxx.me/docs/compiler-plugin).

## Requirements

- Chrome browser
- React app running in **development mode** on localhost
- React 16+ supported

### Next.js 16 + Turbopack Note

Next.js 16 uses **Turbopack** by default, which doesn't provide proper source maps for component file paths. You'll see file paths like `// File: _next/static/chunks/turbopack-*.js` instead of actual source files.

**Solution:** Use webpack instead of Turbopack:

```bash
# In your Next.js project's package.json
"dev": "next dev --webpack"
```

Or set the environment variable:
```bash
NEXT_TURBOPACK=false next dev
```

This ensures ReactPeek can correctly identify component source files.

## Tech Stack

- TypeScript (strict mode)
- esbuild (bundler)
- Chrome Extension Manifest V3
- Zero runtime dependencies

## License

MIT
