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
  }, [blocks, queue, status, aim, message]);

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
    updateAimFromDrag({ x: clampedX, y: clampedY });
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    evt.preventDefault();
    const p = getPointer(evt);
    const originY = canvasSize.height - 20;
    const clampedX = clamp(p.x, 12, canvasSize.width - 12);
    const clampedY = clamp(p.y, originY - 160, originY - 20);
    setOriginX(clampedX);
    updateAimFromDrag({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!queue.length || status === 'firing') return;
    const nextProjectile = queue[0];
    setQueue((prev) => prev.slice(1));
    startShot(nextProjectile);
  };

  const updateAimFromDrag = (p: Pointer) => {
    const originY = canvasSize.height - 20;
    const dx = p.x - originX;
    const dy = p.y - originY;
    // Clamp to upward-ish angles to avoid shooting downward.
    const raw = Math.atan2(dy, dx);
    const clamped = clamp(raw, -Math.PI + 0.2, -0.2);
    setAim(clamped);
  };

  const startShot = (proj: ProjectileSpec) => {
    setStatus('firing');
    setMessage('');
    const speed = 0.35; // px per ms
    projectileRef.current = {
      x: originX,
      y: canvasSize.height - 24,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      radius: 8,
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
      next.vy *= -1;
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
    ctx.strokeStyle = '#8aa1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + Math.cos(aim) * 60, originY + Math.sin(aim) * 60);
    ctx.stroke();

    // 발사 원점 표시
    ctx.fillStyle = '#6b7cff';
    ctx.beginPath();
    ctx.arc(originX, originY, 6, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <Page className="bg-[#0b1021] text-white">
      <Page.Header className="bg-[#0b1021] text-white">
        <div className="flex items-center justify-between">
          <div className="text-sm uppercase tracking-[0.12em] text-[#8aa1ff]">
            World Chain Mini App
          </div>
          <div className="rounded-full border border-[#243060] px-3 py-1 text-xs text-[#cfd8ff]">
            Queue Breaker
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs text-[#8aa1ff]">Stage</div>
            <div className="text-2xl font-semibold leading-tight">Stage {stage}</div>
          </div>
          <div className="text-right text-xs text-[#8aa1ff]">
            Use the FIFO queue; swap before firing.
          </div>
        </div>
        {message && <div className="mt-2 text-sm text-[#f2c94c]">{message}</div>}
      </Page.Header>

      <Page.Main className="flex flex-col gap-4">
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-[#1c2340] bg-gradient-to-b from-[#141c37] to-[#0b1021] shadow-lg">
          <div className="absolute left-3 top-3 rounded-full bg-[#1f294b] px-3 py-1 text-xs text-[#cfd8ff]">
            Canvas
          </div>
          <div className="flex h-[480px] items-center justify-center">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="h-[440px] w-[340px] rounded-lg border border-[#1f294b] bg-[#0f1428]"
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

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
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
