import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FINISHES, type Finish } from './palette';

// El estudio de color: el carro en un estudio claro, con la pintura que elige la persona y que se
// gira con el dedo o el mouse. Este módulo (con three.js) se descarga solo cuando la sección está por
// verse y el navegador puede mostrarlo (ColorStudio.tsx).

export interface ColorStudio {
  setPaint(hex: string, finish: Finish): void;
  resize(): void;
  /** Detiene el dibujo cuando la sección no se ve o la pestaña está oculta. */
  setActive(active: boolean): void;
  dispose(): void;
}

export interface ColorStudioOptions {
  canvas: HTMLCanvasElement;
  modelUrl: string;
  initialColor: string;
  initialFinish: Finish;
  /** Que gire solo mientras nadie lo toca (no, con "reducir movimiento"). */
  autoRotate: boolean;
  /** La persona giró el carro: la sección oculta la pista "arrastre para girar". */
  onInteract: () => void;
  /** Se perdió el contexto de WebGL: la sección vuelve a la imagen fija. */
  onLost: () => void;
}

const CAR_LENGTH = 4.6;
const MAX_PIXEL_RATIO = 1.75;

/** La sombra bajo el carro: un degradado radial, sin luces que la calculen. */
function contactShadow(width: number, length: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(10,12,16,0.75)');
  gradient.addColorStop(0.5, 'rgba(10,12,16,0.38)');
  gradient.addColorStop(1, 'rgba(10,12,16,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new Mesh(
    new PlaneGeometry(width * 1.7, length * 1.3),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.005;
  return mesh;
}

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
  }
  material.dispose();
}

export async function createColorStudio(options: ColorStudioOptions): Promise<ColorStudio> {
  const { canvas, modelUrl, onInteract, onLost } = options;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  // Neutral (Khronos PBR Neutral) respeta el color elegido; ACES vuelve naranja el amarillo.
  renderer.toneMapping = NeutralToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const handleLost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', handleLost);

  const scene = new Scene();
  // Reflejos de estudio fotográfico (paneles de luz en un cuarto claro).
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.03);
  room.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
  });
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.75;

  const key = new DirectionalLight('#ffffff', 1.4);
  key.position.set(4, 8, 6);
  scene.add(key);

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(modelUrl);
  const car = gltf.scene;

  // La pintura que se cambia, y lo demás del carro con materiales de taller.
  let paint: MeshPhysicalMaterial | null = null;
  const replaced = new Map<Material, Material>();
  const replacement = (source: Material): Material | null => {
    const std = source as MeshStandardMaterial;
    switch (source.name) {
      case 'Paint 1 Carmine':
        paint = new MeshPhysicalMaterial({
          name: 'Paint',
          color: options.initialColor,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          normalMap: std.normalMap,
          normalScale: std.normalScale.clone(),
          aoMap: std.aoMap,
          side: std.side,
        });
        return paint;
      case 'Paint 2 Carmine':
        return new MeshPhysicalMaterial({
          name: 'Trim',
          color: '#0d0f12',
          metalness: 0.4,
          roughness: 0.3,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          aoMap: std.aoMap,
          side: std.side,
        });
      case 'Glass':
        // Oscuro y con poco reflejo: con barniz, el cuarto claro lo dejaba casi blanco.
        return new MeshPhysicalMaterial({ name: 'Glass', color: '#05070a', roughness: 0.06, envMapIntensity: 0.3, side: DoubleSide });
      case 'Mirror':
        return new MeshStandardMaterial({ name: 'Mirror', color: '#e3e6ea', metalness: 1, roughness: 0.04 });
      case 'Rim2':
        return new MeshStandardMaterial({ name: 'Rim', color: '#2f333a', metalness: 1, roughness: 0.25, aoMap: std.aoMap });
      case 'Brake':
        return new MeshStandardMaterial({ name: 'Caliper', color: '#f5b800', metalness: 0.4, roughness: 0.35, aoMap: std.aoMap });
      case 'Headlight':
        return new MeshStandardMaterial({ name: 'Headlight', color: '#111', emissive: '#fff6e0', emissiveIntensity: 2.4 });
      case 'Brakelight':
        return new MeshStandardMaterial({ name: 'Brakelight', color: '#220000', emissive: '#ff2a1a', emissiveIntensity: 1.2 });
      default:
        return null;
    }
  };
  car.traverse((object: Object3D) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: Material) => {
      if (!replaced.has(material)) replaced.set(material, replacement(material) ?? material);
      return replaced.get(material)!;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  // Solo el material: sus texturas (hojuelas, oclusión) siguen en uso en los reemplazos.
  for (const [original, next] of replaced) if (original !== next) original.dispose();
  const paintMaterial = paint as MeshPhysicalMaterial | null;
  if (!paintMaterial) throw new Error('El modelo no trae la pintura esperada ("Paint 1 Carmine").');
  const flakeScale = paintMaterial.normalScale.clone();

  // Centrado, con las llantas en el piso y el frente hacia la cámara inicial.
  const pivot = new Group();
  pivot.add(car);
  let box = new Box3().setFromObject(car);
  const raw = box.getSize(new Vector3());
  pivot.scale.setScalar(CAR_LENGTH / Math.max(raw.x, raw.z));
  pivot.updateMatrixWorld(true);
  box = new Box3().setFromObject(car);
  const center = box.getCenter(new Vector3());
  pivot.position.set(-center.x, -box.min.y, -center.z);
  pivot.updateMatrixWorld(true);
  box = new Box3().setFromObject(car);
  const size = box.getSize(new Vector3());
  scene.add(pivot);
  const lengthAlongX = size.x > size.z;
  const frontPart = car.getObjectByName('WheelFrontL');
  const frontSign = frontPart ? Math.sign(lengthAlongX ? frontPart.getWorldPosition(new Vector3()).x : frontPart.getWorldPosition(new Vector3()).z) || 1 : 1;
  const front = lengthAlongX ? new Vector3(frontSign, 0, 0) : new Vector3(0, 0, frontSign);
  const side = new Vector3().crossVectors(new Vector3(0, 1, 0), front);
  const shadow = contactShadow(lengthAlongX ? size.z : size.x, lengthAlongX ? size.x : size.z);
  if (lengthAlongX) shadow.rotation.z = Math.PI / 2;
  scene.add(shadow);

  const target = new Vector3(0, size.y * 0.45, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = MathUtils.degToRad(55);
  controls.maxPolarAngle = MathUtils.degToRad(84);
  controls.autoRotate = options.autoRotate;
  controls.autoRotateSpeed = 0.7;
  // En el teléfono, deslizar hacia arriba o abajo sigue bajando la página; de lado, gira el carro.
  canvas.style.touchAction = 'pan-y';
  const onStart = () => {
    controls.autoRotate = false;
    onInteract();
  };
  controls.addEventListener('start', onStart);

  let width = 1;
  let height = 1;
  // OrbitControls ya movió la cámara al crearse: el ángulo inicial se pone una vez, con esta marca.
  let placed = false;
  const fit = () => {
    const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
    // Lo que pida más distancia: el largo del carro a lo ancho o su alto.
    const byWidth = (CAR_LENGTH * 0.54) / (camera.aspect * tanHalf);
    const byHeight = (size.y * 1.5) / tanHalf;
    return Math.max(byWidth, byHeight);
  };
  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const distance = fit();
    // Conserva el ángulo que eligió la persona; solo ajusta la distancia.
    const offset = camera.position.clone().sub(target);
    if (!placed) {
      placed = true;
      const azimuth = MathUtils.degToRad(50);
      const elevation = MathUtils.degToRad(14);
      offset
        .copy(front)
        .multiplyScalar(Math.cos(azimuth) * Math.cos(elevation))
        .addScaledVector(side, Math.sin(azimuth) * Math.cos(elevation))
        .setY(Math.sin(elevation));
    }
    camera.position.copy(target).add(offset.setLength(distance));
    controls.minDistance = controls.maxDistance = distance;
    controls.update();
  };

  // La pintura cambia en medio segundo, no de golpe.
  const from = { color: new Color(options.initialColor), metalness: 0, roughness: 0, clearcoat: 1, flakes: 0 };
  const to = { ...from, color: new Color(options.initialColor) };
  let blend = 1;
  const applyFinish = (finish: Finish) => {
    const f = FINISHES[finish];
    to.metalness = f.metalness;
    to.roughness = f.roughness;
    to.clearcoat = f.clearcoat;
    to.flakes = f.flakes;
  };
  applyFinish(options.initialFinish);
  Object.assign(from, { metalness: to.metalness, roughness: to.roughness, clearcoat: to.clearcoat, flakes: to.flakes });
  const paintNow = (t: number) => {
    const e = t * t * (3 - 2 * t);
    paintMaterial.color.copy(from.color).lerp(to.color, e);
    paintMaterial.metalness = MathUtils.lerp(from.metalness, to.metalness, e);
    paintMaterial.roughness = MathUtils.lerp(from.roughness, to.roughness, e);
    // El barniz no baja a 0 (cambiaría el shader y se congelaría un instante): mate es barniz áspero.
    paintMaterial.clearcoat = Math.max(0.02, MathUtils.lerp(from.clearcoat, to.clearcoat, e));
    paintMaterial.clearcoatRoughness = MathUtils.lerp(0.6, 0.03, paintMaterial.clearcoat);
    paintMaterial.normalScale.copy(flakeScale).multiplyScalar(MathUtils.lerp(from.flakes, to.flakes, e));
  };
  paintNow(1);

  resize();
  await renderer.compileAsync(scene, camera);

  let frame = 0;
  let last = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 0.5);
      paintNow(blend);
    }
    controls.update(dt);
    renderer.render(scene, camera);
  };
  const start = () => {
    if (!frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  start();

  return {
    setPaint(hex, finish) {
      from.color.copy(paintMaterial.color);
      from.metalness = paintMaterial.metalness;
      from.roughness = paintMaterial.roughness;
      from.clearcoat = paintMaterial.clearcoat;
      from.flakes = flakeScale.x ? paintMaterial.normalScale.x / flakeScale.x : 0;
      to.color.set(hex);
      applyFinish(finish);
      blend = 0;
    },
    resize,
    setActive(active) {
      if (active) start();
      else stop();
    },
    dispose() {
      stop();
      controls.removeEventListener('start', onStart);
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', handleLost);
      scene.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) disposeMaterial(material);
      });
      environment.dispose();
      renderer.dispose();
    },
  };
}
