import React from 'react';
import { Composition } from 'remotion';
import { Linux } from './Linux';
import linux from '../public/linux.timing.json';

export const Root: React.FC = () => (
  <Composition id="linux" component={Linux} width={1080} height={1920} fps={30} durationInFrames={Math.ceil((linux.duration + 1.2) * 30)} />
);
