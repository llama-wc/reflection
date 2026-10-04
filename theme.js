// Site-wide light/dark theme, loaded in every page's <head> so it applies
// before the first paint.
//
// The choice is saved in a cookie shared by all of mac-wall.com. The Elenchus
// app runs on elenchus.mac-wall.com, which the browser treats as a separate
// site with its own localStorage, so localStorage alone can't carry the
// choice between them. localStorage is still written as a fallback (local
// testing, older visits) under the original key.
(function () {
    const KEY = 'portfolio-theme';
    const onSiteDomain = /(^|\.)mac-wall\.com$/.test(location.hostname);

    function read() {
        const match = document.cookie.match(/(?:^|;\s*)portfolio-theme=(dark|light)\b/);
        if (match) return match[1];
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function save(theme) {
        const scope = onSiteDomain ? '; Domain=mac-wall.com' : '';
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${scope}${secure}`;
        try { localStorage.setItem(KEY, theme); } catch (e) {}
    }

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    const saved = read();
    apply(saved === 'light' ? 'light' : 'dark');
    // Copy a choice made before the shared cookie existed, so the subdomain sees it too.
    if (saved === 'light' || saved === 'dark') save(saved);

    function toggle() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        save(next);
    }

    // A change made in another tab or page (or a page shown inside the board) applies here too.
    window.addEventListener('storage', (e) => {
        if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue);
    });

    // One handler for every page's toggle button.
    document.addEventListener('click', (e) => {
        if (e.target.closest('#theme-toggle, #global-theme-toggle')) toggle();
    });
})();
