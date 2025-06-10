export const isNodeKind = <K extends NodeKind>(k: K) =>
  (n: NodeEntity): n is Extract<NodeEntity, { nodeType: K }> =>
    n.nodeType === k;