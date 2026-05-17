import { create } from "zustand";
import type {
  RepoInfo,
  TreeNode,
  AnalysisResult,
  FlowNode,
  FlowEdge,
} from "@/types";

interface AppState {
  repo: {
    repoInfo: RepoInfo | null;
    tree: TreeNode | null;
    selectedFile: string | null;
    loading: boolean;
    error: string | null;
  };
  analysis: {
    result: AnalysisResult | null;
    loading: boolean;
    error: string | null;
  };
  visualization: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    graphType: "dependency" | "flow" | "architecture" | null;
  };
  codeViewer: {
    filePath: string | null;
    content: string | null;
    highlightedLines: number[];
    explanation: string | null;
  };

  setRepoInfo: (info: RepoInfo | null) => void;
  setTree: (tree: TreeNode | null) => void;
  setSelectedFile: (path: string | null) => void;
  setRepoLoading: (loading: boolean) => void;
  setRepoError: (error: string | null) => void;
  setSessionId: (id: string | null) => void;

  setAnalysisResult: (result: AnalysisResult | null) => void;
  setAnalysisLoading: (loading: boolean) => void;
  setAnalysisError: (error: string | null) => void;

  setVisualization: (
    nodes: FlowNode[],
    edges: FlowEdge[],
    graphType: "dependency" | "flow" | "architecture"
  ) => void;
  clearVisualization: () => void;

  setCodeViewer: (
    filePath: string,
    content: string,
    highlightedLines?: number[],
    explanation?: string
  ) => void;
  clearCodeViewer: () => void;

  reset: () => void;
}

const initialState = {
  repo: {
    repoInfo: null,
    tree: null,
    selectedFile: null,
    loading: false,
    error: null,
  },
  analysis: {
    result: null,
    loading: false,
    error: null,
  },
  visualization: {
    nodes: [],
    edges: [],
    graphType: null,
  },
  codeViewer: {
    filePath: null,
    content: null,
    highlightedLines: [],
    explanation: null,
  },
};

export const useAppStore = create<AppState>((set) => ({
  repo: { ...initialState.repo },
  analysis: { ...initialState.analysis },
  visualization: { ...initialState.visualization },
  codeViewer: { ...initialState.codeViewer },

  setRepoInfo: (info) =>
    set((state) => ({ repo: { ...state.repo, repoInfo: info } })),
  setTree: (tree) =>
    set((state) => ({ repo: { ...state.repo, tree } })),
  setSelectedFile: (path) =>
    set((state) => ({ repo: { ...state.repo, selectedFile: path } })),
  setRepoLoading: (loading) =>
    set((state) => ({ repo: { ...state.repo, loading } })),
  setRepoError: (error) =>
    set((state) => ({ repo: { ...state.repo, error } })),
  setSessionId: (sessionId) =>
    set((state) => ({ repo: { ...state.repo, repoInfo: state.repo.repoInfo ? { ...state.repo.repoInfo, sessionId: sessionId ?? undefined } : null } })),

  setAnalysisResult: (result) =>
    set((state) => ({ analysis: { ...state.analysis, result } })),
  setAnalysisLoading: (loading) =>
    set((state) => ({ analysis: { ...state.analysis, loading } })),
  setAnalysisError: (error) =>
    set((state) => ({ analysis: { ...state.analysis, error } })),

  setVisualization: (nodes, edges, graphType) => {
    if (nodes.length === 0) return;
    set(() => ({ visualization: { nodes, edges, graphType } }));
  },
  clearVisualization: () =>
    set(() => ({
      visualization: { ...initialState.visualization },
    })),

  setCodeViewer: (filePath, content, highlightedLines = [], explanation) =>
    set(() => ({
      codeViewer: { filePath, content, highlightedLines, explanation: explanation ?? null },
    })),
  clearCodeViewer: () =>
    set(() => ({
      codeViewer: { ...initialState.codeViewer },
    })),

  reset: () =>
    set(() => ({
      repo: { ...initialState.repo },
      analysis: { ...initialState.analysis },
      visualization: { ...initialState.visualization },
      codeViewer: { ...initialState.codeViewer },
    })),
}));
