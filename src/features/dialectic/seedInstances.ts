import type { Graph, SeedInstances, StagePoint } from "@/types/anicca";
import { graphGenerations, type ThinkingSpace } from "@/features/perspectives/model";
import { mixRgb, seedColorPolarity, semanticSeedColor } from "@/components/dialogue/liquid/color";
import { buildSeedScene, seedPairAction } from "./seeds";
import { placeSeeds } from "./seedPlacement";
import { stageSeedRole, type DialogueStageNode } from "./sceneProjection";

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function normalizeSeedInstances(value: unknown, graph?: Graph): SeedInstances {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: SeedInstances = {};
  for (const [id, item] of Object.entries(value)) {
    if (!item || typeof item !== "object") continue;
    const instance = item as Record<string, unknown>;
    if (instance.id !== id || typeof instance.conceptId !== "string" || !instance.conceptId ||
      typeof instance.createdAt !== "string" || Number.isNaN(Date.parse(instance.createdAt)) ||
      id === instance.conceptId || (graph && (!graph.nodes[instance.conceptId] || graph.nodes[id]))) continue;
    // Own properties avoid interpreting imported prototype keys as instances.
    const ordinal = typeof instance.ordinal === "number" && Number.isSafeInteger(instance.ordinal) && instance.ordinal > 0
      ? instance.ordinal : Math.max(0, ...Object.values(result).filter(item => item.conceptId === instance.conceptId).map(item => item.ordinal)) + 1;
    Object.defineProperty(result, id, { value: { id, conceptId: instance.conceptId, createdAt: instance.createdAt, ordinal }, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

export function seedConceptId(graph: Graph, instances: SeedInstances, instanceId: string | null | undefined): string | null {
  if (!instanceId) return null;
  if (hasOwn(graph.nodes, instanceId)) return instanceId;
  const instance = hasOwn(instances, instanceId) ? instances[instanceId] : null;
  return instance && hasOwn(graph.nodes, instance.conceptId) ? instance.conceptId : null;
}

export function conceptInstances(instances: SeedInstances, conceptId: string) {
  return Object.values(instances).filter(instance => instance.conceptId === conceptId)
    .sort((a, b) => a.ordinal - b.ordinal || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function synthesisSourceSlots(graph: Graph, instances: SeedInstances, resultId: string) {
  const node = graph.nodes[seedConceptId(graph, instances, resultId) || ""];
  const sourceIds = node?.meta?.sourceNodeIds || (node?.branchType === "合" || node?.kind === "merge" ? node.parents : []);
  if (!Array.isArray(sourceIds)) return [];
  return sourceIds.map((conceptId, index) => {
    if (typeof conceptId !== "string" || !hasOwn(graph.nodes, conceptId)) return null;
    const saved = node?.meta?.sourceInstanceIds?.[index];
    return { conceptId, instanceId: saved && seedConceptId(graph, instances, saved) === conceptId ? saved : conceptId };
  });
}

export function sourceInstances(graph: Graph, instances: SeedInstances, resultId: string): string[] {
  return synthesisSourceSlots(graph, instances, resultId).slice(0, 2).flatMap(source => source ? [source.instanceId] : []);
}

function distinctSourceConcepts(slots: ReturnType<typeof synthesisSourceSlots>): [string, string] | undefined {
function directInstanceNeighbors(graph: Graph, instances: SeedInstances, active: string | null) {
  const conceptId = seedConceptId(graph, instances, active);
  const neighbors = new Set<string>();
  if (!active || !conceptId) return neighbors;

  const concept = graph.nodes[conceptId];
  const linkedParents = (id: string) => {
    const child = graph.nodes[id];
    const sources = synthesisSourceSlots(graph, instances, id);
    return child.parents.flatMap(parentId => {
      if (!graph.nodes[parentId]?.children.includes(id)) return [];
      return [sources.find(source => source?.conceptId === parentId)?.instanceId || parentId];
    });
  };

  // Only the original child is the endpoint of an incoming graph edge.
  // A saved synthesis source can make a specific copy its parent endpoint.
  if (active === conceptId) linkedParents(conceptId).forEach(id => neighbors.add(id));
  for (const child of concept.children) {
    if (graph.nodes[child] && linkedParents(child).includes(active)) neighbors.add(child);
  }
  return neighbors;
}

  if (slots.length !== 2) return undefined;
  const left = slots[0]?.conceptId, right = slots[1]?.conceptId;
  return left && right && left !== right ? [left, right] : undefined;
}

function commonDirectParent(graph: Graph, instances: SeedInstances, result: string, slots: ReturnType<typeof synthesisSourceSlots>) {
  const sources = distinctSourceConcepts(slots);
  if (!sources) return undefined;
  const resultConcept = seedConceptId(graph, instances, result);
  const [left, right] = sources;
  if (left === resultConcept || right === resultConcept) return undefined;
  const eligible = (id: string) => id !== left && id !== right && id !== resultConcept && hasOwn(graph.nodes, id);
  const rightParents = new Set(graph.nodes[right].parents.filter(eligible));
  const shared = [...new Set(graph.nodes[left].parents.filter(id => rightParents.has(id)))];
  return shared.length === 1 ? shared[0] : undefined;
}

type SeedColor = NonNullable<DialogueStageNode["semanticColor"]>;

function seedColorResolver(graph: Graph, instances: SeedInstances, generations: ReturnType<typeof graphGenerations>) {
  // Null identifies a cyclic dependency. It propagates to any synthesis using
  // that cycle, so the visible subset and its traversal order cannot change the hue.
  const resolved = new Map<string, SeedColor | null>();
  const base = (id: string) => {
    const node = graph.nodes[id];
    return semanticSeedColor(stageSeedRole(node), generations.get(id), seedColorPolarity(node.meta?.perspective));
  };
  return (id: string): SeedColor => {
    const stack: { id: string; sources?: [string, string]; next: number }[] = [{ id, next: 0 }];
    const active = new Set<string>();
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (resolved.has(frame.id)) {
        active.delete(frame.id);
        stack.pop();
        continue;
      }
      if (!active.has(frame.id)) {
        active.add(frame.id);
        const node = graph.nodes[frame.id];
        const isSynthesis = node.branchType === "合" || node.kind === "merge";
        frame.sources = isSynthesis ? distinctSourceConcepts(synthesisSourceSlots(graph, instances, frame.id)) : undefined;
        // Canonical order keeps the floating point result bit-for-bit invariant.
        frame.sources?.sort();
      }
      if (!frame.sources) {
        resolved.set(frame.id, base(frame.id));
        continue;
      }
      const source = frame.sources[frame.next];
      if (source !== undefined) {
        frame.next++;
        if (active.has(source)) resolved.set(source, null);
        else if (!resolved.has(source)) stack.push({ id: source, next: 0 });
        continue;
      }
      const left = resolved.get(frame.sources[0]), right = resolved.get(frame.sources[1]);
      resolved.set(frame.id, left && right ? mixRgb(left, right, .5) : null);
    }
    return resolved.get(id) ?? base(id);
  };
}

export function seedInstancePairAction(graph: Graph, instances: SeedInstances, left: string, right: string) {
  const a = seedConceptId(graph, instances, left), b = seedConceptId(graph, instances, right);
  const action = a && b ? seedPairAction(graph, a, b) : null;
  return action ? { ...action, key: [left, right].sort().join(":"), sourceInstanceIds: [left, right] as [string, string] } : null;
}

/** Visible instances share graph content; only instance IDs enter layout and hit testing. */
export function buildSeedInstanceScene(input: {
  graph: Graph; instances: SeedInstances; focusId: string | null;
  activeInstanceId: string | null; pinnedInstanceIds?: string[];
  expandedResultId: string | null; thinkingSpace: ThinkingSpace;
} & { reserveCommonParent?: boolean }): DialogueStageNode[] {
  const { graph, instances, focusId, thinkingSpace } = input;
  const active = seedConceptId(graph, instances, input.activeInstanceId) === focusId ? input.activeInstanceId : focusId;
  const result = input.expandedResultId || active;
  const directNeighbors = directInstanceNeighbors(graph, instances, active);
  const sources = result ? sourceInstances(graph, instances, result) : [];
  const commonParentId = result ? commonDirectParent(graph, instances, result, synthesisSourceSlots(graph, instances, result)) : undefined;
  const focusCopies = focusId ? conceptInstances(instances, focusId).map(instance => instance.id).reverse() : [];
  const relatedResults = Array.from(new Set([focusId, ...sources].flatMap(id => {
    const conceptId = seedConceptId(graph, instances, id);
    return (conceptId ? graph.nodes[conceptId].children : []).filter(child => graph.nodes[child]?.branchType === "合");
  }))).reverse();
  const required = [input.expandedResultId, ...sources,
    ...(input.reserveCommonParent === false ? [] : [sources.length ? result : null, commonParentId]),
    ...(input.pinnedInstanceIds || []), active, focusId, ...focusCopies, ...relatedResults]
    .filter((id): id is string => Boolean(id));
  const budget = Math.min(8, 5 + Object.keys(instances).length);
  const generations = graphGenerations(graph);
  const resolveColor = seedColorResolver(graph, instances, generations);
  const base = buildSeedScene(graph, focusId, null, thinkingSpace, 8,
    required.flatMap(id => seedConceptId(graph, instances, id) || []), generations);
  const templates = new Map(base.map(node => [node.id, node]));
  for (const node of base) if (node.branchType === "合" || node.kind === "merge") node.semanticColor = resolveColor(node.id);
  const sourceConcepts = new Set(sources.map(id => seedConceptId(graph, instances, id)));
  const selected = new Set<string>();
  for (const id of [...required, ...Object.keys(instances).reverse(), ...base.map(node => node.id)]) {
    if (selected.size >= budget) break;
    const conceptId = seedConceptId(graph, instances, id);
    if (conceptId && templates.has(conceptId)) selected.add(id);
  }
  return Array.from(selected).map(id => {
    const conceptId = seedConceptId(graph, instances, id)!;
    const template = templates.get(conceptId)!;
    const copies = conceptInstances(instances, conceptId);
    const sourceRole = id === result && sources.length ? "result" : sources.includes(id) ? "source"
      : sources.length && sourceConcepts.has(conceptId) ? "shared"
        : !sources.length && conceptId === focusId && copies.length ? "shared"
          : sources.length ? "other" : undefined;
    return { ...template, id, conceptId,
      relation: id === active ? "focus" : sources.includes(id) ? "source" : "child",
      ...(copies.length ? { instanceNumber: id === conceptId ? 0 : instances[id].ordinal } : {}),
      sourceRole,
      ...(sourceRole === "source" ? { semanticColor: resolveColor(conceptId) } : {}),
      ...(id === result && commonParentId ? { commonParentId } : {}),
      ordinaryTier: id === active ? "focus" : directNeighbors.has(id) ? "direct" : "distant",
      originNodeIds: id !== conceptId ? [conceptId] : template.originNodeIds };
  });
}

/** Move the result and its sources into open reading space; unrelated seeds keep their positions. */
export function unfoldedSourcePositions(nodes: DialogueStageNode[], saved: Record<string, StagePoint>, resultId: string, sources: string[], compact: boolean) {
  const group = [resultId, ...sources];
  const retained = { ...saved };
  group.forEach(id => delete retained[id]);
  const points = compact ? [[50, 24], [28, 57], [72, 75]] : [[50, 27], [28, 64], [74, 66]];
  const spread = group.flatMap((id, index) => {
    const node = nodes.find(item => item.id === id);
    const point = points[Math.min(index, points.length - 1)];
    return node ? [{ ...node, originNodeIds: [], spatialCoordinates: undefined, seedZ: saved[id]?.z ?? node.seedZ,
      seedX: point[0], seedY: point[1], compactSeedX: point[0], compactSeedY: point[1] }] : [];
  });
  return placeSeeds([...nodes.filter(node => !group.includes(node.id)), ...spread], retained, compact);
}

/** Release only the two participants; the motion renderer eases them out of contact. */
export function separatedEncounterPositions(nodes: DialogueStageNode[], saved: Record<string, StagePoint>, sources: string[], compact: boolean) {
  const retained = { ...saved };
  sources.forEach(id => delete retained[id]);
  const spread = sources.flatMap((id, index) => {
    const node = nodes.find(item => item.id === id);
    const x = index ? 72 : 28, y = compact ? (index ? 65 : 38) : 53;
    return node ? [{ ...node, originNodeIds: [], spatialCoordinates: undefined,
      seedZ: saved[id]?.z ?? node.seedZ, seedX: x, seedY: y, compactSeedX: x, compactSeedY: y }] : [];
  });
  return placeSeeds([...nodes.filter(node => !sources.includes(node.id)), ...spread], retained, compact);
}
