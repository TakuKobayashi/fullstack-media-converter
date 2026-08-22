'use client';

import { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ConversionJob, Model3dTransparencySettings } from '@convertmate/shared';
import {
  BrowserModel3dEngine,
  MMD_TRANSPARENCY_THRESHOLDS,
  type Model3dPreviewSession,
} from '@convertmate/model3d';
import { vrmTransparencySettingsAtomFamily } from '@/state/preferences';
import { useTranslation } from '@/i18n';
import s from '@/styles/converter.module.css';

const previewEngine = new BrowserModel3dEngine();

type SettingKey = keyof Model3dTransparencySettings;
const controls: Array<{ key: SettingKey; min: number; max: number; step: number }> = [
  { key: 'materialOpaqueMinAlpha', min: 0, max: 1, step: 0.01 },
  { key: 'textureTransparentMaxAlphaByte', min: 0, max: 127, step: 1 },
  { key: 'textureOpaqueMinAlphaByte', min: 128, max: 255, step: 1 },
  { key: 'cutoutMaxIntermediateAlphaRatio', min: 0, max: 1, step: 0.01 },
  { key: 'blendZWriteMinExtremeAlphaRatio', min: 0, max: 1, step: 0.01 },
  { key: 'maskMinAlphaCutoff', min: 0, max: 0.5, step: 0.01 },
  { key: 'mtoonRenderQueueOffsetLimit', min: 0, max: 9, step: 1 },
];

const VRM_ONLY_SETTING_KEYS = new Set<SettingKey>([
  'blendZWriteMinExtremeAlphaRatio',
  'mtoonRenderQueueOffsetLimit',
]);

export interface VrmTransparencyPreviewModalProps {
  job: ConversionJob;
  auxiliaryFiles: File[];
  onClose: () => void;
  onLoadFailure: (error: string) => void;
  onApply: (settings: Model3dTransparencySettings) => void;
}

export default function VrmTransparencyPreviewModal({
  job,
  auxiliaryFiles,
  onClose,
  onLoadFailure,
  onApply,
}: VrmTransparencyPreviewModalProps) {
  const { t } = useTranslation();
  const [stored, setStored] = useAtom(vrmTransparencySettingsAtomFamily(job.file.name));
  const [draft, setDraft] = useState<Model3dTransparencySettings>(() => ({
    ...MMD_TRANSPARENCY_THRESHOLDS,
    ...(stored ?? {}),
  }));
  const [previewing, setPreviewing] = useState(true);
  const [previewError, setPreviewError] = useState<string>();
  const [animations, setAnimations] = useState<string[]>([]);
  const [expressions, setExpressions] = useState<string[]>([]);
  const [bones, setBones] = useState<string[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState('');
  const [selectedExpression, setSelectedExpression] = useState('');
  const [selectedBone, setSelectedBone] = useState('');
  const [openList, setOpenList] = useState<'animations' | 'expressions' | 'bones'>('animations');
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Model3dPreviewSession | undefined>(undefined);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const scene = new Scene();
    scene.background = new Color(0x111722);
    const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.replaceChildren(renderer.domElement);
    scene.add(new AmbientLight(0xffffff, 1.8));
    const light = new DirectionalLight(0xffffff, 2.2);
    // ThreeMmdLoader has already converted MMD into the glTF/VRM-facing basis.
    const previewFrontZ = 1;
    light.position.set(2, 3, 4 * previewFrontZ);
    scene.add(light);
    const controls3d = new OrbitControls(camera, renderer.domElement);
    controls3d.enableDamping = true;
    let disposed = false;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    previewEngine
      .createModel3dPreviewSession(job, auxiliaryFiles, draftRef.current)
      .then((session) => {
        if (disposed) {
          session.dispose();
          return;
        }
        sessionRef.current = session;
        setAnimations(session.animations);
        setExpressions(session.expressions);
        setBones(session.bones);
        setSelectedAnimation(session.animations[0] ?? '');
        session.updateTransparency(draftRef.current);
        scene.add(session.root);
        scene.add(session.boneOverlay);
        const bounds = new Box3().setFromObject(session.root);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const distance = Math.max(size.x, size.y, size.z, 0.1) * 1.7;
        camera.position.set(center.x, center.y, center.z + distance * previewFrontZ);
        controls3d.target.copy(center);
        controls3d.update();
        setPreviewing(false);
      })
      .catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setPreviewError(message);
        setPreviewing(false);
        onLoadFailure(message);
      });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let previousTime = performance.now();
    renderer.setAnimationLoop((time) => {
      const deltaSeconds = Math.min(Math.max((time - previousTime) / 1000, 0), 0.1);
      previousTime = time;
      sessionRef.current?.update(deltaSeconds);
      controls3d.update();
      renderer.render(scene, camera);
    });
    return () => {
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls3d.dispose();
      sessionRef.current?.dispose();
      sessionRef.current = undefined;
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The session deliberately loads once per modal. Slider updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionRef.current?.updateTransparency(draft);
  }, [draft]);

  useEffect(() => {
    sessionRef.current?.showBones(openList === 'bones');
  }, [openList]);

  const update = (key: SettingKey, value: number) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const isMmd = job.inputFormat === 'pmx' || job.inputFormat === 'pmd';

  return (
    <div className={s.previewBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={s.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={t('model3d.previewTitle', {
          file: job.file.name,
          format: job.outputFormat.toUpperCase(),
        })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={s.previewHeader}>
          <div>
            <strong>
              {t('model3d.previewTitle', {
                file: job.file.name,
                format: job.outputFormat.toUpperCase(),
              })}
            </strong>
            <p>{t('model3d.previewHelp')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('model3d.closePreview')}>
            ×
          </button>
        </header>
        <div className={s.previewBody}>
          <div className={s.previewStage}>
            <div className={s.previewCanvasHost} ref={canvasHostRef} />
            {previewing && <span className={s.previewStatus}>{t('model3d.updatingPreview')}</span>}
            {previewError && <span className={s.previewError}>{previewError}</span>}
          </div>
          <div className={s.previewSettings}>
            <div className={s.previewInspectionTabs}>
              <button
                type="button"
                className={openList === 'animations' ? s.previewInspectionTabActive : ''}
                onClick={() => setOpenList('animations')}
              >
                {t('model3d.animationList')} ({animations.length})
              </button>
              <button
                type="button"
                className={openList === 'expressions' ? s.previewInspectionTabActive : ''}
                onClick={() => setOpenList('expressions')}
              >
                {t('model3d.expressionList')} ({expressions.length})
              </button>
              <button
                type="button"
                className={openList === 'bones' ? s.previewInspectionTabActive : ''}
                onClick={() => {
                  setOpenList('bones');
                  sessionRef.current?.showBones(true);
                }}
              >
                {t('model3d.boneList')} ({bones.length})
              </button>
            </div>
            {openList === 'animations' && (
              <div className={s.previewInspectionPanel}>
                {animations.length ? (
                  <>
                    <select
                      value={selectedAnimation}
                      onChange={(event) => {
                        sessionRef.current?.stopAnimation();
                        setSelectedAnimation(event.target.value);
                      }}
                    >
                      {animations.map((name) => <option key={name}>{name}</option>)}
                    </select>
                    <div className={s.previewPlaybackControls}>
                      <button type="button" onClick={() => sessionRef.current?.playAnimation(selectedAnimation)}>Play</button>
                      <button type="button" onClick={() => sessionRef.current?.pauseAnimation()}>Pause</button>
                      <button type="button" onClick={() => sessionRef.current?.stopAnimation()}>Stop</button>
                    </div>
                  </>
                ) : <p>{t('model3d.noAnimations')}</p>}
              </div>
            )}
            {openList === 'expressions' && (
              <div className={s.previewInspectionPanel}>
                {expressions.length ? (
                  <div className={s.previewExpressionList}>
                    {expressions.map((name) => (
                      <button
                        type="button"
                        key={name}
                        className={selectedExpression === name ? s.previewExpressionActive : ''}
                        onClick={() => {
                          sessionRef.current?.stopAnimation();
                          setSelectedExpression(name);
                          sessionRef.current?.selectExpression(name);
                        }}
                      >{name}</button>
                    ))}
                  </div>
                ) : <p>{t('model3d.noExpressions')}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExpression('');
                    sessionRef.current?.resetExpressions();
                  }}
                >{t('model3d.resetExpression')}</button>
              </div>
            )}
            {openList === 'bones' && (
              <div className={s.previewInspectionPanel}>
                {bones.length ? (
                  <div className={s.previewBoneList}>
                    {bones.map((name) => (
                      <button
                        type="button"
                        key={name}
                        className={selectedBone === name ? s.previewBoneActive : ''}
                        aria-pressed={selectedBone === name}
                        onClick={() => {
                          setSelectedBone(name);
                          sessionRef.current?.showBones(true);
                          sessionRef.current?.selectBone(name);
                        }}
                      >{name}</button>
                    ))}
                  </div>
                ) : <p>{t('model3d.noBones')}</p>}
              </div>
            )}
            {isMmd && controls
              .filter(({ key }) => job.outputFormat === 'vrm' || !VRM_ONLY_SETTING_KEYS.has(key))
              .map(({ key, min, max, step }) => (
                <label className={s.previewControl} key={key}>
                  <span>{t(`model3d.transparency.${key}`)}</span>
                  <div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={draft[key]}
                      onChange={(event) => update(key, Number(event.target.value))}
                    />
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={draft[key]}
                      onChange={(event) => update(key, Number(event.target.value))}
                    />
                  </div>
                </label>
              ))}
          </div>
        </div>
        <footer className={s.previewFooter}>
          {isMmd && <button type="button" onClick={() => setDraft({ ...MMD_TRANSPARENCY_THRESHOLDS })}>
            {t('model3d.resetTransparency')}
          </button>}
          <button type="button" onClick={onClose}>
            {isMmd ? t('model3d.cancelPreview') : t('model3d.closePreview')}
          </button>
          {isMmd && <button
            type="button"
            className={s.previewApply}
            onClick={() => {
              setStored(draft);
              onApply(draft);
              onClose();
            }}
          >
            {t('model3d.applyTransparency')}
          </button>}
        </footer>
      </section>
    </div>
  );
}
