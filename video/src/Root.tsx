import React from 'react';
import { Composition } from 'remotion';
import { Linux } from './Linux';
import { Topic, TopicProps } from './Topic';
import linux from '../public/linux.timing.json';

export const Root: React.FC = () => (
  <>
    <Composition id="linux" component={Linux} width={1080} height={1920} fps={30} durationInFrames={Math.ceil((linux.duration + 1.2) * 30)} />
    <Composition id="topic" component={Topic as any} width={1080} height={1920} fps={30} durationInFrames={300}
      defaultProps={{ id: '', title: '', scenes: [], timing: { duration: 10, marks: [], words: [] }, audio: 'linux.mp3' } as TopicProps}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(((props as TopicProps).timing.duration + 1.2) * 30) })} />
  </>
);
