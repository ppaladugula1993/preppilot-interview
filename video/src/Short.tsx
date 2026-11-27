// Brainrot-style short: AI picture on top (new picture every scene, punch-in cuts), huge pop captions in the
// middle, and an original "satisfying" loop at the bottom. Theme, art style and loop change per video.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring } from 'remotion';
import type { SceneSpec, Timing } from './Topic';

export type ShortScene = SceneSpec & { image?: string; emoji?: string };
export type ShortProps = { id: string; title: string; scenes: ShortScene[]; timing: Timing; audio: string; keys?: string[]; theme?: number; loop?: number };

const SANS = '"Inter", "Arial Black", Impact, sans-serif';
const MONO = '"JetBrains Mono", Menlo, monospace';
export const THEMES = [
  { name: 'sunset', bg1: '#2b1055', bg2: '#d53369', a: '#ffd23f', b: '#ff6b6b', ink: '#ffffff' },
  { name: 'neon', bg1: '#0f0c29', bg2: '#302b63', a: '#00f5d4', b: '#f15bb5', ink: '#ffffff' },
  { name: 'lime', bg1: '#0b0b0b', bg2: '#1d2b0f', a: '#c6ff00', b: '#00e5ff', ink: '#ffffff' },
  { name: 'ocean', bg1: '#03045e', bg2: '#0077b6', a: '#ffbe0b', b: '#90e0ef', ink: '#ffffff' },
  { name: 'candy', bg1: '#ff5fa2', bg2: '#ffb86b', a: '#2b2d42', b: '#5bf0ff', ink: '#ffffff' },
  { name: 'retro', bg1: '#22223b', bg2: '#9a031e', a: '#fb8b24', b: '#e9c46a', ink: '#fff8e7' },
  { name: 'mint', bg1: '#004b49', bg2: '#00a19a', a: '#ffef5a', b: '#ff7ab6', ink: '#ffffff' },
  { name: 'grape', bg1: '#240046', bg2: '#7b2cbf', a: '#80ffdb', b: '#ffd60a', ink: '#ffffff' },
];
type Th = typeof THEMES[number];
const TOP = 1010, MID = 230; // picture panel height, caption band height
const rnd = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- satisfying loops (bottom half, all original, deterministic) ---------- */
const Runner: React.FC<{ th: Th; h: number }> = ({ th, h }) => {
  const f = useCurrentFrame(); const P = 34, ph = (f % P) / P;
  const y = -Math.max(0, Math.sin(Math.min(1, ph / 0.75) * Math.PI)) * 240;
  const ground = h - 170;
  return (
    <svg width={1080} height={h}>
      {[0, 1, 2].map(k => <rect key={k} x={((k * 520 - f * 4) % 1560 + 1560) % 1560 - 300} y={80 + k * 60} width={300} height={40} rx={20} fill="#ffffff22" />)}
      {Array.from({ length: 9 }, (_, i) => { const x = ((i * 160 - f * 18) % 1440 + 1440) % 1440 - 180; return <rect key={i} x={x} y={ground} width={140} height={170} fill={i % 2 ? th.a : th.b} opacity={0.9} />; })}
      {Array.from({ length: 4 }, (_, i) => { const x = 330 + (P - (f % P)) * 18 + i * P * 18 - P * 18 * 0.55; return x < 1150 && x > -100 ? <rect key={i} x={x} y={ground - 110} width={70} height={110} rx={12} fill={th.b} stroke="#000" strokeWidth={6} /> : null; })}
      {Array.from({ length: 6 }, (_, i) => { const x = ((i * 230 - f * 18) % 1380 + 1380) % 1380; return <circle key={i} cx={x} cy={ground - 330 - (i % 2) * 60} r={26} fill={th.a} stroke="#000" strokeWidth={5} />; })}
      <g transform={`translate(300 ${ground - 150 + y}) rotate(${ph < 0.75 ? ph * 480 : 0} 70 70)`}>
        <rect width={140} height={140} rx={34} fill={th.a} stroke="#000" strokeWidth={8} />
        <circle cx={48} cy={58} r={14} fill="#000" /><circle cx={96} cy={58} r={14} fill="#000" />
        <path d="M44 96 Q70 120 98 96" stroke="#000" strokeWidth={8} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
};
const Plinko: React.FC<{ th: Th; h: number }> = ({ th, h }) => {
  const f = useCurrentFrame(); const rows = 7, gap = 120, top = 60;
  const pegs: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c <= r + 2; c++) pegs.push(<circle key={`${r}-${c}`} cx={540 + (c - (r + 2) / 2) * gap} cy={top + r * 70} r={10} fill="#ffffffaa" />);
  const balls = Array.from({ length: 14 }, (_, i) => {
    const born = Math.floor((f - i * 6) / 84) * 84 + i * 6, t = f - born; if (t < 0) return null;
    let x = 540, path = 0; const step = Math.min(rows, Math.floor(t / 8)), fr = (t % 8) / 8;
    for (let r = 0; r < step; r++) { path += rnd(born * 13 + r) > 0.5 ? 1 : -1; }
    const nextDir = rnd(born * 13 + step) > 0.5 ? 1 : -1;
    x = 540 + path * gap / 2 + (step < rows ? nextDir * fr * gap / 2 : 0);
    const y = top - 40 + step * 70 + (step < rows ? fr * 70 - Math.sin(fr * Math.PI) * 30 : Math.min(260, (t - rows * 8) * 14));
    return <circle key={i} cx={x} cy={y} r={22} fill={i % 3 ? th.a : th.b} stroke="#000" strokeWidth={4} />;
  });
  return (<svg width={1080} height={h}>{pegs}{balls}
    {Array.from({ length: 9 }, (_, i) => { const hh = 40 + ((f * (1 + rnd(i) * 2)) % 200); return <rect key={i} x={540 + (i - 4) * gap / 2 * 2 - 50} y={h - hh} width={100} height={hh} rx={14} fill={i % 2 ? th.a : th.b} opacity={0.85} />; })}
  </svg>);
};
const Slicer: React.FC<{ th: Th; h: number }> = ({ th, h }) => {
  const f = useCurrentFrame(); const P = 30, k = Math.floor(f / P), ph = (f % P) / P, mid = h / 2;
  const blade = ph < 0.35 ? interpolate(ph, [0, 0.35], [-200, mid + 40]) : interpolate(ph, [0.35, 1], [mid + 40, -200]);
  return (
    <svg width={1080} height={h}>
      <rect x={0} y={mid + 120} width={1080} height={30} fill="#00000055" />
      {[-1, 0, 1].map(o => { const idx = k + o, x = 540 + o * 380 - ph * 380; const cut = o < 0 || (o === 0 && ph > 0.35); const c = [th.a, th.b, '#ffffff'][((idx % 3) + 3) % 3];
        const sp = o < 0 ? 1 + ph : o === 0 ? Math.max(0, ph - 0.35) * 1.6 : 0;
        return <g key={idx}>
          <rect x={x - 130 - sp * 60} y={mid - 120 + sp * 30} width={130} height={240} rx={40} fill={c} stroke="#000" strokeWidth={6} transform={`rotate(${-sp * 25} ${x - 65} ${mid})`} />
          <rect x={x + sp * 60} y={mid - 120 + sp * 30} width={130} height={240} rx={40} fill={c} stroke="#000" strokeWidth={6} transform={`rotate(${sp * 25} ${x + 65} ${mid})`} />
          {!cut ? <rect x={x - 6} y={mid - 120} width={12} height={240} fill={c} /> : <rect x={x - 3} y={mid - 120 + sp * 30} width={6} height={240} fill="#ffffffaa" />}
        </g>; })}
      <g transform={`translate(540 ${blade})`}><polygon points="-160,-60 160,-60 0,40" fill="#e8e8e8" stroke="#000" strokeWidth={6} /><rect x={-20} y={-260} width={40} height={210} fill="#555" /></g>
    </svg>
  );
};
const Stack: React.FC<{ th: Th; h: number }> = ({ th, h }) => {
  const f = useCurrentFrame(); const P = 22, n = Math.floor(f / P), ph = (f % P) / P, bh = 70;
  const cam = Math.max(0, n - 5) * bh + (n >= 5 ? ph * bh : 0);
  const blocks = Array.from({ length: n + 1 }, (_, i) => {
    const w = 520 - (i % 7) * 30, sway = Math.sin(i * 1.7) * 60;
    const yFinal = h - 60 - (i + 1) * bh + cam;
    const y = i === n ? interpolate(ph, [0, 0.6], [-120, yFinal], { extrapolateRight: 'clamp' }) : yFinal;
    const x = i === n ? 540 - w / 2 + Math.sin(f / 6) * 260 * (1 - Math.min(1, ph / 0.6)) + sway * Math.min(1, ph / 0.6) : 540 - w / 2 + sway;
    return y > -bh && y < h + bh ? <rect key={i} x={x} y={y} width={w} height={bh - 6} rx={14} fill={[th.a, th.b, '#ffffff', th.bg2][i % 4]} stroke="#000" strokeWidth={5} /> : null;
  });
  return <svg width={1080} height={h}>{blocks}</svg>;
};
const Orbit: React.FC<{ th: Th; h: number }> = ({ th, h }) => {
  const f = useCurrentFrame();
  return (
    <svg width={1080} height={h}>
      {Array.from({ length: 18 }, (_, i) => Array.from({ length: 10 }, (_, k) => {
        const t = (f - k * 1.6) / 30, a = t * (0.7 + i * 0.09) + i, r = 60 + i * 17;
        return <circle key={`${i}-${k}`} cx={540 + Math.cos(a) * r * 1.7} cy={h / 2 + Math.sin(a * 1.3) * r} r={k ? 16 - k : 20} fill={i % 2 ? th.a : th.b} opacity={1 - k / 10} />;
      }))}
    </svg>
  );
};
const LOOPS = [Runner, Plinko, Slicer, Stack, Orbit];

/* ---------- top panel ---------- */
const Card: React.FC<{ s: ShortScene; th: Th }> = ({ s, th }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const e = spring({ frame: f - 6, fps, config: { damping: 12, stiffness: 160 } });
  const box = (children: React.ReactNode, bg = '#000000d0') => (
    <div style={{ position: 'absolute', left: 50, right: 50, bottom: 40, padding: '26px 32px', borderRadius: 28, background: bg, border: `5px solid ${th.a}`, boxShadow: `10px 10px 0 ${th.b}`, transform: `translateY(${(1 - e) * 300}px) rotate(${(1 - e) * -6}deg)`, color: '#fff' }}>{children}</div>);
  switch (s.type) {
    case 'hook': return <div style={{ position: 'absolute', left: 50, right: 50, bottom: 60, textAlign: 'center', transform: `scale(${0.6 + e * 0.4}) rotate(${(1 - e) * 8 - 2}deg)`, opacity: e }}>
      <div style={{ display: 'inline-block', padding: '18px 30px', background: th.a, color: '#000', font: `900 70px/1.05 ${SANS}`, borderRadius: 20, border: '6px solid #000', boxShadow: `10px 10px 0 #000` }}>{s.line2}</div></div>;
    case 'code': return box(<pre style={{ margin: 0, font: `600 30px/1.45 ${MONO}`, whiteSpace: 'pre' }}>{s.code.split('\n').slice(0, 7).join('\n')}</pre>);
    case 'terminal': return box(<div style={{ font: `600 32px/1.5 ${MONO}` }}>{s.lines.slice(0, 5).map((l, i) => <div key={i} style={{ color: l.startsWith('$') ? th.a : '#ddd' }}>{l}</div>)}</div>);
    case 'rows': return box(<div style={{ font: `800 36px/1.4 ${SANS}` }}>{s.rows.slice(0, 4).map((r, i) => <div key={i}><span style={{ color: th.a }}>{i + 1}.</span> {r.a}{r.b ? <span style={{ color: '#bbb', fontWeight: 600 }}> · {r.b}</span> : null}</div>)}</div>);
    case 'compare': return box(<div style={{ display: 'flex', gap: 24, font: `800 32px/1.35 ${SANS}` }}>{[s.left, s.right].map((c, i) => <div key={i} style={{ flex: 1 }}><div style={{ color: i ? th.b : th.a, fontSize: 42 }}>{c.title}</div>{c.items.slice(0, 3).map((t, k) => <div key={k}>• {t}</div>)}</div>)}</div>);
    case 'chip': return box(<div style={{ font: `900 54px ${SANS}`, color: th.a }}>{s.label}<div style={{ font: `700 32px/1.3 ${SANS}`, color: '#fff', marginTop: 8 }}>{s.sub}</div></div>);
    case 'picture': return box(<div style={{ font: `800 38px/1.4 ${SANS}` }}>{s.map.slice(0, 3).map((m, i) => <div key={i}>{m.thing} <span style={{ color: th.a }}>=</span> <span style={{ color: th.b }}>{m.means}</span></div>)}</div>);
    case 'trap': { const shake = f < 14 ? Math.sin(f * 2.2) * (14 - f) : 0; const r = f > 40;
      return box(<div style={{ font: `900 40px/1.25 ${SANS}`, transform: `translateX(${shake}px)` }}><div style={{ color: '#ff4d4d' }}>🚨 INTERVIEW TRAP</div><div style={{ margin: '10px 0' }}>"{s.question}"</div>
        <div style={{ color: '#bbb', textDecoration: 'line-through' }}>{s.wrong}</div>{r ? <div style={{ color: th.a }}>✅ {s.right}</div> : null}</div>, '#1a0000e8'); }
    default: return null;
  }
};
const Panel: React.FC<{ s: ShortScene; dur: number; th: Th; i: number; title: string }> = ({ s, dur, th, i, title }) => {
  const f = useCurrentFrame();
  const punch = interpolate(f, [0, 5], [1.35, 1.08], { extrapolateRight: 'clamp' }) + interpolate(f, [5, dur], [0, 0.14], { extrapolateLeft: 'clamp' });
  const dir = i % 2 ? 1 : -1, slide = interpolate(f, [0, 6], [dir * 1080, 0], { extrapolateRight: 'clamp' });
  if (s.type === 'end') return <AbsoluteFill style={{ background: `linear-gradient(135deg, ${th.bg1}, ${th.bg2})`, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
    <div style={{ font: `900 130px ${SANS}`, color: '#fff', transform: `scale(${Math.min(1, 0.5 + f / 12)})` }}>Prep<span style={{ color: th.a }}>Pilot</span></div>
    <div style={{ font: `800 44px ${SANS}`, color: '#fff', marginTop: 20 }}>More {title} → preppilot.us</div></AbsoluteFill>;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', transform: `translateX(${slide}px)` }}>
      <AbsoluteFill style={{ background: `linear-gradient(135deg, ${th.bg1}, ${th.bg2})` }} />
      {s.image ? <Img src={staticFile(s.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${punch}) rotate(${dir * interpolate(f, [0, dur], [0, 1.5])}deg)` }} /> : null}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0000 55%, #000a 100%)' }} />
      <Card s={s} th={th} />
    </AbsoluteFill>
  );
};

/* ---------- captions: 1-3 words, huge, outlined, popping ---------- */
const Caps: React.FC<{ words: Timing['words']; keys: string[]; th: Th; emojis: { t: number; e: string }[] }> = ({ words, keys, th, emojis }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  const ws = React.useMemo(() => { const out: typeof words = []; for (const w of words) { const p = out[out.length - 1];
    if (p && /^[A-Za-z]$/.test(w.w) && /^[A-Z]+$/.test(p.w) && w.t - (p.t + p.d) < 0.25) { p.w += w.w.toUpperCase(); p.d = w.t + w.d - p.t; } else out.push({ ...w }); } return out; }, [words]);
  // group into chunks of up to 3 words that never cross a pause
  const groups = React.useMemo(() => { const g: number[][] = []; ws.forEach((w, i) => { const last = g[g.length - 1];
    if (last && last.length < 3 && w.t - (ws[i - 1].t + ws[i - 1].d) < 0.18 && (ws[i - 1].w + w.w).length < 16) last.push(i); else g.push([i]); }); return g; }, [ws]);
  const gi = groups.findIndex(g => now >= ws[g[0]].t && now < (groups[groups.indexOf(g) + 1] ? ws[groups[groups.indexOf(g) + 1][0]].t : ws[g[g.length - 1]].t + 0.6));
  const em = [...emojis].reverse().find(x => now >= x.t && now < x.t + 1.6);
  const emP = em ? spring({ frame: Math.round((now - em.t) * fps), fps, config: { damping: 8, stiffness: 200 } }) : 0;
  return (
    <AbsoluteFill style={{ top: TOP, height: MID, alignItems: 'center', justifyContent: 'center' }}>
      {gi >= 0 ? (() => { const g = groups[gi]; const t0 = ws[g[0]].t; const pop = interpolate(now - t0, [0, 0.1], [1.35, 1], { extrapolateRight: 'clamp' });
        return <div style={{ display: 'flex', gap: 22, transform: `scale(${pop}) rotate(${(gi % 3 - 1) * 2.5}deg)`, font: `900 104px/1 ${SANS}`, textTransform: 'uppercase', letterSpacing: '-.02em', WebkitTextStroke: '10px #000', paintOrder: 'stroke fill', filter: 'drop-shadow(0 8px 0 #000)' }}>
          {g.map(i => { const w = ws[i].w.replace(/[.,!?;:]$/, ''); const key = keys.some(k => w.toLowerCase().includes(k)); const on = now >= ws[i].t;
            return <span key={i} style={{ color: key ? th.a : on ? '#fff' : '#ffffff88' }}>{w}</span>; })}
        </div>; })() : null}
      {em ? <div style={{ position: 'absolute', right: 40, top: -70, fontSize: 130, transform: `scale(${emP}) rotate(${(1 - emP) * 90 + 12}deg)` }}>{em.e}</div> : null}
    </AbsoluteFill>
  );
};

export const Short: React.FC<ShortProps> = ({ title, scenes, timing, audio, keys = [], theme = 0, loop = 0 }) => {
  const { fps, durationInFrames } = useVideoConfig(); const f = useCurrentFrame();
  const th = THEMES[theme % THEMES.length]; const Loop = LOOPS[loop % LOOPS.length];
  const starts = scenes.map(s => timing.marks.find(m => m.id === s.id)?.t ?? 0);
  const seq = (i: number) => { const from = Math.round(starts[i] * fps); const to = Math.round((starts[i + 1] ?? durationInFrames / fps) * fps); return { from, durationInFrames: Math.max(1, to - from) }; };
  const lowH = 1920 - TOP - MID;
  const emojis = scenes.map((s, i) => ({ t: starts[i] + 0.3, e: s.emoji || '' })).filter(x => x.e);
  const total = durationInFrames / fps;
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: SANS }}>
      <Audio src={staticFile('beat.mp3')} volume={0.13} loop />
      <Audio src={staticFile(audio)} />
      {scenes.slice(1).map((s, i) => <Sequence key={'w' + s.id} from={seq(i + 1).from} durationInFrames={14}><Audio src={staticFile('whoosh.mp3')} volume={0.35} /></Sequence>)}
      {emojis.map((e, i) => <Sequence key={'p' + i} from={Math.round(e.t * fps)} durationInFrames={10}><Audio src={staticFile('pop.mp3')} volume={0.4} /></Sequence>)}
      {scenes.map((s, i) => s.type === 'trap' ? <Sequence key={'d' + i} from={seq(i).from + 40} durationInFrames={20}><Audio src={staticFile('ding.mp3')} volume={0.4} /></Sequence> : null)}
      {/* bottom: satisfying loop */}
      <div style={{ position: 'absolute', top: TOP + MID, left: 0, width: 1080, height: lowH, overflow: 'hidden', background: `linear-gradient(180deg, ${th.bg2}, ${th.bg1})` }}><Loop th={th} h={lowH} /></div>
      {/* middle caption band */}
      <div style={{ position: 'absolute', top: TOP, left: 0, width: 1080, height: MID, background: th.bg1 }} />
      {/* top: pictures, one per scene */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: TOP, overflow: 'hidden' }}>
        {scenes.map((s, i) => <Sequence key={s.id} {...seq(i)}><Panel s={s} dur={seq(i).durationInFrames} th={th} i={i} title={title} /></Sequence>)}
        <div style={{ position: 'absolute', top: 40, left: 40, right: 40, height: 14, borderRadius: 7, background: '#0006' }}><div style={{ width: `${(f / fps / total) * 100}%`, height: '100%', borderRadius: 7, background: th.a }} /></div>
        <div style={{ position: 'absolute', top: 72, left: 40, padding: '6px 16px', borderRadius: 12, background: '#000a', font: `900 34px ${SANS}`, color: '#fff' }}>Prep<span style={{ color: th.a }}>Pilot</span></div>
      </div>
      <Caps words={timing.words} keys={keys.map(k => k.toLowerCase())} th={th} emojis={emojis} />
    </AbsoluteFill>
  );
};
