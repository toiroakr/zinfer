export type NodeOutput = {
  value: string;
  children?: Record<string, NodeOutput>;
};
