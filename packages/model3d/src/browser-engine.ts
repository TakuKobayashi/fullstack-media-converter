import {
  Bone,
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
  type OutputFormat,
} from '@convertmate/shared';

const MMD_BAKE_LIGHT = new Vector3(0.5, 1, 1).normalize();

export class BrowserModel3dEngine implements ConversionEngine {
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
        await this.bakeMmdMaterials(root);
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
  private async bakeMmdMaterials(root: Object3D): Promise<void> {
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    for (const mesh of meshes) {
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const bakedMaterials = await Promise.all(
        sourceMaterials.map((material, materialIndex) =>
          this.bakeMmdMaterial(material, mesh, materialIndex),
        ),
      );
      mesh.material = Array.isArray(mesh.material) ? bakedMaterials : bakedMaterials[0];
    }
  }

  private async bakeMmdMaterial(
    source: Material,
    mesh: Mesh,
    materialIndex: number,
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
          sphereMode?: 'none' | 'multiply' | 'add' | 'subTexture';
          flags?: { doubleSided?: boolean };
        }
      | undefined;
    if (!metadata) return source;

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
      transparent: toon.transparent || diffuse[3] < 1,
      opacity: 1,
      alphaTest: toon.alphaTest ?? 0,
      side: metadata.flags?.doubleSided || toon.side === DoubleSide ? DoubleSide : toon.side,
      vertexColors: (source as { vertexColors?: boolean }).vertexColors ?? false,
    });
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
      transparent: toon.transparent || diffuse[3] < 1,
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
