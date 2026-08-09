import {
  createDialogueMetaballRenderer,
  DIALOGUE_METABALL_SMOOTHNESS
} from "./renderer";
import {
  DIALOGUE_METABALL_FRAGMENT_SHADER,
  DIALOGUE_METABALL_VERTEX_SHADER
} from "./shaders";

type MockWebGLRenderer = {
  setClearColor: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
};

const threeMocks = vi.hoisted(() => ({
  renderers: [] as MockWebGLRenderer[],
  materials: [] as Array<{ uniforms: Record<string, { value: unknown }>; dispose: ReturnType<typeof vi.fn> }>,
  geometries: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>
}));

vi.mock("three", () => {
  class Vector2 {
    constructor(
      public x = 0,
      public y = 0
    ) {}

    set(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
  }

  class Vector3 {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0
    ) {}

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  class Scene {
    add = vi.fn();
  }

  class OrthographicCamera {}

  class PlaneGeometry {
    dispose = vi.fn();

    constructor() {
      threeMocks.geometries.push(this);
    }
  }

  class ShaderMaterial {
    uniforms: Record<string, { value: unknown }>;
    dispose = vi.fn();

    constructor(options: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = options.uniforms;
      threeMocks.materials.push(this);
    }
  }

  class Mesh {
    constructor(
      public geometry: PlaneGeometry,
      public material: ShaderMaterial
    ) {}
  }

  class WebGLRenderer {
    setClearColor = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();

    constructor() {
      threeMocks.renderers.push(this);
    }
  }

  return {
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    Vector2,
    Vector3,
    WebGLRenderer
  };
});

describe("dialogue metaball renderer", () => {
  beforeEach(() => {
    threeMocks.renderers.length = 0;
    threeMocks.materials.length = 0;
    threeMocks.geometries.length = 0;
  });

  it("ships the fixed raymarching shader contract", () => {
    expect(DIALOGUE_METABALL_VERTEX_SHADER).toContain("gl_Position");
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("#define MAX_METABALLS 8");
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("#define MAX_STEPS 52");
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("float sphereSdf");
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("float smin");
    expect(DIALOGUE_METABALL_FRAGMENT_SHADER).toContain("discard");
  });

  it("updates fixed uniforms without reallocating the renderer", () => {
    const canvas = document.createElement("canvas");
    const renderer = createDialogueMetaballRenderer(canvas, vi.fn());

    renderer.resize(800, 600, 1.25);
    renderer.resize(800, 600, 1.25);
    renderer.render(
      [
        {
          id: "root",
          center: [-0.1, 0.2],
          radius: 0.14,
          color: [0.82, 0.86, 0.9],
          emphasis: 1
        }
      ],
      2.5
    );

    const webglRenderer = threeMocks.renderers[0];
    const uniforms = threeMocks.materials[0].uniforms;
    expect(threeMocks.renderers).toHaveLength(1);
    expect(webglRenderer.setPixelRatio).toHaveBeenCalledOnce();
    expect(webglRenderer.setSize).toHaveBeenCalledOnce();
    expect(uniforms.uCount.value).toBe(1);
    expect(uniforms.uTime.value).toBe(2.5);
    expect(uniforms.uSmoothness.value).toBe(DIALOGUE_METABALL_SMOOTHNESS);
    expect(webglRenderer.render).toHaveBeenCalledOnce();
  });

  it("falls back on context loss and disposes owned resources once", () => {
    const canvas = document.createElement("canvas");
    const onContextLost = vi.fn();
    const renderer = createDialogueMetaballRenderer(canvas, onContextLost);
    const event = new Event("webglcontextlost", { cancelable: true });

    canvas.dispatchEvent(event);
    renderer.dispose();
    renderer.dispose();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    expect(event.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledOnce();
    expect(threeMocks.geometries[0].dispose).toHaveBeenCalledOnce();
    expect(threeMocks.materials[0].dispose).toHaveBeenCalledOnce();
    expect(threeMocks.renderers[0].dispose).toHaveBeenCalledOnce();
  });
});
