import { MAX_DIALOGUE_METABALLS, type DialogueMetaballNode } from "../metaball/model";
import { LIQUID_SEED_SLOTS } from "./spcode";
import { liquidBlendTargets, RESTING_LIQUID_BLEND } from "./fusion";
import type { LiquidRenderInteraction } from "./renderer";

/** Shared CPU state keeps both renderers on the same projected scene and fusion pair. */
export class LiquidFrame {
  private previousNodes: DialogueMetaballNode[] | null = null;
  private previousOrder = "";
  private readonly blends = new Map<string, number>();
  private readonly pressures = new Map<string, number>();
  private readonly attentions = new Map<string, number>();
  private readonly attentionTargets = new Map<string, number>();
  private fusionPair: string[] = [];
  private readonly previousSlotBlends: number[] = [];
  private readonly previousSlotPressures: number[] = [];
  private readonly previousSlotAttentions: number[] = [];
  private previousTime: number | null = null;
  private previousDraggedId: string | null = null;
  private previousPartnerId: string | null = null;


  update(nodes: DialogueMetaballNode[], timeSeconds: number, interaction: LiquidRenderInteraction | undefined, set1f: (name: string, value: number) => void) {
    const count = Math.min(nodes.length, MAX_DIALOGUE_METABALLS, LIQUID_SEED_SLOTS);
    // The soft union is ordered: join the chosen pair first, then add every
    // unrelated surface with a hard union so a third seed cannot grow a neck.
    if (interaction?.draggedId && interaction.partnerId) this.fusionPair = [interaction.draggedId, interaction.partnerId];
    else if (!this.fusionPair.some(id => (this.blends.get(id) || 0) > RESTING_LIQUID_BLEND + .0001)) this.fusionPair = [];
    const pair = this.fusionPair;
    const visibleNodes = [...nodes.slice(0, count)].sort((a, b) => {
      const rank = (id: string) => { const i = pair.indexOf(id); return i < 0 ? 2 : i; };
      return rank(a.id) - rank(b.id);
    });
    set1f("edgeSoftness", Math.max(.008, ...visibleNodes.map(node => node.radius*1.75*.18)));
    const targets = liquidBlendTargets(visibleNodes, interaction?.draggedId, interaction?.partnerId);
    // time=0 is the reduced-motion path: update geometry without interpolation.
    const draggedId = interaction?.draggedId || null, partnerId = interaction?.partnerId || null;
    const changedInteraction = draggedId !== this.previousDraggedId || partnerId !== this.previousPartnerId;
    const elapsed = Math.max(0,timeSeconds-(this.previousTime ?? timeSeconds));
    const dt = changedInteraction ? Math.min(1 / 60, elapsed) : elapsed;
    this.previousDraggedId = draggedId; this.previousPartnerId = partnerId;
    const immediate = this.previousTime === null || timeSeconds === 0;
    const pressureAmount = this.previousTime === null || timeSeconds === 0 ? 1
      : 1 - Math.exp(-5 * dt);
    this.previousTime = timeSeconds;
    const ids = new Set(visibleNodes.map(node => node.id));
    for (const id of this.blends.keys()) if (!ids.has(id)) this.blends.delete(id);
    for (const id of this.pressures.keys()) if (!ids.has(id)) this.pressures.delete(id);
    for (const id of this.attentions.keys()) if (!ids.has(id)) this.attentions.delete(id);
    for (const id of this.attentionTargets.keys()) if (!ids.has(id)) this.attentionTargets.delete(id);
    for (let index = 0; index < LIQUID_SEED_SLOTS; index++) {
      const node = visibleNodes[index];
      const attentionTarget = node?.attention ?? 1;
      const previousAttention = node ? this.attentions.get(node.id) ?? attentionTarget : 1;
      const attentionDt = node && this.attentionTargets.get(node.id) !== attentionTarget ? Math.min(1 / 60, dt) : dt;
      const attention = immediate || Math.abs(attentionTarget - previousAttention) < .001 ? attentionTarget
        : previousAttention + (attentionTarget - previousAttention) * (1 - Math.exp(-12 * attentionDt));
      if (node) { this.attentions.set(node.id, attention); this.attentionTargets.set(node.id, attentionTarget); }
      if (this.previousSlotAttentions[index] !== attention) set1f(`s${index}p`, attention);
      this.previousSlotAttentions[index] = attention;
      const target = targets[index] ?? RESTING_LIQUID_BLEND;
      const current = node ? (this.blends.get(node.id) ?? RESTING_LIQUID_BLEND) : RESTING_LIQUID_BLEND;
      const amount = immediate ? 1 : 1-Math.exp(-(target > current ? 16 : 10)*dt);
      const value = !pair.includes(node?.id || "") && interaction?.partnerId ? RESTING_LIQUID_BLEND
        : Math.abs(target - current) < 0.0001 ? target : current + (target - current) * amount;
      if (node) this.blends.set(node.id, value);
      if (this.previousSlotBlends[index] !== value) set1f(`s${index}b`, value);
      this.previousSlotBlends[index] = value;
      const pressureTarget = node && node.id === interaction?.draggedId ? 1 : 0;
      const previousPressure = node ? (this.pressures.get(node.id) || 0) : 0;
      const pressure = Math.abs(pressureTarget-previousPressure) < .0001 ? pressureTarget
        : previousPressure+(pressureTarget-previousPressure)*pressureAmount;
      if (node) this.pressures.set(node.id, pressure);
      if (this.previousSlotPressures[index] !== pressure) set1f(`s${index}h`, pressure);
      this.previousSlotPressures[index] = pressure;
    }

    const order = visibleNodes.map(node => node.id).join("\0");
    if (nodes !== this.previousNodes || order !== this.previousOrder) {
      this.previousNodes = nodes;
      this.previousOrder = order;
      for (let index = 0; index < LIQUID_SEED_SLOTS; index += 1) {
        const node = visibleNodes[index] || null;
        const prefix = `s${index}`;
        if (node) {
        const z = (node.depth || 0) * 1.75;
        const perspective = 1 + z / 2;
        set1f(`${prefix}x`, node.center[0] * 1.75 * perspective);
        set1f(`${prefix}y`, node.center[1] * 1.75 * perspective);
        set1f(`${prefix}z`, z);
        set1f(`${prefix}r`, Math.max(0.001, node.radius * 1.75 * perspective));
        set1f(`${prefix}cr`, node.color[0]);
        set1f(`${prefix}cg`, node.color[1]);
        set1f(`${prefix}cb`, node.color[2]);
        } else {
        set1f(`${prefix}x`, 999);
        set1f(`${prefix}y`, 999);
        set1f(`${prefix}z`, 0);
        set1f(`${prefix}r`, 0.001);
        }
      }
    }
  }
}
