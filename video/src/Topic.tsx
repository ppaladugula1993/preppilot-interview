// One composition for every topic: the script (scenes) and the voice timings come in as props.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring } from 'remotion';
import { C, MONO, SANS, Backdrop, Scene, Kicker, Words, Sub, Chip, Terminal, Rows, Captions, Progress, Brand, useSpring } from './kit';

export type SceneSpec =
  | { id: string; type: 'hook'; say: string; kicker: string; line1: string; line2: string }
  | { id: string; type: 'chip'; say: string; kicker: string; label: string; sub: string }
  | { id: string; type: 'terminal'; say: string; kicker: string; title: string; lines: string[]; sub?: string }
  | { id: string; type: 'rows'; say: string; kicker: string; rows: { a: string; b?: string }[]; walk?: boolean }
  | { id: string; type: 'compare'; say: string; kicker: string; left: { title: string; items: string[] }; right: { title: string; items: string[] } }
  | { id: string; type: 'code'; say: string; kicker: string; lang: string; code: string }
  | { id: string; type: 'trap'; say: string; question: string; wrong: string; right: string }
  | { id: string; type: 'picture'; say: string; kicker: string; prompt: string; image?: string; map: { thing: string; means: string }[] }
  | { id: string; type: 'end'; say: string };
export type Timing = { duration: number; marks: { id: string; t: number }[]; words: { w: string; t: number; d: number }[] };
export type TopicProps = { id: string; title: string; scenes: SceneSpec[]; timing: Timing; audio: string; keys?: string[] };

const Compare: React.FC<{ s: Extract<SceneSpec, { type: 'compare' }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const col = (side: { title: string; items: string[] }, k: number, color: string) => {
    const e = spring({ frame: f - 4 - k * 10, fps, config: { damping: 14, stiffness: 140 } });
    return (
      <div style={{ flex: 1, padding: 34, borderRadius: 30, border: `3px solid ${color}`, background: '#101a1b', opacity: e, transform: `translateY(${(1 - e) * 80}px)` }}>
        <div style={{ font: `800 50px ${SANS}`, color, marginBottom: 20 }}>{side.title}</div>
        {side.items.map((it, i) => { const p = spring({ frame: f - 18 - k * 8 - i * 12, fps }); return <div key={i} style={{ font: `500 36px/1.35 ${SANS}`, color: C.ink, margin: '14px 0', opacity: p, transform: `translateX(${(1 - p) * (k ? 40 : -40)}px)` }}>• {it}</div>; })}
      </div>
    );
  };
  const vs = spring({ frame: f - 12, fps, config: { damping: 9 } });
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 30 }}>
      {col(s.left, 0, C.accent)}{col(s.right, 1, C.accent2)}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 96, height: 96, marginLeft: -48, marginTop: -48, borderRadius: 48, display: 'grid', placeItems: 'center', background: C.warn, color: C.bg, font: `900 38px ${SANS}`, transform: `scale(${vs})` }}>VS</div>
    </div>
  );
};

const Code: React.FC<{ s: Extract<SceneSpec, { type: 'code' }> }> = ({ s }) => {
  const f = useCurrentFrame(); const e = useSpring(0);
  const lines = s.code.split('\n').slice(0, 12);
  return (
    <div style={{ borderRadius: 30, background: '#05090a', border: `3px solid ${C.line}`, overflow: 'hidden', opacity: e, transform: `translateY(${(1 - e) * 60}px)` }}>
      <div style={{ padding: '18px 30px', background: '#0d1416', font: `600 28px ${MONO}`, color: C.muted }}>{s.lang}</div>
      <div style={{ padding: '30px 36px', font: `500 ${lines.some(l => l.length > 34) ? 32 : 38}px/1.55 ${MONO}` }}>
        {lines.map((l, i) => { const p = interpolate(f, [6 + i * 7, 14 + i * 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <div key={i} style={{ whiteSpace: 'pre', opacity: p, color: /^\s*(#|\/\/|--)/.test(l) ? C.muted : C.ink }}>{l || ' '}</div>; })}
      </div>
    </div>
  );
};

// Real-world picture (AI illustration) with a slow zoom, then a key that maps each thing to the tech idea.
const Picture: React.FC<{ s: Extract<SceneSpec, { type: 'picture' }>; dur: number }> = ({ s, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const zoom = interpolate(f, [0, dur], [1.06, 1.22]);
  const pan = interpolate(f, [0, dur], [0, -40]);
  const e = spring({ frame: f, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      {s.image ? <Img src={staticFile(s.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom}) translateY(${pan}px)`, opacity: e }} /> : null}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0b1113ee 0%, #0b111300 28%, #0b111300 55%, #0b1113f2 78%)' }} />
      <div style={{ position: 'absolute', top: 230, left: 80, right: 80 }}><Kicker>{s.kicker}</Kicker></div>
      <div style={{ position: 'absolute', left: 70, right: 70, bottom: 470, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {s.map.slice(0, 3).map((m, i) => { const p = spring({ frame: f - 18 - i * 16, fps, config: { damping: 13, stiffness: 150 } });
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '22px 30px', borderRadius: 26, background: '#0b1113d9', border: `3px solid ${i ? C.accent2 : C.accent}`, opacity: p, transform: `translateX(${(1 - p) * -160}px)`, backdropFilter: 'blur(6px)' }}>
              <span style={{ font: `800 46px ${SANS}`, color: C.ink }}>{m.thing}</span>
              <span style={{ font: `800 46px ${SANS}`, color: C.warn }}>=</span>
              <span style={{ font: `700 42px ${SANS}`, color: i ? C.accent2 : C.accent }}>{m.means}</span>
            </div>
          ); })}
      </div>
    </AbsoluteFill>
  );
};

const Trap: React.FC<{ s: Extract<SceneSpec, { type: 'trap' }> }> = ({ s }) => {
  const f = useCurrentFrame(); const e = useSpring(0); const e2 = useSpring(36);
  const shake = f < 12 ? Math.sin(f * 2.4) * (12 - f) : 0;
  return (
    <div style={{ padding: 54, borderRadius: 36, background: '#2a1f14', border: `4px solid ${C.warn}`, transform: `scale(${0.8 + e * 0.2}) translateX(${shake}px)`, opacity: e, boxShadow: `0 0 80px ${C.warn}33` }}>
      <div style={{ font: `700 34px ${MONO}`, letterSpacing: '.16em', color: C.warn }}>⚠ INTERVIEW TRAP</div>
      <div style={{ marginTop: 26, font: `800 68px/1.12 ${SANS}` }}>"{s.question}"</div>
      <div style={{ marginTop: 32, font: `700 50px/1.3 ${SANS}`, color: C.muted, opacity: e2, transform: `translateY(${(1 - e2) * 30}px)` }}>
        <s style={{ textDecorationColor: C.warn }}>{s.wrong}</s><br /><span style={{ color: C.accent }}>→ {s.right}</span>
      </div>
    </div>
  );
};

const End: React.FC<{ title: string }> = ({ title }) => {
  const s = useSpring(0); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40, fontFamily: SANS, color: C.ink, padding: 80, textAlign: 'center' }}>
      <div style={{ font: `900 150px ${SANS}`, letterSpacing: '-.04em', transform: `scale(${0.6 + s * 0.4})`, opacity: s }}>Prep<span style={{ color: C.accent }}>Pilot</span></div>
      <div style={{ font: `600 50px ${SANS}`, color: C.muted, opacity: interpolate(f, [10, 25], [0, 1], { extrapolateRight: 'clamp' }) }}>More on {title}: cards, worked answers, AI mock interview</div>
      <div style={{ font: `700 46px ${MONO}`, color: C.accent, opacity: interpolate(f, [20, 35], [0, 1], { extrapolateRight: 'clamp' }) }}>preppilot.us</div>
    </AbsoluteFill>
  );
};

const body = (s: SceneSpec, title: string) => {
  switch (s.type) {
    case 'hook': return <><Kicker>{s.kicker}</Kicker><Words text={s.line1} size={s.line1.length > 40 ? 88 : 100} /><Words text={s.line2} size={s.line2.length > 24 ? 100 : 124} delay={24} color={C.accent} /></>;
    case 'chip': return <><Kicker>{s.kicker}</Kicker><Chip label={s.label} /><Sub delay={20}>{s.sub}</Sub></>;
    case 'terminal': { const gap = Math.max(14, 70 / Math.max(1, s.lines.length));
      return <><Kicker>{s.kicker}</Kicker><Terminal title={s.title} minH={380} lines={s.lines.slice(0, 6).map((t, i) => ({ t, at: 4 + i * gap, speed: 0.8, c: t.startsWith('$') ? C.accent : t.startsWith('#') ? C.muted : C.ink }))} />{s.sub ? <Sub delay={24}>{s.sub}</Sub> : null}</>; }
    case 'rows': return <><Kicker>{s.kicker}</Kicker><Rows walk={!!s.walk} start={6} gap={s.walk ? 26 : 18} rows={s.rows.slice(0, 5).map((r, i) => ({ ...r, icon: String(i + 1) }))} /></>;
    case 'compare': return <><Kicker>{s.kicker}</Kicker><Compare s={s} /></>;
    case 'code': return <><Kicker>{s.kicker}</Kicker><Code s={s} /></>;
    case 'trap': return <Trap s={s} />;
    default: return null;
  }
};

export const Topic: React.FC<TopicProps> = ({ title, scenes, timing, audio, keys = [] }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const starts = scenes.map(s => timing.marks.find(m => m.id === s.id)?.t ?? 0);
  const seq = (i: number) => { const from = Math.round(starts[i] * fps); const to = Math.round((starts[i + 1] ?? durationInFrames / fps) * fps); return { from, durationInFrames: Math.max(1, to - from) }; };
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      <Audio src={staticFile('pad.mp3')} volume={0.16} />
      <Audio src={staticFile(audio)} />
      {scenes.slice(1).map((s, i) => <Sequence key={'w' + s.id} from={seq(i + 1).from} durationInFrames={14}><Audio src={staticFile('whoosh.mp3')} volume={0.3} /></Sequence>)}
      {scenes.map((s, i) => (
        <Sequence key={s.id} {...seq(i)}>
          {s.type === 'end' ? <End title={title} /> : s.type === 'picture' ? <Picture s={s} dur={seq(i).durationInFrames} /> : <Scene dur={seq(i).durationInFrames}>{body(s, title)}</Scene>}
        </Sequence>
      ))}
      <Progress marks={starts} total={durationInFrames / fps} />
      <Brand />
      <Captions words={timing.words} keys={keys.map(k => k.toLowerCase())} />
    </AbsoluteFill>
  );
};
