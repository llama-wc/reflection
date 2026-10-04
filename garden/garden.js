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

    // Cards share the shape of the page area (the screenshots are 1400 x 848).
    const PAGE_W = 1400, PAGE_H = 848;
    const CARD_W = 400, CARD_H = Math.round(CARD_W * PAGE_H / PAGE_W);
    const COL_GAP = 170, ROW_GAP = 120, REGION_PAD = 34;
    const TITLE_SCALE = 2.5;   // how much larger a page's heading is drawn on its card
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
    const nav = document.getElementById('page-nav');
    const navBack = document.getElementById('nav-back');
    const navMenu = document.getElementById('nav-menu');
    const directory = document.getElementById('nav-directory');

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

    // ---------- layout: left to right, Home first ----------
    // Column 0: Home. Column 1: Portfolio and Notes. Column 2: one project per row.
    // Columns 3+: that project's notes, oldest to newest.
    const colX = c => c * (CARD_W + COL_GAP);
    const rows = data.regions
        .filter(r => r.key !== 'hub')
        .map(r => {
            const project = nodes.get(r.key);
            const notes = [...nodes.values()].filter(n => n.kind === 'Note' && n.region === r.key)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            return { region: r, project: project && project.region === r.key ? project : null, notes };
        })
        .filter(row => row.project || row.notes.length);
    const rowY = i => i * (CARD_H + ROW_GAP);
    rows.forEach((row, i) => {
        if (row.project) { row.project.x = colX(2); row.project.y = rowY(i); }
        row.notes.forEach((n, j) => { n.x = colX(3 + j); n.y = rowY(i); });
    });
    const midY = (rowY(rows.length - 1)) / 2;
    const place = (id, col, y) => { const n = nodes.get(id); if (n) { n.x = colX(col); n.y = y; } };
    place('home', 0, midY);
    place('portfolio', 1, midY - (CARD_H + ROW_GAP) / 2);
    place('notes', 1, midY + (CARD_H + ROW_GAP) / 2);

    const box = (name, cards) => {
        const xs = cards.map(n => n.x), ys = cards.map(n => n.y);
        return {
            name,
            x: Math.min(...xs) - REGION_PAD, y: Math.min(...ys) - REGION_PAD,
            w: Math.max(...xs) - Math.min(...xs) + CARD_W + REGION_PAD * 2,
            h: Math.max(...ys) - Math.min(...ys) + CARD_H + REGION_PAD * 2,
        };
    };
    const hubName = (data.regions.find(r => r.key === 'hub') || {}).name || '';
    const regionBoxes = [
        box(hubName, ['home', 'portfolio', 'notes'].map(id => nodes.get(id)).filter(Boolean)),
        ...rows.map(row => box(row.region.name, [row.project, ...row.notes].filter(Boolean))),
    ];

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
    function stringPath(a, b) {
        const [l, r] = a.x <= b.x ? [a, b] : [b, a];
        if (l.x === r.x) {                       // same column: top to bottom
            const [t, btm] = a.y <= b.y ? [a, b] : [b, a];
            const x = t.x + CARD_W / 2, y1 = t.y + CARD_H, y2 = btm.y;
            return `M${x},${y1} L${x},${y2}`;
        }
        const x1 = l.x + CARD_W, y1 = l.y + CARD_H / 2, x2 = r.x, y2 = r.y + CARD_H / 2;
        const k = Math.max(60, (x2 - x1) / 2);
        return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
    }

    // ---------- draw ----------
    for (const b of regionBoxes) {
        const el = document.createElement('div');
        el.className = 'region';
        Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        const label = el.appendChild(document.createElement('div'));
        label.className = 'region-label';
        label.textContent = b.name;
        world.insertBefore(el, world.firstChild);
    }
    const paths = strings.selectAll('path').data([...edges.values()]).join('path')
        .attr('d', e => stringPath(e.a, e.b))
        .attr('class', e => e.kind);

    const add = (parent, tag, cls, text) => {
        const el = parent.appendChild(document.createElement(tag));
        if (cls) el.className = cls;
        if (text) el.textContent = text;
        return el;
    };
    // Each card is the page itself at 1400 x 848, scaled down. The page's heading
    // is drawn once, in its own font and spot, scaled up from its top-left corner
    // to fill the card. There is never a second title.
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
    function drawTitle(n, info) {
        if (!info) return;
        const el = n.titleEl, r = info.rect;
        el.replaceChildren();
        info.lines.forEach((line, i) => { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); });
        for (const [prop, value] of Object.entries(info.style)) el.style.setProperty(prop, value);
        // Every heading grows by the same factor from its own corner; only a title
        // that would run off the card is capped to fit.
        const textWidth = info.textWidth || r.width;
        const scale = Math.max(1, Math.min(TITLE_SCALE, (PAGE_W - r.left - 60) / textWidth, (PAGE_H - r.top - 90) / r.height));
        Object.assign(el.style, {
            left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
            transform: `scale(${scale})`,
        });
    }
    function refreshTitle(n) {
        if (n.thumb) return drawTitle(n, (data.titles[n.id] || {})[theme()]);
        try {
            const h = n.live.contentDocument && n.live.contentDocument.querySelector('h1');
            if (!h) return;
            h.style.visibility = '';
            const info = readHeading(h);
            h.style.visibility = 'hidden';      // the card shows its own, larger copy
            drawTitle(n, info);
        } catch (e) { /* not loaded yet */ }
    }

    for (const n of nodes.values()) {
        const card = document.createElement('button');
        card.className = `card kind-${n.kind.toLowerCase()}`;
        card.setAttribute('aria-label', `${n.kind}: ${n.title}`);
        Object.assign(card.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` });

        const layer = add(card, 'div', 'page-layer');
        layer.style.transform = `scale(${CARD_W / PAGE_W})`;
        if (n.thumb) {
            for (const t of ['dark', 'light']) {
                const img = add(layer, 'img', `shot ${t}`);
                img.src = `/garden/thumbs/${n.id}-${t}.jpg`;
                img.alt = '';
                img.decoding = 'async';
            }
        } else {
            n.live = add(layer, 'iframe', 'live');
            n.live.src = n.url;
            n.live.tabIndex = -1;
            n.live.setAttribute('aria-hidden', 'true');
            // Measure the heading only once the page's fonts have arrived (a fallback font is narrower)
            n.live.addEventListener('load', () => {
                const d = n.live.contentDocument;
                ((d && d.fonts) ? d.fonts.ready : Promise.resolve()).then(() => refreshTitle(n));
            });
        }
        add(layer, 'div', 'shade');
        n.titleEl = add(layer, 'div', 'card-title');
        const meta = add(card, 'span', 'meta', n.date ? `${n.kind} · ${n.date}` : n.kind);
        meta.setAttribute('aria-hidden', 'true');

        card.addEventListener('click', () => go(n));
        world.appendChild(card);
        n.el = card;
        refreshTitle(n);
    }
    // Headings change colour with the theme
    new MutationObserver(() => setTimeout(() => nodes.forEach(refreshTitle), 60))
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
    // onFrame(t) is called every frame with the flight's progress (0 to 1, linear time).
    function fly(target, onFrame) {
        return new Promise(resolve => {
            if (flight) flight.stop();
            if (reduceMotion) { apply(target); return resolve(); }
            // A shallow arc that eases out of the start, travels quickly, and settles
            // gently onto the card: about half a second to a neighbour, at most 1.1s
            // across the board. ?fly=1.5 (or 0.7, ...) scales it for trying speeds.
            const interp = d3.interpolateZoom.rho(0.9)(view, target);
            const duration = Math.min(Math.max(interp.duration * 0.55, 500), 1100) * FLY_SPEED;
            flight = d3.timer(elapsed => {
                const t = Math.min(1, elapsed / duration);
                apply(interp(d3.easeCubicInOut(t)));
                if (onFrame) onFrame(t);
                if (t === 1) { flight.stop(); flight = null; resolve(); }
            });
        });
    }

    // ---------- free board view ----------
    let free = false;
    const zoom = d3.zoom().scaleExtent([0.04, 4]).clickDistance(5).on('zoom', ({ transform: t }) => {
        const vw = board.clientWidth, vh = board.clientHeight;
        view = [(vw / 2 - t.x) / t.k, ((vh - BAR) / 2 - t.y) / t.k, vw / t.k];
        world.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
        world.style.setProperty('--zoom', t.k);   // keeps the current card's ring thin on screen
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
        updateNav();
        const leaving = beginLeave();
        await fly(overviewView(), t => leaving && leaving.step(t / LEAVE_SPAN));
        if (!free) return;
        syncZoom();
        d3.select(board).call(zoom).on('dblclick.zoom', null);
        hint.hidden = false;
    }
    function leaveBoard() {
        free = false;
        toggle.setAttribute('aria-pressed', 'false');
        board.classList.remove('free');
        board.setAttribute('aria-hidden', 'true');
        d3.select(board).on('.zoom', null);
        hint.hidden = true;
        updateNav();
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
    // Moving between pages is one motion: while the camera pulls out, the page's
    // heading grows into its card's title; as it settles on the next card, that
    // card's title shrinks into the new page's heading.
    const LEAVE_SPAN = 0.5;      // the old title grows over the first half of the flight
    const LAND_START = 0.5;      // the new one shrinks over the second half
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

    // Start leaving the open page: it fades into its card, and its heading becomes a
    // ghost that step(f) carries into the card's title. Null if there's no page, or
    // nothing to animate (then the page just fades).
    let hidePage = null;
    function beginLeave() {
        if (page.hidden) return null;
        const n = current, h = pageHeading();
        if (n) n.el.classList.remove('arrived');
        page.classList.remove('shown');
        clearTimeout(hidePage);
        hidePage = setTimeout(() => { page.hidden = true; }, 180);
        if (!n || !h || reduceMotion || h.getClientRects().length === 0) return null;
        const g = ghostOf(h);
        h.style.visibility = 'hidden';
        n.el.classList.add('handoff');          // card title stays hidden until the ghost lands
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            n.el.classList.remove('handoff');
            g.ghost.remove();
        };
        return {
            step: f => (f >= 1 ? finish() : placeGhost(g, g.rect, () => titleRect(n), f)),   // landed: the card shows it again
            finish,
        };
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
        const n = current, h = pageHeading();
        if (!n || !h || reduceMotion || !page.classList.contains('shown')) {
            page.classList.remove('shown');
            if (n) n.el.classList.remove('arrived');
            await wait(150);
            page.hidden = true;
            return;
        }
        const { ghost, rect } = ghostOf(h);
        h.style.visibility = 'hidden';
        n.el.classList.add('handoff');           // card title stays hidden until the ghost lands
        n.el.classList.remove('arrived');
        page.classList.remove('shown');
        await settle(ghost.animate([{ transform: 'none' }, { transform: cardTitleTransform(n, rect) }], GLIDE));
        n.el.classList.remove('handoff');
        ghost.remove();
        h.style.visibility = '';
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
        paths.classed('lit', e => e.a === n || e.b === n);
        const region = data.regions.find(r => r.key === n.region);
        document.getElementById('where-region').textContent = region ? region.name : '';
        document.getElementById('where-title').textContent = n.title;
        document.title = n.id === 'home' ? 'Mac Wall' : `${n.title} | Mac Wall`;
        updateNav();
    }

    let openId = 0;
    async function open(n, { instant = false } = {}) {
        const id = ++openId;
        clearGhosts();
        if (free) leaveBoard();
        if (instant || reduceMotion) await leavePage();
        const leaving = instant || reduceMotion ? null : beginLeave();
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
        await fly(focusView(n), t => {
            if (leaving) leaving.step(t / LEAVE_SPAN);
            if (!landing && loaded && t >= LAND_START && t < 0.9 && id === openId) {
                landing = beginLanding(n);
                landFrom = t;
            }
            if (landing) landing.step((t - landFrom) / (1 - landFrom));
        });
        if (id !== openId || free) return;     // a newer click took over
        if (leaving) leaving.finish();
        if (landing) return landing.finish();
        await loading;                          // a slow page: glide in once it's ready
        if (id !== openId || free) return;
        await arrive(n, true);
    }

    // Every page has its own address (#/path), so back/forward and sharing work.
    // Each step records how many garden pages lie behind it, so Back knows whether
    // there is a garden page to return to.
    const hashFor = n => `#${new URL(n.url, location.origin).pathname}`;
    const depth = () => (history.state && history.state.gardenDepth) || 0;
    function go(n) {
        if (location.hash !== hashFor(n)) history.pushState({ gardenDepth: depth() + 1 }, '', hashFor(n));
        open(n);
    }
    function fromHash() {
        const n = location.hash.length > 1 ? nodeFor(location.hash.slice(1)) : nodes.get('home');
        return n || nodes.get('home');
    }
    window.addEventListener('popstate', () => open(fromHash()));   // also fires when the address is edited

    // ---------- Back and the directory (every page but Home) ----------
    // Without a garden page behind it (someone arrived here directly), Back goes
    // up a level instead: to the page that links to this one, or Home.
    function parentOf(n) {
        if (n.kind === 'Note') return nodes.get(n.region) || nodes.get('notes') || nodes.get('home');
        return [...nodes.values()].find(p => (p.links || []).includes(n.id)) || nodes.get('home');
    }
    navBack.addEventListener('click', () => {
        closeDirectory();
        if (depth() > 0) history.back();
        else if (current) {
            // Replace rather than add, so pressing Back again keeps climbing instead of looping.
            const up = parentOf(current);
            history.replaceState({ gardenDepth: 0 }, '', hashFor(up));
            open(up);
        }
    });

    // The directory: the main pages, then each project with its notes beneath it,
    // then notes that belong to no project.
    function addHeading(text) {
        const h = document.createElement('h2');
        h.textContent = text;
        directory.append(h);
    }
    function addLink(n, title = n.title) {
        const a = document.createElement('a');
        a.href = hashFor(n);
        a.textContent = title;
        a.dataset.id = n.id;
        if (n.kind === 'Note') a.className = 'note';
        a.addEventListener('click', e => { e.preventDefault(); closeDirectory(); go(n); });
        directory.append(a);
    }
    const inRegion = key => [...nodes.values()].filter(n => n.region === key);
    addHeading('Pages');
    for (const n of inRegion('hub')) addLink(n, n.id === 'home' ? 'Home' : n.title);
    addHeading('Projects');
    for (const r of data.regions) {
        const project = nodes.get(r.key);
        if (!project || r.key === 'hub') continue;
        addLink(project);
        for (const n of inRegion(r.key)) if (n !== project) addLink(n);
    }
    const loose = inRegion('thinking');
    if (loose.length) {
        addHeading((data.regions.find(r => r.key === 'thinking') || {}).name || 'Notes');
        for (const n of loose) addLink(n);
    }
    function openDirectory() {
        for (const a of directory.querySelectorAll('a')) {
            if (current && a.dataset.id === current.id) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        }
        directory.hidden = false;
        navMenu.setAttribute('aria-expanded', 'true');
        (directory.querySelector('[aria-current]') || directory.querySelector('a')).focus();
    }
    function closeDirectory() {
        if (directory.hidden) return;
        directory.hidden = true;
        navMenu.setAttribute('aria-expanded', 'false');
    }
    navMenu.addEventListener('click', () => (directory.hidden ? openDirectory() : closeDirectory()));
    document.addEventListener('click', e => { if (!nav.contains(e.target)) closeDirectory(); });
    function updateNav() {
        nav.hidden = free || !current || current.id === 'home';
        if (nav.hidden) closeDirectory();
    }

    // Links inside the open page fly to their card instead of loading normally.
    frame.addEventListener('load', () => {
        let doc;
        try { doc = frame.contentDocument; } catch (e) { return; }
        if (!doc) return;
        // The garden's Back and theme buttons replace each page's own; hidden, not removed, so nothing shifts.
        const style = doc.createElement('style');
        style.textContent = '.back-btn, .back-link, #theme-toggle, #global-theme-toggle { visibility: hidden !important; }';
        (doc.head || doc.documentElement).append(style);
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') closeDirectory(); });
        doc.addEventListener('click', e => {
            closeDirectory();
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
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!directory.hidden) { closeDirectory(); navMenu.focus(); }
        else if (free) open(current);
    });
    window.addEventListener('resize', () => {
        if (free) syncZoom();
        else if (current) apply(focusView(current));
    });

    // First load: the page appears on its own, without its card showing first.
    if (!history.state) history.replaceState({ gardenDepth: 0 }, '', location.href);
    open(fromHash(), { instant: true }).then(() => document.body.classList.remove('booting'));
})();
