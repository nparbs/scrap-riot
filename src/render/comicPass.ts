import * as THREE from 'three';

const MSAA_SAMPLES = 4;
/** Ink lines are this many pixels wider for each step of this much screen height, so they look the same on any screen. */
const INK_HEIGHT_STEP = 720;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float inkWidth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float pixelAngle;
  uniform float inkFadeNear;
  uniform float inkFadeFar;
  uniform mat4 clipToView;
  uniform mat4 viewToWorld;
  varying vec2 vUv;

  const vec3 INK = vec3(0.012, 0.01, 0.008);
  const float BANDS = 6.0;
  const float BAND_EDGE = 0.2;
  const float FLATTEN = 0.65;
  /** Dark colours only lift this far, or a night sky's near-black buildings would turn bright blue. */
  const float MOST_LIFT = 1.35;
  const float SATURATION = 1.15;
  const float HATCH_DENSITY = 7.0;
  const float HATCH_STRENGTH = 0.3;

  float depthAt(vec2 pixels) {
    return texture2D(tDepth, vUv + pixels * texel * inkWidth).x;
  }

  float distanceAt(float depth) {
    return (cameraNear * cameraFar) / (cameraFar - depth * (cameraFar - cameraNear));
  }

  // The depth buffer changes evenly across any flat surface, whatever its angle, so how far a pixel
  // is from the average of two opposite neighbours is exactly zero on a flat and only shows up at
  // a corner or a drop. Dividing by the slope stops surfaces seen edge-on, like a floor in the
  // distance, from turning their tiny bumps into lines.
  float inkAt(float depth, float dist) {
    float l = depthAt(vec2(-1.0, 0.0));
    float r = depthAt(vec2(1.0, 0.0));
    float d = depthAt(vec2(0.0, -1.0));
    float u = depthAt(vec2(0.0, 1.0));
    float dl = depthAt(vec2(-1.0, -1.0));
    float ur = depthAt(vec2(1.0, 1.0));
    float ul = depthAt(vec2(-1.0, 1.0));
    float dr = depthAt(vec2(1.0, -1.0));
    float bend = max(
      max(abs(l + r - 2.0 * depth), abs(d + u - 2.0 * depth)),
      max(abs(dl + ur - 2.0 * depth), abs(ul + dr - 2.0 * depth))
    );
    float slope = 0.5 * max(max(abs(r - l), abs(u - d)), max(abs(ur - dl), abs(dr - ul)));
    // From depth buffer units into how many units the surface turns per unit across the screen.
    float scale = dist * (cameraFar - cameraNear) / (cameraNear * cameraFar * pixelAngle * inkWidth);
    float edge = bend * scale / (1.0 + slope * scale);
    // Taken from the nearest thing here, or an outline would vanish on the side facing the sky.
    float nearest = min(depth, min(min(min(l, r), min(d, u)), min(min(dl, ur), min(ul, dr))));
    return smoothstep(0.55, 1.15, edge) * (1.0 - smoothstep(inkFadeNear, inkFadeFar, distanceAt(nearest)));
  }

  // Flat steps of light, each a band's middle so the darkest band isn't plain black and the ink still shows on it.
  float flatLight(float light) {
    float steps = light * BANDS;
    float band = floor(steps);
    return (band + 0.5 + smoothstep(1.0 - BAND_EDGE, 1.0, steps - band)) / BANDS;
  }

  // Lines drawn on the world, not the screen, so they stay on the ground as the camera moves.
  float hatchAt(float depth, float light) {
    vec4 view = clipToView * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 world = (viewToWorld * vec4(view.xyz / view.w, 1.0)).xyz;
    float phase = (world.x + 0.6 * world.y - world.z) * HATCH_DENSITY;
    float blur = fwidth(phase) + 0.001;
    float line = smoothstep(0.38 - blur, 0.38 + blur, abs(fract(phase) - 0.5));
    // Too fine to draw far away, where it would only shimmer.
    return line * (1.0 - smoothstep(0.05, 0.2, light)) * (1.0 - smoothstep(0.3, 0.7, blur));
  }

  void main() {
    vec4 source = texture2D(tColor, vUv);
    float depth = texture2D(tDepth, vUv).x;
    vec3 color = source.rgb;
    // The sky is left as painted.
    if (depth < 1.0) {
      float light = dot(color, vec3(0.299, 0.587, 0.114));
      color = max(mix(vec3(light), color, SATURATION), 0.0);
      color *= mix(1.0, min(flatLight(light) / max(light, 0.001), MOST_LIFT), FLATTEN);
      color *= 1.0 - HATCH_STRENGTH * hatchAt(depth, light);
    }
    float ink = inkAt(depth, distanceAt(depth));
    gl_FragColor = vec4(mix(color, INK, ink), max(source.a, ink));
  }
`;

/**
 * The comic book look: black ink around every shape, flat steps of light and hatching in the
 * shadows, drawn over the finished picture. It reads the depth the scene already wrote, so it never
 * draws the scene twice, and materials don't need to know about it.
 */
export class ComicPass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Scene;
  private readonly quadCamera = new THREE.OrthographicCamera();
  private readonly size = new THREE.Vector4();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      colorSpace: THREE.SRGBColorSpace,
      internalFormat: 'RGBA8',
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    // Three's own switch for a target that stands in for the screen, normally used for VR. Materials
    // then tone map and blend just as they do on the canvas. A normal target blends in linear colour,
    // where skylights go nearly solid and hide the robots under them, and that would be unfair online.
    Object.assign(this.target, { isXRRenderTarget: true });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2() },
        inkWidth: { value: 1 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        pixelAngle: { value: 0.001 },
        inkFadeNear: { value: 0 },
        inkFadeFar: { value: 1 },
        clipToView: { value: new THREE.Matrix4() },
        viewToWorld: { value: new THREE.Matrix4() },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quad = new THREE.Scene();
    this.quad.add(quad);
  }

  /** Draws into whatever part of the canvas the renderer's viewport and scissor are set to. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, smooth: boolean): void {
    const { renderer, target } = this;
    const { width, height } = renderer.getCurrentViewport(this.size);
    target.setSize(width, height);
    const samples = smooth ? MSAA_SAMPLES : 0;
    if (target.samples !== samples) {
      target.samples = samples;
      target.dispose();
    }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    const { uniforms } = this.material;
    uniforms.texel.value.set(1 / width, 1 / height);
    uniforms.inkWidth.value = Math.max(1, Math.round(height / INK_HEIGHT_STEP));
    uniforms.cameraNear.value = camera.near;
    uniforms.cameraFar.value = camera.far;
    uniforms.pixelAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
    // Ink gives out before the fog does, so a far off skyline doesn't turn into a mess of black lines.
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    uniforms.inkFadeNear.value = fog ? fog.near : camera.far;
    uniforms.inkFadeFar.value = fog ? (fog.near + fog.far) / 2 : camera.far * 2;
    uniforms.clipToView.value.copy(camera.projectionMatrixInverse);
    uniforms.viewToWorld.value.copy(camera.matrixWorld);
    renderer.render(this.quad, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    (this.quad.children[0] as THREE.Mesh).geometry.dispose();
  }
}
