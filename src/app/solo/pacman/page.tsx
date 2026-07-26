'use client';

import { useEffect, useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';

/**
 * Pac-Man — canvas arcade game, touch-first (swipe anywhere to steer, arrow
 * keys on desktop). Classic 28x31 maze, four ghosts with the traditional
 * personalities (chaser, ambusher, flanker, shy one), scatter/chase phases,
 * frightened mode with eat combos, tunnel wrap, lives and levels.
 * Movement is tile-to-tile with interpolation so it can't desync from the
 * grid. Score submits to the capped solo endpoint on game over.
 */

// prettier-ignore
const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##................##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

const ROWS = MAZE.length; // 31
const COLS = MAZE[0].length; // 28
const TILE = 12;
const TUNNEL_ROW = 14;

type Dir = [number, number]; // [dr, dc]
const DIRS: Dir[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

type Mode = 'normal' | 'frightened' | 'eyes' | 'housed' | 'exiting';

type Entity = {
  from: [number, number];
  to: [number, number];
  t: number; // 0..1 progress from→to
  dir: Dir;
  speed: number; // tiles per second
  mode: Mode;
  color: string;
  scatter: [number, number];
  releaseAt: number; // ms timestamp when it may leave the house
};

const GHOSTS: { color: string; scatter: [number, number]; spawn: [number, number]; delay: number }[] = [
  { color: '#FF3B30', scatter: [0, 25], spawn: [11, 13], delay: 0 }, // blinky — starts outside
  { color: '#FF8AD8', scatter: [0, 2], spawn: [14, 13], delay: 2500 }, // pinky
  { color: '#4DD9E8', scatter: [30, 27], spawn: [14, 11], delay: 5500 }, // inky
  { color: '#FFB852', scatter: [30, 0], spawn: [14, 16], delay: 8500 }, // clyde
];

const PAC_SPAWN: [number, number] = [23, 13];
const HOUSE_DOOR: [number, number] = [11, 13];
const HOUSE_INSIDE: [number, number] = [14, 13];

function passable(r: number, c: number, gate: boolean): boolean {
  if (r === TUNNEL_ROW) c = ((c % COLS) + COLS) % COLS;
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const ch = MAZE[r][c];
  if (ch === '#') return false;
  if (ch === '-') return gate;
  return true;
}

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

function px(e: Entity): [number, number] {
  // handle tunnel wrap interpolation cleanly
  let [fr, fc] = e.from;
  let [tr, tc] = e.to;
  if (Math.abs(tc - fc) > 1) tc = fc + (tc > fc ? -1 : 1); // wrapping step
  const x = ((fc + (tc - fc) * e.t) + 0.5) * TILE;
  const y = ((fr + (tr - fr) * e.t) + 0.5) * TILE;
  return [x, y];
}

export default function PacmanPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [earned, setEarned] = useState<number | null>(null);
  const [ready, setReady] = useState(true); // "ready" pause between lives
  const stateRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    canvas.width = COLS * TILE * 2;
    canvas.height = ROWS * TILE * 2;
    ctx.scale(2, 2);

    const S: any = {
      pellets: new Set<string>(),
      score: 0,
      lives: 3,
      level: 1,
      over: false,
      paused: true,
      pauseUntil: performance.now() + 1500,
      pac: null as unknown as Entity,
      desired: [0, -1] as Dir,
      ghosts: [] as Entity[],
      phaseTimer: 0,
      phase: 'scatter' as 'scatter' | 'chase',
      frightUntil: 0,
      combo: 200,
      mouth: 0,
      dead: false,
    };
    stateRef.current = S;

    function resetPellets() {
      S.pellets.clear();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (MAZE[r][c] === '.' || MAZE[r][c] === 'o') S.pellets.add(`${r},${c}`);
    }

    function speedMul() {
      return 1 + (S.level - 1) * 0.08;
    }

    function resetPositions(now: number) {
      S.pac = {
        from: PAC_SPAWN, to: PAC_SPAWN, t: 1, dir: [0, -1], speed: 7 * speedMul(),
        mode: 'normal', color: '', scatter: [0, 0], releaseAt: 0,
      };
      S.desired = [0, -1];
      S.ghosts = GHOSTS.map((g, i) => ({
        from: g.spawn, to: g.spawn, t: 1,
        dir: [0, i % 2 ? -1 : 1] as Dir,
        speed: 6.3 * speedMul(),
        mode: (i === 0 ? 'normal' : 'housed') as Mode,
        color: g.color, scatter: g.scatter,
        releaseAt: now + g.delay,
      }));
      S.frightUntil = 0;
      S.phase = 'scatter';
      S.phaseTimer = 0;
    }

    resetPellets();
    resetPositions(performance.now());

    // ---- input ----
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      };
      if (map[e.key]) {
        e.preventDefault();
        S.desired = map[e.key];
      }
    };
    let touchStart: [number, number] | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchStart = [e.touches[0].clientX, e.touches[0].clientY];
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // page must not scroll while steering
      if (!touchStart) return;
      const dx = e.touches[0].clientX - touchStart[0];
      const dy = e.touches[0].clientY - touchStart[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      S.desired = Math.abs(dx) > Math.abs(dy) ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0];
      touchStart = [e.touches[0].clientX, e.touches[0].clientY];
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    // ---- movement ----
    function stepEntity(e: Entity, dt: number, decide: () => void) {
      let remaining = e.speed * dt;
      while (remaining > 0) {
        if (e.t >= 1) {
          e.from = [e.to[0], wrapCol(e.to[1])];
          e.t = 0;
          decide();
          if (e.to[0] === e.from[0] && e.to[1] === e.from[1]) return; // stopped
        }
        const step = Math.min(remaining, 1 - e.t);
        e.t += step;
        remaining -= step;
        if (e.t >= 1 && remaining <= 0) {
          e.from = [e.to[0], wrapCol(e.to[1])];
        }
      }
    }

    function tryDir(e: Entity, dir: Dir, gate: boolean): boolean {
      const [r, c] = e.from;
      if (passable(r + dir[0], c + dir[1], gate)) {
        e.dir = dir;
        e.to = [r + dir[0], c + dir[1]];
        return true;
      }
      return false;
    }

    function pacDecide() {
      const e = S.pac;
      if (!tryDir(e, S.desired, false)) {
        if (!tryDir(e, e.dir, false)) e.to = [...e.from] as [number, number];
      }
      // eat pellet at the tile we just arrived on
      const key = `${e.from[0]},${e.from[1]}`;
      if (S.pellets.has(key)) {
        S.pellets.delete(key);
        const isPower = MAZE[e.from[0]][e.from[1]] === 'o';
        S.score += isPower ? 50 : 10;
        if (isPower) {
          S.frightUntil = performance.now() + Math.max(2500, 6500 - S.level * 500);
          S.combo = 200;
          for (const g of S.ghosts) {
            if (g.mode === 'normal') {
              g.mode = 'frightened';
              // reverse
              const back: Dir = [-g.dir[0], -g.dir[1]];
              if (passable(g.from[0] + back[0], g.from[1] + back[1], false)) {
                g.dir = back;
                g.to = [g.from[0] + back[0], g.from[1] + back[1]];
                g.t = Math.min(g.t, 1 - g.t);
              }
            }
          }
        }
        setScore(S.score);
        if (S.pellets.size === 0) {
          S.level++;
          setLevel(S.level);
          resetPellets();
          resetPositions(performance.now());
          S.paused = true;
          S.pauseUntil = performance.now() + 1500;
          setReady(true);
        }
      }
    }

    function ghostTarget(g: Entity, idx: number): [number, number] {
      if (g.mode === 'eyes') return HOUSE_DOOR;
      const fright = g.mode === 'frightened';
      if (fright) return [Math.floor(Math.random() * ROWS), Math.floor(Math.random() * COLS)];
      if (S.phase === 'scatter') return g.scatter;
      const p = S.pac.from;
      const d = S.pac.dir;
      if (idx === 0) return p; // blinky: chase
      if (idx === 1) return [p[0] + d[0] * 4, p[1] + d[1] * 4]; // pinky: ambush 4 ahead
      if (idx === 2) {
        const b = S.ghosts[0].from;
        const mid = [p[0] + d[0] * 2, p[1] + d[1] * 2];
        return [mid[0] * 2 - b[0], mid[1] * 2 - b[1]]; // inky: flank vector
      }
      const dist = Math.hypot(g.from[0] - p[0], g.from[1] - p[1]);
      return dist > 8 ? p : g.scatter; // clyde: shy
    }

    function ghostDecide(g: Entity, idx: number) {
      const now = performance.now();

      if (g.mode === 'housed') {
        // bounce in place until released
        if (now >= g.releaseAt) {
          g.mode = 'exiting';
        } else {
          const bounce: Dir = g.dir[1] !== 0 ? g.dir : [0, 1];
          if (!tryDir(g, bounce, false)) tryDir(g, [-bounce[0], -bounce[1]] as Dir, false);
          return;
        }
      }

      if (g.mode === 'exiting') {
        // path: align to door column, then straight up through the gate
        const [r, c] = g.from;
        if (r <= HOUSE_DOOR[0]) {
          g.mode = 'normal';
        } else if (c < HOUSE_DOOR[1]) {
          tryDir(g, [0, 1], true);
          return;
        } else if (c > HOUSE_DOOR[1]) {
          tryDir(g, [0, -1], true);
          return;
        } else {
          g.dir = [-1, 0];
          g.to = [r - 1, c];
          return;
        }
      }

      if (g.mode === 'eyes' && g.from[0] === HOUSE_DOOR[0] && g.from[1] === HOUSE_DOOR[1]) {
        // dive back into the house, respawn fresh
        g.mode = 'exiting';
        g.from = [...HOUSE_INSIDE] as [number, number];
        g.to = [...HOUSE_INSIDE] as [number, number];
        g.t = 1;
        g.releaseAt = now + 1200;
        g.mode = 'housed';
        return;
      }

      const target = ghostTarget(g, idx);
      const back: Dir = [-g.dir[0], -g.dir[1]];
      const options = DIRS.filter((d) => {
        if (d[0] === back[0] && d[1] === back[1]) return false;
        return passable(g.from[0] + d[0], g.from[1] + d[1], g.mode === 'eyes');
      });
      const pool = options.length ? options : [back];
      let best = pool[0];
      let bestDist = Infinity;
      for (const d of pool) {
        const nr = g.from[0] + d[0];
        const nc = g.from[1] + d[1];
        const dist = Math.hypot(nr - target[0], nc - target[1]);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      g.dir = best;
      g.to = [g.from[0] + best[0], g.from[1] + best[1]];
    }

    function loseLife() {
      S.lives--;
      setLives(S.lives);
      if (S.lives <= 0) {
        S.over = true;
        setGameOver(true);
        fetch('/api/solo/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: 'pacman', score: S.score }),
        })
          .then((r) => r.json())
          .then((d) => setEarned(d.pointsAwarded ?? 0))
          .catch(() => setEarned(0));
      } else {
        resetPositions(performance.now());
        S.paused = true;
        S.pauseUntil = performance.now() + 1500;
        setReady(true);
      }
    }

    // ---- render ----
    function draw(now: number) {
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);

      // walls
      ctx.fillStyle = '#1B2A6B';
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const ch = MAZE[r][c];
          if (ch === '#') {
            ctx.beginPath();
            ctx.roundRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2, 2.5);
            ctx.fill();
          } else if (ch === '-') {
            ctx.fillStyle = '#F0398F';
            ctx.fillRect(c * TILE, r * TILE + TILE / 2 - 1, TILE, 2);
            ctx.fillStyle = '#1B2A6B';
          }
        }

      // pellets
      ctx.fillStyle = '#F5D7A8';
      for (const key of S.pellets) {
        const [r, c] = key.split(',').map(Number);
        const power = MAZE[r][c] === 'o';
        ctx.beginPath();
        const radius = power ? 4.5 * (0.8 + 0.2 * Math.sin(now / 150)) : 1.6;
        ctx.arc(c * TILE + TILE / 2, r * TILE + TILE / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // pac
      const [pacX, pacY] = px(S.pac);
      const mouth = 0.25 + 0.2 * Math.sin(S.mouth);
      const angle = Math.atan2(S.pac.dir[0], S.pac.dir[1]);
      ctx.fillStyle = '#FFD60A';
      ctx.beginPath();
      ctx.moveTo(pacX, pacY);
      ctx.arc(pacX, pacY, TILE * 0.62, angle + mouth, angle - mouth + Math.PI * 2);
      ctx.fill();

      // ghosts
      for (const g of S.ghosts) {
        const [gx, gy] = px(g);
        const radius = TILE * 0.6;
        const flashing = g.mode === 'frightened' && S.frightUntil - now < 1800 && Math.floor(now / 220) % 2 === 0;
        if (g.mode !== 'eyes') {
          ctx.fillStyle = g.mode === 'frightened' ? (flashing ? '#E5E7EB' : '#2B4BE0') : g.color;
          ctx.beginPath();
          ctx.arc(gx, gy - 1, radius, Math.PI, 0);
          const bottom = gy - 1 + radius;
          ctx.lineTo(gx + radius, bottom);
          for (let i = 0; i < 3; i++) {
            const w = (radius * 2) / 3;
            ctx.lineTo(gx + radius - w * (i + 0.5), bottom - 3);
            ctx.lineTo(gx + radius - w * (i + 1), bottom);
          }
          ctx.closePath();
          ctx.fill();
        }
        // eyes
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(gx + side * 2.6, gy - 2.5, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1B2A6B';
          ctx.beginPath();
          ctx.arc(gx + side * 2.6 + g.dir[1] * 1.1, gy - 2.5 + g.dir[0] * 1.1, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---- main loop ----
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (S.over) {
        draw(now);
        return;
      }
      if (S.paused) {
        if (now < S.pauseUntil) {
          draw(now);
          return;
        }
        S.paused = false;
        setReady(false);
      }

      S.mouth += dt * 14;

      // scatter/chase rhythm: 7s scatter, 20s chase
      S.phaseTimer += dt;
      if (S.phase === 'scatter' && S.phaseTimer > 7) {
        S.phase = 'chase';
        S.phaseTimer = 0;
      } else if (S.phase === 'chase' && S.phaseTimer > 20) {
        S.phase = 'scatter';
        S.phaseTimer = 0;
      }

      // frightened expiry
      if (S.frightUntil && now > S.frightUntil) {
        S.frightUntil = 0;
        for (const g of S.ghosts) if (g.mode === 'frightened') g.mode = 'normal';
      }

      stepEntity(S.pac, dt, pacDecide);
      S.ghosts.forEach((g: Entity, i: number) => {
        const base = 6.3 * speedMul();
        g.speed =
          g.mode === 'frightened' ? base * 0.62 :
          g.mode === 'eyes' ? base * 1.6 :
          g.from[0] === TUNNEL_ROW && (g.from[1] < 6 || g.from[1] > 21) ? base * 0.55 :
          base;
        stepEntity(g, dt, () => ghostDecide(g, i));
      });

      // collisions
      const [pacX, pacY] = px(S.pac);
      for (const g of S.ghosts) {
        const [gx, gy] = px(g);
        if (Math.hypot(gx - pacX, gy - pacY) < TILE * 0.75) {
          if (g.mode === 'frightened') {
            S.score += S.combo;
            setScore(S.score);
            S.combo = Math.min(1600, S.combo * 2);
            g.mode = 'eyes';
          } else if (g.mode === 'normal') {
            loseLife();
            break;
          }
        }
      }

      draw(now);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  function restart() {
    // remount the effect for a clean slate
    setGameOver(false);
    setEarned(null);
    setScore(0);
    setLives(3);
    setLevel(1);
    setReady(true);
    const S = stateRef.current;
    if (S) {
      S.over = false;
      S.score = 0;
      S.lives = 3;
      S.level = 1;
      S.pellets.clear();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (MAZE[r][c] === '.' || MAZE[r][c] === 'o') S.pellets.add(`${r},${c}`);
      S.paused = true;
      S.pauseUntil = performance.now() + 1500;
      // reset positions using the same shapes the effect built
      S.pac.from = [...PAC_SPAWN];
      S.pac.to = [...PAC_SPAWN];
      S.pac.t = 1;
      S.pac.dir = [0, -1];
      S.desired = [0, -1];
      S.ghosts.forEach((g: any, i: number) => {
        g.from = [...GHOSTS[i].spawn];
        g.to = [...GHOSTS[i].spawn];
        g.t = 1;
        g.mode = i === 0 ? 'normal' : 'housed';
        g.releaseAt = performance.now() + GHOSTS[i].delay;
      });
      S.frightUntil = 0;
    }
  }

  return (
    <main className="safe-bottom px-3 animate-fade-up">
      <TopBar back="/" title="Pac-Man" />
      <div className="mb-2 flex items-center justify-between px-1 text-sm">
        <span>
          Score <span className="grad-number font-display text-lg font-black">{score}</span>
        </span>
        <span className="text-ink-400">Lvl {level}</span>
        <span aria-label={`${lives} lives`}>{'🟡'.repeat(Math.max(0, lives))}</span>
      </div>

      <div className="relative mx-auto w-full max-w-[352px]">
        <canvas
          ref={canvasRef}
          className="w-full touch-none rounded-md"
          style={{ aspectRatio: `${COLS}/${ROWS}` }}
        />
        {ready && !gameOver && (
          <p className="absolute inset-x-0 top-[55%] text-center font-display text-xl font-black text-warning animate-pop">
            Ready!
          </p>
        )}
        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md bg-ink-950/85 text-center animate-fade-up">
            <p className="font-display text-2xl font-black">Game over</p>
            <p className="text-ink-400">
              {score} points · level {level}
            </p>
            {earned !== null && earned > 0 && (
              <p className="grad-number font-display text-2xl font-black">+{earned} pts</p>
            )}
            <button onClick={restart} className="btn-primary max-w-44">
              Play again
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-xs text-ink-500">
        Swipe anywhere on the maze to steer · power pellets turn the tables
      </p>
    </main>
  );
}
