// Reusable motion-graphics pieces for PrepPilot explainer videos (1080x1920, 30 fps).
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export const C = { bg: '#0b1113', bg2: '#0f1b1d', ink: '#f1f6f4', muted: '#8ea3a0', accent: '#4fd1a5', accent2: '#7cc4ff', warn: '#ffb45c', line: '#23302f' };
export const SANS = 'Inter, "SF Pro Display", -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

export const useSpring = (delay = 0, cfg = { damping: 14, stiffness: 120, mass: 0.8 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: cfg });
};

// Moving background: soft gradient orbs and a slowly drifting grid.
export const Backdrop: React.FC<{ hue?: string }> = ({ hue = C.accent }) => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 70) * 120, b = Math.cos(f / 90) * 140;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 900px at ${540 + a}px ${520 + b}px, ${hue}22, transparent 60%), radial-gradient(900px 900px at ${300 - b}px ${1500 + a}px, ${C.accent2}18, transparent 60%), linear-gradient(180deg, ${C.bg}, ${C.bg2})` }}>
      <AbsoluteFill style={{ opacity: 0.18, backgroundImage: `linear-gradient(${C.line} 2px, transparent 2px), linear-gradient(90deg, ${C.line} 2px, transparent 2px)`, backgroundSize: '90px 90px', backgroundPosition: `0 ${(f * 0.6) % 90}px`, maskImage: 'radial-gradient(circle at 50% 45%, black 30%, transparent 75%)' }} />
    </AbsoluteFill>
  );
};

// Scene wrapper: zoom-in entrance with blur, zoom-out exit.
export const Scene: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 140, mass: 0.7 });
  const exit = interpolate(f, [dur - 8, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const scale = interpolate(enter, [0, 1], [1.12, 1]) * interpolate(exit, [0, 1], [1, 0.92]);
  return (
    <AbsoluteFill style={{ padding: '230px 80px 520px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 46,
      opacity: enter * (1 - exit), transform: `scale(${scale})`, filter: `blur(${(1 - enter) * 18 + exit * 12}px)`, fontFamily: SANS, color: C.ink }}>
      {children}
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.accent }) => {
  const s = useSpring(2);
  return <div style={{ font: `700 34px ${MONO}`, letterSpacing: '.16em', textTransform: 'uppercase', color, opacity: s, transform: `translateX(${(1 - s) * -60}px)` }}>{children}</div>;
};

// Kinetic headline: each word springs up in turn.
export const Words: React.FC<{ text: string; size?: number; delay?: number; color?: string; hl?: string[] }> = ({ text, size = 104, delay = 4, color = C.ink, hl = [] }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${size * 0.26}px`, font: `800 ${size}px/1.04 ${SANS}`, letterSpacing: '-.035em' }}>
      {text.split(' ').map((w, i) => {
        const s = spring({ frame: f - delay - i * 3, fps, config: { damping: 12, stiffness: 160, mass: 0.6 } });
        const on = hl.includes(w.replace(/[^\w]/g, ''));
        return <span key={i} style={{ display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * 6}deg)`, color: on ? C.accent : color }}>{w}</span>;
      })}
    </div>
  );
};

export const Sub: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 14 }) => {
  const s = useSpring(delay);
  return <div style={{ font: `500 48px/1.35 ${SANS}`, color: C.muted, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>{children}</div>;
};

// Glowing chip with scanning line (firmware / hardware).
export const Chip: React.FC<{ label: string }> = ({ label }) => {
  const f = useCurrentFrame(); const s = useSpring(4);
  const scan = (f * 6) % 420;
  return (
    <div style={{ position: 'relative', width: 460, height: 460, margin: '0 auto', transform: `scale(${s}) rotate(${(1 - s) * -20}deg)` }}>
      {[0, 1, 2, 3].map(k => <div key={k} style={{ position: 'absolute', inset: -46, border: `5px dashed ${C.accent}55`, borderRadius: 80, transform: `rotate(${k * 90 + f * 0.4}deg)`, opacity: 0.25 }} />)}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 56, border: `7px solid ${C.accent}`, background: '#0d2420', display: 'grid', placeItems: 'center', overflow: 'hidden',
        boxShadow: `0 0 ${60 + Math.sin(f / 6) * 30}px ${C.accent}66` }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: scan, height: 6, background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`, opacity: 0.7 }} />
        <div style={{ font: `800 84px ${MONO}`, color: C.accent }}>{label}</div>
      </div>
    </div>
  );
};

// Terminal that types its lines over time.
export const Terminal: React.FC<{ lines: { t: string; c?: string; at: number; speed?: number }[]; title?: string; minH?: number }> = ({ lines, title = 'tty1', minH = 560 }) => {
  const f = useCurrentFrame(); const s = useSpring(0);
  return (
    <div style={{ borderRadius: 34, background: '#05090a', border: `3px solid ${C.line}`, boxShadow: `0 40px 80px -30px #000`, overflow: 'hidden', transform: `translateY(${(1 - s) * 80}px)`, opacity: s }}>
      <div style={{ display: 'flex', gap: 14, padding: '22px 30px', background: '#0d1416', alignItems: 'center' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map(c => <i key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c }} />)}
        <span style={{ marginLeft: 18, font: `500 28px ${MONO}`, color: C.muted }}>{title}</span>
      </div>
      <div style={{ padding: 40, minHeight: minH, font: `500 42px/1.6 ${MONO}` }}>
        {lines.map((l, i) => {
          const n = Math.max(0, Math.floor((f - l.at) / (l.speed || 1.2)));
          if (f < l.at) return null;
          const last = i === lines.length - 1 || f < lines[i + 1].at;
          return <div key={i} style={{ color: l.c || C.ink, whiteSpace: 'pre' }}>{l.t.slice(0, n)}{last && Math.floor(f / 15) % 2 === 0 ? <span style={{ background: C.ink, color: C.ink }}>_</span> : null}</div>;
        })}
      </div>
    </div>
  );
};

// Rows that pop in one after another, with an optional highlight that walks down.
export const Rows: React.FC<{ rows: { a: string; b?: string; icon?: string }[]; gap?: number; start?: number; walk?: boolean }> = ({ rows, gap = 22, start = 6, walk = false }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const active = walk ? Math.floor((f - start) / gap) : -1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {rows.map((r, i) => {
        const s = spring({ frame: f - start - i * gap, fps, config: { damping: 13, stiffness: 150 } });
        const on = walk ? i === Math.min(active, rows.length - 1) : true;
        const done = walk && i < active;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '30px 38px', borderRadius: 30, border: `3px solid ${on ? C.accent : done ? '#2f5c4c' : C.line}`, background: on ? '#123029' : '#121b1c',
            opacity: s * (walk && !on && !done ? 0.45 : 1), transform: `translateX(${(1 - s) * -120}px) scale(${on && walk ? 1.03 : 1})` }}>
            {r.icon ? <span style={{ flex: 'none', width: 78, height: 78, borderRadius: 39, display: 'grid', placeItems: 'center', background: on ? C.accent : '#24302f', color: on ? C.bg : C.accent, font: `800 38px ${SANS}` }}>{r.icon}</span> : null}
            <div><div style={{ font: `800 54px ${SANS}` }}>{r.a}</div>{r.b ? <div style={{ font: `500 36px ${SANS}`, color: C.muted, marginTop: 6 }}>{r.b}</div> : null}</div>
          </div>
        );
      })}
    </div>
  );
};

// Captions synced to the narration: shows the current phrase, highlights the spoken word.
export const Captions: React.FC<{ words: { w: string; t: number; d: number }[]; keys?: string[] }> = ({ words, keys = [] }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  // Spelled-out letters ("P I D") read better on screen as one word ("PID").
  words = React.useMemo(() => { const out: typeof words = []; for (const w of words) { const prev = out[out.length - 1];
    if (prev && /^[A-Za-z]$/.test(w.w) && /^[A-Z]+$/.test(prev.w) && w.t - (prev.t + prev.d) < 0.25) { prev.w += w.w.toUpperCase(); prev.d = w.t + w.d - prev.t; }
    else out.push({ ...w, w: /^[a-z]$/.test(w.w) ? w.w.toUpperCase() : w.w }); } return out; }, [words]);
  let i = words.findIndex(w => w.t > now) - 1; if (i < -1) i = words.length - 1; if (i < 0) return null;
  const start = Math.floor(i / 4) * 4, chunk = words.slice(start, start + 4);
  if (now > words[words.length - 1].t + words[words.length - 1].d + 0.6) return null;
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 230, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', font: `900 78px/1.15 ${SANS}`, letterSpacing: '-.02em', textTransform: 'uppercase', textShadow: '0 6px 24px #000c' }}>
      {chunk.map((w, k) => {
        const idx = start + k, on = idx === i, said = idx <= i;
        const pop = on ? interpolate(now - w.t, [0, 0.12], [1.25, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }) : 1;
        const key = keys.some(x => w.w.toLowerCase().includes(x));
        return <span key={idx} style={{ display: 'inline-block', margin: '0 11px', color: on ? (key ? C.warn : C.accent) : said ? C.ink : '#ffffff55', transform: `scale(${pop})` }}>{w.w}</span>;
      })}
    </div>
  );
};

export const Progress: React.FC<{ marks: number[]; total: number }> = ({ marks, total }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  return (
    <div style={{ position: 'absolute', top: 110, left: 80, right: 80, display: 'flex', gap: 10 }}>
      {marks.map((m, i) => { const end = marks[i + 1] ?? total; const p = Math.max(0, Math.min(1, (now - m) / (end - m)));
        return <div key={i} style={{ flex: 1, height: 10, borderRadius: 5, background: '#ffffff1f', overflow: 'hidden' }}><div style={{ width: `${p * 100}%`, height: '100%', background: C.accent }} /></div>; })}
    </div>
  );
};

export const Brand: React.FC = () => (
  <div style={{ position: 'absolute', top: 150, left: 80, font: `800 40px ${SANS}`, letterSpacing: '-.02em', color: C.ink, opacity: 0.9 }}>
    Prep<span style={{ color: C.accent }}>Pilot</span>
  </div>
);
