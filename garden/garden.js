// Garden prototype: the whole site as a board of pages.
//
// Normally you only see one page. Opening a link flies the camera across the
// board to that page's card. Each card looks like its page (a screenshot, or
// a live copy for notes) with the title written large across it. On arrival
// the card lines up exactly with the page area, the live page fades in, and
// the large title glides down into the page's own heading.
// "Board view" pulls back to the whole board for free panning and zooming.
(function () {
    const data = JSON.parse(document.getElementById('garden-data').textContent);

    // Cards have the shape of the page area in this window (everything above the
    // bottom bar), so a card lines up exactly with its page when the camera is on it.
    // PAGE_W x PAGE_H is that area; the board is laid out again when it changes.
    // The stock screenshots (garden/thumbs) and their heading data are 1400 x 848.
    const STOCK_W = 1400, STOCK_H = 848;
    const CARD_W = 400;
    let PAGE_W = STOCK_W, PAGE_H = STOCK_H, CARD_H = Math.round(CARD_W * PAGE_H / PAGE_W);
    const COL_GAP = 170, ROW_GAP = 120, REGION_PAD = 34;
    const TITLE_SCALE = 4;     // the most a page's heading is ever enlarged on its card
    const TITLE_MIN_PX = 32;   // ...which happens only to keep it at least this big on screen
    const BAR = 52;      // bottom bar height; the page area is everything above it
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FLY_SPEED = Math.min(Math.max(Number(new URLSearchParams(location.search).get('fly')) || 1, 0.25), 4);

    const board = document.getElementById('board');
    const world = document.getElementById('world');
    const strings = d3.select('#strings');
    const page = document.getElementById('page');
    const frame = document.getElementById('page-frame');
    const morphLayer = document.getElementById('morph');
    const toggle = document.getElementById('board-toggle');
    const hint = document.getElementById('board-hint');
    if (window.matchMedia('(pointer: coarse)').matches) hint.textContent = 'Drag to move, pinch to zoom, tap a card to open it.';

    // Read the page area's size; true if it changed
    function measurePage() {
        const w = Math.max(320, board.clientWidth), h = Math.max(240, board.clientHeight - BAR);
        if (w === PAGE_W && h === PAGE_H) return false;
        PAGE_W = w; PAGE_H = h; CARD_H = Math.round(CARD_W * PAGE_H / PAGE_W);
        return true;
    }
    measurePage();

    // ---------- nodes ----------
    const regionKeys = new Set(data.regions.map(r => r.key));
    const nodes = new Map();
    for (const p of data.pages) nodes.set(p.id, { ...p });
    for (const n of data.notes) {
        nodes.set(n.id, { ...n, region: n.project && regionKeys.has(n.project) ? n.project : 'thinking' });
    }

    // Map any link (relative, absolute, or the live mac-wall.com address) to a node.
    function keyFor(href) {
        let u;
        try { u = new URL(href, location.href); } catch (e) { return null; }
        const sameSite = u.origin === location.origin || (/(^|\.)mac-wall\.com$/.test(u.hostname) && u.hostname !== 'elenchus.mac-wall.com');
        return (sameSite ? u.pathname : `${u.origin}${u.pathname}`).replace(/index\.html$/, '');
    }
    const byKey = new Map();
    for (const n of nodes.values()) {
        byKey.set(keyFor(n.url), n);
        for (const a of n.aliases || []) byKey.set(keyFor(a), n);
    }
    const nodeFor = href => byKey.get(keyFor(href)) || null;

    // ---------- layout: Home first, then outward ----------
    // The board runs along one direction: left to right in a wide window, top to bottom
    // in a tall one (a phone upright), the same graph turned with the cards kept upright.
    // Step 0: Home. Step 1: Portfolio and Notes. Step 2: one project per lane, side by
    // side across the board. Steps 3+: that project's notes, oldest to newest, zigzagging
    // either side of a channel in line with the project, so each note's string back to
    // the project runs along the channel instead of under the other notes.
    const vertical = () => PAGE_H > PAGE_W;
    const rows = data.regions
        .filter(r => r.key !== 'hub')
        .map(r => {
            const project = nodes.get(r.key);
            const notes = [...nodes.values()].filter(n => n.kind === 'Note' && n.region === r.key)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            return { region: r, project: project && project.region === r.key ? project : null, notes };
        })
        .filter(row => row.project || row.notes.length);
    const CHANNEL = 110;     // the gap between a project's two lanes of notes
    // Every card sits a few px off its spot, the same few each time, as if pinned by hand
    const seeded = (key, salt) => {
        let h = 2166136261;
        for (const c of key + salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return ((h >>> 0) % 10000) / 10000;
    };
    const JITTER = 4;
    const nudge = n => { n.x += (seeded(n.id, 'x') - 0.5) * 2 * JITTER; n.y += (seeded(n.id, 'y') - 0.5) * 2 * JITTER; };
    let regionBoxes = [];
    const hubName = (data.regions.find(r => r.key === 'hub') || {}).name || '';
    function computeLayout() {
        // u runs along the board, v across it; a card is lenU along and lenV across
        const lenU = vertical() ? CARD_H : CARD_W, lenV = vertical() ? CARD_W : CARD_H;
        const put = (n, u, v) => { if (!n) return; [n.x, n.y] = vertical() ? [v, u] : [u, v]; };
        const step = lenU + COL_GAP, at = i => i * step;
        const laneW = row => (row.notes.length > 1 ? 2 * lenV + CHANNEL : lenV);
        const laneAt = i => rows.slice(0, i).reduce((v, row) => v + laneW(row) + ROW_GAP, 0);
        rows.forEach((row, i) => {
            const side = laneAt(i), two = row.notes.length > 1;
            put(row.project, at(2), side + (laneW(row) - lenV) / 2);
            row.notes.forEach((n, j) => put(n,
                at(3) + Math.floor(j / 2) * step + (j % 2) * step / 2,
                !two ? side : j % 2 ? side + lenV + CHANNEL : side));
        });
        const mid = (laneAt(rows.length) - ROW_GAP - lenV) / 2;
        put(nodes.get('home'), at(0), mid);
        put(nodes.get('portfolio'), at(1), mid - (lenV + ROW_GAP) / 2);
        put(nodes.get('notes'), at(1), mid + (lenV + ROW_GAP) / 2);
        nodes.forEach(n => { if (n.x !== undefined) nudge(n); });

        const box = (name, cards) => {
            const xs = cards.map(n => n.x), ys = cards.map(n => n.y);
            return {
                name,
                x: Math.min(...xs) - REGION_PAD, y: Math.min(...ys) - REGION_PAD,
                w: Math.max(...xs) - Math.min(...xs) + CARD_W + REGION_PAD * 2,
                h: Math.max(...ys) - Math.min(...ys) + CARD_H + REGION_PAD * 2,
            };
        };
        regionBoxes = [
            box(hubName, ['home', 'portfolio', 'notes'].map(id => nodes.get(id)).filter(Boolean)),
            ...rows.map(row => box(row.region.name, [row.project, ...row.notes].filter(Boolean))),
        ];
    }
    computeLayout();

    // ---------- strings ----------
    const edges = new Map();
    const addEdge = (a, b, kind) => {
        if (!a || !b || a === b) return;
        const key = [a.id, b.id].sort().join('|');
        if (!edges.has(key) || kind === 'relation') edges.set(key, { a, b, kind });
    };
    for (const [a, b] of data.hubLinks || []) addEdge(nodes.get(a), nodes.get(b), 'relation');
    for (const n of nodes.values()) for (const id of n.links || []) addEdge(n, nodes.get(id), 'relation');
    for (const n of nodes.values()) {
        if (n.kind !== 'Note') continue;
        addEdge(nodes.get('notes'), n, 'chrono');
        if (n.project) addEdge(nodes.get(n.project), n, 'relation');
        const doc = new DOMParser().parseFromString(n.html || '', 'text/html');
        for (const a of doc.querySelectorAll('a[href]')) addEdge(n, nodeFor(a.getAttribute('href')), 'relation');
    }
    // Strings run taut and straight between the sides of their two cards that face each
    // other, the way someone would string a board by hand: of the ways that don't cross
    // another card, the shortest. The ends tuck a few px under the cards. A string that
    // can't avoid crossing a card is "buried": it runs centre to centre underneath,
    // drawn faintly until one of its cards is lit (or pointed at).
    const TUCK = 6;
    const SIDES4 = ['left', 'right', 'top', 'bottom'];
    function pinPoint(n, side, t) {
        if (side === 'left') return [n.x, n.y + t * CARD_H];
        if (side === 'right') return [n.x + CARD_W, n.y + t * CARD_H];
        if (side === 'top') return [n.x + t * CARD_W, n.y];
        return [n.x + t * CARD_W, n.y + CARD_H];
    }
    // Does the straight line from p to q pass over any card (its own two included), or
    // brush past another card's edge? Each card is a box (grown by `clear` for other
    // cards, shrunk by 1px for the string's own two, whose edges it starts on); the line
    // crosses it if clipping the line to the box leaves any of it.
    const CLEAR = 4;
    // A project's strings to its own notes run down the channel between their lanes; to
    // far notes they run nearly along it, so they may graze the edges of the notes they
    // pass (by up to a nudge's worth), where the string slips just under a card's edge
    const GRAZE = -(JITTER + 1);
    const ownNote = e => (e.a.kind === 'Note' && e.a.region === e.b.id) || (e.b.kind === 'Note' && e.b.region === e.a.id);
    function crossesCard([x1, y1], [x2, y2], e) {
        const dx = x2 - x1, dy = y2 - y1, clear = ownNote(e) ? GRAZE : CLEAR;
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        for (const n of nodes.values()) {
            if (n.x === undefined) continue;
            const m = n === e.a || n === e.b ? -1 : clear;
            const left = n.x - m, right = n.x + CARD_W + m, top = n.y - m, bottom = n.y + CARD_H + m;
            if (maxX <= left || minX >= right || maxY <= top || minY >= bottom) continue;   // nowhere near
            // Clip the line (as t from 0 to 1) to the box, one side at a time
            let t0 = 0, t1 = 1;
            for (const [d, lo, hi, at] of [[dx, left, right, x1], [dy, top, bottom, y1]]) {
                if (d === 0) {
                    if (at <= lo || at >= hi) { t0 = 1; break; }
                    continue;
                }
                let a = (lo - at) / d, b = (hi - at) / d;
                if (a > b) [a, b] = [b, a];
                t0 = Math.max(t0, a); t1 = Math.min(t1, b);
                if (t0 >= t1) break;
            }
            if (t1 - t0 > 1e-6) return true;
        }
        return false;
    }
    function stringRoute(e) {
        const key = e.a.id + '|' + e.b.id;
        let best = null;
        // Where on a side to pin: toward the other card, so strings leaving one card fan
        // out in order instead of crossing, give or take a little
        const spot = (n, m, side, salt) => {
            const dx = m.x - n.x, dy = m.y - n.y, toward = (side === 'left' || side === 'right' ? dy : dx) / (Math.abs(dx) + Math.abs(dy) || 1);
            return 0.5 + 0.35 * toward + (seeded(key, side + salt) - 0.5) * 0.08;
        };
        for (const sa of SIDES4) for (const sb of SIDES4) {
            const p = pinPoint(e.a, sa, spot(e.a, e.b, sa, 'a'));
            const q = pinPoint(e.b, sb, spot(e.b, e.a, sb, 'b'));
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if ((!best || len < best.len) && !crossesCard(p, q, e)) best = { p, q, len };
        }
        const buried = !best;
        if (buried) {                             // centre to centre, under whatever's between
            const c = n => [n.x + CARD_W / 2, n.y + CARD_H / 2];
            best = { p: c(e.a), q: c(e.b) };
        }
        // Tuck the ends under the cards
        const tuck = buried ? 0 : TUCK, [[x1, y1], [x2, y2]] = [best.p, best.q];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        return { route: [[x1 - ux * tuck, y1 - uy * tuck], [x2 + ux * tuck, y2 + uy * tuck]], buried };
    }

    // ---------- draw ----------
    const regionEls = regionBoxes.map(b => {
        const el = document.createElement('div');
        el.className = 'region';
        const label = el.appendChild(document.createElement('div'));
        label.className = 'region-label';
        label.textContent = b.name;
        world.insertBefore(el, world.firstChild);
        return el;
    });
    function placeRegions() {
        regionBoxes.forEach((b, i) => Object.assign(regionEls[i].style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` }));
    }
    placeRegions();
    // Each string is a length of yarn (see the patterns in garden/index.html) lying
    // along the x axis and turned into place, over a faint shadow on the board. The
    // yarn starts at a different point on each string so neighbours don't match, and
    // a brighter copy fades in over it when the string is lit.
    const strands = strings.selectAll('g.strand').data([...edges.values()]).join(enter => {
        const g = enter.append('g').attr('class', e => `strand ${e.kind}`);
        g.append('path').attr('class', 'shadow soft');
        g.append('path').attr('class', 'shadow');
        const lay = g.append('g').attr('class', 'lay');
        lay.append('rect').attr('class', 'yarn');
        lay.append('rect').attr('class', 'glow');
        return g;
    });
    function drawStrings() {
        strands.each(function (e) {
            const { route: [[x1, y1], [x2, y2]], buried } = stringRoute(e), g = d3.select(this);
            const len = Math.hypot(x2 - x1, y2 - y1), start = Math.floor(seeded(e.a.id + e.b.id, 'yarn') * 180);
            g.classed('buried', buried);
            g.selectAll('.shadow').attr('d', `M${x1 + 0.6},${y1 + 1.8} L${x2 + 0.6},${y2 + 1.8}`);
            g.select('.lay').attr('transform', `translate(${x1},${y1}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}) translate(${-start},0)`);
            g.selectAll('rect').attr('x', start).attr('y', -7).attr('width', len).attr('height', 14);
        });
    }
    drawStrings();

    const add = (parent, tag, cls, text) => {
        const el = parent.appendChild(document.createElement(tag));
        if (cls) el.className = cls;
        if (text) el.textContent = text;
        return el;
    };
    // Each card is the page itself at the window's size, scaled down: a snapshot this
    // browser took (see snapshots below), else the stock screenshot scaled to fit, or
    // for notes a live copy. The page's heading is drawn once, in its own font and
    // spot, enlarged from its top-left corner as far as the zoom needs (see
    // scaleTitle). There is never a second title.
    const SIDES = ['top', 'right', 'bottom', 'left'];
    const TITLE_PROPS = ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'line-height', 'color',
        'white-space', 'text-align', 'text-wrap', 'word-spacing', ...SIDES.map(s => `padding-${s}`), ...SIDES.flatMap(s => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`])];
    const theme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

    function readHeading(h) {
        const r = h.getBoundingClientRect(), cs = h.ownerDocument.defaultView.getComputedStyle(h);
        const range = h.ownerDocument.createRange(); range.selectNodeContents(h);
        return {
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
            textWidth: range.getBoundingClientRect().right - r.left,   // the words, not the (maybe wider) box
            lines: h.innerText.split('\n'),
            style: Object.fromEntries(TITLE_PROPS.map(p => [p, cs.getPropertyValue(p)])),
        };
    }
    // info comes from a page laid out at srcW x srcH (the stock 1400 x 848, or this window)
    function drawTitle(n, info, srcW, srcH) {
        if (!info) return;
        Object.assign(n.titleFrame.style, { width: `${srcW}px`, height: `${srcH}px`, transform: `scale(${PAGE_W / srcW})` });
        const el = n.titleEl, r = info.rect;
        el.replaceChildren();
        info.lines.forEach((line, i) => { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); });
        for (const [prop, value] of Object.entries(info.style)) el.style.setProperty(prop, value);
        // The most it may grow: TITLE_SCALE, or less if it would run off the card
        const textWidth = info.textWidth || r.width;
        const cap = Math.max(1, Math.min(TITLE_SCALE, (srcW - r.left - 60) / textWidth, (srcH - r.top - 90) / r.height));
        Object.assign(el.style, {
            left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
        });
        n.titleCap = cap;
        n.titleFont = parseFloat(info.style['font-size']) || r.height;
        n.titleSrcW = srcW;
        scaleTitle(n);
    }
    // A card's title follows the camera: at the page's own size when the card fills
    // the screen, and growing only as far as it takes to stay readable (TITLE_MIN_PX
    // on screen) as the board zooms out, never past the card's edge (titleCap).
    let zoomK = 1;                 // screen pixels per board unit, set with the camera
    function scaleTitle(n) {
        if (!n.titleFont) return;
        const perPx = zoomK * CARD_W / n.titleSrcW;                    // screen px per page px
        const want = Math.min(TITLE_MIN_PX, n.titleFont * PAGE_W / n.titleSrcW);   // never bigger than at full size
        const scale = Math.min(n.titleCap, Math.max(1, want / (n.titleFont * perPx)));
        n.titleEl.style.transform = `scale(${scale})`;
    }
    function scaleTitles(k) {
        zoomK = k;
        for (const n of nodes.values()) if (n.titleEl) scaleTitle(n);
    }
    function refreshCard(n) {
        if (n.thumb) {
            const snap = snapFor(n);
            n.el.classList.toggle('has-snap', !!snap);
            if (snap) {
                if (n.snapImg.getAttribute('src') !== snap.url) n.snapImg.src = snap.url;
                return drawTitle(n, snap.heading, PAGE_W, PAGE_H);
            }
            return drawTitle(n, (data.titles[n.id] || {})[theme()], STOCK_W, STOCK_H);
        }
        try {
            const h = n.live.contentDocument && n.live.contentDocument.querySelector('h1');
            if (!h) return;
            h.style.visibility = '';
            const info = readHeading(h);
            h.style.visibility = 'hidden';      // the card shows its own, larger copy
            drawTitle(n, info, PAGE_W, PAGE_H);
        } catch (e) { /* not loaded yet */ }
    }

    // ---------- snapshots ----------
    // The stock screenshots are 1400 x 848; in a window of any other size a page lays
    // out differently from its card, so the two don't line up. So once a page has
    // been open a moment, the garden redraws it into a small picture at this
    // window's size (it can, since the pages are on this site) and keeps it in this
    // browser only (IndexedDB): one per page and theme, overwritten on every visit,
    // never sent anywhere. A card shows it while the window is that size, and the
    // stock screenshot otherwise.
    const snaps = new Map();       // "id|theme" -> { url, w, h, heading }
    const snapKey = (n, t = theme()) => `${n.id}|${t}`;
    function snapFor(n) {
        const snap = snaps.get(snapKey(n));
        return snap && snap.w === PAGE_W && snap.h === PAGE_H ? snap : null;
    }
    function remember(key, rec) {
        const old = snaps.get(key);
        if (old) URL.revokeObjectURL(old.url);
        snaps.set(key, { w: rec.w, h: rec.h, heading: rec.heading, url: URL.createObjectURL(rec.blob) });
    }
    // Storage can be missing or refuse (private windows, blocked site data): then
    // there are just no snapshots, and the stock screenshots are used.
    const snapStore = new Promise(resolve => {
        try {
            const req = indexedDB.open('garden', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('snapshots');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
    });
    const withStore = (mode, fn) => snapStore.then(db => {
        if (!db) return;
        try { fn(db.transaction('snapshots', mode).objectStore('snapshots')); } catch (e) { /* storage unavailable */ }
    });
    withStore('readonly', store => {
        const req = store.openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { nodes.forEach(n => n.thumb && refreshCard(n)); return; }
            if (cursor.value && cursor.value.blob) remember(cursor.key, cursor.value);
            cursor.continue();
        };
    });

    // The pages' fonts come from Google Fonts, whose stylesheet the snapshot library
    // isn't allowed to read. So fetch it directly (Latin characters only) and inline
    // the font files, once per visit, for the library to draw with.
    const fontFiles = new Map(), fontSheets = new Map();
    const asDataUrl = blob => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    function inlineFont(url) {
        if (!fontFiles.has(url)) fontFiles.set(url, fetch(url).then(r => r.blob()).then(asDataUrl));
        return fontFiles.get(url);
    }
    function pageFonts(doc) {
        const hrefs = [...doc.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map(l => l.href);
        return Promise.all(hrefs.map(href => {
            if (!fontSheets.has(href)) {
                fontSheets.set(href, fetch(href).then(r => r.text()).then(css => Promise.all(
                    css.split(/(?=\/\* [\w-]+ \*\/)/).filter(block => block.startsWith('/* latin */')).map(async block => {
                        const m = block.match(/url\((https:[^)]+)\)/);
                        return m ? block.replace(m[1], await inlineFont(m[1])) : '';
                    }))).then(blocks => blocks.join('\n')).catch(() => ''));
            }
            return fontSheets.get(href);
        })).then(sheets => sheets.join('\n'));
    }

    let snapTimer = null;
    function scheduleSnapshot(n) {
        clearTimeout(snapTimer);
        if (!n || !n.thumb || reduceMotion || !window.modernScreenshot) return;
        // A moment after the page settles, when the browser is idle, so it never slows a move
        snapTimer = setTimeout(() => {
            const run = () => takeSnapshot(n).catch(() => {});
            if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 }); else run();
        }, 1200);
    }
    async function takeSnapshot(n) {
        if (current !== n || free || !page.classList.contains('shown')) return;
        const doc = frame.contentDocument, win = frame.contentWindow, h = pageHeading();
        if (!doc || !h || frame.dataset.src !== new URL(n.url, location.origin).href) return;
        const w = PAGE_W, ht = PAGE_H, t = theme();
        if (win.innerWidth !== w || win.innerHeight < ht) return;   // Home's page is taller (no bar): keep the top
        if (doc.fonts) await doc.fonts.ready;
        // The heading as it sits at the top of the page (the card draws it itself)
        const heading = readHeading(h);
        heading.rect.top += win.scrollY;
        heading.rect.left += win.scrollX;
        const fonts = await pageFonts(doc);
        if (current !== n || !page.classList.contains('shown')) return;
        h.setAttribute('data-garden-hide', '');
        let blob;
        try {
            blob = await modernScreenshot.domToBlob(doc.documentElement, {
                width: w, height: ht, scale: 0.75, type: 'image/jpeg', quality: 0.75, timeout: 4000,
                font: fonts ? { cssText: fonts } : false,
                backgroundColor: win.getComputedStyle(doc.body).backgroundColor,
                // Only what shows in the window at the top of the page. A dropdown only
                // shows its chosen option (the dashboard's filters hold thousands).
                filter: el => !(el instanceof win.Element)
                    || (el.tagName === 'OPTION' ? el.selected : el.getBoundingClientRect().top + win.scrollY < ht + 40),
                onCloneEachNode: el => {
                    if (el.nodeType === 1 && el.hasAttribute('data-garden-hide')) el.style.visibility = 'hidden';
                },
            });
        } finally {
            h.removeAttribute('data-garden-hide');
        }
        if (!blob || PAGE_W !== w || PAGE_H !== ht || theme() !== t) return;   // the window or theme changed meanwhile
        const rec = { blob, w, h: ht, heading, at: Date.now() };
        const key = snapKey(n, t);
        remember(key, rec);
        withStore('readwrite', store => store.put(rec, key));
        refreshCard(n);
    }

    for (const n of nodes.values()) {
        const card = document.createElement('button');
        card.className = `card kind-${n.kind.toLowerCase()}${n.author === 'claude' ? ' by-claude' : ''}`;
        card.setAttribute('aria-label', `${n.kind}: ${n.title}`);

        const layer = n.layer = add(card, 'div', 'page-layer');
        if (n.thumb) {
            n.stock = add(layer, 'div', 'stock');
            for (const t of ['dark', 'light']) {
                const img = add(n.stock, 'img', `shot ${t}`);
                img.src = `/garden/thumbs/${n.id}-${t}.jpg`;
                img.alt = '';
                img.decoding = 'async';
            }
            n.snapImg = add(layer, 'img', 'snap');
            n.snapImg.alt = '';
        } else {
            n.live = add(layer, 'iframe', 'live');
            n.live.src = n.url;
            n.live.tabIndex = -1;
            n.live.setAttribute('aria-hidden', 'true');
            // Measure the heading only once the page's fonts have arrived (a fallback font is narrower)
            n.live.addEventListener('load', () => {
                const d = n.live.contentDocument;
                ((d && d.fonts) ? d.fonts.ready : Promise.resolve()).then(() => refreshCard(n));
            });
        }
        add(layer, 'div', 'shade');
        n.titleFrame = add(layer, 'div', 'title-frame');
        n.titleEl = add(n.titleFrame, 'div', 'card-title');
        const kindLabel = n.author === 'claude' ? `${n.kind} by Claude` : n.kind;
        const meta = add(card, 'span', 'meta', n.date ? `${kindLabel} · ${n.date}` : kindLabel);
        meta.setAttribute('aria-hidden', 'true');

        card.addEventListener('click', () => go(n));
        // On the board, pointing at a card lights its strings, buried ones included
        card.addEventListener('pointerenter', () => strands.classed('hover', e => e.a === n || e.b === n));
        card.addEventListener('pointerleave', () => strands.classed('hover', false));
        world.appendChild(card);
        n.el = card;
    }
    function placeCard(n) {
        Object.assign(n.el.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` });
        Object.assign(n.layer.style, { width: `${PAGE_W}px`, height: `${PAGE_H}px`, transform: `scale(${CARD_W / PAGE_W})` });
        if (n.stock) n.stock.style.transform = `scale(${PAGE_W / STOCK_W})`;
        refreshCard(n);
    }
    // The window's page area changed shape: lay the board out again to match
    function relayout() {
        if (!measurePage()) return false;
        computeLayout();
        placeRegions();
        drawStrings();
        nodes.forEach(placeCard);
        return true;
    }
    nodes.forEach(placeCard);
    // Headings change colour with the theme
    new MutationObserver(() => setTimeout(() => {
        nodes.forEach(refreshCard);
        if (current && page.classList.contains('shown')) scheduleSnapshot(current);   // a picture in the new theme
    }, 60))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---------- camera ----------
    // A view is [centre x, centre y, width of world shown across the screen].
    let view = [0, 0, 1000];
    function transformFor(v) {
        const vw = board.clientWidth, vh = board.clientHeight, k = vw / v[2];
        return { k, x: vw / 2 - v[0] * k, y: (vh - BAR) / 2 - v[1] * k };
    }
    function apply(v) {
        view = v;
        const t = transformFor(v);
        world.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
        world.style.setProperty('--zoom', t.k);   // keeps the current card's ring thin on screen
        scaleTitles(t.k);
    }
    // On a card, it fills the page area exactly: full width, top edge at the top of the window.
    function focusView(n) {
        const vh = board.clientHeight, k = board.clientWidth / CARD_W;
        return [n.x + CARD_W / 2, n.y + (vh - BAR) / (2 * k), CARD_W];
    }
    function overviewView() {
        const xs = regionBoxes.flatMap(b => [b.x, b.x + b.w]), ys = regionBoxes.flatMap(b => [b.y - 40, b.y + b.h]);
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
        const aspect = board.clientWidth / (board.clientHeight - BAR - 70);
        return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + 25, Math.max(w, h * aspect) * 1.08];
    }

    let flight = null;
    // While the camera moves, the board recedes: the strings and the cards other than
    // the ones it's leaving and heading to fade back (see #board.flying). A flight to a
    // page keeps the board receded until the page has faded in over it (see open), so
    // the strings come back out of sight rather than redrawing as the camera lands.
    function startFlight(timer) {
        if (flight) flight.stop();
        flight = timer;
        board.classList.add('flying');
    }
    function endFlight({ keepReceded = false } = {}) {
        flight.stop();
        flight = null;
        if (!keepReceded) board.classList.remove('flying', 'covered');
    }
    // Moves leave quickly and spend longer settling, like a hand placing something,
    // rather than speeding up and slowing down evenly
    const easeSettle = t => d3.easeCubicInOut(Math.pow(t, 0.72));
    // onFrame(t) is called every frame with the flight's progress (0 to 1, linear time).
    function fly(target, onFrame) {
        return new Promise(resolve => {
            if (reduceMotion) { apply(target); return resolve(); }
            // A shallow arc that eases out of the start, travels quickly, and settles
            // gently onto the card: about half a second to a neighbour, at most 1.1s
            // across the board. ?fly=1.5 (or 0.7, ...) scales it for trying speeds.
            const interp = d3.interpolateZoom.rho(0.9)(view, target);
            const duration = Math.min(Math.max(interp.duration * 0.55, 500), 1100) * FLY_SPEED;
            startFlight(d3.timer(elapsed => {
                const t = Math.min(1, elapsed / duration);
                apply(interp(easeSettle(t)));
                if (onFrame) onFrame(t);
                if (t === 1) { endFlight(); resolve(); }
            }));
        });
    }

    // Between pages: pull back just until the card's edges show, cross over to the new
    // card along a slight arc, then close in on it. The three overlap well, so it reads
    // as one motion. If the new page hasn't loaded once the camera is over its card,
    // the camera slows to a hover there, still pulled back, until it has (at most 4 s).
    const PULL_BACK = [0, 0.4], CROSS = [0.08, 0.82], CLOSE_IN = [0.5, 1];
    const HOVER_AT = 0.52;       // where a slow page starts slowing the camera (it comes to rest about 0.1 later)
    const PULL_BACK_BY = 1.35;   // the card fills about three quarters of the screen
    const ARC = 0.06;            // how far the path bows, as a share of the distance
    function travel(target, ready, onFrame) {
        return new Promise(resolve => {
            if (reduceMotion) { apply(target); return resolve(); }
            const from = view.slice();
            // Already over the card (zoomed in on it in board view): just settle onto it
            const near = Math.hypot(target[0] - from[0], target[1] - from[1]) < from[2] * 0.3;
            const wide = Math.max(from[2], near ? target[2] : target[2] * PULL_BACK_BY);
            const out = Math.log(wide / from[2]), back = Math.log(wide / target[2]);
            // Longer trips across the board take a little longer, never over 1.5 s
            const screens = Math.hypot(target[0] - from[0], target[1] - from[1]) / wide;
            const duration = Math.min(Math.max(650 + 220 * screens, 800), 1500) * FLY_SPEED;
            const phase = (t, [a, b]) => easeSettle(clamp01((t - a) / (b - a)));
            // The arc bows up the screen (or right, for a move straight up or down)
            const dx = target[0] - from[0], dy = target[1] - from[1], dist = Math.hypot(dx, dy) || 1;
            let px = dy / dist, py = -dx / dist;
            if (py > 0 || (py === 0 && px < 0)) { px = -px; py = -py; }
            const bow = Math.min(dist * ARC, wide * 0.35);
            let t = 0, last = null, waited = 0, speed = 1;
            startFlight(d3.timer(now => {
                const dt = last === null ? 0 : now - last;
                last = now;
                // Waiting for a slow page eases the camera to a stop and back, rather than freezing it
                const hold = t >= HOVER_AT && !ready() && waited < 4000;
                if (hold) waited += dt;
                speed += ((hold ? 0 : 1) - speed) * (1 - Math.exp(-dt / 110));
                t = Math.min(1, t + speed * dt / duration);
                if (!hold && speed > 0.995) speed = 1;
                const across = phase(t, CROSS), lift = Math.sin(Math.PI * across) * bow;
                apply([
                    from[0] + dx * across + px * lift,
                    from[1] + dy * across + py * lift,
                    from[2] * Math.exp(out * phase(t, PULL_BACK) - back * phase(t, CLOSE_IN)),
                ]);
                onFrame(t);
                if (t === 1) { endFlight({ keepReceded: true }); resolve(); }
            }));
        });
    }

    // ---------- free board view ----------
    let free = false;
    // A drag that's let go of while moving glides on and slows to a stop (GLIDE_MS sets
    // how quickly: gentler than a phone's flick). Zooming in until a card fills most of
    // the screen (OPEN_AT of its width) opens that card once the gesture ends.
    const GLIDE_MS = 220, OPEN_AT = 0.8;
    let glide = null, gestureK = 1, trail = [];
    const stopGlide = () => { if (glide) { glide.stop(); glide = null; } };
    function startGlide() {
        const recent = trail.filter(p => trail[trail.length - 1].time - p.time < 100);
        if (recent.length < 2) return;
        const a = recent[0], b = recent[recent.length - 1], dt = b.time - a.time;
        if (dt <= 0 || performance.now() - b.time > 60) return;            // held still before letting go
        let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;                   // screen px per ms
        const speed = Math.hypot(vx, vy), cap = 2.5;
        if (speed < 0.15) return;
        if (speed > cap) { vx *= cap / speed; vy *= cap / speed; }
        let last = null;
        glide = d3.timer(now => {
            const dt = last === null ? 16 : now - last;
            last = now;
            const decay = Math.exp(-dt / GLIDE_MS);
            const k = d3.zoomTransform(board).k;
            // the distance this frame is what the velocity covers while decaying over dt
            d3.select(board).call(zoom.translateBy, vx * GLIDE_MS * (1 - decay) / k, vy * GLIDE_MS * (1 - decay) / k);
            vx *= decay; vy *= decay;
            if (Math.hypot(vx, vy) < 0.02) stopGlide();
        });
    }
    // The card under the middle of the page area, if it fills enough of the screen
    function zoomedInCard() {
        if (CARD_W / view[2] < OPEN_AT) return null;
        return [...nodes.values()].find(n => view[0] >= n.x && view[0] <= n.x + CARD_W && view[1] >= n.y && view[1] <= n.y + CARD_H) || null;
    }
    const zoom = d3.zoom().scaleExtent([0.04, 4]).clickDistance(5)
        .on('start', ({ sourceEvent }) => {
            if (!sourceEvent) return;                                       // our own glide
            stopGlide();
            gestureK = d3.zoomTransform(board).k;
            trail = [];
        })
        .on('zoom', ({ transform: t, sourceEvent }) => {
            const vw = board.clientWidth, vh = board.clientHeight;
            view = [(vw / 2 - t.x) / t.k, ((vh - BAR) / 2 - t.y) / t.k, vw / t.k];
            world.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
            world.style.setProperty('--zoom', t.k);   // keeps the current card's ring thin on screen
            scaleTitles(t.k);
            if (sourceEvent && sourceEvent.type !== 'wheel') {
                trail.push({ time: performance.now(), x: t.x, y: t.y });
                if (trail.length > 8) trail.shift();
            }
        })
        .on('end', ({ transform: t, sourceEvent }) => {
            if (!sourceEvent || !free) return;
            if (t.k > gestureK * 1.001) {                                   // zoomed in
                const n = zoomedInCard();
                if (n) return go(n);
            }
            if (Math.abs(t.k - gestureK) < 1e-6 && sourceEvent.type !== 'wheel') startGlide();   // a plain drag
        });
    function syncZoom() {
        const t = transformFor(view);
        d3.select(board).call(zoom.transform, d3.zoomIdentity.translate(t.x, t.y).scale(t.k));
    }
    async function enterBoard() {
        free = true;
        toggle.setAttribute('aria-pressed', 'true');
        board.classList.add('free');
        board.setAttribute('aria-hidden', 'false');
        beginLeave();
        await fly(overviewView());
        if (!free) return;
        syncZoom();
        d3.select(board).call(zoom).on('dblclick.zoom', null);
        hint.hidden = false;
    }
    function leaveBoard() {
        free = false;
        stopGlide();
        toggle.setAttribute('aria-pressed', 'false');
        board.classList.remove('free');
        board.setAttribute('aria-hidden', 'true');
        d3.select(board).on('.zoom', null);
        hint.hidden = true;
    }

    // ---------- pages ----------
    let current = null;
    const wait = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));

    // The open page's heading, as an element in the page document
    function pageHeading() {
        try { return frame.contentDocument && frame.contentDocument.querySelector('h1'); } catch (e) { return null; }
    }
    // A stand-in for the page heading, drawn above everything while it moves
    function ghostOf(h) {
        const ghost = h.cloneNode(true), r = h.getBoundingClientRect(), top = frame.getBoundingClientRect().top;
        const cs = h.ownerDocument.defaultView.getComputedStyle(h);
        for (const prop of TITLE_PROPS) ghost.style.setProperty(prop, cs.getPropertyValue(prop));
        Object.assign(ghost.style, {
            position: 'fixed', margin: '0', left: `${r.left}px`, top: `${r.top + top}px`, boxSizing: 'border-box',
            width: `${r.width}px`, height: `${r.height}px`, transformOrigin: '0 0',
        });
        ghost.removeAttribute('id');
        morphLayer.append(ghost);
        return { ghost, rect: { left: r.left, top: r.top + top, width: r.width } };
    }
    // Transform that puts the ghost exactly over the card's title
    function cardTitleTransform(n, from) {
        const to = n.titleEl.getBoundingClientRect();
        return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    }
    const GLIDE = { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };   // fast start, soft landing
    // Wait for an animation, but never past its length: Chromium can leave one unfinished
    // (seen after Back), which would otherwise stall the move to the next page.
    const settle = anim => Promise.race([anim.finished.catch(() => {}), wait(GLIDE.duration + 100)]);

    // ---------- titles that move with the camera ----------
    // Moving between pages is one motion: the page fades into its card as the camera
    // pulls out; as it settles on the next card, that card's title glides into the
    // new page's heading.
    const LAND_START = 0.6;      // the new card's title shrinks into the page's heading as the camera closes in
    const clamp01 = x => Math.min(1, Math.max(0, x));
    // A ghost heading `g` (from ghostOf) drawn part way between two screen rects.
    // Either end can be a function, re-read every frame, to follow a moving card.
    function placeGhost(g, from, to, f) {
        const a = typeof from === 'function' ? from() : from, b = typeof to === 'function' ? to() : to;
        const e = d3.easeCubicInOut(clamp01(f));
        const left = a.left + (b.left - a.left) * e, top = a.top + (b.top - a.top) * e;
        const width = a.width + (b.width - a.width) * e;
        g.ghost.style.transform = `translate(${left - g.rect.left}px, ${top - g.rect.top}px) scale(${width / g.rect.width})`;
    }
    const titleRect = n => n.titleEl.getBoundingClientRect();

    // Leaving the open page: it fades into its card (whose title, with the camera on
    // it, is the heading's own size). True if there was a page to fade.
    let hidePage = null;
    function beginLeave() {
        if (page.hidden) return false;
        const n = current;
        if (n) n.el.classList.remove('arrived');
        page.classList.remove('shown');
        clearTimeout(hidePage);
        hidePage = setTimeout(() => { page.hidden = true; }, 180);
        return true;
    }

    // Start landing on card n while the camera is still moving: the card's title
    // becomes a ghost that step(f) carries into the new page's heading. Needs the
    // page loaded (it is measured while still transparent); null if it can't.
    function beginLanding(n) {
        clearTimeout(hidePage);
        page.hidden = false;                    // transparent until finish(), but measurable
        const h = pageHeading();
        if (!h || h.getClientRects().length === 0) return null;
        const g = ghostOf(h);
        h.style.visibility = 'hidden';
        n.el.classList.add('handoff');
        return {
            step: f => placeGhost(g, () => titleRect(n), g.rect, f),
            async finish() {
                g.ghost.style.transform = 'none';
                page.classList.add('shown');    // the page fades in around the landed heading
                await wait(180);
                n.el.classList.add('arrived');
                n.el.classList.remove('handoff');
                h.style.visibility = '';
                g.ghost.remove();
                scheduleSnapshot(n);
            },
        };
    }
    // A newer click interrupts a move part way: drop any ghosts it left behind.
    function clearGhosts() {
        morphLayer.replaceChildren();
        for (const n of nodes.values()) n.el.classList.remove('handoff');
        const h = pageHeading();
        if (h) h.style.visibility = '';
    }

    // Leaving without the camera (first load, reduced motion): the page's heading
    // glides into the card title while the page fades into its (matching) card.
    async function leavePage() {
        if (page.hidden) return;
        beginLeave();
        await wait(150);
        page.hidden = true;
    }

    function loadFrame(n) {
        const want = new URL(n.url, location.origin).href;
        if (frame.dataset.src === want) return Promise.resolve();
        frame.dataset.src = want;
        return new Promise(resolve => {
            const done = () => { frame.removeEventListener('load', done); resolve(); };
            frame.addEventListener('load', done);
            setTimeout(done, 4000);           // never wait forever on a slow page
            // Swap pages without adding a history entry, so Back moves between
            // cards instead of stepping back inside the embedded page.
            if (frame.contentWindow && frame.getAttribute('src')) frame.contentWindow.location.replace(want);
            else frame.src = want;
        });
    }

    // Arriving: the card title shrinks back into the page's heading while the
    // live page fades in over the card.
    async function arrive(n, animate) {
        clearTimeout(hidePage);
        page.hidden = false;
        const h = pageHeading();
        scheduleSnapshot(n);
        if (!animate || !h || h.getClientRects().length === 0) {
            page.classList.add('shown');
            n.el.classList.add('arrived');
            return;
        }
        const { ghost, rect } = ghostOf(h);
        const start = cardTitleTransform(n, rect);
        ghost.style.transform = start;
        h.style.visibility = 'hidden';
        n.el.classList.add('handoff');
        page.classList.add('shown');
        await settle(ghost.animate([{ transform: start }, { transform: 'none' }], GLIDE));
        n.el.classList.add('arrived');          // hide the card's copy before the real heading shows
        n.el.classList.remove('handoff');
        h.style.visibility = '';
        ghost.remove();
    }

    function markCurrent(n) {
        if (current && current.el) current.el.classList.remove('current', 'arrived');
        current = n;
        n.el.classList.add('current');
        strands.classed('lit', e => e.a === n || e.b === n);
        const home = n.id === 'home';
        document.title = home ? 'Mac Wall' : `${n.title} | Mac Wall`;
    }

    let openId = 0;
    async function open(n, { instant = false } = {}) {
        const id = ++openId;
        clearGhosts();
        if (free) leaveBoard();
        if (instant || reduceMotion) await leavePage();
        const leaving = instant || reduceMotion ? false : beginLeave();
        const from = current;
        markCurrent(n);
        if (instant) {
            apply(focusView(n));
            await loadFrame(n);
            return arrive(n, false);
        }
        if (reduceMotion) {
            await Promise.all([fly(focusView(n)), loadFrame(n)]);
            if (id === openId && !free) await arrive(n, false);
            return;
        }
        // The new page loads while the camera travels (once the old one has faded),
        // so its heading can be measured in time to land in it.
        let loaded = false, landing = null, landFrom = 0;
        const loading = wait(leaving ? 190 : 0).then(() => id === openId && loadFrame(n)).then(() => { loaded = true; });
        // The card being left stays clear of the receding board until the new page is up
        nodes.forEach(m => m.el.classList.toggle('origin', m === from && from !== n));
        // Leaving a page, it still covers the board as the camera sets off, so the strings
        // can be put away at once instead of fading out on screen (see #board.covered)
        board.classList.toggle('covered', !!leaving);
        // Once the new page has faded in over the board, bring the board back behind it
        const settle = () => wait(220).then(() => {
            if (from) from.el.classList.remove('origin');
            if (id === openId && !free) board.classList.remove('flying', 'covered');
        });
        await travel(focusView(n), () => loaded, t => {
            if (!landing && loaded && t >= LAND_START && t < 0.9 && id === openId) {
                landing = beginLanding(n);
                landFrom = t;
            }
            if (landing) landing.step((t - landFrom) / (1 - landFrom));
        });
        if (id !== openId || free) return;     // a newer click took over
        if (landing) { await landing.finish(); return settle(); }
        await loading;                          // a slow page: glide in once it's ready
        if (id !== openId || free) return;
        await arrive(n, true);
        settle();
    }

    // Every page has its own address (#/path), so back/forward and sharing work.
    const hashFor = n => `#${new URL(n.url, location.origin).pathname}`;
    function go(n) {
        if (location.hash !== hashFor(n)) history.pushState(null, '', hashFor(n));
        open(n);
    }
    function fromHash() {
        const n = location.hash.length > 1 ? nodeFor(location.hash.slice(1)) : nodes.get('home');
        return n || nodes.get('home');
    }
    window.addEventListener('popstate', () => open(fromHash()));   // also fires when the address is edited

    // Links inside the open page fly to their card instead of loading normally.
    frame.addEventListener('load', () => {
        let doc;
        try { doc = frame.contentDocument; } catch (e) { return; }
        if (!doc) return;
        doc.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
            const url = new URL(a.getAttribute('href'), doc.baseURI);
            if (!/^https?:$/.test(url.protocol) || a.target === '_blank') return;   // mailto:, new tabs: leave alone
            if (url.pathname === new URL(doc.baseURI).pathname && url.hash) return;   // in-page anchors
            e.preventDefault();
            const n = nodeFor(url.href);
            if (n) go(n); else window.location.href = url.href;                         // not on the board: leave
        });
    });

    toggle.addEventListener('click', () => (free ? open(current) : enterBoard()));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && free) open(current); });
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(snapTimer);
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const wasVertical = vertical();
            relayout();
            if (free && vertical() !== wasVertical) apply(overviewView());   // the board turned: show all of it
            if (free) syncZoom();
            else if (current) apply(focusView(current));
            if (current && page.classList.contains('shown')) scheduleSnapshot(current);
        }, 150);
        if (free) syncZoom();
        else if (current) apply(focusView(current));
    });

    // First load: the page appears on its own, without its card showing first.
    open(fromHash(), { instant: true }).then(() => {
        document.body.classList.remove('booting');
        // From here on the visitor is moving around the site: Home skips its intro slide
        try { sessionStorage.setItem('intro-seen', '1'); } catch (e) { /* storage blocked */ }
    });
})();
