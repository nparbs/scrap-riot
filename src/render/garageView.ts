import * as THREE from 'three';
import { buildRobot, disposeRobot, type RobotBuild, type RobotModel } from './robots';

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.5;

/** Turntable showing the current robot in the workshop's preview window. */
export class GarageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private model: RobotModel | null = null;
  private readonly turntable = new THREE.Group();
  private key = '';
  private zoomLevel = 1.15;

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
    this.camera.position.set(0, 3.2 * this.zoomLevel, 8.2 * this.zoomLevel);
    this.camera.lookAt(0, 0.8, 0);
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
    this.turntable.add(this.model.root);
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
