import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ConversionJob, Model3dOutputFormat } from '@convertmate/shared';
import { describe, expect, test } from 'vitest';
import { BrowserModel3dEngine, VRM_REQUIRED_HUMAN_BONES } from '../src/browser-engine';

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent extends Event {} as typeof ProgressEvent;
}
if (!('self' in globalThis)) Object.defineProperty(globalThis, 'self', { value: globalThis });

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    readonly colorSpace = 'srgb';
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  } as unknown as typeof ImageData;
}

if (!globalThis.document) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==',
    'base64',
  );
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: () => undefined }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob([png], { type: 'image/png' })),
    }),
  } as unknown as Document;
}

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader extends EventTarget {
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onloadend: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

    readAsArrayBuffer(blob: Blob) {
      void this.read(blob, false);
    }

    readAsDataURL(blob: Blob) {
      void this.read(blob, true);
    }

    private async read(blob: Blob, asDataUrl: boolean) {
      try {
        const buffer = await blob.arrayBuffer();
        this.result = asDataUrl
          ? `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
          : buffer;
        const loadEvent = new ProgressEvent('load') as ProgressEvent<FileReader>;
        this.onload?.(loadEvent);
        this.dispatchEvent(loadEvent);
        const loadEndEvent = new ProgressEvent('loadend') as ProgressEvent<FileReader>;
        this.onloadend?.(loadEndEvent);
        this.dispatchEvent(loadEndEvent);
      } catch (error) {
        this.error = error instanceof DOMException ? error : new DOMException(String(error));
        const errorEvent = new ProgressEvent('error') as ProgressEvent<FileReader>;
        this.onerror?.(errorEvent);
        this.dispatchEvent(errorEvent);
      }
    }
  } as unknown as typeof FileReader;
}

const OBJ = [
  'mtllib triangle.mtl',
  'o Triangle',
  'v 0 0 0',
  'v 1 0 0',
  'v 0 1 0',
  'vt 0 0',
  'vt 1 0',
  'vt 0 1',
  'vn 0 0 1',
  'usemtl Surface',
  'f 1/1/1 2/2/1 3/3/1',
  '',
].join('\n');

const MTL = ['newmtl Surface', 'Kd 0.25 0.5 0.75', 'd 1', 'illum 2', ''].join('\n');

function job(outputFormat: Model3dOutputFormat): ConversionJob {
  const source = new File([OBJ], 'triangle.obj', { type: 'text/plain' });
  return {
    id: `triangle-${outputFormat}`,
    file: { id: 'triangle', name: source.name, size: source.size, source },
    inputFormat: 'obj',
    outputFormat,
    status: 'pending',
    progress: 0,
  };
}

async function convert(outputFormat: Model3dOutputFormat) {
  const sourceJob = job(outputFormat);
  const mtl = new File([MTL], 'triangle.mtl', { type: 'text/plain' });
  const result = await new BrowserModel3dEngine().convert(sourceJob, {
    model3d: { auxiliaryFiles: [mtl], auxiliaryFilesByJobId: { [sourceJob.id]: [mtl] } },
  });
  expect(result.status, result.error).toBe('done');
  expect(result.outputs?.length ?? 0).toBeGreaterThan(0);
  return result;
}

function release(result: ConversionJob) {
  const urls = new Set(result.outputs?.map((output) => output.url) ?? []);
  if (result.resultUrl) urls.add(result.resultUrl);
  urls.forEach((url) => URL.revokeObjectURL(url));
}

function parseGlbJson(buffer: ArrayBuffer): Record<string, unknown> {
  const view = new DataView(buffer);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim());
}

function createKtx2Glb(ktx2: Uint8Array): ArrayBuffer {
  const geometry = new Uint8Array(96);
  new Float32Array(geometry.buffer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Float32Array(geometry.buffer, 36, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  new Float32Array(geometry.buffer, 72, 6).set([0, 0, 1, 0, 0, 1]);
  const binaryLength = Math.ceil((geometry.length + ktx2.length) / 4) * 4;
  const binary = new Uint8Array(binaryLength);
  binary.set(geometry);
  binary.set(ktx2, geometry.length);
  const json = {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_texture_basisu'],
    extensionsRequired: ['KHR_texture_basisu'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Ktx2Triangle', mesh: 0 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    images: [{ bufferView: 3, mimeType: 'image/ktx2' }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 },
      { buffer: 0, byteOffset: 96, byteLength: ktx2.length },
    ],
    buffers: [{ byteLength: binaryLength }],
  };
  const encodedJson = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encodedJson.length / 4) * 4;
  const output = new ArrayBuffer(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(output);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  const jsonChunk = new Uint8Array(output, 20, jsonLength);
  jsonChunk.fill(0x20);
  jsonChunk.set(encodedJson);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  new Uint8Array(output, binaryHeader + 8).set(binary);
  return output;
}

function triangleGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  return geometry;
}

function texturedTriangle() {
  const root = new Group();
  const texture = new DataTexture(
    new Uint8Array([32, 96, 224, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = 'blue-pixel';
  texture.needsUpdate = true;
  const material = new MeshStandardMaterial({ map: texture });
  material.name = 'TexturedSurface';
  const mesh = new Mesh(triangleGeometry(), material);
  mesh.name = 'TexturedTriangle';
  root.add(mesh);
  return root;
}

function humanoidTriangle() {
  const root = new Group();
  root.name = 'HumanoidRoot';
  root.add(new Mesh(triangleGeometry(), new MeshStandardMaterial({ name: 'Body' })));
  const bones = Object.fromEntries(
    VRM_REQUIRED_HUMAN_BONES.map((name) => {
      const bone = new Group();
      bone.name = name;
      return [name, bone];
    }),
  ) as Record<(typeof VRM_REQUIRED_HUMAN_BONES)[number], Group>;
  root.add(bones.hips);
  bones.hips.add(bones.spine, bones.leftUpperLeg, bones.rightUpperLeg);
  bones.spine.add(bones.head, bones.leftUpperArm, bones.rightUpperArm);
  bones.leftUpperLeg.add(bones.leftLowerLeg);
  bones.leftLowerLeg.add(bones.leftFoot);
  bones.rightUpperLeg.add(bones.rightLowerLeg);
  bones.rightLowerLeg.add(bones.rightFoot);
  bones.leftUpperArm.add(bones.leftLowerArm);
  bones.leftLowerArm.add(bones.leftHand);
  bones.rightUpperArm.add(bones.rightLowerArm);
  bones.rightLowerArm.add(bones.rightHand);
  return root;
}

async function convertLoadedRoot(root: Group, outputFormat: Model3dOutputFormat) {
  const engine = new BrowserModel3dEngine();
  (engine as unknown as { loadModel: () => Promise<Group> }).loadModel = async () => root;
  const result = await engine.convert(job(outputFormat), {});
  expect(result.status, result.error).toBe('done');
  return result;
}

describe('conversion result round trips', () => {
  test('OBJ export is a ZIP whose OBJ and MTL can be reloaded', async () => {
    const result = await convert('obj');
    try {
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs![0].name).toMatch(/-obj\.zip$/);
      const archive = await JSZip.loadAsync(
        await fetch(result.outputs![0].url).then((r) => r.arrayBuffer()),
      );
      const objName = Object.keys(archive.files).find((name) => name.endsWith('.obj'));
      const mtlName = Object.keys(archive.files).find((name) => name.endsWith('.mtl'));
      expect(objName).toBeTruthy();
      expect(mtlName).toBeTruthy();
      const [objText, mtlText] = await Promise.all([
        archive.file(objName!)!.async('text'),
        archive.file(mtlName!)!.async('text'),
      ]);
      expect(objText).toMatch(new RegExp(`^mtllib ${mtlName}$`, 'm'));
      const materials = new MTLLoader().parse(mtlText, '');
      materials.preload();
      const root = new OBJLoader().setMaterials(materials).parse(objText);
      const mesh = root.getObjectByName('Triangle') as Mesh;
      expect(mesh?.isMesh).toBe(true);
      expect(mesh.geometry.getAttribute('position').count).toBe(3);
      expect(mesh.geometry.getAttribute('uv').count).toBe(3);
      expect(mesh.geometry.getAttribute('normal').count).toBe(3);
      expect(Array.isArray(mesh.material) ? mesh.material[0].name : mesh.material.name).toBe(
        'Surface',
      );
    } finally {
      release(result);
    }
  });

  test('STL export can be reloaded as a triangle mesh', async () => {
    const result = await convert('stl');
    try {
      const buffer = await fetch(result.outputs![0].url).then((r) => r.arrayBuffer());
      const geometry = new STLLoader().parse(buffer);
      expect(geometry.getAttribute('position').count).toBe(3);
      expect(geometry.getAttribute('normal').count).toBe(3);
    } finally {
      release(result);
    }
  });

  test('GLB export can be reloaded and retains mesh, UV, normal, and material', async () => {
    const result = await convert('glb');
    try {
      const buffer = await fetch(result.outputs![0].url).then((r) => r.arrayBuffer());
      const json = parseGlbJson(buffer) as { meshes?: unknown[]; materials?: unknown[] };
      expect(json.meshes).toHaveLength(1);
      expect(json.materials).toHaveLength(1);
      const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>(
        (resolve, reject) =>
          new GLTFLoader(new LoadingManager()).parse(buffer, '', resolve, reject),
      );
      const mesh = gltf.scene.getObjectByName('Triangle') as Mesh;
      expect(mesh?.isMesh).toBe(true);
      expect(mesh.geometry.getAttribute('uv').count).toBe(3);
      expect(mesh.geometry.getAttribute('normal').count).toBe(3);
    } finally {
      release(result);
    }
  });

  test('glTF export can be reloaded and retains mesh attributes', async () => {
    const result = await convert('gltf');
    try {
      const jsonText = await fetch(result.outputs![0].url).then((response) => response.text());
      const json = JSON.parse(jsonText) as { asset?: { version?: string }; buffers?: unknown[] };
      expect(json.asset?.version).toBe('2.0');
      expect(json.buffers).toHaveLength(1);
      const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>(
        (resolve, reject) => new GLTFLoader().parse(jsonText, '', resolve, reject),
      );
      const mesh = gltf.scene.getObjectByName('Triangle') as Mesh;
      expect(mesh?.isMesh).toBe(true);
      expect(mesh.geometry.getAttribute('uv').count).toBe(3);
      expect(mesh.geometry.getAttribute('normal').count).toBe(3);
    } finally {
      release(result);
    }
  });

  test('textured OBJ ZIP contains a PNG referenced by its MTL', async () => {
    const result = await convertLoadedRoot(texturedTriangle(), 'obj');
    try {
      const archive = await JSZip.loadAsync(
        await fetch(result.outputs![0].url).then((response) => response.arrayBuffer()),
      );
      const mtlName = Object.keys(archive.files).find((name) => name.endsWith('.mtl'))!;
      const pngName = Object.keys(archive.files).find((name) => name.endsWith('.png'))!;
      expect(mtlName).toBeTruthy();
      expect(pngName).toBeTruthy();
      const mtl = await archive.file(mtlName)!.async('text');
      expect(mtl).toMatch(new RegExp(`^map_Kd .*${pngName}$`, 'm'));
      const png = await archive.file(pngName)!.async('uint8array');
      expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    } finally {
      release(result);
    }
  });

  test('VRM export contains VRMC_vrm and can be reloaded by the official VRM loader', async () => {
    const result = await convertLoadedRoot(humanoidTriangle(), 'vrm');
    try {
      const buffer = await fetch(result.outputs![0].url).then((response) => response.arrayBuffer());
      const json = parseGlbJson(buffer) as {
        extensionsUsed?: string[];
        extensions?: { VRMC_vrm?: { humanoid?: { humanBones?: Record<string, unknown> } } };
      };
      expect(json.extensionsUsed).toContain('VRMC_vrm');
      expect(Object.keys(json.extensions?.VRMC_vrm?.humanoid?.humanBones ?? {})).toEqual(
        expect.arrayContaining([...VRM_REQUIRED_HUMAN_BONES]),
      );
      const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>(
        (resolve, reject) => {
          const loader = new GLTFLoader();
          loader.register((parser) => new VRMLoaderPlugin(parser));
          loader.parse(buffer, '', resolve, reject);
        },
      );
      expect(gltf.userData.vrm).toBeTruthy();
    } finally {
      release(result);
    }
  });

  test('KTX2 GLB follows KHR_texture_basisu and can be reloaded through a KTX2 loader', async () => {
    const path = fileURLToPath(new URL('./fixtures/ktx2/rib-normal.ktx2', import.meta.url));
    const ktx2 = new Uint8Array(await readFile(path));
    expect([...ktx2.slice(0, 12)]).toEqual([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
    const buffer = createKtx2Glb(ktx2);
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    const fakeKtx2Loader = {
      load: (_url: string, onLoad: (value: DataTexture) => void) => {
        queueMicrotask(() => onLoad(texture));
        return texture;
      },
    };
    const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>(
      (resolve, reject) => {
        const loader = new GLTFLoader();
        loader.setKTX2Loader(fakeKtx2Loader as never);
        loader.parse(buffer, '', resolve, reject);
      },
    );
    expect((gltf.scene.getObjectByName('Ktx2Triangle') as Mesh)?.isMesh).toBe(true);
    const json = parseGlbJson(buffer) as { extensionsRequired?: string[] };
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    texture.dispose();
  });

  test('reports an error for a corrupt GLB instead of producing an output', async () => {
    const source = new File([new Uint8Array([0, 1, 2, 3])], 'broken.glb', {
      type: 'model/gltf-binary',
    });
    const broken: ConversionJob = {
      id: 'broken-glb',
      file: { id: 'broken-glb', name: source.name, size: source.size, source },
      inputFormat: 'glb',
      outputFormat: 'obj',
      status: 'pending',
      progress: 0,
    };
    const result = await new BrowserModel3dEngine().convert(broken, {});
    expect(result.status).toBe('error');
    expect(result.outputs).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  test('reports an error when glTF references a missing binary file', async () => {
    const source = new File(
      [
        JSON.stringify({
          asset: { version: '2.0' },
          scene: 0,
          scenes: [{ nodes: [0] }],
          nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
          bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
          buffers: [{ uri: 'missing.bin', byteLength: 36 }],
        }),
      ],
      'missing-buffer.gltf',
      { type: 'model/gltf+json' },
    );
    const missing: ConversionJob = {
      id: 'missing-buffer',
      file: { id: 'missing-buffer', name: source.name, size: source.size, source },
      inputFormat: 'gltf',
      outputFormat: 'obj',
      status: 'pending',
      progress: 0,
    };
    const result = await new BrowserModel3dEngine().convert(missing, {});
    expect(result.status).toBe('error');
    expect(result.outputs).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});
