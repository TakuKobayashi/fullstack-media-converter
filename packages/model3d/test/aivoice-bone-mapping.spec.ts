import { Bone, Group, type Object3D } from 'three';
import { describe, expect, test } from 'vitest';
import { BrowserModel3dEngine, VRM_REQUIRED_HUMAN_BONES } from '../src/browser-engine';

type TestableEngine = {
  prepareMmdVrmHumanoidHierarchy(root: Object3D): void;
  canonicalizeMmdVrmBoneNames(root: Object3D): void;
};

function mmdBone(name: string, japaneseName: string): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.userData.mmdBoneName = japaneseName;
  bone.userData.mmdEnglishBoneName = name;
  return bone;
}

function aivoiceSkeleton(): Group {
  const root = new Group();
  const center = mmdBone('center', 'センター');
  const groove = mmdBone('groove', 'グルーブ');
  const hips = mmdBone('Hips', '下半身');
  const spine = mmdBone('Spine', '上半身');
  const chest = mmdBone('Spine2', '上半身2');
  const neck = mmdBone('Neck', '首');
  const head = mmdBone('Head', '頭');
  const leftUpperLeg = mmdBone('UpLeg_L', '左足');
  const leftLowerLeg = mmdBone('Leg_L', '左ひざ');
  const leftFoot = mmdBone('Foot_L', '左足首');
  const rightUpperLeg = mmdBone('UpLeg_R', '右足');
  const rightLowerLeg = mmdBone('Leg_R', '右ひざ');
  const rightFoot = mmdBone('Foot_R', '右足首');
  const leftShoulder = mmdBone('Shoulder_L', '左肩');
  const leftUpperArm = mmdBone('Arm_L', '左腕');
  const leftLowerArm = mmdBone('ForeArm_L', '左ひじ');
  const leftHand = mmdBone('Hand_L', '左手首');
  const rightShoulder = mmdBone('Shoulder_R', '右肩');
  const rightUpperArm = mmdBone('Arm_R', '右腕');
  const rightLowerArm = mmdBone('ForeArm_R', '右ひじ');
  const rightHand = mmdBone('Hand_R', '右手首');

  root.add(center);
  center.add(groove);
  groove.add(hips, spine);
  hips.add(leftUpperLeg, rightUpperLeg);
  leftUpperLeg.add(leftLowerLeg);
  leftLowerLeg.add(leftFoot);
  rightUpperLeg.add(rightLowerLeg);
  rightLowerLeg.add(rightFoot);
  spine.add(chest);
  chest.add(neck, leftShoulder, rightShoulder);
  neck.add(head);
  leftShoulder.add(leftUpperArm);
  leftUpperArm.add(leftLowerArm);
  leftLowerArm.add(leftHand);
  rightShoulder.add(rightUpperArm);
  rightUpperArm.add(rightLowerArm);
  rightLowerArm.add(rightHand);
  return root;
}

describe('A.I.VOICE MMD humanoid bone mapping', () => {
  test('recognizes the Kotonoha PMX English names and Japanese metadata aliases', () => {
    const root = aivoiceSkeleton();
    const engine = new BrowserModel3dEngine() as unknown as TestableEngine;

    engine.prepareMmdVrmHumanoidHierarchy(root);
    engine.canonicalizeMmdVrmBoneNames(root);

    const mapped = new Set<string>();
    root.traverse((object) => {
      if (object.name.startsWith('VRM_')) mapped.add(object.name.slice(4));
    });
    expect([...VRM_REQUIRED_HUMAN_BONES].filter((name) => !mapped.has(name))).toEqual([]);
    expect(root.getObjectByName('VRM_leftUpperLeg')?.userData.mmdEnglishBoneName).toBe('UpLeg_L');
    expect(root.getObjectByName('VRM_leftLowerLeg')?.userData.mmdEnglishBoneName).toBe('Leg_L');
    expect(root.getObjectByName('VRM_rightUpperLeg')?.userData.mmdEnglishBoneName).toBe('UpLeg_R');
    expect(root.getObjectByName('VRM_rightLowerLeg')?.userData.mmdEnglishBoneName).toBe('Leg_R');
  });
});
