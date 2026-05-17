"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAppStore } from "@/store";
import { buildLayoutedGraph } from "@/lib/graph-layout";
import { ModuleNode } from "@/components/flow/ModuleNode";
import { FunctionNode } from "@/components/flow/FunctionNode";
import { FileNode } from "@/components/flow/FileNode";
import { CustomEdge } from "@/components/flow/CustomEdge";

const nodeTypes: NodeTypes = {
  moduleNode: ModuleNode,
  functionNode: FunctionNode,
  fileNode: FileNode,
};

const edgeTypes: EdgeTypes = {
  customEdge: CustomEdge,
};

export function VisualizationCanvas() {
  const { nodes: flowNodes, edges: flowEdges, graphType } = useAppStore(
    (s) => s.visualization
  );

  const [direction, setDirection] = useState<"TB" | "LR">("TB");

  const layouted = useMemo(
    () => buildLayoutedGraph(flowNodes, flowEdges, { direction }),
    [flowNodes, flowEdges, direction]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const repo = useAppStore((s) => s.repo);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const setCodeViewer = useAppStore((s) => s.setCodeViewer);

  const toggleDirection = useCallback(() => {
    setDirection((d) => (d === "TB" ? "LR" : "TB"));
  }, []);

  const setRepoError = useAppStore((s) => s.setRepoError);

  const onNodeClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      const metadata = (node.data as Record<string, unknown>)?.metadata as Record<string, string> | undefined;
      const fullPath = metadata?.fullPath;
      if (!fullPath || !repo.repoInfo) return;

      setSelectedFile(fullPath);
      try {
        const { fetchFile } = await import("@/lib/fetch-file");
        const content = await fetchFile(
          repo.repoInfo.owner,
          repo.repoInfo.repo,
          fullPath,
          repo.repoInfo.branch,
          { localMode: repo.repoInfo.localMode, sessionId: repo.repoInfo.sessionId }
        );
        setCodeViewer(fullPath, content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load file";
        setRepoError(msg);
      }
    },
    [repo.repoInfo, setSelectedFile, setCodeViewer, setRepoError]
  );

  const isEmpty = flowNodes.length === 0;

  return (
    <div className="relative h-full w-full bg-gray-50">
      {isEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm text-gray-400">Load a repository to see the architecture graph</p>
        </div>
      )}
      {!isEmpty && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          {graphType && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600 capitalize">
              {graphType}
            </span>
          )}
          <button
            onClick={toggleDirection}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm hover:bg-gray-50"
          >
            {direction === "TB" ? "Top-Down" : "Left-Right"}
          </button>
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-500 shadow-sm">
            {flowNodes.length} nodes
          </span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ animated: true }}
        style={{ visibility: isEmpty ? "hidden" : "visible" }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
}
