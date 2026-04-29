export enum NodeType {
  ROOT = 'ROOT',
  THESIS = 'THESIS', // Positive/Deep
  ANTITHESIS = 'ANTITHESIS', // Negative/Counter
  SYNTHESIS = 'SYNTHESIS', // Merge
}

export interface NodeData {
  id: string;
  type: NodeType;
  label: string; // Short concept title
  text: string; // Full content
  topic?: string; // The original topic (for roots)
  x: number;
  y: number;
  parentId?: string;
  synthesisParents?: [string, string]; // IDs of the two nodes that created this
  isGenerating?: boolean;
  velocity?: { x: number, y: number }; // For physics
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface AppState {
  nodes: NodeData[];
  connections: Connection[];
}