import { readFile } from 'node:fs/promises';
import { File as NodeFile } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { AnimationClip, AnimationMixer, Bone, QuaternionKeyframeTrack } from 'three';
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
  globalThis.ProgressEvent =
    class ProgressEvent extends Event {} as unknown as typeof ProgressEvent;
}

const sessions: Array<Awaited<ReturnType<BrowserModel3dEngine['createModel3dPreviewSession']>>> =
  [];

async function fixture(name: string): Promise<File> {
  const path = fileURLToPath(new URL(`./fixtures/vrm/${name}`, import.meta.url));
  const bytes = await readFile(path);
  return new File([bytes], name, { type: 'model/vrm' });
}

async function preview(name: string, engine = new BrowserModel3dEngine()) {
  const file = await fixture(name);
  const job: ConversionJob = {
    id: name,
    file: { id: name, name, size: file.size, source: file },
    inputFormat: 'vrm',
    outputFormat: 'glb',
    status: 'pending',
    progress: 0,
  };
  const session = await engine.createModel3dPreviewSession(job, [], MMD_TRANSPARENCY_THRESHOLDS);
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

  test('retargets a VRMA bone with an arbitrary node name to the loaded VRM humanoid', async () => {
    const engine = new BrowserModel3dEngine();
    const session = await preview('vrm1-expression.vrm', engine);
    const source = new Bone();
    source.name = 'motion_001';
    source.userData.vrmaHumanBones = {
      head: { name: source.name, uuid: source.uuid },
    };
    const clip = new AnimationClip('head turn', 1, [
      new QuaternionKeyframeTrack(
        'motion_001.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
      ),
    ]);

    const retargeted = engine['retargetPreviewClip'](source, session.root, clip);
    const headName = session.root.getObjectByName('Normalized_Head')?.name;
    expect(headName).toBeTruthy();
    expect(retargeted.tracks[0]?.name).toBe(`${headName}.quaternion`);
    const head = session.root.getObjectByName(headName!);
    const rawHead = session.root.getObjectByName('Head');
    const initialNormalizedRotation = head!.quaternion.clone();
    const initialRawRotation = rawHead!.quaternion.clone();
    const mixer = new AnimationMixer(session.root);
    mixer.clipAction(retargeted).play();
    mixer.update(0.5);
    session.update(0);
    expect(head!.quaternion.equals(initialNormalizedRotation)).toBe(false);
    expect(rawHead!.quaternion.equals(initialRawRotation)).toBe(false);
    mixer.stopAllAction();
    mixer.uncacheRoot(session.root);
  });

  test('keeps a VMD-style motion visible after the VRM humanoid updates', async () => {
    const engine = new BrowserModel3dEngine();
    const session = await preview('vrm1-expression.vrm', engine);
    const motionBone = new Bone();
    motionBone.name = 'head';
    const clip = new AnimationClip('head turn', 1, [
      new QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
      ),
    ]);

    const retargeted = engine['retargetPreviewClip'](motionBone, session.root, clip);
    expect(retargeted.tracks[0]?.name).toBe('Normalized_Head.quaternion');
    const rawHead = session.root.getObjectByName('Head')!;
    const initialRotation = rawHead.quaternion.clone();
    const mixer = new AnimationMixer(session.root);
    mixer.clipAction(retargeted).play();
    mixer.update(0.5);
    session.update(0);
    expect(rawHead.quaternion.equals(initialRotation)).toBe(false);
    mixer.stopAllAction();
    mixer.uncacheRoot(session.root);
  });

  test('retargets a VMD-style motion to a non-VRM rig', () => {
    const engine = new BrowserModel3dEngine();
    const motionBone = new Bone();
    motionBone.name = 'leftUpperArm';
    const modelBone = new Bone();
    modelBone.name = 'mixamorigLeftArm';
    const clip = new AnimationClip('arm raise', 1, [
      new QuaternionKeyframeTrack(
        'leftUpperArm.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
      ),
    ]);

    const retargeted = engine['retargetPreviewClip'](motionBone, modelBone, clip);
    expect(retargeted.tracks[0]?.name).toBe('mixamorigLeftArm.quaternion');
    const initialRotation = modelBone.quaternion.clone();
    const mixer = new AnimationMixer(modelBone);
    mixer.clipAction(retargeted).play();
    mixer.update(0.5);
    expect(modelBone.quaternion.equals(initialRotation)).toBe(false);
    mixer.stopAllAction();
    mixer.uncacheRoot(modelBone);
  });
});
