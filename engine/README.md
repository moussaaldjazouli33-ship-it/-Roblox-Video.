# Roblox-style 3D story renderer

Procedural three.js scenes rendered frame-by-frame in headless Chromium and encoded with ffmpeg.
Output: 1080×1920, 30 fps, H.264 MP4, voiceover muxed in. **No text is ever drawn on screen** — the
script's on-screen messages are shown as symbols only, so captions can be added in CapCut.

```
npm install            # three.js
node render.mjs --story trevor --out trevor.mp4 --audio audio/trevor_voice.mp3
node render.mjs --story trevor --stills 1,12.5,40 --outdir stills   # quick look-dev frames
```

## Files
- `src/world.js` – sunset street, lighting, moods (sunset / tense / danger / night / interiors), dust & flying paper
- `src/character.js` – blocky rig (walk, run, zombie, sit, bow, shush, reach, hold, swim) + face expressions
- `src/sets.js` – street hatches, ocean glass dome, mansion pool, silent bunker, gas station, hospital, Bunker 100 (vault + monitor wall), lab
- `src/stories/trevor.js` – the 45 shots, each starting and ending on a pause in the voiceover

## Voiceover timing (from pause detection)
| time | line | visual |
|---|---|---|
| 0.0–2.8 | In this town, everyone has a bunker except me. | behind Trevor walking the sunset street, families by their hatches |
| 2.8–4.7 | My name is Trevor. | front close-up |
| 4.7–7.1 | Ten years ago, the zombie apocalypse began, | people fleeing a horde (red sky) |
| 7.1–9.3 | …every family received an underground bunker. | family climbs down a hatch |
| 9.3–11.1 | But each bunker was different. | aerial over colourful hatches |
| 11.1–14.5 | No. 1 glass beneath the ocean | glass dome, fish, light shafts |
| 14.5–18.5 | No. 7 luxury mansion, pool, food | pool + banquet |
| 18.5–21.7 | No. 12 … never make a sound. | red-bulb bunker, father shushes |
| 21.7–23.0 | But I had no bunker. | Trevor alone, hatch closes |
| 23.0–26.6 | gas station … hiding from zombies | night exterior, Trevor curled inside |
| 26.6–29.9 | Until I noticed… never attacked me. | zombie lunges, stops |
| 29.9–33.3 | They chased everyone else… stopped and stared. | chase, then zombies turn to stare |
| 33.3–35.7 | followed them to an abandoned hospital | night hospital, red-cross emblem |
| 35.7–38.9 | giant metal door marked Bunker 100 | vault door with glowing emblem (no digits) |
| 38.9–41.0 | touched it, the door opened | hand touch, door splits, flash |
| 41.0–47.9 | monitors … SUBJECT ZERO HAS RETURNED | monitor wall; big screen = Trevor icon + target |
| 47.9–51.5 | every screen turned red. LOCKDOWN | red wave, beacons, door slams |
| 51.5–56.9 | turned around … zombies … bowing | horde in the room, bows in a wave |
| 56.9–61.5 | old recording … newborn … that baby was me | sepia lab footage, baby close-up |
| 61.5–65.2 | three words: THE FIRST INFECTED | biohazard symbol, Trevor's eyes |
| 65.2–71.3 | understood … protect everyone from me | night street aerial; Trevor's eyes turn red |
| 71.3–76.2 | SUBJECT ZERO ACTIVATED. A countdown began. | red icon + ring of 10 lights |
| 76.2–78.9 | 10… 9… 8… | three hard cuts on each number, lights go out |
| 78.9–81.2 | every bunker door started opening | hatches open down the street with light beams |
| 81.2–84.1 | Phase Two has begun. | Trevor with glowing eyes among zombies, fade out |
