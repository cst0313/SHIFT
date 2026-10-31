import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  LAYOUT,
  PRODUCT_SIZE,
  TOOL_LENGTH,
  type PickPlaceScenario,
} from '@/core/scenarios/pickPlace/pickPlace';
import { DeltaRobotModel, type RobotSnapshot } from '../robot/DeltaRobotModel';
import { ReachFootprint, WorkspaceEnvelope } from '../robot/WorkspaceEnvelope';
import { PathPreview } from '../robot/PathPreview';
import { PALETTE } from '../helpers';
import { useApp } from '@/state/store';

const MAX_PRODUCTS = 240;
const MAX_TRAYS = 40;

export function PickPlaceScene({ scenario }: { scenario: PickPlaceScenario }) {
  const view = useApp((s) => s.view);
  const base = scenario.robotBase();
  const pickZ = LAYOUT.beltHeight + PRODUCT_SIZE.box.h - base.z;

  const readRobot = (): RobotSnapshot => ({
    params: scenario.params,
    base: scenario.robotBase(),
    theta: scenario.robot.theta,
    flange: scenario.robot.flange,
    yaw: scenario.robot.state.yaw,
    gripper: scenario.robot.gripper,
    tool: TOOL_LENGTH.suction,
  });

  return (
    <group>
      <SafetyPerimeter />
      <Gantry height={base.z} scenario={scenario} />
      <ControlCabinet gantryTop={base.z + 0.12} />
      <InfeedSealerTunnel />
      <VisionScannerBridge showLaserSheet={view.vision} />
      <Conveyor
        y={LAYOUT.belt.y}
        width={LAYOUT.belt.width}
        xStart={LAYOUT.belt.xStart}
        xEnd={LAYOUT.belt.xEnd}
        travel={() => scenario.beltTravel}
        accentColor="#0ea5e9"
      />
      {scenario.config.placeMode === 'trayConveyor' ? (
        <Conveyor
          y={LAYOUT.trayBelt.y}
          width={LAYOUT.trayBelt.width}
          xStart={LAYOUT.trayBelt.xStart}
          xEnd={LAYOUT.trayBelt.xEnd}
          travel={() => scenario.trayTravel}
          accentColor="#10b981"
        />
      ) : (
        <TrayTable />
      )}
      <RejectBin scenario={scenario} />
      <Products scenario={scenario} />
      <Trays scenario={scenario} />
      <DeltaRobotModel read={readRobot} tool="suction" />
      <group position={[base.x, base.y, base.z]}>
        {view.workspace && <WorkspaceEnvelope params={scenario.params} tool={TOOL_LENGTH.suction} />}
        {view.workspace && (
          <ReachFootprint params={scenario.params} tool={TOOL_LENGTH.suction} z={pickZ - 0.045} />
        )}
      </group>
      {view.path && (
        <PathPreview
          read={() => ({
            base: scenario.robotBase(),
            points: scenario.robot.phase === 'idle' ? [] : scenario.robot.preview,
          })}
        />
      )}
    </group>
  );
}

const frameMat = new THREE.MeshStandardMaterial({
  color: PALETTE.frame,
  roughness: 0.32,
  metalness: 0.75,
  flatShading: true,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: PALETTE.frameDark,
  roughness: 0.55,
  metalness: 0.45,
  flatShading: true,
});
const steelMat = new THREE.MeshStandardMaterial({
  color: '#64748b',
  roughness: 0.28,
  metalness: 0.82,
  flatShading: true,
});
const cabinetMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.45,
  metalness: 0.6,
  flatShading: true,
});
const hazardYellowMat = new THREE.MeshStandardMaterial({
  color: '#eab308',
  roughness: 0.5,
  metalness: 0.2,
});
const glassGuardMat = new THREE.MeshStandardMaterial({
  color: '#38bdf8',
  transparent: true,
  opacity: 0.06,
  roughness: 0.15,
  metalness: 0.1,
  depthWrite: false,
});

/** Industrial floor safety perimeter markings around the robotic workcell. */
function SafetyPerimeter() {
  const xMin = -2.35;
  const xMax = 2.25;
  const yMin = -1.05;
  const yMax = 0.95;
  const w = xMax - xMin;
  const d = yMax - yMin;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const stripeW = 0.035;

  return (
    <group position={[0, 0, 0.002]}>
      {/* Perimeter yellow safety boundary */}
      <mesh position={[cx, yMin, 0]} material={hazardYellowMat}>
        <boxGeometry args={[w, stripeW, 0.002]} />
      </mesh>
      <mesh position={[cx, yMax, 0]} material={hazardYellowMat}>
        <boxGeometry args={[w, stripeW, 0.002]} />
      </mesh>
      <mesh position={[xMin, cy, 0]} material={hazardYellowMat}>
        <boxGeometry args={[stripeW, d, 0.002]} />
      </mesh>
      <mesh position={[xMax, cy, 0]} material={hazardYellowMat}>
        <boxGeometry args={[stripeW, d, 0.002]} />
      </mesh>
      {/* Corner safety bollards */}
      {[
        [xMin, yMin],
        [xMax, yMin],
        [xMin, yMax],
        [xMax, yMax],
      ].map(([bx, by], i) => (
        <group key={i} position={[bx!, by!, 0]}>
          <mesh position-z={0.22} material={hazardYellowMat} castShadow>
            <cylinderGeometry args={[0.032, 0.032, 0.44, 12]} />
          </mesh>
          <mesh position-z={0.38} material={darkMat}>
            <cylinderGeometry args={[0.034, 0.034, 0.08, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Portal frame carrying the robot above the conveyors + polycarbonate side guarding + Andon tower. */
function Gantry({ height, scenario }: { height: number; scenario: PickPlaceScenario }) {
  const posts: [number, number][] = [
    [-0.75, -0.8],
    [0.75, -0.8],
    [-0.75, 0.8],
    [0.75, 0.8],
  ];
  const top = height + 0.12;
  return (
    <group>
      {posts.map(([x, y], i) => (
        <group key={i}>
          <mesh position={[x, y, top / 2]} material={frameMat} castShadow receiveShadow>
            <boxGeometry args={[0.08, 0.08, top]} />
          </mesh>
          {/* Heavy floor anchor footplate */}
          <mesh position={[x, y, 0.015]} material={darkMat} receiveShadow>
            <boxGeometry args={[0.18, 0.18, 0.03]} />
          </mesh>
        </group>
      ))}
      {[-0.8, 0.8].map((y) => (
        <mesh key={y} position={[0, y, top]} material={frameMat} castShadow>
          <boxGeometry args={[1.58, 0.08, 0.08]} />
        </mesh>
      ))}
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0, top]} material={frameMat} castShadow>
          <boxGeometry args={[0.08, 1.68, 0.08]} />
        </mesh>
      ))}
      {/* Robot servo mounting plenum */}
      <mesh position={[0, 0, top + 0.025]} material={darkMat} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.56, 0.04]} />
      </mesh>
      {/* Top servo drive housing cover */}
      <mesh position={[0, 0, top + 0.1]} material={cabinetMat} castShadow>
        <boxGeometry args={[0.68, 0.68, 0.12]} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0, top - 0.02]} material={frameMat}>
          <boxGeometry args={[0.06, 1.6, 0.05]} />
        </mesh>
      ))}
      {/* Rear translucent polycarbonate safety guard panel (keeps front camera unobstructed) */}
      <mesh position={[0, 0.8, LAYOUT.beltHeight + 0.52]} material={glassGuardMat}>
        <boxGeometry args={[1.42, 0.01, 0.82]} />
      </mesh>
      {/* 3-Color Industrial Andon Stack Light Tower on front-right post */}
      <AndonStackLight position={[0.75, -0.8, top + 0.04]} scenario={scenario} />
    </group>
  );
}

/** Real-time 3-lamp Andon stack light tower reflecting cell health (Green / Amber / Red). */
function AndonStackLight({
  position,
  scenario,
}: {
  position: [number, number, number];
  scenario: PickPlaceScenario;
}) {
  const redRef = useRef<THREE.MeshStandardMaterial>(null);
  const amberRef = useRef<THREE.MeshStandardMaterial>(null);
  const greenRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const s = useApp.getState();
    const { missed, placed } = scenario.counters();
    const isRejected = s.activeSession?.status === 'rejected_infeasible';
    const isEvaluating = s.isEvaluating;
    const isBeforeReplay = s.comparisonReplayView === 'before';
    const pulse = 0.65 + 0.35 * Math.sin(clock.getElapsedTime() * 8);

    const redActive = missed > 0 || isRejected;
    const amberActive = isEvaluating || isBeforeReplay || (!redActive && placed === 0);
    const greenActive = !redActive && !amberActive;

    if (redRef.current) {
      redRef.current.emissiveIntensity = redActive ? 2.4 * pulse : 0.08;
    }
    if (amberRef.current) {
      amberRef.current.emissiveIntensity = amberActive ? 2.0 * pulse : 0.08;
    }
    if (greenRef.current) {
      greenRef.current.emissiveIntensity = greenActive ? 1.8 : 0.08;
    }
  });

  return (
    <group position={position}>
      {/* Support pole */}
      <mesh position-z={0.08} material={steelMat}>
        <cylinderGeometry args={[0.012, 0.012, 0.16, 12]} />
      </mesh>
      {/* Green lamp */}
      <mesh position-z={0.18} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 0.055, 16]} />
        <meshStandardMaterial
          ref={greenRef}
          color="#10b981"
          emissive="#10b981"
          emissiveIntensity={1.6}
          roughness={0.2}
        />
      </mesh>
      {/* Amber lamp */}
      <mesh position-z={0.24} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 0.055, 16]} />
        <meshStandardMaterial
          ref={amberRef}
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={0.1}
          roughness={0.2}
        />
      </mesh>
      {/* Red lamp */}
      <mesh position-z={0.3} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 0.055, 16]} />
        <meshStandardMaterial
          ref={redRef}
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.1}
          roughness={0.2}
        />
      </mesh>
      {/* Top cap */}
      <mesh position-z={0.335} rotation-x={Math.PI / 2} material={darkMat}>
        <cylinderGeometry args={[0.03, 0.03, 0.015, 16]} />
      </mesh>
    </group>
  );
}

/** Floor-standing PLC & Servo Drive Cabinet beside the gantry. */
function ControlCabinet({ gantryTop }: { gantryTop: number }) {
  const cabH = 1.38;
  return (
    <group position={[-1.22, -0.82, 0]}>
      {/* Main enclosure */}
      <mesh position-z={cabH / 2} material={cabinetMat} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.32, cabH]} />
      </mesh>
      {/* Brushed steel front door panel */}
      <mesh position={[0, -0.165, cabH / 2 + 0.02]} material={frameMat}>
        <boxGeometry args={[0.38, 0.01, cabH - 0.12]} />
      </mesh>
      {/* Embedded HMI touchscreen bezel on cabinet door */}
      <mesh position={[0, -0.172, 1.05]}>
        <boxGeometry args={[0.22, 0.008, 0.15]} />
        <meshStandardMaterial color="#0f172a" emissive="#0284c7" emissiveIntensity={0.45} />
      </mesh>
      {/* Emergency Stop button (yellow base + red mushroom head) */}
      <mesh position={[0.12, -0.172, 0.86]} material={hazardYellowMat}>
        <boxGeometry args={[0.045, 0.01, 0.045]} />
      </mesh>
      <mesh position={[0.12, -0.182, 0.86]}>
        <cylinderGeometry args={[0.016, 0.016, 0.02, 12]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
      {/* Cable conduit bridge from cabinet to gantry */}
      <mesh
        position={[0.24, 0.02, (cabH + gantryTop) / 2]}
        material={darkMat}
        castShadow
      >
        <boxGeometry args={[0.05, 0.05, gantryTop - cabH + 0.1]} />
      </mesh>
    </group>
  );
}

/** Upstream carton sealer / case infeed tunnel at the start of the product conveyor. */
function InfeedSealerTunnel() {
  const x = LAYOUT.belt.xStart - 0.18;
  const y = LAYOUT.belt.y;
  const h = LAYOUT.beltHeight;
  const tunnelW = 0.44;
  const tunnelD = LAYOUT.belt.width + 0.14;
  const tunnelH = 0.46;

  return (
    <group position={[x, y, h]}>
      {/* Main stainless/slate sealer arch */}
      <mesh position-z={tunnelH / 2} material={cabinetMat} castShadow receiveShadow>
        <boxGeometry args={[tunnelW, tunnelD, tunnelH]} />
      </mesh>
      {/* Top metallic header */}
      <mesh position-z={tunnelH + 0.02} material={steelMat} castShadow>
        <boxGeometry args={[tunnelW + 0.04, tunnelD + 0.02, 0.04]} />
      </mesh>
      {/* Safety stripe bar above product exit */}
      <mesh position={[tunnelW / 2 + 0.005, 0, tunnelH - 0.06]} material={hazardYellowMat}>
        <boxGeometry args={[0.01, tunnelD - 0.04, 0.04]} />
      </mesh>
      {/* Dark infeed mouth opening */}
      <mesh position={[tunnelW / 2 + 0.002, 0, 0.14]}>
        <boxGeometry args={[0.01, LAYOUT.belt.width - 0.04, 0.28]} />
        <meshStandardMaterial color="#090d12" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Overhead machine-vision camera bridge & laser line scanner upstream of the pick zone. */
function VisionScannerBridge({ showLaserSheet }: { showLaserSheet: boolean }) {
  const x = -1.08;
  const y = LAYOUT.belt.y;
  const h = LAYOUT.beltHeight;
  const bridgeH = 0.52;
  const span = LAYOUT.belt.width + 0.12;

  return (
    <group position={[x, y, h]}>
      {/* Vertical posts */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[0, (s * span) / 2, bridgeH / 2]}
          material={frameMat}
          castShadow
        >
          <boxGeometry args={[0.04, 0.04, bridgeH]} />
        </mesh>
      ))}
      {/* Crossbar camera housing */}
      <mesh position={[0, 0, bridgeH]} material={cabinetMat} castShadow>
        <boxGeometry args={[0.12, span + 0.06, 0.07]} />
      </mesh>
      {/* Optical lens unit */}
      <mesh position={[0, 0, bridgeH - 0.045]} rotation-x={Math.PI / 2} material={steelMat}>
        <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
      </mesh>
      {/* Glowing cyan laser scan line across the conveyor belt */}
      <mesh position={[0, 0, 0.004]}>
        <boxGeometry args={[0.012, LAYOUT.belt.width - 0.02, 0.003]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={2.2}
          roughness={0.2}
        />
      </mesh>
      {/* Translucent laser fan sheet when vision overlay is enabled */}
      {showLaserSheet && (
        <mesh position={[0, 0, bridgeH / 2]}>
          <boxGeometry args={[0.004, LAYOUT.belt.width - 0.04, bridgeH - 0.06]} />
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={0.6}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Belt conveyor with scrolling cleats, side guide rails, photo-eye sensors, and end drive motor. */
function Conveyor({
  y,
  width,
  xStart,
  xEnd,
  travel,
  accentColor,
}: {
  y: number;
  width: number;
  xStart: number;
  xEnd: number;
  travel: () => number;
  accentColor: string;
}) {
  const length = xEnd - xStart;
  const h = LAYOUT.beltHeight;
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1e242c';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#28313c';
    g.fillRect(0, 0, 8, 64);
    g.fillStyle = '#171c23';
    g.fillRect(30, 0, 2, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(length / 0.12, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [length]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    texture.offset.x = -travel() / 0.12;
  });

  const legs = [];
  for (let x = xStart + 0.3; x < xEnd; x += 1.2) legs.push(x);

  return (
    <group position={[(xStart + xEnd) / 2, y, 0]}>
      <mesh position-z={h - 0.005} receiveShadow>
        <boxGeometry args={[length, width, 0.01]} />
        <meshStandardMaterial map={texture} roughness={0.82} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            position={[0, (s * (width + 0.04)) / 2, h - 0.01]}
            material={frameMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length, 0.04, 0.07]} />
          </mesh>
          {/* Thin anodized status trim along the conveyor frame */}
          <mesh position={[0, (s * (width + 0.082)) / 2, h - 0.01]}>
            <boxGeometry args={[length - 0.1, 0.004, 0.014]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.45}
            />
          </mesh>
        </group>
      ))}
      <mesh position-z={h - 0.06} material={darkMat} receiveShadow>
        <boxGeometry args={[length, width, 0.09]} />
      </mesh>
      {[-length / 2, length / 2].map((x) => (
        <mesh key={x} position={[x, 0, h - 0.04]} material={steelMat}>
          <cylinderGeometry args={[0.04, 0.04, width + 0.02, 16]} />
        </mesh>
      ))}
      {/* End-mounted VFD gearmotor housing */}
      <mesh position={[length / 2 - 0.08, -(width / 2 + 0.09), h - 0.05]} material={cabinetMat} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.12]} />
      </mesh>
      {legs.map((x) => (
        <group key={x} position-x={x - (xStart + xEnd) / 2}>
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[0, (s * width) / 2.4, (h - 0.1) / 2]}
              material={darkMat}
              castShadow
            >
              <boxGeometry args={[0.05, 0.05, h - 0.1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function TrayTable() {
  return (
    <group position={[-0.05, 0.32, 0]}>
      <mesh position-z={LAYOUT.beltHeight - 0.03} material={darkMat} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.42, 0.06]} />
      </mesh>
      {[
        [-0.45, -0.17],
        [0.45, -0.17],
        [-0.45, 0.17],
        [0.45, 0.17],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x!, y!, (LAYOUT.beltHeight - 0.06) / 2]} material={frameMat}>
          <boxGeometry args={[0.04, 0.04, LAYOUT.beltHeight - 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** Overflow / Missed-product reject chute & tote at the end of the product conveyor. */
function RejectBin({ scenario }: { scenario: PickPlaceScenario }) {
  const x = LAYOUT.belt.xEnd + 0.25;
  const beaconRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!beaconRef.current) return;
    const { missed } = scenario.counters();
    if (missed > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 10);
      beaconRef.current.emissiveIntensity = 1.8 * pulse;
    } else {
      beaconRef.current.emissiveIntensity = 0.05;
    }
  });

  return (
    <group position={[x, LAYOUT.belt.y, 0]}>
      {/* Angled stainless slide chute from belt end into tote */}
      <mesh
        position={[-0.18, 0, LAYOUT.beltHeight - 0.12]}
        rotation-y={0.45}
        material={steelMat}
        castShadow
      >
        <boxGeometry args={[0.24, LAYOUT.belt.width - 0.02, 0.015]} />
      </mesh>
      {/* Tote floor */}
      <mesh position={[0, 0, 0.02]} receiveShadow>
        <boxGeometry args={[0.52, 0.52, 0.03]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>
      {[
        [0, -0.24],
        [0, 0.24],
      ].map(([px, py], i) => (
        <mesh key={i} position={[px!, py!, 0.25]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.025, 0.5]} />
          <meshStandardMaterial color="#b45309" roughness={0.65} flatShading />
        </mesh>
      ))}
      {[-0.24, 0.24].map((px) => (
        <mesh key={px} position={[px, 0, 0.25]} castShadow receiveShadow>
          <boxGeometry args={[0.025, 0.5, 0.5]} />
          <meshStandardMaterial color="#b45309" roughness={0.65} flatShading />
        </mesh>
      ))}
      {/* Overflow sensor beacon on reject bin rim */}
      <mesh position={[0.24, -0.24, 0.53]}>
        <sphereGeometry args={[0.026, 12, 12]} />
        <meshStandardMaterial
          ref={beaconRef}
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.05}
        />
      </mesh>
    </group>
  );
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

function Products({ scenario }: { scenario: PickPlaceScenario }) {
  const boxes = useRef<THREE.InstancedMesh>(null);
  const cyls = useRef<THREE.InstancedMesh>(null);
  const box = PRODUCT_SIZE.box;
  const cyl = PRODUCT_SIZE.cylinder;

  useFrame(() => {
    let nb = 0;
    let nc = 0;
    for (const p of scenario.products) {
      const mesh = p.kind === 'box' ? boxes.current : cyls.current;
      if (!mesh) continue;
      const i = p.kind === 'box' ? nb++ : nc++;
      if (i >= MAX_PRODUCTS) continue;
      tmpObj.position.set(p.pos.x, p.pos.y, p.pos.z + PRODUCT_SIZE[p.kind].h / 2);
      tmpObj.rotation.set(p.kind === 'box' ? 0 : Math.PI / 2, 0, p.yaw);
      tmpObj.scale.setScalar(1);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tmpColor.set(p.color);
      if (p.state === 'missed') tmpColor.multiplyScalar(0.45);
      mesh.setColorAt(i, tmpColor);
    }
    for (const [mesh, n] of [
      [boxes.current, nb],
      [cyls.current, nc],
    ] as const) {
      if (!mesh) continue;
      mesh.count = Math.min(n, MAX_PRODUCTS);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={boxes}
        args={[undefined, undefined, MAX_PRODUCTS]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[box.x, box.y, box.h]} />
        <meshStandardMaterial roughness={0.38} metalness={0.08} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={cyls}
        args={[undefined, undefined, MAX_PRODUCTS]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[cyl.x / 2, cyl.x / 2, cyl.h, 16]} />
        <meshStandardMaterial roughness={0.3} metalness={0.15} flatShading />
      </instancedMesh>
    </group>
  );
}

function trayGeometry(): THREE.BufferGeometry {
  const { size, height } = LAYOUT.tray;
  const parts: THREE.BufferGeometry[] = [];
  const bottom = new THREE.BoxGeometry(size, size, 0.008);
  bottom.translate(0, 0, 0.004);
  parts.push(bottom);
  for (const s of [-1, 1]) {
    const a = new THREE.BoxGeometry(size, 0.008, height);
    a.translate(0, (s * (size - 0.008)) / 2, height / 2);
    const b = new THREE.BoxGeometry(0.008, size, height);
    b.translate((s * (size - 0.008)) / 2, 0, height / 2);
    parts.push(a, b);
  }
  // slot dividers
  const div1 = new THREE.BoxGeometry(size, 0.005, height * 0.6);
  div1.translate(0, 0, height * 0.3);
  const div2 = new THREE.BoxGeometry(0.005, size, height * 0.6);
  div2.translate(0, 0, height * 0.3);
  parts.push(div1, div2);
  return mergeGeometries(parts);
}

/** Tiny merge helper (all parts are non-indexed after toNonIndexed) to avoid importing examples. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => p.toNonIndexed());
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function Trays({ scenario }: { scenario: PickPlaceScenario }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => trayGeometry(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    let n = 0;
    for (const t of scenario.trays) {
      if (n >= MAX_TRAYS) break;
      tmpObj.position.set(t.pos.x, t.pos.y, t.pos.z);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.updateMatrix();
      m.setMatrixAt(n, tmpObj.matrix);
      const full = t.slots.every((s) => s !== null);
      m.setColorAt(n, tmpColor.set(full ? '#10b981' : '#334155'));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, MAX_TRAYS]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial roughness={0.5} metalness={0.2} flatShading />
    </instancedMesh>
  );
}
