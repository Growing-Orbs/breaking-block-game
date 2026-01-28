'use client';

import { useEffect, useRef, useState } from 'react';

import { Page } from '@/components/PageLayout';
import {
  applyDamage,
  canvasSize,
  generateStage,
  hasWon,
} from '@/app/queueBreakerLogic';
import {
  Block,
  GameStatus,
  ProjectileInstance,
  ProjectileKind,
  ProjectileSpec,
} from '@/app/queueBreakerTypes';

type Pointer = { x: number; y: number };

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const projectileRef = useRef<ProjectileInstance | null>(null);
  const blocksRef = useRef<Block[]>([]);
  const [stage, setStage] = useState<number>(1);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [queue, setQueue] = useState<ProjectileSpec[]>([]);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [aim, setAim] = useState<number>(-Math.PI / 2);
  const [message, setMessage] = useState<string>('');
  const [originX, setOriginX] = useState<number>(canvasSize.width / 2);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [trajectory, setTrajectory] = useState<Pointer[]>([]);

  useEffect(() => {
    const saved = getSavedStage();
    const initial = generateStage(saved ?? 1);
    setStage(initial.stage);
    setBlocks(initial.blocks);
    setQueue(initial.queue);
    setStatus(initial.status);
  }, []);

  useEffect(() => {
    blocksRef.current = blocks;
    renderFrame();
  }, [blocks, queue, status, aim, message, originX, isDragging, trajectory]);

  useEffect(() => {
    saveStage(stage);
  }, [stage]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getPointer = (evt: React.PointerEvent<HTMLCanvasElement>): Pointer => {
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    return { x, y };
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (status === 'firing') return;
    evt.preventDefault();
    const p = getPointer(evt);
    const originY = canvasSize.height - 20;
    const clampedX = clamp(p.x, 12, canvasSize.width - 12);
    const clampedY = clamp(p.y, originY - 160, originY - 20);
    setOriginX(clampedX);
    setIsDragging(true);
    updateAimFromDrag({ x: clampedX, y: clampedY }, clampedX);
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    evt.preventDefault();
    const p = getPointer(evt);
    const originY = canvasSize.height - 20;
    const clampedX = clamp(p.x, 12, canvasSize.width - 12);
    const clampedY = clamp(p.y, originY - 160, originY - 20);
    updateAimFromDrag({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setTrajectory([]);
    if (!queue.length || status === 'firing') return;
    const nextProjectile = queue[0];
    setQueue((prev) => prev.slice(1));
    startShot(nextProjectile);
  };

  const handlePointerLeave = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setTrajectory([]);
  };

  const updateAimFromDrag = (p: Pointer, nextOriginX = originX) => {
    const originY = canvasSize.height - 20;
    const dx = p.x - nextOriginX;
    const dy = p.y - originY;
    // Clamp to upward-ish angles to avoid shooting downward.
    const raw = Math.atan2(dy, dx);
    const clamped = clamp(raw, -Math.PI + 0.2, -0.2);
    setAim(clamped);
    setTrajectory(simulateTrajectory(clamped, nextOriginX));
  };

  const startShot = (proj: ProjectileSpec) => {
    setStatus('firing');
    setMessage('');
    const speed = 0.35; // px per ms
    const radius = 8;
    const originY = canvasSize.height - 20;
    projectileRef.current = {
      x: originX,
      y: originY - radius - 1, // sit just above ground line
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      radius,
      damage: proj.damage,
      bounces: 0,
      ttlMs: 7000,
    };
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(step);
  };

  const endShot = () => {
    projectileRef.current = null;
    lastTsRef.current = null;
    rafRef.current = null;
    const won = hasWon(blocksRef.current);
    if (won) {
      setStatus('won');
      setMessage('Stage cleared! Loading next...');
      setTimeout(() => {
        const nextStage = stage + 1;
        const snapshot = generateStage(nextStage);
        setStage(nextStage);
        setBlocks(snapshot.blocks);
        setQueue(snapshot.queue);
        setStatus('idle');
        setMessage('');
      }, 700);
      return;
    }
    if (!queue.length) {
      setStatus('lost');
      setMessage('Out of projectiles. Retry the stage.');
    } else {
      setStatus('idle');
    }
  };

  const step = (ts: number) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    if (!projectileRef.current) return;
    const prevTs = lastTsRef.current ?? ts;
    const dt = ts - prevTs;
    lastTsRef.current = ts;
    const p = projectileRef.current;
    let next = { ...p, ttlMs: p.ttlMs - dt };
    next.x += next.vx * dt;
    next.y += next.vy * dt;

    const radius = next.radius;
    if (next.x - radius < 0 || next.x + radius > canvasSize.width) {
      next.vx *= -1;
      next.x = clamp(next.x, radius, canvasSize.width - radius);
      next.bounces += 1;
    }
    if (next.y - radius < 0) {
      next.vy *= -1;
      next.y = radius;
      next.bounces += 1;
    }

    const hit = blocksRef.current.find((b) => circleRect(next, b));
    if (hit) {
      setBlocks((prev) => applyDamage(prev, hit.id, next.damage));
      next = reflectFromBlock(next, hit);
      next.bounces += 1;
    }

    projectileRef.current = next;
    renderFrame();

    const expired =
      next.ttlMs <= 0 || next.bounces > 10 || next.y - radius > canvasSize.height;
    if (expired) {
      endShot();
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  const renderFrame = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    const grd = ctx.createLinearGradient(0, 0, 0, canvasSize.height);
    grd.addColorStop(0, '#141c37');
    grd.addColorStop(1, '#0b1021');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    blocksRef.current.forEach((b) => {
      const hpRatio = b.hp / b.maxHp;
      ctx.fillStyle = b.isBoss ? '#f36c6c' : '#3f6bff';
      ctx.globalAlpha = 0.9;
      // 이미지 교체 시: 여기서 fillRect 대신 drawImage 등으로 교체하면 됩니다.
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b1021';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${b.hp}`, b.x + b.width / 2, b.y + b.height / 2 + 6);
      if (b.isBoss) {
        drawBossBar(ctx, b, hpRatio);
      }
    });

    const proj = projectileRef.current;
    if (proj) {
      ctx.beginPath();
      ctx.fillStyle = '#f2c94c';
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const originY = canvasSize.height - 20;
    // Ground line at launch height
    ctx.strokeStyle = '#243060';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(canvasSize.width, originY);
    ctx.stroke();

    if (isDragging) {
      ctx.fillStyle = '#8aa1ff';
      trajectory.forEach((point, idx) => {
        const alpha = 1 - idx / trajectory.length;
        ctx.globalAlpha = clamp(alpha, 0.2, 1);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // 발사 원점 표시
    ctx.fillStyle = '#6b7cff';
    ctx.beginPath();
    ctx.arc(originX, originY, 6, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <Page className="bg-[#0b1021] text-white">
      <Page.Header className="bg-[#0b1021] text-white">
        <div className="flex flex-col gap-2">
          <div className="flex justify-end text-xs font-semibold text-[#f2c94c]">
            Next Orb!
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="text-xs text-[#8aa1ff]">Stage</div>
              <div className="text-2xl font-semibold leading-tight">Stage {stage}</div>
            </div>
            <div className="flex items-center gap-2">
              {queue[0] ? (
                <div className="flex items-center gap-2 rounded-xl border border-[#1f294b] bg-[#0f1428] px-3 py-2 shadow-sm">
                  <div
                    className="h-8 w-8 rounded-full border border-[#cfd8ff]/40"
                    style={{ background: orbPaint(queue[0].kind) }}
                  />
                  <div className="text-[11px] leading-tight text-[#cfd8ff]">
                    <div className="uppercase tracking-wide text-[#8aa1ff]">
                      {queue[0].kind}
                    </div>
                    <div className="text-[#f2c94c]">DMG {queue[0].damage}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[#1f294b] bg-[#0f1428] px-3 py-2 text-[11px] text-[#cfd8ff]">
                  No orbs remaining
                </div>
              )}
            </div>
          </div>
        </div>
        {message && <div className="mt-2 text-sm text-[#f2c94c]">{message}</div>}
        <div className="mt-4 h-[1.44px] w-full bg-[#1f294b]" />
      </Page.Header>

      <Page.Main className="flex flex-col gap-4">
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-b from-[#141c37] to-[#0b1021] shadow-lg">
          <div className="flex h-[480px] items-center justify-center">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={handlePointerLeave}
              className="h-[440px] w-[340px] rounded-lg bg-[#0f1428]"
            />
          </div>
        </div>

        {/* Note: 아래 UI는 슬링샷 조작으로 대체되어 제거되었습니다. */}
      </Page.Main>
    </Page>
  );
}

function circleRect(p: ProjectileInstance, b: Block) {
  const cx = clamp(p.x, b.x, b.x + b.width);
  const cy = clamp(p.y, b.y, b.y + b.height);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy <= p.radius * p.radius;
}

function reflectFromBlock(p: ProjectileInstance, b: Block): ProjectileInstance {
  const nearestX = clamp(p.x, b.x, b.x + b.width);
  const nearestY = clamp(p.y, b.y, b.y + b.height);
  const dx = p.x - nearestX;
  const dy = p.y - nearestY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const sign = (v: number, fallback: number) => (v === 0 ? fallback : Math.sign(v));

  // Decide whether the collision is primarily horizontal or vertical.
  if (absDx > absDy) {
    // Hit on left/right face.
    const dir = sign(dx, Math.sign(p.vx) || 1);
    return {
      ...p,
      vx: -p.vx,
      x: dir > 0 ? b.x + b.width + p.radius : b.x - p.radius,
    };
  }
  if (absDy > absDx) {
    // Hit on top/bottom face.
    const dir = sign(dy, Math.sign(p.vy) || 1);
    return {
      ...p,
      vy: -p.vy,
      y: dir > 0 ? b.y + b.height + p.radius : b.y - p.radius,
    };
  }

  // Corner case: flip both.
  return {
    ...p,
    vx: -p.vx,
    vy: -p.vy,
  };
}

function simulateTrajectory(angle: number, startX: number): Pointer[] {
  const speed = 0.35;
  const radius = 8;
  const dt = 16; // ms per step for preview sampling
  let x = startX;
  let y = canvasSize.height - 20 - radius - 1;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const points: Pointer[] = [];

  for (let i = 0; i < 80; i += 1) {
    x += vx * dt;
    y += vy * dt;

    if (x - radius < 0 || x + radius > canvasSize.width) break;
    if (y - radius < 0) break;

    points.push({ x, y });
    if (y - radius > canvasSize.height) break;
  }

  return points;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function orbPaint(kind: ProjectileKind): string {
  switch (kind) {
    case 'bomb':
      return 'radial-gradient(circle at 30% 30%, #ffefa0, #f36c6c 55%, #b53d3d)';
    case 'splitter':
      return 'radial-gradient(circle at 30% 30%, #b8f3ff, #6b7cff 55%, #2b3a7a)';
    case 'normal':
    default:
      return 'radial-gradient(circle at 30% 30%, #f7fbff, #8aa1ff 55%, #3a4b99)';
  }
}

function drawBossBar(ctx: CanvasRenderingContext2D, boss: Block, ratio: number) {
  const barW = boss.width;
  const barH = 10;
  const x = boss.x;
  const y = boss.y - 14;
  ctx.fillStyle = '#1f294b';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#f36c6c';
  ctx.fillRect(x, y, barW * ratio, barH);
}

function saveStage(stage: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('qb-stage', JSON.stringify(stage));
  } catch {
    // ignore storage errors
  }
}

function getSavedStage(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('qb-stage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
