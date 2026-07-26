import { ArtworkAgentProfile, GrowthOperator, parseArtworkAgentProfile } from "./types";

const ARTWORK_AGENT_PROFILES: ArtworkAgentProfile[] = [
  {
    artworkId: "artwork_mist_mountain",
    title: "雾山留白",
    voice: "quiet, spacious, and indirect",
    themes: ["ambiguity", "patience", "distance", "山", "留白", "不确定"],
    sensoryHooks: ["mist", "stone", "breath", "雾", "山", "冷光"],
    memoryAffinities: ["slow decisions", "unfinished paths", "不急着定论"],
    capabilities: ["expand", "resonate", "reframe"]
  },
  {
    artworkId: "artwork_night_crossing",
    title: "夜航灯",
    voice: "watchful, precise, and gently skeptical",
    themes: ["risk", "direction", "threshold", "夜", "方向", "风险"],
    sensoryHooks: ["lamp", "water", "horizon", "灯", "潮", "远方"],
    memoryAffinities: ["choice pressure", "late decisions", "下一步"],
    capabilities: ["counter_aha", "reframe", "resonate"]
  },
  {
    artworkId: "artwork_cracked_garden",
    title: "裂隙花园",
    voice: "tender, disruptive, and generative",
    themes: ["growth", "repair", "conflict", "裂隙", "生长", "修复"],
    sensoryHooks: ["soil", "root", "green edge", "土壤", "根", "新芽"],
    memoryAffinities: ["tension", "creative restart", "重新开始"],
    capabilities: ["expand", "counter_aha", "merge_promote", "resonate"]
  },
  {
    artworkId: "artwork_still_table",
    title: "静物桌",
    voice: "concrete, orderly, and close to the hand",
    themes: ["practice", "inventory", "craft", "具体", "整理", "执行"],
    sensoryHooks: ["paper", "cup", "wood", "纸", "杯", "桌面"],
    memoryAffinities: ["small steps", "workspace notes", "拆小"],
    capabilities: ["resonate", "reframe", "expand", "merge_promote"]
  }
];

export function getArtworkAgentProfiles() {
  return ARTWORK_AGENT_PROFILES.map((profile) => parseArtworkAgentProfile(profile));
}

export function assertArtworkSupportsOperator(profile: ArtworkAgentProfile, operator: GrowthOperator) {
  if (!profile.capabilities.includes(operator)) {
    throw new Error(`artwork_operator_not_supported:${profile.artworkId}:${operator}`);
  }
}

export function findArtworkAgentProfile(artworkId: string, profiles = getArtworkAgentProfiles()) {
  return profiles.find((profile) => profile.artworkId === artworkId) || null;
}
