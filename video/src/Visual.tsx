// Code-drawn motion-graphics diagrams (no AI images): Lucide icons + simple layouts, smooth springs.
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { icons } from 'lucide-react';

export type VItem = { icon?: string; label?: string; good?: boolean };
export type VSpec = { layout?: string; items?: VItem[] };
const YEL = '#FFE500', CYAN = '#00E5FF', FONT = '"Inter", "Montserrat", "Arial Black", sans-serif';
const pascal = (s = '') => s.replace(/(^|[-_\s]+)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());
const IconBy: React.FC<{ name?: string; size: number; color: string }> = ({ name, size, color }) => {
  const C = (icons as any)[pascal(name)] || (icons as any).Box;
  return <C size={size} color={color} strokeWidth={2.2} absoluteStrokeWidth={false} />;
};
const useIn = (delay: number, cfg = { stiffness: 140, damping: 18 }) => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return spring({ frame: f - delay, fps, config: cfg }); };

const Node: React.FC<{ it: VItem; size: number; delay: number; on?: boolean; dim?: boolean }> = ({ it, size, delay, on, dim }) => {
  const p = useIn(delay);
  const col = on ? YEL : dim ? '#ffffff66' : '#fff';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p})` }}>
      <div style={{ width: size, height: size, borderRadius: size * 0.28, border: `5px solid ${on ? YEL : CYAN}`, display: 'grid', placeItems: 'center', background: on ? '#FFE5001a' : 'transparent' }}>
        <IconBy name={it.icon} size={size * 0.55} color={col} />
      </div>
      {it.label ? <div style={{ font: `800 ${Math.max(30, size * 0.2)}px ${FONT}`, color: col, textTransform: 'uppercase', textAlign: 'center', maxWidth: size * 1.6 }}>{it.label}</div> : null}
    </div>
  );
};
const Arrow: React.FC<{ delay: number; vertical?: boolean }> = ({ delay, vertical }) => {
  const p = useIn(delay, { stiffness: 90, damping: 20 });
  return vertical
    ? <div style={{ width: 6, height: 60 * p, background: CYAN, borderRadius: 3, alignSelf: 'center' }} />
    : <div style={{ display: 'flex', alignItems: 'center', height: 6 }}><div style={{ width: 70 * p, height: 6, background: CYAN, borderRadius: 3 }} /><div style={{ width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderLeft: `20px solid ${CYAN}`, opacity: p }} /></div>;
};

export const Visual: React.FC<{ v: VSpec; dur: number }> = ({ v, dur }) => {
  const f = useCurrentFrame();
  const items = (v.items || []).slice(0, 6); const n = items.length || 1;
  const active = Math.min(n - 1, Math.max(0, Math.floor(((f - 12) / Math.max(1, dur - 22)) * n)));
  const box: React.CSSProperties = { position: 'absolute', left: 60, right: 60, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  switch (v.layout) {
    case 'flow': {
      const vertical = n > 3;
      return <div style={{ ...box, flexDirection: vertical ? 'column' : 'row', gap: vertical ? 10 : 18 }}>
        {items.map((it, i) => <React.Fragment key={i}>{i ? <Arrow delay={i * 12 - 4} vertical={vertical} /> : null}<Node it={it} size={vertical ? 120 : 190} delay={i * 12} on={i === active} /></React.Fragment>)}
      </div>;
    }
    case 'stack':
      return <div style={{ ...box, flexDirection: 'column-reverse', gap: 18 }}>
        {items.map((it, i) => { const p = useIn(i * 10);
          return <div key={i} style={{ width: 720 - i * 40, padding: '22px 34px', borderRadius: 26, border: `5px solid ${i === n - 1 ? YEL : CYAN}`, display: 'flex', alignItems: 'center', gap: 26, opacity: p, transform: `translateY(${(1 - p) * 80}px)` }}>
            <IconBy name={it.icon} size={64} color={i === n - 1 ? YEL : '#fff'} /><span style={{ font: `800 42px ${FONT}`, color: '#fff', textTransform: 'uppercase' }}>{it.label}</span></div>; })}
      </div>;
    case 'compare': {
      const vs = useIn(10, { stiffness: 200, damping: 14 });
      return <div style={{ ...box, gap: 40 }}>
        <Node it={items[0] || {}} size={250} delay={0} on={f > dur / 2 ? false : true} dim={f > dur / 2} />
        <div style={{ font: `900 64px ${FONT}`, color: YEL, transform: `scale(${vs})` }}>VS</div>
        <Node it={items[1] || {}} size={250} delay={8} on={f > dur / 2} dim={f <= dur / 2} />
      </div>;
    }
    case 'hub': {
      const R = 290, rest = items.slice(1);
      return <div style={box}><div style={{ position: 'relative', width: 0, height: 0 }}>
        <svg style={{ position: 'absolute', left: -R - 120, top: -R - 120, overflow: 'visible' }} width={2 * R + 240} height={2 * R + 240}>
          {rest.map((_, i) => { const a = (i / rest.length) * Math.PI * 2 - Math.PI / 2; const p = interpolate(f, [8 + i * 6, 24 + i * 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const c = R + 120; return <line key={i} x1={c} y1={c} x2={c + Math.cos(a) * R * p} y2={c + Math.sin(a) * R * p} stroke={CYAN} strokeWidth={6} strokeLinecap="round" />; })}
        </svg>
        <div style={{ position: 'absolute', transform: 'translate(-50%, -50%)' }}><Node it={items[0] || {}} size={200} delay={0} on /></div>
        {rest.map((it, i) => { const a = (i / rest.length) * Math.PI * 2 - Math.PI / 2; return <div key={i} style={{ position: 'absolute', left: Math.cos(a) * R, top: Math.sin(a) * R, transform: 'translate(-50%, -50%)' }}><Node it={{ icon: it.icon }} size={130} delay={14 + i * 6} /></div>; })}
      </div></div>;
    }
    case 'list':
      return <div style={{ ...box, flexDirection: 'column', alignItems: 'stretch', gap: 26, padding: '0 40px' }}>
        {items.map((it, i) => { const p = useIn(i * 12);
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateX(${(1 - p) * -60}px)` }}>
            <div style={{ width: 84, height: 84, borderRadius: 42, display: 'grid', placeItems: 'center', background: it.good === false ? '#ffffff22' : YEL }}><IconBy name={it.good === false ? 'x' : 'check'} size={50} color={it.good === false ? '#fff' : '#0A0A0F'} /></div>
            <IconBy name={it.icon} size={70} color={CYAN} /><span style={{ font: `800 44px ${FONT}`, color: it.good === false ? '#ffffff88' : '#fff', textTransform: 'uppercase' }}>{it.label}</span></div>; })}
      </div>;
    case 'grid':
      return <div style={{ ...box, flexWrap: 'wrap', gap: 40, alignContent: 'center' }}>
        {items.map((it, i) => <Node key={i} it={it} size={n > 4 ? 170 : 210} delay={i * 7} on={i === active} />)}
      </div>;
    default: {
      const pulse = 1 + Math.sin(f / 12) * 0.02;
      return <div style={{ ...box, transform: `scale(${pulse})` }}><Node it={items[0] || {}} size={380} delay={0} on /></div>;
    }
  }
};
