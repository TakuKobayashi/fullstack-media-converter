import { readFile } from 'node:fs/promises';
import { File as NodeFile } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import type { ConversionJob } from '@convertmate/shared';
import { afterEach, describe, expect, test } from 'vitest';
import {
  BrowserModel3dEngine,
  MMD_TRANSPARENCY_THRESHOLDS,
  VRM_REQUIRED_HUMAN_BONES,
} from '../src/browser-engine';

if (!globalThis.File) globalThis.File = NodeFile as unknown as typeof File;
if (!('self' in globalThis)) Object.defineProperty(globalThis, 'self', { value: globalThis });
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent extends Event {} as typeof ProgressEvent;
}

const sessions: Array<Awaited<ReturnType<BrowserModel3dEngine['createModel3dPreviewSession']>>> = [];

async function fixture(name: string): Promise<File> {
  const path = fileURLToPath(new URL(`./fixtures/vrm/${name}`, import.meta.url));
  const bytes = await readFile(path);
  return new File([bytes], name, { type: 'model/vrm' });
}

async function preview(name: string) {
  const file = await fixture(name);
  const job: ConversionJob = {
    id: name,
    file: { id: name, name, size: file.size, source: file },
    inputFormat: 'vrm',
    outputFormat: 'glb',
    status: 'pending',
    progress: 0,
  };
  const session = await new BrowserModel3dEngine().createModel3dPreviewSession(
    job,
    [],
    MMD_TRANSPARENCY_THRESHOLDS,
  );
  sessions.push(session);
  return session;
}

afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
});

describe('official VRM file loading', () => {
  test('loads a VRM 1.0 file and exposes official humanoid and expression assignments', async () => {
    const session = await preview('vrm1-expression.vrm');

    expect(session.root.children.length).toBeGreaterThan(0);
    expect(session.expressions).toEqual(expect.arrayContaining(['happy', 'blink']));
    expect(Object.keys(session.vrmHumanBones)).toEqual(
      expect.arrayContaining([...VRM_REQUIRED_HUMAN_BONES]),
    );
    expect(() => session.selectExpression('happy')).not.toThrow();
    expect(() => session.update(1 / 60)).not.toThrow();
  });

  test('loads and updates a legacy VRM 0.x file', async () => {
    const session = await preview('vrm0-emission.vrm');

    expect(session.root.children.length).toBeGreaterThan(0);
    expect(Object.keys(session.vrmHumanBones)).toEqual(
      expect.arrayContaining([...VRM_REQUIRED_HUMAN_BONES]),
    );
    expect(() => session.update(1 / 60)).not.toThrow();
  });
});
