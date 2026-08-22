import {
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
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
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
import { ThreeMmdLoader } from '@yohawing/three-mmd-loader';
import {
  MODEL3D_INPUT_EXTENSIONS,
  MODEL3D_OUTPUT_FORMATS,
  canConvert,
  getMimeType,
  model3dFormatMayContainBones,
  model3dOutputSupportsBones,
  type ConversionEngine,
  type ConversionJob,
  type ConversionOptions,
  type InputFormat,
  type Model3dFormat,
  type Model3dOutputFormat,
  type Model3dTransparencySettings,
  type OutputFormat,
} from '@convertmate/shared';

const MMD_BAKE_LIGHT = new Vector3(0.5, 1, 1).normalize();
const MMD_VRM_TARGET_HEIGHT_METERS = 1.7;

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
  textureTransparentMaxAlphaByte: 24,

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

export interface VrmPreviewSession {
  root: Object3D;
  updateTransparency(settings: Model3dTransparencySettings): void;
  dispose(): void;
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
      const auxiliaryFiles = options.model3d?.auxiliaryFiles ?? [];
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
        await this.bakeMmdMaterials(root, job.outputFormat === 'vrm', transparency);
      }
      if ((job.inputFormat === 'pmx' || job.inputFormat === 'pmd') && job.outputFormat === 'vrm') {
        this.normalizeMmdVrmScale(root);
      }
      options.onProgress?.(65);
      const blob = await this.exportModel(
        root,
        job.outputFormat as Model3dOutputFormat,
        job.file.name,
      );
      if (!blob.size) throw new Error('Conversion produced an empty model file.');
      options.onProgress?.(95);
      return { ...job, resultUrl: URL.createObjectURL(blob), status: 'done', progress: 100 };
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

  async createVrmPreviewSession(
    job: ConversionJob,
    auxiliaryFiles: File[],
    initialSettings: Model3dTransparencySettings,
  ): Promise<VrmPreviewSession> {
    const source = job.file.source;
    if (!(source instanceof File) && !(source instanceof ArrayBuffer)) {
      throw new Error('Browser model preview requires a File or ArrayBuffer.');
    }
    const objectUrls: string[] = [];
    const manager = this.createLoadingManager(auxiliaryFiles, objectUrls);
    const root = await this.loadModel(source, job.inputFormat, auxiliaryFiles, manager);
    const isMmd = job.inputFormat === 'pmx' || job.inputFormat === 'pmd';
    const materialSources = new Map<Mesh, Material[]>();
    const generatedMaterials = new Set<Material>();
    let maxMaterialIndex = 0;
    if (isMmd) {
      root.traverse((object) => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materialSources.set(mesh, materials);
        for (const material of materials) {
          maxMaterialIndex = Math.max(
            maxMaterialIndex,
            (material.userData.mmdMaterial as { materialIndex?: number } | undefined)
              ?.materialIndex ?? 0,
          );
        }
      });
      this.normalizeMmdVrmScale(root);
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
          const convertedMaterial = this.createMmdMToonFallback(
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
          );
          generatedMaterials.add(convertedMaterial);
          return convertedMaterial;
        });
        mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
      }
    };
    updateTransparency(initialSettings);
    return {
      root,
      updateTransparency,
      dispose: () => {
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
    root.rotateY(Math.PI);
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
        return new Promise((resolve, reject) =>
          new GLTFLoader(manager).parse(
            format === 'gltf' ? text() : buffer,
            '',
            (gltf) => resolve(gltf.scene),
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
      case 'dae':
        return new ColladaLoader(manager).parse(text(), '').scene;
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
          morphAttributes: false,
          morphSplit: false,
        });
        return mmdModel3d.root;
      }
      default:
        throw new Error(`Unsupported model input: ${format}`);
    }
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
   * Bake MMD's diffuse texture, toon ramp and sphere texture into a portable
   * unlit material. glTF cannot serialize the loader's onBeforeCompile shader.
   */
  private async bakeMmdMaterials(
    root: Object3D,
    useMToon: boolean,
    transparency: Model3dTransparencySettings,
  ): Promise<void> {
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    const materialIndices = meshes.flatMap((mesh) =>
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
        (material) =>
          (material.userData.mmdMaterial as { materialIndex?: number } | undefined)
            ?.materialIndex ?? 0,
      ),
    );
    const maxMaterialIndex = Math.max(0, ...materialIndices);
    for (const mesh of meshes) {
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const bakedMaterials = await Promise.all(
        sourceMaterials.map((material, materialIndex) =>
          this.bakeMmdMaterial(
            material,
            mesh,
            materialIndex,
            useMToon,
            maxMaterialIndex,
            transparency,
          ),
        ),
      );
      mesh.material = Array.isArray(mesh.material) ? bakedMaterials : bakedMaterials[0];
    }
  }

  private async bakeMmdMaterial(
    source: Material,
    mesh: Mesh,
    materialIndex: number,
    useMToon: boolean,
    maxMaterialIndex: number,
    transparency: Model3dTransparencySettings,
  ): Promise<Material> {
    const toon = source as Material & {
      color?: { r: number; g: number; b: number };
      map?: Texture | null;
      gradientMap?: Texture | null;
      opacity?: number;
      alphaTest?: number;
      transparent?: boolean;
      side?: number;
    };
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
    if (useMToon) {
      return this.createMmdMToonFallback(source, metadata, toon, maxMaterialIndex, transparency);
    }

    const basePixels = this.readTexturePixels(toon.map ?? undefined);
    const toonPixels = this.readTexturePixels(toon.gradientMap ?? undefined);
    const sphereTexture = source.userData.mmdSphereTexture as Texture | undefined;
    const spherePixels = this.readTexturePixels(sphereTexture);
    const width = Math.min(basePixels?.width ?? 512, 1024);
    const height = Math.min(basePixels?.height ?? 512, 1024);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return this.createMmdPbrFallback(source, metadata);

    const output = context.createImageData(width, height);
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
    const accumulated = new Float32Array(width * height * 4);
    const samples = new Uint16Array(width * height);
    this.rasterizeMmdUv(
      mesh,
      materialIndex,
      width,
      height,
      toon.map?.flipY ?? false,
      (x, y, normal) => {
        const base = this.sampleTexture(
          basePixels,
          width === 1 ? 0 : x / (width - 1),
          height === 1 ? 0 : y / (height - 1),
        );
        const shaded = this.shadeMmdTexel(
          base,
          normal,
          lit,
          toonPixels,
          spherePixels,
          metadata.sphereMode,
        );
        const pixel = y * width + x;
        const target = pixel * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          accumulated[target + channel] += shaded[channel];
        }
        if (samples[pixel] < 65535) samples[pixel] += 1;
      },
    );
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const target = (y * width + x) * 4;
        const count = samples[y * width + x];
        if (count > 0) {
          for (let channel = 0; channel < 4; channel += 1) {
            output.data[target + channel] = Math.round(
              Math.max(0, Math.min(1, accumulated[target + channel] / count)) * 255,
            );
          }
          output.data[target + 3] = Math.round(
            Math.min(1, (accumulated[target + 3] / count) * diffuse[3]) * 255,
          );
        } else {
          const base = this.sampleTexture(
            basePixels,
            width === 1 ? 0 : x / (width - 1),
            height === 1 ? 0 : y / (height - 1),
          );
          for (let channel = 0; channel < 3; channel += 1) {
            output.data[target + channel] = Math.round(base[channel] * 255);
          }
          output.data[target + 3] = Math.round(base[3] * diffuse[3] * 255);
        }
      }
    }
    context.putImageData(output, 0, 0);
    const bakedMap = new CanvasTexture(canvas);
    bakedMap.colorSpace = SRGBColorSpace;
    bakedMap.name = `${source.name || 'mmd-material'}-baked`;
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
    return new MeshBasicMaterial({
      name: source.name,
      map: bakedMap,
      transparent:
        toon.transparent || diffuse[3] < MMD_TRANSPARENCY_THRESHOLDS.materialOpaqueMinAlpha,
      opacity: 1,
      alphaTest: toon.alphaTest ?? 0,
      side: metadata.flags?.doubleSided || toon.side === DoubleSide ? DoubleSide : toon.side,
      vertexColors: (source as { vertexColors?: boolean }).vertexColors ?? false,
    });
  }

  private createMmdMToonFallback(
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
  ): Material {
    const diffuse = metadata.diffuse ?? [1, 1, 1, toon.opacity ?? 1];
    const ambient = metadata.ambient ?? [0.2, 0.2, 0.2];
    const edgeColor = metadata.edgeColor ?? [0, 0, 0, 1];
    const transparency = this.resolveMmdTransparencyMode(
      metadata.transparencyMode,
      toon.map ?? undefined,
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
    const material = new MeshStandardMaterial({
      name: source.name,
      color: new Color(diffuse[0], diffuse[1], diffuse[2]),
      map: toon.map ?? null,
      metalness: 0,
      roughness: 1,
      transparent: isBlend,
      opacity: diffuse[3],
      alphaTest: isMask ? Math.max(settings.maskMinAlphaCutoff, toon.alphaTest ?? 0) : 0,
      depthWrite: !isBlend || transparency.textureDrivenBlendWithZWrite,
      side: metadata.flags?.doubleSided || toon.side === DoubleSide ? DoubleSide : toon.side,
      emissive: new Color(0, 0, 0),
      emissiveMap: null,
    });
    const outlineEnabled = Boolean(
      !isBlend && metadata.flags?.edge && (metadata.edgeSize ?? 0) > 0,
    );
    const shadeStrength = Math.max(
      0.55,
      Math.min(0.82, (ambient[0] + ambient[1] + ambient[2]) / 3 + 0.2),
    );
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
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            const px = x + 0.5;
            const py = y + 0.5;
            const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denominator;
            const b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denominator;
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

  private shadeMmdTexel(
    base: [number, number, number, number],
    normal: Vector3,
    lit: number[],
    toonPixels: { data: Uint8ClampedArray; width: number; height: number } | undefined,
    spherePixels: { data: Uint8ClampedArray; width: number; height: number } | undefined,
    sphereMode: 'none' | 'multiply' | 'add' | 'subTexture' | undefined,
  ): [number, number, number, number] {
    const toonCoordinate = Math.max(0, Math.min(1, normal.dot(MMD_BAKE_LIGHT) * 0.5 + 0.45));
    const toonSample = this.sampleTexture(toonPixels, 0, toonCoordinate);
    const sphereSample = this.sampleTexture(
      spherePixels,
      normal.x * 0.5 + 0.5,
      normal.y * 0.5 + 0.5,
    );
    const result: [number, number, number, number] = [0, 0, 0, base[3]];
    for (let channel = 0; channel < 3; channel += 1) {
      let value = lit[channel] * base[channel] * toonSample[channel];
      if (spherePixels && sphereMode === 'multiply') value *= sphereSample[channel];
      if (spherePixels && sphereMode === 'add') value += sphereSample[channel] * 2;
      if (spherePixels && sphereMode === 'subTexture') value = sphereSample[channel];
      result[channel] = Math.max(0, Math.min(1, value));
    }
    return result;
  }

  private createMmdPbrFallback(
    source: Material,
    metadata: { diffuse?: [number, number, number, number]; flags?: { doubleSided?: boolean } },
  ): Material {
    const toon = source as Material & {
      map?: Texture | null;
      transparent?: boolean;
      alphaTest?: number;
      side?: number;
    };
    const diffuse = metadata.diffuse ?? [1, 1, 1, 1];
    return new MeshStandardMaterial({
      name: source.name,
      color: new Color(diffuse[0], diffuse[1], diffuse[2]),
      map: toon.map ?? null,
      metalness: 0,
      roughness: 0.8,
      transparent:
        toon.transparent || diffuse[3] < MMD_TRANSPARENCY_THRESHOLDS.materialOpaqueMinAlpha,
      opacity: diffuse[3],
      alphaTest: toon.alphaTest ?? 0,
      side: metadata.flags?.doubleSided || toon.side === DoubleSide ? DoubleSide : toon.side,
    });
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

  private async exportModel(
    root: Object3D,
    format: Model3dOutputFormat,
    sourceName: string,
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
      animations: [],
      onlyVisible: true,
      trs: false,
    });
    if (exported instanceof ArrayBuffer) {
      const output = format === 'vrm' ? this.addVrmExtension(exported, sourceName) : exported;
      return new Blob([output], { type: getMimeType(format) });
    }
    return new Blob([JSON.stringify(exported)], { type: getMimeType(format) });
  }

  private addVrmExtension(glb: ArrayBuffer, sourceName: string): ArrayBuffer {
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
      nodes?: Array<{ name?: string; children?: number[] }>;
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
      hips: ['hips', 'pelvis', 'mixamorighips', 'センター', '腰', '下半身'],
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
