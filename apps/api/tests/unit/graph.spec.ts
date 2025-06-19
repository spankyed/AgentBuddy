import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { 
  descendants,
  ancestors,
  rootParent,
  wouldCreateCycle,
  linkSymmetric,
  topoSort,
  shortestPath,
  leaves,
  lowestCommonAncestor
} from "@/shared/ears/helpers/graph";
import { EARS } from "@/shared/ears/types";
import { qx } from "@/shared/ears/helpers/query";
import { tx } from "@/shared/ears/helpers/transaction";
import { loadMockData } from "@/systems/_backend/load-initial-data";

describe("graph.ts - comprehensive test suite", () => {
  beforeAll(() => {
    loadMockData();
  });

  describe("tree traversal functions", () => {
    let rootId: string;
    let child1Id: string;
    let child2Id: string;
    let grandchildId: string;

    beforeEach(() => {
      // Create test tree structure
      const root = tx(EARS.Entity.Thread).put("label", "Root");
      const child1 = tx(EARS.Entity.Thread).put("label", "Child1");
      const child2 = tx(EARS.Entity.Thread).put("label", "Child2");
      const grandchild = tx(EARS.Entity.Thread).put("label", "Grandchild");
      
      rootId = root.id();
      child1Id = child1.id();
      child2Id = child2.id();
      grandchildId = grandchild.id();
      
      // Create tree structure: root -> child1 -> grandchild
      //                             -> child2
      root.linkOne(EARS.RelKind.CONTAINS, child1Id);
      root.linkOne(EARS.RelKind.CONTAINS, child2Id);
      child1.linkOne(EARS.RelKind.CONTAINS, grandchildId);
    });

    it("descendants() finds all descendants", () => {
      const desc = descendants(rootId, EARS.RelKind.CONTAINS);
      expect(desc).toHaveLength(3);
      expect(desc).toContain(child1Id);
      expect(desc).toContain(child2Id);
      expect(desc).toContain(grandchildId);
      
      // Test from child1
      const child1Desc = descendants(child1Id, EARS.RelKind.CONTAINS);
      expect(child1Desc).toHaveLength(1);
      expect(child1Desc).toContain(grandchildId);
      
      // Test leaf node
      const leafDesc = descendants(grandchildId, EARS.RelKind.CONTAINS);
      expect(leafDesc).toHaveLength(0);
    });

    it("ancestors() finds all ancestors", () => {
      const anc = ancestors(grandchildId, EARS.RelKind.CONTAINS);
      expect(anc).toHaveLength(2);
      expect(anc).toContain(child1Id);
      expect(anc).toContain(rootId);
      
      // Test from child2
      const child2Anc = ancestors(child2Id, EARS.RelKind.CONTAINS);
      expect(child2Anc).toHaveLength(1);
      expect(child2Anc).toContain(rootId);
      
      // Test root has no ancestors
      const rootAnc = ancestors(rootId, EARS.RelKind.CONTAINS);
      expect(rootAnc).toHaveLength(0);
    });

    it("rootParent() finds the topmost parent", () => {
      expect(rootParent(grandchildId, EARS.RelKind.CONTAINS)).toBe(rootId);
      expect(rootParent(child1Id, EARS.RelKind.CONTAINS)).toBe(rootId);
      expect(rootParent(child2Id, EARS.RelKind.CONTAINS)).toBe(rootId);
      expect(rootParent(rootId, EARS.RelKind.CONTAINS)).toBe(rootId);
    });
  });

  describe("cycle detection", () => {
    let nodeAId: string;
    let nodeBId: string;
    let nodeCId: string;

    beforeEach(() => {
      const nodeA = tx(EARS.Entity.Thread).put("label", "A");
      const nodeB = tx(EARS.Entity.Thread).put("label", "B");
      const nodeC = tx(EARS.Entity.Thread).put("label", "C");
      
      nodeAId = nodeA.id();
      nodeBId = nodeB.id();
      nodeCId = nodeC.id();
      
      // Create chain: A -> B -> C
      nodeA.linkOne(EARS.RelKind.BLOCKS, nodeBId);
      nodeB.linkOne(EARS.RelKind.BLOCKS, nodeCId);
    });

    it("wouldCreateCycle() detects potential cycles", () => {
      // C -> A would create a cycle
      expect(wouldCreateCycle(nodeCId, nodeAId, [EARS.RelKind.BLOCKS])).toBe(true);
      
      // A -> C would not create a cycle (already reachable)
      expect(wouldCreateCycle(nodeAId, nodeCId, [EARS.RelKind.BLOCKS])).toBe(false);
      
      // B -> A would create a cycle
      expect(wouldCreateCycle(nodeBId, nodeAId, [EARS.RelKind.BLOCKS])).toBe(true);
    });

    it("wouldCreateCycle() works with multiple relation kinds", () => {
      const nodeD = tx(EARS.Entity.Thread).put("label", "D");
      const nodeDId = nodeD.id();
      
      // Add DEPENDS_ON edge
      tx(nodeCId).linkOne(EARS.RelKind.DEPENDS_ON, nodeDId);
      
      // Check cycle across both kinds
      expect(wouldCreateCycle(nodeDId, nodeAId, [
        EARS.RelKind.BLOCKS,
        EARS.RelKind.DEPENDS_ON
      ])).toBe(true);
    });
  });

  describe("symmetric edges", () => {
    it("linkSymmetric() creates bidirectional edges", () => {
      const doc1 = tx(EARS.Entity.Thread).put("label", "Doc1");
      const doc2 = tx(EARS.Entity.Thread).put("label", "Doc2");
      
      linkSymmetric(doc1.id(), doc2.id(), EARS.RelKind.RELATES_TO);
      
      // Check both directions
      expect(qx(doc1.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(doc2.id());
      expect(qx(doc2.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(doc1.id());
    });

    it("linkSymmetric() with info parameter", () => {
      const doc1 = tx(EARS.Entity.Thread).put("label", "Doc1");
      const doc2 = tx(EARS.Entity.Thread).put("label", "Doc2");
      const info = { reason: "similar content" };
      
      linkSymmetric(doc1.id(), doc2.id(), EARS.RelKind.RELATES_TO, info);
      
      // Verify edges exist in both directions
      expect(qx(doc1.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(doc2.id());
      expect(qx(doc2.id()).linksTo(EARS.RelKind.RELATES_TO, EARS.Entity.Thread).ids())
        .toContain(doc1.id());
    });

    it("linkSymmetric() rejects self-links", () => {
      const self = tx(EARS.Entity.Thread).put("label", "Self");
      expect(() => linkSymmetric(self.id(), self.id(), EARS.RelKind.RELATES_TO))
        .toThrow("Self-link refused");
    });
  });

  describe("topological sort", () => {
    it("topoSort() produces valid topological order", () => {
      // Create DAG for dependency resolution
      const root = tx(EARS.Entity.Thread).put("label", "Root");
      const a1 = tx(EARS.Entity.Thread).put("label", "A1");
      const a2 = tx(EARS.Entity.Thread).put("label", "A2");
      const b1 = tx(EARS.Entity.Thread).put("label", "B1");
      const leaf = tx(EARS.Entity.Thread).put("label", "Leaf");
      
      const rootId = root.id();
      const a1Id = a1.id();
      const a2Id = a2.id();
      const b1Id = b1.id();
      const leafId = leaf.id();
      
      // Create dependencies
      root.linkOne(EARS.RelKind.DEPENDS_ON, a1Id);
      root.linkOne(EARS.RelKind.DEPENDS_ON, a2Id);
      a1.linkOne(EARS.RelKind.DEPENDS_ON, b1Id);
      a2.linkOne(EARS.RelKind.DEPENDS_ON, b1Id);
      b1.linkOne(EARS.RelKind.DEPENDS_ON, leafId);
      
      const sorted = topoSort([rootId], EARS.RelKind.DEPENDS_ON);
      
      expect(sorted).toHaveLength(5);
      expect(sorted[0]).toBe(rootId);
      expect(sorted.indexOf(a1Id)).toBeLessThan(sorted.indexOf(b1Id));
      expect(sorted.indexOf(a2Id)).toBeLessThan(sorted.indexOf(b1Id));
      expect(sorted.indexOf(b1Id)).toBeLessThan(sorted.indexOf(leafId));
    });

    it("topoSort() throws on cycle detection", () => {
      const n1 = tx(EARS.Entity.Thread).put("label", "N1");
      const n2 = tx(EARS.Entity.Thread).put("label", "N2");
      
      // Create a cycle
      n1.linkOne(EARS.RelKind.DEPENDS_ON, n2.id());
      n2.linkOne(EARS.RelKind.DEPENDS_ON, n1.id());
      
      expect(() => topoSort([n1.id()], EARS.RelKind.DEPENDS_ON))
        .toThrow("Cycle detected – topological order impossible");
    });
  });

  describe("shortest path", () => {
    it("shortestPath() finds the shortest path", () => {
      const s = tx(EARS.Entity.Thread).put("label", "S");
      const a = tx(EARS.Entity.Thread).put("label", "A");
      const b = tx(EARS.Entity.Thread).put("label", "B");
      const c = tx(EARS.Entity.Thread).put("label", "C");
      const t = tx(EARS.Entity.Thread).put("label", "T");
      
      // Create graph with multiple paths
      // S -> A -> T (length 3)
      // S -> B -> C -> T (length 4)
      s.linkOne(EARS.RelKind.BLOCKS, a.id());
      a.linkOne(EARS.RelKind.BLOCKS, t.id());
      s.linkOne(EARS.RelKind.BLOCKS, b.id());
      b.linkOne(EARS.RelKind.BLOCKS, c.id());
      c.linkOne(EARS.RelKind.BLOCKS, t.id());
      
      const path = shortestPath(s.id(), t.id(), [EARS.RelKind.BLOCKS]);
      expect(path).toEqual([s.id(), a.id(), t.id()]);
    });

    it("shortestPath() handles multiple relation kinds", () => {
      const n1 = tx(EARS.Entity.Thread).put("label", "N1");
      const n2 = tx(EARS.Entity.Thread).put("label", "N2");
      const n3 = tx(EARS.Entity.Thread).put("label", "N3");
      
      // Path using different relation kinds
      n1.linkOne(EARS.RelKind.BLOCKS, n2.id());
      n2.linkOne(EARS.RelKind.DEPENDS_ON, n3.id());
      
      const path = shortestPath(n1.id(), n3.id(), [
        EARS.RelKind.BLOCKS,
        EARS.RelKind.DEPENDS_ON
      ]);
      expect(path).toEqual([n1.id(), n2.id(), n3.id()]);
    });

    it("shortestPath() returns null for unreachable nodes", () => {
      const isolated1 = tx(EARS.Entity.Thread).put("label", "Isolated1");
      const isolated2 = tx(EARS.Entity.Thread).put("label", "Isolated2");
      
      const path = shortestPath(isolated1.id(), isolated2.id(), [EARS.RelKind.BLOCKS]);
      expect(path).toBeNull();
    });

    it("shortestPath() handles self-path", () => {
      const node = tx(EARS.Entity.Thread).put("label", "Node");
      const path = shortestPath(node.id(), node.id(), [EARS.RelKind.BLOCKS]);
      expect(path).toEqual([node.id()]);
    });
  });

  describe("leaves detection", () => {
    it("leaves() finds nodes with no outgoing edges", () => {
      const root = tx(EARS.Entity.Thread).put("label", "Root");
      const branch = tx(EARS.Entity.Thread).put("label", "Branch");
      const leaf1 = tx(EARS.Entity.Thread).put("label", "Leaf1");
      const leaf2 = tx(EARS.Entity.Thread).put("label", "Leaf2");
      
      root.linkOne(EARS.RelKind.CONTAINS, branch.id());
      root.linkOne(EARS.RelKind.CONTAINS, leaf1.id());
      branch.linkOne(EARS.RelKind.CONTAINS, leaf2.id());
      
      // Get all leaves and filter to our test nodes
      const testNodes = [root.id(), branch.id(), leaf1.id(), leaf2.id()];
      const leafNodes = leaves(EARS.RelKind.CONTAINS, EARS.Entity.Thread)
        .filter(id => testNodes.includes(id));
      
      expect(leafNodes).toHaveLength(2);
      expect(leafNodes).toContain(leaf1.id());
      expect(leafNodes).toContain(leaf2.id());
    });

    it("leaves() with specific entity type filter", () => {
      const node = tx(EARS.Entity.Node).put("label", "NodeEntity");
      const thread = tx(EARS.Entity.Thread).put("label", "ThreadEntity");
      
      // Test filtering by different entity types
      const nodeLeaves = leaves(EARS.RelKind.CONTAINS, EARS.Entity.Node)
        .filter(id => id === node.id());
      expect(nodeLeaves).toContain(node.id());
      
      const threadLeaves = leaves(EARS.RelKind.CONTAINS, EARS.Entity.Thread)
        .filter(id => id === thread.id());
      expect(threadLeaves).toContain(thread.id());
    });
  });

  describe("lowest common ancestor", () => {
    it("lowestCommonAncestor() finds LCA correctly", () => {
      const root = tx(EARS.Entity.Thread).put("label", "Root");
      const left = tx(EARS.Entity.Thread).put("label", "Left");
      const right = tx(EARS.Entity.Thread).put("label", "Right");
      const leftChild = tx(EARS.Entity.Thread).put("label", "LeftChild");
      const rightChild = tx(EARS.Entity.Thread).put("label", "RightChild");
      
      root.linkOne(EARS.RelKind.CONTAINS, left.id());
      root.linkOne(EARS.RelKind.CONTAINS, right.id());
      left.linkOne(EARS.RelKind.CONTAINS, leftChild.id());
      right.linkOne(EARS.RelKind.CONTAINS, rightChild.id());
      
      // LCA of cousins is grandparent
      expect(lowestCommonAncestor(leftChild.id(), rightChild.id())).toBe(root.id());
      
      // LCA of parent and child is parent
      expect(lowestCommonAncestor(leftChild.id(), left.id())).toBe(left.id());
      
      // LCA of same node is itself
      expect(lowestCommonAncestor(left.id(), left.id())).toBe(left.id());
    });

    it("lowestCommonAncestor() returns null for unconnected nodes", () => {
      const tree1 = tx(EARS.Entity.Thread).put("label", "Tree1");
      const tree2 = tx(EARS.Entity.Thread).put("label", "Tree2");
      
      expect(lowestCommonAncestor(tree1.id(), tree2.id())).toBeNull();
    });

    it("lowestCommonAncestor() with custom tree kind", () => {
      const folder = tx(EARS.Entity.Thread).put("label", "Folder");
      const file1 = tx(EARS.Entity.Thread).put("label", "File1");
      const file2 = tx(EARS.Entity.Thread).put("label", "File2");
      
      // Use RESPONDER as tree structure
      folder.linkOne(EARS.RelKind.RESPONDER, file1.id());
      folder.linkOne(EARS.RelKind.RESPONDER, file2.id());
      
      expect(lowestCommonAncestor(file1.id(), file2.id(), EARS.RelKind.RESPONDER))
        .toBe(folder.id());
    });
  });
}); 