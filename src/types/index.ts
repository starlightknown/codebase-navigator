export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
  /** true when analysing a locally-uploaded folder instead of a GitHub repo */
  localMode?: boolean;
  /** session ID for local folders (maps to the server-side local-store) */
  sessionId?: string;
}

export interface TreeNode {
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

export interface AnalysisResult {
  explanation: string;
  relevantFiles: RelevantFile[];
  flowDiagram: FlowDiagram;
}

export interface RelevantFile {
  path: string;
  relevance: string;
  highlightedLines?: number[];
}

export interface FlowDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type: "module" | "function" | "file" | "service";
  label: string;
  metadata?: Record<string, string>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type: "import" | "call" | "flow";
  label?: string;
}

export interface CodeViewerState {
  filePath: string | null;
  content: string | null;
  highlightedLines: number[];
  explanation: string | null;
}

export interface RepoState {
  repoInfo: RepoInfo | null;
  tree: TreeNode | null;
  selectedFile: string | null;
  loading: boolean;
  error: string | null;
}

export interface AnalysisState {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}

export interface VisualizationState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  graphType: "dependency" | "flow" | "architecture" | null;
}

export type LLMProvider = "openai" | "ollama";

export interface SettingsState {
  provider: LLMProvider;
  openaiApiKey: string;
  openaiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
}
