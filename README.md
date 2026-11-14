# Le monstre qui ne bouge que dans le noir — vidéo 3D style Roblox (TikTok 9:16)

Vraie animation 3D (Three.js / WebGL) : ville modélisée, personnages Roblox articulés, monstre géant animé,
caméras cinématiques, jour/nuit, orage, pluie, éclairs, sous-titres dynamiques et voix off synchronisée au mot près.
Export : **MP4 H.264 1080 × 1920, 30 i/s, audio AAC** (voix off + bruitages).

## Démarrage rapide

```bash
npm install                 # three.js + police "Luckiest Guy"
npm run preview             # → http://localhost:5173  (lecture avec la voix off, timeline, liste des plans)
npm run sfx                 # (re)génère assets/audio/sfx.wav (bruitages synthétisés)
npm run render              # → out/monstre-dans-le-noir.mp4 (1080×1920, qualité finale)
```

Le rendu passe par Chromium sans écran (Playwright). Sur une machine neuve :
`npm i -D playwright && npx playwright install chromium`.

```bash
node scripts/render.mjs --scale 0.5 --out out/brouillon.mp4    # brouillon rapide en 540×960
node scripts/render.mjs --from 44 --to 50 --out out/extrait.mp4 # un extrait seulement
node scripts/render.mjs --workers 4                            # nombre de navigateurs en parallèle
node scripts/snap.mjs 46.3 113.8                               # images fixes → out/snaps/
```

Le rendu est **déterministe** : chaque image est une fonction pure du temps `t`. La prévisualisation et l'export
donnent exactement la même chose, et chaque image est calée sur l'horloge audio.

## Synchronisation avec la voix off

La voix off (`assets/audio/voiceover.mp3`, 2 min 12,6 s) a été transcrite mot à mot avec Whisper (horodatage de
chaque mot) → `src/transcript.json`. Chaque plan de `src/story.js` démarre sur le mot qui le déclenche (commentaire
au-dessus de chaque plan) et les actions tombent sur les mots : « Boom! » à 46,18 s → explosion du projecteur,
« click! » à 74,66 s → le levier bascule, « Don't move! » à 124,38 s → zoom sur le père… La vidéo dure exactement
la durée de la voix off.

## Les 36 plans

| t (s) | Phrase | Plan |
|---|---|---|
| 0,0 | In our town, there's a monster… | Vol de nuit au-dessus des gratte-ciel jusqu'à la place éclairée |
| 4,0 | And if the lights go out for even one second… | Contre-plongée ; tout s'éteint une seconde, les yeux rougissent |
| 8,3 | Three years ago, it appeared… | Flash-back sépia : le monstre surgit du sol, les passants fuient |
| 11,3 | By sunrise, seven people had vanished. | 7 personnes, 7 coupures de lumière, compteur « MISSING » |
| 14,1 | …when daylight touched its body. It froze. | Lever du soleil nuit → aube → jour, le monstre se fige net |
| 19,0 | …its only weakness. Light. | Orbite autour du visage figé, flash sur « Light » |
| 22,5 | …six enormous floodlights… backup generator. | Les 6 tours surgissent une à une, puis les générateurs |
| 28,6 | Every night, 12 armed guards patrol… | Un garde en patrouille, puis grue sur les 12 gardes |
| 34,3 | …never moved until last night. | Lent zoom sur le visage, coup de zoom final |
| 38,4 | My dad is the head of security… | Le père et le fils marchent vers la place |
| 43,6 | Everything was quiet until 2 a.m. | Plan large calme, horloge « 2:00 AM » |
| 46,05 | Boom! One of the massive floodlights exploded. | Explosion, étincelles, éclats de verre, tremblement |
| 49,45 | Dad stayed calm. "We still have five." | Gros plan du père qui lève la main |
| 52,9 | His radio suddenly crackled. | La radio grésille |
| 55,1 | Chief, the main power cable is damaged… | Le câble crache des étincelles |
| 59,2 | The backup generators were overheating, too. | Générateur qui fume, voyant d'alarme |
| 61,8 | Dad ordered everyone into emergency positions. | Les gardes courent à leur poste |
| 65,1 | Police cars surrounded the square. | Les voitures arrivent, gyrophares |
| 67,9 | Guards aimed their flashlights… lamps through windows. | Faisceaux sur la créature, habitants aux fenêtres |
| 73,3 | Then suddenly, click! The entire town went dark. | Le levier bascule ; vague d'extinction sur toute la ville |
| 77,25 | Only the emergency lights remained… | Lumières de secours rouges |
| 81,0 | …a violent thunderstorm hit. | Éclair, tonnerre, la pluie commence |
| 83,95 | One guard slipped… flashlight into the water. | Le garde glisse, la torche coule dans la flaque |
| 88,75 | Another police car lost its headlights. | Les phares grésillent et s'éteignent |
| 91,4 | "Keep those lights on!" Dad screamed. | Gros plan du père qui crie |
| 93,9 | I rushed forward… tripped over a cable… | Le garçon court, trébuche, la torche s'envole |
| 98,75 | For one terrifying second… darkness. | Noir total, battements de cœur, un éclair révèle qu'il bouge |
| 102,35 | A blood-curdling scream… | Un garde est arraché vers le haut |
| 104,85 | Everyone pointed their lights back at it. | Les faisceaux reviennent |
| 107,4 | The monster froze again, but… | Visage figé, éclairé par en dessous |
| 111,0 | It was no longer standing in the middle… | Vue du dessus : le centre est vide |
| 113,0 | It was right in front of us… | Révélation : il est penché juste au-dessus d'eux |
| 116,6 | …one of our guards, still breathing. | Le garde pend dans sa griffe et respire |
| 119,9 | "Dad! We have to save him!" | Gros plan du garçon |
| 122,25 | Dad grabbed my arm… "Don't move!" | Le père agrippe son bras, zoom sur son visage |
| 125,6 / 129,25 | …he pointed at the monster… "he's already dead." | Il pointe le monstre ; les lumières vacillent → noir, yeux rouges |

## Structure

```
index.html            prévisualisation (lecture synchronisée, timeline, saut direct vers chaque plan)
src/main.js           point d'entrée : rendu, sous-titres, export image par image (window.captureFrame)
src/story.js          LE SCÉNARIO : 36 plans, caméras, animations, lumières, calés sur la voix off
src/world.js          assemblage de la scène 3D
src/city.js           ville : place, routes, immeubles colorés, gratte-ciel, arbres, lampadaires
src/rig.js            personnages Roblox articulés (marche, course, chute, panique, torche…)
src/monster.js        monstre géant articulé (tête haut-parleur, griffes, pointes)
src/props.js          tours de projecteurs, générateurs, clôture, voitures de police, câble
src/effects.js        faisceaux volumétriques, pluie, étincelles, fumée, éclairs
src/env.js            ciel jour/aube/nuit/orage, lumières, brouillard, bloom, étalonnage
src/subtitles.js      sous-titres dynamiques (mots importants en jaune)
src/transcript.json   transcription horodatée de la voix off
scripts/render.mjs    export MP4 (rendu parallèle + mixage voix off / bruitages)
scripts/make-sfx.mjs  bruitages synthétisés (explosion, tonnerre, pluie, sirènes, clic, cœur…)
assets/audio/         voix off + bruitages
assets/reference/     images de référence
```
