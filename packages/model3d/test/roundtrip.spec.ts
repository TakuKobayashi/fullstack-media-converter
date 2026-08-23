import JSZip from 'jszip';
import { LoadingManager, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ConversionJob, Model3dOutputFormat } from '@convertmate/shared';
import { describe, expect, test } from 'vitest';
import { BrowserModel3dEngine } from '../src/browser-engine';

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent extends Event {} as typeof ProgressEvent;
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
  expect(result.outputs?.length).toBeTruthy();
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

describe('conversion result round trips', () => {
test('OBJ export is a ZIP whose OBJ and MTL can be reloaded', async () => {
  const result = await convert('obj');
  try {
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].name).toMatch(/-obj\.zip$/);
    const archive = await JSZip.loadAsync(await fetch(result.outputs![0].url).then((r) => r.arrayBuffer()));
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
    expect(Array.isArray(mesh.material) ? mesh.material[0].name : mesh.material.name).toBe('Surface');
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
    const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) =>
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
});
