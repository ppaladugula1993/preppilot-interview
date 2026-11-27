// Voice for one topic: Azure neural TTS with a bookmark per scene and word timings, so the video
// syncs scenes and captions to the narration.  node tts.mjs topics/linux.json
import sdk from 'microsoft-cognitiveservices-speech-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cfg = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION || 'eastus');
cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${t.voice}"><mstts:express-as style="friendly"><prosody rate="+6%">`
  + t.scenes.map(s => `<bookmark mark="${s.id}"/>${esc(s.text)}<break time="350ms"/>`).join('') + `</prosody></mstts:express-as></voice></speak>`;
const synth = new sdk.SpeechSynthesizer(cfg, null);
const words = [], marks = [];
synth.wordBoundary = (_, e) => { if (e.boundaryType === sdk.SpeechSynthesisBoundaryType.Word) words.push({ w: e.text, t: e.audioOffset / 1e7, d: e.duration / 1e7 }); };
synth.bookmarkReached = (_, e) => marks.push({ id: e.text, t: e.audioOffset / 1e7 });
synth.speakSsmlAsync(ssml, r => {
  if (r.reason !== sdk.ResultReason.SynthesizingAudioCompleted) { console.error('TTS failed:', r.errorDetails); process.exit(1); }
  writeFileSync(`public/${t.id}.mp3`, Buffer.from(r.audioData));
  const dur = r.audioDuration / 1e7;
  writeFileSync(`public/${t.id}.timing.json`, JSON.stringify({ duration: dur, marks, words }, null, 1));
  console.log(`${t.id}: ${dur.toFixed(1)}s, ${words.length} words, ${marks.length} scenes`);
  synth.close();
}, e => { console.error(e); process.exit(1); });
