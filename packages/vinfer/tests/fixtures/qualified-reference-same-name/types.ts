export type NodeOutput = { value: string; child?: NodeOutput; middle?: MiddleOutput };
export type MiddleOutput = { back?: NodeOutput };
