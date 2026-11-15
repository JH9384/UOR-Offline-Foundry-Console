import React, { useMemo, useState } from 'react';
import { ArtifactProvenanceRecord, ProjectRecord } from '../types/foundry';
import { StatusTag } from './StatusTag';

interface DagNode {
  id: string;
  layer: 0 | 1 | 2 | 3;
  kind: 'INPUT' | 'REVISION' | 'TOOLCHAIN' | 'ARTIFACT' | 'EVIDENCE' | 'GATE';
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: 'neutral' | 'cobalt' | 'amber';
}

interface DagEdge {
  id: string;
  from: string;
  to: string;
}

interface ArtifactDependencyDagProps {
  artifact: ArtifactProvenanceRecord;
  project?: ProjectRecord;
}

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const side = Math.floor((maxLen - 3) / 2);
  return `${text.slice(0, side)}...${text.slice(text.length - side)}`;
}

export const ArtifactDependencyDag: React.FC<ArtifactDependencyDagProps> = ({
  artifact,
  project,
}) => {
  const { nodes, edges, svgWidth, svgHeight } = useMemo(() => {
    const inputs = artifact.inputDependencies.length > 0
      ? artifact.inputDependencies
      : ['Declared inputs unavailable'];
    const evidenceList = artifact.evidenceRefs.length > 0
      ? artifact.evidenceRefs
      : ['No evidence reference'];

    const colX = [24, 244, 464, 684];
    const nodeW = 180;
    const nodeH = 54;
    const vGap = 16;

    const maxRows = Math.max(inputs.length, 2, evidenceList.length + 1);
    const totalContentHeight = maxRows * nodeH + (maxRows - 1) * vGap;
    const height = Math.max(230, totalContentHeight + 48);
    const width = 888;

    const builtNodes: DagNode[] = [];
    const builtEdges: DagEdge[] = [];

    // Layer 0: Input Dependencies
    const inputsBlockHeight = inputs.length * nodeH + (inputs.length - 1) * vGap;
    const inputsStartY = (height - inputsBlockHeight) / 2;
    inputs.forEach((dep, idx) => {
      const id = `input-${idx}`;
      builtNodes.push({
        id,
        layer: 0,
        kind: 'INPUT',
        title: `Input ${String(idx + 1).padStart(2, '0')}`,
        subtitle: dep,
        x: colX[0],
        y: inputsStartY + idx * (nodeH + vGap),
        width: nodeW,
        height: nodeH,
        tone: 'neutral',
      });
    });

    // Layer 1: Source Revision + Toolchain Identity
    const layer1Height = 2 * nodeH + vGap * 1.5;
    const layer1StartY = (height - layer1Height) / 2;
    const revNodeId = 'revision-node';
    const toolchainNodeId = 'toolchain-node';

    builtNodes.push({
      id: revNodeId,
      layer: 1,
      kind: 'REVISION',
      title: 'Source Revision',
      subtitle: artifact.sourceRevision,
      x: colX[1],
      y: layer1StartY,
      width: nodeW,
      height: nodeH,
      tone: 'cobalt',
    });

    builtNodes.push({
      id: toolchainNodeId,
      layer: 1,
      kind: 'TOOLCHAIN',
      title: 'Toolchain Boundary',
      subtitle: artifact.toolchainIdentity,
      x: colX[1],
      y: layer1StartY + nodeH + vGap * 1.5,
      width: nodeW,
      height: nodeH,
      tone: 'neutral',
    });

    // Connect Inputs -> Source Revision
    inputs.forEach((_, idx) => {
      builtEdges.push({
        id: `e-in-${idx}-rev`,
        from: `input-${idx}`,
        to: revNodeId,
      });
    });

    // Layer 2: Selected Build Artifact
    const artifactNodeId = 'artifact-node';
    builtNodes.push({
      id: artifactNodeId,
      layer: 2,
      kind: 'ARTIFACT',
      title: 'Build Artifact',
      subtitle: `${artifact.artifactName} · sha256:${artifact.sha256Digest.slice(0, 12)}`,
      x: colX[2],
      y: (height - nodeH) / 2,
      width: nodeW,
      height: nodeH,
      tone: 'cobalt',
    });

    builtEdges.push(
      { id: 'e-rev-art', from: revNodeId, to: artifactNodeId },
      { id: 'e-tool-art', from: toolchainNodeId, to: artifactNodeId }
    );

    // Layer 3: Evidence Refs + Release Gate
    const layer3Count = evidenceList.length + 1;
    const layer3Height = layer3Count * nodeH + (layer3Count - 1) * vGap;
    const layer3StartY = (height - layer3Height) / 2;

    evidenceList.forEach((ev, idx) => {
      const evId = `evidence-${idx}`;
      builtNodes.push({
        id: evId,
        layer: 3,
        kind: 'EVIDENCE',
        title: `Evidence ${String(idx + 1).padStart(2, '0')}`,
        subtitle: ev,
        x: colX[3],
        y: layer3StartY + idx * (nodeH + vGap),
        width: nodeW,
        height: nodeH,
        tone: 'neutral',
      });
      builtEdges.push({
        id: `e-art-ev-${idx}`,
        from: artifactNodeId,
        to: evId,
      });
    });

    const gateNodeId = 'release-gate-node';
    builtNodes.push({
      id: gateNodeId,
      layer: 3,
      kind: 'GATE',
      title: 'Release Gate',
      subtitle: `${artifact.releaseReadiness} (${artifact.blockingReasons.length} blockers)`,
      x: colX[3],
      y: layer3StartY + evidenceList.length * (nodeH + vGap),
      width: nodeW,
      height: nodeH,
      tone: 'amber',
    });

    builtEdges.push({
      id: 'e-art-gate',
      from: artifactNodeId,
      to: gateNodeId,
    });

    return {
      nodes: builtNodes,
      edges: builtEdges,
      svgWidth: width,
      svgHeight: height,
    };
  }, [artifact]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('artifact-node');
  const activeNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes.find((n) => n.id === 'artifact-node');

  const isEdgeHighlighted = (edge: DagEdge) =>
    activeNode && (edge.from === activeNode.id || edge.to === activeNode.id);

  const getNodeStroke = (node: DagNode, isSelected: boolean) => {
    if (isSelected) return '#60A5FA';
    if (node.tone === 'amber') return 'rgba(245, 158, 11, 0.5)';
    if (node.tone === 'cobalt') return 'rgba(59, 130, 246, 0.45)';
    return 'rgba(51, 65, 85, 0.9)';
  };

  const getNodeFill = (node: DagNode, isSelected: boolean) => {
    if (isSelected) return '#172235';
    if (node.tone === 'amber') return 'rgba(69, 26, 3, 0.35)';
    return '#0B0F17';
  };

  return (
    <div className="pt-4 border-t border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-medium text-slate-200">
            Provenance Dependency Graph (DAG)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Inputs → Source Revision &amp; Toolchain → Build Artifact → Evidence &amp; Release Gate · Click any node to inspect
          </p>
        </div>
        <StatusTag value={artifact.digestMode === 'SYNTHETIC_DEMO_DIGEST' ? 'SIMULATED' : 'DOCUMENTED'} />
      </div>

      <div className="bg-[#0B0F17] border border-slate-800 rounded-md overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full min-w-[720px] h-auto block select-none"
          role="img"
          aria-label={`Directed acyclic provenance graph for ${artifact.artifactName}`}
        >
          <defs>
            <marker
              id="dag-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
            </marker>
            <marker
              id="dag-arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#60A5FA" />
            </marker>
          </defs>

          {/* Column Labels */}
          {[
            { x: 24, label: '01. INPUT DEPENDENCIES' },
            { x: 244, label: '02. REVISION & TOOLCHAIN' },
            { x: 464, label: '03. BUILD ARTIFACT' },
            { x: 684, label: '04. EVIDENCE & GATE' },
          ].map((col) => (
            <text
              key={col.label}
              x={col.x}
              y={16}
              fill="#64748B"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
              letterSpacing="0.06em"
            >
              {col.label}
            </text>
          ))}

          {/* Edges */}
          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x + fromNode.width;
            const y1 = fromNode.y + fromNode.height / 2;
            const x2 = toNode.x;
            const y2 = toNode.y + toNode.height / 2;
            const dx = Math.abs(x2 - x1) * 0.5;
            const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            const highlighted = isEdgeHighlighted(edge);

            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={highlighted ? '#60A5FA' : '#334155'}
                strokeWidth={highlighted ? 1.75 : 1.1}
                markerEnd={highlighted ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isSelected = activeNode?.id === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setSelectedNodeId(node.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedNodeId(node.id);
                  }
                }}
                aria-label={`${node.title}: ${node.subtitle}`}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  rx={6}
                  fill={getNodeFill(node, isSelected)}
                  stroke={getNodeStroke(node, isSelected)}
                  strokeWidth={isSelected ? 1.5 : 1}
                />
                <text
                  x={10}
                  y={20}
                  fill={node.tone === 'amber' ? '#FCD34D' : isSelected ? '#93C5FD' : '#94A3B8'}
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {node.title}
                </text>
                <text
                  x={10}
                  y={38}
                  fill="#E2E8F0"
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {truncateMiddle(node.subtitle, 24)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activeNode && (
        <div className="px-3.5 py-2.5 bg-[#0B0F17] border border-slate-800 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="font-mono text-blue-300">{activeNode.kind}</span>
            <span className="text-slate-600 mx-2">·</span>
            <span className="text-slate-300 font-medium">{activeNode.title}:</span>{' '}
            <span className="font-mono text-slate-200 break-all">{activeNode.subtitle}</span>
          </div>
          {project && (
            <span className="font-mono text-[11px] text-slate-500 shrink-0">
              {project.productFamily}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
