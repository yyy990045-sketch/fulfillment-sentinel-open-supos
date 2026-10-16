import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";
import { Button } from "../../../components/ui/button.js";

export type SpatialNode = { id: string; x: number; y: number; kind: "order" | "factory" | "quality" | "warehouse" | "layer" | "model" | "stage" | "app"; risk?: boolean; waiting?: boolean; scale?: number };
export type SpatialLink = { from: string; to: string; risk?: boolean; broken?: boolean; stopped?: boolean; emphasis?: boolean; via?: { x: number; y: number }[] };
export type Playback = { key: string; route: string[]; duration?: number };
const green = "#205947", risk = "#ac5b3d";
// UI-R10.1：实体块基色从饱和深绿改为低饱和工业绿灰 —— 去掉"塑料积木"观感，保留设备涂装的重量感
const industrialGreen = "#5a7a6c";
export function anchor(x: number, y: number) { return { left: `${x / 1320 * 100}%`, top: `${y / 600 * 100}%` }; }

/* ----------------------------------------------------------------------------
 * UI-R10.1 · 工业材质系统（去玩具化）
 * 目标从「low-poly miniature / game asset」拉回「industrial digital representation」：
 *   - 深绿实体块饱和度下降（原 #205947 偏饱和 → 现在的低饱和工业绿灰）
 *   - 工厂屋顶改用与主体同族的哑光金属绿，不再用厚重深绿块
 *   - 阴影更短、更软：靠 ShadowMaterial 低透明度 + PCF 软边，而不是硬投影
 * 保留 metal / matte / panel / tread / glass 五类，但整体向"设备涂装"而不是"塑料积木"靠。
 * --------------------------------------------------------------------------*/
function makeMaterials(node: SpatialNode) {
  const tone = node.risk ? risk : node.waiting ? "#9fab9d" : industrialGreen;
  // UI-R10.1：进一步去"塑料感"——降金属度、拉高粗糙度，让实体块呈现哑光设备涂装
  const metal = new THREE.MeshStandardMaterial({ color: tone, roughness: .72, metalness: .06 });
  const matte = new THREE.MeshStandardMaterial({ color: node.risk ? "#cfa78f" : node.waiting ? "#c6cdc2" : "#a8bfb0", roughness: .97, metalness: 0 });
  const panel = new THREE.MeshStandardMaterial({ color: node.waiting ? "#e9ebe2" : "#eef1e7", roughness: .94, metalness: 0 });
  // 防滑纹/线脚：原 #1b4a3b 过深过饱和，降为工业绿灰，避免"深绿厚块"
  const tread = new THREE.MeshStandardMaterial({ color: node.risk ? "#9c5f42" : "#647a70", roughness: .98, metalness: 0 });
  // 玻璃：降低自发光强度，避免"发光塑料"观感，仅保留设备指示灯的内透感
  const glass = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .42, metalness: .02, emissive: new THREE.Color(node.risk ? "#5c2410" : "#16402d"), emissiveIntensity: .26 });
  return { metal, matte, panel, tread, glass, tone };
}
function object(node: SpatialNode) {
  const group = new THREE.Group();
  const { metal: dark, matte: light, panel: white, tread, glass } = makeMaterials(node);
  function box(w: number, h: number, d: number, x: number, y: number, z: number, mat = light) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  // 防滑踏板纹：沿面宽等距排布，给工业对象「可丈量的尺度感」
  function treads(count: number, w: number, h: number, d: number, y: number, z: number, span: number) {
    for (let i = 0; i < count; i++) box(w, h, d, -span / 2 + (span / (count - 1 || 1)) * i, y, z, tread);
  }
  if (node.kind === "order") {
    // 订单文件：夹板 + 装订脊 + 条款行 + 签章
    box(63, 78, 6, -6, -3, 0, light); box(63, 78, 5, 0, 0, 8, white);
    box(7, 78, 7, -30, -3, 4, dark);
    for (let i = 0; i < 4; i++) box(i === 0 ? 26 : 40, 3, 1, i === 0 ? -7 : 0, 20 - i * 12, 12, dark);
    box(14, 9, 2, 18, -25, 13, dark);
  } else if (node.kind === "factory") {
    // 厂房：主体 + 双烟囱 + 天窗 + 锯齿屋顶
    // UI-R10.1：屋顶从「厚重深绿块」改为与主体同族哑光面 + 薄屋脊线脚，去掉玩具感
    box(91, 43, 42, 0, -12, 0); box(13, 70, 14, -32, 29, -10, dark); box(14, 54, 14, -9, 20, -10);
    treads(3, 11, 2, 14, 65, -10, 0);
    for (let i = 0; i < 4; i++) box(12, 12, 2, -31 + i * 20, -10, 23, white);
    for (let i = 0; i < 3; i++) { const roof = box(30, 6, 45, -29 + i * 29, 15, 0, light); roof.rotation.z = -.18; }
    box(90, 2, 44, 0, 18, 0, dark);
  } else if (node.kind === "warehouse") {
    // 仓库：主库体 + 卷帘门 + 压顶 + 一组堆垛箱
    box(95, 48, 49, 0, -6, 0, white); box(34, 33, 3, 0, -13, 26, dark);
    treads(6, 30, 2, 3, -2, 26, 30);
    const roof = box(108, 8, 59, 0, 23, 0, light); roof.rotation.z = -.05;
    box(19, 19, 19, 49, -22, 27); box(19, 19, 19, 27, -22, 35); box(19, 19, 19, 48, -2, 27, dark);
  } else if (node.kind === "quality") {
    // 质检：检台 + 立柱 + 六边形放行徽章 + 放行勾 / 等待省略号
    box(84, 9, 54, 0, -28, 0, white); box(11, 40, 12, -29, -10, -12); box(11, 40, 12, 29, -10, -12);
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 9, 6), light); badge.rotation.x = Math.PI / 2; badge.position.set(0, 12, 8); badge.castShadow = true; badge.receiveShadow = true; group.add(badge);
    if (node.waiting) for (let i = 0; i < 3; i++) box(5, 5, 3, -12 + i * 12, 10, 16, dark);
    else { const tick1 = box(6, 20, 3, -7, 7, 16, dark); tick1.rotation.z = .65; const tick2 = box(6, 31, 3, 7, 11, 16, dark); tick2.rotation.z = -.65; }
  } else if (node.kind === "layer") {
    // 平台层：机架 + 铭牌带 + 各自的功能件
    box(185, 15, 88, 0, 0, 0, white); box(166, 3, 71, 0, 10, 0, light);
    treads(4, 8, 2, 88, 8, 0, 140);
    if (node.id === "EMQX") { box(8, 47, 8, 0, 31, 0, dark); for (let i = 0; i < 3; i++) { const arc = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 9, 1.5, 6, 32, Math.PI), dark); arc.position.set(0, 32, 0); arc.castShadow = true; group.add(arc); } }
    else if (node.id === "Node-RED") { for (let i = 0; i < 3; i++) box(23, 14, 22, -46 + i * 46, 22, 0, dark); box(94, 2, 3, 0, 18, 0, dark); }
    else { for (let i = 0; i < 3; i++) { const disk = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 9, 32), i === 1 ? light : dark); disk.position.set(0, 18 + i * 12, 0); disk.castShadow = true; disk.receiveShadow = true; group.add(disk); } }
  } else if (node.kind === "app") {
    // 工业 APP：机柜面板 + 三条状态灯带
    box(71, 75, 15, 0, 0, 0, white);
    box(4, 75, 16, -35, 0, 0, dark);
    for (let i = 0; i < 3; i++) box(9, 21 + i * 13, 3, -19 + i * 19, -5 + i * 6, 10, dark);
  } else if (node.kind === "model") {
    // 语义模型：建模台 + 顶板 + 两条接口槽
    box(74, 38, 52, 0, 0, 0, light); box(75, 5, 53, 0, 21, 0, white); box(32, 3, 3, 0, 2, 28, dark); box(32, 3, 3, 0, -9, 28, dark);
    treads(4, 8, 2, 52, -16, 0, 52);
  } else {
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 9, 32), white); cylinder.castShadow = true; cylinder.receiveShadow = true; group.add(cylinder);
    if (node.id.endsWith("-0")) { for (let i = 0; i < 3; i++) box(23, 3, 29, i * 2 - 2, 9 + i * 5, 0, i === 2 ? dark : light); }
    else if (node.id.endsWith("-1")) { for (let i = 0; i < 3; i++) box(9, 12 + i * 7, 12, -16 + i * 16, 11 + i * 3, 0, dark); }
    else { box(25, 11, 25, 0, 12, 0, light); box(19, 7, 19, 0, 21, 0, dark); }
  }
  group.rotation.set(.38, -.52, 0); group.scale.setScalar(node.scale ?? 1); group.position.set(node.x, 600 - node.y, 0);
  void glass;
  return group;
}

export function SpatialScene({ nodes, links, playback, onPlayed, onStage, children, className = "" }: { nodes: SpatialNode[]; links: SpatialLink[]; playback?: Playback | null; onPlayed?: () => void; onStage?: (id: string) => void; children: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const reached = useRef(onStage); reached.current = onStage;
  const completed = useRef(onPlayed); completed.current = onPlayed;
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const reduced = useReducedMotion();
  const signature = JSON.stringify({ nodes, links, playback });
  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFailure(true); return; }
    setFailure(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
    renderer.setClearColor(0x000000, 0); renderer.domElement.setAttribute("aria-hidden", "true"); host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-660, 660, 300, -300, .1, 2600); camera.position.set(660, 300, 1000); camera.lookAt(660, 300, 0);
    // 工业三光：低强度环境提底 + 主光定阴影方向 + 冷调补光分离纵深层次。无 glow、无 HUD、无环境贴图。
    // UI-R10.1 去玩具化：主光抬高（980→1460）+ 前移，阴影长度缩短约 30%；
    // 阴影改用低透明度 ShadowMaterial + PCF 软边，避免"塑料积木硬投影"。
    // UI-R10.1：主光再抬高 + 拉远，阴影长度比上一版再降约 30%；
    // radius 提高 → 软边更明显；ShadowMaterial 透明度再降 → 阴影更淡。
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa69c, 1.32));
    const key = new THREE.DirectionalLight(0xfff8ee, 1.58); key.position.set(210, 2050, 400); key.target.position.set(660, 300, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -1100; key.shadow.camera.right = 1100; key.shadow.camera.top = 1100; key.shadow.camera.bottom = -1100; key.shadow.camera.far = 3200; key.shadow.normalBias = .7; key.shadow.bias = -.0004; key.shadow.radius = 5.2; scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xdce8dd, .58); fill.position.set(-560, 420, 520); fill.target.position.set(660, 300, 0); scene.add(fill, fill.target);
    const rim = new THREE.DirectionalLight(0xeef2e4, .40); rim.position.set(1400, 260, 180); rim.target.position.set(660, 300, 0); scene.add(rim, rim.target);
    // 阴影浓度从 .072 再降到 .052 —— 只留"站位感"，不留"卡通投影"
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2200, 1400), new THREE.ShadowMaterial({ opacity: .052 })); floor.position.set(660, 300, -82); floor.receiveShadow = true; scene.add(floor);
    const groups = new Map<string, THREE.Group>(); nodes.forEach(node => { const group = object(node); groups.set(node.id, group); scene.add(group); });
    const map = new Map(nodes.map(node => [node.id, node]));
    for (const link of links) {
      const a = map.get(link.from)!, b = map.get(link.to)!;
      const start = new THREE.Vector3(a.x + 50, 600 - a.y, -27), end = new THREE.Vector3(b.x - 50, 600 - b.y, -27);
      if (Math.abs(a.x - b.x) < 70) { start.set(a.x, 600 - a.y - 34, -27); end.set(b.x, 600 - b.y + 34, -27); }
      const curve = link.via ? new THREE.CatmullRomCurve3([start, ...link.via.map(point => new THREE.Vector3(point.x, 600 - point.y, -27)), end]) : new THREE.CubicBezierCurve3(start, start.clone().lerp(end, .35).add(new THREE.Vector3(0, 12, 0)), start.clone().lerp(end, .65), end);
      const material = new THREE.MeshBasicMaterial({ color: link.risk || link.broken ? risk : green, transparent: true, opacity: link.stopped ? .16 : link.risk ? .78 : link.emphasis ? .58 : .28 });
      const radius = link.stopped ? 1.1 : link.risk ? 2.8 : link.emphasis ? 2.4 : 1.7;
      if (link.broken || link.risk) {
        const ranges = link.broken ? [[0, .38], [.62, 1]] : [[0, .43], [.57, 1]];
        for (const [from, to] of ranges) { const points = Array.from({ length: 20 }, (_, i) => curve.getPoint(from! + (to! - from!) * i / 19)); scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 10, false), material)); }
      } else scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 44, radius, 10, false), material));
    }
    let frame = 0;
    const clock = performance.now(); const passed = new Set<string>();
    let pulse: THREE.Mesh | null = null;
    let curve: THREE.CurvePath<THREE.Vector3> | null = null;
    if (playback && !reduced) {
      const points = playback.route.map(id => { const p = map.get(id)!; return new THREE.Vector3(p.x, 600 - p.y, 35); });
      curve = new THREE.CurvePath<THREE.Vector3>();
      points.slice(1).forEach((end, i) => { const start = points[i]!; curve!.add(new THREE.CubicBezierCurve3(start, start.clone().lerp(end, .35).add(new THREE.Vector3(0, 12, 0)), start.clone().lerp(end, .65), end)); });
      pulse = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: green })); scene.add(pulse);
    }
    // HTML anchors use the fixed design plane. Compensate object geometry so
    // widening a desktop canvas changes spacing, not the shape of the objects.
    const aspectCorrection = () => (1320 / 600) * host.clientHeight / host.clientWidth;
    function size() {
      renderer.setSize(host.clientWidth, host.clientHeight);
      for (const node of nodes) { const group = groups.get(node.id)!; group.scale.set(node.scale ?? 1, node.scale ?? 1, node.scale ?? 1); group.scale.x *= aspectCorrection(); }
      if (pulse) pulse.scale.x = aspectCorrection();
      renderer.render(scene, camera);
    }
    const resize = new ResizeObserver(size); resize.observe(host);
    function animate(now: number) {
      const progress = Math.min(1, (now - clock) / (playback?.duration ?? 2000));
      if (pulse && curve) { if (curve.curves.length) pulse.position.copy(curve.getPoint(progress)); else { const node = map.get(playback!.route[0]!)!; pulse.position.set(node.x, 600 - node.y, 35); } for (const node of nodes) { const group = groups.get(node.id)!; const distance = Math.hypot(pulse.position.x - node.x, pulse.position.y - (600 - node.y)); if (distance < 28 && playback!.route.includes(node.id) && !passed.has(node.id)) { passed.add(node.id); reached.current?.(node.id); } group.scale.setScalar((node.scale ?? 1) * (1 + (playback!.route.includes(node.id) ? Math.max(0, 1 - distance / 65) * .07 : 0))); } }
      if (playback) for (const node of nodes) groups.get(node.id)!.scale.x *= aspectCorrection();
      renderer.render(scene, camera);
      if (progress < 1) frame = requestAnimationFrame(animate); else completed.current?.();
    }
    if (playback && !reduced) frame = requestAnimationFrame(animate);
    else { size(); if (playback) { playback.route.forEach(id => reached.current?.(id)); completed.current?.(); } }
    return () => { cancelAnimationFrame(frame); resize.disconnect(); scene.traverse(item => { if (item instanceof THREE.Mesh) { item.geometry.dispose(); const materials = Array.isArray(item.material) ? item.material : [item.material]; materials.forEach(material => material.dispose()); } }); renderer.dispose(); renderer.domElement.remove(); };
  // Rebuild only when scene data changes, never on a frame.
  }, [signature, reduced, retry]);
  return <div className={`spatial-scene ${className}`}><div ref={container} className="absolute inset-0" />{children}{failure && <div role="alert" className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-background p-3 text-sm text-risk">三维场景无法初始化，请检查浏览器图形加速。<Button variant="secondary" onClick={() => setRetry(value => value + 1)}>重试</Button></div>}</div>;
}
