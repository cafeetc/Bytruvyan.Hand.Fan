/**
 * Pyxl Hand Rig v2
 * Spec doc: 1CKhcWot0YDq-HHtsem2uLG31knrrd6RFz5iH1_nIQo0 (pyxl.hand.v2, 2026-10-22)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FingerName,
  HandBuild,
  State,
  BONES,
  SUM,
  KN,
  FINGER_ORDER,
  CONTROLS_FINGER_ORDER,
  R,
  norm,
  clamp,
  cRange,
  rRange,
  calcA,
  wid,
  reach,
  defaultState,
  cleanPose,
  clampStateToLimits,
  runIk,
  getActiveFingers,
  PRESET_POSES,
  getBoneBox,
} from './pyxlHandCore.ts';
import { generateStandaloneHtml } from './pyxlHandStandalone.ts';
import {
  buildSequence,
  canvasFromMarkup,
  canvasBlob,
  compressPngPixels,
  downloadBlob,
  encodeApng,
  generateHandSvgMarkup,
  buildSvgDocument,
  gifFrame,
  gifHeader,
  gifIndices,
  interpolatePose,
  squareViewBox,
  zipStore,
  ZipFileEntry,
  concatBytes,
  makeMeasurer,
} from './pyxlHandAnimation.ts';
import {
  Sun,
  Moon,
  RotateCcw,
  FlipHorizontal2,
  Download,
  Copy,
  Check,
  Sparkles,
  Layers,
  HelpCircle,
  FileCode,
  Share2,
  Plus,
  Minus,
  Play,
  Square,
  Film,
  Image as ImageIcon,
  FileArchive,
  RefreshCw,
  Undo2,
  Redo2,
  X,
  Bookmark,
  Hand,
  ThumbsUp,
  Scissors,
  Flame,
  Feather,
  CircleDot,
  Sliders,
  BookOpen,
  Shuffle,
  Search,
  MousePointer,
  Minimize2,
} from 'lucide-react';

const STORAGE_KEY = '***';
const ALT_STORAGE_KEY = 'pyxl.hand.v2';

export default function App() {
  const [state, setState] = useState<State>(defaultState);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [stageHeightPct, setStageHeightPct] = useState<number>(66.667);
  const [selectedPoseKey, setSelectedPoseKey] = useState<string>('');
  const [poseNameInput, setPoseNameInput] = useState<string>('');
  const [jsonText, setJsonText] = useState<string>('');
  const [savedPoses, setSavedPoses] = useState<Record<string, Partial<State>>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [activeRightPanel, setActiveRightPanel] = useState<'poses' | 'export-image' | 'export-anim' | null>(null);
  const [activeLeftPanel, setActiveLeftPanel] = useState<'poses' | 'morph' | null>(null);
  const [poseSearchFilter, setPoseSearchFilter] = useState<string>('');
  const [poseCategoryFilter, setPoseCategoryFilter] = useState<'all' | 'presets' | 'saved'>('all');
  const [morphTargetKey, setMorphTargetKey] = useState<string>('Fist');
  const [morphAmount, setMorphAmount] = useState<number>(0);
  const morphBaseRef = useRef<State | null>(null);

  // Animation & Export state
  const [exportStem, setExportStem] = useState<string>('pyxl-hand');
  const [animFromKey, setAnimFromKey] = useState<string>('Neutral flat (default)');
  const [animToKey, setAnimToKey] = useState<string>('Fist');
  const [animDuration, setAnimDuration] = useState<number>(1.0);
  const [animFps, setAnimFps] = useState<number>(20);
  const [animProgress, setAnimProgress] = useState<{ current: number; total: number; stage: string } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const previewRafRef = useRef<number | null>(null);
  const originalPoseBeforePreviewRef = useRef<State | null>(null);

  // SVG & interaction refs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const handRef = useRef<SVGGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cachedCTMRef = useRef<DOMMatrix | null>(null);
  const dragRef = useRef<{
    type: 'wrist' | 'finger' | 'ik';
    d?: FingerName;
    k?: number;
  } | null>(null);
  const isViewFrozenRef = useRef<boolean>(false);
  const rafPendingRef = useRef<boolean>(false);
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  // ViewBox state
  const [viewBox, setViewBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: -5,
    y: -9.2,
    w: 10,
    h: 10.5,
  });

  // Load saved poses from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(ALT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSavedPoses(parsed);
      }
    } catch (e) {
      console.warn('Failed to load saved poses:', e);
    }
  }, []);

  // Update theme on body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // History & Undo / Redo state
  const historyRef = useRef<State[]>([defaultState()]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const dragStartStateRef = useRef<State | null>(null);
  const transitionAnimRef = useRef<number | null>(null);
  const historyDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update undo/redo availability flags
  const updateUndoRedoFlags = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Push new state to undo/redo history
  const pushHistory = useCallback((nextState: State) => {
    const current = historyRef.current[historyIndexRef.current];
    if (current && JSON.stringify(cleanPose(current)) === JSON.stringify(cleanPose(nextState))) {
      return;
    }
    const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1);
    trimmed.push({ ...nextState });
    if (trimmed.length > 60) {
      trimmed.shift();
    }
    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
    updateUndoRedoFlags();
  }, [updateUndoRedoFlags]);

  // Debounced push for slider adjustments
  const scheduleHistoryPush = useCallback((s: State) => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
    }
    historyDebounceTimerRef.current = setTimeout(() => {
      pushHistory(s);
    }, 350);
  }, [pushHistory]);

  // Smoothly interpolate to a target state (for Mirror, Undo, Redo, Preset changes)
  const animateToState = useCallback((target: State, durationMs = 320, onDone?: () => void) => {
    if (transitionAnimRef.current) {
      cancelAnimationFrame(transitionAnimRef.current);
      transitionAnimRef.current = null;
    }
    const from = { ...stateRef.current };
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const interp = interpolatePose(from, target, ease);
      setState(interp);

      if (progress < 1) {
        transitionAnimRef.current = requestAnimationFrame(step);
      } else {
        setState(target);
        transitionAnimRef.current = null;
        if (onDone) onDone();
      }
    };

    transitionAnimRef.current = requestAnimationFrame(step);
  }, []);

  // Undo (with smooth interpolation)
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const target = historyRef.current[historyIndexRef.current];
    updateUndoRedoFlags();
    animateToState(target, 320);
    setCopiedNotification('Undo (interpolated)');
    setTimeout(() => setCopiedNotification(null), 1500);
  }, [updateUndoRedoFlags, animateToState]);

  // Redo (with smooth interpolation)
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const target = historyRef.current[historyIndexRef.current];
    updateUndoRedoFlags();
    animateToState(target, 320);
    setCopiedNotification('Redo (interpolated)');
    setTimeout(() => setCopiedNotification(null), 1500);
  }, [updateUndoRedoFlags, animateToState]);

  // Keyboard shortcut listener: Ctrl+Z / Cmd+Z for Undo, Ctrl+Y / Cmd+Shift+Z for Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Clean up animation preview & transitions on unmount
  useEffect(() => {
    return () => {
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current);
      }
      if (transitionAnimRef.current) {
        cancelAnimationFrame(transitionAnimRef.current);
      }
      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
      }
    };
  }, []);

  // Save poses helper
  const persistSavedPoses = useCallback((poses: Record<string, Partial<State>>) => {
    setSavedPoses(poses);
    try {
      const json = JSON.stringify(poses, null, 2);
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(ALT_STORAGE_KEY, json);
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }, []);

  // Recenter SVG viewbox with Fixed Camera logic:
  // "Fixed Camera. Keep current default, but only move camera when we rotate far enough down to where we need to move the camera All non lower Y plane motion should keep static camera."
  const updateViewBox = useCallback(() => {
    if (isViewFrozenRef.current || !handRef.current || !stageRef.current) return;
    try {
      const bb = handRef.current.getBBox();
      if (bb.width <= 0 || bb.height <= 0) return;

      const rect = stageRef.current.getBoundingClientRect();
      const stageW = rect.width || 800;
      const stageH = rect.height || 500;
      const aspect = Math.max(0.2, stageW / stageH);

      // Default static camera frame parameters:
      // In canonical pyxl units, upright hand distal tip is at y = -7.5 to -8.0, wrist hub at y = 0.
      // Default height is 10.5 pyxls, spanning from y = -9.2 to +1.3 (providing standard headroom & margin below wrist)
      const baseH = 10.5;
      const defW = aspect >= 1 ? baseH * aspect : baseH;
      const defH = aspect >= 1 ? baseH : baseH / aspect;
      const defX = -defW / 2;
      const defY = 1.3 - defH;
      const defBottom = 1.3;

      const handBottom = bb.y + bb.height;
      const handTop = bb.y;

      // When all hand motion stays in non-lower Y plane (handBottom <= defBottom),
      // the camera stays COMPLETELY STATIC at the default view!
      if (handBottom <= defBottom) {
        setViewBox({ x: defX, y: defY, w: defW, h: defH });
        return;
      }

      // ONLY when we rotate far enough down into the lower Y plane (handBottom > defBottom)
      // do we move the camera down to accommodate:
      const targetTop = Math.min(defY, handTop - 0.6);
      const targetBottom = handBottom + 0.6;
      const neededH = Math.max(defH, targetBottom - targetTop);
      const targetH = neededH;
      const targetW = aspect >= 1 ? targetH * aspect : targetH;

      // Keep horizontal position centered around 0 unless hand spans outside
      let targetX = -targetW / 2;
      if (bb.x < -targetW / 2 + 0.5 || bb.x + bb.width > targetW / 2 - 0.5) {
        targetX = (bb.x + bb.width / 2) - targetW / 2;
      }

      setViewBox({ x: targetX, y: targetTop, w: targetW, h: targetH });
    } catch (e) {
      // Ignore bbox errors during initialization
    }
  }, []);

  // Recenter when state or build changes (when not dragging)
  useEffect(() => {
    if (!dragRef.current && !isPreviewing) {
      const timer = setTimeout(updateViewBox, 20);
      return () => clearTimeout(timer);
    }
  }, [state.wrist, state.splay, state.tilt, state.build, state.o, state.wscale, state.rot, isPreviewing, updateViewBox]);

  // Pointer coordinate conversion
  const toCanvas = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    if (!cachedCTMRef.current) {
      const ctm = svg.getScreenCTM();
      cachedCTMRef.current = ctm ? ctm.inverse() : null;
    }
    if (!cachedCTMRef.current) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(cachedCTMRef.current);
    return [transformed.x, transformed.y];
  }, []);

  // Pointer event handlers on SVG
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    const ctm = svg.getScreenCTM();
    cachedCTMRef.current = ctm ? ctm.inverse() : null;
    isViewFrozenRef.current = true;

    const target = e.target as SVGElement;
    if (target.dataset.w) {
      dragRef.current = { type: 'wrist' };
    } else if (target.dataset.j !== undefined && target.dataset.d) {
      dragRef.current = {
        type: 'ik',
        d: target.dataset.d as FingerName,
        k: parseInt(target.dataset.j, 10),
      };
    } else {
      const gD = target.closest('[data-d]') as SVGElement | null;
      if (gD && gD.dataset.d) {
        dragRef.current = {
          type: 'finger',
          d: gD.dataset.d as FingerName,
        };
      }
    }

    if (dragRef.current) {
      dragStartStateRef.current = { ...stateRef.current };
      svg.setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (rafPendingRef.current) return;

    rafPendingRef.current = true;
    const clientX = e.clientX;
    const clientY = e.clientY;

    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      const currentDrag = dragRef.current;
      if (!currentDrag) return;

      const [x, y] = toCanvas(clientX, clientY);
      const st = stateRef.current;

      if (currentDrag.type === 'wrist') {
        const nextWrist = Math.round(norm(Math.atan2(x, -y) / R));
        setState(prev => ({ ...prev, wrist: nextWrist }));
      } else if (currentDrag.type === 'finger' && currentDrag.d) {
        const d = currentDrag.d;
        const base = st.wrist + calcA(d, st) - (st.rot[d] || 0);
        const [rLo, rHi] = rRange(d, st.expert);
        const nextRot = Math.round(clamp(norm(Math.atan2(x, -y) / R - base), rLo, rHi));
        setState(prev => ({
          ...prev,
          rot: {
            ...prev.rot,
            [d]: nextRot,
          },
        }));
      } else if (currentDrag.type === 'ik' && currentDrag.d && currentDrag.k !== undefined) {
        const nextState = runIk(currentDrag.d, currentDrag.k, x, y, st);
        setState(nextState);
      }
    });
  }, [toCanvas]);

  const handlePointerUpOrCancel = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    cachedCTMRef.current = null;
    isViewFrozenRef.current = false;
    try {
      if (svgRef.current?.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      // ignore
    }
    if (dragStartStateRef.current) {
      if (JSON.stringify(cleanPose(dragStartStateRef.current)) !== JSON.stringify(cleanPose(stateRef.current))) {
        pushHistory(stateRef.current);
      }
      dragStartStateRef.current = null;
    }
    updateViewBox();
  }, [updateViewBox, pushHistory]);

  // Split bar dragging logic
  const handleSplitPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const splitEl = e.currentTarget;
    splitEl.setPointerCapture(e.pointerId);

    const onPointerMove = (ev: PointerEvent) => {
      const totalH = window.innerHeight;
      const pct = clamp((ev.clientY / totalH) * 100, 20, 85);
      setStageHeightPct(pct);
      setTimeout(updateViewBox, 10);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [updateViewBox]);

  const handleSplitDoubleClick = useCallback(() => {
    setStageHeightPct(66.667);
    setTimeout(updateViewBox, 10);
  }, [updateViewBox]);

  // Apply a pose by key (smoothly interpolated)
  const handleApplyPose = useCallback((k: string) => {
    setSelectedPoseKey(k);
    if (!k || k === 'Neutral flat (default)') {
      const reset = {
        ...defaultState(),
        expert: stateRef.current.expert,
        o: stateRef.current.o,
        wscale: stateRef.current.wscale,
        boxes: stateRef.current.boxes,
        build: stateRef.current.build,
      };
      pushHistory(reset);
      animateToState(reset, 320);
      return;
    }

    // Check presets first
    const preset = PRESET_POSES[k];
    if (preset) {
      const cleaned = cleanPose(preset);
      const merged: State = clampStateToLimits({
        ...defaultState(),
        ...cleaned,
        expert: stateRef.current.expert,
        o: stateRef.current.o,
        wscale: stateRef.current.wscale,
        boxes: stateRef.current.boxes,
        build: stateRef.current.build,
      });
      pushHistory(merged);
      animateToState(merged, 320);
      return;
    }

    // Check saved poses in localStorage
    const saved = savedPoses[k];
    if (saved) {
      const cleaned = cleanPose(saved);
      const merged: State = clampStateToLimits({
        ...defaultState(),
        ...cleaned,
        expert: stateRef.current.expert,
        o: stateRef.current.o,
        wscale: stateRef.current.wscale,
        boxes: stateRef.current.boxes,
        build: stateRef.current.build,
      });
      pushHistory(merged);
      animateToState(merged, 320);
    }
  }, [savedPoses, pushHistory, animateToState]);

  // Save current pose
  const handleSavePose = useCallback(() => {
    const name = poseNameInput.trim();
    if (!name) {
      alert('Please enter a name for the pose.');
      return;
    }
    const cleaned = cleanPose(state);
    const updated = {
      ...savedPoses,
      [name]: cleaned,
    };
    persistSavedPoses(updated);
    setSelectedPoseKey(name);
    setPoseNameInput('');
  }, [poseNameInput, state, savedPoses, persistSavedPoses]);

  // Delete current selected pose
  const handleDeletePose = useCallback(() => {
    if (!selectedPoseKey || PRESET_POSES[selectedPoseKey] || selectedPoseKey === 'Neutral flat (default)') {
      return;
    }
    const updated = { ...savedPoses };
    delete updated[selectedPoseKey];
    persistSavedPoses(updated);
    handleApplyPose('Neutral flat (default)');
  }, [selectedPoseKey, savedPoses, persistSavedPoses, handleApplyPose]);

  // Export JSON
  const handleExportJson = useCallback(() => {
    const cleaned = cleanPose(state);
    const formatted = JSON.stringify(cleaned, null, 2);
    setJsonText(formatted);
  }, [state]);

  // Import JSON
  const handleImportJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const cleaned = cleanPose(parsed);
      setState(prev => {
        const merged: State = {
          ...defaultState(),
          ...cleaned,
          expert: prev.expert,
          o: prev.o,
          wscale: prev.wscale,
          boxes: prev.boxes,
          build: prev.build,
        };
        return clampStateToLimits(merged);
      });
      setCopiedNotification('Pose JSON successfully loaded!');
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e) {
      alert('Invalid JSON pose data. Please verify the format.');
    }
  }, [jsonText]);

  // Reset Pose (smoothly interpolated)
  const handleResetPose = useCallback(() => {
    const reset = {
      ...defaultState(),
      expert: stateRef.current.expert,
      o: stateRef.current.o,
      wscale: stateRef.current.wscale,
      boxes: stateRef.current.boxes,
      build: stateRef.current.build,
    };
    pushHistory(reset);
    animateToState(reset, 320);
    setSelectedPoseKey('Neutral flat (default)');
    setCopiedNotification('Reset to Neutral flat');
    setTimeout(() => setCopiedNotification(null), 1800);
  }, [pushHistory, animateToState]);

  // Mirror left/right with smooth interpolation (user requirement)
  const handleMirror = useCallback(() => {
    const current = stateRef.current;
    const targetFs = {
      index: -current.fs.index,
      ring: -current.fs.ring,
      pinky: -current.fs.pinky,
    };
    const targetRot = { ...current.rot };
    for (const d of FINGER_ORDER) {
      targetRot[d] = -current.rot[d];
    }
    const target: State = {
      ...current,
      wrist: norm(-current.wrist),
      splay: -current.splay,
      thumb: -current.thumb,
      tilt: -current.tilt,
      fs: targetFs,
      rot: targetRot,
    };
    pushHistory(target);
    animateToState(target, 350);
    setCopiedNotification('Mirrored (interpolated)');
    setTimeout(() => setCopiedNotification(null), 1800);
  }, [pushHistory, animateToState]);

  // Standalone HTML Download
  const handleDownloadStandalone = useCallback(() => {
    const html = generateStandaloneHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyxl-hand-v2.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopiedNotification('Downloaded pyxl-hand-v2.html!');
    setTimeout(() => setCopiedNotification(null), 2500);
  }, []);

  // Copy standalone HTML
  const handleCopyStandalone = useCallback(async () => {
    const html = generateStandaloneHtml();
    try {
      await navigator.clipboard.writeText(html);
      setCopiedNotification('Standalone HTML copied to clipboard!');
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e) {
      // Fallback
      setJsonText(html);
    }
  }, []);

  // Quick auto-incrementing Save (+) pose handler
  const handleQuickSavePose = useCallback(() => {
    let name = poseNameInput.trim();
    if (!name || savedPoses[name]) {
      let n = 1;
      while (savedPoses[`Pose ${n}`]) {
        n++;
      }
      name = `Pose ${n}`;
    }
    const cleaned = cleanPose(state);
    const updated = {
      ...savedPoses,
      [name]: cleaned,
    };
    persistSavedPoses(updated);
    setSelectedPoseKey(name);
    setPoseNameInput('');
    setCopiedNotification(`Saved "${name}"`);
    setTimeout(() => setCopiedNotification(null), 2500);
  }, [poseNameInput, savedPoses, state, persistSavedPoses]);

  // Quick Delete (-) pose handler
  const handleQuickDeletePose = useCallback(() => {
    if (!selectedPoseKey || PRESET_POSES[selectedPoseKey] || selectedPoseKey === 'Neutral flat (default)') {
      setCopiedNotification('Cannot delete default or preset poses');
      setTimeout(() => setCopiedNotification(null), 2500);
      return;
    }
    const delName = selectedPoseKey;
    const updated = { ...savedPoses };
    delete updated[delName];
    persistSavedPoses(updated);
    handleApplyPose('Neutral flat (default)');
    setCopiedNotification(`Deleted "${delName}"`);
    setTimeout(() => setCopiedNotification(null), 2500);
  }, [selectedPoseKey, savedPoses, persistSavedPoses, handleApplyPose]);

  // Hand build looping handler (§3)
  const BUILDS_LIST = useMemo<{ id: HandBuild; label: string; badge: string; desc: string }[]>(() => [
    { id: 'standard', label: 'Full Hand (5 digits)', badge: '5F', desc: '5 fingers: Index, Middle, Ring, Pinky, Thumb' },
    { id: 'claw', label: 'Claw (2 digits)', badge: '2F', desc: 'Profile build: 1 finger + thumb' },
    { id: 'trident', label: 'Trident (3 digits)', badge: '3F', desc: '3 fingers: Bird, Ring, Thumb' },
    { id: 'mickey', label: "Mickey's Glove (4 digits)", badge: '4F', desc: 'Cartoon 4 fingers: no pinky' },
  ], []);

  const handleCycleBuild = useCallback(() => {
    const currentIdx = BUILDS_LIST.findIndex(b => b.id === state.build);
    const next = BUILDS_LIST[(currentIdx + 1) % BUILDS_LIST.length];
    setState(prev => ({ ...prev, build: next.id }));
    setCopiedNotification(`Build: ${next.label}`);
    setTimeout(() => setCopiedNotification(null), 2000);
  }, [state.build, BUILDS_LIST]);

  // Resolve State by pose key (preset, saved, or default)
  const getPoseByKey = useCallback((k: string): State => {
    if (!k || k === 'Neutral flat (default)') return defaultState();
    if (PRESET_POSES[k]) {
      return {
        ...defaultState(),
        ...cleanPose(PRESET_POSES[k]),
        expert: state.expert,
        o: state.o,
        wscale: state.wscale,
        boxes: state.boxes,
        build: state.build,
      };
    }
    if (savedPoses[k]) {
      return {
        ...defaultState(),
        ...cleanPose(savedPoses[k]),
        expert: state.expert,
        o: state.o,
        wscale: state.wscale,
        boxes: state.boxes,
        build: state.build,
      };
    }
    return state;
  }, [savedPoses, state]);

  // Macro Curl all joints (+ or -)
  const handleMacroCurl = useCallback((delta: number) => {
    const cur = stateRef.current;
    const nextCj = { ...cur.cj };
    for (const d of FINGER_ORDER) {
      const [cLo, cHi] = cRange(d, cur.expert);
      nextCj[d] = [
        clamp(nextCj[d][0] + delta, cLo, cHi),
        clamp(nextCj[d][1] + delta, cLo, cHi),
        clamp(nextCj[d][2] + delta, cLo, cHi),
      ];
    }
    const target: State = { ...cur, cj: nextCj };
    pushHistory(target);
    animateToState(target, 220);
    setCopiedNotification(delta > 0 ? `Curled fingers (+${delta}°)` : `Extended fingers (${delta}°)`);
    setTimeout(() => setCopiedNotification(null), 1500);
  }, [pushHistory, animateToState]);

  // Macro Splay all fingers
  const handleMacroSplay = useCallback((delta: number) => {
    const cur = stateRef.current;
    const target: State = { ...cur, splay: clamp(cur.splay + delta, -100, 100) };
    pushHistory(target);
    animateToState(target, 220);
    setCopiedNotification(`Splay ${target.splay}%`);
    setTimeout(() => setCopiedNotification(null), 1500);
  }, [pushHistory, animateToState]);

  // Randomize Natural Gesture
  const handleRandomizePose = useCallback(() => {
    const cur = stateRef.current;
    const nextCj = { ...cur.cj };
    const nextRot = { ...cur.rot };
    for (const d of FINGER_ORDER) {
      const [cLo, cHi] = cRange(d, cur.expert);
      const [rLo, rHi] = rRange(d, cur.expert);
      const randBase = Math.floor(Math.random() * (cHi - cLo)) + cLo;
      nextCj[d] = [
        clamp(randBase + Math.floor(Math.random() * 20 - 10), cLo, cHi),
        clamp(randBase + Math.floor(Math.random() * 20 - 10), cLo, cHi),
        clamp(randBase + Math.floor(Math.random() * 20 - 10), cLo, cHi),
      ];
      nextRot[d] = clamp(Math.floor(Math.random() * (rHi - rLo) * 0.5) + rLo * 0.25, rLo, rHi);
    }
    const target: State = {
      ...cur,
      splay: clamp(Math.floor(Math.random() * 60 - 20), -50, 70),
      rot: nextRot,
      cj: nextCj,
    };
    pushHistory(target);
    animateToState(target, 320);
    setCopiedNotification('Randomized Natural Gesture');
    setTimeout(() => setCopiedNotification(null), 1800);
  }, [pushHistory, animateToState]);

  // Morph live scrubbing
  const handleMorphChange = useCallback((val: number) => {
    setMorphAmount(val);
    if (!morphBaseRef.current) {
      morphBaseRef.current = { ...stateRef.current };
    }
    const targetState = getPoseByKey(morphTargetKey);
    const blended = interpolatePose(morphBaseRef.current, targetState, val / 100);
    setState(blended);
  }, [morphTargetKey, getPoseByKey]);

  // Commit morph
  const handleApplyMorph = useCallback(() => {
    pushHistory(stateRef.current);
    morphBaseRef.current = { ...stateRef.current };
    setMorphAmount(0);
    setCopiedNotification(`Applied morph toward ${morphTargetKey}`);
    setTimeout(() => setCopiedNotification(null), 1800);
  }, [pushHistory, morphTargetKey]);

  // Filtered pose keys for Pose Library
  const filteredPoseList = useMemo(() => {
    const term = poseSearchFilter.trim().toLowerCase();
    const presets = Object.keys(PRESET_POSES).filter(k => {
      if (poseCategoryFilter === 'saved') return false;
      if (!term) return true;
      return k.toLowerCase().includes(term);
    });
    const saved = Object.keys(savedPoses).filter(k => {
      if (poseCategoryFilter === 'presets') return false;
      if (!term) return true;
      return k.toLowerCase().includes(term);
    });
    return { presets, saved };
  }, [poseSearchFilter, poseCategoryFilter, savedPoses]);

  // Toggle live transition preview on canvas
  const togglePreview = useCallback(async () => {
    if (isPreviewing) {
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      setIsPreviewing(false);
      isViewFrozenRef.current = false;
      if (originalPoseBeforePreviewRef.current) {
        setState(originalPoseBeforePreviewRef.current);
        originalPoseBeforePreviewRef.current = null;
      }
      setTimeout(updateViewBox, 20);
      return;
    }

    const from = getPoseByKey(animFromKey);
    const to = getPoseByKey(animToKey);
    originalPoseBeforePreviewRef.current = { ...state };
    setIsPreviewing(true);
    isViewFrozenRef.current = true;

    // Stable square viewbox across the transition so there is zero camera jump/jitter
    const seq = await buildSequence(from, to, 12);
    const [vx, vy, vw, vh] = seq.viewBox.split(' ').map(Number);
    setViewBox({ x: vx, y: vy, w: vw, h: vh });

    const durMs = Math.max(300, animDuration * 1000);
    const startT = performance.now();

    const loop = (now: number) => {
      const elapsed = (now - startT) % (durMs * 2);
      const linearT = elapsed < durMs ? elapsed / durMs : 2 - elapsed / durMs;
      const easeT = 0.5 - 0.5 * Math.cos(linearT * Math.PI);
      const pose = interpolatePose(from, to, easeT);
      setState(pose);
      previewRafRef.current = requestAnimationFrame(loop);
    };

    previewRafRef.current = requestAnimationFrame(loop);
  }, [isPreviewing, animFromKey, animToKey, getPoseByKey, state, animDuration, updateViewBox]);

  // Export transparent PNG of current pose
  const handleExportPng = useCallback(async () => {
    try {
      setIsExporting(true);
      setAnimProgress({ current: 1, total: 1, stage: 'Rendering transparent PNG...' });
      const markup = generateHandSvgMarkup(state);
      const measurer = makeMeasurer();
      const b = measurer.measure(markup);
      measurer.destroy();
      const vb = squareViewBox(b);
      const canvas = await canvasFromMarkup(markup, vb, 1024, false);
      const blob = await canvasBlob(canvas, 'image/png');
      const stem = exportStem.trim() || 'pyxl-hand';
      downloadBlob(blob, `${stem}.png`);
      setCopiedNotification(`Exported ${stem}.png!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e: any) {
      alert(`Export PNG failed: ${e?.message || e}`);
    } finally {
      setIsExporting(false);
      setAnimProgress(null);
    }
  }, [state, exportStem]);

  // Export vector SVG of current pose
  const handleExportSvg = useCallback(() => {
    try {
      const markup = generateHandSvgMarkup(state);
      const measurer = makeMeasurer();
      const b = measurer.measure(markup);
      measurer.destroy();
      const vb = squareViewBox(b);
      const svgDoc = buildSvgDocument(markup, vb, 1024);
      const blob = new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' });
      const stem = exportStem.trim() || 'pyxl-hand';
      downloadBlob(blob, `${stem}.svg`);
      setCopiedNotification(`Exported ${stem}.svg!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e: any) {
      alert(`Export SVG failed: ${e?.message || e}`);
    }
  }, [state, exportStem]);

  // Export animated GIF transition
  const handleExportGif = useCallback(async () => {
    try {
      setIsExporting(true);
      const from = getPoseByKey(animFromKey);
      const to = getPoseByKey(animToKey);
      const totalFrames = Math.max(2, Math.round(animDuration * animFps));
      setAnimProgress({ current: 0, total: totalFrames, stage: 'Building transition sequence...' });

      const seq = await buildSequence(from, to, totalFrames, (c, tot) => {
        setAnimProgress({ current: c, total: tot, stage: 'Measuring frames...' });
      });

      const frameChunks: Uint8Array[] = [];
      const size = 512;
      for (let i = 0; i < seq.frames.length; i++) {
        setAnimProgress({ current: i + 1, total: totalFrames, stage: `Rendering GIF frame ${i + 1}/${totalFrames}...` });
        const canvas = await canvasFromMarkup(seq.frames[i].markup, seq.viewBox, size, false);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Cannot get 2D canvas context');
        const imgData = ctx.getImageData(0, 0, size, size);
        const indices = gifIndices(imgData.data);
        const gf = gifFrame(indices, size, size, animFps);
        frameChunks.push(gf);
      }

      setAnimProgress({ current: totalFrames, total: totalFrames, stage: 'Assembling GIF...' });
      const header = gifHeader(size, size);
      const allBytes = concatBytes([...header, ...frameChunks, Uint8Array.from([0x3b])]);
      const blob = new Blob([allBytes as unknown as BlobPart], { type: 'image/gif' });
      const stem = exportStem.trim() || 'pyxl-hand';
      downloadBlob(blob, `${stem}-anim.gif`);
      setCopiedNotification(`Exported ${stem}-anim.gif!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e: any) {
      alert(`GIF Export failed: ${e?.message || e}`);
    } finally {
      setIsExporting(false);
      setAnimProgress(null);
    }
  }, [animFromKey, animToKey, animDuration, animFps, exportStem, getPoseByKey]);

  // Export APNG transition
  const handleExportApng = useCallback(async () => {
    try {
      setIsExporting(true);
      const from = getPoseByKey(animFromKey);
      const to = getPoseByKey(animToKey);
      const totalFrames = Math.max(2, Math.round(animDuration * animFps));
      setAnimProgress({ current: 0, total: totalFrames, stage: 'Building transition sequence...' });

      const seq = await buildSequence(from, to, totalFrames, (c, tot) => {
        setAnimProgress({ current: c, total: tot, stage: 'Measuring frames...' });
      });

      const compressedFrames: Uint8Array[] = [];
      const size = 512;
      for (let i = 0; i < seq.frames.length; i++) {
        setAnimProgress({ current: i + 1, total: totalFrames, stage: `Compressing APNG frame ${i + 1}/${totalFrames}...` });
        const canvas = await canvasFromMarkup(seq.frames[i].markup, seq.viewBox, size, false);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Cannot get 2D canvas context');
        const imgData = ctx.getImageData(0, 0, size, size);
        const compressed = await compressPngPixels(imgData.data, size, size);
        compressedFrames.push(compressed);
      }

      setAnimProgress({ current: totalFrames, total: totalFrames, stage: 'Assembling APNG...' });
      const blob = encodeApng(compressedFrames, size, size, animFps);
      const stem = exportStem.trim() || 'pyxl-hand';
      downloadBlob(blob, `${stem}-anim.png`);
      setCopiedNotification(`Exported ${stem}-anim.png!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e: any) {
      alert(`APNG Export failed: ${e?.message || e}`);
    } finally {
      setIsExporting(false);
      setAnimProgress(null);
    }
  }, [animFromKey, animToKey, animDuration, animFps, exportStem, getPoseByKey]);

  // Export ZIP frames + animation.json manifest
  const handleExportZip = useCallback(async () => {
    try {
      setIsExporting(true);
      const from = getPoseByKey(animFromKey);
      const to = getPoseByKey(animToKey);
      const totalFrames = Math.max(2, Math.round(animDuration * animFps));
      setAnimProgress({ current: 0, total: totalFrames, stage: 'Building transition sequence...' });

      const seq = await buildSequence(from, to, totalFrames, (c, tot) => {
        setAnimProgress({ current: c, total: tot, stage: 'Measuring frames...' });
      });

      const zipEntries: ZipFileEntry[] = [];
      const size = 512;
      for (let i = 0; i < seq.frames.length; i++) {
        setAnimProgress({ current: i + 1, total: totalFrames, stage: `Rendering PNG frame ${i + 1}/${totalFrames}...` });
        const canvas = await canvasFromMarkup(seq.frames[i].markup, seq.viewBox, size, false);
        const blob = await canvasBlob(canvas, 'image/png');
        const buf = new Uint8Array(await blob.arrayBuffer());
        const fileName = `frame_${String(i).padStart(3, '0')}.png`;
        zipEntries.push({ name: fileName, data: buf });
      }

      const manifest = {
        app: 'Pyxl Hand Rig v2',
        spec: '2026-10-22',
        from: animFromKey,
        to: animToKey,
        durationSeconds: animDuration,
        fps: animFps,
        frameCount: totalFrames,
        viewBox: seq.viewBox,
        frameNames: zipEntries.map(e => e.name),
      };
      const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      zipEntries.push({ name: 'animation.json', data: manifestData });

      setAnimProgress({ current: totalFrames, total: totalFrames, stage: 'Compressing ZIP archive...' });
      const zipBlob = zipStore(zipEntries);
      const stem = exportStem.trim() || 'pyxl-hand';
      downloadBlob(zipBlob, `${stem}-frames.zip`);
      setCopiedNotification(`Exported ${stem}-frames.zip!`);
      setTimeout(() => setCopiedNotification(null), 2500);
    } catch (e: any) {
      alert(`ZIP Export failed: ${e?.message || e}`);
    } finally {
      setIsExporting(false);
      setAnimProgress(null);
    }
  }, [animFromKey, animToKey, animDuration, animFps, exportStem, getPoseByKey]);

  // Active fingers based on hand build
  const activeFingers = useMemo(() => {
    return getActiveFingers(state.build);
  }, [state.build]);

  // Render chain recursively for a finger d
  const renderChain = useCallback(
    (d: FingerName, i: number, ang: number[]): React.ReactNode => {
      const bones = BONES[d];
      const n = bones.length;
      const knOvl = state.o > 0 ? KN[d] : 0;
      const w = wid(d, state.wscale);
      const len = bones[i];
      const a = i === 1 ? -knOvl / 2 : 0;
      const J = i === 0 ? knOvl : 0;
      const top = -(a + len);
      const bot = -a;
      const sr = (d === 'thumb' ? 0.125 : 0.22) * (SUM[d] / 8);
      const jr = i === 0 ? KN[d] / 2 : sr;
      const shaftK = Math.min(i + 1, n - 2);

      // Bounding box for this bone segment (middle finger: 4:1 metacarpal, 2:1 proximal, 1:1 middle, 1:1 distal)
      const box = getBoneBox(d, i);
      const boxW = box.boxW;

      let boneShape: React.ReactNode = null;
      if (i === n - 1) {
        // Distal tip rounded cap:
        // Fits inside the invisible box of length `len` with 12.5% empty space on each lateral side
        const rCap = w * 0.45;
        const xL = -w / 2;
        const xR = w / 2;
        const dPath = `M ${xL} ${bot} L ${xL} ${top + rCap} A ${rCap} ${rCap} 0 0 1 ${xL + rCap} ${top} L ${xR - rCap} ${top} A ${rCap} ${rCap} 0 0 1 ${xR} ${top + rCap} L ${xR} ${bot} Z`;
        boneShape = <path className="bone" d={dPath} />;
      } else {
        boneShape = (
          <rect
            className="bone"
            x={-w / 2}
            y={top}
            width={w}
            height={len}
            rx={0.04}
          />
        );
      }

      return (
        <React.Fragment key={i}>
          {/* Bone Bounding Box guide (when state.boxes is on: 4:1, 2:1, 1:1, 1:1 with 12.5% margins) */}
          {state.boxes && (
            <g className="bone-box-guide">
              <rect
                className="box"
                x={-boxW / 2}
                y={top}
                width={boxW}
                height={len}
                strokeDasharray="0.06, 0.06"
              />
              {/* For distal fingertip, show the 12.5% lateral margin guides */}
              {i === n - 1 && (
                <>
                  <line
                    className="box"
                    x1={-boxW / 2 + box.emptyMargin}
                    y1={top}
                    x2={-boxW / 2 + box.emptyMargin}
                    y2={bot}
                    strokeOpacity={0.45}
                    strokeDasharray="0.03, 0.03"
                  />
                  <line
                    className="box"
                    x1={boxW / 2 - box.emptyMargin}
                    y1={top}
                    x2={boxW / 2 - box.emptyMargin}
                    y2={bot}
                    strokeOpacity={0.45}
                    strokeDasharray="0.03, 0.03"
                  />
                </>
              )}
            </g>
          )}

          {/* Seam buffer outline */}
          {i > 0 && (
            <rect
              className="buff"
              x={-w / 2}
              y={-sr}
              width={w}
              height={sr * 2}
              rx={0.03}
            />
          )}

          {/* Bone body */}
          {boneShape}

          {/* Shaft hit rect (bone-drag fix from §9.1) */}
          <rect
            className="hit"
            x={-w / 2 - 0.25}
            y={top - 0.25}
            width={w + 0.5}
            height={len + 0.5}
            data-d={d}
            data-j={shaftK}
          />

          {/* Recursive child bone with joint circles */}
          {i + 1 < n && (
            <g
              transform={`translate(0, ${top + J / 2}) rotate(${ang[i] || 0})`}
            >
              {renderChain(d, i + 1, ang)}

              {/* Joint: Child joint (10 subpyxl purple circle) & Parent joint (6x6 green circle getting yellow toward center) */}
              <circle className="child-joint" cx={0} cy={0} r={0.05} />
              <circle className="parent-joint" cx={0} cy={0} r={0.03} fill="url(#parentJointGrad)" />
              <circle
                className="hit"
                cx={0}
                cy={0}
                r={Math.max(jr, 0.35)}
                data-d={d}
                data-j={i}
              />
            </g>
          )}
        </React.Fragment>
      );
    },
    [state.o, state.wscale, state.boxes]
  );

  // Clean, uncluttered 1-pyxl unit grid generator against light gray backdrop
  const renderGrid = useMemo(() => {
    const range = 14;
    const lines: React.ReactNode[] = [];
    for (let x = -range; x <= range; x++) {
      lines.push(
        <line
          key={`vx_${x}`}
          className={x === 0 ? 'axis' : 'g-unit'}
          x1={x}
          y1={-range}
          x2={x}
          y2={range}
        />
      );
    }
    for (let y = -range; y <= range; y++) {
      lines.push(
        <line
          key={`hy_${y}`}
          className={y === 0 ? 'axis' : 'g-unit'}
          x1={-range}
          y1={y}
          x2={range}
          y2={y}
        />
      );
    }
    return lines;
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-[var(--bg)] text-[var(--fg)]">
      {/* Top Utility Header Bar */}
      <header className="h-12 border-b border-[var(--border)] px-4 flex items-center justify-between bg-[var(--panel)] shrink-0 z-30 relative">
        <div className="flex items-center gap-3 z-10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-400/40">
              PY
            </div>
            <h1 className="font-semibold text-sm tracking-wide text-[var(--fg)]">
              Pyxl Hand Rig <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-subtle)] text-[var(--accent)] font-mono">v2</span>
            </h1>
          </div>

          <div className="hidden xl:flex items-center text-xs text-[var(--fg-muted)] border-l border-[var(--border)] pl-3 gap-2">
            <span>Spec: 2026-10-22</span>
            <span>•</span>
            <span>1 pyxl = 100px</span>
          </div>
        </div>

        {/* Centered Top Controls Menu Bar */}
        <div className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2 z-10">
          {/* Hand Build Presets (§3) */}
          <div className="flex items-center bg-[var(--bg)] border border-[var(--border)] rounded p-0.5 text-xs">
            <span className="px-2 text-[var(--fg-muted)] text-[11px] hidden lg:inline">Build:</span>
            {(['standard', 'claw', 'trident', 'mickey'] as HandBuild[]).map(b => (
              <button
                key={b}
                onClick={() => setState(prev => ({ ...prev, build: b }))}
                className={`px-2 py-0.5 rounded text-xs capitalize transition-all ${
                  state.build === b
                    ? 'bg-[var(--accent)] text-white font-medium shadow-sm'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
                title={`Switch to ${b} hand build model`}
              >
                {b === 'mickey' ? "Mickey's" : b}
              </button>
            ))}
          </div>

          {/* Undo & Redo (Interpolated) in header */}
          <div className="flex items-center gap-1 border-r border-[var(--border)] pr-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Undo (Ctrl+Z) — Interpolates to previous pose"
            >
              <Undo2 className="w-3.5 h-3.5 text-purple-400" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Redo (Ctrl+Y / Cmd+Shift+Z) — Interpolates to next pose"
            >
              <Redo2 className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>

          {/* Download & Copy Standalone Pure HTML Button */}
          <button
            onClick={handleDownloadStandalone}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] hover:text-[var(--accent)] transition-all shadow-sm"
            title="Download pure single-file HTML (No server, no dependencies, self-contained)"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden lg:inline">Single-File HTML</span>
          </button>
        </div>

        {/* Right Header Utilities (Help & Theme) */}
        <div className="flex items-center gap-1.5 z-10 ml-auto md:ml-0">
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            title="Rig Reference & Spec Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            className="p-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            title="Toggle Dark / Light Mode"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#adff2f]" /> : <Moon className="w-4 h-4 text-purple-400" />}
          </button>
        </div>
      </header>

      {/* STAGE (#stage) */}
      <div
        id="stage"
        ref={stageRef}
        style={{ height: `${stageHeightPct}%` }}
        className="w-full relative overflow-hidden bg-[var(--bg-stage)] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
      >
        {/* Floating Canvas Badges (Repositioned to bottom-left to avoid dock overlap) */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-none text-[11px] font-mono text-[var(--fg-muted)] bg-[var(--panel)]/80 backdrop-blur-md px-2.5 py-1.5 rounded border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#adff2f] shadow-[0_0_8px_#adff2f] animate-pulse"></span>
            <span>Drag bone shaft / joints (IK) or base / wrist hub</span>
          </div>
          <div className="text-[10px] text-[var(--fg-muted)]/75">
            Wrist: {state.wrist}° | Splay: {state.splay}% | Tilt: {state.tilt}°
          </div>
        </div>

        {/* Floating Notification */}
        {copiedNotification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-full shadow-xl animate-bounce">
            <Check className="w-3.5 h-3.5" />
            <span>{copiedNotification}</span>
          </div>
        )}

        {/* Floating Vertical Toolbar (Left Pose Controls Dock) */}
        <div className="absolute top-3 left-3 z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-lg bg-[var(--panel)]/90 backdrop-blur-md border border-[var(--border)] shadow-xl">
          {/* 1. Pose Library Flyout Button */}
          <button
            onClick={() => {
              setActiveLeftPanel(prev => (prev === 'poses' ? null : 'poses'));
              setActiveRightPanel(null);
            }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              activeLeftPanel === 'poses'
                ? 'bg-purple-600 text-white border border-purple-400 shadow-md ring-2 ring-purple-500/30'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10'
            }`}
            title="Pose Library & Saved Presets (Floating Menu)"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* 2. Pose Morph & Blend Flyout Button */}
          <button
            onClick={() => {
              setActiveLeftPanel(prev => (prev === 'morph' ? null : 'morph'));
              setActiveRightPanel(null);
            }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              activeLeftPanel === 'morph'
                ? 'bg-[#adff2f] text-black border border-[#adff2f] shadow-md ring-2 ring-[#adff2f]/30'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[#adff2f] hover:bg-[#adff2f]/10'
            }`}
            title="Live Pose Morph & Blend (Floating Menu)"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <div className="w-5 h-px bg-[var(--border)] my-0.5"></div>

          {/* Quick Direct Pose Preset Buttons (1-click interpolated change) */}
          <button
            onClick={() => handleApplyPose('Neutral flat (default)')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Neutral flat (default)'
                ? 'bg-purple-600/30 border border-purple-400 text-purple-200 ring-1 ring-purple-400/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
            }`}
            title="Neutral Flat Hand (Default Open)"
          >
            <Hand className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Relaxed Natural')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Relaxed Natural'
                ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] ring-1 ring-[#adff2f]/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
            }`}
            title="Relaxed Natural Pose"
          >
            <Feather className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Fist')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Fist'
                ? 'bg-purple-600/30 border border-purple-400 text-purple-200 ring-1 ring-purple-400/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
            }`}
            title="Fist Pose"
          >
            <CircleDot className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Pointing')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Pointing'
                ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] ring-1 ring-[#adff2f]/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
            }`}
            title="Pointing Pose"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Peace / Victory')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Peace / Victory'
                ? 'bg-purple-600/30 border border-purple-400 text-purple-200 ring-1 ring-purple-400/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
            }`}
            title="Peace / Victory Pose"
          >
            <Scissors className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Thumbs Up')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Thumbs Up'
                ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] ring-1 ring-[#adff2f]/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
            }`}
            title="Thumbs Up Pose"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Rock / Horns')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Rock / Horns'
                ? 'bg-purple-600/30 border border-purple-400 text-purple-200 ring-1 ring-purple-400/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
            }`}
            title="Rock / Horns Pose"
          >
            <Flame className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleApplyPose('Pinch / Grasp')}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              selectedPoseKey === 'Pinch / Grasp'
                ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] ring-1 ring-[#adff2f]/50'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
            }`}
            title="Pinch / Grasp Pose"
          >
            <Minimize2 className="w-4 h-4" />
          </button>

          <div className="w-5 h-px bg-[var(--border)] my-0.5"></div>

          {/* Quick Macro Modifier: Curl All Fingers (+15°) */}
          <button
            onClick={() => handleMacroCurl(15)}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10 transition-all shadow-xs"
            title="Curl All Fingers (+15° smoothly)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Quick Macro Modifier: Open All Fingers (-15°) */}
          <button
            onClick={() => handleMacroCurl(-15)}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10 transition-all shadow-xs"
            title="Extend / Open All Fingers (-15° smoothly)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Quick Macro Modifier: Randomize gesture */}
          <button
            onClick={handleRandomizePose}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[#adff2f] hover:bg-[#adff2f]/10 transition-all shadow-xs"
            title="Randomize Natural Hand Pose / Gesture"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Floating Flyout Menu (Rendered to the right of Left Toolbar) */}
        {activeLeftPanel && (
          <div className="absolute top-3 left-16 z-30 w-80 sm:w-96 max-h-[calc(100%-24px)] overflow-y-auto bg-[var(--panel)]/95 backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl p-4 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <div className="flex items-center gap-2">
                {activeLeftPanel === 'poses' && <BookOpen className="w-4 h-4 text-purple-400" />}
                {activeLeftPanel === 'morph' && <Sliders className="w-4 h-4 text-[#adff2f]" />}
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--fg)]">
                  {activeLeftPanel === 'poses' && 'Pose Library & Presets'}
                  {activeLeftPanel === 'morph' && 'Live Pose Morph & Blend'}
                </h2>
              </div>
              <button
                onClick={() => setActiveLeftPanel(null)}
                className="p-1 rounded-md hover:bg-[var(--bg)] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
                title="Close floating menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* LEFT PANEL 1: Pose Library & Presets */}
            {activeLeftPanel === 'poses' && (
              <div className="flex flex-col gap-3 text-xs">
                {/* Search Bar & Category Filter Chips */}
                <div className="flex flex-col gap-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 text-[var(--fg-muted)]" />
                    <input
                      type="text"
                      placeholder="Search poses..."
                      value={poseSearchFilter}
                      onChange={e => setPoseSearchFilter(e.target.value)}
                      className="w-full bg-[var(--bg)] text-[var(--fg)] pl-8 pr-2 py-1.5 text-xs rounded border border-[var(--border)] focus:border-purple-400 outline-none"
                    />
                    {poseSearchFilter && (
                      <button
                        onClick={() => setPoseSearchFilter('')}
                        className="absolute right-2 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(['all', 'presets', 'saved'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setPoseCategoryFilter(cat)}
                        className={`px-2 py-0.5 rounded text-[11px] capitalize transition-all ${
                          poseCategoryFilter === cat
                            ? 'bg-purple-600 text-white font-medium shadow-xs'
                            : 'bg-[var(--bg)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]'
                        }`}
                      >
                        {cat === 'all' ? 'All Poses' : cat === 'presets' ? 'Canonical' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid of Poses */}
                <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto p-1.5 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
                  {/* Presets */}
                  {filteredPoseList.presets.map(k => {
                    const isSelected = selectedPoseKey === k;
                    return (
                      <button
                        key={k}
                        onClick={() => handleApplyPose(k)}
                        className={`flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-purple-600/30 border border-purple-400 text-purple-200 font-semibold shadow-xs'
                            : 'bg-[var(--panel)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
                        }`}
                        title={`Interpolate to pose: ${k}`}
                      >
                        <span className="truncate">{k}</span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#adff2f] shrink-0 ml-1"></span>}
                      </button>
                    );
                  })}

                  {/* Saved User Poses */}
                  {filteredPoseList.saved.map(k => {
                    const isSelected = selectedPoseKey === k;
                    return (
                      <button
                        key={k}
                        onClick={() => handleApplyPose(k)}
                        className={`flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] font-semibold shadow-xs'
                            : 'bg-[var(--panel)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
                        }`}
                        title={`User saved pose: ${k}`}
                      >
                        <span className="truncate flex items-center gap-1">
                          <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">user</span>
                          {k}
                        </span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#adff2f] shrink-0 ml-1"></span>}
                      </button>
                    );
                  })}

                  {filteredPoseList.presets.length === 0 && filteredPoseList.saved.length === 0 && (
                    <div className="col-span-2 py-4 text-center text-[var(--fg-muted)] text-[11px]">
                      No matching poses found
                    </div>
                  )}
                </div>

                {/* Save Current Pose Field */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
                  <input
                    type="text"
                    placeholder="Pose name (or empty for auto #)..."
                    value={poseNameInput}
                    onChange={e => setPoseNameInput(e.target.value)}
                    className="flex-1 bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-purple-400 outline-none"
                  />
                  <button
                    onClick={handleSavePose}
                    className="px-2.5 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 font-medium shadow-xs"
                    title="Save current pose"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleDeletePose}
                    disabled={!selectedPoseKey || !!PRESET_POSES[selectedPoseKey] || selectedPoseKey === 'Neutral flat (default)'}
                    className="px-2 py-1 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Delete selected custom pose"
                  >
                    Delete
                  </button>
                </div>

                {/* JSON Pose Import/Export Accordion */}
                <details className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 pt-1 text-xs">
                  <summary className="font-semibold text-[11px] text-[var(--fg-muted)] cursor-pointer select-none">
                    JSON Pose Data (Import / Export)
                  </summary>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleExportJson}
                        className="flex-1 px-2 py-1 text-xs rounded bg-[var(--panel)] border border-[var(--border)] hover:border-purple-400"
                      >
                        Export JSON
                      </button>
                      <button
                        onClick={handleImportJson}
                        className="flex-1 px-2 py-1 text-xs rounded bg-[var(--panel)] border border-[var(--border)] hover:border-purple-400"
                      >
                        Import JSON
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Paste JSON pose or click Export JSON..."
                      value={jsonText}
                      onChange={e => setJsonText(e.target.value)}
                      className="w-full bg-[var(--panel)] text-[var(--fg)] border border-[var(--border)] rounded p-1.5 text-[10px] font-mono focus:border-purple-400 outline-none"
                    />
                  </div>
                </details>
              </div>
            )}

            {/* LEFT PANEL 2: Live Pose Morph & Blend */}
            {activeLeftPanel === 'morph' && (
              <div className="flex flex-col gap-3 text-xs">
                {/* Target Pose Selector */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[var(--fg-muted)] font-medium">Target Morph Pose:</label>
                  <select
                    value={morphTargetKey}
                    onChange={e => {
                      setMorphTargetKey(e.target.value);
                      setMorphAmount(0);
                      morphBaseRef.current = { ...stateRef.current };
                    }}
                    className="bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1.5 text-xs focus:border-[#adff2f] outline-none"
                  >
                    <optgroup label="Presets">
                      {Object.keys(PRESET_POSES).map(k => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </optgroup>
                    {Object.keys(savedPoses).length > 0 && (
                      <optgroup label="Custom Poses">
                        {Object.keys(savedPoses).map(k => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Morph Scrub Slider (0% to 100%) */}
                <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#adff2f]">Live Morph Amount</span>
                    <span className="font-mono text-[var(--fg)] font-bold">{morphAmount}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={morphAmount}
                    onChange={e => handleMorphChange(Number(e.target.value))}
                    className="w-full accent-[#adff2f] cursor-pointer h-2"
                  />
                  <div className="flex items-center justify-between text-[10px] text-[var(--fg-muted)]">
                    <span>Current Hand (0%)</span>
                    <span>Target ({morphTargetKey})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleApplyMorph}
                    className="flex-1 py-1.5 rounded bg-[#adff2f] text-black font-semibold text-xs hover:bg-[#bcf94a] transition-all shadow-xs"
                  >
                    Commit Morph
                  </button>
                  <button
                    onClick={handleResetPose}
                    className="px-3 py-1.5 rounded border border-[var(--border)] hover:border-purple-400 text-[var(--fg-muted)] hover:text-[var(--fg)] text-xs"
                    title="Reset to Neutral Flat"
                  >
                    Reset
                  </button>
                </div>

                {/* Master Sliders */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-[11px] font-semibold text-purple-400">Master Sliders</span>
                  <SliderRow
                    label="All Fingers Curl"
                    unit="°"
                    min={-20}
                    max={90}
                    value={Math.round(
                      (state.cj.index[0] + state.cj.middle[0] + state.cj.ring[0] + state.cj.pinky[0]) / 4
                    )}
                    onChange={v => {
                      const nextCj = { ...state.cj };
                      for (const d of FINGER_ORDER) {
                        const [cLo, cHi] = cRange(d, state.expert);
                        const cVal = clamp(v, cLo, cHi);
                        nextCj[d] = [cVal, cVal, cVal];
                      }
                      setState(prev => ({ ...prev, cj: nextCj }));
                    }}
                  />
                  <SliderRow
                    label="Hand Splay"
                    unit="%"
                    min={-100}
                    max={100}
                    value={state.splay}
                    onChange={v => setState(prev => ({ ...prev, splay: v }))}
                  />
                  <SliderRow
                    label="Wrist Angle"
                    unit="°"
                    min={-180}
                    max={180}
                    value={state.wrist}
                    onChange={v => setState(prev => ({ ...prev, wrist: v }))}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating Vertical Toolbar (Right Grid Model) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-lg bg-[var(--panel)]/90 backdrop-blur-md border border-[var(--border)] shadow-xl">
          {/* Looping Hand Build Button */}
          {(() => {
            const currentBuild = BUILDS_LIST.find(b => b.id === state.build) || BUILDS_LIST[0];
            return (
              <button
                onClick={handleCycleBuild}
                className="w-9 h-9 rounded-md flex flex-col items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] hover:text-[var(--accent)] transition-all font-mono group relative shadow-xs"
                title={`Build: ${currentBuild.label} (${currentBuild.desc}) — Click to loop next build`}
              >
                <span className="text-[11px] font-bold text-purple-400 group-hover:text-[#adff2f]">
                  {currentBuild.badge}
                </span>
                <span className="text-[8px] text-[var(--fg-muted)] leading-none -mt-0.5 capitalize">
                  {state.build === 'mickey' ? 'Mickey' : state.build}
                </span>
              </button>
            );
          })()}

          <div className="w-5 h-px bg-[var(--border)] my-0.5"></div>

          {/* Right Grid Menus: Clicking between them exits the previous ones */}
          {/* 1. Pose Library & Hand Rig Menu */}
          <button
            onClick={() => {
              setActiveRightPanel(prev => prev === 'poses' ? null : 'poses');
              setActiveLeftPanel(null);
            }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              activeRightPanel === 'poses'
                ? 'bg-purple-600 text-white border border-purple-400 shadow-md ring-2 ring-purple-500/30'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10'
            }`}
            title="Pose Library & Hand Settings (Floating Menu)"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* 2. Save Pose Image Menu */}
          <button
            onClick={() => {
              setActiveRightPanel(prev => prev === 'export-image' ? null : 'export-image');
              setActiveLeftPanel(null);
            }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              activeRightPanel === 'export-image'
                ? 'bg-[#adff2f] text-black border border-[#adff2f] shadow-md ring-2 ring-[#adff2f]/30'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[#adff2f] hover:bg-[#adff2f]/10'
            }`}
            title="Save Pose Image PNG / SVG (Floating Menu)"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          {/* 3. Pose-to-Pose Animation Menu */}
          <button
            onClick={() => {
              setActiveRightPanel(prev => prev === 'export-anim' ? null : 'export-anim');
              setActiveLeftPanel(null);
            }}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-all shadow-xs ${
              activeRightPanel === 'export-anim'
                ? 'bg-blue-600 text-white border border-blue-400 shadow-md ring-2 ring-blue-500/30'
                : 'bg-[var(--bg)] border border-[var(--border)] hover:border-blue-400 text-blue-400 hover:bg-blue-500/10'
            }`}
            title="Pose-to-Pose Animation GIF / APNG / ZIP (Floating Menu)"
          >
            <Film className="w-4 h-4" />
          </button>

          <div className="w-5 h-px bg-[var(--border)] my-0.5"></div>

          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xs"
            title="Undo (Ctrl+Z) — Interpolates to previous pose"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo Button */}
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xs"
            title="Redo (Ctrl+Y / Cmd+Shift+Z) — Interpolates to next pose"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Mirror Button (Interpolated) */}
          <button
            onClick={handleMirror}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[#adff2f] hover:bg-[#adff2f]/10 transition-all shadow-xs"
            title="Mirror Hand (Smoothly interpolates to mirror pose)"
          >
            <FlipHorizontal2 className="w-4 h-4" />
          </button>

          {/* Reset Pose Button */}
          <button
            onClick={handleResetPose}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-purple-400 hover:bg-purple-500/10 transition-all shadow-xs"
            title="Reset Pose to Neutral Flat (Interpolated)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-5 h-px bg-[var(--border)] my-0.5"></div>

          {/* Quick Save (+) Button (Auto-incrementing) */}
          <button
            onClick={handleQuickSavePose}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[#adff2f] hover:bg-[#adff2f]/10 transition-all shadow-xs"
            title="Quick Save (+) Auto-creates new numbered pose"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Quick Delete (-) Button */}
          <button
            onClick={handleQuickDeletePose}
            disabled={!selectedPoseKey || !!PRESET_POSES[selectedPoseKey] || selectedPoseKey === 'Neutral flat (default)'}
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] hover:border-red-400 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xs"
            title="Delete Selected Saved Pose"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Floating Flyout Menu (Rendered directly next to right toolbar) */}
        {activeRightPanel && (
          <div className="absolute top-3 right-16 z-30 w-80 sm:w-96 max-h-[calc(100%-24px)] overflow-y-auto bg-[var(--panel)]/95 backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl p-4 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <div className="flex items-center gap-2">
                {activeRightPanel === 'poses' && <Layers className="w-4 h-4 text-purple-400" />}
                {activeRightPanel === 'export-image' && <ImageIcon className="w-4 h-4 text-[#adff2f]" />}
                {activeRightPanel === 'export-anim' && <Film className="w-4 h-4 text-blue-400" />}
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--fg)]">
                  {activeRightPanel === 'poses' && 'Pose Library & Hand Rig'}
                  {activeRightPanel === 'export-image' && 'Save Pose Image'}
                  {activeRightPanel === 'export-anim' && 'Pose-to-Pose Animation'}
                </h2>
              </div>
              <button
                onClick={() => setActiveRightPanel(null)}
                className="p-1 rounded-md hover:bg-[var(--bg)] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
                title="Close floating menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* PANEL CONTENT 1: Pose Library & Hand Rig */}
            {activeRightPanel === 'poses' && (
              <div className="flex flex-col gap-3 text-xs">
                {/* Visual Pose Library Grid */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1">
                      <Bookmark className="w-3 h-3 text-[#adff2f]" />
                      Pose Library ({Object.keys(PRESET_POSES).length + Object.keys(savedPoses).length})
                    </span>
                    <span className="text-[10px] text-[var(--fg-muted)]">Click to interpolate</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1.5 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
                    {/* Canonical Presets */}
                    {Object.keys(PRESET_POSES).map(k => {
                      const isSelected = selectedPoseKey === k;
                      return (
                        <button
                          key={k}
                          onClick={() => handleApplyPose(k)}
                          className={`flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-purple-600/30 border border-purple-400 text-purple-200 font-semibold shadow-xs'
                              : 'bg-[var(--panel)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-300'
                          }`}
                          title={`Interpolate to pose: ${k}`}
                        >
                          <span className="truncate">{k}</span>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#adff2f] shrink-0 ml-1"></span>}
                        </button>
                      );
                    })}

                    {/* User Saved Poses */}
                    {Object.keys(savedPoses).map(k => {
                      const isSelected = selectedPoseKey === k;
                      return (
                        <button
                          key={k}
                          onClick={() => handleApplyPose(k)}
                          className={`flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-[#adff2f]/20 border border-[#adff2f] text-[#adff2f] font-semibold shadow-xs'
                              : 'bg-[var(--panel)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
                          }`}
                          title={`User saved pose: ${k}`}
                        >
                          <span className="truncate flex items-center gap-1">
                            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">user</span>
                            {k}
                          </span>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#adff2f] shrink-0 ml-1"></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save Current Pose Field */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
                  <input
                    type="text"
                    placeholder="Pose name (or leave empty for auto #)..."
                    value={poseNameInput}
                    onChange={e => setPoseNameInput(e.target.value)}
                    className="flex-1 bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--accent)] outline-none"
                  />
                  <button
                    onClick={handleSavePose}
                    className="px-2.5 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] font-medium shadow-xs"
                    title="Save current pose"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleDeletePose}
                    disabled={!selectedPoseKey || !!PRESET_POSES[selectedPoseKey] || selectedPoseKey === 'Neutral flat (default)'}
                    className="px-2 py-1 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Delete selected custom pose"
                  >
                    Delete
                  </button>
                </div>

                {/* Global Hand Rig Sliders */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-[11px] font-semibold text-[var(--accent)]">Hand Angles & Splay</span>
                  <SliderRow
                    label="Wrist Angle"
                    unit="°"
                    min={-180}
                    max={180}
                    value={state.wrist}
                    onChange={v => setState(prev => ({ ...prev, wrist: v }))}
                  />
                  <SliderRow
                    label="Hand Splay"
                    unit="%"
                    min={-100}
                    max={100}
                    value={state.splay}
                    onChange={v => setState(prev => ({ ...prev, splay: v }))}
                  />
                  <SliderRow
                    label="Bird Tilt"
                    unit="°"
                    min={-30}
                    max={30}
                    value={state.tilt}
                    onChange={v => setState(prev => ({ ...prev, tilt: v }))}
                  />
                </div>

                {/* Rig Toggles */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]">
                  <label className="flex items-center gap-2 cursor-pointer text-[var(--fg)]">
                    <input
                      type="checkbox"
                      checked={state.expert}
                      onChange={e => setState(prev => ({ ...prev, expert: e.target.checked }))}
                      className="accent-[var(--accent)]"
                    />
                    <span>Expert Mode</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">(unconstrained ±90°)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-[var(--fg)]">
                    <input
                      type="checkbox"
                      checked={state.o > 0}
                      onChange={e => setState(prev => ({ ...prev, o: e.target.checked ? 0.5 : 0 }))}
                      className="accent-[var(--accent)]"
                    />
                    <span>Knuckle Overlap</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">({state.o > 0 ? '0.5' : '0 end-to-end'})</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-[var(--fg)]">
                    <input
                      type="checkbox"
                      checked={state.wscale}
                      onChange={e => setState(prev => ({ ...prev, wscale: e.target.checked }))}
                      className="accent-[var(--accent)]"
                    />
                    <span>Scale Widths</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">(by SUM-KN/7)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-[var(--fg)]">
                    <input
                      type="checkbox"
                      checked={state.boxes}
                      onChange={e => setState(prev => ({ ...prev, boxes: e.target.checked }))}
                      className="accent-[var(--accent)]"
                    />
                    <span>Show Palm Boxes</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">(4×4 guide)</span>
                  </label>
                </div>

                {/* JSON Import / Export Accordion */}
                <details className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 pt-1 text-xs">
                  <summary className="font-semibold text-[11px] text-[var(--fg-muted)] cursor-pointer select-none">
                    JSON Pose Data (Import / Export)
                  </summary>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleExportJson}
                        className="flex-1 px-2 py-1 text-xs rounded bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--accent)]"
                      >
                        Export JSON
                      </button>
                      <button
                        onClick={handleImportJson}
                        className="flex-1 px-2 py-1 text-xs rounded bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--accent)]"
                      >
                        Import JSON
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      placeholder="Paste JSON pose or click Export JSON..."
                      value={jsonText}
                      onChange={e => setJsonText(e.target.value)}
                      className="w-full bg-[var(--panel)] text-[var(--fg)] border border-[var(--border)] rounded p-1.5 text-[10px] font-mono focus:border-[var(--accent)] outline-none"
                    />
                  </div>
                </details>
              </div>
            )}

            {/* PANEL CONTENT 2: Save Pose Image */}
            {activeRightPanel === 'export-image' && (
              <div className="flex flex-col gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-[var(--fg-muted)] font-medium">Export Filename Stem:</label>
                  <input
                    type="text"
                    value={exportStem}
                    onChange={e => setExportStem(e.target.value)}
                    placeholder="Filename stem (e.g. pyxl-hand)..."
                    className="bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--accent)] outline-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleExportPng}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f] text-xs font-semibold transition-all shadow-xs disabled:opacity-40"
                    title="Download crisp transparent PNG image (1024×1024)"
                  >
                    <Download className="w-3.5 h-3.5 text-[#adff2f]" />
                    Save PNG
                  </button>
                  <button
                    onClick={handleExportSvg}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[var(--bg)] border border-[var(--border)] hover:border-purple-400 text-[var(--fg)] hover:text-purple-400 text-xs font-semibold transition-all shadow-xs disabled:opacity-40"
                    title="Download vector SVG with exact stroke styling"
                  >
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                    Save SVG
                  </button>
                </div>

                <div className="text-[11px] text-[var(--fg-muted)] leading-relaxed p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                  Exports a centered 1024×1024 transparent image of the hand using the violet-purple aesthetic with bright green-yellow highlights.
                </div>
              </div>
            )}

            {/* PANEL CONTENT 3: Pose-to-Pose Animation */}
            {activeRightPanel === 'export-anim' && (
              <div className="flex flex-col gap-3 text-xs">
                {/* From / To Poses */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--fg-muted)] font-medium">From Pose:</label>
                    <select
                      value={animFromKey}
                      onChange={e => setAnimFromKey(e.target.value)}
                      className="bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--accent)] outline-none"
                    >
                      <option value="Neutral flat (default)">Neutral flat (default)</option>
                      <optgroup label="Presets">
                        {Object.keys(PRESET_POSES)
                          .filter(k => k !== 'Neutral flat (default)')
                          .map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                      </optgroup>
                      {Object.keys(savedPoses).length > 0 && (
                        <optgroup label="Saved">
                          {Object.keys(savedPoses).map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--fg-muted)] font-medium">To Pose:</label>
                    <select
                      value={animToKey}
                      onChange={e => setAnimToKey(e.target.value)}
                      className="bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--accent)] outline-none"
                    >
                      <option value="Neutral flat (default)">Neutral flat (default)</option>
                      <optgroup label="Presets">
                        {Object.keys(PRESET_POSES)
                          .filter(k => k !== 'Neutral flat (default)')
                          .map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                      </optgroup>
                      {Object.keys(savedPoses).length > 0 && (
                        <optgroup label="Saved">
                          {Object.keys(savedPoses).map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {/* Duration & FPS */}
                <div className="grid grid-cols-2 gap-2 items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--fg-muted)]">Duration ({animDuration}s):</label>
                    <input
                      type="range"
                      min={0.2}
                      max={4.0}
                      step={0.1}
                      value={animDuration}
                      onChange={e => setAnimDuration(Number(e.target.value))}
                      className="accent-[var(--accent)] h-1.5 cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[var(--fg-muted)]">Framerate (FPS):</label>
                    <select
                      value={animFps}
                      onChange={e => setAnimFps(Number(e.target.value))}
                      className="bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--accent)] outline-none"
                    >
                      {[10, 15, 20, 24, 30].map(f => (
                        <option key={f} value={f}>
                          {f} fps
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview Transition Toggle Button */}
                <button
                  onClick={togglePreview}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold transition-all shadow-sm ${
                    isPreviewing
                      ? 'bg-purple-600/30 border border-purple-500 text-purple-200 animate-pulse'
                      : 'bg-[var(--bg)] border border-[var(--border)] hover:border-[#adff2f] text-[var(--fg)] hover:text-[#adff2f]'
                  }`}
                >
                  {isPreviewing ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                      <span>Stop Live Preview</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-[#adff2f] text-[#adff2f]" />
                      <span>Preview Transition</span>
                    </>
                  )}
                </button>

                {/* Export Buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[var(--border)]">
                  <button
                    onClick={handleExportGif}
                    disabled={isExporting || isPreviewing}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] hover:text-[var(--accent)] text-xs font-medium transition-all shadow-xs disabled:opacity-40"
                    title="Save client-side transparent animated GIF"
                  >
                    <Film className="w-3 h-3 text-[#adff2f]" />
                    Save GIF
                  </button>
                  <button
                    onClick={handleExportApng}
                    disabled={isExporting || isPreviewing}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] hover:text-[var(--accent)] text-xs font-medium transition-all shadow-xs disabled:opacity-40"
                    title="Save high-fidelity animated PNG (APNG)"
                  >
                    <ImageIcon className="w-3 h-3 text-purple-400" />
                    Save APNG
                  </button>
                  <button
                    onClick={handleExportZip}
                    disabled={isExporting || isPreviewing}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--fg)] hover:text-[var(--accent)] text-xs font-medium transition-all shadow-xs disabled:opacity-40"
                    title="Save ZIP archive with numbered PNG frames and animation.json manifest"
                  >
                    <FileArchive className="w-3 h-3 text-blue-400" />
                    Save ZIP
                  </button>
                </div>

                {/* Progress / Status Indicator */}
                {animProgress && (
                  <div className="flex flex-col gap-1 p-2 rounded bg-[var(--bg)] border border-[var(--border)] text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--accent)] font-medium">{animProgress.stage}</span>
                      <span className="font-mono text-[var(--fg-muted)]">
                        {animProgress.current} / {animProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--panel)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-[#adff2f] transition-all duration-150"
                        style={{ width: `${Math.round((animProgress.current / animProgress.total) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SVG Canvas (#s) */}
        <svg
          id="s"
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Film optical softness: slight blur akin to a well-preserved film (no artificial artifacts, features remain noticeable) */}
            <filter id="filmBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.0055" />
            </filter>

            {/* Parent joint 6x6 radial gradient: green outer, getting more yellow toward the center */}
            <radialGradient id="parentJointGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#ffff33" />
              <stop offset="35%" stopColor="#adff2f" />
              <stop offset="70%" stopColor="#65a30d" />
              <stop offset="100%" stopColor="#15803d" />
            </radialGradient>
          </defs>

          {/* Grid (#grid) */}
          <g id="grid">{renderGrid}</g>

          {/* Hand (#hand) with subtle film optical softness */}
          <g
            id="hand"
            ref={handRef}
            transform={`rotate(${state.wrist})`}
            filter="url(#filmBlur)"
          >
            {/* Palm boxes if state.boxes is true (§9.1) */}
            {state.boxes && (
              <g className="palm-boxes">
                <rect className="box" x="-2" y="-4" width="4" height="4" />
                <line className="box" x1="-1" y1="-4" x2="-1" y2="0" />
                <line className="box" x1="0" y1="-4" x2="0" y2="0" />
                <line className="box" x1="1" y1="-4" x2="1" y2="0" />
              </g>
            )}

            {/* Five fingerpieces on one wrist hub (order: index, middle, ring, pinky, thumb) */}
            {FINGER_ORDER.filter(d => activeFingers.includes(d)).map(d => {
              const rotBase = calcA(d, state);
              const ang = state.cj[d].map(c => -c);
              return (
                <g key={d} data-d={d} transform={`rotate(${rotBase})`}>
                  {renderChain(d, 0, ang)}
                </g>
              );
            })}

            {/* Wrist Hub circles and hit (§9.1) — half previous size */}
            <circle className="wrist-sock" cx={0} cy={0} r={0.325} />
            <circle className="wrist-plug" cx={0} cy={0} r={0.1} />
            <circle
              className="hit"
              cx={0}
              cy={0}
              r={0.65}
              data-w="1"
            >
              <title>Wrist hub — Drag to rotate entire hand</title>
            </circle>
          </g>
        </svg>
      </div>

      {/* SPLIT BAR (#split) */}
      <div
        id="split"
        onPointerDown={handleSplitPointerDown}
        onDoubleClick={handleSplitDoubleClick}
        title="Drag up/down to resize stage • Double-click to reset (66.67%)"
        className="h-4 bg-[var(--border)] hover:bg-[var(--accent)] cursor-ns-resize flex items-center justify-center shrink-0 z-20 transition-colors"
      >
        <div className="w-10 h-1 bg-[var(--fg-muted)] rounded opacity-60"></div>
      </div>

      {/* CONTROLS PANEL (#c) */}
      <div
        id="c"
        className="flex-1 bg-[var(--panel)] overflow-y-auto p-4 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4 content-start"
      >




        {/* GROUPS 4..8: Per-Finger Groups (order: index, ring, pinky, thumb, middle) */}
        {CONTROLS_FINGER_ORDER.map(d => {
          const isActive = activeFingers.includes(d);
          const [rLo, rHi] = rRange(d, state.expert);
          const [cLo, cHi] = cRange(d, state.expert);
          const bones = BONES[d];
          const isThumb = d === 'thumb';
          const isMaster = d === 'middle';

          // Average curl of all 3 joints (including thumb)
          const avgCurl = Math.round((state.cj[d][0] + state.cj[d][1] + state.cj[d][2]) / 3);

          return (
            <div
              key={d}
              className={`bg-[var(--bg)] border rounded-lg p-3 flex flex-col gap-2.5 transition-opacity ${
                isActive ? 'border-[var(--border)] opacity-100' : 'border-[var(--border)]/50 opacity-40'
              }`}
            >
              {/* Group Header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isMaster
                        ? 'bg-[#adff2f] shadow-[0_0_6px_#adff2f]'
                        : 'bg-purple-400'
                    }`}
                  ></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--fg)] capitalize">
                    {d} {isMaster ? '(Master Bird)' : ''}
                  </h3>
                </div>
                <div className="text-[10px] font-mono text-[var(--fg-muted)]">
                  Reach: {reach(d, state.o)} pyxls
                </div>
              </div>

              {/* Splay Offset Slider (except for middle finger) */}
              {!isMaster && (
                <SliderRow
                  label="Splay Add"
                  unit="%"
                  min={-100}
                  max={100}
                  value={isThumb ? state.thumb : state.fs[d as 'index' | 'ring' | 'pinky']}
                  onChange={v => {
                    setState(prev => {
                      if (isThumb) return { ...prev, thumb: v };
                      return {
                        ...prev,
                        fs: {
                          ...prev.fs,
                          [d]: v,
                        },
                      };
                    });
                  }}
                />
              )}

              {/* Finger Rotation Slider */}
              <SliderRow
                label="Rotation"
                unit="°"
                min={rLo}
                max={rHi}
                value={state.rot[d]}
                onChange={v => {
                  setState(prev => ({
                    ...prev,
                    rot: {
                      ...prev.rot,
                      [d]: v,
                    },
                  }));
                }}
              />

              {/* Curl (All joints) Slider */}
              <SliderRow
                label="Curl (All)"
                unit="°"
                min={cLo}
                max={cHi}
                value={avgCurl}
                onChange={v => {
                  setState(prev => ({
                    ...prev,
                    cj: {
                      ...prev.cj,
                      [d]: [v, v, v],
                    },
                  }));
                }}
              />

              {/* Individual Joint Curls Accordion */}
              <details open className="bg-[var(--panel)] border border-[var(--border)] rounded p-2 text-xs">
                <summary className="font-semibold text-[11px] text-[var(--accent)] cursor-pointer select-none mb-2">
                  Joint curls (3 joints)
                </summary>
                <div className="flex flex-col gap-2 mt-1">
                  <SliderRow
                    label="Knuckle"
                    unit="°"
                    min={cLo}
                    max={cHi}
                    value={state.cj[d][0]}
                    onChange={v => {
                      setState(prev => ({
                        ...prev,
                        cj: {
                          ...prev.cj,
                          [d]: [v, prev.cj[d][1], prev.cj[d][2]],
                        },
                      }));
                    }}
                  />

                  <SliderRow
                    label="Middle Joint"
                    unit="°"
                    min={cLo}
                    max={cHi}
                    value={state.cj[d][1]}
                    onChange={v => {
                      setState(prev => ({
                        ...prev,
                        cj: {
                          ...prev.cj,
                          [d]: [prev.cj[d][0], v, prev.cj[d][2]],
                        },
                      }));
                    }}
                  />

                  <SliderRow
                    label="Tip Joint"
                    unit="°"
                    min={cLo}
                    max={cHi}
                    value={state.cj[d][2]}
                    onChange={v => {
                      setState(prev => ({
                        ...prev,
                        cj: {
                          ...prev.cj,
                          [d]: [prev.cj[d][0], prev.cj[d][1], v],
                        },
                      }));
                    }}
                  />
                </div>
              </details>
            </div>
          );
        })}

        {/* FOOTER NOTE (#rd) */}
        <div
          id="rd"
          className="col-span-full bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--fg-muted)] leading-relaxed"
        >
          <div className="font-semibold text-[var(--fg)] mb-1 flex items-center gap-1.5">
            <FileCode className="w-4 h-4 text-purple-400" />
            Pyxl Hand Rig v2 — Canonical Rules & Reach (§10)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
            <div>
              <strong>Reachable lengths:</strong> Middle (8 raw, 7 functional) | Ring (7.5 raw, 6.5 functional) |
              Index (7 raw, 6.0 functional) | Pinky (6.5 raw, 5.5 functional) | Thumb (5 raw, 4.5 functional).
            </div>
            <div>
              <strong>Proportions:</strong> Middle finger sets master proportions (4:2:1:1). Metacarpal 4:1 box, Proximal 2:1 box, Middle 1:1 box, Distal 1:1 invisible square with 12.5% empty space on each side (width = 0.75 pyxl / 75 subpyxls). Other fingers scaled from Middle. Shapes fit inside boxes in all cases.
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-sm font-bold text-[var(--fg)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#adff2f]" />
                Pyxl Hand Rig v2 Reference
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-lg leading-none text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2.5 leading-relaxed text-[var(--fg-muted)]">
              <p>
                <strong className="text-[var(--fg)]">Direct Canvas Dragging:</strong>
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-[var(--fg)]">Wrist Hub:</strong> Grab the red center circle to rotate the entire hand 360°.</li>
                <li><strong className="text-[var(--fg)]">Finger Base:</strong> Drag any finger root to splay / rotate the finger relative to the wrist hub.</li>
                <li><strong className="text-[var(--fg)]">Bone Shaft:</strong> Drag any bone shaft to drive 14-iteration Cyclic Coordinate Descent (CCD) Inverse Kinematics toward that bone's tip!</li>
                <li><strong className="text-[var(--fg)]">Joint Pins:</strong> Grab joint circles directly to articulate knuckles and tips with natural IK bending.</li>
              </ul>

              <p className="mt-1">
                <strong className="text-[var(--fg)]">Hand Builds (§3):</strong>
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-[var(--fg)]">Standard:</strong> 5 fingerpieces (full human hand).</li>
                <li><strong className="text-[var(--fg)]">Claw:</strong> 1 finger + 1 thumb (hand in profile).</li>
                <li><strong className="text-[var(--fg)]">Trident:</strong> 3 fingers (bird + ring + thumb).</li>
                <li><strong className="text-[var(--fg)]">Mickey's Glove:</strong> Classic 4-digit cartoon hand (no pinky).</li>
              </ul>

              <p className="mt-1">
                <strong className="text-[var(--fg)]">Single-File Pure HTML Export:</strong> Click the "Single-File HTML" button in the top bar to export a zero-dependency, pure HTML file that runs locally in any browser with no network or server needed!
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] font-medium text-xs"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable Slider Component with range and number input pair (§10)
 */
interface SliderRowProps {
  label: string;
  unit?: string;
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
}

function SliderRow({ label, unit = '', min, max, value, onChange }: SliderRowProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="w-24 text-[11px] text-[var(--fg)] shrink-0 truncate" title={label}>
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--panel)] rounded"
      />
      <div className="flex items-center gap-0.5 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-12 bg-[var(--panel)] border border-[var(--border)] rounded px-1 py-0.5 text-[11px] text-right text-[var(--fg)] focus:border-[var(--accent)] outline-none"
        />
        {unit && <span className="text-[10px] text-[var(--fg-muted)] w-3">{unit}</span>}
      </div>
    </div>
  );
}
