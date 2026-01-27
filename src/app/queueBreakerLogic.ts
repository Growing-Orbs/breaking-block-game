import { Block, GameSnapshot, ProjectileSpec } from './queueBreakerTypes';

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 460;
const BLOCK_COLS = 4;
const BLOCK_ROWS = 4;
const BLOCK_PADDING = 8;
const BLOCK_WIDTH = (CANVAS_WIDTH - BLOCK_PADDING * (BLOCK_COLS + 1)) / BLOCK_COLS;
const BLOCK_HEIGHT = 48;

const baseQueue: ProjectileSpec[] = [
  { id: 'p-normal-1', kind: 'normal', damage: 1 },
  { id: 'p-bomb-1', kind: 'bomb', damage: 5 },
  { id: 'p-normal-2', kind: 'normal', damage: 1 },
  { id: 'p-split-1', kind: 'splitter', damage: 2 },
];

export const canvasSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

export function generateStage(stage: number): GameSnapshot {
  const isBoss = stage % 10 === 0;
  const blocks = isBoss ? generateBoss(stage) : generateGrid(stage);

  // 간단한 큐 증가 로직: 3스테이지마다 추가 발사체를 더해줌.
  const extra = Math.floor(stage / 3);
  const queue: ProjectileSpec[] = [
    ...baseQueue,
    ...Array.from({ length: extra }, (_, i) => ({
      id: `p-extra-${stage}-${i}`,
      kind: i % 2 === 0 ? 'normal' : 'splitter',
      damage: i % 2 === 0 ? 1 : 2,
    })),
  ];

  return {
    stage,
    blocks,
    queue,
    status: 'idle',
    bossHp: isBoss ? blocks[0]?.hp : undefined,
  };
}

function generateGrid(stage: number): Block[] {
  const difficultyBoost = Math.max(0, stage - 1);
  const blocks: Block[] = [];
  for (let row = 0; row < BLOCK_ROWS; row += 1) {
    for (let col = 0; col < BLOCK_COLS; col += 1) {
      const hp = 2 + row + Math.floor(difficultyBoost / 2);
      const x = BLOCK_PADDING + col * (BLOCK_WIDTH + BLOCK_PADDING);
      const y = BLOCK_PADDING + row * (BLOCK_HEIGHT + BLOCK_PADDING);
      blocks.push({
        id: `b-${stage}-${row}-${col}`,
        x,
        y,
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        hp,
        maxHp: hp,
      });
    }
  }
  return blocks;
}

function generateBoss(stage: number): Block[] {
  const hp = 50 + stage * 5;
  const width = CANVAS_WIDTH * 0.7;
  const height = 80;
  return [
    {
      id: `boss-${stage}`,
      x: (CANVAS_WIDTH - width) / 2,
      y: 40,
      width,
      height,
      hp,
      maxHp: hp,
      isBoss: true,
    },
  ];
}

export function swapFront(queue: ProjectileSpec[], idx: number): ProjectileSpec[] {
  if (idx <= 0 || idx >= queue.length) return queue;
  const copy = [...queue];
  const temp = copy[0];
  copy[0] = copy[idx];
  copy[idx] = temp;
  return copy;
}

export function applyDamage(blocks: Block[], blockId: string, damage: number): Block[] {
  return blocks
    .map((b) => {
      if (b.id !== blockId) return b;
      const hp = Math.max(0, b.hp - damage);
      return { ...b, hp };
    })
    .filter((b) => b.hp > 0);
}

export function hasWon(blocks: Block[]): boolean {
  return blocks.length === 0;
}
