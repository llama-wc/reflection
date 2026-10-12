// elenchus.mac-wall.com is a Cloudflare Pages build of the whole repo, which would
// otherwise serve the repo's working files (notes, config, scripts) as web pages.
// These paths get the site's 404 page instead. _routes.json makes this run only for
// them (and /api/*), so every other file is served as usual without it.
const HIDDEN = [
    "/_dev", "/_data", "/_layouts", "/_drafts", "/.github", "/notes",
    "/_config.yml", "/build_parquet.py", "/.gitignore", "/CNAME", "/_headers", "/_routes.json"
];

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const path = decodeURIComponent(url.pathname);
    if (HIDDEN.some(p => path === p || path.startsWith(p + "/"))) {
        const page = await context.env.ASSETS.fetch(new URL("/404.html", url));
        return new Response(page.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return context.next();
}
