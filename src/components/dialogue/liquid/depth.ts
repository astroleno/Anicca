import type { DialogueMetaballNode } from "../metaball/model";
import { liquidProximity } from "@/features/dialectic/liquidInteraction";
import { SEED_CAMERA_DISTANCE, canCaptureSpatialPair } from "./space";

function separateDepths(nodes: DialogueMetaballNode[], pair: string[], strength: number) {
  const goals = new Map(nodes.map(node => [node.id, node.depth || 0]));
  const selected = nodes.filter(node => pair.includes(node.id));
  const plane = selected.reduce((sum,node)=>sum+(node.depth || 0),0)/Math.max(1,selected.length);
  for (const node of selected) goals.set(node.id,(node.depth || 0)+(plane-(node.depth || 0))*strength);
  const ordered = [...selected, ...nodes.filter(node=>!pair.includes(node.id))
    .sort((a,b)=>(a.depth || 0)-(b.depth || 0)||a.id.localeCompare(b.id))];
  const placed: DialogueMetaballNode[] = [];
  for (const node of ordered) {
    let z=goals.get(node.id)!;
    // Old workspaces can deliberately stack source seeds. Separate their
    // volumes along the view ray while preserving every saved screen anchor.
    if (!pair.includes(node.id)) for (let iteration=0;iteration<40;iteration++) {
      const scale=1+z/SEED_CAMERA_DISTANCE;
      const collision=placed.find(other=>{
        const oz=goals.get(other.id)!, os=1+oz/SEED_CAMERA_DISTANCE;
        return Math.hypot(node.center[0]*scale-other.center[0]*os,
          node.center[1]*scale-other.center[1]*os,z-oz)<node.radius*scale*1.4+
            other.radius*os*(pair.includes(other.id)?1.95:1.4);
      });
      if (!collision) break;
      z+=Math.max(.025,node.radius*scale*.65);
    }
    goals.set(node.id,z);placed.push(node);
  }
  return goals;
}

/** A screen-space contact also needs physical contact along the camera axis.
 * Move only the chosen pair towards a shared depth; their projected anchors
 * remain under the pointer. Release restores each seed's spatial depth. */
export class LiquidDepthMotion {
  private offsets = new Map<string, number>();
  private previousTime: number | null = null;
  private previousInput: DialogueMetaballNode[] | null = null;
  private previousSource: string | null = null;
  private previousPartner: string | null = null;
  private goals = new Map<string, number>();
  private settled: DialogueMetaballNode[] | null = null;

  step(nodes: DialogueMetaballNode[], timestamp: number, reduced: boolean,
    sourceId: string | null = null, partnerId: string | null = null) {
    const same = nodes === this.previousInput && sourceId === this.previousSource && partnerId === this.previousPartner;
    if (same && this.settled) { this.previousTime = timestamp; return { nodes: this.settled, moving: false }; }
    const source = nodes.find(node => node.id === sourceId);
    const partner = nodes.find(node => node.id === partnerId && node.id !== sourceId);
    const strength = source && partner && canCaptureSpatialPair(source, partner) ? liquidProximity(
      Math.hypot(source.center[0]-partner.center[0], source.center[1]-partner.center[1]),
      source.radius, partner.radius).strength : 0;
    if (!same) this.goals = separateDepths(nodes, source ? partner && strength > 0 ? [source.id,partner.id] : [source.id] : [], strength);
    this.previousInput = nodes; this.previousSource = sourceId; this.previousPartner = partnerId;
    const goals = this.goals;
    const dt = this.previousTime === null ? 0 : Math.min(.05, Math.max(0, (timestamp-this.previousTime)/1000));
    const amount = reduced || this.previousTime === null ? 1 : 1-Math.exp(-(strength > 0 ? 14 : 10)*dt);
    this.previousTime = timestamp;
    const ids = new Set(nodes.map(node => node.id));
    for (const id of this.offsets.keys()) if (!ids.has(id)) this.offsets.delete(id);
    let moving = false, changed = false;
    const result = nodes.map(node => {
      const goal = goals.get(node.id)!-(node.depth || 0);
      const previous = this.offsets.get(node.id) || 0;
      const interpolated = previous+(goal-previous)*amount;
      const offset = Math.abs(goal-interpolated) < .00002 ? goal : interpolated;
      if (Math.abs(goal-offset) >= .00002) moving = true;
      this.offsets.set(node.id, offset);
      if (Math.abs(offset) < .000001) return node;
      changed = true;
      return { ...node, depth: (node.depth || 0)+offset };
    });
    const output = changed ? result : nodes;
    this.settled = moving ? null : output;
    return { nodes: output, moving };
  }
}
