export type ProjectileKind = 'normal' | 'bomb' | 'splitter';

export type ProjectileSpec = {
  id: string;
  kind: ProjectileKind;
  damage: number;
};

export type ProjectileInstance = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  bounces: number;
  ttlMs: number;
};

export type Block = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  isBoss?: boolean;
};

export type GameStatus = 'idle' | 'firing' | 'won' | 'lost';

export type GameSnapshot = {
  stage: number;
  blocks: Block[];
  queue: ProjectileSpec[];
  status: GameStatus;
  bossHp?: number;
};

export type GameConfig = {
  width: number;
  height: number;
};

export type AimInput = {
  angleRad: number;
};
