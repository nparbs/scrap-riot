import * as THREE from 'three';
import { buildRobot, disposeRobot, type RobotBuild, type RobotModel } from './robots';

/** Turntable showing the current loadout behind the garage panels. */
export class GarageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private model: RobotModel | null = null;
  private readonly turntable = new THREE.Group();
  private key = '';

  constructor() {
    this.scene.background = new THREE.Color(0x14161a);
    this.scene.add(new THREE.HemisphereLight(0xd0dcf0, 0x2a2622, 1.3));
    const lamp = new THREE.SpotLight(0xfff0d8, 220, 30, 0.6, 0.5);
    lamp.position.set(3, 11, 4);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    this.scene.add(lamp);
    const rim = new THREE.PointLight(0xff8a2a, 60, 20);
    rim.position.set(-6, 3, -5);
    this.scene.add(rim);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4.2, 0.3, 40),
      new THREE.MeshStandardMaterial({ color: 0x34383d, metalness: 0.7, roughness: 0.5 }),
    );
    pad.position.y = -0.15;
    pad.receiveShadow = true;
    this.turntable.add(pad);
    this.scene.add(this.turntable);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 32),
      new THREE.MeshStandardMaterial({ color: 0x191b1f, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.camera.position.set(0, 4.4, 10.5);
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

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    // Slide the robot into the empty left side on wide screens; center it on narrow ones.
    const wide = width > 900;
    this.camera.setViewOffset(width, height, wide ? width * 0.24 : 0, wide ? 0 : height * 0.26, width, height);
    this.camera.lookAt(0, 0.9, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.turntable.rotation.y += dt * 0.5;
    if (this.model?.spinner) this.model.spinner.rotation[this.model.spinAxis] += dt * 3;
  }
}
