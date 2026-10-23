import { orbitSeedSpace, projectSpatialSeed, seedSpaceDepth, spatialStagePoint, unprojectSeedPoint, dragSpatialStagePoint, SEED_VIEWS,
  SEED_CAMERA_DISTANCE, SEED_WORLD_CAMERA_DISTANCE, canCaptureSpatialPair, spatialPairInContact, fitSpatialSeed, fitSeedScene, spatialPairMetrics } from "./space";

describe("seed space projection", () => {
  it("retains a real contact through a narrow exit margin without accepting a new or distant contact",()=>{
    const a={id:"a",center:[0,0] as [number,number],depth:0,radius:.1,color:[1,1,1] as [number,number,number],emphasis:1};
    const b={...a,id:"b",center:[.224,0] as [number,number]};
    expect(spatialPairInContact(a,b)).toBe(false);expect(spatialPairInContact(a,b,true)).toBe(true);
    expect(spatialPairInContact(a,{...b,center:[.24,0]},true)).toBe(false);
    expect(spatialPairInContact(a,{...b,center:[0,0],depth:1},true)).toBe(false);
  });
  it("keeps existing saved layouts and apparent sizes at the default view", () => {
    for (const id of ["root", "thesis", "antithesis"]) {
      const node = { id, center: [.2, -.15] as [number, number], radius: .12, color: [1,1,1] as [number, number, number], emphasis: 1 };
      const projected = projectSpatialSeed(node, [.04, -.02], { yaw: 0, pitch: 0 });
      expect(projected.center[0]).toBeCloseTo(node.center[0], 10);
      expect(projected.center[1]).toBeCloseTo(node.center[1], 10);
      expect(projected.radius).toBeCloseTo(node.radius, 10);
      expect(projected.depth).toBeCloseTo(seedSpaceDepth(id) * SEED_CAMERA_DISTANCE / SEED_WORLD_CAMERA_DISTANCE, 10);
    }
  });

  it("intersects rotated screen rays back onto the same seed depth plane", () => {
    const pivot: [number, number] = [.06, -.03];
    for (const orbit of [{ yaw: .7, pitch: -.35 }, { yaw: -.85, pitch: .5 }]) {
      for (const center of [[-.35,.2], [.3,-.25], [0,0]] as [number, number][]) {
        const node = { id: "soft-seed", center, radius: .1, color: [1,1,1] as [number, number, number], emphasis: 1 };
        const projected = projectSpatialSeed(node, pivot, orbit);
        const restored = unprojectSeedPoint(projected.center, pivot, orbit, node.id);
        expect(restored[0]).toBeCloseTo(center[0], 10);
        expect(restored[1]).toBeCloseTo(center[1], 10);
        expect(projected.radius).toBeGreaterThan(0);
      }
    }
  });

  it("changes depth and perspective size when the scene turns", () => {
    const node = { id: "front", center: [.3,0] as [number, number], radius: .1, color: [1,1,1] as [number, number, number], emphasis: 1 };
    const front = projectSpatialSeed(node, [0,0], { yaw: .6, pitch: 0 });
    const back = projectSpatialSeed(node, [0,0], { yaw: -.6, pitch: 0 });
    expect(front.depth).toBeLessThan(back.depth!);
    expect(front.radius).toBeGreaterThan(back.radius);
  });

  it("preserves drag coordinates across canvas and viewport sizes", () => {
    for (const viewport of [{width:1280,height:600}, {width:320,height:370}]) {
      const point = {x:68,y:35}, orbit = {yaw:.65,pitch:.3};
      const screen = spatialStagePoint(point, "drag", orbit, viewport, 844);
      const restored = spatialStagePoint(screen, "drag", orbit, viewport, 844, true);
      expect(restored.x).toBeCloseTo(point.x, 9);
      expect(restored.y).toBeCloseTo(point.y, 9);
    }
    const orbit = orbitSeedSpace({yaw:0,pitch:0},10000,10000);
    expect(Math.abs(orbit.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(orbit.pitch).toBe(Math.PI / 2);
  });

  it("drags on a camera-facing plane in all six views without jumps or singularities", () => {
    for (const viewport of [{ width: 1280, height: 600 }, { width: 320, height: 400 }]) {
      for (const orbit of Object.values(SEED_VIEWS)) for (const scale of [1, .48]) {
        const start = { x: 64, y: 37, z: .24 };
        const screen = spatialStagePoint(start, "drag", orbit, viewport, 800, false, scale);
        const moved = { x: screen.x + 4, y: screen.y - 5 };
        const result = dragSpatialStagePoint(moved, start, "drag", orbit, viewport, 800, undefined, scale);
        const projected = spatialStagePoint(result, "drag", orbit, viewport, 800, false, scale);
        expect(projected.x).toBeCloseTo(moved.x, 9);
        expect(projected.y).toBeCloseTo(moved.y, 9);
        expect(Number.isFinite(result.z)).toBe(true);
      }
    }
  });

  it("fits rotated volumes into the viewport without changing 3D contact ratios", () => {
    const nodes = [{ id: "a", center: [.3, .46] as [number, number], depth: -.2, radius: .1, color: [1,1,1] as [number, number, number], emphasis: 1 },
      { id: "b", center: [-.3, -.46] as [number, number], depth: .2, radius: .1, color: [1,1,1] as [number, number, number], emphasis: 1 }];
    const scale = fitSeedScene(nodes, [0,0], { width: 320, height: 440 }, 844);
    expect(scale).toBeLessThan(1);
    const fitted = nodes.map(node => fitSpatialSeed(node, [0,0], scale));
    for (const node of fitted) expect(Math.abs(node.center[1]) + node.radius).toBeLessThan((220 - 12) / 844);
    const before = spatialPairMetrics(nodes[0], nodes[1]), after = spatialPairMetrics(fitted[0], fitted[1]);
    expect(after.distance / after.radii).toBeCloseTo(before.distance / before.radii, 10);
  });

  it("rejects projected overlap across distant depth planes and recognizes actual contact", () => {
    const a = { id: "a", center: [0, 0] as [number, number], radius: .1, depth: -.3, color: [1,1,1] as [number,number,number], emphasis: 1 };
    const b = { ...a, id: "b", depth: .3 };
    expect(canCaptureSpatialPair(a, b)).toBe(false);
    expect(spatialPairInContact(a, b)).toBe(false);
    expect(canCaptureSpatialPair(a, { ...b, depth: -.25, center: [.1, 0] })).toBe(true);
    expect(spatialPairInContact(a, { ...b, depth: -.25, center: [.1, 0] })).toBe(true);
  });
});
