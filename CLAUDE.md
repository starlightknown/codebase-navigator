# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build
npm run lint      # Run ESLint
npx vitest        # Run all tests
npx vitest run src/lib/__tests__/analyzer.test.ts  # Run a single test file
```

## Environment Variables

The app runs without env vars (defaults to local Ollama). Override via `.env` or shell:

```
GITHUB_TOKEN       # Optional — raises GitHub API rate limits
OPENAI_BASE_URL    # LLM endpoint (default: http://localhost:11434/v1)
OPENAI_API_KEY     # LLM API key (default: "ollama")
OPENAI_MODEL       # Model name (default: "qwen2.5")
```

## Architecture

Single Next.js 16 app (no separate frontend/backend repos). Key layers:

### API Routes (`src/app/api/`)
- `/api/github/tree` — Fetches repo file tree via Octokit (keeps GitHub token server-side)
- `/api/github/file` — Fetches individual file contents (proxied to avoid CORS/auth)
- `/api/github/search` — Code search endpoint
- `/api/copilotkit` — CopilotKit runtime endpoint (bi-directional AI communication)
- `/api/settings` — Persists LLM settings to cookies for SSR access

### State Management (`src/store/`)
- `useAppStore` — Central store: repo data, analysis results, visualization nodes/edges, code viewer state
- `useSettingsStore` — LLM provider config, synced to both localStorage and server cookies

### AI Integration (`src/hooks/useCopilotActions.ts`)
Four frontend tools registered with Zod schemas drive all AI interactions:
1. `analyzeRepository` — Finds relevant files, extracts imports, builds dependency graph, updates store
2. `fetchFileContent` — Opens file in code viewer
3. `generateFlowDiagram` — Creates focused visualizations
4. `highlightCode` — Shows file with highlighted lines + explanation

When a user asks the AI a question, the AI calls these tools, which fetch data from `/api/github/*`, update Zustand, and all four panels react automatically.

### Visualization (`src/components/flow/`, `src/lib/graph-layout.ts`)
- React Flow (`@xyflow/react`) renders the dependency graph
- Dagre computes automatic hierarchical layout
- Custom node types: `ModuleNode`, `FunctionNode`, `FileNode`
- Node color convention: blue = modules/services, teal = functions, gray = files

### Code Analysis (`src/lib/analyzer.ts`)
- Extracts ES6 + CommonJS imports/exports from raw source text
- Resolves relative paths, `@/` aliases, and index files
- Categorizes files into architecture layers (auth, API, database, config, testing, styling)
- `buildOverviewGraph()` creates the initial architecture view from the repo tree

### UI Layout (`src/components/AppLayout.tsx`)
Three-column layout:
- **Left (w-72)**: `RepositoryPanel` — file tree browser
- **Center**: `VisualizationCanvas` (top) → `AnalysisPanel` (middle) → `CodeViewer` (bottom)
- **Right (w-360px)**: `ChatPanel` — CopilotKit chat interface

### Client-Side File Cache (`src/lib/fetch-file.ts`)
In-memory LRU cache for fetched file contents: 5-minute TTL, 200-entry max. Prevents redundant API calls during a session.

## Tech Stack

- **Next.js 16** + **React 19** (App Router)
- **CopilotKit** v1.53 — AI chat + frontend tool registration
- **Zustand** v5 — state management
- **@xyflow/react** (React Flow) + **dagre** — graph visualization and layout
- **Octokit** — GitHub API client
- **Zod** — schema validation for CopilotKit tool parameters
- **Tailwind CSS v4** — styling
- **Vitest** + **@testing-library/react** — testing
