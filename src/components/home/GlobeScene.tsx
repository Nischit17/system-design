"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap, prefersReducedMotion } from "@/components/motion/gsap";

export type GlobeEvent = { type: "failure" | "recover"; region: string; fallback: string; at: number };

const R = 1.6;
const ARC_COLOR = new THREE.Color("#8b6cff");
const MINT = new THREE.Color("#3cffc2");
const RED = new THREE.Color("#ff5c7a");
const ARC_OPACITY = 0.8;

const REGIONS = [
  { key: "us-east", lat: 38.9, lon: -77.0 },
  { key: "us-west", lat: 37.4, lon: -122.1 },
  { key: "sa-east", lat: -23.5, lon: -46.6 },
  { key: "eu-west", lat: 53.3, lon: -6.3 },
  { key: "eu-central", lat: 50.1, lon: 8.7 },
  { key: "ap-south", lat: 19.1, lon: 72.9 },
  { key: "ap-northeast", lat: 35.7, lon: 139.7 },
  { key: "ap-southeast", lat: 1.35, lon: 103.8 },
] as const;
type RegionKey = (typeof REGIONS)[number]["key"];

const ROUTES: [RegionKey, RegionKey][] = [
  ["us-east", "eu-west"],
  ["us-west", "ap-northeast"],
  ["eu-west", "ap-south"],
  ["eu-central", "ap-southeast"],
  ["us-east", "sa-east"],
  ["ap-south", "ap-southeast"],
  ["us-west", "us-east"],
  ["eu-central", "us-east"],
  ["ap-northeast", "ap-southeast"],
];

/** Each drill takes one region down and reroutes its neighbours to a fallback. */
const DRILLS: { victim: RegionKey; fallback: RegionKey }[] = [
  { victim: "eu-west", fallback: "eu-central" },
  { victim: "us-east", fallback: "us-west" },
  { victim: "ap-south", fallback: "ap-southeast" },
];

interface Arc {
  from: RegionKey;
  to: RegionKey;
  curve: THREE.QuadraticBezierCurve3;
  geo: THREE.TubeGeometry;
  mat: THREE.MeshBasicMaterial;
  packetMat: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  packets: THREE.Mesh[];
  progress: { p: number };
  speed: number;
  offset: number;
}

function toVec(lat: number, lon: number, r = R) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function arcCurve(a: THREE.Vector3, b: THREE.Vector3) {
  const lift = R + 0.16 + a.distanceTo(b) * 0.4;
  const ctrl = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(lift);
  return new THREE.QuadraticBezierCurve3(a.clone().multiplyScalar(1.004), ctrl, b.clone().multiplyScalar(1.004));
}

function dotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.55, "rgba(255,255,255,0.85)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Abstract landmass field so the dot sphere reads as a planet without shipping map data. */
function landness(p: THREE.Vector3) {
  return Math.sin(p.x * 3.1 + 1.3) * Math.cos(p.y * 2.6 - 0.4) + Math.sin(p.z * 2.2 + 0.7) * 0.8 + Math.sin(p.x * p.y * 5) * 0.35 + Math.cos(p.z * 4.1 - p.x) * 0.25;
}

/**
 * The home-page hero: a dot-matrix globe with live traffic arcs between regions.
 * Every few seconds a region fails, its routes go dark, traffic reroutes, and it recovers.
 * Renders a single still frame when reduced motion is requested; pauses when off screen.
 */
export function GlobeScene({ onEvent, className = "" }: { onEvent?: (e: GlobeEvent) => void; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = prefersReducedMotion();
    const small = window.matchMedia("(max-width: 767px)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      mount.dataset.fallback = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 6.4);

    const world = new THREE.Group();
    world.rotation.set(0.32, 0, -0.12);
    scene.add(world);
    const globe = new THREE.Group();
    globe.rotation.y = -1.2;
    world.add(globe);

    const disposables: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // Opaque core hides the dots on the far side.
    globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.985, 64, 64)), keep(new THREE.MeshBasicMaterial({ color: 0x090a13 }))));

    // Dot-matrix surface: brighter "land" dots over a dim "sea" grid.
    const count = small ? 2200 : 4200;
    const landPts: number[] = [];
    const seaPts: number[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      v.set(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r);
      (landness(v) > 0.35 ? landPts : seaPts).push(v.x * R, v.y * R, v.z * R);
    }
    const dotTex = keep(dotTexture());
    const dotsMats = [
      { pts: seaPts, color: "#2b2f55", size: small ? 0.07 : 0.06, blending: THREE.NormalBlending },
      { pts: landPts, color: "#b2a3ff", size: small ? 0.095 : 0.085, blending: THREE.AdditiveBlending },
    ].map(({ pts, color, size, blending }) => {
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const mat = keep(new THREE.PointsMaterial({ size, color, map: dotTex, transparent: true, depthWrite: false, alphaTest: 0.04, blending }));
      globe.add(new THREE.Points(geo, mat));
      return mat;
    });

    // Fresnel atmosphere.
    const atmosphere = new THREE.Mesh(
      keep(new THREE.SphereGeometry(R * 1.16, 64, 64)),
      keep(
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color("#6c4bff") } },
          vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform vec3 uColor; varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.8) * 0.85; gl_FragColor = vec4(uColor * i, i); }",
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    world.add(atmosphere);

    // Region markers with pulsing halos.
    const markerGeo = keep(new THREE.SphereGeometry(0.03, 16, 16));
    const haloGeo = keep(new THREE.RingGeometry(0.045, 0.06, 40));
    const zAxis = new THREE.Vector3(0, 0, 1);
    const regions = new Map<RegionKey, { pos: THREE.Vector3; mat: THREE.MeshBasicMaterial; halo: THREE.Mesh; haloMat: THREE.MeshBasicMaterial }>();
    for (const r of REGIONS) {
      const pos = toVec(r.lat, r.lon);
      const mat = keep(new THREE.MeshBasicMaterial({ color: MINT.clone() }));
      const marker = new THREE.Mesh(markerGeo, mat);
      marker.position.copy(pos).multiplyScalar(1.008);
      globe.add(marker);
      const haloMat = keep(new THREE.MeshBasicMaterial({ color: MINT.clone(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(pos).multiplyScalar(1.012);
      halo.quaternion.setFromUnitVectors(zAxis, pos.clone().normalize());
      globe.add(halo);
      regions.set(r.key, { pos, mat, halo, haloMat });
    }

    // Traffic arcs.
    const packetGeo = keep(new THREE.SphereGeometry(0.018, 10, 10));
    const arcs = new Set<Arc>();
    const setRange = (arc: Arc) => arc.geo.setDrawRange(0, Math.floor((arc.progress.p * arc.geo.index!.count) / 6) * 6);
    const makeArc = (from: RegionKey, to: RegionKey, color: THREE.Color, opacity: number): Arc => {
      const curve = arcCurve(regions.get(from)!.pos, regions.get(to)!.pos);
      const geo = new THREE.TubeGeometry(curve, 96, 0.006, 6, false);
      const mat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
      const packetMat = new THREE.MeshBasicMaterial({ color: MINT.clone(), transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      globe.add(mesh);
      const packets = [0, 0.5].map(() => {
        const p = new THREE.Mesh(packetGeo, packetMat);
        globe.add(p);
        return p;
      });
      const arc: Arc = { from, to, curve, geo, mat, packetMat, mesh, packets, progress: { p: 0 }, speed: 0.16 + Math.random() * 0.1, offset: Math.random() };
      setRange(arc);
      arcs.add(arc);
      return arc;
    };
    const disposeArc = (arc: Arc) => {
      globe.remove(arc.mesh, ...arc.packets);
      arc.geo.dispose();
      arc.mat.dispose();
      arc.packetMat.dispose();
      arcs.delete(arc);
    };
    const placePackets = (arc: Arc, t: number) => {
      arc.packets.forEach((p, i) => p.position.copy(arc.curve.getPoint((t * arc.speed + arc.offset + i * 0.5) % 1)));
    };
    const routes = ROUTES.map(([a, b]) => makeArc(a, b, ARC_COLOR, ARC_OPACITY));

    // Framing.
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 1 ? 6.4 / (w / h) : 6.4;
      camera.updateProjectionMatrix();
      if (reduced || !running) renderer.render(scene, camera);
    };

    // Animation.
    const ctx = gsap.context(() => {}, mount);
    let running = false;
    let disposed = false;
    const clock = new THREE.Clock();
    const tilt = { x: 0, y: 0 };

    const render = () => {
      const t = clock.getElapsedTime();
      globe.rotation.y = -1.2 + t * 0.055;
      world.rotation.x = 0.32 + tilt.x;
      world.rotation.y = tilt.y;
      arcs.forEach((arc) => placePackets(arc, t));
      renderer.render(scene, camera);
    };
    const start = () => {
      if (running || reduced || disposed) return;
      running = true;
      gsap.ticker.add(render);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      gsap.ticker.remove(render);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    if (reduced) {
      routes.forEach((arc) => {
        arc.progress.p = 1;
        setRange(arc);
        arc.packetMat.opacity = 1;
        placePackets(arc, 2);
      });
      renderer.render(scene, camera);
      return () => {
        ro.disconnect();
        routes.forEach(disposeArc);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    const drawArc = (arc: Arc, duration: number, delay = 0) =>
      ctx.add(() => {
        gsap.to(arc.progress, {
          p: 1,
          duration,
          delay,
          ease: "power2.inOut",
          onUpdate: () => setRange(arc),
          onComplete: () => {
            gsap.to(arc.packetMat, { opacity: 1, duration: 0.4 });
          },
        });
      });

    let drillIndex = 0;
    const scheduleDrill = (delay: number) => ctx.add(() => gsap.delayedCall(delay, runDrill));
    const runDrill = () =>
      ctx.add(() => {
        if (disposed) return;
        const { victim, fallback } = DRILLS[drillIndex++ % DRILLS.length];
        const down = regions.get(victim)!;
        const affected = routes.filter((a) => a.from === victim || a.to === victim);
        const neighbours = [...new Set(affected.map((a) => (a.from === victim ? a.to : a.from)))].filter((k) => k !== fallback);
        const reroutes = neighbours.map((n) => makeArc(n, fallback, MINT, 0.9));
        gsap
          .timeline({
            onComplete: () => {
              reroutes.forEach(disposeArc);
              scheduleDrill(4.5);
            },
          })
          .call(() => onEventRef.current?.({ type: "failure", region: victim, fallback, at: Date.now() }))
          .to([down.mat.color, down.haloMat.color], { r: RED.r, g: RED.g, b: RED.b, duration: 0.3 })
          .to(
            affected.map((a) => a.mat),
            { opacity: 0.06, duration: 0.5 },
            "<",
          )
          .to(
            affected.map((a) => a.packetMat),
            { opacity: 0, duration: 0.3 },
            "<",
          )
          .call(() => reroutes.forEach((a) => drawArc(a, 1.1)), [], "+=0.35")
          .to({}, { duration: 3.8 })
          .call(() => onEventRef.current?.({ type: "recover", region: victim, fallback, at: Date.now() }))
          .to([down.mat.color, down.haloMat.color], { r: MINT.r, g: MINT.g, b: MINT.b, duration: 0.6 })
          .to(
            affected.map((a) => a.mat),
            { opacity: ARC_OPACITY, duration: 0.6 },
            "<",
          )
          .to(
            affected.map((a) => a.packetMat),
            { opacity: 1, duration: 0.4 },
            "<",
          )
          .to(
            reroutes.flatMap((a) => [a.mat, a.packetMat]),
            { opacity: 0, duration: 0.6 },
            "<",
          );
      });

    ctx.add(() => {
      gsap.from(world.scale, { x: 0.84, y: 0.84, z: 0.84, duration: 2, ease: "expo.out" });
      gsap.from(dotsMats, { opacity: 0, duration: 1.4, ease: "power2.out" });
      routes.forEach((arc, i) => drawArc(arc, 1.4, 0.7 + i * 0.16));
      regions.forEach(({ halo, haloMat }, _key) => {
        const delay = Math.random() * 1.6;
        gsap.fromTo(halo.scale, { x: 1, y: 1, z: 1 }, { x: 2.2, y: 2.2, z: 2.2, duration: 1.8, delay, repeat: -1, ease: "power2.out" });
        gsap.fromTo(haloMat, { opacity: 0.6 }, { opacity: 0, duration: 1.8, delay, repeat: -1, ease: "power2.out" });
      });
    });
    scheduleDrill(3.6);

    const tiltX = gsap.quickTo(tilt, "x", { duration: 1.2, ease: "power3.out" });
    const tiltY = gsap.quickTo(tilt, "y", { duration: 1.2, ease: "power3.out" });
    const onPointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      tiltY(((e.clientX - rect.left) / rect.width - 0.5) * 0.5);
      tiltX(((e.clientY - rect.top) / rect.height - 0.5) * 0.3);
    };
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()), { threshold: 0.05 });
    io.observe(mount);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (finePointer) window.removeEventListener("pointermove", onPointer);
      ctx.revert();
      [...arcs].forEach(disposeArc);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}
