import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

// Global State
let db, conn;          // dashboard engine: movies + summary tables
let duckBundle;        // reused to start a second engine for the records table

// Every dashboard update gets a generation number; results from an older
// generation are dropped, so rapid changes always end on the latest state.
let updateGen = 0;
class StaleUpdate extends Error {}
function queryFor(gen) {
    return async (sql) => {
        const res = await conn.query(sql);
        if (gen !== updateGen) throw new StaleUpdate();
        return res;
    };
}
let trendSvg, trendPath, trendX, trendY, trendArea, trendDots; 
let currentTrendData = []; 

// Exact Stats State
let currentExactAvg = 0;
let currentExactCount = 0;

// Interactive States
let selectedYears = new Set();
let pickedMovie = null;   // {movieId, title} chosen from autocomplete; titles aren't unique

const ML_SNAPSHOT_LABEL = 'Jul 2023';

// Value each filter box last applied, so typing and blur don't both re-run it.
const appliedFilter = {};

// Case-insensitive "contains" match, so "nolan" finds Christopher Nolan.
function metaClause(column, value) {
    return `m.${column} ILIKE '%${value.replace(/'/g, "''")}%'`;
}

// Exact-match lookup for the search box, preferring the autocomplete pick.
function exactMovieQuery(searchVal) {
    if (pickedMovie && pickedMovie.title === searchVal) {
        return `SELECT * FROM movies WHERE movieId = ${pickedMovie.movieId} LIMIT 1`;
    }
    return `SELECT * FROM movies WHERE title_clean = '${searchVal.replace(/'/g, "''")}' ORDER BY source = 'MovieLens' DESC LIMIT 1`;
}

// Data files must always match this script: a browser holding a cached older
// file (e.g. movies.parquet without the newer columns) breaks every query.
// 'no-cache' revalidates each load; unchanged files come back as a cheap 304.
function fetchData(url) {
    return fetch(url, { cache: 'no-cache' });
}

// RATING BANDS
// Four fixed colours (coral / amber / soft jade / vivid jade). The colours are
// CSS variables per theme in movie-reviews.html, so the theme toggle restyles
// everything without redrawing. Bands follow the score as displayed (one
// decimal), so a 3.47 shown as "3.5" is "Good", matching the score filter.
const BANDS = [
    { key: 'poor',  label: 'Poor',  below: 2.45 },
    { key: 'fair',  label: 'Fair',  below: 3.45 },
    { key: 'good',  label: 'Good',  below: 3.95 },
    { key: 'great', label: 'Great', below: Infinity },
];
const bandOf = v => BANDS.find(b => v < b.below);
const bandColor = v => `var(--band-${bandOf(v).key})`;
const bandInk = v => `var(--band-${bandOf(v).key}-ink)`;

// SQL condition for the score filter, using the same band edges.
function scoreCondition(val) {
    const i = BANDS.findIndex(b => b.key === val);
    if (i < 0) return null;
    const lo = i > 0 ? `ma.avg_rating >= ${BANDS[i - 1].below}` : null;
    const hi = BANDS[i].below !== Infinity ? `ma.avg_rating < ${BANDS[i].below}` : null;
    return [lo, hi].filter(Boolean).join(' AND ');
}

let overallMean = null;   // MovieLens average across every rating, for "vs average"

async function initializeDashboard() {
    const loadingText = document.getElementById('loading-overlay');
    const mainStage = document.getElementById('main-stage');

    try {
        const searchBar = document.getElementById('searchBar');
        const autocompleteOverlay = document.getElementById('autocompleteOverlay');

        // DYNAMICALLY INJECT SCORE FILTER
        const filterGroup = document.querySelector('.filter-group');
        const resetBtn = document.getElementById('resetBtn');
        if (filterGroup && resetBtn && !document.getElementById('scoreFilter')) {
            const scoreSelect = document.createElement('select');
            scoreSelect.id = 'scoreFilter';
            scoreSelect.disabled = true; 
            scoreSelect.innerHTML = `
                <option value="All">All Scores</option>
                <option value="great">Great (4.0+)</option>
                <option value="good">Good (3.5–3.9)</option>
                <option value="fair">Fair (2.5–3.4)</option>
                <option value="poor">Poor (under 2.5)</option>
            `;
            scoreSelect.style.cssText = `
                background: var(--bg-color); color: var(--text-main);
                border: 1px solid #333; padding: 12px 15px; border-radius: 4px;
                font-family: 'Inter', sans-serif; box-sizing: border-box; 
                margin: 0; color-scheme: dark; font-size: 14px;
                flex: 1; min-width: 150px;
            `;
            filterGroup.insertBefore(scoreSelect, resetBtn);
        }

        // BOOT DUCKDB
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        duckBundle = bundle;
        const worker_url = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
        const worker = new Worker(worker_url);
        db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);

        loadingText.innerText = "Loading ratings…";
        
        const [mRes, rRes] = await Promise.all([
            fetchData('movies.parquet'),
            fetchData('ratings_summary.parquet')
        ]);
        await db.registerFileBuffer('movies.parquet', new Uint8Array(await mRes.arrayBuffer()));
        await db.registerFileBuffer('ratings_summary.parquet', new Uint8Array(await rRes.arrayBuffer()));
        conn = await db.connect();
        
        loadingText.innerText = "Crunching...";
        // Load both files into memory once; every filter change then queries
        // in-memory tables rather than decoding Parquet again.
        // summary holds one row per (movieId, review_year, rating) with a
        // count `n`, so averages are weighted by n.
        await conn.query(`CREATE TABLE movies AS SELECT * FROM 'movies.parquet'`);
        await conn.query(`CREATE TABLE summary AS SELECT * FROM 'ratings_summary.parquet'`);
        await conn.query(`
            CREATE TABLE movie_averages AS
            SELECT movieId, SUM(rating * n) / SUM(n) as avg_rating
            FROM summary
            GROUP BY movieId
        `);

        const meanRes = await conn.query(`SELECT SUM(rating * n) / SUM(n) AS m FROM summary`);
        overallMean = Number(meanRes.toArray()[0].toJSON().m);

        loadingText.innerText = "Preparing filters…";
        await refreshFilters(++updateGen);

        loadingText.style.display = 'none';
        mainStage.style.opacity = '1';
        
        searchBar.disabled = false;
        document.querySelectorAll('.filter-group input').forEach(input => input.disabled = false);
        const scoreFilterEl = document.getElementById('scoreFilter');
        if (scoreFilterEl) scoreFilterEl.disabled = false;

        // Dim the dashboard only if an update takes long enough to notice.
        async function runUpdate() {
            const gen = ++updateGen;
            const dim = setTimeout(() => { mainStage.style.opacity = '0.5'; }, 150);
            await refreshFilters(gen);
            await applyUnifiedFilters(gen);
            clearTimeout(dim);
            if (gen === updateGen) mainStage.style.opacity = '1';
        }

        async function handleUIChange() {
            selectedYears.clear();
            document.getElementById('clear-trend-btn').style.display = 'none';
            await runUpdate();
        }

        // CONTEXT-AWARE AUTOCOMPLETE ENGINE
        async function populateSearchDropdown(fuzzyText = "") {
            const genre = getFilterValue('genreFilter');
            const director = getFilterValue('directorFilter');
            const studio = getFilterValue('studioFilter');
            const actor = getFilterValue('actorFilter');
            const scoreFilterVal = getFilterValue('scoreFilter');

            let clauses = [];
            if (genre !== "All") clauses.push(metaClause('genres', genre));
            if (director !== "All") clauses.push(metaClause('director', director));
            if (studio !== "All") clauses.push(metaClause('studio', studio));
            if (actor !== "All") clauses.push(metaClause('"cast"', actor));

            let scoreJoin = "";
            if (scoreFilterVal !== "All") {
                scoreJoin = " JOIN movie_averages ma ON m.movieId = ma.movieId ";
                clauses.push(scoreCondition(scoreFilterVal));
            }

            if (fuzzyText !== "") {
                const tokens = fuzzyText.split(' ').filter(t => t.trim() !== '');
                const likeClauses = tokens.map(t => `m.title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
                if (likeClauses) clauses.push(`(${likeClauses})`);
            }

            let joinClause = scoreJoin;
            if (selectedYears.size > 0) joinClause += ` JOIN (SELECT DISTINCT movieId FROM summary WHERE review_year IN (${Array.from(selectedYears).join(',')})) y_filt ON m.movieId = y_filt.movieId `;

            const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : "";
            const query = `SELECT DISTINCT m.movieId, m.title_clean, m.release_year, m.source FROM movies m ${joinClause} ${whereStr} ORDER BY m.title_clean, m.release_year LIMIT 100`;

            try {
                const res = await conn.query(query);
                const suggestions = res.toArray().map(r => r.toJSON());
                const people = fuzzyText !== "" ? await searchPeople(fuzzyText) : [];

                if (suggestions.length > 0 || people.length > 0) {
                    autocompleteOverlay.replaceChildren();
                    for (const person of people) {
                        const div = document.createElement('div');
                        div.className = 'autocomplete-item';
                        div.append(person.name);
                        const kind = div.appendChild(document.createElement('span'));
                        kind.className = 'autocomplete-kind';
                        kind.innerText = `${person.kind} · ${Number(person.films)} film${Number(person.films) === 1 ? '' : 's'}`;
                        div.addEventListener('click', async () => {
                            const input = document.getElementById(PERSON_FILTER[person.kind]);
                            input.value = person.name;
                            appliedFilter[input.id] = person.name;
                            searchBar.value = "";
                            pickedMovie = null;
                            autocompleteOverlay.style.display = 'none';
                            await handleUIChange();
                        });
                        autocompleteOverlay.appendChild(div);
                    }
                    for (const s of suggestions) {
                        const div = document.createElement('div');
                        div.className = 'autocomplete-item';
                        div.append(s.release_year ? `${s.title_clean} (${s.release_year})` : s.title_clean);
                        if (s.source === 'TMDB') {
                            const badge = div.appendChild(document.createElement('span'));
                            badge.className = 'source-badge';
                            badge.innerText = 'TMDB';
                        }
                        div.addEventListener('click', async () => {
                            pickedMovie = { movieId: Number(s.movieId), title: s.title_clean };
                            searchBar.value = s.title_clean;
                            autocompleteOverlay.style.display = 'none';
                            await handleUIChange();
                        });
                        autocompleteOverlay.appendChild(div);
                    }
                    autocompleteOverlay.style.display = 'flex';
                } else {
                    autocompleteOverlay.innerHTML = `<div class="autocomplete-item" style="color:#777; font-style:italic;">No movies found matching these filters...</div>`;
                    autocompleteOverlay.style.display = 'flex';
                }
            } catch(err) { console.error(err); }
        }

        searchBar.addEventListener('focus', () => {
            const val = searchBar.value.trim();
            populateSearchDropdown(val);
        });

        let searchDebounce;
        searchBar.addEventListener('input', async (e) => {
            const val = e.target.value.trim();
            clearTimeout(searchDebounce);
            
            if (val.length === 0) {
                autocompleteOverlay.style.display = 'none';
                await handleUIChange();
                populateSearchDropdown(""); 
                return;
            }

            if (val.length < 2) {
                autocompleteOverlay.style.display = 'none';
                return;
            }

            searchDebounce = setTimeout(() => {
                populateSearchDropdown(val);
            }, 120);
        });

        document.addEventListener('click', (e) => {
            if (e.target !== searchBar && !autocompleteOverlay.contains(e.target)) {
                autocompleteOverlay.style.display = 'none';
            }
        });

        searchBar.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                autocompleteOverlay.style.display = 'none';
                searchBar.blur();
                // Enter on a name rather than a title ("tarantino") applies the
                // best-matching director/actor/studio instead of a title search.
                const val = searchBar.value.trim();
                if (val !== '' && !(await titleMatches(val))) {
                    const [person] = await searchPeople(val);
                    if (person) {
                        const input = document.getElementById(PERSON_FILTER[person.kind]);
                        input.value = person.name;
                        appliedFilter[input.id] = person.name;
                        searchBar.value = "";
                        pickedMovie = null;
                    }
                }
                await handleUIChange();
            }
        });

        // Filters apply while typing, as soon as the text matches any name in the
        // list (any case, partial is fine: "tarantino"). Text that matches nothing
        // yet keeps the last filter. When the user is done (Enter or leaving the
        // box), a partial that fits exactly one name is tidied to that full name.
        async function commitFilter(input, done) {
            const typed = input.value.trim();
            input.classList.remove('no-match');
            if (typed !== '') {
                const lower = typed.toLowerCase();
                const options = [...document.getElementById(input.getAttribute('list')).options].map(o => o.value);
                const exact = options.find(o => o.toLowerCase() === lower);
                const containing = options.filter(o => o.toLowerCase().includes(lower));
                if (containing.length === 0) {
                    input.classList.add('no-match');   // outline it so a typo isn't silent
                    return;
                }
                const canonical = exact || (done && containing.length === 1 ? containing[0] : null);
                if (canonical) input.value = canonical;
            }
            if (appliedFilter[input.id] === input.value.trim()) return;
            appliedFilter[input.id] = input.value.trim();
            await handleUIChange();
        }

        document.querySelectorAll('.filter-group input[list]:not(#searchBar)').forEach(input => {
            let debounce;
            input.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => commitFilter(input, false), 120);
            });
            input.addEventListener('change', () => {
                clearTimeout(debounce);
                commitFilter(input, true);
            });
        });
        
        if (scoreFilterEl) {
            scoreFilterEl.addEventListener('change', handleUIChange);
        }

        document.getElementById('resetBtn').addEventListener('click', async () => {
            document.querySelectorAll('.filter-group input').forEach(input => input.value = "");
            for (const id in appliedFilter) delete appliedFilter[id];
            if (scoreFilterEl) scoreFilterEl.value = "All";
            pickedMovie = null;
            await handleUIChange();
        });

        document.getElementById('clear-trend-btn').addEventListener('click', () => {
            selectedYears.clear();
            applyCrossFilters();
        });

        await applyUnifiedFilters(updateGen);
        if (document.getElementById('records-body')) initRecords();
        
        window.addEventListener('resize', () => {
            if(currentTrendData.length > 0) updateTrendChart(currentTrendData, currentExactAvg);
        });

    } catch (error) {
        console.error("Dashboard Engine Failed:", error);
        loadingText.innerText = "Something went wrong loading the data. Please reload the page.";
    }
}

const PERSON_FILTER = { Director: 'directorFilter', Actor: 'actorFilter', Studio: 'studioFilter' };

async function titleMatches(text) {
    const tokens = text.split(' ').filter(t => t.trim() !== '');
    const match = tokens.map(t => `title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
    const res = await conn.query(`SELECT COUNT(*) AS c FROM movies WHERE ${match}`);
    return Number(res.toArray()[0].toJSON().c) > 0;
}

// Directors, actors and studios whose names contain every typed word.
async function searchPeople(text) {
    const tokens = text.split(' ').filter(t => t.trim() !== '');
    if (tokens.length === 0) return [];
    const match = tokens.map(t => `name ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
    const res = await conn.query(`
        WITH people AS (
            SELECT 'Director' AS kind, trim(unnest(string_split(director, ','))) AS name FROM movies
            UNION ALL SELECT 'Actor', trim(unnest(string_split("cast", ','))) FROM movies
            UNION ALL SELECT 'Studio', studio FROM movies
        )
        SELECT kind, name, COUNT(*) AS films FROM people
        WHERE ${match} AND name NOT IN ('N/A', 'Unknown', '')
        GROUP BY kind, name
        ORDER BY films DESC, name
        LIMIT 5
    `);
    return res.toArray().map(r => r.toJSON());
}

function getFilterValue(id) {
    const el = document.getElementById(id);
    if (!el) return "All";
    const val = el.value.trim();
    return (val === "") ? "All" : val;
}

async function refreshFilters(gen = updateGen) {
    const query = queryFor(gen);
    try {
        const searchEl = document.getElementById('searchBar');
        const searchVal = searchEl && searchEl.value.trim() !== "" ? searchEl.value.trim() : null;

        let exactMovieData = null;
        let searchWhereStr = null;

        if (searchVal) {
            const exactRes = await query(exactMovieQuery(searchVal));
            if (exactRes.toArray().length > 0) {
                exactMovieData = exactRes.toArray()[0].toJSON();
            } else {
                const tokens = searchVal.split(' ').filter(t => t.trim() !== '');
                searchWhereStr = tokens.map(t => `m.title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
            }
        }

        const genre = getFilterValue('genreFilter');
        const director = getFilterValue('directorFilter');
        const studio = getFilterValue('studioFilter');
        const actor = getFilterValue('actorFilter');
        const scoreFilterVal = getFilterValue('scoreFilter');

        let scoreJoin = "";
        let scoreWhere = null;
        if (scoreFilterVal !== "All") {
            scoreJoin = " JOIN movie_averages ma ON m.movieId = ma.movieId ";
            scoreWhere = scoreCondition(scoreFilterVal);
        }

        let srcClause = null;
        if (exactMovieData) srcClause = `m.movieId = ${exactMovieData.movieId}`;
        else if (searchWhereStr) srcClause = `(${searchWhereStr})`;

        const gClause = genre !== "All" ? metaClause('genres', genre) : null;
        const dClause = director !== "All" ? metaClause('director', director) : null;
        const sClause = studio !== "All" ? metaClause('studio', studio) : null;
        const aClause = actor !== "All" ? metaClause('"cast"', actor) : null;

        const buildWhere = (clauses) => {
            const valid = clauses.filter(c => c !== null);
            return valid.length > 0 ? `WHERE ${valid.join(' AND ')}` : "";
        };

        const whereForGenre = buildWhere([srcClause, dClause, sClause, aClause, scoreWhere]);               
        const whereForDir = buildWhere([srcClause, gClause, sClause, aClause, scoreWhere]);                 
        const whereForStudio = buildWhere([srcClause, gClause, dClause, aClause, scoreWhere]);              
        const whereForActor = buildWhere([srcClause, gClause, dClause, sClause, scoreWhere]);              

        let joinClause = scoreJoin;
        if (selectedYears.size > 0) joinClause += ` JOIN (SELECT DISTINCT movieId FROM summary WHERE review_year IN (${Array.from(selectedYears).join(',')})) y_filt ON m.movieId = y_filt.movieId `;

        const baseFrom = `FROM movies m ${joinClause}`;
        const dirWhereStr = whereForDir ? `${whereForDir} AND m.director != 'N/A'` : `WHERE m.director != 'N/A'`;
        const stdWhereStr = whereForStudio ? `${whereForStudio} AND m.studio != 'N/A'` : `WHERE m.studio != 'N/A'`;
        const actWhereStr = whereForActor ? `${whereForActor} AND m."cast" != 'N/A'` : `WHERE m."cast" != 'N/A'`;

        const queries = [
            query(`SELECT DISTINCT trim(unnest(string_split(m.genres, '|'))) as g ${baseFrom} ${whereForGenre} ORDER BY g`),
            query(`SELECT DISTINCT m.director ${baseFrom} ${dirWhereStr} ORDER BY m.director`),
            query(`SELECT DISTINCT m.studio ${baseFrom} ${stdWhereStr} ORDER BY m.studio`),
            query(`SELECT DISTINCT trim(unnest(string_split(m."cast", ','))) as a ${baseFrom} ${actWhereStr} ORDER BY a`)
        ];

        const [gRes, dRes, sRes, aRes] = await Promise.all(queries);

        updateDatalist('genreList', gRes.toArray().map(r => r.toJSON().g));
        updateDatalist('directorList', dRes.toArray().map(r => r.toJSON().director));
        updateDatalist('studioList', sRes.toArray().map(r => r.toJSON().studio));
        updateDatalist('actorList', aRes.toArray().map(r => r.toJSON().a));
    } catch (error) {
        if (!(error instanceof StaleUpdate)) console.error("Filter Sync Failed:", error);
    }
}

function updateDatalist(id, list) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = ""; 
    list.forEach(item => {
        if (!item || item === "Unknown" || item === "N/A") return;
        const opt = document.createElement('option');
        opt.value = item;
        el.appendChild(opt);
    });
}

async function applyUnifiedFilters(gen = updateGen) {
    const query = queryFor(gen);
    try {
        const searchEl = document.getElementById('searchBar');
        const searchVal = searchEl && searchEl.value.trim() !== "" ? searchEl.value.trim() : "";
        
        let exactMovieData = null;
        let searchWhereStr = null;

        if (searchVal !== "") {
            const exactRes = await query(exactMovieQuery(searchVal));
            if (exactRes.toArray().length > 0) {
                exactMovieData = exactRes.toArray()[0].toJSON();
            } else {
                const tokens = searchVal.split(' ').filter(t => t.trim() !== '');
                searchWhereStr = tokens.map(t => `m.title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
            }
        }

        const genre = getFilterValue('genreFilter');
        const director = getFilterValue('directorFilter');
        const studio = getFilterValue('studioFilter');
        const actor = getFilterValue('actorFilter');
        const scoreFilterVal = getFilterValue('scoreFilter');

        let clauses = [];
        let scoreJoin = "";

        if (scoreFilterVal !== "All") {
            scoreJoin = " JOIN movie_averages ma ON m.movieId = ma.movieId ";
            clauses.push(scoreCondition(scoreFilterVal));
        }

        if (searchWhereStr) clauses.push(`(${searchWhereStr})`);
        if (exactMovieData) clauses.push(`m.movieId = ${exactMovieData.movieId}`);
        if (genre !== "All") clauses.push(metaClause('genres', genre));
        if (director !== "All") clauses.push(metaClause('director', director));
        if (studio !== "All") clauses.push(metaClause('studio', studio));
        if (actor !== "All") clauses.push(metaClause('"cast"', actor));
        
        let finalWhereStr = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : "";

        const filtered = finalWhereStr !== "" || scoreJoin !== "";
        const filteredMovies = `SELECT m.movieId FROM movies m ${scoreJoin} ${finalWhereStr}`;
        const movieCheckRes = await query(`SELECT m.* FROM movies m ${scoreJoin} ${finalWhereStr} LIMIT 2`);
        const matchedMovies = movieCheckRes.toArray().map(row => row.toJSON());

        const tmdbMovie = matchedMovies.length === 1 && matchedMovies[0].source === 'TMDB' ? matchedMovies[0] : null;

        if (matchedMovies.length === 1) {
            const movieData = matchedMovies[0];
            document.getElementById('ui-title').innerText = movieData.title_clean;
            document.getElementById('ui-tags').innerText = `${movieData.release_year} • ${movieData.genres.split('|')[0]} • ${movieData.runtime}`;
            document.getElementById('ui-director').innerText = movieData.director;
            document.getElementById('ui-studio').innerText = movieData.studio;
            document.getElementById('ui-cast').innerText = movieData.cast;
            document.getElementById('ui-desc').innerText = movieData.description;
        } 
        else if (clauses.length > 0) {
            document.getElementById('ui-title').innerText = searchVal && !exactMovieData ? `"${searchVal}"` : "Filtered Results";
            document.getElementById('ui-tags').innerText = "FILTERED VIEW";
            document.getElementById('ui-desc').innerText = matchedMovies.length === 0 ? "No movies match these filters." : "Averages for the movies that match your filters.";
            document.getElementById('ui-director').innerText = director !== "All" ? director : "-";
            document.getElementById('ui-studio').innerText = studio !== "All" ? studio : "-";
            document.getElementById('ui-cast').innerText = actor !== "All" ? actor : "-";
        } 
        else {
            document.getElementById('ui-title').innerText = "All Movies";
            document.getElementById('ui-tags').innerText = "33.8 MILLION RATINGS";
            document.getElementById('ui-desc').innerText = "Averages across every rating in the MovieLens dataset.";
            document.getElementById('ui-director').innerText = "-";
            document.getElementById('ui-studio').innerText = "-";
            document.getElementById('ui-cast').innerText = "-";
        }

        let yearlyQuery = `
            SELECT 
                r.review_year as year, 
                SUM(r.rating * r.n) / SUM(r.n) as avg, 
                SUM(r.n)::BIGINT as count 
            FROM summary r
            GROUP BY r.review_year
            ORDER BY r.review_year
        `;
        if (filtered) {
            yearlyQuery = `
                WITH filtered_movies AS (${filteredMovies})
                SELECT 
                    r.review_year as year, 
                    SUM(r.rating * r.n) / SUM(r.n) as avg, 
                    SUM(r.n)::BIGINT as count 
                FROM summary r
                JOIN filtered_movies fm ON r.movieId = fm.movieId
                GROUP BY r.review_year
                ORDER BY r.review_year
            `;
        }
        
        const yearlyRes = await query(yearlyQuery);
        
        // THE FIX: Explicitly cast DuckDB BigInts into standard Javascript Numbers 
        // to prevent D3 from silently crashing during calculations!
        currentTrendData = yearlyRes.toArray().map(row => {
            const r = row.toJSON();
            return {
                year: Number(r.year),
                avg: Number(r.avg),
                count: Number(r.count)
            };
        });
        currentExactCount = d3.sum(currentTrendData, d => d.count);
        currentExactAvg = currentExactCount > 0
            ? d3.sum(currentTrendData, d => d.avg * d.count) / currentExactCount
            : 0;

        // TMDB-only movies are excluded from every MovieLens number above;
        // count how many the current filters would include.
        const newerRes = await query(`
            SELECT COUNT(*) AS c FROM movies m ${scoreJoin}
            ${finalWhereStr ? `${finalWhereStr} AND` : 'WHERE'} m.source = 'TMDB'
        `);
        const newerCount = Number(newerRes.toArray()[0].toJSON().c);

        if (tmdbMovie) {
            currentTrendData = [];
            updateTmdbHero(Number(tmdbMovie.tmdb_score), Number(tmdbMovie.tmdb_votes));
            showTrendMessage(`No MovieLens ratings for this film: the MovieLens data ends in July 2023, before its release.`);
            setSource(`TMDB community score · ${Number(tmdbMovie.tmdb_votes).toLocaleString()} votes`);
        } else {
            updateHeroMetric(currentExactAvg, currentExactCount);
            updateTrendChart(currentTrendData, currentExactAvg);
            const newer = newerCount > 0
                ? ` · plus ${newerCount.toLocaleString()} newer film${newerCount === 1 ? '' : 's'} from TMDB, not in this average`
                : '';
            setSource(`MovieLens · ratings 1995 – ${ML_SNAPSHOT_LABEL}${newer}`);
        }
        records.emptyNote = tmdbMovie
            ? `No individual ratings: MovieLens data ends ${ML_SNAPSHOT_LABEL}, before this film's release.`
            : null;

        // The records table runs on its own engine, so hand it plain movie ids.
        records.movieIds = filtered
            ? (await query(filteredMovies)).toArray().map(r => Number(r.toJSON().movieId))
            : null;
        records.knownTotal = tmdbMovie ? 0 : currentExactCount;
        records.userId = null;
        refreshRecords(true);

    } catch (error) {
        if (error instanceof StaleUpdate) return;
        console.error("Master Filter Failed:", error);
        // Say so on the page rather than leaving the previous numbers frozen.
        showTrendMessage("Couldn't update the charts. Please reload the page.");
        document.getElementById('reviewCount').innerText = "COULDN'T UPDATE";
    }
}

// Null-safe: a browser can briefly pair a cached older page with this script.
function setSource(text) {
    const el = document.getElementById('ui-source');
    if (el) el.innerText = text;
}

function setHeroLabel(text) {
    const el = document.getElementById('hero-label');
    if (el) el.innerText = text;
}

// TMDB scores are out of 10; colour them on the same scale as the 5-star ratings.
function updateTmdbHero(score, votes) {
    const displayElement = document.getElementById('scoreDisplay');
    setHeroLabel('TMDB Community Score');
    const currentVal = parseFloat(displayElement.innerText) || 0;
    d3.select(displayElement)
      .transition()
      .duration(400)
      .tween("text", function() {
          const i = d3.interpolate(currentVal, score);
          return function(t) { this.textContent = i(t).toFixed(1); };
      });
    document.getElementById('reviewCount').innerText = `OUT OF 10 · ${votes.toLocaleString()} VOTES`;
    // Banded on the 5-star equivalent (8.0/10 -> 4.0)
    paintHero(score / 2, `${bandOf(score / 2).label} on TMDB`);
}

// Band colour, readable text colour and the "vs average" line for the score square.
function paintHero(value, deltaText) {
    const heroSquare = document.getElementById('heroSquare');
    heroSquare.style.backgroundColor = bandColor(value);
    heroSquare.style.color = bandInk(value);
    const delta = document.getElementById('heroDelta');
    if (delta) delta.innerText = deltaText;
}

function vsAverageText(avg) {
    const label = bandOf(avg).label;
    if (overallMean === null) return label;
    const d = avg - overallMean;
    if (Math.abs(d) < 0.05) return `${label} · ≈ average`;
    return `${label} · ${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(2)} ${d > 0 ? 'above' : 'below'} avg`;
}

function showTrendMessage(text) {
    const container = document.getElementById("trend-container");
    container.replaceChildren();
    const msg = container.appendChild(document.createElement('div'));
    msg.className = 'trend-message';
    msg.innerText = text;
}

function updateHeroMetric(avg, count) {
    setHeroLabel('MovieLens Average Rating');
    const displayElement = document.getElementById('scoreDisplay');
    const countElement = document.getElementById('reviewCount');
    const heroSquare = document.getElementById('heroSquare');

    if (count === 0) {
        displayElement.innerText = "N/A";
        countElement.innerText = "0 REVIEWS";
        heroSquare.style.backgroundColor = "var(--bg-color)";
        heroSquare.style.color = "var(--text-main)";
        const delta = document.getElementById('heroDelta');
        if (delta) delta.innerText = "";
        return;
    }

    const currentVal = parseFloat(displayElement.innerText) || 0;
    const targetVal = parseFloat(avg); 
    
    d3.select(displayElement)
      .transition()
      .duration(400)
      .tween("text", function() {
          const i = d3.interpolate(currentVal, targetVal);
          return function(t) {
              this.textContent = i(t).toFixed(1);
          };
      });

    countElement.innerText = `${count.toLocaleString()} REVIEWS`;
    paintHero(avg, vsAverageText(avg));
}

// --- BLENDED VIOLIN PLOT RENDERER ---
function updateTrendChart(data, globalMean) {
    const container = document.getElementById("trend-container");
    if(!container) return;

    d3.select("#trend-container").selectAll("*").remove();

    if(!data || data.length === 0) return;

    const clean = data.filter(d => d.year != null && !isNaN(d.year));
    if(clean.length === 0) return;

    const trendDesc = document.querySelector('.trend-panel p');
    if (trendDesc) trendDesc.innerText = 'Average rating by year. The shaded area is wider in years with more reviews.';

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 350;
    const margin = {top: 20, right: 20, bottom: 30, left: 40};
    
    const svg = d3.select("#trend-container").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("width", "100%")
        .style("height", "100%")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain(d3.extent(clean, d => d.year))
        .range([0, width - margin.left - margin.right]);

    const y = d3.scaleLinear()
        .domain([0.5, 5.0]) 
        .range([height - margin.top - margin.bottom, 0]);

    const defs = svg.append("defs");
    const gradientId = "score-gradient-" + Math.random().toString(36).substring(2, 9); 
    
    const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", 0).attr("y1", y(5.0))  
        .attr("x2", 0).attr("y2", y(0.5)); 

    // Hard stops at the band edges: the line takes each band's colour where it
    // crosses that band's range (y runs 5.0 at the top to 0.5 at the bottom).
    const offset = v => `${((5.0 - v) / 4.5 * 100).toFixed(2)}%`;
    const edges = [5.0, ...BANDS.slice(0, -1).map(b => b.below).reverse(), 0.5];   // 5, 3.95, 3.45, 2.45, 0.5
    [...BANDS].reverse().forEach((band, i) => {
        gradient.append("stop").attr("offset", offset(edges[i])).style("stop-color", `var(--band-${band.key})`);
        gradient.append("stop").attr("offset", offset(edges[i + 1])).style("stop-color", `var(--band-${band.key})`);
    });

    let xTicksCount = 10;
    if (width < 450) xTicksCount = 3;      
    else if (width < 700) xTicksCount = 5; 

    svg.append("g")
        .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).tickSize(-height).ticks(xTicksCount))
        .call(g => g.select(".domain").remove());

    svg.append("g")
        .call(d3.axisLeft(y).tickSize(-width + margin.left + margin.right).ticks(5))
        .call(g => g.select(".domain").remove());

    const maxCount = d3.max(clean, d => d.count) || 1;

    const area = d3.area()
        .curve(d3.curveMonotoneX)
        .x(d => x(d.year))
        .y0(d => {
            const density = d.count / maxCount;
            const spread = 0.15 + (density * 1.20); 
            return y(Math.max(0.5, d.avg - spread));
        })
        .y1(d => {
            const density = d.count / maxCount;
            const spread = 0.15 + (density * 1.20);
            return y(Math.min(5.0, d.avg + spread));
        }); 

    svg.append("path")
        .datum(clean)
        .attr("fill", `url(#${gradientId})`)
        .attr("opacity", 0.15) 
        .attr("d", area);

    svg.append("line")
        .attr("x1", 0)
        .attr("x2", width - margin.left - margin.right)
        .attr("y1", y(globalMean))
        .attr("y2", y(globalMean))
        .attr("stroke", "#666")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

    const line = d3.line()
        .curve(d3.curveMonotoneX)
        .x(d => x(d.year))
        .y(d => y(d.avg));

    svg.append("path")
        .datum(clean)
        .attr("fill", "none")
        .attr("stroke", `url(#${gradientId})`)
        .attr("stroke-width", 3)
        .attr("d", line);

    const dotRadius = width < 500 ? 3 : 5;

    svg.selectAll(".dot")
        .data(clean)
        .join("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d.avg))
        .attr("r", dotRadius)
        .style("fill", d => selectedYears.has(d.year) ? "var(--text-main)" : "var(--panel-bg)")
        .style("stroke", d => bandColor(d.avg))
        .attr("stroke-width", 2.5)
        .style("cursor", "pointer")
        .on("click", (e, d) => {
            if(selectedYears.has(d.year)) selectedYears.delete(d.year); 
            else selectedYears.add(d.year);
            applyCrossFilters();
        });
}

function applyCrossFilters() {
    const isFiltered = selectedYears.size > 0;
    
    let displayAvg = currentExactAvg;
    let displayCount = currentExactCount;

    if (isFiltered) {
        const subset = currentTrendData.filter(d => selectedYears.has(d.year));
        displayCount = d3.sum(subset, d => d.count);
        if (displayCount > 0) {
            displayAvg = d3.sum(subset, d => d.avg * d.count) / displayCount;
        } else {
            displayAvg = 0;
        }
    }
    
    updateHeroMetric(displayAvg, displayCount);
    updateTrendChart(currentTrendData, currentExactAvg);

    document.getElementById('clear-trend-btn').style.display = isFiltered ? 'inline' : 'none';
    records.knownTotal = displayCount;
    records.userId = null;
    refreshRecords(true);

    if (isFiltered) {
        document.getElementById('ui-title').innerText = "Selected years";
        document.getElementById('ui-tags').innerText = "YEAR FILTER";
        document.getElementById('ui-desc').innerText = `Showing ratings from the years you picked on the chart.`;
        document.getElementById('ui-director').innerText = "-";
        document.getElementById('ui-studio').innerText = "-";
        document.getElementById('ui-cast').innerText = "-";
        setSource(`MovieLens · ratings from the selected years`);
    } else {
        refreshFilters(updateGen);
    }
}

// --- RAW RECORDS TABLE ---
// The dashboard above runs on the small pre-aggregated summary. This table
// queries every individual rating in ratings_full.parquet, which is fetched in
// the background once the dashboard is usable (or on request on phones).
const RECORDS_PAGE_SIZE = 25;
const FULL_FILE = 'ratings_full.parquet';
const FULL_FILE_MB = 81;

const records = {
    ready: false,
    conn: null,             // separate DuckDB engine, so slow scans never block the charts
    movieIds: null,         // movie ids matching the dashboard filters (null = all)
    emptyNote: null,        // why a filter has no individual ratings, if known
    userId: null,
    sort: { col: 'date', dir: 'DESC' },
    page: 0,
    total: 0,
    countKey: null,         // filter state the cached total belongs to
    knownTotal: null,       // match count the dashboard already computed from the summary
    running: false,
    dirty: false,           // state changed while a query was running
};

async function startRecordsEngine() {
    const workerUrl = URL.createObjectURL(new Blob([`importScripts("${duckBundle.mainWorker}");`], { type: 'text/javascript' }));
    const engine = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
    await engine.instantiate(duckBundle.mainModule, duckBundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    return engine;
}

function setRecordsStatus(text) {
    document.getElementById('records-status-text').innerText = text;
}

function initRecords() {
    document.getElementById('records-prev').addEventListener('click', () => { records.page--; refreshRecords(); });
    document.getElementById('records-next').addEventListener('click', () => { records.page++; refreshRecords(); });
    document.querySelectorAll('.records-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            records.sort = { col, dir: records.sort.col === col && records.sort.dir === 'DESC' ? 'ASC' : 'DESC' };
            refreshRecords(true);
        });
    });
    document.getElementById('records-user-chip').addEventListener('click', () => {
        records.userId = null;
        refreshRecords(true);
    });

    // Phones and data-saver mode get a button instead of a surprise 81 MB download.
    const saveData = navigator.connection && navigator.connection.saveData;
    const smallDevice = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    if (saveData || smallDevice) {
        setRecordsStatus('The full set is 33.8 million ratings.');
        const btn = document.getElementById('records-load-btn');
        btn.hidden = false;
        btn.addEventListener('click', () => { btn.hidden = true; loadFullDataset(); }, { once: true });
    } else {
        loadFullDataset();
    }
}

async function fetchWithProgress(url, onProgress) {
    const res = await fetchData(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || FULL_FILE_MB * 1e6;
    if (!res.body) return new Uint8Array(await res.arrayBuffer());

    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress(received, total);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return bytes;
}

async function loadFullDataset() {
    const progress = document.getElementById('records-progress');
    const bar = progress.querySelector('div');
    progress.hidden = false;
    const started = performance.now();
    try {
        const [engine, full, titles] = await Promise.all([
            startRecordsEngine(),
            fetchWithProgress(FULL_FILE, (got, total) => {
                bar.style.width = `${Math.min(100, got / total * 100)}%`;
                setRecordsStatus(`Downloading all ratings… ${(got / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`);
            }),
            fetchData('titles.parquet').then(r => r.arrayBuffer()).then(b => new Uint8Array(b)),
        ]);
        const loadedMB = (full.length / 1e6).toFixed(0);  // read before the buffer moves to the worker
        await engine.registerFileBuffer(FULL_FILE, full);
        await engine.registerFileBuffer('titles.parquet', titles);
        records.conn = await engine.connect();
        progress.hidden = true;
        document.querySelector('.records-footer').hidden = false;
        records.ready = true;
        setRecordsStatus(`Loaded ${loadedMB} MB in ${((performance.now() - started) / 1000).toFixed(1)}s`);
        refreshRecords(true);
    } catch (error) {
        console.error("Full dataset load failed:", error);
        progress.hidden = true;
        setRecordsStatus("Couldn't load the individual ratings. Please reload the page.");
    }
}

function recordsWhere() {
    // A selected user shows every rating they made, regardless of the dashboard filters.
    if (records.userId !== null) return `WHERE r.userId = ${records.userId}`;
    const clauses = [];
    if (records.movieIds) clauses.push(records.movieIds.length > 0 ? `r.movieId IN (${records.movieIds.join(',')})` : 'false');
    if (selectedYears.size > 0) clauses.push(`year(r.date) IN (${Array.from(selectedYears).join(',')})`);
    return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : "";
}

// Coalesces rapid changes: while a query runs, further changes just mark the
// state dirty, and one more query runs afterwards with the latest state.
async function refreshRecords(resetPage = false) {
    if (resetPage) records.page = 0;
    if (!records.ready) return;
    records.dirty = true;
    if (records.running) return;
    records.running = true;
    try {
        while (records.dirty) {
            records.dirty = false;
            await runRecordsQuery();
        }
    } finally {
        records.running = false;
    }
}

async function runRecordsQuery() {

    const chip = document.getElementById('records-user-chip');
    chip.style.display = records.userId !== null ? 'inline-block' : 'none';
    chip.innerText = `All ratings by user #${records.userId} ✕`;
    document.querySelectorAll('.records-table th[data-sort]').forEach(th => {
        const arrow = th.dataset.sort === records.sort.col ? (records.sort.dir === 'DESC' ? ' ↓' : ' ↑') : '';
        th.innerText = th.dataset.sort.toUpperCase() + arrow;
    });
    document.getElementById('records-timing').innerText = 'Searching…';

    const where = recordsWhere();
    const started = performance.now();
    try {
        // The dashboard's summary already gives the exact count for movie/year
        // filters, which saves a full scan; only a user filter needs counting.
        // The total only changes with the filters, so skip recounting when paging or sorting.
        if (records.userId === null && records.knownTotal !== null) {
            records.total = records.knownTotal;
            records.countKey = null;
        } else if (records.countKey !== where) {
            const countRes = await records.conn.query(`SELECT COUNT(*) AS c FROM '${FULL_FILE}' r ${where}`);
            if (records.dirty) return;
            records.total = Number(countRes.toArray()[0].toJSON().c);
            records.countKey = where;
        }

        const order = `${records.sort.col} ${records.sort.dir}, userId, movieId`;
        const pageRes = await records.conn.query(`
            WITH page AS (
                SELECT r.date, r.userId, r.movieId, r.rating
                FROM '${FULL_FILE}' r
                ${where}
                ORDER BY ${order}
                LIMIT ${RECORDS_PAGE_SIZE} OFFSET ${records.page * RECORDS_PAGE_SIZE}
            )
            SELECT strftime(p.date, '%Y-%m-%d') AS d, p.userId, p.rating, t.title_clean, t.release_year
            FROM page p
            LEFT JOIN 'titles.parquet' t ON p.movieId = t.movieId
            ORDER BY ${order.replace(/(^|, )/g, '$1p.')}
        `);
        if (records.dirty) return;   // newer state is waiting; skip drawing this one

        renderRecords(pageRes.toArray().map(r => r.toJSON()));
        const secs = ((performance.now() - started) / 1000).toFixed(1);
        document.getElementById('records-timing').innerText =
            `${records.total.toLocaleString()} matching ratings · searched all 33.8 million in ${secs} s`;
    } catch (error) {
        console.error("Records query failed:", error);
        document.getElementById('records-timing').innerText = "Couldn't load these ratings. Please reload the page.";
    }
}

function renderRecords(rows) {
    const body = document.getElementById('records-body');
    body.replaceChildren();

    if (rows.length === 0) {
        const td = document.createElement('td');
        td.colSpan = 4; td.className = 'empty'; td.innerText = records.emptyNote || 'No ratings match these filters.';
        body.appendChild(document.createElement('tr')).appendChild(td);
    }

    for (const row of rows) {
        const tr = document.createElement('tr');

        const date = tr.appendChild(document.createElement('td'));
        date.innerText = row.d;

        const user = tr.appendChild(document.createElement('td'));
        user.className = 'num';
        const userBtn = user.appendChild(document.createElement('button'));
        userBtn.className = 'user-link';
        userBtn.innerText = `#${row.userId}`;
        userBtn.title = 'Show every rating by this user';
        userBtn.addEventListener('click', () => { records.userId = Number(row.userId); refreshRecords(true); });

        const movie = tr.appendChild(document.createElement('td'));
        movie.className = 'movie';
        movie.innerText = row.title_clean
            ? (row.release_year ? `${row.title_clean} (${row.release_year})` : row.title_clean)
            : 'Unknown title';

        const rating = tr.appendChild(document.createElement('td'));
        rating.className = 'num';
        const dot = rating.appendChild(document.createElement('span'));
        dot.className = 'band-dot';
        dot.style.background = bandColor(Number(row.rating));
        rating.append(`${Number(row.rating).toFixed(1)} ★`);
        rating.style.fontWeight = '700';
        rating.title = bandOf(Number(row.rating)).label;

        body.appendChild(tr);
    }

    const pages = Math.max(1, Math.ceil(records.total / RECORDS_PAGE_SIZE));
    document.getElementById('records-page').innerText = `Page ${(records.page + 1).toLocaleString()} of ${pages.toLocaleString()}`;
    document.getElementById('records-prev').disabled = records.page === 0;
    document.getElementById('records-next').disabled = records.page + 1 >= pages;
}

initializeDashboard();
