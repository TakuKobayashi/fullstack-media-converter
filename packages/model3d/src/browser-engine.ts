import {
  Bone,
  BufferAttribute,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
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
  type ConversionEngine,
  type ConversionJob,
  type ConversionOptions,
  type InputFormat,
  type Model3dOutputFormat,
  type OutputFormat,
} from '@convertmate/shared';

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
      this.makeStatic(root);
      options.onProgress?.(65);
      const blob = await this.exportModel(root, job.outputFormat as Model3dOutputFormat);
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

  private async exportModel(root: Object3D, format: Model3dOutputFormat): Promise<Blob> {
    if (format === 'obj') {
      return new Blob([new OBJExporter().parse(root)], { type: getMimeType(format) });
    }
    if (format === 'stl') {
      return new Blob([new STLExporter().parse(root, { binary: true })], {
        type: getMimeType(format),
      });
    }
    const exported = await new GLTFExporter().parseAsync(root, {
      binary: format === 'glb',
      animations: [],
      onlyVisible: true,
      trs: false,
    });
    if (exported instanceof ArrayBuffer) return new Blob([exported], { type: getMimeType(format) });
    return new Blob([JSON.stringify(exported)], { type: getMimeType(format) });
  }
}
