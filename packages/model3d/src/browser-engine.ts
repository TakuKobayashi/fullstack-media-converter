import {
  type AnimationAction,
  AnimationClip,
  AnimationMixer,
  ArrowHelper,
  Bone,
  Box3,
  BufferAttribute,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LoadingManager,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  SkeletonHelper,
  SphereGeometry,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  VectorKeyframeTrack,
  Vector3,
} from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import {
  FallbackCore,
  ThreeMmdLoader,
  type VmdBoneTrack,
  type VmdMorphTrack,
} from '@yohawing/three-mmd-loader';
import {
  MODEL3D_INPUT_EXTENSIONS,
  MODEL3D_OUTPUT_FORMATS,
  canConvert,
  getMimeType,
  model3dFormatMayContainBones,
  model3dOutputSupportsAnimations,
  model3dOutputSupportsBones,
  model3dOutputSupportsExpressions,
  type ConversionEngine,
  type ConversionJob,
  type ConversionOptions,
  type InputFormat,
  type Model3dFormat,
  type Model3dOutputFormat,
  type Model3dTransparencySettings,
  type OutputFormat,
} from '@convertmate/shared';

const MMD_VRM_TARGET_HEIGHT_METERS = 1.7;
const MMD_BAKE_LIGHT = new Vector3(0.5, 1, 1).normalize();

function asArray<T>(value: T | T[]): T[] {
  return [value].flat() as T[];
}

function preserveArrayShape<T>(source: T | T[], values: T[]): T | T[] {
  return Array.isArray(source) ? values : values[0];
}

function configureMaterials(material: Material | Material[], properties: Partial<Material>): void {
  asArray(material).forEach((entry) => Object.assign(entry, properties));
}

/**
 * Tunable thresholds used when converting MMD transparency to glTF/VRM.
 *
 * These values are intentionally kept together so models with different alpha
 * conventions can be tested without changing the conversion algorithm itself.
 */
export const MMD_TRANSPARENCY_THRESHOLDS = {
  /**
   * A PMX/PMD material alpha below this value is treated as true translucent
   * BLEND. Lower this value to keep nearly opaque materials out of BLEND.
   */
  materialOpaqueMinAlpha: 1,

  /**
   * Texture alpha values at or below this byte value count as fully transparent.
   * Increase it to absorb very faint pixels into the transparent population.
   */
  textureTransparentMaxAlphaByte: 64,

  /**
   * Texture alpha values at or above this byte value count as fully opaque.
   * Lower it to treat nearly opaque pixels as opaque instead of intermediate.
   */
  textureOpaqueMinAlphaByte: 224,

  /**
   * Maximum share of intermediate-alpha pixels allowed for a cutout texture.
   * Increase it to classify more antialiased textures as MASK instead of BLEND.
   * The value is a ratio from 0 to 1 (0.15 means 15%).
   */
  cutoutMaxIntermediateAlphaRatio: 0.15,

  /**
   * A texture-driven BLEND with at least this share of near-transparent and
   * near-opaque pixels is treated as a layered cutout and writes to the depth
   * buffer. Lower it if layered bangs still lose the transparent render order.
   */
  blendZWriteMinExtremeAlphaRatio: 0.6,

  /**
   * Minimum alpha cutoff written for MASK materials. Increasing it removes more
   * faint pixels; decreasing it preserves softer edges.
   */
  maskMinAlphaCutoff: 0.01,

  /**
   * VRM MToon permits a render-queue offset in the -9 to +9 range. This controls
   * how many source material-order steps are retained for transparent materials.
   */
  mtoonRenderQueueOffsetLimit: 9,
} as const satisfies Model3dTransparencySettings;

/** Set this to true to print one alpha-analysis record per converted MMD material. */
export const MMD_TRANSPARENCY_DIAGNOSTICS_ENABLED = false;

type MmdTransparencyMode = 'opaque' | 'alphaTest' | 'alphaBlend';

interface MmdTransparencyAnalysis {
  mode: MmdTransparencyMode;
  materialAlpha: number;
  transparentPixels: number;
  intermediatePixels: number;
  opaquePixels: number;
  intermediateRatio: number;
  extremeRatio: number;
  textureDrivenBlendWithZWrite: boolean;
}

export interface Model3dPreviewSession {
  root: Object3D;
  boneOverlay: Object3D;
  animations: string[];
  expressions: string[];
  bones: string[];
  playAnimation(name: string): void;
  pauseAnimation(): void;
  stopAnimation(): void;
  selectExpression(name: string): void;
  resetExpressions(): void;
  showBones(visible: boolean): void;
  selectBone(name: string): void;
  update(deltaSeconds: number): void;
  updateTransparency(settings: Model3dTransparencySettings): void;
  dispose(): void;
}

/** @deprecated Use Model3dPreviewSession. */
export type VrmPreviewSession = Model3dPreviewSession;

export type Model3dAnimationOutputFormat = 'glb' | 'gltf' | 'vrma' | 'three-json';
export interface Model3dAnimationSource {
  file: File;
  format: Model3dFormat;
  clipIndex: number;
  clipName: string;
}
export interface Model3dSourceInspection {
  hasMesh: boolean;
  animations: Array<{ index: number; name: string }>;
}

export class BrowserModel3dEngine implements ConversionEngine {
  private readonly textureAlphaHistogramCache = new WeakMap<Texture, Uint32Array>();

  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    return (
      (MODEL3D_INPUT_EXTENSIONS as readonly string[]).includes(`.${inputFormat}`) &&
      (MODEL3D_OUTPUT_FORMATS as readonly string[]).includes(outputFormat) &&
      canConvert(inputFormat, outputFormat)
    );
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    const objectUrls: string[] = [];
    try {
      options.onProgress?.(5);
      const source = job.file.source;
      if (!(source instanceof File) && !(source instanceof ArrayBuffer)) {
        throw new Error('Browser model conversion requires a File or ArrayBuffer.');
      }
      const auxiliaryFiles =
        options.model3d?.auxiliaryFilesByJobId?.[job.id] ?? options.model3d?.auxiliaryFiles ?? [];
      const manager = this.createLoadingManager(auxiliaryFiles, objectUrls);
      const root = await this.loadModel(source, job.inputFormat, auxiliaryFiles, manager);
      options.onProgress?.(45);
      const preserveBones =
        model3dFormatMayContainBones(job.inputFormat as Model3dFormat) &&
        model3dOutputSupportsBones(job.outputFormat as Model3dOutputFormat);
      if (!preserveBones) this.makeStatic(root);
      if (
        (job.inputFormat === 'pmx' || job.inputFormat === 'pmd') &&
        (job.outputFormat === 'glb' || job.outputFormat === 'gltf' || job.outputFormat === 'vrm')
      ) {
        const transparency =
          options.model3d?.transparencyByFileName?.[job.file.name] ??
          options.model3d?.transparency ??
          MMD_TRANSPARENCY_THRESHOLDS;
        if (job.outputFormat === 'glb' || job.outputFormat === 'gltf') {
          await this.bakeMmdRgbMaterials(root);
        }
        this.applyMmdPortableMaterials(root, transparency, job.outputFormat === 'vrm');
      }
      if ((job.inputFormat === 'pmx' || job.inputFormat === 'pmd') && job.outputFormat === 'vrm') {
        this.prepareMmdVrmHumanoidHierarchy(root);
        this.normalizeMmdVrmScale(root);
      }
      options.onProgress?.(65);
      const baseName = job.file.name.replace(/\.[^.]+$/, '');
      const blobs: Array<{ name: string; blob: Blob }> = [];
      let hasMesh = false;
      root.traverse((object) => {
        if ((object as Mesh).isMesh) hasMesh = true;
      });
      if (job.outputFormat !== 'vrm' || hasMesh) {
        const blob = await this.exportModel(
          root,
          job.outputFormat as Model3dOutputFormat,
          job.file.name,
          job.inputFormat,
          [],
        );
        if (!blob.size) throw new Error('Conversion produced an empty model file.');
        blobs.push({ name: `${baseName}.${job.outputFormat}`, blob });
      }
      if (!blobs.length) throw new Error('No model or animation data was found to export.');
      options.onProgress?.(95);
      const outputs = blobs.map(({ name, blob }) => ({
        name,
        url: URL.createObjectURL(blob),
        mimeType: blob.type || 'application/octet-stream',
      }));
      return {
        ...job,
        resultUrl: outputs[0]?.url,
        outputs,
        status: 'done',
        progress: 100,
      };
    } catch (error) {
      return {
        ...job,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  async validateVrmConversion(
    job: ConversionJob,
    auxiliaryFiles: File[],
    transparency: Model3dTransparencySettings,
  ): Promise<{ valid: boolean; error?: string }> {
    const result = await this.convert(
      { ...job, outputFormat: 'vrm', status: 'pending', progress: 0 },
      { model3d: { auxiliaryFiles, transparency } },
    );
    const urls = new Set(result.outputs?.map((output) => output.url) ?? []);
    if (result.resultUrl) urls.add(result.resultUrl);
    urls.forEach((url) => URL.revokeObjectURL(url));
    return result.status === 'done'
      ? { valid: true }
      : { valid: false, error: result.error ?? 'VRM conversion is not supported for this model.' };
  }

  async createModel3dPreviewSession(
    job: ConversionJob,
    auxiliaryFiles: File[],
    initialSettings: Model3dTransparencySettings,
    animationSources: Model3dAnimationSource[] = [],
  ): Promise<Model3dPreviewSession> {
    const source = job.file.source;
    if (!(source instanceof File) && !(source instanceof ArrayBuffer)) {
      throw new Error('Browser model preview requires a File or ArrayBuffer.');
    }
    const objectUrls: string[] = [];
    const manager = this.createLoadingManager(auxiliaryFiles, objectUrls);
    const root = await this.loadModel(source, job.inputFormat, auxiliaryFiles, manager);
    // Preview animations come exclusively from the separately listed animation assets.
    root.animations = [];
    const loadedAnimationRoots = new Map<File, Object3D>();
    for (const animationSource of animationSources) {
      let animationRoot = loadedAnimationRoots.get(animationSource.file);
      if (!animationRoot) {
        animationRoot = await this.loadModel(
          animationSource.file,
          animationSource.format,
          auxiliaryFiles,
          manager,
        );
        loadedAnimationRoots.set(animationSource.file, animationRoot);
      }
      const clip = animationRoot.animations?.[animationSource.clipIndex];
      if (clip) {
        const previewClip = this.retargetPreviewClip(animationRoot, root, clip);
        previewClip.name = animationSource.clipName;
        root.animations.push(previewClip);
      }
    }
    const isMmd = job.inputFormat === 'pmx' || job.inputFormat === 'pmd';
    if (isMmd && (job.outputFormat === 'glb' || job.outputFormat === 'gltf')) {
      await this.bakeMmdRgbMaterials(root);
    }
    const materialSources = new Map<Mesh, Material[]>();
    const generatedMaterials = new Set<Material>();
    let maxMaterialIndex = 0;
    if (isMmd) {
      root.traverse((object) => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        const materials = asArray(mesh.material);
        materialSources.set(mesh, materials);
        for (const material of materials) {
          maxMaterialIndex = Math.max(
            maxMaterialIndex,
            (material.userData.mmdMaterial as { materialIndex?: number } | undefined)
              ?.materialIndex ?? 0,
          );
        }
      });
      if (job.outputFormat === 'vrm') {
        this.prepareMmdVrmHumanoidHierarchy(root);
        this.normalizeMmdVrmScale(root);
      }
    }
    const updateTransparency = (settings: Model3dTransparencySettings) => {
      if (!isMmd) return;
      for (const material of generatedMaterials) material.dispose();
      generatedMaterials.clear();
      for (const [mesh, sources] of materialSources) {
        const converted = sources.map((source) => {
          const metadata = source.userData.mmdMaterial as
            | {
                diffuse?: [number, number, number, number];
                ambient?: [number, number, number];
                specular?: [number, number, number];
                materialIndex?: number;
                transparencyMode?: MmdTransparencyMode;
                sphereMode?: 'none' | 'multiply' | 'add' | 'subTexture';
                edgeColor?: [number, number, number, number];
                edgeSize?: number;
                flags?: { doubleSided?: boolean; edge?: boolean };
              }
            | undefined;
          if (!metadata) return source;
          const convertedMaterial = this.createMmdPortableMaterial(
            source,
            metadata,
            source as Material & {
              map?: Texture | null;
              opacity?: number;
              alphaTest?: number;
              transparent?: boolean;
              side?: number;
            },
            maxMaterialIndex,
            settings,
            job.outputFormat === 'vrm',
          );
          generatedMaterials.add(convertedMaterial);
          return convertedMaterial;
        });
        mesh.material = preserveArrayShape(mesh.material, converted);
      }
    };
    updateTransparency(initialSettings);
    const animationClips = new Map<string, AnimationClip>();
    root.animations.forEach((clip, index) => {
      const baseName = clip.name.trim() || `Animation ${index + 1}`;
      let name = baseName;
      let suffix = 2;
      while (animationClips.has(name)) name = `${baseName} (${suffix++})`;
      animationClips.set(name, clip);
    });
    const mixer = new AnimationMixer(root);
    let currentAction: AnimationAction | undefined;
    let currentAnimationName: string | undefined;
    const expressionTargets = new Map<string, Array<{ mesh: Mesh; index: number }>>();
    const expressionNodes = new Map<string, Object3D[]>();
    const initialMorphWeights = new Map<Mesh, number[]>();
    const initialExpressionNodeX = new Map<Object3D, number>();
    root.traverse((object) => {
      const expressionMatch = object.name.match(/^VRMAExpression(?:Preset|Custom)__(.+)$/);
      if (expressionMatch?.[1]) {
        const targets = expressionNodes.get(expressionMatch[1]) ?? [];
        targets.push(object);
        expressionNodes.set(expressionMatch[1], targets);
        initialExpressionNodeX.set(object, object.position.x);
      }
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
      initialMorphWeights.set(mesh, [...mesh.morphTargetInfluences]);
      Object.entries(mesh.morphTargetDictionary).forEach(([name, index]) => {
        const targets = expressionTargets.get(name) ?? [];
        targets.push({ mesh, index });
        expressionTargets.set(name, targets);
      });
    });
    const resetExpressions = () => {
      initialMorphWeights.forEach((weights, mesh) => {
        if (!mesh.morphTargetInfluences) return;
        weights.forEach((weight, index) => {
          mesh.morphTargetInfluences![index] = weight;
        });
      });
      initialExpressionNodeX.forEach((weight, node) => {
        node.position.x = weight;
      });
    };
    const outputFormat = job.outputFormat as Model3dOutputFormat;
    const previewAnimations = model3dOutputSupportsAnimations(outputFormat);
    const previewExpressions = model3dOutputSupportsExpressions(outputFormat);
    const previewBones = model3dOutputSupportsBones(outputFormat);
    const boneOverlay = new Group();
    boneOverlay.name = 'PreviewBoneOverlay';
    boneOverlay.visible = false;
    const skeletonHelper = new SkeletonHelper(root);
    configureMaterials(skeletonHelper.material, {
      transparent: true,
      opacity: 0.28,
      depthTest: false,
    });
    boneOverlay.add(skeletonHelper);
    const boneObjects = new Map<string, Bone>();
    root.updateMatrixWorld(true);
    const previewBounds = new Box3().setFromObject(root);
    const previewSize = previewBounds.getSize(new Vector3());
    const markerRadius = Math.max(previewSize.length() * 0.012, 0.006);
    const bones: Bone[] = [];
    const directionalBoneArrows: Array<{ bone: Bone; child: Bone; arrow: ArrowHelper }> = [];
    root.traverse((object) => {
      if ((object as Bone).isBone) bones.push(object as Bone);
    });
    bones.forEach((bone, index) => {
      const baseName = bone.name.trim() || `Bone ${index + 1}`;
      let name = baseName;
      let suffix = 2;
      while (boneObjects.has(name)) name = `${baseName} (${suffix++})`;
      boneObjects.set(name, bone);
      const childBone = bone.children.find((child) => (child as Bone).isBone) as Bone | undefined;
      if (!childBone) return;
      const from = bone.getWorldPosition(new Vector3());
      const to = childBone.getWorldPosition(new Vector3());
      const length = from.distanceTo(to);
      if (length <= 0) return;
      const arrow = new ArrowHelper(
        to.clone().sub(from).normalize(),
        from,
        length,
        0x93a4c7,
        Math.min(length * 0.2, markerRadius * 2),
        Math.min(length * 0.12, markerRadius),
      );
      configureMaterials(arrow.line.material, { transparent: true, opacity: 0.2, depthTest: false });
      configureMaterials(arrow.cone.material, { transparent: true, opacity: 0.2, depthTest: false });
      boneOverlay.add(arrow);
      directionalBoneArrows.push({ bone, child: childBone, arrow });
    });
    const selectedBoneMarker = new Mesh(
      new SphereGeometry(markerRadius, 16, 12),
      new MeshBasicMaterial({ color: 0xffd24d, depthTest: false, depthWrite: false }),
    );
    const selectedBoneArrow = new ArrowHelper(
      new Vector3(0, 1, 0),
      new Vector3(),
      markerRadius * 8,
      0xff7a45,
      markerRadius * 2.5,
      markerRadius * 1.4,
    );
    selectedBoneMarker.visible = false;
    selectedBoneArrow.visible = false;
    selectedBoneMarker.renderOrder = 1000;
    selectedBoneArrow.line.renderOrder = 1000;
    selectedBoneArrow.cone.renderOrder = 1000;
    configureMaterials(selectedBoneArrow.line.material, { depthWrite: false });
    configureMaterials(selectedBoneArrow.cone.material, { depthWrite: false });
    boneOverlay.add(selectedBoneMarker, selectedBoneArrow);
    let selectedBoneObject: Bone | undefined;
    const updateBoneOverlay = () => {
      if (!boneOverlay.visible) return;
      root.updateMatrixWorld(true);
      directionalBoneArrows.forEach(({ bone, child, arrow }) => {
        const from = bone.getWorldPosition(new Vector3());
        const to = child.getWorldPosition(new Vector3());
        const length = from.distanceTo(to);
        if (length <= 0) return;
        arrow.position.copy(from);
        arrow.setDirection(to.sub(from).normalize());
        arrow.setLength(
          length,
          Math.min(length * 0.2, markerRadius * 2),
          Math.min(length * 0.12, markerRadius),
        );
      });
      if (!selectedBoneObject) return;
      const position = selectedBoneObject.getWorldPosition(new Vector3());
      const childBone = selectedBoneObject.children.find((child) => (child as Bone).isBone) as
        | Bone
        | undefined;
      const childPosition = childBone?.getWorldPosition(new Vector3());
      const direction = childPosition
        ? childPosition.clone().sub(position).normalize()
        : new Vector3(0, 1, 0)
            .applyQuaternion(selectedBoneObject.getWorldQuaternion(new Quaternion()))
            .normalize();
      const childLength = childPosition ? position.distanceTo(childPosition) : markerRadius * 8;
      selectedBoneMarker.position.copy(position);
      selectedBoneArrow.position.copy(position);
      selectedBoneArrow.setDirection(direction);
      selectedBoneArrow.setLength(
        Math.max(childLength, markerRadius * 5),
        markerRadius * 2.5,
        markerRadius * 1.4,
      );
    };
    return {
      root,
      boneOverlay,
      animations: previewAnimations ? [...animationClips.keys()] : [],
      expressions: previewExpressions
        ? [...new Set([...expressionTargets.keys(), ...expressionNodes.keys()])]
        : [],
      bones: previewBones ? [...boneObjects.keys()] : [],
      playAnimation: (name) => {
        const clip = animationClips.get(name);
        if (!clip) return;
        const existingAction = currentAnimationName === name ? currentAction : undefined;
        if (!existingAction) currentAction?.stop();
        const action = existingAction ?? mixer.clipAction(clip).reset();
        currentAction = action;
        currentAnimationName = name;
        action.paused = false;
        action.play();
      },
      pauseAnimation: () => {
        if (currentAction) currentAction.paused = true;
      },
      stopAnimation: () => {
        mixer.stopAllAction();
        currentAction = undefined;
        currentAnimationName = undefined;
        mixer.update(0);
      },
      selectExpression: (name) => {
        resetExpressions();
        for (const { mesh, index } of expressionTargets.get(name) ?? []) {
          if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = 1;
        }
        for (const node of expressionNodes.get(name) ?? []) node.position.x = 1;
      },
      resetExpressions,
      showBones: (visible) => {
        boneOverlay.visible = visible && previewBones;
      },
      selectBone: (name) => {
        if (!previewBones) return;
        const bone = boneObjects.get(name);
        selectedBoneObject = bone;
        if (!bone) {
          selectedBoneMarker.visible = false;
          selectedBoneArrow.visible = false;
          return;
        }
        selectedBoneMarker.visible = true;
        selectedBoneArrow.visible = true;
        updateBoneOverlay();
      },
      update: (deltaSeconds) => {
        mixer.update(deltaSeconds);
        updateBoneOverlay();
      },
      updateTransparency,
      dispose: () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
        skeletonHelper.dispose();
        directionalBoneArrows.forEach(({ arrow }) => arrow.dispose());
        selectedBoneMarker.geometry.dispose();
        asArray(selectedBoneMarker.material).forEach((material) => material.dispose());
        selectedBoneArrow.dispose();
        boneOverlay.clear();
        for (const material of generatedMaterials) material.dispose();
        for (const sources of materialSources.values()) {
          for (const material of sources) material.dispose();
        }
        root.traverse((object) => {
          if ((object as Mesh).isMesh) (object as Mesh).geometry.dispose();
        });
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
      },
    };
  }

  /** @deprecated Use createModel3dPreviewSession. */
  createVrmPreviewSession(
    job: ConversionJob,
    auxiliaryFiles: File[],
    initialSettings: Model3dTransparencySettings,
  ): Promise<Model3dPreviewSession> {
    return this.createModel3dPreviewSession(job, auxiliaryFiles, initialSettings);
  }

  private retargetPreviewClip(
    sourceRoot: Object3D,
    targetRoot: Object3D,
    clip: AnimationClip,
  ): AnimationClip {
    const describe = (root: Object3D) => {
      const nodes: Object3D[] = [];
      root.traverse((node) => nodes.push(node));
      const indices = new Map(nodes.map((node, index) => [node, index]));
      const humanBones = this.mapVrmHumanBones(nodes.map((node) => ({
        name: node.name,
        children: node.children
          .map((child) => indices.get(child))
          .filter((index): index is number => index !== undefined),
      })));
      return { nodes, humanBones };
    };
    const source = describe(sourceRoot);
    const target = describe(targetRoot);
    const sourceNameToHumanBone = new Map<string, string>();
    Object.entries(source.humanBones).forEach(([humanBone, binding]) => {
      const node = source.nodes[binding.node];
      if (node) sourceNameToHumanBone.set(node.name, humanBone);
    });
    const targetNameByHumanBone = new Map<string, string>();
    Object.entries(target.humanBones).forEach(([humanBone, binding]) => {
      const node = target.nodes[binding.node];
      if (node) targetNameByHumanBone.set(humanBone, node.name);
    });
    const result = clip.clone();
    result.tracks = result.tracks.map((track) => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const sourceName = parsed.nodeName;
      const humanBone = sourceNameToHumanBone.get(sourceName);
      const targetName = humanBone ? targetNameByHumanBone.get(humanBone) : undefined;
      if (!targetName || targetName === sourceName) return track;
      const retargeted = track.clone();
      retargeted.name = `${targetName}.${parsed.propertyName}`;
      return retargeted;
    });
    return result;
  }

  private createLoadingManager(files: File[], objectUrls: string[]): LoadingManager {
    const manager = new LoadingManager();
    const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
    manager.setURLModifier((url) => {
      const clean = decodeURIComponent(url.split(/[?#]/)[0].replace(/\\/g, '/'));
      const name = clean.split('/').pop()?.toLowerCase() ?? '';
      const file = byName.get(name);
      if (!file) return url;
      const objectUrl = URL.createObjectURL(file);
      objectUrls.push(objectUrl);
      return objectUrl;
    });
    return manager;
  }

  private normalizeMmdVrmScale(root: Object3D): void {
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root, true);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 1e-6) {
      throw new Error('Could not determine the MMD model height for VRM scale normalization.');
    }
    const scale = MMD_VRM_TARGET_HEIGHT_METERS / height;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error('Could not calculate a valid VRM scale for the MMD model.');
    }
    root.scale.multiplyScalar(scale);
    // ThreeMmdLoader already converts PMX/PMD positions, morphs and bones from
    // MMD's left-handed coordinates into Three.js/glTF coordinates by reversing
    // Z. Do not add another 180-degree root rotation here: three-vrm derives
    // its normalized humanoid axes from the exported world rest rotations, so
    // an extra root rotation mirrors VRMA motion during retargeting.
    root.updateMatrixWorld(true);
  }

  /**
   * Standard MMD rigs place upper-body and lower-body bones as siblings below
   * the center bone. VRM requires spine and both legs to descend from a hips
   * node located at the pelvis. Insert that semantic node without changing the
   * current world-space rest pose or any existing skin weights.
   */
  private prepareMmdVrmHumanoidHierarchy(root: Object3D): void {
    if (root.getObjectByName('VRM_Hips')) return;
    const normalize = (name: string) =>
      name
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
    const objects: Object3D[] = [];
    root.traverse((object) => objects.push(object));
    const find = (...aliases: string[]) => {
      const names = aliases.map(normalize);
      return objects.find((object) => names.includes(normalize(object.name)));
    };
    const center = find('センター', 'center');
    const lowerBody = find('下半身', 'lowerbody', 'pelvis');
    const upperBody = find('上半身', 'upperbody', 'spine');
    if (!center || !lowerBody || !upperBody || lowerBody === upperBody) return;

    const isDescendantOf = (object: Object3D, ancestor: Object3D) => {
      let current = object.parent;
      while (current) {
        if (current === ancestor) return true;
        current = current.parent;
      }
      return false;
    };
    // Some rigs already have the required anatomical hierarchy.
    if (isDescendantOf(upperBody, lowerBody)) return;

    root.updateMatrixWorld(true);
    const pelvisWorldPosition = lowerBody.getWorldPosition(new Vector3());
    const hips = new Bone();
    hips.name = 'VRM_Hips';
    center.add(hips);
    hips.position.copy(center.worldToLocal(pelvisWorldPosition.clone()));
    hips.quaternion.identity();
    hips.scale.set(1, 1, 1);
    hips.updateMatrixWorld(true);
    // attach() retains the children's current world transforms, so the rest
    // mesh and the inverse-bind relationship remain visually unchanged.
    hips.attach(lowerBody);
    hips.attach(upperBody);
    root.updateMatrixWorld(true);
  }

  private async loadModel(
    source: File | ArrayBuffer,
    format: InputFormat,
    auxiliaryFiles: File[],
    manager: LoadingManager,
  ): Promise<Object3D> {
    const buffer = source instanceof File ? await source.arrayBuffer() : source;
    const text = () => new TextDecoder().decode(buffer);
    switch (format) {
      case 'fbx':
        return new FBXLoader(manager).parse(buffer, '');
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtl = auxiliaryFiles.find((file) => file.name.toLowerCase().endsWith('.mtl'));
        if (mtl) {
          const materials = new MTLLoader(manager).parse(await mtl.text(), '');
          materials.preload();
          loader.setMaterials(materials);
        }
        return loader.parse(text());
      }
      case 'gltf':
      case 'glb':
      case 'vrm':
      case 'vrma':
        return new Promise((resolve, reject) =>
          new GLTFLoader(manager).parse(
            format === 'gltf' ? text() : buffer,
            '',
            (gltf) => {
              gltf.scene.animations = gltf.animations;
              resolve(gltf.scene);
            },
            reject,
          ),
        );
      case 'stl': {
        const geometry = new STLLoader(manager).parse(buffer);
        geometry.computeVertexNormals();
        return new Mesh(geometry, new MeshStandardMaterial({ color: 0xb8bcc8 }));
      }
      case 'ply': {
        const geometry = new PLYLoader(manager).parse(buffer);
        geometry.computeVertexNormals();
        return new Mesh(
          geometry,
          new MeshStandardMaterial({
            color: 0xb8bcc8,
            vertexColors: geometry.hasAttribute('color'),
          }),
        );
      }
      case 'dae': {
        const collada = new ColladaLoader(manager).parse(text(), '');
        collada.scene.animations = collada.animations;
        return collada.scene;
      }
      case '3ds':
        return new TDSLoader(manager).parse(buffer, '');
      case 'pmx':
      case 'pmd': {
        const relatedFilesByPath = this.indexRelatedFiles(auxiliaryFiles);
        const mmdModel3d = await new ThreeMmdLoader({
          textureResolver: {
            resolve: async (referencedPath) =>
              this.resolveRelatedFile(referencedPath, relatedFilesByPath),
          },
        }).loadModel(source, {
          outline: false,
          materialRenderOrder: false,
          morphAttributes: true,
          morphSplit: false,
        });
        return mmdModel3d.root;
      }
      case 'vmd':
        return this.createVmdAnimationRoot(buffer, source instanceof File ? source.name : 'motion');
      default:
        throw new Error(`Unsupported model input: ${format}`);
    }
  }

  async inspectModel3dSource(
    file: File,
    format: Model3dFormat,
    auxiliaryFiles: File[] = [],
  ): Promise<Model3dSourceInspection> {
    const objectUrls: string[] = [];
    try {
      const root = await this.loadModel(
        file,
        format,
        auxiliaryFiles,
        this.createLoadingManager(auxiliaryFiles, objectUrls),
      );
      let hasMesh = false;
      root.traverse((object) => {
        if ((object as Mesh).isMesh) hasMesh = true;
      });
      return {
        hasMesh,
        animations: (root.animations ?? []).map((clip, index) => ({
          index,
          name: clip.name.trim() || `Animation ${index + 1}`,
        })),
      };
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  async convertAnimationSource(
    source: Model3dAnimationSource,
    outputFormat: Model3dAnimationOutputFormat,
    auxiliaryFiles: File[] = [],
  ): Promise<Blob> {
    const objectUrls: string[] = [];
    try {
      const root = await this.loadModel(
        source.file,
        source.format,
        auxiliaryFiles,
        this.createLoadingManager(auxiliaryFiles, objectUrls),
      );
      const clip = root.animations?.[source.clipIndex];
      if (!clip) throw new Error(`Animation clip "${source.clipName}" was not found.`);
      if (outputFormat === 'vrma') return this.exportVrma(root, clip);
      if (outputFormat === 'three-json') {
        return new Blob([JSON.stringify(AnimationClip.toJSON(clip), null, 2)], {
          type: 'application/json',
        });
      }
      const cloneHierarchy = (node: Object3D): Object3D => {
        const clone = (node as Bone).isBone ? new Bone() : new Object3D();
        clone.name = node.name;
        clone.position.copy(node.position);
        clone.quaternion.copy(node.quaternion);
        clone.scale.copy(node.scale);
        node.children.forEach((child) => clone.add(cloneHierarchy(child)));
        return clone;
      };
      const animationRoot = cloneHierarchy(root);
      const exported = await new GLTFExporter().parseAsync(animationRoot, {
        binary: outputFormat === 'glb',
        animations: [clip],
        onlyVisible: false,
        trs: true,
      });
      return exported instanceof ArrayBuffer
        ? new Blob([exported], { type: 'model/gltf-binary' })
        : new Blob([JSON.stringify(exported)], { type: 'model/gltf+json' });
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  private createVmdAnimationRoot(buffer: ArrayBuffer, sourceName: string): Object3D {
    const animation = new FallbackCore().loadVmd(buffer);
    const root = new Group();
    root.name = 'VRMA_Root';
    const definitions: Array<{
      name: string;
      parent?: string;
      position: [number, number, number];
      aliases: string[];
    }> = [
      { name: 'hips', position: [0, 1, 0], aliases: ['下半身', 'センター', 'hips'] },
      { name: 'spine', parent: 'hips', position: [0, 0.18, 0], aliases: ['上半身', 'spine'] },
      { name: 'chest', parent: 'spine', position: [0, 0.18, 0], aliases: ['上半身2', 'chest'] },
      { name: 'upperChest', parent: 'chest', position: [0, 0.14, 0], aliases: ['上半身3', 'upperChest'] },
      { name: 'neck', parent: 'upperChest', position: [0, 0.14, 0], aliases: ['首', 'neck'] },
      { name: 'head', parent: 'neck', position: [0, 0.12, 0], aliases: ['頭', 'head'] },
      { name: 'leftUpperLeg', parent: 'hips', position: [0.1, -0.1, 0], aliases: ['左足', 'leftUpperLeg'] },
      { name: 'leftLowerLeg', parent: 'leftUpperLeg', position: [0, -0.42, 0], aliases: ['左ひざ', '左膝', 'leftLowerLeg'] },
      { name: 'leftFoot', parent: 'leftLowerLeg', position: [0, -0.4, 0], aliases: ['左足首', 'leftFoot'] },
      { name: 'leftToes', parent: 'leftFoot', position: [0, -0.05, 0.12], aliases: ['左つま先', 'leftToes'] },
      { name: 'rightUpperLeg', parent: 'hips', position: [-0.1, -0.1, 0], aliases: ['右足', 'rightUpperLeg'] },
      { name: 'rightLowerLeg', parent: 'rightUpperLeg', position: [0, -0.42, 0], aliases: ['右ひざ', '右膝', 'rightLowerLeg'] },
      { name: 'rightFoot', parent: 'rightLowerLeg', position: [0, -0.4, 0], aliases: ['右足首', 'rightFoot'] },
      { name: 'rightToes', parent: 'rightFoot', position: [0, -0.05, 0.12], aliases: ['右つま先', 'rightToes'] },
      { name: 'leftShoulder', parent: 'upperChest', position: [0.1, 0.08, 0], aliases: ['左肩', 'leftShoulder'] },
      { name: 'leftUpperArm', parent: 'leftShoulder', position: [0.12, 0, 0], aliases: ['左腕', 'leftUpperArm'] },
      { name: 'leftLowerArm', parent: 'leftUpperArm', position: [0.28, 0, 0], aliases: ['左ひじ', '左肘', 'leftLowerArm'] },
      { name: 'leftHand', parent: 'leftLowerArm', position: [0.25, 0, 0], aliases: ['左手首', 'leftHand'] },
      { name: 'rightShoulder', parent: 'upperChest', position: [-0.1, 0.08, 0], aliases: ['右肩', 'rightShoulder'] },
      { name: 'rightUpperArm', parent: 'rightShoulder', position: [-0.12, 0, 0], aliases: ['右腕', 'rightUpperArm'] },
      { name: 'rightLowerArm', parent: 'rightUpperArm', position: [-0.28, 0, 0], aliases: ['右ひじ', '右肘', 'rightLowerArm'] },
      { name: 'rightHand', parent: 'rightLowerArm', position: [-0.25, 0, 0], aliases: ['右手首', 'rightHand'] },
    ];
    const nodes = new Map<string, Object3D>();
    definitions.forEach((definition) => {
      const node = new Object3D();
      node.name = definition.name;
      node.position.fromArray(definition.position);
      nodes.set(definition.name, node);
      (definition.parent ? nodes.get(definition.parent) : root)?.add(node);
    });
    const tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack> = [];
    const findTrack = (aliases: string[]): VmdBoneTrack | undefined =>
      aliases.map((alias) => animation.boneTracks[alias]).find(Boolean);
    definitions.forEach((definition) => {
      const sourceTrack = findTrack(definition.aliases);
      if (!sourceTrack?.frames.length) return;
      const frameCount = animation.metadata.maxFrame + 1;
      const times = new Float32Array(frameCount);
      const rotations = new Float32Array(frameCount * 4);
      for (let frame = 0; frame < frameCount; frame += 1) {
        times[frame] = frame / 30;
        const sampled = this.sampleVmdBoneTrack(sourceTrack, frame);
        rotations[frame * 4] = -sampled.rotation[0];
        rotations[frame * 4 + 1] = -sampled.rotation[1];
        rotations[frame * 4 + 2] = sampled.rotation[2];
        rotations[frame * 4 + 3] = sampled.rotation[3];
      }
      tracks.push(new QuaternionKeyframeTrack(`${definition.name}.quaternion`, times, rotations));
    });
    const centerTrack = findTrack(['センター', '全ての親', 'hips']);
    if (centerTrack?.frames.length) {
      const frameCount = animation.metadata.maxFrame + 1;
      const times = new Float32Array(frameCount);
      const values = new Float32Array(frameCount * 3);
      for (let frame = 0; frame < frameCount; frame += 1) {
        times[frame] = frame / 30;
        const sampled = this.sampleVmdBoneTrack(centerTrack, frame);
        values[frame * 3] = sampled.translation[0] * 0.08;
        values[frame * 3 + 1] = 1 + sampled.translation[1] * 0.08;
        values[frame * 3 + 2] = -sampled.translation[2] * 0.08;
      }
      tracks.push(new VectorKeyframeTrack('hips.position', times, values));
    }
    const presetExpressions: Record<string, string> = {
      まばたき: 'blink',
      あ: 'aa',
      い: 'ih',
      う: 'ou',
      え: 'ee',
      お: 'oh',
      笑い: 'happy',
    };
    Object.entries(animation.morphTracks).forEach(([morphName, morphTrack]) => {
      if (!morphTrack.frames.length) return;
      const mapped: { preset?: string; custom?: string } = presetExpressions[morphName]
        ? { preset: presetExpressions[morphName] }
        : this.vrmExpressionName(morphName);
      const expressionName = mapped.preset ?? mapped.custom ?? this.safeOutputName(morphName);
      const expressionType = mapped.preset ? 'Preset' : 'Custom';
      const node = new Object3D();
      node.name = `VRMAExpression${expressionType}__${expressionName}`;
      root.add(node);
      const frameCount = animation.metadata.maxFrame + 1;
      const times = new Float32Array(frameCount);
      const values = new Float32Array(frameCount * 3);
      for (let frame = 0; frame < frameCount; frame += 1) {
        times[frame] = frame / 30;
        values[frame * 3] = this.sampleVmdMorphTrack(morphTrack, frame);
      }
      tracks.push(new VectorKeyframeTrack(`${node.name}.position`, times, values));
    });
    root.animations = [new AnimationClip(sourceName.replace(/\.[^.]+$/, ''), -1, tracks)];
    return root;
  }

  private sampleVmdBoneTrack(
    track: VmdBoneTrack,
    frame: number,
  ): { translation: [number, number, number]; rotation: [number, number, number, number] } {
    let nextIndex = track.frames.findIndex((keyframe) => keyframe >= frame);
    if (nextIndex < 0) nextIndex = track.frames.length - 1;
    const previousIndex = Math.max(0, nextIndex - (track.frames[nextIndex] === frame ? 0 : 1));
    if (previousIndex === nextIndex) {
      return {
        translation: [
          track.translations[nextIndex * 3] ?? 0,
          track.translations[nextIndex * 3 + 1] ?? 0,
          track.translations[nextIndex * 3 + 2] ?? 0,
        ],
        rotation: [
          track.rotations[nextIndex * 4] ?? 0,
          track.rotations[nextIndex * 4 + 1] ?? 0,
          track.rotations[nextIndex * 4 + 2] ?? 0,
          track.rotations[nextIndex * 4 + 3] ?? 1,
        ],
      };
    }
    const previousFrame = track.frames[previousIndex] ?? 0;
    const nextFrame = track.frames[nextIndex] ?? previousFrame;
    const ratio = nextFrame === previousFrame ? 0 : (frame - previousFrame) / (nextFrame - previousFrame);
    const interpolationOffset = nextIndex * 16;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const translation = [0, 1, 2].map((axis) =>
      lerp(
        track.translations[previousIndex * 3 + axis] ?? 0,
        track.translations[nextIndex * 3 + axis] ?? 0,
        this.interpolateVmdCurve(track.interpolations, interpolationOffset + axis * 4, ratio),
      ),
    ) as [number, number, number];
    const rotationRatio = this.interpolateVmdCurve(
      track.interpolations,
      interpolationOffset + 12,
      ratio,
    );
    const previous = new Quaternion().fromArray(track.rotations, previousIndex * 4);
    const next = new Quaternion().fromArray(track.rotations, nextIndex * 4);
    const rotation = previous.slerp(next, rotationRatio).toArray() as [number, number, number, number];
    return { translation, rotation };
  }

  private interpolateVmdCurve(values: Float32Array, offset: number, x: number): number {
    const x1 = values[offset] ?? 0;
    const y1 = values[offset + 1] ?? 0;
    const x2 = values[offset + 2] ?? 1;
    const y2 = values[offset + 3] ?? 1;
    if (Math.abs(x1 - y1) < 1e-6 && Math.abs(x2 - y2) < 1e-6) return x;
    const bezier = (t: number, p1: number, p2: number) => {
      const inverse = 1 - t;
      return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t;
    };
    let lower = 0;
    let upper = 1;
    let parameter = x;
    for (let index = 0; index < 16; index += 1) {
      const sampledX = bezier(parameter, x1, x2);
      if (Math.abs(sampledX - x) < 1e-5) break;
      if (sampledX < x) lower = parameter;
      else upper = parameter;
      parameter = (lower + upper) / 2;
    }
    return bezier(parameter, y1, y2);
  }

  private sampleVmdMorphTrack(track: VmdMorphTrack, frame: number): number {
    let nextIndex = track.frames.findIndex((keyframe) => keyframe >= frame);
    if (nextIndex < 0) return track.weights[track.weights.length - 1] ?? 0;
    if (nextIndex === 0 || track.frames[nextIndex] === frame) return track.weights[nextIndex] ?? 0;
    const previousIndex = nextIndex - 1;
    const previousFrame = track.frames[previousIndex] ?? 0;
    const nextFrame = track.frames[nextIndex] ?? previousFrame;
    const ratio = nextFrame === previousFrame ? 0 : (frame - previousFrame) / (nextFrame - previousFrame);
    const previous = track.weights[previousIndex] ?? 0;
    return previous + ((track.weights[nextIndex] ?? previous) - previous) * ratio;
  }

  async getReferencedRelatedPaths(
    source: File | ArrayBuffer,
    format: InputFormat,
    auxiliaryFiles: File[] = [],
  ): Promise<string[]> {
    const buffer = source instanceof File ? await source.arrayBuffer() : source;
    if (format === 'pmx' || format === 'pmd') {
      const model = new FallbackCore().loadModel(buffer, { format });
      try {
        return [
          ...new Set(
            model
              .materials()
              .flatMap((material) => [
                material.texturePath,
                material.sphereTexturePath,
                material.toonTexturePath,
              ])
              .filter((path): path is string => Boolean(path)),
          ),
        ];
      } finally {
        model.dispose?.();
      }
    }

    const text = new TextDecoder().decode(buffer);
    const references: string[] = [];
    if (format === 'gltf') {
      const json = JSON.parse(text) as {
        buffers?: Array<{ uri?: string }>;
        images?: Array<{ uri?: string }>;
      };
      references.push(
        ...[...(json.buffers ?? []), ...(json.images ?? [])]
          .map(({ uri }) => uri)
          .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:')),
      );
    } else if (format === 'obj') {
      for (const match of text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gim)) references.push(match[1]);
      const indexed = this.indexRelatedFiles(auxiliaryFiles);
      for (const mtlPath of references.slice()) {
        const mtl = this.resolveRelatedFile(mtlPath, indexed);
        if (!mtl) continue;
        const mtlText = await mtl.text();
        for (const match of mtlText.matchAll(
          /^\s*(?:map_[a-z0-9_]+|bump|disp|decal|refl)\s+(.+?)\s*$/gim,
        )) {
          const value = match[1].replace(/^"|"$/g, '');
          references.push(value.split(/\s+/).pop() ?? value);
        }
        for (const file of auxiliaryFiles) {
          if (mtlText.toLowerCase().includes(file.name.toLowerCase())) {
            references.push(file.webkitRelativePath || file.name);
          }
        }
      }
    } else if (format === 'dae') {
      for (const match of text.matchAll(/<init_from>\s*([^<]+?)\s*<\/init_from>/gi)) {
        references.push(match[1]);
      }
    } else if (format === 'fbx') {
      for (const match of text.matchAll(/(?:RelativeFilename|FileName):\s*"([^"]+)"/gi)) {
        references.push(match[1]);
      }
    }

    if (format === '3ds' || format === 'fbx') {
      const extensionPattern = 'png|jpe?g|webp|bmp|tga|dds|ktx2';
      for (const match of text.matchAll(
        new RegExp(`([^\\0\\r\\n"']+?\\.(?:${extensionPattern}))(?=[\\0\\r\\n"']|$)`, 'gi'),
      )) {
        references.push(match[1]);
      }
    }
    for (const file of auxiliaryFiles) {
      if (text.toLowerCase().includes(file.name.toLowerCase())) {
        references.push(file.webkitRelativePath || file.name);
      }
    }
    return [...new Set(references.map((path) => path.trim()).filter(Boolean))];
  }

  private indexRelatedFiles(files: File[]): Map<string, File> {
    const indexed = new Map<string, File>();
    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const normalizedPath = this.normalizeRelatedPath(relativePath);
      indexed.set(normalizedPath, file);
      indexed.set(this.relatedBasename(normalizedPath), file);
    }
    return indexed;
  }

  private resolveRelatedFile(referencedPath: string, indexed: Map<string, File>): File | undefined {
    const normalizedPath = this.normalizeRelatedPath(referencedPath);
    return indexed.get(normalizedPath) ?? indexed.get(this.relatedBasename(normalizedPath));
  }

  private normalizeRelatedPath(path: string): string {
    const decoded = (() => {
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    })();
    return decoded.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  }

  private relatedBasename(path: string): string {
    return path.split('/').pop() ?? path;
  }

  /**
   * Bake PMX/PMD lighting, toon ramp and sphere-map RGB into a glTF-compatible
   * base-color texture. Alpha is copied from the original base texture and is
   * never classified here; preview settings remain the single alpha authority.
   */
  private async bakeMmdRgbMaterials(root: Object3D): Promise<void> {
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    for (const mesh of meshes) {
      const sources = asArray(mesh.material);
      const baked = await Promise.all(
        sources.map((source, materialIndex) =>
          this.bakeMmdRgbMaterial(source, mesh, materialIndex),
        ),
      );
      mesh.material = preserveArrayShape(mesh.material, baked);
    }
  }

  private async bakeMmdRgbMaterial(
    source: Material,
    mesh: Mesh,
    materialIndex: number,
  ): Promise<Material> {
    const metadata = source.userData.mmdMaterial as
      | {
          diffuse?: [number, number, number, number];
          ambient?: [number, number, number];
          materialIndex?: number;
          transparencyMode?: MmdTransparencyMode;
          sphereMode?: 'none' | 'multiply' | 'add' | 'subTexture';
          edgeColor?: [number, number, number, number];
          edgeSize?: number;
          flags?: { doubleSided?: boolean; edge?: boolean };
        }
      | undefined;
    if (!metadata) return source;
    const toon = source as Material & {
      color?: { r: number; g: number; b: number };
      map?: Texture | null;
      gradientMap?: Texture | null;
      opacity?: number;
      alphaTest?: number;
      transparent?: boolean;
      side?: number;
    };
    const basePixels = this.readTexturePixels(toon.map);
    const toonPixels = this.readTexturePixels(toon.gradientMap);
    const sphereTexture = source.userData.mmdSphereTexture as Texture | undefined;
    const spherePixels = this.readTexturePixels(sphereTexture);
    const width = Math.min(basePixels?.width ?? 512, 1024);
    const height = Math.min(basePixels?.height ?? 512, 1024);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return source;
    const diffuse = metadata.diffuse ?? [
      toon.color?.r ?? 1,
      toon.color?.g ?? 1,
      toon.color?.b ?? 1,
      toon.opacity ?? 1,
    ];
    const ambient = metadata.ambient ?? [0, 0, 0];
    const lit = [
      Math.min(1, diffuse[0] * 0.604 + ambient[0]),
      Math.min(1, diffuse[1] * 0.604 + ambient[1]),
      Math.min(1, diffuse[2] * 0.604 + ambient[2]),
    ];
    const output = context.createImageData(width, height);
    const accumulated = new Float32Array(width * height * 3);
    const samples = new Uint16Array(width * height);
    this.rasterizeMmdUv(mesh, materialIndex, width, height, toon.map?.flipY ?? false, (x, y, normal) => {
      const u = width === 1 ? 0 : x / (width - 1);
      const v = height === 1 ? 0 : y / (height - 1);
      const base = this.sampleTexture(basePixels, u, v);
      const toonSample = this.sampleTexture(
        toonPixels,
        0,
        Math.max(0, Math.min(1, normal.dot(MMD_BAKE_LIGHT) * 0.5 + 0.45)),
      );
      const sphereSample = this.sampleTexture(
        spherePixels,
        normal.x * 0.5 + 0.5,
        normal.y * 0.5 + 0.5,
      );
      const pixel = y * width + x;
      const offset = pixel * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = lit[channel] * base[channel] * toonSample[channel];
        if (spherePixels && metadata.sphereMode === 'multiply') value *= sphereSample[channel];
        if (spherePixels && metadata.sphereMode === 'add') value += sphereSample[channel] * 2;
        if (spherePixels && metadata.sphereMode === 'subTexture') value = sphereSample[channel];
        accumulated[offset + channel] += Math.max(0, Math.min(1, value));
      }
      if (samples[pixel] < 65535) samples[pixel] += 1;
    });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const target = pixel * 4;
        const base = this.sampleTexture(
          basePixels,
          width === 1 ? 0 : x / (width - 1),
          height === 1 ? 0 : y / (height - 1),
        );
        const count = samples[pixel];
        for (let channel = 0; channel < 3; channel += 1) {
          output.data[target + channel] = Math.round(
            (count ? accumulated[pixel * 3 + channel] / count : base[channel]) * 255,
          );
        }
        // Preserve source alpha bytes exactly. Do not multiply or reclassify.
        output.data[target + 3] = Math.round(base[3] * 255);
      }
    }
    context.putImageData(output, 0, 0);
    const bakedMap = new CanvasTexture(canvas);
    bakedMap.colorSpace = SRGBColorSpace;
    bakedMap.name = `${source.name || 'mmd-material'}-rgb-baked`;
    if (toon.map) {
      bakedMap.flipY = toon.map.flipY;
      bakedMap.wrapS = toon.map.wrapS;
      bakedMap.wrapT = toon.map.wrapT;
      bakedMap.offset.copy(toon.map.offset);
      bakedMap.repeat.copy(toon.map.repeat);
      bakedMap.center.copy(toon.map.center);
      bakedMap.rotation = toon.map.rotation;
    }
    bakedMap.needsUpdate = true;
    const bakedSource = source.clone() as Material & { map?: Texture | null; color?: Color };
    bakedSource.map = bakedMap;
    bakedSource.color?.setRGB(1, 1, 1);
    bakedSource.userData = {
      ...source.userData,
      mmdMaterial: { ...metadata, diffuse: [1, 1, 1, diffuse[3]] },
      mmdOriginalAlphaTexture: toon.map ?? undefined,
    };
    return bakedSource;
  }

  private rasterizeMmdUv(
    mesh: Mesh,
    materialIndex: number,
    width: number,
    height: number,
    flipY: boolean,
    visit: (x: number, y: number, normal: Vector3) => void,
  ): void {
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    if (!uv || !normal) return;
    const indices = geometry.getIndex();
    const groups = geometry.groups.filter((group) => (group.materialIndex ?? 0) === materialIndex);
    const ranges = groups.length
      ? groups.map(({ start, count }) => ({ start, count }))
      : materialIndex === 0
        ? [{ start: 0, count: indices?.count ?? uv.count }]
        : [];
    const vertexNormal = new Vector3();
    const interpolated = new Vector3();
    for (const range of ranges) {
      for (let offset = range.start; offset + 2 < range.start + range.count; offset += 3) {
        const ia = indices ? indices.getX(offset) : offset;
        const ib = indices ? indices.getX(offset + 1) : offset + 1;
        const ic = indices ? indices.getX(offset + 2) : offset + 2;
        const x0 = uv.getX(ia) * (width - 1);
        const x1 = uv.getX(ib) * (width - 1);
        const x2 = uv.getX(ic) * (width - 1);
        const toY = (value: number) => (flipY ? 1 - value : value) * (height - 1);
        const y0 = toY(uv.getY(ia));
        const y1 = toY(uv.getY(ib));
        const y2 = toY(uv.getY(ic));
        const denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(denominator) < 1e-8) continue;
        for (let y = Math.max(0, Math.floor(Math.min(y0, y1, y2))); y <= Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2))); y += 1) {
          for (let x = Math.max(0, Math.floor(Math.min(x0, x1, x2))); x <= Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2))); x += 1) {
            const a = ((y1 - y2) * (x + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) / denominator;
            const b = ((y2 - y0) * (x + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) / denominator;
            const c = 1 - a - b;
            if (a < -1e-5 || b < -1e-5 || c < -1e-5) continue;
            interpolated.set(0, 0, 0);
            vertexNormal.fromBufferAttribute(normal, ia);
            interpolated.addScaledVector(vertexNormal, a);
            vertexNormal.fromBufferAttribute(normal, ib);
            interpolated.addScaledVector(vertexNormal, b);
            vertexNormal.fromBufferAttribute(normal, ic);
            interpolated.addScaledVector(vertexNormal, c).normalize();
            visit(x, y, interpolated);
          }
        }
      }
    }
  }

  private sampleTexture(
    pixels: { data: Uint8ClampedArray; width: number; height: number } | undefined,
    u: number,
    v: number,
  ): [number, number, number, number] {
    if (!pixels) return [1, 1, 1, 1];
    const x = Math.max(0, Math.min(pixels.width - 1, Math.round(u * (pixels.width - 1))));
    const y = Math.max(0, Math.min(pixels.height - 1, Math.round(v * (pixels.height - 1))));
    const offset = (y * pixels.width + x) * 4;
    return [
      (pixels.data[offset] ?? 255) / 255,
      (pixels.data[offset + 1] ?? 255) / 255,
      (pixels.data[offset + 2] ?? 255) / 255,
      (pixels.data[offset + 3] ?? 255) / 255,
    ];
  }

  /**
   * Apply the same portable material used by the real-time preview. GLB, glTF
   * and VRM deliberately share this path; VRM metadata is the only variant.
   */
  private applyMmdPortableMaterials(
    root: Object3D,
    transparency: Model3dTransparencySettings,
    includeVrmMetadata: boolean,
  ): void {
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    const materialIndices = meshes.flatMap((mesh) =>
      asArray(mesh.material).map(
        (material) =>
          (material.userData.mmdMaterial as { materialIndex?: number } | undefined)
            ?.materialIndex ?? 0,
      ),
    );
    const maxMaterialIndex = Math.max(0, ...materialIndices);
    for (const mesh of meshes) {
      const sourceMaterials = asArray(mesh.material);
      const portableMaterials = sourceMaterials.map((source) => {
        const metadata = source.userData.mmdMaterial as
          | {
              diffuse?: [number, number, number, number];
              ambient?: [number, number, number];
              specular?: [number, number, number];
              materialIndex?: number;
              transparencyMode?: 'opaque' | 'alphaTest' | 'alphaBlend';
              sphereMode?: 'none' | 'multiply' | 'add' | 'subTexture';
              edgeColor?: [number, number, number, number];
              edgeSize?: number;
              flags?: { doubleSided?: boolean; edge?: boolean };
            }
          | undefined;
        if (!metadata) return source;
        const material = this.createMmdPortableMaterial(
          source,
          metadata,
          source as Material & {
            map?: Texture | null;
            opacity?: number;
            alphaTest?: number;
            transparent?: boolean;
            side?: number;
          },
          maxMaterialIndex,
          transparency,
          includeVrmMetadata,
        );
        return material;
      });
      mesh.material = preserveArrayShape(mesh.material, portableMaterials);
    }
  }

  private createMmdPortableMaterial(
    source: Material,
    metadata: {
      diffuse?: [number, number, number, number];
      ambient?: [number, number, number];
      specular?: [number, number, number];
      materialIndex?: number;
      transparencyMode?: 'opaque' | 'alphaTest' | 'alphaBlend';
      sphereMode?: 'none' | 'multiply' | 'add' | 'subTexture';
      edgeColor?: [number, number, number, number];
      edgeSize?: number;
      flags?: { doubleSided?: boolean; edge?: boolean };
    },
    toon: Material & {
      map?: Texture | null;
      opacity?: number;
      alphaTest?: number;
      transparent?: boolean;
      side?: number;
    },
    maxMaterialIndex: number,
    settings: Model3dTransparencySettings,
    includeVrmMetadata: boolean,
  ): Material {
    const diffuse = metadata.diffuse ?? [1, 1, 1, toon.opacity ?? 1];
    const ambient = metadata.ambient ?? [0.2, 0.2, 0.2];
    const edgeColor = metadata.edgeColor ?? [0, 0, 0, 1];
    const alphaTexture =
      (source.userData.mmdOriginalAlphaTexture as Texture | undefined) ?? toon.map ?? undefined;
    const transparency = this.resolveMmdTransparencyMode(
      metadata.transparencyMode,
      alphaTexture,
      diffuse[3],
      settings,
    );
    const isBlend = transparency.mode === 'alphaBlend';
    const isMask = transparency.mode === 'alphaTest';
    if (MMD_TRANSPARENCY_DIAGNOSTICS_ENABLED) {
      console.debug('[MMD transparency]', {
        material: source.name,
        materialIndex: metadata.materialIndex,
        declaredMode: metadata.transparencyMode,
        ...transparency,
      });
    }
    const commonMaterialOptions = {
      name: source.name,
      color: new Color(diffuse[0], diffuse[1], diffuse[2]),
      map: toon.map ?? null,
      transparent: isBlend,
      opacity: diffuse[3],
      alphaTest: isMask ? Math.max(settings.maskMinAlphaCutoff, toon.alphaTest ?? 0) : 0,
      side: metadata.flags?.doubleSided || toon.side === DoubleSide ? DoubleSide : toon.side,
    };
    const material = includeVrmMetadata
      ? new MeshStandardMaterial({
          ...commonMaterialOptions,
          metalness: 0,
          roughness: 1,
          depthWrite: !isBlend || transparency.textureDrivenBlendWithZWrite,
          emissive: new Color(0, 0, 0),
          emissiveMap: null,
        })
      : new MeshBasicMaterial({
          ...commonMaterialOptions,
          // GLTFExporter serializes this as KHR_materials_unlit, so the baked
          // RGB is not lit a second time by the destination viewer.
          depthWrite: !isBlend,
        });
    const outlineEnabled = Boolean(
      !isBlend && metadata.flags?.edge && (metadata.edgeSize ?? 0) > 0,
    );
    const shadeStrength = Math.max(
      0.55,
      Math.min(0.82, (ambient[0] + ambient[1] + ambient[2]) / 3 + 0.2),
    );
    if (includeVrmMetadata) {
      material.userData.vrmMToon = {
        specVersion: '1.0',
        transparentWithZWrite: transparency.textureDrivenBlendWithZWrite,
        renderQueueOffsetNumber: isBlend
          ? -Math.min(
              settings.mtoonRenderQueueOffsetLimit,
              Math.max(0, maxMaterialIndex - (metadata.materialIndex ?? 0)),
            )
          : 0,
        shadeColorFactor: [shadeStrength, shadeStrength, shadeStrength],
        shadingShiftFactor: -0.05,
        shadingToonyFactor: 0.95,
        giEqualizationFactor: 0.9,
        parametricRimColorFactor: [0, 0, 0],
        parametricRimFresnelPowerFactor: 5,
        parametricRimLiftFactor: 0,
        rimLightingMixFactor: 0,
        outlineWidthMode: outlineEnabled ? 'worldCoordinates' : 'none',
        outlineWidthFactor: outlineEnabled
          ? Math.max(0.0001, Math.min(0.01, (metadata.edgeSize ?? 1) * 0.001))
          : 0,
        outlineColorFactor: edgeColor.slice(0, 3),
        outlineLightingMixFactor: 0,
        matcapFromEmissive: false,
        matcapFactor: [0, 0, 0],
      };
    }
    return material;
  }

  private resolveMmdTransparencyMode(
    declared: MmdTransparencyMode | undefined,
    texture: Texture | undefined,
    materialAlpha: number,
    settings: Model3dTransparencySettings,
  ): MmdTransparencyAnalysis {
    const histogram = this.readTextureAlphaHistogram(texture);
    let transparentPixels = 0;
    let intermediatePixels = 0;
    let opaquePixels = 0;
    if (histogram) {
      for (let alpha = 0; alpha < histogram.length; alpha += 1) {
        const count = histogram[alpha];
        if (alpha <= settings.textureTransparentMaxAlphaByte) {
          transparentPixels += count;
        } else if (alpha >= settings.textureOpaqueMinAlphaByte) {
          opaquePixels += count;
        } else {
          intermediatePixels += count;
        }
      }
    }
    const total = transparentPixels + intermediatePixels + opaquePixels;
    const intermediateRatio = total ? intermediatePixels / total : 0;
    const extremeRatio = total ? (transparentPixels + opaquePixels) / total : 0;
    const mostlyCutout =
      transparentPixels > 0 && intermediateRatio <= settings.cutoutMaxIntermediateAlphaRatio;
    let mode: MmdTransparencyMode;
    if (materialAlpha < settings.materialOpaqueMinAlpha) {
      mode = 'alphaBlend';
    } else if (!total || (transparentPixels === 0 && intermediatePixels === 0)) {
      mode = declared ?? 'opaque';
    } else if (declared === 'alphaTest' || intermediatePixels === 0 || mostlyCutout) {
      mode = 'alphaTest';
    } else {
      mode = 'alphaBlend';
    }
    const textureDrivenBlendWithZWrite =
      mode === 'alphaBlend' &&
      materialAlpha >= settings.materialOpaqueMinAlpha &&
      transparentPixels > 0 &&
      opaquePixels > 0 &&
      extremeRatio >= settings.blendZWriteMinExtremeAlphaRatio;
    return {
      mode,
      materialAlpha,
      transparentPixels,
      intermediatePixels,
      opaquePixels,
      intermediateRatio,
      extremeRatio,
      textureDrivenBlendWithZWrite,
    };
  }

  private readTextureAlphaHistogram(texture?: Texture): Uint32Array | undefined {
    if (!texture) return undefined;
    const cached = this.textureAlphaHistogramCache.get(texture);
    if (cached) return cached;
    const pixels = this.readTexturePixels(texture);
    if (!pixels) return undefined;
    const histogram = new Uint32Array(256);
    for (let offset = 3; offset < pixels.data.length; offset += 4) {
      histogram[pixels.data[offset]] += 1;
    }
    this.textureAlphaHistogramCache.set(texture, histogram);
    return histogram;
  }

  private readTexturePixels(
    texture?: Texture | null,
  ): { data: Uint8ClampedArray; width: number; height: number } | undefined {
    const image = texture?.image as
      { data?: ArrayLike<number>; width?: number; height?: number } | CanvasImageSource | undefined;
    if (!image) return undefined;
    const width = Number((image as { width?: number }).width);
    const height = Number((image as { height?: number }).height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }
    const raw = (image as { data?: ArrayLike<number> }).data;
    if (raw && raw.length >= width * height * 4) {
      return { data: Uint8ClampedArray.from(raw), width, height };
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.drawImage(image as CanvasImageSource, 0, 0, width, height);
      return { data: context.getImageData(0, 0, width, height).data, width, height };
    } catch {
      return undefined;
    }
  }

  /** Bake the current skinned pose into ordinary mesh vertices, then remove bones. */
  private makeStatic(root: Object3D): void {
    root.updateMatrixWorld(true);
    const skinned: SkinnedMesh[] = [];
    root.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) skinned.push(object as SkinnedMesh);
    });
    for (const source of skinned) {
      const geometry = source.geometry.clone();
      const position = geometry.getAttribute('position');
      const baked = new Float32Array(position.count * 3);
      const vertex = new Vector3();
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index);
        source.applyBoneTransform(index, vertex);
        baked[index * 3] = vertex.x;
        baked[index * 3 + 1] = vertex.y;
        baked[index * 3 + 2] = vertex.z;
      }
      geometry.setAttribute('position', new BufferAttribute(baked, 3));
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.morphAttributes = {};
      geometry.computeVertexNormals();
      const replacement = new Mesh(geometry, source.material);
      replacement.name = source.name;
      replacement.position.copy(source.position);
      replacement.quaternion.copy(source.quaternion);
      replacement.scale.copy(source.scale);
      source.parent?.add(replacement);
      source.removeFromParent();
    }
    const bones: Bone[] = [];
    root.traverse((object) => {
      if ((object as Bone).isBone) bones.push(object as Bone);
    });
    bones.forEach((bone) => bone.removeFromParent());
  }

  private safeOutputName(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'animation';
  }

  private vrmExpressionName(sourceName: string): { preset?: string; custom?: string } {
    const compact = sourceName.normalize('NFKC').toLowerCase().replace(/[\s_.-]/g, '');
    const normalized = compact.replace(/[^a-z0-9]/g, '');
    const presets: Record<string, string> = {
      aa: 'aa',
      a: 'aa',
      ih: 'ih',
      i: 'ih',
      ou: 'ou',
      u: 'ou',
      ee: 'ee',
      e: 'ee',
      oh: 'oh',
      o: 'oh',
      blink: 'blink',
      blinkleft: 'blinkLeft',
      blinkright: 'blinkRight',
      wink: 'blinkLeft',
      winkleft: 'blinkLeft',
      winkright: 'blinkRight',
      happy: 'happy',
      joy: 'happy',
      angry: 'angry',
      sad: 'sad',
      sorrow: 'sad',
      relaxed: 'relaxed',
      surprised: 'surprised',
      surprise: 'surprised',
      lookup: 'lookUp',
      lookdown: 'lookDown',
      lookleft: 'lookLeft',
      lookright: 'lookRight',
      neutral: 'neutral',
    };
    const japanesePresets: Record<string, string> = {
      あ: 'aa',
      い: 'ih',
      う: 'ou',
      え: 'ee',
      お: 'oh',
      まばたき: 'blink',
      瞬き: 'blink',
      ウィンク: 'blinkLeft',
      ウインク: 'blinkLeft',
      ウィンク左: 'blinkLeft',
      ウインク左: 'blinkLeft',
      ウィンク右: 'blinkRight',
      ウインク右: 'blinkRight',
      笑い: 'happy',
      笑顔: 'happy',
      怒り: 'angry',
      悲しい: 'sad',
      困る: 'sad',
      びっくり: 'surprised',
      驚き: 'surprised',
      真面目: 'neutral',
    };
    const preset = japanesePresets[compact] ?? presets[normalized];
    if (preset) return { preset };
    return { custom: this.safeOutputName(sourceName) };
  }

  private vrmaExpressionNodeName(sourceName: string): string {
    const expression = this.vrmExpressionName(sourceName);
    return expression.preset
      ? `VRMAExpressionPreset__${expression.preset}`
      : `VRMAExpressionCustom__${expression.custom}`;
  }

  private async exportVrma(root: Object3D, clip: AnimationClip): Promise<Blob> {
    const sourceNodes: Object3D[] = [];
    root.traverse((node) => sourceNodes.push(node));
    const sourceIndices = new Map(sourceNodes.map((node, index) => [node, index]));
    const sourceHumanBones = this.mapVrmHumanBones(
      sourceNodes.map((node) => ({
        name: node.name,
        children: node.children
          .map((child) => sourceIndices.get(child))
          .filter((index): index is number => index !== undefined),
      })),
    );
    const humanoidTargetNodes = Object.values(sourceHumanBones)
      .map(({ node }) => sourceNodes[node])
      .filter((node): node is Object3D => Boolean(node));
    const humanoidTargets = new Map(
      humanoidTargetNodes.flatMap((node) => [
        [node.name, node] as const,
        [node.uuid, node] as const,
      ]),
    );
    const expressionTargets = new Map(
      sourceNodes
        .filter((node) => node.name.startsWith('VRMAExpression'))
        .flatMap((node) => [
          [node.name, node] as const,
          [node.uuid, node] as const,
        ]),
    );
    const hipsNode = sourceHumanBones.hips ? sourceNodes[sourceHumanBones.hips.node] : undefined;
    const hipsTargets = new Set([hipsNode?.name, hipsNode?.uuid]);
    const generatedExpressions = new Map<string, VectorKeyframeTrack>();
    clip.tracks.forEach((track) => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      if (parsed.propertyName !== 'morphTargetInfluences') return;
      const target = parsed.objectIndex ?? parsed.nodeName;
      const mesh = sourceNodes.find((node) => node.name === target || node.uuid === target) as
        | Mesh
        | undefined;
      if (!mesh?.morphTargetDictionary || !track.times.length) return;
      const stride = track.values.length / track.times.length;
      Object.entries(mesh.morphTargetDictionary).forEach(([morphName, morphIndex]) => {
        if (morphIndex >= stride) return;
        const nodeName = this.vrmaExpressionNodeName(morphName);
        if (generatedExpressions.has(nodeName)) return;
        const values = new Float32Array(track.times.length * 3);
        for (let index = 0; index < track.times.length; index += 1) {
          values[index * 3] = track.values[index * stride + morphIndex] ?? 0;
        }
        generatedExpressions.set(
          nodeName,
          new VectorKeyframeTrack(`${nodeName}.position`, track.times, values),
        );
      });
    });
    const portableClip = clip.clone();
    portableClip.tracks = portableClip.tracks.flatMap((track) => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const target = parsed.objectIndex ?? parsed.nodeName;
      const property = parsed.propertyName;
      const targetNode = humanoidTargets.get(target) ?? expressionTargets.get(target);
      if (!targetNode) return [];
      const isExpressionWeight = property === 'position' && expressionTargets.has(target);
      if (
        property !== 'quaternion' &&
        !(property === 'position' && hipsTargets.has(target)) &&
        !isExpressionWeight
      ) {
        return [];
      }
      const portableTrack = track.clone();
      portableTrack.name = `${targetNode.name}.${property}`;
      return [portableTrack];
    });
    portableClip.tracks.push(...generatedExpressions.values());
    if (!portableClip.tracks.length) {
      throw new Error(`Animation "${clip.name}" has no humanoid tracks that can be exported to VRMA.`);
    }
    const cloneHierarchy = (source: Object3D): Object3D => {
      const clone = new Object3D();
      clone.name = source.name;
      clone.position.copy(source.position);
      clone.quaternion.copy(source.quaternion);
      clone.scale.copy(source.scale);
      clone.visible = source.visible;
      source.children.forEach((child) => clone.add(cloneHierarchy(child)));
      return clone;
    };
    const animationRoot = cloneHierarchy(root);
    generatedExpressions.forEach((_track, nodeName) => {
      const node = new Object3D();
      node.name = nodeName;
      animationRoot.add(node);
    });
    const exported = await new GLTFExporter().parseAsync(animationRoot, {
      binary: true,
      animations: [portableClip],
      onlyVisible: false,
      trs: true,
    });
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error('VRMA export requires a binary glTF result.');
    }
    return new Blob([this.addVrmaExtension(exported)], { type: 'model/gltf-binary' });
  }

  private addVrmaExtension(glb: ArrayBuffer): ArrayBuffer {
    const view = new DataView(glb);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
      throw new Error('VRMA export requires a valid glTF 2.0 binary.');
    }
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a) {
      throw new Error('VRMA GLB JSON chunk was not found.');
    }
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)).trim(),
    ) as {
      nodes?: Array<{ name?: string; children?: number[] }>;
      extensionsUsed?: string[];
      extensionsRequired?: string[];
      extensions?: Record<string, unknown>;
    };
    const humanBones = this.mapVrmHumanBones(json.nodes ?? []);
    delete humanBones.leftEye;
    delete humanBones.rightEye;
    const required = [
      'hips',
      'spine',
      'head',
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
    ];
    const missing = required.filter((name) => !humanBones[name]);
    if (missing.length) {
      throw new Error(`Required VRMA humanoid bones were not identified: ${missing.join(', ')}`);
    }
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_vrm_animation'])];
    json.extensionsRequired = [
      ...new Set([...(json.extensionsRequired ?? []), 'VRMC_vrm_animation']),
    ];
    const presetExpressions: Record<string, { node: number }> = {};
    const customExpressions: Record<string, { node: number }> = {};
    (json.nodes ?? []).forEach((node, index) => {
      const preset = node.name?.match(/^VRMAExpressionPreset__(.+)$/)?.[1];
      const custom = node.name?.match(/^VRMAExpressionCustom__(.+)$/)?.[1];
      if (preset) presetExpressions[preset] = { node: index };
      if (custom) customExpressions[custom] = { node: index };
    });
    const expressions =
      Object.keys(presetExpressions).length || Object.keys(customExpressions).length
        ? { preset: presetExpressions, custom: customExpressions }
        : undefined;
    json.extensions = {
      ...(json.extensions ?? {}),
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: { humanBones },
        ...(expressions ? { expressions } : {}),
      },
    };
    const encodedJson = new TextEncoder().encode(JSON.stringify(json));
    const paddedLength = Math.ceil(encodedJson.length / 4) * 4;
    const remainingChunks = new Uint8Array(glb, 20 + jsonLength);
    const output = new ArrayBuffer(20 + paddedLength + remainingChunks.byteLength);
    const outputView = new DataView(output);
    outputView.setUint32(0, 0x46546c67, true);
    outputView.setUint32(4, 2, true);
    outputView.setUint32(8, output.byteLength, true);
    outputView.setUint32(12, paddedLength, true);
    outputView.setUint32(16, 0x4e4f534a, true);
    const outputBytes = new Uint8Array(output);
    outputBytes.set(encodedJson, 20);
    outputBytes.fill(0x20, 20 + encodedJson.length, 20 + paddedLength);
    outputBytes.set(remainingChunks, 20 + paddedLength);
    return output;
  }

  private async exportModel(
    root: Object3D,
    format: Model3dOutputFormat,
    sourceName: string,
    sourceFormat: InputFormat,
    animations: AnimationClip[] = [],
  ): Promise<Blob> {
    if (format === 'obj') {
      return new Blob([new OBJExporter().parse(root)], { type: getMimeType(format) });
    }
    if (format === 'stl') {
      return new Blob([new STLExporter().parse(root, { binary: true })], {
        type: getMimeType(format),
      });
    }
    const exported = await new GLTFExporter().parseAsync(root, {
      binary: format === 'glb' || format === 'vrm',
      animations,
      onlyVisible: true,
      trs: false,
    });
    if (exported instanceof ArrayBuffer) {
      const output =
        format === 'vrm'
          ? this.addVrmExtension(exported, sourceName, sourceFormat)
          : exported;
      return new Blob([output], { type: getMimeType(format) });
    }
    return new Blob([JSON.stringify(exported)], { type: getMimeType(format) });
  }

  private addVrmExtension(
    glb: ArrayBuffer,
    sourceName: string,
    sourceFormat: InputFormat,
  ): ArrayBuffer {
    const view = new DataView(glb);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
      throw new Error('VRM export requires a valid glTF 2.0 binary.');
    }
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a) {
      throw new Error('GLB JSON chunk was not found.');
    }
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)).trim(),
    ) as {
      nodes?: Array<{
        name?: string;
        children?: number[];
        mesh?: number;
        translation?: number[];
        rotation?: number[];
        scale?: number[];
        matrix?: number[];
      }>;
      meshes?: Array<{
        weights?: number[];
        extras?: { targetNames?: string[] };
        primitives?: Array<{ targets?: Array<Record<string, number>> }>;
      }>;
      materials?: Array<{
        pbrMetallicRoughness?: {
          baseColorTexture?: { index: number; texCoord?: number };
        };
        emissiveFactor?: number[];
        emissiveTexture?: { index: number; texCoord?: number };
        extensions?: Record<string, unknown>;
        extras?: Record<string, unknown>;
      }>;
      extensionsUsed?: string[];
      extensionsRequired?: string[];
      extensions?: Record<string, unknown>;
    };
    const humanBones = this.mapVrmHumanBones(json.nodes ?? []);
    const requiredBones = [
      'hips',
      'spine',
      'head',
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
    ] as const;
    const missing = requiredBones.filter((bone) => !humanBones[bone]);
    if (missing.length) {
      throw new Error(`Required VRM humanoid bones were not identified: ${missing.join(', ')}`);
    }
    if (sourceFormat === 'pmx' || sourceFormat === 'pmd') {
      this.validateVrmHumanoidHierarchy(json.nodes ?? [], humanBones);
    }
    const expressions = this.collectVrmExpressions(json.nodes ?? [], json.meshes ?? []);
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_vrm'])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'VRMC_vrm'])];
    json.extensions = {
      ...(json.extensions ?? {}),
      VRMC_vrm: {
        specVersion: '1.0',
        meta: {
          name: sourceName.replace(/\.[^.]+$/, ''),
          authors: ['Unknown'],
          licenseUrl: 'https://vrm.dev/licenses/1.0/',
        },
        humanoid: { humanBones },
        ...(expressions ? { expressions } : {}),
      },
    };
    this.applyMToonExtensions(json);

    const encodedJson = new TextEncoder().encode(JSON.stringify(json));
    const paddedLength = Math.ceil(encodedJson.length / 4) * 4;
    const remainingChunks = new Uint8Array(glb, 20 + jsonLength);
    const output = new ArrayBuffer(20 + paddedLength + remainingChunks.byteLength);
    const outputView = new DataView(output);
    outputView.setUint32(0, 0x46546c67, true);
    outputView.setUint32(4, 2, true);
    outputView.setUint32(8, output.byteLength, true);
    outputView.setUint32(12, paddedLength, true);
    outputView.setUint32(16, 0x4e4f534a, true);
    const outputBytes = new Uint8Array(output);
    outputBytes.set(encodedJson, 20);
    outputBytes.fill(0x20, 20 + encodedJson.length, 20 + paddedLength);
    outputBytes.set(remainingChunks, 20 + paddedLength);
    return output;
  }

  private collectVrmExpressions(
    nodes: Array<{ mesh?: number }>,
    meshes: Array<{
      weights?: number[];
      extras?: { targetNames?: string[] };
      primitives?: Array<{ targets?: Array<Record<string, number>> }>;
    }>,
  ):
    | {
        preset: Record<
          string,
          { isBinary: boolean; morphTargetBinds: Array<{ node: number; index: number; weight: number }> }
        >;
        custom: Record<
          string,
          { isBinary: boolean; morphTargetBinds: Array<{ node: number; index: number; weight: number }> }
        >;
      }
    | undefined {
    type Expression = {
      isBinary: boolean;
      morphTargetBinds: Array<{ node: number; index: number; weight: number }>;
    };
    const preset: Record<string, Expression> = {};
    const custom: Record<string, Expression> = {};
    nodes.forEach((node, nodeIndex) => {
      if (node.mesh === undefined) return;
      const mesh = meshes[node.mesh];
      if (!mesh) return;
      const targetNames = mesh.extras?.targetNames ?? [];
      const targetCount = Math.max(
        targetNames.length,
        mesh.weights?.length ?? 0,
        ...((mesh.primitives ?? []).map((primitive) => primitive.targets?.length ?? 0)),
      );
      for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
        const sourceName = targetNames[targetIndex]?.trim() || `morph-${targetIndex + 1}`;
        const mapped = this.vrmExpressionName(sourceName);
        const collection = mapped.preset ? preset : custom;
        const name = mapped.preset ?? mapped.custom ?? sourceName;
        const expression = collection[name] ?? { isBinary: false, morphTargetBinds: [] };
        expression.morphTargetBinds.push({ node: nodeIndex, index: targetIndex, weight: 1 });
        collection[name] = expression;
      }
    });
    return Object.keys(preset).length || Object.keys(custom).length ? { preset, custom } : undefined;
  }

  private validateVrmHumanoidHierarchy(
    nodes: Array<{
      name?: string;
      children?: number[];
      translation?: number[];
      rotation?: number[];
      scale?: number[];
      matrix?: number[];
    }>,
    humanBones: Record<string, { node: number }>,
  ): void {
    const parents = new Map<number, number>();
    nodes.forEach((node, parentIndex) => {
      node.children?.forEach((childIndex) => parents.set(childIndex, parentIndex));
    });
    const isDescendantOf = (nodeIndex: number, ancestorIndex: number) => {
      const visited = new Set<number>();
      let current = parents.get(nodeIndex);
      while (current !== undefined && !visited.has(current)) {
        if (current === ancestorIndex) return true;
        visited.add(current);
        current = parents.get(current);
      }
      return false;
    };
    const requiredRelationships: Array<[string, string]> = [
      ['spine', 'hips'],
      ['head', 'spine'],
      ['leftUpperLeg', 'hips'],
      ['leftLowerLeg', 'leftUpperLeg'],
      ['leftFoot', 'leftLowerLeg'],
      ['rightUpperLeg', 'hips'],
      ['rightLowerLeg', 'rightUpperLeg'],
      ['rightFoot', 'rightLowerLeg'],
      ['leftUpperArm', 'spine'],
      ['leftLowerArm', 'leftUpperArm'],
      ['leftHand', 'leftLowerArm'],
      ['rightUpperArm', 'spine'],
      ['rightLowerArm', 'rightUpperArm'],
      ['rightHand', 'rightLowerArm'],
    ];
    const invalidRelationships = requiredRelationships.filter(([childName, parentName]) => {
      const child = humanBones[childName]?.node;
      const parent = humanBones[parentName]?.node;
      return child === undefined || parent === undefined || !isDescendantOf(child, parent);
    });
    if (invalidRelationships.length) {
      throw new Error(
        `Invalid VRM humanoid hierarchy: ${invalidRelationships
          .map(([child, parent]) => `${child} must descend from ${parent}`)
          .join(', ')}`,
      );
    }

    for (const [boneName, { node: nodeIndex }] of Object.entries(humanBones)) {
      const node = nodes[nodeIndex];
      if (!node) throw new Error(`VRM humanoid bone ${boneName} references a missing node.`);
      for (const values of [node.translation, node.rotation, node.scale, node.matrix]) {
        if (values?.some((value) => !Number.isFinite(value))) {
          throw new Error(`VRM humanoid bone ${boneName} contains a non-finite transform.`);
        }
      }
      if (node.scale) {
        const [x = 1, y = 1, z = 1] = node.scale;
        const tolerance = Math.max(x, y, z) * 1e-4;
        if (x <= 0 || y <= 0 || z <= 0 || Math.abs(x - y) > tolerance || Math.abs(y - z) > tolerance) {
          throw new Error(`VRM humanoid bone ${boneName} must have a positive uniform scale.`);
        }
      }
      if (node.rotation) {
        const length = Math.hypot(...node.rotation);
        if (length < 1e-6 || Math.abs(length - 1) > 1e-3) {
          throw new Error(`VRM humanoid bone ${boneName} has an invalid rest rotation.`);
        }
      }
    }
  }

  private applyMToonExtensions(json: {
    materials?: Array<{
      pbrMetallicRoughness?: {
        baseColorTexture?: { index: number; texCoord?: number };
      };
      emissiveFactor?: number[];
      emissiveTexture?: { index: number; texCoord?: number };
      extensions?: Record<string, unknown>;
      extras?: Record<string, unknown>;
    }>;
    extensionsUsed?: string[];
  }): void {
    let hasMToon = false;
    for (const material of json.materials ?? []) {
      const marker = material.extras?.vrmMToon as
        (Record<string, unknown> & { matcapFromEmissive?: boolean }) | undefined;
      if (!marker) continue;
      hasMToon = true;
      const { matcapFromEmissive, ...mtoon } = marker;
      const baseColorTexture = material.pbrMetallicRoughness?.baseColorTexture;
      if (baseColorTexture) {
        mtoon.shadeMultiplyTexture = { ...baseColorTexture };
      }
      if (matcapFromEmissive && material.emissiveTexture) {
        mtoon.matcapTexture = { ...material.emissiveTexture };
        delete material.emissiveTexture;
        delete material.emissiveFactor;
      }
      material.extensions = {
        ...(material.extensions ?? {}),
        VRMC_materials_mtoon: mtoon,
      };
      delete material.extras?.vrmMToon;
      if (material.extras && !Object.keys(material.extras).length) delete material.extras;
    }
    if (hasMToon) {
      json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_materials_mtoon'])];
    }
  }

  private mapVrmHumanBones(
    nodes: Array<{ name?: string; children?: number[] }>,
  ): Record<string, { node: number }> {
    const aliases: Record<string, string[]> = {
      hips: ['vrmhips', 'hips', 'pelvis', 'mixamorighips', '腰', '下半身', 'センター'],
      spine: ['spine', 'mixamorigspine', '上半身'],
      chest: ['chest', 'spine1', 'mixamorigspine1', '上半身2'],
      upperChest: ['upperchest', 'spine2', 'mixamorigspine2', '上半身3'],
      neck: ['neck', 'mixamorigneck', '首'],
      head: ['head', 'mixamorighead', '頭'],
      leftUpperLeg: ['leftupleg', 'leftupperleg', 'mixamorigleftupleg', '左足', '左腿'],
      leftLowerLeg: ['leftleg', 'leftlowerleg', 'mixamorigleftleg', '左ひざ', '左膝'],
      leftFoot: ['leftfoot', 'mixamorigleftfoot', '左足首'],
      leftToes: ['lefttoe', 'lefttoebase', 'mixamoriglefttoebase', '左つま先'],
      rightUpperLeg: ['rightupleg', 'rightupperleg', 'mixamorigrightupleg', '右足', '右腿'],
      rightLowerLeg: ['rightleg', 'rightlowerleg', 'mixamorigrightleg', '右ひざ', '右膝'],
      rightFoot: ['rightfoot', 'mixamorigrightfoot', '右足首'],
      rightToes: ['righttoe', 'righttoebase', 'mixamorigrighttoebase', '右つま先'],
      leftShoulder: ['leftshoulder', 'mixamorigleftshoulder', '左肩'],
      leftUpperArm: ['leftarm', 'leftupperarm', 'mixamorigleftarm', '左腕'],
      leftLowerArm: ['leftforearm', 'leftlowerarm', 'mixamorigleftforearm', '左ひじ', '左肘'],
      leftHand: ['lefthand', 'mixamoriglefthand', '左手首'],
      rightShoulder: ['rightshoulder', 'mixamorigrightshoulder', '右肩'],
      rightUpperArm: ['rightarm', 'rightupperarm', 'mixamorigrightarm', '右腕'],
      rightLowerArm: ['rightforearm', 'rightlowerarm', 'mixamorigrightforearm', '右ひじ', '右肘'],
      rightHand: ['righthand', 'mixamorigrighthand', '右手首'],
      leftEye: ['lefteye', '左目'],
      rightEye: ['righteye', '右目'],
      jaw: ['jaw', 'あご', '顎'],
    };
    const normalize = (name: string) =>
      name
        .normalize('NFKC')
        .toLowerCase()
        .replace(/ひざ/g, '膝')
        .replace(/ひじ/g, '肘')
        .replace(/あご/g, '顎')
        .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
    const normalizedNodes = nodes.map((node, index) => ({
      index,
      name: normalize(node.name ?? ''),
    }));
    const parents = new Map<number, number>();
    nodes.forEach((node, parentIndex) => {
      node.children?.forEach((childIndex) => parents.set(childIndex, parentIndex));
    });
    const isDescendantOf = (nodeIndex: number, ancestorIndex: number): boolean => {
      const visited = new Set<number>();
      let current = parents.get(nodeIndex);
      while (current !== undefined && !visited.has(current)) {
        if (current === ancestorIndex) return true;
        visited.add(current);
        current = parents.get(current);
      }
      return false;
    };
    const expectedParents: Record<string, string[]> = {
      spine: ['hips'],
      chest: ['spine'],
      upperChest: ['chest'],
      neck: ['upperChest', 'chest', 'spine'],
      head: ['neck', 'upperChest', 'chest', 'spine'],
      leftUpperLeg: ['hips'],
      leftLowerLeg: ['leftUpperLeg'],
      leftFoot: ['leftLowerLeg'],
      leftToes: ['leftFoot'],
      rightUpperLeg: ['hips'],
      rightLowerLeg: ['rightUpperLeg'],
      rightFoot: ['rightLowerLeg'],
      rightToes: ['rightFoot'],
      leftShoulder: ['upperChest', 'chest', 'spine'],
      leftUpperArm: ['leftShoulder', 'upperChest', 'chest', 'spine'],
      leftLowerArm: ['leftUpperArm'],
      leftHand: ['leftLowerArm'],
      rightShoulder: ['upperChest', 'chest', 'spine'],
      rightUpperArm: ['rightShoulder', 'upperChest', 'chest', 'spine'],
      rightLowerArm: ['rightUpperArm'],
      rightHand: ['rightLowerArm'],
      leftEye: ['head'],
      rightEye: ['head'],
      jaw: ['head'],
    };
    const helperBonePattern = /(ik|ｉｋ|捩|ねじ|twist|先|tip|dummy|補助|袖|スカート|髪|リボン)/;
    const mapped: Record<string, { node: number }> = {};
    const usedNodes = new Set<number>();
    for (const [humanBone, names] of Object.entries(aliases)) {
      const normalizedAliases = names.map(normalize);
      const parentCandidates = (expectedParents[humanBone] ?? [])
        .map((bone) => mapped[bone]?.node)
        .filter((index): index is number => index !== undefined);
      let best: { index: number; score: number } | undefined;
      for (const candidate of normalizedNodes) {
        if (!candidate.name || usedNodes.has(candidate.index)) continue;
        let score = 0;
        normalizedAliases.forEach((alias, aliasIndex) => {
          if (candidate.name === alias) score = Math.max(score, 240 - aliasIndex * 3);
          else if (candidate.name.endsWith(alias) || candidate.name.startsWith(alias)) {
            score = Math.max(score, 125 - aliasIndex);
          }
        });
        if (!score) continue;
        if (helperBonePattern.test(candidate.name)) score -= 180;
        const isLeftBone = humanBone.startsWith('left');
        const isRightBone = humanBone.startsWith('right');
        if (isLeftBone && /(右|right)/.test(candidate.name)) score -= 300;
        if (isRightBone && /(左|left)/.test(candidate.name)) score -= 300;
        if (parentCandidates.length) {
          if (parentCandidates.some((parent) => isDescendantOf(candidate.index, parent))) {
            score += 80;
          } else {
            score -= 140;
          }
        }
        if (!best || score > best.score) best = { index: candidate.index, score };
      }
      if (best && best.score >= 150) {
        mapped[humanBone] = { node: best.index };
        usedNodes.add(best.index);
      }
    }
    return mapped;
  }
}
