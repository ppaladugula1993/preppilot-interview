import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';
import timing from '../public/linux.timing.json';
import { C, MONO, SANS, Backdrop, Scene, Kicker, Words, Sub, Chip, Terminal, Rows, Captions, Progress, Brand, useSpring } from './kit';

const at = (id: string) => timing.marks.find(m => m.id === id)!.t;
const ORDER = ['hook', 'uefi', 'grub', 'kernel', 'systemd', 'login', 'chain', 'trap', 'end'];

const Grub: React.FC = () => {
  const f = useCurrentFrame(); const s = useSpring(2);
  const sel = f < 40 ? 1 : 0; // the cursor moves up to the right kernel, then it boots
  const items = ['Ubuntu, Linux 6.8.0-45-generic', 'Ubuntu, Linux 6.8.0-41 (recovery)', 'Advanced options for Ubuntu'];
  return (
    <div style={{ padding: 46, borderRadius: 26, background: '#0a1a3a', border: '4px solid #3b5ba8', font: `500 40px/1.8 ${MONO}`, color: '#cfd9ff', opacity: s, transform: `perspective(1200px) rotateX(${(1 - s) * 30}deg)` }}>
      <div style={{ color: '#8ea2e0', marginBottom: 14 }}>GNU GRUB  version 2.12</div>
      {items.map((t, i) => <div key={i} style={{ padding: '0 14px', borderRadius: 6, background: i === sel ? '#cfd9ff' : 'transparent', color: i === sel ? '#0a1a3a' : '#cfd9ff' }}>{t}</div>)}
      <div style={{ marginTop: 18, color: '#8ea2e0', fontSize: 30 }}>Booting in {Math.max(0, 3 - Math.floor(f / 30))}s</div>
    </div>
  );
};

const Trap: React.FC = () => {
  const f = useCurrentFrame(); const s = useSpring(0); const s2 = useSpring(42);
  const shake = f < 12 ? Math.sin(f * 2.4) * (12 - f) : 0;
  return (
    <div style={{ padding: 54, borderRadius: 36, background: '#2a1f14', border: `4px solid ${C.warn}`, transform: `scale(${0.8 + s * 0.2}) translateX(${shake}px)`, opacity: s, boxShadow: `0 0 80px ${C.warn}33` }}>
      <div style={{ font: `700 34px ${MONO}`, letterSpacing: '.16em', color: C.warn }}>⚠ INTERVIEW TRAP</div>
      <div style={{ marginTop: 28, font: `800 76px/1.1 ${SANS}` }}>"What is PID 1?"</div>
      <div style={{ marginTop: 34, font: `700 58px/1.25 ${SANS}`, color: C.muted, opacity: s2, transform: `translateY(${(1 - s2) * 30}px)` }}>
        <s style={{ textDecorationColor: C.warn }}>The kernel</s> → It's <span style={{ color: C.accent }}>systemd</span>, the first user-space process.
      </div>
    </div>
  );
};

const End: React.FC = () => {
  const s = useSpring(0); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40, fontFamily: SANS, color: C.ink }}>
      <div style={{ font: `900 150px ${SANS}`, letterSpacing: '-.04em', transform: `scale(${0.6 + s * 0.4})`, opacity: s }}>Prep<span style={{ color: C.accent }}>Pilot</span></div>
      <div style={{ font: `600 52px ${SANS}`, color: C.muted, opacity: interpolate(f, [10, 25], [0, 1], { extrapolateRight: 'clamp' }) }}>Interview prep that fits your role</div>
      <div style={{ font: `700 46px ${MONO}`, color: C.accent, opacity: interpolate(f, [20, 35], [0, 1], { extrapolateRight: 'clamp' }) }}>preppilot.us</div>
    </AbsoluteFill>
  );
};

export const Linux: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const starts = ORDER.map(at);
  const seq = (id: string) => { const i = ORDER.indexOf(id); const from = Math.round(starts[i] * fps); const to = Math.round((starts[i + 1] ?? durationInFrames / fps) * fps); return { from, durationInFrames: to - from }; };
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      <Audio src={staticFile('pad.mp3')} volume={0.18} />
      <Audio src={staticFile('linux.mp3')} />
      {ORDER.slice(1).map(id => <Sequence key={id} from={seq(id).from} durationInFrames={14}><Audio src={staticFile('whoosh.mp3')} volume={0.35} /></Sequence>)}

      <Sequence {...seq('hook')}><Scene dur={seq('hook').durationInFrames}><Kicker>Linux · 45 seconds</Kicker><Words text="You press power on a Linux server." size={100} /><Words text="What happens next?" size={128} delay={30} color={C.accent} /></Scene></Sequence>
      <Sequence {...seq('uefi')}><Scene dur={seq('uefi').durationInFrames}><Kicker>Step 1 · Firmware</Kicker><Chip label="UEFI" /><Sub delay={20}>Checks the hardware, then finds a disk to boot from.</Sub></Scene></Sequence>
      <Sequence {...seq('grub')}><Scene dur={seq('grub').durationInFrames}><Kicker>Step 2 · Bootloader</Kicker><Grub /><Sub>GRUB picks which kernel to start.</Sub></Scene></Sequence>
      <Sequence {...seq('kernel')}><Scene dur={seq('kernel').durationInFrames}><Kicker>Step 3 · Kernel</Kicker>
        <Terminal title="dmesg" minH={420} lines={[{ t: '[ 0.000] Linux version 6.8.0-45', c: C.muted, at: 4, speed: 0.6 }, { t: '[ 0.412] Loading drivers...', c: C.muted, at: 34, speed: 0.6 }, { t: '[ 1.937] EXT4-fs: mounted /', c: C.accent, at: 70, speed: 0.7 }]} />
        <Sub delay={20}>Loads drivers, then mounts the root file system.</Sub></Scene></Sequence>
      <Sequence {...seq('systemd')}><Scene dur={seq('systemd').durationInFrames}><Kicker>Step 4 · systemd is PID 1</Kicker>
        <Rows start={30} gap={40} rows={[{ a: 'systemd', b: 'PID 1, starts everything', icon: '1' }, { a: 'network.target', icon: '✓' }, { a: 'sshd.service', icon: '✓' }, { a: 'nginx.service', icon: '✓' }]} /></Scene></Sequence>
      <Sequence {...seq('login')}><Scene dur={seq('login').durationInFrames}><Kicker>Step 5 · Login</Kicker>
        <Terminal title="web-01" lines={[{ t: 'Ubuntu 24.04 LTS web-01 tty1', c: C.muted, at: 2, speed: 0.5 }, { t: 'web-01 login: priya', at: 18, speed: 1.4 }, { t: 'Password: ••••••••', at: 46, speed: 1.4 }, { t: 'priya@web-01:~$ ', c: C.accent, at: 72, speed: 1 }]} /></Scene></Sequence>
      <Sequence {...seq('chain')}><Scene dur={seq('chain').durationInFrames}><Kicker>The whole boot</Kicker>
        <Rows walk start={4} gap={26} rows={[{ a: 'UEFI', b: 'checks hardware', icon: '1' }, { a: 'GRUB', b: 'picks the kernel', icon: '2' }, { a: 'Kernel', b: 'drivers, mounts /', icon: '3' }, { a: 'systemd', b: 'starts services', icon: '4' }, { a: 'Login', b: "you're in", icon: '5' }]} /></Scene></Sequence>
      <Sequence {...seq('trap')}><Scene dur={seq('trap').durationInFrames}><Trap /></Scene></Sequence>
      <Sequence {...seq('end')}><End /></Sequence>

      <Progress marks={starts} total={durationInFrames / fps} />
      <Brand />
      <Captions words={timing.words} keys={['systemd', 'grub', 'uefi', 'kernel', 'pid', 'trap']} />
    </AbsoluteFill>
  );
};
