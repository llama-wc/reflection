// Site-wide settings, loaded in every page's <head> so they apply before the
// first paint: the light/dark theme, and whether pages open in the animated
// garden (/garden/) or on their own.
//
// Choices are saved in cookies shared by all of mac-wall.com. The Elenchus
// app runs on elenchus.mac-wall.com, which the browser treats as a separate
// site with its own localStorage, so localStorage alone can't carry a choice
// between them. localStorage is still written as a fallback (local testing,
// older visits).
(function () {
    const onSiteDomain = /(^|\.)mac-wall\.com$/.test(location.hostname);
    const inFrame = window.top !== window.self;

    function read(key, values) {
        const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=(${values})\\b`));
        if (match) return match[1];
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function save(key, value) {
        const scope = onSiteDomain ? '; Domain=mac-wall.com' : '';
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${key}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${scope}${secure}`;
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    // ---------- animations (the garden) ----------
    // On by default (off for anyone whose device asks for reduced motion): opening a
    // page on mac-wall.com shows it inside the garden, at that page's card. Turned
    // off, every page opens on its own. If the garden fails to start, it marks this
    // tab (FAILED_KEY) and sends it to the page on its own; the next visit tries again.
    const MOTION_KEY = 'site-animations';
    const FAILED_KEY = 'garden-failed';
    const GARDEN_PAGE = /^\/(portfolio\.html|movie-reviews\.html|ledger\/|elenchus\/|notes\/.*)?$/;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionSaved = read(MOTION_KEY, 'on|off');
    const motionOn = () => (read(MOTION_KEY, 'on|off') || (reduceMotion ? 'off' : 'on')) === 'on';
    const inGarden = () => !inFrame && location.pathname.startsWith('/garden/');
    const gardenFailed = () => { try { return !!sessionStorage.getItem(FAILED_KEY); } catch (e) { return false; } };
    const pagePath = () => location.pathname.replace(/index\.html$/, '');

    // The garden's address for a page, or null if it has no card there
    function gardenUrl(path) {
        if (!GARDEN_PAGE.test(path)) return null;
        const garden = location.hostname === 'elenchus.mac-wall.com' ? 'https://mac-wall.com/garden/' : '/garden/';
        return path === '/' ? garden : `${garden}#${path}`;
    }
    // In the garden: the page it's showing (#/portfolio.html), at its own address on this site
    function plainUrl() {
        try {
            const url = new URL(decodeURI(location.hash.slice(1)) || '/', location.origin);
            if (url.origin === location.origin) return url.pathname;
        } catch (e) { /* a malformed address: go home */ }
        return '/';
    }

    // Pages left alone: those already inside the garden, other hosts (the Elenchus
    // subdomain), and any address with a query or fragment, such as a Virtue Ledger
    // private link (?id=...). Local previews behave like the live site; the thumbnail
    // script turns animations off for itself.
    function toGarden() {
        if (!inFrame && /^((www\.)?mac-wall\.com|localhost|127\.0\.0\.1)$/.test(location.hostname)
            && !location.search && !location.hash
            && motionOn() && !gardenFailed() && gardenUrl(pagePath())) {
            location.replace(gardenUrl(pagePath()));
            return true;
        }
        return false;
    }
    const leaving = toGarden();

    // Called by the garden when it can't start: show the page on its own, and don't
    // send this tab back to the garden. Without session storage the address carries
    // a query instead, which the redirect above also leaves alone.
    window.gardenFallback = function () {
        let marked = false;
        try { sessionStorage.setItem(FAILED_KEY, '1'); marked = true; } catch (e) {}
        location.replace(plainUrl() + (marked ? '' : '?plain'));
    };

    function toggleMotion() {
        const next = motionOn() ? 'off' : 'on';
        save(MOTION_KEY, next);
        showMotion();
        if (next === 'off') {
            if (inFrame) window.top.location.href = location.pathname;   // Home's button, inside the garden
            else if (inGarden()) location.href = plainUrl();
            return;
        }
        try { sessionStorage.removeItem(FAILED_KEY); } catch (e) {}
        // A private link (?id=...) stays put; the setting applies from the next page
        const url = !inGarden() && !location.search && gardenUrl(pagePath());
        if (url) location.href = url;
    }

    // Every animations button (class motion-toggle) shows the current setting
    function showMotion() {
        const on = motionOn();
        document.querySelectorAll('.motion-toggle').forEach(b => {
            b.setAttribute('aria-pressed', String(on));
            b.title = on ? 'Animations on' : 'Animations off';
        });
    }
    document.addEventListener('DOMContentLoaded', showMotion);
    // Keep a choice made before the cookie was shared with the subdomain
    if (motionSaved === 'on' || motionSaved === 'off') save(MOTION_KEY, motionSaved);

    // ---------- local preview ----------
    // Some links name https://mac-wall.com outright so they work from the Elenchus
    // subdomain. In a local preview, keep them on the preview instead of the live site.
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[href^="https://mac-wall.com/"]').forEach(a => {
                a.href = location.origin + a.getAttribute('href').slice('https://mac-wall.com'.length);
            });
        });
    }

    // ---------- the bottom bar ----------
    // The animations and theme buttons live in a bar along the bottom of the window,
    // the same bar the garden shows (minus Board view), so they stay put whether a
    // page is open in the garden or on its own. Pages inside the garden use the
    // garden's bar. Full-height pages subtract --site-bar so the bar covers nothing.
    // The thumbnail script sets window.siteBar = false to picture pages as the garden shows them.
    const MOTION_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="15" cy="12" r="5"/><path class="trail" d="M2 8h5M1 12h6M2 16h5"/><path class="slash" d="M4 21 21 3"/></svg>';
    const style = document.createElement('style');
    style.textContent = `
        :root[data-theme="dark"] { --bar-bg: #0e0e0f; --bar-line: #333336; --bar-text: #e6e6e6; --bar-accent: #ff4b4b; }
        :root[data-theme="light"] { --bar-bg: #ecebe7; --bar-line: #d4d2cc; --bar-text: #141414; --bar-accent: #d32f2f; }
        .motion-toggle svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
        .motion-toggle .slash { display: none; }
        .motion-toggle[aria-pressed="false"] .slash { display: inline; }
        .motion-toggle[aria-pressed="false"] .trail { opacity: 0.35; }
        #site-bar {
            position: fixed; left: 0; right: 0; bottom: 0; height: 52px; box-sizing: border-box; z-index: 10;
            display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 20px;
            background: var(--bar-bg); border-top: 1px solid var(--bar-line); backdrop-filter: blur(6px);
        }
        #site-bar button {
            width: 34px; height: 31px; padding: 0; margin: 0; background: none; cursor: pointer;
            color: var(--bar-text); border: 1px solid var(--bar-line); border-radius: 3px;
            font: 16px/1 'Inter', sans-serif; display: flex; align-items: center; justify-content: center;
        }
        #site-bar .motion-toggle svg { width: 16px; height: 16px; }
        #site-bar button:hover, #site-bar button:focus-visible { border-color: var(--bar-accent); color: var(--bar-accent); }
        html { padding-bottom: var(--site-bar, 0px); }
        @media print { #site-bar { display: none; } html { padding-bottom: 0; } }`;
    document.head.appendChild(style);

    if (!inFrame && !inGarden() && !leaving && window.siteBar !== false) {
        document.documentElement.style.setProperty('--site-bar', '52px');
        document.addEventListener('DOMContentLoaded', () => {
            const bar = document.createElement('div');
            bar.id = 'site-bar';
            bar.innerHTML = `<button class="motion-toggle" type="button" aria-label="Animations" aria-pressed="true">${MOTION_ICON}</button>`
                + '<button class="site-theme-toggle" type="button" aria-label="Toggle theme">&#9680;</button>';
            if (document.body) document.body.append(bar);
            showMotion();
        });
    }

    // ---------- theme ----------
    const KEY = 'portfolio-theme';

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    const saved = read(KEY, 'dark|light');
    apply(saved === 'light' ? 'light' : 'dark');
    // Copy a choice made before the shared cookie existed, so the subdomain sees it too.
    if (saved === 'light' || saved === 'dark') save(KEY, saved);

    function toggle() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        save(KEY, next);
    }

    // Back and Forward can show a page kept in memory exactly as it was left, with an
    // old theme or animations setting. Bring it up to date, and move it in or out of
    // the garden if the setting changed meanwhile.
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        apply(read(KEY, 'dark|light') === 'light' ? 'light' : 'dark');
        showMotion();
        if (inGarden() && !motionOn()) location.replace(plainUrl());
        else toGarden();
    });

    // A change made in another tab or page (or a page shown inside the board) applies here too.
    window.addEventListener('storage', (e) => {
        if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue);
        if (e.key === MOTION_KEY) showMotion();
    });

    // One handler for every page's buttons.
    document.addEventListener('click', (e) => {
        if (!e.target.closest) return;
        if (e.target.closest('#theme-toggle, .site-theme-toggle')) toggle();
        if (e.target.closest('.motion-toggle')) toggleMotion();
    });
})();
