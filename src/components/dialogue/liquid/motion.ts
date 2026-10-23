import type { DialogueMetaballNode } from "../metaball/model";
import { liquidProximity } from "@/features/dialectic/liquidInteraction";
import { seedSpaceDepth } from "./space";

type Body = { node: DialogueMetaballNode; vx: number; vy: number; vz: number; vr: number; goalX: number; goalY: number; goalZ: number };

/** A single spring state drives both the liquid and its accessible DOM label. */
export class LiquidMotion {
  private bodies = new Map<string, Body>();
  private previousTime: number | null = null;
  private partner: { id: string; strength: number } | null = null;
  private moving = false;
  private held: { id: string; goalX: number; goalY: number; goalZ: number; x: number; y: number; z: number; moved: boolean } | null = null;

  step(targets: DialogueMetaballNode[], time: number, reduced: boolean, pressedId: string | null = null,
    partnerId: string | null = null, maxAttraction = Infinity) {
    // A new target has not been moving during the idle interval before it.
    // Resume with one normal step instead of spending that gap in one kick.
    const dt = this.previousTime === null ? 1 / 60
      : Math.min(this.moving ? 1 / 30 : 1 / 60, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;
    const ids = new Set(targets.map(node => node.id));
    const previous = [...this.bodies.values()];
    for (const id of this.bodies.keys()) if (!ids.has(id)) this.bodies.delete(id);
    const source = targets.find(node => node.id === pressedId);
    if (!source || reduced) this.held = null;
    else {
      const z = source.spaceDepth ?? seedSpaceDepth(source.id);
      if (this.held?.id !== source.id) {
        const body = this.bodies.get(source.id);
        this.held = { id: source.id, goalX: source.center[0], goalY: source.center[1], goalZ: z,
          x: body?.node.center[0] ?? source.center[0], y: body?.node.center[1] ?? source.center[1],
          z: body?.node.spaceDepth ?? z,
          moved: Boolean(body && (Math.abs(body.goalX - source.center[0]) + Math.abs(body.goalY - source.center[1]) + Math.abs(body.goalZ - z) > .00002)) };
      } else if (Math.abs(this.held.goalX - source.center[0]) + Math.abs(this.held.goalY - source.center[1]) + Math.abs(this.held.goalZ - z) > .00002) this.held.moved = true;
    }
    const held = !reduced && this.held && !this.held.moved ? this.held : null;
    const partner = source && targets.find(node => node.id === partnerId && node.id !== source.id);
    const distance = source && partner ? Math.hypot(source.center[0]-partner.center[0],source.center[1]-partner.center[1]) : 0;
    const strength = source && partner ? liquidProximity(distance, source.radius*.9, partner.radius).strength : 0;
    const activePartner = partner && strength > 0 ? { id: partner.id, strength } : null;
    if (!reduced && this.partner && this.partner.id !== activePartner?.id && this.partner.strength > .4) {
      const released = this.bodies.get(this.partner.id);
      if (released) released.vr -= released.node.radius*.65;
    }
    this.partner = activePartner;
    let moving = false;
    const nodes = targets.map(target => {
      let body = this.bodies.get(target.id);
      if (!body) {
        const origins = (target.emergeFrom || []).flatMap(id => {
          const source = previous.find(item => item.node.id === id);
          return source ? [source] : [];
        });
        const handoff = origins.find(origin => !ids.has(origin.node.id) && origin.node.id.startsWith("pending-"));
        const nearest = previous.reduce<Body | null>((nearest, item) => {
          const distance = (node: DialogueMetaballNode) => Math.hypot(node.center[0] - target.center[0], node.center[1] - target.center[1]);
          return !nearest || distance(item.node) < distance(nearest.node) ? item : nearest;
        }, null);
        const sources = handoff ? [handoff] : origins.length ? origins : nearest ? [nearest] : [];
        const emerging = !reduced && sources.length > 0;
        body = { node: { ...target,
          center: emerging ? [sources.reduce((sum, source) => sum + source.node.center[0], 0) / sources.length,
            sources.reduce((sum, source) => sum + source.node.center[1], 0) / sources.length] : [...target.center],
          ...(emerging ? { spaceDepth: sources.reduce((sum, source) => sum + (source.node.spaceDepth ?? seedSpaceDepth(source.node.id)), 0) / sources.length } : {}),
          radius: emerging ? handoff?.node.radius ?? target.radius * .15 : target.radius },
          vx: handoff && !reduced ? handoff.vx : 0, vy: handoff && !reduced ? handoff.vy : 0,
          vz: handoff && !reduced ? handoff.vz : 0, vr: handoff && !reduced ? handoff.vr : 0,
          goalX: target.center[0], goalY: target.center[1], goalZ: target.spaceDepth ?? seedSpaceDepth(target.id) };
        this.bodies.set(target.id, body);
      }
      const spring = (current: number, goal: number, velocity: number): [number, number] => {
        if (reduced || (Math.abs(goal - current) < .0003 && Math.abs(velocity) < .002)) return [goal, 0];
        const nextVelocity = velocity + ((goal - current) * 140 - velocity * 13) * dt;
        moving = true;
        return [current + nextVelocity * dt, nextVelocity];
      };
      const attraction = !reduced && target.id === activePartner?.id
        ? Math.min(target.radius*.14,maxAttraction)*strength : 0;
      const dx = source && distance > 0 ? (source.center[0]-target.center[0])/distance*attraction : 0;
      const dy = source && distance > 0 ? (source.center[1]-target.center[1])/distance*attraction : 0;
      const [x, vx] = target.id === pressedId ? [held?.x ?? target.center[0], 0]
        : spring(body.node.center[0], target.center[0]+dx, body.vx);
      const [y, vy] = target.id === pressedId ? [held?.y ?? target.center[1], 0]
        : spring(body.node.center[1], target.center[1]+dy, body.vy);
      const [radius, vr] = spring(body.node.radius, target.radius * (target.id === pressedId ? .9 : target.id === activePartner?.id && !reduced ? 1+strength*.025 : 1), body.vr);
      const targetZ = target.spaceDepth ?? seedSpaceDepth(target.id);
      const [z, vz] = target.id === pressedId ? [held?.z ?? targetZ, 0]
        : spring(body.node.spaceDepth ?? targetZ, targetZ, body.vz);
      body.vx = vx; body.vy = vy; body.vz = vz; body.vr = vr;
      body.goalX = target.center[0]; body.goalY = target.center[1]; body.goalZ = targetZ;
      body.node = { ...target, center: [x, y], radius: Math.max(.001, radius),
        ...(target.spaceDepth !== undefined || z !== targetZ ? { spaceDepth: z } : {}) };
      return body.node;
    });
    this.moving = moving;
    return { nodes, moving };
  }
}
