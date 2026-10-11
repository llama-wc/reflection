# Sources

What was read while working on the transitions, and the idea taken from each. Nothing
was copied: each was read for the technique, then closed, and the version here written
from scratch.

- **Chrome for Developers, "Cross-document view transitions"**
  https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
  Opt in with `@view-transition { navigation: auto; }` on both pages (same origin); it
  covers link clicks and Back/Forward but not navigations started from the browser's own
  UI; navigations over 4 s skip it; `pageswap` / `pagereveal` events; `<link rel=expect
  blocking=render>` holds the first paint until an element exists (use sparingly);
  prerendering (Speculation Rules) makes the transitions feel instant. Chrome 126+,
  Safari 18.2+, not Firefox (which just navigates as before).
- **MDN, `@view-transition`**
  https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition
  The at-rule's syntax (`navigation`, `types`), and that it must be in both documents.
- **web.dev, "How to create high-performance CSS animations"**
  https://web.dev/articles/animations-guide
  Keep animation to transform and opacity; use `will-change` sparingly, added just before
  a change and removed after, since every layer costs memory.
- **Chrome for Developers, "Hardware-accelerated animation capabilities"**
  https://developer.chrome.com/blog/hardware-accelerated-animations
  Transform, opacity and filter animations (CSS or Web Animations) run on the compositor
  thread, so they keep going when the main thread is busy; script-driven changes to the
  same properties don't.
- **Chrome for Developers, "Re-rastering composited layers on scale change"**
  https://developer.chrome.com/blog/re-rastering-composite
  A layer with `will-change: transform` is drawn once into a bitmap and then only moved
  and scaled, never redrawn, while its scale changes; without it, a script-driven scale
  change redraws the content at every new scale. Explains why the board's world layer
  keeps `will-change: transform` (and why it can look soft when zoomed far in).
- **MDN, Speculation Rules API**
  https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API
  Prerendering is same-origin and costs about as much as an iframe; Chromium only.
- **Anime.js docs, "Hardware-accelerated animations"** and **Motion (motion.dev) docs on
  its Web Animations engine**
  https://animejs.com/documentation/web-animation-api/hardware-accelerated-animations ,
  https://motion.dev/docs/improvements-to-the-web-animations-api-dx
  Both libraries hand transform/opacity animations to the Web Animations API so the
  browser can run them off the main thread, and turn a JavaScript easing curve into
  keyframes (or a `linear()` easing) so custom curves still run there. Anime.js notes
  Safari won't accelerate an animation that uses a `linear()` easing.
