import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

// Global State
let conn;
let distSvg, distPath, distX, distY, distAvgLine, distAvgText, distSubText, distBrushGroup, brush; 
let trendSvg, trendPath, trendX, trendY, trendArea, trendDots; 
let currentRatingsData = []; 
let filterDebounce;

// Exact Stats State
let currentExactAvg = null;
let currentExactCount = null;

// Interactive States
let selectedYears = new Set(); 
let scoreRange = null; 

async function initializeDashboard() {
    const loadingText = document.getElementById('loading-overlay');
    const mainStage = document.getElementById('main-stage');

    try {
       // --- 1. INJECT NATIVE MOBILE AUTOCOMPLETE UI ---
        const style = document.createElement('style');
        style.textContent = `
            .search-wrapper { 
                position: relative; 
                flex: 1; 
                min-width: 200px; 
                display: flex; 
                align-items: stretch; 
            }
            .search-wrapper input {
                width: 100%;
                margin: 0;
                box-sizing: border-box;
            }
            .autocomplete-overlay {
                position: absolute; top: 100%; left: 0; right: 0;
                background: #1e1e1e; border: 1px solid #333; border-top: none;
                max-height: 250px; overflow-y: auto; z-index: 9999;
                border-radius: 0 0 6px 6px; box-shadow: 0 15px 35px rgba(0,0,0,0.9);
                display: none; flex-direction: column;
            }
            .autocomplete-item {
                padding: 12px 15px; border-bottom: 1px solid #2a2a2a;
                cursor: pointer; color: #e0e0e0; font-size: 14px; font-family: 'Inter', sans-serif;
            }
            .autocomplete-item:last-child { border-bottom: none; }
            .autocomplete-item:hover, .autocomplete-item:active { background: #ff4b4b; color: #fff; }
        `;
        document.head.appendChild(style);

        const searchBar = document.getElementById('searchBar');
        searchBar.removeAttribute('list'); // Kill the buggy native datalist
        const oldDatalist = document.getElementById('movie-suggestions');
        if (oldDatalist) oldDatalist.remove();

        const wrapper = document.createElement('div');
        wrapper.className = 'search-wrapper';
        searchBar.parentNode.insertBefore(wrapper, searchBar);
        wrapper.appendChild(searchBar);
        searchBar.style.width = "100%"; 

        const autocompleteOverlay = document.createElement('div');
        autocompleteOverlay.className = 'autocomplete-overlay';
        wrapper.appendChild(autocompleteOverlay);

        // --- 2. BOOT DUCKDB ---
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        const worker_url = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
        const worker = new Worker(worker_url);
        const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);

        loadingText.innerText = "Mounting Parquet Files...";
        const [mRes, rRes] = await Promise.all([
            fetch('movies.parquet?v=' + Date.now()),
            fetch('ratings.parquet?v=' + Date.now())
        ]);
        await db.registerFileBuffer('movies.parquet', new Uint8Array(await mRes.arrayBuffer()));
        await db.registerFileBuffer('ratings.parquet', new Uint8Array(await rRes.arrayBuffer()));
        conn = await db.connect();

        loadingText.innerText = "Calculating Averages...";
        await conn.query(`
            CREATE TABLE movie_averages AS 
            SELECT movieId, AVG(rating) as avg_rating 
            FROM 'ratings.parquet' 
            GROUP BY movieId
        `);

        setupDistributionChart();
        setupTrendChart();
        
        loadingText.innerText = "Indexing Metadata...";
        await refreshFilters(); 

        loadingText.style.display = 'none';
        mainStage.style.opacity = '1';
        
        searchBar.disabled = false;
        document.querySelectorAll('.filter-group input').forEach(input => input.disabled = false);

        async function handleUIChange() {
            mainStage.style.opacity = '0.5'; 
            scoreRange = null;
            selectedYears.clear();
            if(distBrushGroup) distBrushGroup.call(brush.move, null);
            document.getElementById('clear-dist-btn').style.display = 'none';
            document.getElementById('clear-trend-btn').style.display = 'none';
            
            await refreshFilters(); 
            await applyUnifiedFilters();
            mainStage.style.opacity = '1'; 
        }

        // --- 3. TOKENIZED FUZZY SEARCH LOGIC ---
        let searchDebounce;
        
        searchBar.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            clearTimeout(searchDebounce);
            
            if (val.length < 2) {
                autocompleteOverlay.style.display = 'none';
                return;
            }

            searchDebounce = setTimeout(async () => {
                // Split input by spaces to handle inverted titles like "Matrix, The"
                const tokens = val.split(' ').filter(t => t.trim() !== '');
                const likeClauses = tokens.map(t => `title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
                
                try {
                    const res = await conn.query(`SELECT DISTINCT title_clean FROM 'movies.parquet' WHERE ${likeClauses} ORDER BY title_clean LIMIT 10`);
                    const suggestions = res.toArray().map(r => r.toJSON().title_clean);
                    
                    if (suggestions.length > 0) {
                        autocompleteOverlay.innerHTML = suggestions.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
                        autocompleteOverlay.style.display = 'flex';
                        
                        // Add click events to the new custom dropdown items
                        autocompleteOverlay.querySelectorAll('.autocomplete-item').forEach(div => {
                            div.addEventListener('click', async () => {
                                searchBar.value = div.innerText;
                                autocompleteOverlay.style.display = 'none';
                                await handleUIChange();
                            });
                        });
                    } else {
                        autocompleteOverlay.innerHTML = `<div class="autocomplete-item" style="color:#777; font-style:italic;">No matches found...</div>`;
                        autocompleteOverlay.style.display = 'flex';
                    }
                } catch(err) { console.error(err); }
            }, 250); // Fast 250ms debounce
        });

        // Close dropdown if tapping outside
        document.addEventListener('click', (e) => {
            if (e.target !== searchBar && !autocompleteOverlay.contains(e.target)) {
                autocompleteOverlay.style.display = 'none';
            }
        });

        // Trigger search on 'Enter' key
        searchBar.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                autocompleteOverlay.style.display = 'none';
                searchBar.blur(); // Drops the mobile keyboard
                await handleUIChange();
            }
        });

        document.querySelectorAll('.filter-group input[list]:not(#searchBar)').forEach(input => {
            input.addEventListener('change', handleUIChange);
        });

        document.getElementById('resetBtn').addEventListener('click', async () => {
            mainStage.style.opacity = '0.5';
            document.querySelectorAll('.filter-group input, #searchBar').forEach(input => input.value = "");
            scoreRange = null;
            selectedYears.clear();
            if(distBrushGroup) distBrushGroup.call(brush.move, null);
            document.getElementById('clear-dist-btn').style.display = 'none';
            document.getElementById('clear-trend-btn').style.display = 'none';

            await refreshFilters();
            await applyUnifiedFilters();
            mainStage.style.opacity = '1';
        });

        document.getElementById('clear-dist-btn').addEventListener('click', () => {
            if(distBrushGroup) distBrushGroup.call(brush.move, null);
        });

        document.getElementById('clear-trend-btn').addEventListener('click', () => {
            selectedYears.clear();
            applyCrossFilters('trend');
        });

        await applyUnifiedFilters(); 

    } catch (error) {
        console.error("Dashboard Engine Failed:", error);
        loadingText.innerText = "Engine Error. Check browser console.";
    }
}

function getFilterValue(id) {
    const el = document.getElementById(id);
    if (!el) return "All";
    const val = el.value.trim();
    return (val === "") ? "All" : val;
}

// --- 4. APPLYING THE TOKENIZED SEARCH TO THE FILTERS ---
async function refreshFilters() {
    try {
        const searchEl = document.getElementById('searchBar');
        const searchVal = searchEl && searchEl.value.trim() !== "" ? searchEl.value.trim() : null;

        let exactMovieData = null;
        let searchWhereStr = null;

        if (searchVal) {
            const exactRes = await conn.query(`SELECT * FROM 'movies.parquet' WHERE title_clean = '${searchVal.replace(/'/g, "''")}' LIMIT 1`);
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

        let srcClause = null;
        if (exactMovieData) srcClause = `m.movieId = ${exactMovieData.movieId}`;
        else if (searchWhereStr) srcClause = `(${searchWhereStr})`;

        const gClause = genre !== "All" ? `m.genres LIKE '%${genre.replace(/'/g, "''")}%'` : null;
        const dClause = director !== "All" ? `m.director = '${director.replace(/'/g, "''")}'` : null;
        const sClause = studio !== "All" ? `m.studio = '${studio.replace(/'/g, "''")}'` : null;
        const aClause = actor !== "All" ? `m."cast" LIKE '%${actor.replace(/'/g, "''")}%'` : null;

        const buildWhere = (clauses) => {
            const valid = clauses.filter(c => c !== null);
            return valid.length > 0 ? `WHERE ${valid.join(' AND ')}` : "";
        };

        const whereForGenre = buildWhere([srcClause, dClause, sClause, aClause]);               
        const whereForDir = buildWhere([srcClause, gClause, sClause, aClause]);                 
        const whereForStudio = buildWhere([srcClause, gClause, dClause, aClause]);              
        const whereForActor = buildWhere([srcClause, gClause, dClause, sClause]);              

        let joinClause = "";
        if (scoreRange) joinClause += ` JOIN movie_averages avg_filt ON m.movieId = avg_filt.movieId AND avg_filt.avg_rating >= ${scoreRange[0]} AND avg_filt.avg_rating <= ${scoreRange[1]} `;
        if (selectedYears.size > 0) joinClause += ` JOIN (SELECT DISTINCT movieId FROM 'ratings.parquet' WHERE review_year IN (${Array.from(selectedYears).join(',')})) y_filt ON m.movieId = y_filt.movieId `;

        const baseFrom = `FROM 'movies.parquet' m ${joinClause}`;
        const dirWhereStr = whereForDir ? `${whereForDir} AND m.director != 'Unknown'` : `WHERE m.director != 'Unknown'`;
        const stdWhereStr = whereForStudio ? `${whereForStudio} AND m.studio != 'N/A'` : `WHERE m.studio != 'N/A'`;
        const actWhereStr = whereForActor ? `${whereForActor} AND m."cast" != 'N/A'` : `WHERE m."cast" != 'N/A'`;

        const queries = [
            conn.query(`SELECT DISTINCT trim(unnest(string_split(m.genres, '|'))) as g ${baseFrom} ${whereForGenre} ORDER BY g`),
            conn.query(`SELECT DISTINCT m.director ${baseFrom} ${dirWhereStr} ORDER BY m.director`),
            conn.query(`SELECT DISTINCT m.studio ${baseFrom} ${stdWhereStr} ORDER BY m.studio`),
            conn.query(`SELECT DISTINCT trim(unnest(string_split(m."cast", ','))) as a ${baseFrom} ${actWhereStr} ORDER BY a`)
        ];

        const [gRes, dRes, sRes, aRes] = await Promise.all(queries);

        updateDatalist('genreList', gRes.toArray().map(r => r.toJSON().g));
        updateDatalist('directorList', dRes.toArray().map(r => r.toJSON().director));
        updateDatalist('studioList', sRes.toArray().map(r => r.toJSON().studio));
        updateDatalist('actorList', aRes.toArray().map(r => r.toJSON().a));
    } catch (error) {
        console.error("Filter Sync Failed:", error);
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

async function applyUnifiedFilters() {
    try {
        const searchEl = document.getElementById('searchBar');
        const searchVal = searchEl && searchEl.value.trim() !== "" ? searchEl.value.trim() : "";
        
        let exactMovieData = null;
        let searchWhereStr = null;

        if (searchVal !== "") {
            const exactRes = await conn.query(`SELECT * FROM 'movies.parquet' WHERE title_clean = '${searchVal.replace(/'/g, "''")}' LIMIT 1`);
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

        let clauses = [];
        if (searchWhereStr) clauses.push(`(${searchWhereStr})`);
        if (genre !== "All") clauses.push(`m.genres LIKE '%${genre.replace(/'/g, "''")}%'`);
        if (director !== "All") clauses.push(`m.director = '${director.replace(/'/g, "''")}'`);
        if (studio !== "All") clauses.push(`m.studio = '${studio.replace(/'/g, "''")}'`);
        if (actor !== "All") clauses.push(`m."cast" LIKE '%${actor.replace(/'/g, "''")}%'`);
        
        let query;

        // EXACT MATCH (Single Movie via exact title)
        if (exactMovieData && genre === "All" && director === "All" && studio === "All" && actor === "All") {
            const movieData = exactMovieData;
            
            document.getElementById('ui-title').innerText = movieData.title_clean;
            document.getElementById('ui-tags').innerText = `${movieData.release_year} • ${movieData.genres.split('|')[0]} • ${movieData.runtime}`;
            document.getElementById('ui-director').innerText = movieData.director;
            document.getElementById('ui-studio').innerText = movieData.studio;
            document.getElementById('ui-cast').innerText = movieData.cast;
            document.getElementById('ui-desc').innerText = movieData.description;

            const exactStats = await conn.query(`SELECT COUNT(rating) as c, AVG(rating) as a FROM 'ratings.parquet' WHERE movieId = ${movieData.movieId}`);
            if(exactStats.toArray().length > 0 && exactStats.toArray()[0].toJSON().c !== null) {
                currentExactCount = Number(exactStats.toArray()[0].toJSON().c);
                currentExactAvg = Number(exactStats.toArray()[0].toJSON().a);
            }

            query = `SELECT rating, review_year FROM 'ratings.parquet' WHERE movieId = ${movieData.movieId}`;
            
        } 
        // FILTERED MATCH (Fuzzy Search OR Metadata dropdowns)
        else if (clauses.length > 0 || exactMovieData) {
            document.getElementById('ui-title').innerText = exactMovieData ? exactMovieData.title_clean : "Filtered Results";
            document.getElementById('ui-tags').innerText = "CROSS-SECTIONAL METADATA";
            document.getElementById('ui-desc').innerText = "Viewing aggregate data based on your selected text filters.";
            document.getElementById('ui-director').innerText = director !== "All" ? director : "-";
            document.getElementById('ui-studio').innerText = studio !== "All" ? studio : "-";
            document.getElementById('ui-cast').innerText = actor !== "All" ? actor : "-";

            if (exactMovieData) clauses.push(`m.movieId = ${exactMovieData.movieId}`);
            const finalWhereStr = `WHERE ${clauses.join(' AND ')}`;

            // Run Exact Math First
            const exactStats = await conn.query(`
                WITH filtered_movies AS (SELECT movieId FROM 'movies.parquet' m ${finalWhereStr})
                SELECT COUNT(r.rating) as c, AVG(r.rating) as a FROM 'ratings.parquet' r
                JOIN filtered_movies m ON r.movieId = m.movieId
            `);
            
            if(exactStats.toArray().length > 0 && exactStats.toArray()[0].toJSON().c !== null) {
                currentExactCount = Number(exactStats.toArray()[0].toJSON().c);
                currentExactAvg = Number(exactStats.toArray()[0].toJSON().a);
            } else {
                currentExactCount = 0; currentExactAvg = 0;
            }

            // Run Sampled Query for D3 Charts
            query = `
                WITH filtered_movies AS (SELECT movieId FROM 'movies.parquet' m ${finalWhereStr})
                SELECT r.rating, r.review_year FROM 'ratings.parquet' r
                JOIN filtered_movies m ON r.movieId = m.movieId
                USING SAMPLE 2 PERCENT (bernoulli)
            `;
        } 
        // GLOBAL VIEW (No Filters)
        else {
            document.getElementById('ui-title').innerText = "All Movies";
            document.getElementById('ui-tags').innerText = "25M+ REVIEWS • GLOBAL DATASET";
            document.getElementById('ui-desc').innerText = "Viewing the aggregate distribution of the MovieLens dataset. Use the filters above or drag a selection box over the charts.";
            document.getElementById('ui-director').innerText = "-";
            document.getElementById('ui-studio').innerText = "-";
            document.getElementById('ui-cast').innerText = "-";

            const exactStats = await conn.query(`SELECT COUNT(rating) as c, AVG(rating) as a FROM 'ratings.parquet'`);
            currentExactCount = Number(exactStats.toArray()[0].toJSON().c);
            currentExactAvg = Number(exactStats.toArray()[0].toJSON().a);

            query = `SELECT rating, review_year FROM 'ratings.parquet' USING SAMPLE 0.2 PERCENT (bernoulli)`;
        }
        
        const res = await conn.query(query);
        currentRatingsData = res.toArray().map(row => row.toJSON());

        updateDistributionChart(currentRatingsData.map(d => d.rating), currentExactAvg, currentExactCount);
        updateTrendChart(currentRatingsData);
    } catch (error) {
        console.error("Master Filter Failed:", error);
    }
}

function applyCrossFilters(source) {
    if (source !== 'dist') {
        const isFiltered = selectedYears.size > 0;
        const distScores = isFiltered 
            ? currentRatingsData.filter(d => selectedYears.has(d.review_year)).map(d => d.rating) 
            : currentRatingsData.map(d => d.rating);
        
        updateDistributionChart(
            distScores, 
            isFiltered ? null : currentExactAvg, 
            isFiltered ? null : currentExactCount
        );
    }
    
    if (source !== 'trend') {
        const trendData = scoreRange 
            ? currentRatingsData.filter(d => d.rating >= scoreRange[0] && d.rating <= scoreRange[1])
            : currentRatingsData;
        updateTrendChart(trendData);
    }

    document.getElementById('clear-dist-btn').style.display = scoreRange ? 'inline' : 'none';
    document.getElementById('clear-trend-btn').style.display = selectedYears.size > 0 ? 'inline' : 'none';

    if (scoreRange || selectedYears.size > 0) {
        document.getElementById('ui-title').innerText = "Visual Filter Active";
        document.getElementById('ui-tags').innerText = "DYNAMIC SELECTION";
        document.getElementById('ui-desc').innerText = `Filtering dataset by chart selection. Text inputs and search bar have been updated to only show movies matching these constraints.`;
        document.getElementById('ui-director').innerText = "-";
        document.getElementById('ui-studio').innerText = "-";
        document.getElementById('ui-cast').innerText = "-";
    }

    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => { refreshFilters(); }, 400); 
}

function setupDistributionChart() {
    const width = 800, height = 300; 
    distSvg = d3.select("#dist-container").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "auto")
        .append("g");
    
    const grad = distSvg.append("defs").append("linearGradient").attr("id", "dist-gradient").attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ff4b4b");
    grad.append("stop").attr("offset", "50%").attr("stop-color", "#ffd166");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#06d6a0");

    distX = d3.scaleLinear().domain([0.5, 5.0]).range([30, width - 30]);
    distY = d3.scaleLinear().range([height - 20, 20]); 
    
    distPath = distSvg.append("path").attr("fill", "url(#dist-gradient)").attr("opacity", 0.9);
    distAvgLine = distSvg.append("line").attr("stroke", "#fff").attr("stroke-width", 3).style("filter", "drop-shadow(0 0 5px white)");
    
    distAvgText = distSvg.append("text").attr("fill", "#fff").attr("font-size", "3.5rem").attr("font-weight", "700");
    distSubText = distSvg.append("text").attr("fill", "#a0a0a0").attr("font-size", "1.2rem").attr("font-family", "Inter, sans-serif");

    brush = d3.brushX()
        .extent([[30, 0], [width - 30, height]])
        .on("end", (event) => {
            if (!event.selection) {
                scoreRange = null;
            } else {
                const [x0, x1] = event.selection;
                scoreRange = [distX.invert(x0), distX.invert(x1)];
            }
            if (event.sourceEvent) applyCrossFilters('dist');
        });

    distBrushGroup = distSvg.append("g").attr("class", "brush").call(brush);
}

function updateDistributionChart(scores, exactAvg = null, exactCount = null) {
    if(!scores || scores.length === 0 || exactCount === 0) {
        distPath.transition().duration(400).attr("opacity", 0);
        distAvgLine.transition().duration(400).attr("opacity", 0);
        distAvgText.text("");
        distSubText.text("");
        return;
    }
    
    distPath.transition().duration(400).attr("opacity", 0.9);
    distAvgLine.transition().duration(400).attr("opacity", 1);

    const avg = d3.mean(scores);
    const kde = (kernel, X) => V => X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
    const epanechnikov = k => v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    const density = kde(epanechnikov(0.3), distX.ticks(50))(scores);
    
    distY.domain([0, d3.max(density, d => d[1]) * 1.1]);
    distPath.datum(density).transition().duration(750).attr("d", d3.area().curve(d3.curveBasis).x(d => distX(d[0])).y0(280).y1(d => distY(d[1])));
    distAvgLine.transition().duration(750).attr("x1", distX(avg)).attr("x2", distX(avg)).attr("y1", 280).attr("y2", 0);

    const isRight = avg > 3.5;
    
    const displayAvg = exactAvg !== null ? exactAvg : avg;
    const displayCount = exactCount !== null ? exactCount : scores.length;

    distAvgText.transition().duration(750)
        .attr("x", distX(avg) + (isRight ? -30 : 30)).attr("text-anchor", isRight ? "end" : "start").attr("y", 130)
        .textTween(function() {
            const i = d3.interpolate(parseFloat(this.textContent) || 0, displayAvg);
            return t => i(t).toFixed(1);
        });

    distSubText.transition().duration(750)
        .attr("x", distX(avg) + (isRight ? -30 : 30)).attr("text-anchor", isRight ? "end" : "start").attr("y", 160)
        .text(`avg on ${displayCount.toLocaleString()} reviews`);

    if(distBrushGroup) distBrushGroup.raise();
}

function setupTrendChart() {
    const width = 800, height = 300; 
    const margin = {top: 20, right: 20, bottom: 30, left: 45};
    
    trendSvg = d3.select("#trend-container").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "auto")
        .append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        
    trendX = d3.scaleLinear().range([0, width - margin.left - margin.right]);
    trendY = d3.scaleLinear().domain([0.5, 5.0]).range([height - margin.top - margin.bottom, 0]);
    
    trendSvg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height - margin.top - margin.bottom})`).attr("color", "#666");
    trendSvg.append("g").attr("class", "y-axis").attr("color", "#666").call(d3.axisLeft(trendY).ticks(5));
    
    trendArea = trendSvg.append("path").attr("fill", "rgba(255, 42, 42, 0.1)");
    trendPath = trendSvg.append("path").attr("fill", "none").attr("stroke", "#FF2A2A").attr("stroke-width", 3);
    trendDots = trendSvg.append("g");
}

function updateTrendChart(data) {
    if(!data || data.length === 0) {
        trendPath.attr("d", null); trendArea.attr("d", null); trendDots.selectAll(".trend-dot").remove();
        return;
    }
    
    const grouped = d3.rollup(data, v => d3.mean(v, d => d.rating), d => d.review_year);
    const clean = Array.from(grouped, ([year, avg]) => ({year, avg})).filter(d => !isNaN(d.year)).sort((a,b) => a.year - b.year);
    
    trendX.domain(d3.extent(clean, d => d.year));
    trendSvg.select(".x-axis").transition().duration(750).call(d3.axisBottom(trendX).tickFormat(d3.format("d")));
    trendPath.datum(clean).transition().duration(750).attr("d", d3.line().curve(d3.curveMonotoneX).x(d => trendX(d.year)).y(d => trendY(d.avg)));
    trendArea.datum(clean).transition().duration(750).attr("d", d3.area().curve(d3.curveMonotoneX).x(d => trendX(d.year)).y0(trendY(0.5)).y1(d => trendY(d.avg)));

    trendDots.selectAll(".trend-dot").data(clean).join("circle").attr("class", "trend-dot")
        .attr("fill", d => selectedYears.has(d.year) ? "#FF2A2A" : "#121212")
        .attr("stroke", "#FF2A2A").attr("stroke-width", 2).attr("r", d => selectedYears.has(d.year) ? 8 : 5)
        .style("cursor", "pointer")
        .on("click", (e, d) => {
            if(selectedYears.has(d.year)) selectedYears.delete(d.year); else selectedYears.add(d.year);
            applyCrossFilters('trend');
        })
        .transition().duration(750).attr("cx", d => trendX(d.year)).attr("cy", d => trendY(d.avg));
}

initializeDashboard();
