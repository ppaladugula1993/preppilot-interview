// BrainrotShorts-style explainer: solid #0A0A0F, ALL-CAPS ExtraBold title with one yellow accent word,
// flat vector image in the middle, 2-word captions at the bottom. Hard cuts, springy pop-ins, no shake/rotation.
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import type { Timing } from './Topic';

export type BrainScene = { id: string; say: string; title: string; accent?: string; subtitle?: string; image?: string };
export type BrainProps = { id: string; title: string; scenes: BrainScene[]; timing: Timing; audio: string };

const BG = '#0A0A0F', YEL = '#FFE500', FONT = '"Inter", "Montserrat", "Arial Black", sans-serif';
const POP = { stiffness: 200, damping: 20 };

// Count numbers up from 0 (ease-out) over the first 0.8s.
const Count: React.FC<{ text: string; f: number }> = ({ text, f }) => {
  const m = text.match(/^(\D*)(\d[\d,.]*)(.*)$/); if (!m) return <>{text}</>;
  const target = parseFloat(m[2].replace(/,/g, '')); const dec = (m[2].split('.')[1] || '').length;
  const v = interpolate(f, [0, 24], [0, target], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return <>{m[1]}{v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{m[3]}</>;
};

const SceneView: React.FC<{ s: BrainScene; dur: number }> = ({ s, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const words = s.title.toUpperCase().split(/\s+/).filter(Boolean);
  const acc = (s.accent || '').toUpperCase().split(/\s+/).filter(Boolean);
  const size = s.title.length > 34 ? 95 : 110;
  const imgIn = spring({ frame: f - 4, fps, config: { stiffness: 180, damping: 12 } });
  const zoom = interpolate(f, [0, dur], [1, 1.05]);
  const sub = spring({ frame: f - words.length * 3 - 4, fps, config: POP });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 250, height: 420, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-end', justifyContent: 'center', gap: '0 24px', font: `900 ${size}px/1.05 ${FONT}`, color: '#fff', textAlign: 'center' }}>
        {words.map((w, i) => { const p = spring({ frame: f - i * 3, fps, config: POP }); const isAcc = acc.some(a => w.replace(/[^A-Z0-9%$]/g, '') === a.replace(/[^A-Z0-9%$]/g, ''));
          return <span key={i} style={{ display: 'inline-block', opacity: p, transform: `scale(${0.9 + 0.1 * p})`, color: isAcc ? YEL : '#fff' }}>{/\d/.test(w) ? <Count text={w} f={f - i * 3} /> : w}</span>; })}
      </div>
      {s.subtitle ? <div style={{ position: 'absolute', left: 120, right: 120, top: 700, textAlign: 'center', font: `500 40px/1.3 ${FONT}`, color: '#ffffffb3', opacity: sub, transform: `scale(${0.9 + 0.1 * sub})` }}>{s.subtitle}</div> : null}
      {s.image ? <div style={{ position: 'absolute', left: 190, top: 800, width: 700, height: 700, transform: `scale(${(0.9 + 0.1 * imgIn) * zoom})`, opacity: Math.min(1, imgIn * 1.5) }}>
        <Img src={staticFile(s.image)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 60px 40px ${BG}` }} />
      </div> : null}
    </AbsoluteFill>
  );
};

const Captions: React.FC<{ words: Timing['words'] }> = ({ words }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const now = f / fps;
  let i = words.findIndex(w => w.t > now) - 1; if (i < -1) i = words.length - 1; if (i < 0) return null;
  if (now > words[words.length - 1].t + words[words.length - 1].d + 0.4) return null;
  const start = Math.floor(i / 2) * 2, pair = words.slice(start, start + 2);
  return (
    <div style={{ position: 'absolute', left: 120, right: 120, top: 1600, display: 'flex', justifyContent: 'center', gap: 20, font: `900 64px ${FONT}`, textTransform: 'uppercase' }}>
      {pair.map((w, k) => <span key={k} style={{ color: start + k === i ? YEL : '#fff' }}>{w.w.replace(/[.,!?;:]$/, '')}</span>)}
    </div>
  );
};

export const Brain: React.FC<BrainProps> = ({ scenes, timing, audio }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const starts = scenes.map(s => timing.marks.find(m => m.id === s.id)?.t ?? 0);
  const seq = (i: number) => { const from = Math.round(starts[i] * fps); const to = Math.round((starts[i + 1] ?? durationInFrames / fps) * fps); return { from, durationInFrames: Math.max(1, to - from) }; };
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Audio src={staticFile(audio)} />
      {scenes.map((s, i) => <Sequence key={s.id} {...seq(i)}><SceneView s={s} dur={seq(i).durationInFrames} /></Sequence>)}
      <Captions words={timing.words} />
    </AbsoluteFill>
  );
};
