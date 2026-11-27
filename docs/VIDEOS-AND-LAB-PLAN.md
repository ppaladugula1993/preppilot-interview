# Plan: explainer videos for every topic, a Watch tab, Home update, Interview Lab by technology

Agreed 27 Nov 2026: build everything at once (no waves). Save to git after each topic's video.

## 1. Video generator (all 72 topics)
- **Script per topic** (`video/topics/<topic>.json`): written by AI from that topic's own lessons, cards and
  Why · Example · Trap, as 7–9 scenes of about 45 seconds total. A second AI pass checks every fact; a topic is
  only rendered when its script passes.
- **Scene templates** (Remotion, `video/src/`): hook, chip/icon, terminal, rows (list), chain (steps that light up),
  compare (X vs Y), code, trap, end card. The AI picks templates and fills them; no per-topic code.
- **Voice**: Azure neural TTS (resource `preppilot-speech`, free tier) with word timings, so scenes and captions
  sync to the narration.
- **Render**: 1080x1920, 30 fps, H.264 + AAC, compressed to about 4–6 MB.
- **Hosting**: Azure Blob Storage container `videos` (the website's hosting plan has a 250 MB limit, so videos
  can't live there). Public read, cached. About 1 cent a month for all 72.
- **Manifest**: `web/content/videos.json` lists every finished video (topic, title, URL, poster, duration, a quiz card).
- **Save as we go**: after each topic renders and uploads, commit its script + timing + manifest entry and push.

## 2. Watch tab (Reels-style)
- Side-panel item **Watch**. Vertical, swipeable, one video at a time, in the user's plan order.
- After each video: **one quick question** from that topic (Show answer → Knew it / Not yet) before the next video.
- **Practise 5 cards** button after each video.
- After about 5 videos in a row: "Nice run. 5 quick cards to lock it in?"
- Progress, streaks and "ready %" move only with cards, not with watching.
- Free: videos for the first 3 topics of the plan; Pro: all.
- A **Watch 45s** button at the top of each topic's lessons.

## 3. Home page
- New **Watch** strip: "Learn it in 45 seconds", with the next 3 videos for your plan.
- New **Interview Lab** card on Home: "Worked answers for <your stack>".
- Landing page (signed out): add Watch and Interview Lab to "See it move."

## 4. Interview Lab by technology
- Today: 5 formats (system design, coding, SQL, low-level design, behavioral), 82 questions.
- Add **"By technology"**: for each of the 72 topics, 6 real interview questions with full worked answers
  (approach, steps, code/commands where useful, mistakes, follow-ups), generated from the topic's cards and
  fact-checked, like the existing Lab answers. About 430 new answers.
- Lab home: "For your stack" first (topics from the user's roles), then the 5 formats, then "All technologies".

## Order of work
1. Generic video renderer + scene templates, Blob storage, manifest. Verify on Linux.
2. Script writer + fact check; render all 72 topics, committing after each.
3. Watch tab, Home and landing updates (in parallel with the rendering).
4. Interview Lab by technology (generation in parallel with the rendering), then the Lab home revamp.
5. Test on a phone size, deploy, update the TestFlight build if needed.
