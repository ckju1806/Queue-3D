import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CUE_BALL } from '../game/balls';
import type { GameSession } from '../game/gameSession';
import type { Vec2 } from '../physics/vec2';
import { AimOverlay, type GhostTone } from './aimOverlay';
import { BallViews } from './ballMeshes';
import { CameraController } from './cameraController';
import { buildCue } from './cueMesh';
import { buildLounge } from './lounge';
import { buildTable, createTableMaterials, TABLE_DIMENSIONS } from './tableMesh';

export type GraphicsQuality = 'high' | 'low';

export interface RenderOptions {
  /** Anschlussrichtungen (Objektkugel/Weiße) im Training anzeigen. */
  trainingAimHelp: boolean;
}

const CUE_GAP = 0.012;
const CUE_PULL = 0.24;

/**
 * Verbindet Spielzustand und 3D-Szene: Tisch, Kugeln, Queue, Zielhilfe, Kamera.
 * Liest den Zustand nur – Änderungen am Spiel erfolgen ausschließlich über die Session.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cameraCtl: CameraController;
  private readonly balls: BallViews;
  private readonly cue: THREE.Group;
  private readonly overlay: AimOverlay;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane: THREE.Plane;
  private readonly tmpV = new THREE.Vector3();
  private displayPull = CUE_GAP;
  private cueAnchor: Vec2 | null = null;
  private anchorDirection: Vec2 = { x: 1, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly session: GameSession,
    quality: GraphicsQuality = 'high',
  ) {
    const low = quality === 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? 0.75 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color('#0a0c0d');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 60);
    const g = session.geometry;
    const R = session.world.ballRadius;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);

    buildLounge(this.scene);
    this.scene.add(buildTable(g, createTableMaterials()));
    this.balls = new BallViews(R);
    this.scene.add(this.balls.group);
    this.cue = buildCue();
    this.scene.add(this.cue);
    this.overlay = new AimOverlay(g, R);
    this.scene.add(this.overlay.group);

    const ext = { x: g.halfLength + g.cushionWidth + TABLE_DIMENSIONS.railWidth, z: g.halfWidth + g.cushionWidth + TABLE_DIMENSIONS.railWidth };
    this.resizeRenderer();
    this.cameraCtl = new CameraController(this.camera, ext);
  }

  resize(): void {
    this.resizeRenderer();
    this.cameraCtl.onResize();
  }

  private resizeRenderer(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Mausposition → Punkt auf der Ebene der Kugelmittelpunkte (Tischkoordinaten). */
  pickTablePoint(clientX: number, clientY: number): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.tmpV);
    if (!hit) return null;
    return { x: hit.x, y: hit.z };
  }

  render(dt: number, options: RenderOptions): void {
    const s = this.session;
    this.cameraCtl.autoRotate = s.state === 'menu';
    this.cameraCtl.update(dt);

    const cueBall = s.world.balls[CUE_BALL];
    this.balls.update(s.world, cueBall.onTable ? null : s.cueBallPosition());
    this.updateOverlay(options);
    this.updateCue(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateOverlay(options: RenderOptions): void {
    const s = this.session;
    const st = s.displayState;
    const preview = s.aimPreview();
    if (preview) {
      let tone: GhostTone = 'neutral';
      if (preview.hit.type === 'pocket') tone = 'scratch';
      else if (preview.hit.type === 'ball' && s.mode !== 'training') {
        tone = s.currentLegalTargets().includes(preview.hit.id) ? 'legal' : 'illegal';
      }
      const followLines = s.mode === 'training' && options.trainingAimHelp;
      this.overlay.showAim(preview, tone, followLines, s.isAiTurn());
    } else {
      this.overlay.hideAim();
    }

    const placing = st === 'ballInHand' || (st === 'aiThinking' && s.canRepositionCue);
    const pos = placing ? s.cueBallPosition() : null;
    if (pos) this.overlay.showPlacement(pos, s.placementValidity(pos).valid, s.kitchenOnly);
    else this.overlay.hidePlacement();
  }

  private updateCue(dt: number): void {
    const s = this.session;
    const st = s.displayState;
    const cueBall = s.world.balls[CUE_BALL];
    const R = s.world.ballRadius;

    const aimingStates = st === 'aiming' || st === 'charging' || st === 'striking';
    if (aimingStates && cueBall.onTable) {
      this.cueAnchor = { x: cueBall.x, y: cueBall.y };
      this.anchorDirection = { ...s.aimDirection };
    }
    const followThrough = st === 'rolling' && s.timeSinceShot < 0.3;
    if (!this.cueAnchor || !(aimingStates || followThrough) || (!cueBall.onTable && !followThrough)) {
      this.cue.visible = false;
      if (!aimingStates) this.displayPull = CUE_GAP;
      return;
    }

    let pull: number;
    if (st === 'charging') {
      const target = CUE_GAP + s.power * CUE_PULL;
      this.displayPull += (target - this.displayPull) * (1 - Math.exp(-dt * 30));
      pull = this.displayPull;
    } else if (st === 'striking') {
      const start = CUE_GAP + s.strikePower * CUE_PULL;
      const p = s.strikeProgress;
      pull = start + (-0.003 - start) * p * p;
      this.displayPull = pull;
    } else if (followThrough) {
      pull = -0.003 - Math.min(0.035, s.timeSinceShot * 0.15);
    } else {
      this.displayPull += (CUE_GAP - this.displayPull) * (1 - Math.exp(-dt * 12));
      pull = this.displayPull;
    }

    const anchor = this.cueAnchor;
    const d = this.anchorDirection;
    // Anheben, damit der Queue über Bande und Rahmen geführt wird
    const g = s.geometry;
    const back = { x: -d.x, y: -d.y };
    const tx = back.x !== 0 ? ((Math.sign(back.x) * g.halfLength - anchor.x) / back.x) : Infinity;
    const ty = back.y !== 0 ? ((Math.sign(back.y) * g.halfWidth - anchor.y) / back.y) : Infinity;
    const toNose = Math.max(0, Math.min(tx, ty));
    const horizNose = Math.max(0.004, toNose - R - pull);
    const horizRail = Math.max(0.004, toNose + g.cushionWidth - R - pull);
    const needNose = TABLE_DIMENSIONS.cushionTop + 0.012 - R;
    const needRail = TABLE_DIMENSIONS.railTop + 0.015 - R;
    const elev = Math.min(0.7, Math.max(0.08, Math.atan(needNose / horizNose), Math.atan(needRail / horizRail)));

    const tip = new THREE.Vector3(anchor.x + back.x * (R + pull), R, anchor.y + back.y * (R + pull));
    const axis = new THREE.Vector3(back.x * Math.cos(elev), Math.sin(elev), back.y * Math.cos(elev)).normalize();
    this.cue.position.copy(tip);
    this.cue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    this.cue.visible = true;
  }
}
