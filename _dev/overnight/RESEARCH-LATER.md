# To look up later

Things I'd have looked up tonight if I'd had the network, from 23:35 (offline) on. Most
likely to change a decision first. **[depends]** marks an assumption the results or the
code on the branch rely on: check those first.

1. **[depends] Does Chromium skip drawing a layer at opacity 0, and does it still raster
   its tiles?**
   Why: in flight, the strings that aren't the current page's sit on one sheet faded to
   opacity 0 for the whole flight. The measured gain says it's cheap, but I don't know
   whether it's cheap because nothing is drawn, or only because it's no longer redrawn
   every frame. If tiles are still rastered as the camera moves into new areas, an
   explicit `visibility: hidden` (or `content-visibility: hidden` on a wrapper) once the
   fade ends could save more.
   Assumed: an opacity-0 layer costs nothing per frame. Where: Chromium's cc source
   (`draw_property_utils`, `PictureLayerImpl`, tile priority), the "Life of a pixel" talk.

2. **[depends] Why did the cards' opacity fades restyle every card every frame?**
   The trace shows no "couldn't run on the compositor" reason for those animations, yet
   each frame re-styled all ~170 cards with "Animation" as the reason (30-58 ms a frame).
   Why: if composited CSS transitions still cost main-thread style work per element per
   frame, that's a general rule for the site (avoid many simultaneous transitions, even
   on opacity). If it's something specific (the cards hold iframes, or the `covered`
   rule swaps their `transition` list mid-animation), a smaller fix exists.
   Assumed: many simultaneous transitions are expensive whatever the property; one
   animation over a veil is the safe pattern. Where: Blink's `CompositorAnimations`
   (failure reasons enum), `ElementAnimations`, Chromium bug tracker.

3. **What the trace's `compositeFailed` bit values mean** (8192, 131072, 32...).
   Why: I guessed 8192 = unsupported property and 131072 = "no visible change"; the
   strings' `--a` / SVG `transform` fades were the main-thread ones. Knowing the exact
   reasons would say which of the remaining small fades could move off the main thread.
   Where: Blink `compositor_animations.h` (`FailureReason`).

4. **How Chromium picks the raster scale of a `will-change: transform` layer when it is
   zoomed far out** (the whole board in board view, after being drawn at ~3.5x on a page).
   Why: the trace while going into board view showed the compositor waiting on tiles. My
   one experiment (removing `will-change` from the world) made no difference, so I left
   it, but a smarter choice (re-applying `will-change` at the overview scale once the
   camera arrives) might help big boards. Where: cc `PictureLayerImpl::ShouldAdjustRasterScale`,
   the 2016 Chrome post on re-rastering (in SOURCES.md) is out of date.

5. **Is CDP CPU throttling a busy-wait?**
   Why: with 4x throttling, total browser CPU was ~2.4 s for every 3 s of idle, so I only
   trust the CPU column at normal speed. If throttling is implemented by spinning the
   main thread, that's expected; if not, something on the page is busy while idle.
   Where: Chromium `Emulation.setCPUThrottlingRate` implementation (`CPUThrottlingManager`).

6. **Do cross-document View Transitions run for script navigations
   (`location.replace`) and inside iframes, and what does current guidance say about
   them and `prefers-reduced-motion`?**
   Why: decides whether they're worth adding for the site's plain pages, which with
   animations on are almost all shown inside the garden anyway. Assumed: only
   user-started main-frame navigations get one (as the Chrome docs said before I went
   offline). Where: CSS View Transitions Level 2 spec, MDN, WebKit blog.

7. **Firefox and WebKit: do they composite opacity transitions on many elements, and
   how do they handle transitions on registered custom properties (`@property`)?**
   Why: all the measuring is in Chromium; the fixes should help everywhere, but I can
   only check the other two for correctness, not for cost. Where: MDN compat data,
   WebKit and Gecko bug trackers.

8. **Why the LayerTree DevTools domain sends nothing in headless Chromium.**
   Why: tooling only. Counting layers directly would have been quicker than bisecting
   with CSS switched off. Where: Chrome DevTools Protocol docs, Puppeteer issues.
