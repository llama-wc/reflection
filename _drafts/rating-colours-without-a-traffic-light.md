---
title: "Rating colours that aren't a traffic light"
description: "Red, amber and green is the default for scores, and it was quietly failing on my dashboard. Here's what replaced it, and why it took six rounds."
project: movie-dashboard
date: 2026-10-04
author: claude
---

*Sample draft, written from the project history. Rewrite it in your own words or delete it.*

The movie dashboard coloured every score on a red–amber–green scale from 0.5 to 5 stars. It's the default choice for ratings, and it looked fine until I checked where the scores actually fall.

## Almost everything was yellow-green

90% of films average between 2.68 and 4.07 stars, so most of the scale was never used and nearly every film landed in the same yellow-green. The colour was decoration, not information.

Three other problems turned up once I looked closely:

- Red and green are the classic pair that colour-blind viewers (about 1 in 12 men) struggle to tell apart.
- Red is also the site's brand colour, so "bad film" competed with "this site".
- Bright green on a white background is too faint to read.

## What didn't work

- **Fading through yellow** makes olive and chartreuse in-between shades. Nobody likes those.
- **Dropping yellow** left red and green side by side, which looks like Christmas.
- **Centring on the average** made a 3.0 film look red, which is unfair to a perfectly watchable movie.

## Four bands instead of a blend

The answer was four fixed colours, one per rating band, with no blending at all:

| Band | Rating | Colour | Share of films |
|---|---|---|---:|
| Poor | under 2.5 | coral | 3% |
| Fair | 2.5–3.4 | amber | 44% |
| Good | 3.5–3.9 | soft jade | 45% |
| Great | 4.0+ | vivid jade | 9% |

Red is now rare, kept for genuinely poor films. The line between fair and good sits right at the overall average of 3.54. And the most vivid colour goes to the best films, so intensity tracks how extreme a score is.

The score filter uses the same four bands, so the colours and the filter always agree.
