// Calm "host explains it" short: the PrepPilot host (talking + blinking) at the bottom, a soft board on top
// showing the scene (illustrated set + 1-2 gently moving props + the key text), gentle captions in between.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring } from 'remotion';
import type { Timing } from './Topic';
import { Stage, Card, THEMES, type ShortProps, type ShortScene } from './Short';

const SANS = '"Inter", "Segoe UI", sans-serif';
// Soft palettes: light background, one calm accent. Index chosen per video.
const CALM = [
  { bg: '#eef4f1', bg2: '#dceae4', ink: '#1f2d2a', a: '#2f9e7c' },
  { bg: '#f3f0f8', bg2: '#e4dcf0', ink: '#2a2238', a: '#7b5cc4' },
  { bg: '#f6f1e9', bg2: '#ece0cd', ink: '#33291c', a: '#c47a2c' },
  { bg: '#edf3f8', bg2: '#d9e6f2', ink: '#1c2a38', a: '#3a7cc4' },
  { bg: '#f8eff0', bg2: '#f0dcdf', ink: '#3a2227', a: '#c4566b' },
];
const BOARD = { x: 50, y: 150, w: 980, h: 916 };

// Host: picture + an animated mouth and blinking eyelids drawn on top (coordinates in the 1024px source).
const HostFigure: React.FC<{ words: Timing['words'] }> = ({ words }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  const w = words.find(x => now >= x.t && now < x.t + x.d);
  const open = w ? Math.sin(Math.min(1, (now - w.t) / Math.max(0.08, w.d)) * Math.PI) * (0.55 + 0.45 * ((w.w.length % 3) / 2)) : 0;
  const talking = words.some(x => now >= x.t - 0.2 && now < x.t + x.d + 0.2);
  const blink = (f % 105) < 4 || (f % 263) < 4;
  const breathe = Math.sin(now * 1.6) * 4, nod = talking ? Math.sin(now * 5) * 1.2 : 0;
  const skin = '#f9d0b4', line = '#6b4a3a';
  return (
    <div style={{ position: 'absolute', left: 140, top: 1110, width: 800, height: 800, transform: `translateY(${breathe}px) rotate(${nod}deg)`, transformOrigin: '50% 90%' }}>
      <Img src={staticFile('host/closed.png')} style={{ width: 800, height: 800 }} />
      <svg viewBox="0 0 1024 1024" style={{ position: 'absolute', inset: 0, width: 800, height: 800 }}>
        {open > 0.08 ? <>
          <ellipse cx={490} cy={478} rx={66} ry={24} fill={skin} />
          <ellipse cx={490} cy={482} rx={30 + open * 10} ry={6 + open * 22} fill="#6b2f2f" stroke={line} strokeWidth={7} />
          <ellipse cx={490} cy={492 + open * 10} rx={16 + open * 6} ry={4 + open * 7} fill="#e98a8a" />
        </> : null}
        {blink ? <>
          <ellipse cx={420} cy={366} rx={30} ry={26} fill={skin} /><path d="M392 368 Q420 380 448 368" stroke={line} strokeWidth={8} fill="none" strokeLinecap="round" />
          <ellipse cx={558} cy={366} rx={30} ry={26} fill={skin} /><path d="M530 368 Q558 380 586 368" stroke={line} strokeWidth={8} fill="none" strokeLinecap="round" />
        </> : null}
      </svg>
    </div>
  );
};

const Caption: React.FC<{ words: Timing['words']; keys: string[]; c: typeof CALM[number] }> = ({ words, keys, c }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  let i = words.findIndex(w => w.t > now) - 1; if (i < -1) i = words.length - 1; if (i < 0) return null;
  if (now > words[words.length - 1].t + words[words.length - 1].d + 0.5) return null;
  const start = Math.floor(i / 4) * 4, chunk = words.slice(start, start + 4);
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, top: BOARD.y + BOARD.h + 18, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0 16px', font: `800 62px/1.15 ${SANS}`, color: c.ink }}>
      {chunk.map((w, k) => { const idx = start + k; const key = keys.some(x => w.w.toLowerCase().includes(x));
        return <span key={idx} style={{ color: idx <= i ? (key ? c.a : c.ink) : c.ink + '44' }}>{w.w}</span>; })}
    </div>
  );
};

export const Host: React.FC<ShortProps> = ({ title, scenes, timing, audio, keys = [], theme = 0, sets = [], cast = [] }) => {
  const { fps, durationInFrames } = useVideoConfig(); const f = useCurrentFrame();
  const c = CALM[theme % CALM.length], th = { ...THEMES[0], bg1: c.bg2, bg2: c.bg, a: c.a, b: c.a };
  const starts = scenes.map(s => timing.marks.find(m => m.id === s.id)?.t ?? 0);
  const seq = (i: number) => { const from = Math.round(starts[i] * fps); const to = Math.round((starts[i + 1] ?? durationInFrames / fps) * fps); return { from, durationInFrames: Math.max(1, to - from) }; };
  const scale = BOARD.w / 1080;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${c.bg}, ${c.bg2})`, fontFamily: SANS }}>
      <Audio src={staticFile(audio)} />
      <div style={{ position: 'absolute', top: 60, left: 60, font: `800 40px ${SANS}`, color: c.ink }}>Prep<span style={{ color: c.a }}>Pilot</span></div>
      <div style={{ position: 'absolute', top: 76, right: 60, width: 300, height: 10, borderRadius: 5, background: c.ink + '18' }}><div style={{ width: `${(f / durationInFrames) * 100}%`, height: '100%', borderRadius: 5, background: c.a }} /></div>
      <div style={{ position: 'absolute', left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD.h, borderRadius: 44, overflow: 'hidden', background: c.bg2, boxShadow: '0 20px 50px #0000001a' }}>
        {scenes.map((s, i) => (
          <Sequence key={s.id} {...seq(i)}>
            <Fade dur={seq(i).durationInFrames}>
              <div style={{ width: 1080, height: 1010, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                {s.type === 'end'
                  ? <AbsoluteFill style={{ background: c.bg, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}><div style={{ font: `900 120px ${SANS}`, color: c.ink }}>Prep<span style={{ color: c.a }}>Pilot</span></div><div style={{ font: `700 44px ${SANS}`, color: c.ink, marginTop: 20 }}>More {title} at preppilot.us</div></AbsoluteFill>
                  : (s as ShortScene).actors?.length && cast.some(x => x.image)
                    ? <Stage s={s as ShortScene} dur={seq(i).durationInFrames} th={th as any} i={i} sets={sets} cast={cast} />
                    : <AbsoluteFill style={{ background: c.bg }}><Card s={s as ShortScene} th={th as any} /></AbsoluteFill>}
              </div>
            </Fade>
          </Sequence>
        ))}
      </div>
      <Caption words={timing.words} keys={keys.map(k => k.toLowerCase())} c={c} />
      <HostFigure words={timing.words} />
    </AbsoluteFill>
  );
};
const Fade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' }), interpolate(f, [dur - 6, dur], [1, 0], { extrapolateLeft: 'clamp' }));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
