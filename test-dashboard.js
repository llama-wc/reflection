import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

// Global State
let conn;
let trendSvg, trendPath, trendX, trendY, trendArea, trendDots; 
let currentTrendData = []; 

// Exact Stats State
let currentExactAvg = 0;
let currentExactCount = 0;

// Interactive States
let selectedYears = new Set(); 

// PURE FLAT COLOR SCALE 
const colorScale = d3.scaleLinear()
    .domain([0.5, 2.75, 5.0]) 
    .range(["#FF2A2A", "#FF9F00", "#00E676"]) 
    .interpolate(d3.interpolateRgb); 

async function initializeDashboard() {
    const loadingText = document.getElementById('loading-overlay');
    const mainStage = document.getElementById('main-stage');

    try {
        const searchBar = document.getElementById('searchBar');
        const autocompleteOverlay = document.getElementById('autocompleteOverlay');

        // BOOT DUCKDB
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
        
        loadingText.innerText = "Indexing Metadata...";
        await refreshFilters(); 

        loadingText.style.display = 'none';
        mainStage.style.opacity = '1';
        
        searchBar.disabled = false;
        document.querySelectorAll('.filter-group input').forEach(input => input.disabled = false);

        async function handleUIChange() {
            mainStage.style.opacity = '0.5'; 
            selectedYears.clear();
            document.getElementById('clear-trend-btn').style.display = 'none';
            await refreshFilters(); 
            await applyUnifiedFilters();
            mainStage.style.opacity = '1'; 
        }

        // TOKENIZED FUZZY SEARCH LOGIC
        let searchDebounce;
        searchBar.addEventListener('input', async (e) => {
            const val = e.target.value.trim();
            clearTimeout(searchDebounce);
            
            // THE FIX: If the search bar is cleared out, instantly reset the dataset
            if (val.length === 0) {
                autocompleteOverlay.style.display = 'none';
                await handleUIChange();
                return;
            }

            if (val.length < 2) {
                autocompleteOverlay.style.display = 'none';
                return;
            }

            searchDebounce = setTimeout(async () => {
                const tokens = val.split(' ').filter(t => t.trim() !== '');
                const likeClauses = tokens.map(t => `title_clean ILIKE '%${t.replace(/'/g, "''")}%'`).join(' AND ');
                
                try {
                    const res = await conn.query(`SELECT DISTINCT title_clean FROM 'movies.parquet' WHERE ${likeClauses} ORDER BY title_clean LIMIT 10`);
                    const suggestions = res.toArray().map(r => r.toJSON().title_clean);
                    
                    if (suggestions.length > 0) {
                        autocompleteOverlay.innerHTML = suggestions.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
                        autocompleteOverlay.style.display = 'flex';
                        
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
            }, 250); 
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
                await handleUIChange();
            }
        });

        document.querySelectorAll('.filter-group input[list]:not(#searchBar)').forEach(input => {
            input.addEventListener('change', handleUIChange);
        });

        document.getElementById('resetBtn').addEventListener('click', async () => {
            mainStage.style.opacity = '0.5';
            document.querySelectorAll('.filter-group input').forEach(input => input.value = "");
            selectedYears.clear();
            document.getElementById('clear-trend-btn').style.display = 'none';

            await refreshFilters();
            await applyUnifiedFilters();
            mainStage.style.opacity = '1';
        });

        document.getElementById('clear-trend-btn').addEventListener('click', () => {
            selectedYears.clear();
            applyCrossFilters();
        });

        await applyUnifiedFilters(); 
        
        window.addEventListener('resize', () => {
            if(currentTrendData.length > 0) updateTrendChart(currentTrendData, currentExactAvg);
        });

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
        
        let finalWhereStr = "";

        if (exactMovieData && genre === "All" && director === "All" && studio === "All" && actor === "All") {
            document.getElementById('ui-title').innerText = exactMovieData.title_clean;
            document.getElementById('ui-tags').innerText = `${exactMovieData.release_year} • ${exactMovieData.genres.split('|')[0]} • ${exactMovieData.runtime}`;
            document.getElementById('ui-director').innerText = exactMovieData.director;
            document.getElementById('ui-studio').innerText = exactMovieData.studio;
            document.getElementById('ui-cast').innerText = exactMovieData.cast;
            document.getElementById('ui-desc').innerText = exactMovieData.description;
            finalWhereStr = `WHERE m.movieId = ${exactMovieData.movieId}`;
        } 
        else if (clauses.length > 0 || exactMovieData) {
            document.getElementById('ui-title').innerText = exactMovieData ? exactMovieData.title_clean : "Filtered Results";
            document.getElementById('ui-tags').innerText = "CROSS-SECTIONAL METADATA";
            document.getElementById('ui-desc').innerText = "Viewing exact aggregate data based on your selected text filters.";
            document.getElementById('ui-director').innerText = director !== "All" ? director : "-";
            document.getElementById('ui-studio').innerText = studio !== "All" ? studio : "-";
            document.getElementById('ui-cast').innerText = actor !== "All" ? actor : "-";
            
            if (exactMovieData) clauses.push(`m.movieId = ${exactMovieData.movieId}`);
            finalWhereStr = `WHERE ${clauses.join(' AND ')}`;
        } 
        else {
            document.getElementById('ui-title').innerText = "All Movies";
            document.getElementById('ui-tags').innerText = "25M+ REVIEWS • GLOBAL DATASET";
            document.getElementById('ui-desc').innerText = "Viewing the exact aggregate math for the entire MovieLens dataset.";
            document.getElementById('ui-director').innerText = "-";
            document.getElementById('ui-studio').innerText = "-";
            document.getElementById('ui-cast').innerText = "-";
        }

        let statsQuery = `
            SELECT COUNT(r.rating) as c, AVG(r.rating) as a 
            FROM 'ratings.parquet' r
        `;
        if (finalWhereStr !== "") {
            statsQuery = `
                WITH filtered_movies AS (SELECT movieId FROM 'movies.parquet' m ${finalWhereStr})
                SELECT COUNT(r.rating) as c, AVG(r.rating) as a FROM 'ratings.parquet' r
                JOIN filtered_movies m ON r.movieId = m.movieId
            `;
        }
        const exactStats = await conn.query(statsQuery);
        if(exactStats.toArray().length > 0 && exactStats.toArray()[0].toJSON().c !== null) {
            currentExactCount = Number(exactStats.toArray()[0].toJSON().c);
            currentExactAvg = Number(exactStats.toArray()[0].toJSON().a);
        } else {
            currentExactCount = 0; currentExactAvg = 0;
        }

        let yearlyQuery = `
            SELECT 
                r.review_year as year, 
                AVG(r.rating) as avg, 
                COALESCE(STDDEV_POP(r.rating), 0) as std, 
                COUNT(r.rating) as count 
            FROM 'ratings.parquet' r
            GROUP BY r.review_year
            ORDER BY r.review_year
        `;
        if (finalWhereStr !== "") {
            yearlyQuery = `
                WITH filtered_movies AS (SELECT movieId FROM 'movies.parquet' m ${finalWhereStr})
                SELECT 
                    r.review_year as year, 
                    AVG(r.rating) as avg, 
                    COALESCE(STDDEV_POP(r.rating), 0) as std, 
                    COUNT(r.rating) as count 
                FROM 'ratings.parquet' r
                JOIN filtered_movies m ON r.movieId = m.movieId
                GROUP BY r.review_year
                ORDER BY r.review_year
            `;
        }
        
        const yearlyRes = await conn.query(yearlyQuery);
        currentTrendData = yearlyRes.toArray().map(row => row.toJSON());

        updateHeroMetric(currentExactAvg, currentExactCount);
        updateTrendChart(currentTrendData, currentExactAvg);

    } catch (error) {
        console.error("Master Filter Failed:", error);
    }
}

// --- 6. HERO SQUARE RENDERER ---
function updateHeroMetric(avg, count) {
    const displayElement = document.getElementById('scoreDisplay');
    const countElement = document.getElementById('reviewCount');
    const heroSquare = document.getElementById('heroSquare');

    if (count === 0) {
        displayElement.innerText = "N/A";
        countElement.innerText = "0 REVIEWS";
        heroSquare.style.backgroundColor = "#121212";
        return;
    }

    const currentVal = parseFloat(displayElement.innerText) || 0;
    const targetVal = parseFloat(avg); 
    
    d3.select(displayElement)
      .transition()
      .duration(750)
      .tween("text", function() {
          const i = d3.interpolate(currentVal, targetVal);
          return function(t) {
              this.textContent = i(t).toFixed(1);
          };
      });

    countElement.innerText = `${count.toLocaleString()} REVIEWS`;
    heroSquare.style.backgroundColor = colorScale(avg);
}

// --- 7. CONTROL CHART RENDERER ---
function updateTrendChart(data, globalMean) {
    const container = document.getElementById("trend-container");
    if(!container) return;

    d3.select("#trend-container").selectAll("*").remove();

    if(!data || data.length === 0) return;

    const clean = data.filter(d => d.year != null && !isNaN(d.year));
    if(clean.length === 0) return;

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

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#00E676"); 
    gradient.append("stop").attr("offset", "50%").attr("stop-color", "#FF9F00"); 
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#FF2A2A"); 

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

    const area = d3.area()
        .curve(d3.curveMonotoneX)
        .x(d => x(d.year))
        .y0(d => y(Math.max(0.5, d.avg - d.std))) 
        .y1(d => y(Math.min(5.0, d.avg + d.std))); 

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
        .attr("fill", d => selectedYears.has(d.year) ? "#fff" : "#0a0a0a") 
        .attr("stroke", d => colorScale(d.avg)) 
        .attr("stroke-width", 2.5)
        .style("cursor", "pointer")
        .on("click", (e, d) => {
            if(selectedYears.has(d.year)) selectedYears.delete(d.year); 
            else selectedYears.add(d.year);
            applyCrossFilters();
        });
}

// --- 8. CROSS FILTERING ---
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

    if (isFiltered) {
        document.getElementById('ui-title').innerText = "Visual Filter Active";
        document.getElementById('ui-tags').innerText = "DYNAMIC TIME SELECTION";
        document.getElementById('ui-desc').innerText = `Filtering dataset to specific years selected on the timeline.`;
        document.getElementById('ui-director').innerText = "-";
        document.getElementById('ui-studio').innerText = "-";
        document.getElementById('ui-cast').innerText = "-";
    } else {
        refreshFilters();
    }
}

initializeDashboard();
