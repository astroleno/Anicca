import type { DialogueMetaballNode } from "../metaball/model";

type Body = { node: DialogueMetaballNode; vx: number; vy: number; vr: number };

/** A single spring state drives both the liquid and its accessible DOM label. */
export class LiquidMotion {
  private bodies = new Map<string, Body>();
  private previousTime: number | null = null;

  step(targets: DialogueMetaballNode[], time: number, reduced: boolean, pressedId: string | null = null) {
    const dt = this.previousTime === null ? 1 / 60 : Math.min(1 / 30, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;
    const ids = new Set(targets.map(node => node.id));
    const previous = [...this.bodies.values()];
    for (const id of this.bodies.keys()) if (!ids.has(id)) this.bodies.delete(id);
    let moving = false;
    const nodes = targets.map(target => {
      let body = this.bodies.get(target.id);
      if (!body) {
        const origin = previous.reduce<Body | null>((nearest, item) => {
          const distance = (node: DialogueMetaballNode) => Math.hypot(node.center[0] - target.center[0], node.center[1] - target.center[1]);
          return !nearest || distance(item.node) < distance(nearest.node) ? item : nearest;
        }, null);
        body = { node: { ...target, center: origin && !reduced ? [...origin.node.center] : [...target.center],
          radius: origin && !reduced ? target.radius * .15 : target.radius }, vx: 0, vy: 0, vr: 0 };
        this.bodies.set(target.id, body);
      }
      const spring = (current: number, goal: number, velocity: number): [number, number] => {
        if (reduced || (Math.abs(goal - current) < .0003 && Math.abs(velocity) < .002)) return [goal, 0];
        const nextVelocity = velocity + ((goal - current) * 140 - velocity * 13) * dt;
        moving = true;
        return [current + nextVelocity * dt, nextVelocity];
      };
      const [x, vx] = spring(body.node.center[0], target.center[0], body.vx);
      const [y, vy] = spring(body.node.center[1], target.center[1], body.vy);
      const [radius, vr] = spring(body.node.radius, target.radius * (target.id === pressedId ? .9 : 1), body.vr);
      body.vx = vx; body.vy = vy; body.vr = vr;
      body.node = { ...target, center: [x, y], radius: Math.max(.001, radius) };
      return body.node;
    });
    return { nodes, moving };
  }
}
