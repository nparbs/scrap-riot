import * as THREE from 'three';
import { buildRobot, disposeRobot, type RobotBuild, type RobotModel } from './robots';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.6;
const CAMERA_TILT = 0.42;
const FRAME_MARGIN = 0.98;

/** Turntable showing the current robot in the workshop's preview window. */
export class GarageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private model: RobotModel | null = null;
  private readonly turntable = new THREE.Group();
  private key = '';
  private zoomLevel = 1;
  /** How far back the camera needs to be to see the whole robot and its weapon. */
  private framing = 8;
  private lookY = 0.8;

  constructor() {
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(new THREE.HemisphereLight(0xd0dcf0, 0x2a2622, 1.3));
    const lamp = new THREE.SpotLight(0xfff0d8, 220, 30, 0.6, 0.5);
    lamp.position.set(3, 11, 4);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    this.scene.add(lamp);
    const rim = new THREE.PointLight(0xff8a2a, 60, 20);
    rim.position.set(-6, 3, -5);
    this.scene.add(rim);

    this.scene.add(this.turntable);

    this.placeCamera();
  }

  private placeCamera(): void {
    const distance = this.framing * this.zoomLevel;
    this.camera.position.set(0, this.lookY + distance * Math.sin(CAMERA_TILT), distance * Math.cos(CAMERA_TILT));
    this.camera.lookAt(0, this.lookY, 0);
  }

  zoom(step: number): void {
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel + step));
    this.placeCamera();
  }

  setBuild(build: RobotBuild): void {
    const key = JSON.stringify(build);
    if (key === this.key) return;
    this.key = key;
    if (this.model) {
      this.turntable.remove(this.model.root);
      disposeRobot(this.model);
    }
    this.model = buildRobot(build);
    this.frameRobot(this.model);
    this.turntable.add(this.model.root);
  }

  /** Turns it around its own middle, and pulls back just far enough to fit it at every angle, weapon included. */
  private frameRobot(model: RobotModel): void {
    const { root, shield } = model;
    // The force field is hidden, and much bigger than the robot, so it mustn't count.
    root.remove(shield);
    const box = new THREE.Box3().setFromObject(root);
    root.add(shield);
    root.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
    const reach = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const height = box.max.y - box.min.y;
    this.lookY = (box.min.y + box.max.y) / 2;
    this.framing = (Math.hypot(reach, height / 2) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * FRAME_MARGIN;
    this.placeCamera();
  }

  /** Matches the camera to the window it's drawn in. */
  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.turntable.rotation.y += dt * 0.5;
    if (this.model?.spinner) this.model.spinner.rotation[this.model.spinAxis] += dt * 3;
  }
}
