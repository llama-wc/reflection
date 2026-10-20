// Dendrogram: the tree of life as dendrites along deep time.
// The data (data/tree.json) is built by the data pipeline, which isn't in this repo. World coordinates:
// x is time, y a 0-1 layout position; the zoom (d3.zoom) only ever moves y, since the time
// axis always shows all of it. Drawn on four stacked canvases (see the layers in index.html):
// ground, bleed and ink are redrawn when the view changes, the top one on every hover.
(function () {
    'use strict';

    const TAU = 30;              // Ma: below this the deep-time axis is near linear, above it log
    const COLLAPSE_PX = 11;      // a group shorter than this on screen is drawn as one line
    const LABEL_PX = 10;         // ...and is named at the present once it's this tall
    const SPACE_EXP = 0.6;       // a group's height grows as (families)^this among its sisters
    const CLADE_LABEL_PX = 90;   // an open group is named at its branch point once it's this tall
    const MAX_LEAF_PX = 26;      // deepest zoom: one loaded species this tall...
    const MAX_ZOOM = 1e9;        // past this the screen can't place lines apart anyway
    const MAX_FAMILY_PX = 96;    // ...and the thinnest families tall enough to open (EXPAND_PX)
    const HUE_DRIFT = 6;         // degrees of hue a group's ink drifts across its subgroups (one ink, unevenly laid)
    const TIME_LEAD = 1.45;      // the time axis reaches back this far before the view's ancestor
    const SETTLE_MS = 160;       // the ink filters come back this long after the view stops
    const MAX_COMPARE = 12;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Lineage colours: a lineage takes its group's colour once all of it lies in one group;
    // the shared stems before that stay neutral. Order = the order they stack on screen.
    const GROUPS = {
        bacteria: { label: 'Bacteria', clade: 'Bacteria', hand: 'bacteria', pigment: 'Nocturnal Expedition: the blue-green of phycocyanin, as in cyanobacteria' },
        archaea: { label: 'Archaea', clade: 'Archaea', hand: 'archaea', pigment: 'Ruthless Empress: the purple membrane of salt-loving archaea' },
        protists: { label: 'Other eukaryotes', clade: 'Eukaryota', hand: 'other eukaryotes', pigment: 'Fallen Canopy: the gold-brown fucoxanthin of diatoms' },
        plants: { label: 'Green plants and algae', clade: 'Chloroplastida', hand: 'green plants & algae', pigment: 'Cucumber Queen: chlorophyll' },
        fungi: { label: 'Fungi', clade: 'Fungi', hand: 'fungi', pigment: 'Chocolate Explosion: a mushroom brown' },
        animals: { label: 'Animals', clade: 'Metazoa', hand: 'animals', pigment: 'Cherry Bomb: haemoglobin red' },
        other: { label: 'Shared ancestry', clade: null, pigment: 'blue-black: the trunk that groups share' },
    };
    // Line weight: described living species, on a log scale. (Counts of living individuals and
    // biomass are published for only a few dozen groups, so they're on those groups' cards, not drawn)
    const METRICS = {
        spp: { key: 'sppLog', label: 'Described living species', lo: 0, hi: 6.4, legend: [1, 3, 5] },
    };
    // Everyday words for the groups that hold them (the tree stops at families)
    const ALIASES = {
        human: 'Hominidae', humans: 'Hominidae', chimpanzee: 'Hominidae', gorilla: 'Hominidae', orangutan: 'Hominidae',
        dog: 'Canidae', puppy: 'Canidae', 'house cat': 'Felidae', kitten: 'Felidae', 'fruit fly': 'Drosophilidae', wolf: 'Canidae', fox: 'Canidae', cat: 'Felidae', lion: 'Felidae', tiger: 'Felidae',
        mouse: 'Muridae', rat: 'Muridae', horse: 'Equidae', cow: 'Bovidae', cattle: 'Bovidae', sheep: 'Bovidae',
        goat: 'Bovidae', pig: 'Suidae', whale: 'Balaenopteridae', dolphin: 'Delphinidae', bat: 'Chiroptera',
        elephant: 'Elephantidae', kangaroo: 'Macropodidae', platypus: 'Ornithorhynchidae', chicken: 'Phasianidae',
        eagle: 'Accipitridae', owl: 'Strigidae', penguin: 'Spheniscidae', crocodile: 'Crocodylidae', snake: 'Serpentes',
        turtle: 'Testudines', frog: 'Anura', salamander: 'Caudata', shark: 'Selachii', salmon: 'Salmonidae',
        goldfish: 'Cyprinidae', octopus: 'Octopodidae', squid: 'Loliginidae', snail: 'Gastropoda', ant: 'Formicidae',
        bee: 'Apidae', honeybee: 'Apidae', butterfly: 'Papilionidae', beetle: 'Coleoptera', fly: 'Diptera',
        mosquito: 'Culicidae', spider: 'Araneae', scorpion: 'Scorpiones', crab: 'Brachyura', lobster: 'Nephropidae',
        krill: 'Euphausiidae', jellyfish: 'Scyphozoa', coral: 'Anthozoa', sponge: 'Porifera', starfish: 'Asteroidea',
        'sea urchin': 'Echinoidea', earthworm: 'Lumbricidae', roundworm: 'Nematoda', tardigrade: 'Tardigrada',
        mushroom: 'Agaricaceae', yeast: 'Saccharomycetaceae', oak: 'Fagaceae', rose: 'Rosaceae', grass: 'Poaceae',
        pine: 'Pinaceae', moss: 'Bryophyta', fern: 'Polypodiopsida', 'e. coli': 'Enterobacteriaceae', coelacanth: 'Latimeria',
    };
    // Everyday words that mean one species, though NCBI gives them to a genus (whose branch
    // in the tree may not be clean): cattle are Bos taurus, not Bos
    const PREFER = { cattle: 'Bos taurus', cow: 'Bos taurus', 'fruit fly': 'Drosophila melanogaster', chimp: 'Pan troglodytes', wolf: 'Canis lupus', yeast: 'Saccharomyces cerevisiae',
        zebra: 'Equus quagga burchellii', 'plains zebra': 'Equus quagga burchellii', 'common zebra': 'Equus quagga burchellii',
        dove: 'Columba livia', pigeon: 'Columba livia', goose: 'Anser anser', raven: 'Corvus corax', crow: 'Corvus brachyrhynchos',
        alligator: 'Alligator mississippiensis', crocodile: 'Crocodylus niloticus', salmon: 'Salmo salar', trout: 'Oncorhynchus mykiss',
        dolphin: 'Tursiops truncatus', 'bottlenose dolphin': 'Tursiops truncatus', bear: 'Ursus arctos', frog: 'Rana temporaria',
        snake: 'Python bivittatus', owl: 'Strix aluco', eagle: 'Aquila chrysaetos', shark: 'Carcharodon carcharias', whale: 'Balaenoptera musculus',
        octopus: 'Octopus vulgaris', spider: 'Araneus diadematus', ant: 'Formica rufa', bee: 'Apis mellifera', butterfly: 'Danaus plexippus',
        mosquito: 'Aedes aegypti', mushroom: 'Agaricus bisporus', oak: 'Quercus robur', rose: 'Rosa canina', tulip: 'Tulipa gesneriana', cockroach: 'Periplaneta americana', 'house cat': 'Felis catus',
        lettuce: 'Lactuca sativa' };
    // Old names for groups that aren't natural ones, said instead of a near miss (Protista isn't Proutista)
    const OLD_NAMES = {
        protista: 'Protista is an old name, not a natural group: it lumped together every eukaryote that isn’t an animal, plant or fungus, and they sit all over the tree. Try a group within it, like Alveolata or Amoebozoa.',
        protists: 'Protists aren’t a natural group: the name covers every eukaryote that isn’t an animal, plant or fungus, and they sit all over the tree. Try a group within it, like Alveolata or Amoebozoa.',
        monera: 'Monera is an old name, not a natural group: it put bacteria and archaea together, but they are two separate domains. Try Bacteria or Archaea.',
        prokaryota: 'Prokaryotes aren’t a natural group: bacteria and archaea are two separate domains, and archaea are closer to us. Try Bacteria or Archaea.',
        prokaryotes: 'Prokaryotes aren’t a natural group: bacteria and archaea are two separate domains, and archaea are closer to us. Try Bacteria or Archaea.' };
    // Everyday words for big groups the names data has none for, for the written answer
    const PLAIN = { Opisthokonta: 'animals and fungi', Holozoa: 'animals and their closest single-celled relatives', Amorphea: 'animals, fungi and amoebas',
        Bilateria: 'bilateral animals', Boreoeutheria: 'placental mammals other than elephants, sloths and their kin',
        Euarchontoglires: 'primates, rodents and rabbits', Laurasiatheria: 'hoofed mammals, carnivores, bats and their kin', Whippomorpha: 'whales and hippos',
        Coelurosauria: 'birds and their closest dinosaur kin', Archosauria: 'birds, crocodiles and their kin', Amniota: 'reptiles, birds and mammals',
        Tetrapoda: 'four-limbed animals', Gnathostomata: 'jawed vertebrates', Embryophyta: 'land plants', Magnoliopsida: 'flowering plants', Diaphoretickes: 'plants, algae and their kin' };
    // Plurals that don't just add an s
    const IRREGULAR = { geese: 'goose', mice: 'mouse', lice: 'louse', oxen: 'ox', teeth: 'tooth', feet: 'foot', octopi: 'octopus',
        cacti: 'cactus', fungi: 'fungus', algae: 'alga', larvae: 'larva', wolves: 'wolf', leaves: 'leaf', calves: 'calf', fish: 'fish' };
    // Everyday names for fossils, to look up by their scientific names
    const FOSSIL_WORDS = {
        't. rex': 'Tyrannosaurus rex', 't rex': 'Tyrannosaurus rex', 'trex': 'Tyrannosaurus rex', 'tyrannosaurus': 'Tyrannosaurus rex',
        'woolly mammoth': 'Mammuthus primigenius', 'mammoth': 'Mammuthus', 'mastodon': 'Mammut', 'megalodon': 'Otodus megalodon',
        'neanderthal': 'Homo neanderthalensis', 'sabre-toothed cat': 'Smilodon', 'saber-toothed cat': 'Smilodon', 'sabre-tooth': 'Smilodon',
        'velociraptor': 'Velociraptor', 'triceratops': 'Triceratops', 'stegosaurus': 'Stegosaurus', 'brontosaurus': 'Brontosaurus',
        'diplodocus': 'Diplodocus', 'archaeopteryx': 'Archaeopteryx', 'pterodactyl': 'Pterodactylus', 'dimetrodon': 'Dimetrodon',
        'thylacine': 'Thylacinus cynocephalus', 'tasmanian tiger': 'Thylacinus cynocephalus', 'passenger pigeon': 'Ectopistes migratorius',
        'great auk': 'Pinguinus impennis', 'moa': 'Dinornis', 'ammonite': 'Ammonoidea', 'trilobite': 'Trilobita', 'dinosaur': 'Dinosauria',
        'dinosaurs': 'Dinosauria', 'spinosaurus': 'Spinosaurus', 'tiktaalik': 'Tiktaalik', 'australopithecus': 'Australopithecus',
        'lucy': 'Australopithecus afarensis', 'dodo': 'Raphus cucullatus', 'smilodon': 'Smilodon', 'dunkleosteus': 'Dunkleosteus',
    };
    // An everyday fossil word, forgiving a hyphen or a slip of the keyboard (t-rex, megladon)
    function fossilWord(q) {
        const k = q.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
        if (FOSSIL_WORDS[k]) return FOSSIL_WORDS[k];
        if (k.length < 5) return null;
        for (const [w, n] of Object.entries(FOSSIL_WORDS)) if (Math.abs(w.length - k.length) <= 2 && editDistance(k, w, 2) <= 2) return n;
        return null;
    }
    // Not cellular life, so not in the tree
    const VIRUS = /^(virus|viruses|viral|covid|sars|hiv|influenza|flu|ebola|rabies|measles|phage|bacteriophage|coronavirus)\b/i;
    // Geological eras (Ma) and moments worth a line
    const ERAS = [['Hadean', 4567, 4031], ['Archean', 4031, 2500], ['Proterozoic', 2500, 538.8],
                  ['Paleozoic', 538.8, 251.9], ['Mesozoic', 251.9, 66], ['Cenozoic', 66, 0]];
    const PERIODS = [['Cambrian', 538.8, 485.4], ['Ordovician', 485.4, 443.8], ['Silurian', 443.8, 419.2],
                     ['Devonian', 419.2, 358.9], ['Carboniferous', 358.9, 298.9], ['Permian', 298.9, 251.9],
                     ['Triassic', 251.9, 201.4], ['Jurassic', 201.4, 145], ['Cretaceous', 145, 66],
                     ['Paleogene', 66, 23.03], ['Neogene', 23.03, 2.58], ['Quaternary', 2.58, 0]];
    // (with all five of the great mass extinctions)
    const EVENTS = [[2400, 'Great Oxidation'], [538.8, 'Cambrian explosion'], [445, 'End-Ordovician extinction'], [372, 'Late Devonian extinction'],
        [251.9, 'End-Permian extinction'], [201.4, 'End-Triassic extinction'], [66, 'End-Cretaceous extinction']];

    const $ = sel => document.querySelector(sel);
    const stage = $('#stage'), canvas = $('#chart');
    const layers = ['ground', 'deep', 'ink', 'chart'].map(id => $('#' + id));
    const [gctx, dctx, ictx, octx] = layers.map(c => c.getContext('2d'));
    const tipEl = $('#tip'), trailEl = $('#trail'), hintEl = $('#hint');

    const state = { metric: 'spp', dark: 'lo', time: 'log', life: 'all', hover: -1, flash: -1, compare: [] };
    let T = d3.zoomIdentity;
    let W = 0, H = 0, dpr = 1, X0 = 0, X1 = 0, PT = 30, PB = 46, plotH = 0, base = 1, kMax = 1;
    let colors = {}, theme = 'dark', nodeColor = [], nodeRgb = [];
    let segs = [], terms = [], segOf = new Map();
    let ties = { path: new Set(), joins: [], mrca: -1, edges: [], y: new Map(), points: [], labelYs: [], marks: [], boxes: [] };
    let D, N, ROOT_AGE, kids, leaves, y0, y1, ymid, group, display, repName, anchorsBy, searchIndex, thinLeaf, baseLeaf;
    let groupNodes = new Map();   // the node where each group begins -> its name, as written on the chart
    let nodeId, deepAnchors;   // each node's id in Open Tree's tree (for loading what's inside it)
    let N0 = 0, SHARDS = 64, EXTINCT_NAMES = [], META = {};   // nodes in the built data; files its inner dates are split into
    let FORMS = new Map();   // species -> the extinct forms below it the build dates (the Neanderthal), each drawn as a tip of its own
    let PARATAXA = new Set();   // trace-fossil and egg families: named for what was found, not lineages, so never drawn

    // ---------- data ----------

    // The data files carry a version, so a browser never mixes this script with data cached
    // from an earlier build: tree.json this script's own (app.js?v=…), the rest the build date
    const RELEASE = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || '';
    const fresh = path => `${path}?v=${encodeURIComponent(META.built || RELEASE)}`;
    fetch(`data/tree.json?v=${RELEASE}`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(start)
        .catch(err => { $('#loading').textContent = 'Couldn’t load the tree data.'; console.error(err); });

    function start(data) {
        D = data.nodes;
        N = D.name.length;
        // Open Tree's placeholder names for unnamed clades (h2007-2...) read as noise
        D.name = D.name.map(n => /^[a-z]\d{4}-\d+$/i.test(n) ? '' : n);
        // Deeper tiers add nodes after load, so every column must be able to grow
        for (const k of ['sppEst', 'other', 'placed']) D[k] = (D[k] || '').split('');
        D.first = D.first || new Array(N).fill(null); D.last = D.last || new Array(N).fill(null);
        D.sppLog = D.spp.map((n, i) => n > 0 && D.last[i] == null ? Math.log10(n) : null);
        D.fossilFrom = D.fossilFrom || new Array(N).fill(null);
        D.crown = D.crown || new Array(N).fill(0);
        // TimeTree's interval for a date [low, high] (Ma), for a branch point and a family's crown;
        // a first appearance the build set aside as misfiled [the database's, genus, rule]
        for (const k of ['ci', 'crownCi', 'firstAside']) D[k] = D[k] || new Array(N).fill(null);
        nodeId = D.ott.map(o => o ? `ott${o}` : '');
        deepAnchors = data.deep || [];
        N0 = N; SHARDS = data.meta.dateShards || 64; META = data.meta;
        EXTINCT_NAMES = data.meta.extinct || [];
        for (const f of data.forms || []) FORMS.set(f.species, [...(FORMS.get(f.species) || []), f]);
        PARATAXA = new Set(data.meta.parataxa || []);
        D.crownBy = D.crownBy || '';
        ROOT_AGE = data.meta.rootAge;
        tMax = ROOT_AGE;
        kids = Array.from({ length: N }, () => []);
        for (let i = 1; i < N; i++) kids[D.parent[i]].push(i);

        // Families under each node (nodes come parents-first, so a reverse pass is bottom-up)
        leaves = new Array(N).fill(0);
        for (let i = N - 1; i >= 0; i--) {
            if (!kids[i].length) leaves[i] = 1;
            if (i > 0) leaves[D.parent[i]] += leaves[i];
        }
        // Sister groups: the largest in the middle, smaller ones alternating above and below.
        // (Strict ladderizing, smallest always on top, sorts the whole tree into a staircase
        // that reads like a bar chart; the order of sisters means nothing biologically.)
        for (let v = 0; v < N; v++) kids[v] = middleOut(kids[v], c => leaves[c]);

        // Groups: from the named clades down, then shared stems back to neutral
        const byName = new Map();
        for (let i = 0; i < N; i++) if (D.name[i] && !byName.has(D.name[i])) byName.set(D.name[i], i);
        const clade = new Map();
        for (const [g, def] of Object.entries(GROUPS)) if (def.clade && byName.has(def.clade)) clade.set(byName.get(def.clade), g);
        groupNodes = new Map([...clade].map(([i, g]) => [i, g === 'protists' ? 'eukaryotes' : GROUPS[g].hand]));
        group = new Array(N);
        for (let i = 0; i < N; i++) group[i] = clade.get(i) || (i ? group[D.parent[i]] : 'other');
        for (let i = N - 1; i >= 0; i--) {
            if (!kids[i].length) continue;
            const g = group[kids[i][0]];
            group[i] = kids[i].every(c => group[c] === g) ? g : 'other';
        }

        // Unnamed branch points are known by their largest named member
        repName = new Array(N);
        for (let i = N - 1; i >= 0; i--) {
            if (D.name[i]) { repName[i] = D.name[i]; continue; }
            const big = kids[i].reduce((a, c) => (a < 0 || leaves[c] > leaves[a]) ? c : a, -1);
            repName[i] = big >= 0 ? repName[big] : '';
        }
        display = i => D.name[i] || (repName[i] ? `${repName[i]} and relatives` : 'Unnamed lineage');

        // Families under each node in the built data, for sharing out the height (an extinct
        // family counts half: the living tree stays readable with the fossils beside it)
        baseLeaf = new Array(N).fill(false);
        for (let i = 0; i < N; i++) baseLeaf[i] = !kids[i].length;
        layout();
        anchorsBy = new Map();
        for (const a of data.anchors) {
            const key = `${a.node}:${a.metric}`;
            if (!anchorsBy.has(key)) anchorsBy.set(key, a);
        }
        searchIndex = [];
        for (let i = 0; i < N; i++) {
            if (!D.name[i] || D.other[i] === '1') continue;
            addEntry(i, D.name[i], 'latin');
            if (D.common[i]) addEntry(i, D.common[i], 'common');
        }
        for (const [word, name] of Object.entries(ALIASES)) if (byName.has(name)) addEntry(byName.get(name), word, 'alias');

        ranks = data.meta.ranks;
        readColors();
        buildLegend();
        buildTable(data);
        buildSources(data);
        setupZoom();
        setupControls();
        resize();
        new ResizeObserver(resize).observe(stage);
        new MutationObserver(() => { readColors(); buildLegend(); draw(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        if (/^#compare=/.test(location.hash)) readHash();
        else compareChanged();
        setTimeout(loadNames, 1500);
        if (document.fonts) document.fonts.load('700 18px Caveat').then(() => schedule(), () => {});   // the handwriting   // the search's everyday names, and the species' labels
        $('#loading').hidden = true;
    }

    // Layout, on a 0-1 scale: each group's height is shared among its sisters by (families)^
    // SPACE_EXP, so the insects' thousands of families don't crowd out the bacteria; a group
    // loaded below a family shares its parent's height by species. Extinct lineages count
    // half, or nothing when only the living are shown. A branch point sits midway between its
    // outermost children. Run again when extinct lineages are shown or hidden, and after a load.
    const extinct = i => D.last[i] != null;
    function layout() {
        const showFossils = state.life === 'all';
        const mass = new Float64Array(N);
        for (let i = N0 - 1; i >= 0; i--) {
            if (baseLeaf[i]) mass[i] = extinct(i) ? (showFossils ? 0.5 : 0) : 1;
            if (i > 0) mass[D.parent[i]] += mass[i];
        }
        const weight = c => c < N0 ? Math.pow(mass[c], SPACE_EXP)
            : Math.pow(Math.max(1, D.tips[c] || 1), SPACE_EXP) * (extinct(c) ? (showFossils ? 0.5 : 0) : 1);
        if (!y0) { y0 = []; y1 = []; ymid = []; }
        y0.length = y1.length = ymid.length = N;
        y0[0] = 0; y1[0] = 1;
        for (let v = 0; v < N; v++) {   // parents come first
            const k = kids[v];
            if (!k.length) continue;
            const total = k.reduce((s, c) => s + weight(c), 0);
            let y = y0[v];
            for (const c of k) {
                y0[c] = y;
                y += total ? (y1[v] - y0[v]) * weight(c) / total : 0;
                y1[c] = y;
            }
        }
        for (let i = N - 1; i >= 0; i--) {
            const k = kids[i].filter(c => y1[c] > y0[c]);
            ymid[i] = k.length ? (ymid[k[0]] + ymid[k[k.length - 1]]) / 2 : (y0[i] + y1[i]) / 2;
        }
        // The deepest zoom opens all but the very thinnest families to MAX_FAMILY_PX
        const spans = [];
        for (let i = 0; i < N0; i++) if (baseLeaf[i] && y1[i] > y0[i]) spans.push(y1[i] - y0[i]);
        spans.sort((a, b) => a - b);
        thinLeaf = spans[Math.floor(spans.length * 0.02)];
    }

    // Largest first in the middle, then alternately above and below it
    function middleOut(list, size) {
        const out = [];
        [...list].sort((a, b) => size(b) - size(a)).forEach((x, k) => { if (k % 2) out.unshift(x); else out.push(x); });
        return out;
    }

    // ---------- scales ----------

    // The time axis runs from tMax (Ma) to today. tMax follows the view: back to a little
    // before the ancestor of what's on screen, so a recent story fills the width.
    let tMax = 0;
    function xOf(age) {
        const tau = Math.min(TAU, tMax / 6);
        const u = state.time === 'log' ? Math.log1p(age / tau) / Math.log1p(tMax / tau) : age / tMax;
        return X1 - u * (X1 - X0);
    }
    function timeGoal() {
        // The deepest group holding everything in view...
        const u0 = (T.invertY(PT) - PT) / base, u1 = (T.invertY(PT + plotH) - PT) / base;
        let v = 0;
        for (;;) {
            const c = kids[v].find(c => y0[c] <= u0 + 1e-9 && y1[c] >= u1 - 1e-9);
            if (c == null) break;
            v = c;
        }
        if (!kids[v].length) v = D.parent[v];
        const reach = a => Math.min(ROOT_AGE, Math.max(8, a * TIME_LEAD + 2));
        let goal = v <= 0 ? ROOT_AGE : reach(D.age[v]);
        // ...but while the view is on the comparison, its own depth: no deeper, no shallower.
        // (Zoomed far out, Reset say, the time axis follows the view again.)
        if (ties.mrca >= 0) {
            const span = y1[ties.mrca] - y0[ties.mrca];
            goal = u1 - u0 < span * 20 ? reach(D.age[ties.mrca]) : Math.max(goal, reach(D.age[ties.mrca]));
        }
        return goal;
    }
    const worldY = u => PT + u * base;                    // world y of a 0-1 layout position
    const yS = u => T.applyY(worldY(u));                  // ...on screen

    function metricLog(i, m = state.metric) {
        const v = D[METRICS[m].key][i];
        return v == null ? METRICS[m].lo : v;
    }
    function widthForLog(v) {
        const m = METRICS[state.metric];
        const t = Math.max(0, Math.min(1, (v - m.lo) / (m.hi - m.lo)));
        return 0.4 + 6.4 * Math.pow(t, 2.2);   // (a broad nib at most)
    }
    const widthOf = i => widthForLog(metricLog(i));
    const darkLog = i => D[state.dark === 'lo' ? 'darkLo' : 'darkHi'][i] || 0;

    // ---------- colour ----------

    // sRGB hex <-> OKLCH, to drift a group's hue without changing how light it reads
    function hexToOklch(hex) {
        const n = parseInt(hex.slice(1), 16);
        const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const r = lin(n >> 16 & 255), g = lin(n >> 8 & 255), b = lin(n & 255);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        return [L, Math.hypot(A, B), Math.atan2(B, A) * 180 / Math.PI];
    }
    function oklchToRgb(L, C, h) {
        const A = C * Math.cos(h * Math.PI / 180), B = C * Math.sin(h * Math.PI / 180);
        const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
        const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
        const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
        const out = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                     -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                     -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
        return out.map(c => {
            c = Math.max(0, Math.min(1, c));
            return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
        });
    }

    function hexRgb(hex) {
        const h = hex.replace('#', '');
        return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16));
    }

    function readColors() {
        const css = getComputedStyle(document.documentElement);
        theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        colors = {};
        for (const g of Object.keys(GROUPS)) colors[g] = css.getPropertyValue(`--g-${g}`).trim();
        for (const k of ['bg', 'stage', 'text', 'text-2', 'muted', 'grid', 'era', 'halo', 'accent', 'ink']) colors[k] = css.getPropertyValue(`--${k}`).trim();
        for (const k of ['haze', 'speck', 'ghost']) colors[k] = css.getPropertyValue(`--${k}`).trim().split(/\s*,\s*/).map(Number);
        colorNodes();
    }

    // Each lineage's colour: its group's, drifting in hue (and a touch in lightness) across
    // the group's subgroups, so neighbouring lineages are kin but not identical
    // (and the same as rgb numbers, to tint the missing links around it)
    function colorNodes() {
        if (!D) return;
        const lch = {};
        for (const g of Object.keys(GROUPS)) lch[g] = hexToOklch(colors[g]);
        const root = new Int32Array(N);   // the top of each node's run of one group
        nodeColor = new Array(N); nodeRgb = new Array(N);
        for (let i = 0; i < N; i++) {
            const p = i ? D.parent[i] : -1;
            root[i] = p >= 0 && group[p] === group[i] ? root[p] : i;
            const g = group[i], r = root[i];
            const t = g === 'other' ? 0 : (ymid[i] - y0[r]) / Math.max(1e-12, y1[r] - y0[r]) - 0.5;
            const [L, C, h] = lch[g];
            const rgb = oklchToRgb(L + t * 0.03, C * (1 - Math.abs(t) * 0.12), h + t * HUE_DRIFT);
            nodeRgb[i] = rgb;
            nodeColor[i] = `rgb(${rgb})`;
        }
    }
    // A colour for the missing links around a lineage: grey, leaning toward the lineage's own
    const tint = (base, i, t) => base.map((v, k) => Math.round(v + (nodeRgb[i][k] - v) * t)).join(',');
    // A group's colour range, for the legend
    // A group's ink, for the legend
    const groupSwatch = g => g === 'other' ? colors.ink : colors[g];

    // ---------- size and zoom ----------

    function resize() {
        const r = stage.getBoundingClientRect();
        if (r.width === W && r.height === H) return;   // (re-applying the zoom would stop a zoom in flight)
        const narrow = r.width < 700;
        // The layout position at the middle of the view, to keep there at the new size
        const mid = base > 1 && plotH > 0 ? (T.invertY(PT + plotH / 2) - PT) / base : null;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = r.width; H = r.height;
        for (const c of layers) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        X0 = narrow ? 16 : 40;
        X1 = W - (narrow ? 118 : 230);
        PT = 34; PB = 46;
        plotH = H - PT - PB;
        base = plotH;
        kMax = Math.min(MAX_ZOOM, Math.max(1, MAX_FAMILY_PX / (base * thinLeaf), thinLoaded ? MAX_LEAF_PX / (base * thinLoaded) : 1));
        zoom.scaleExtent([1, kMax]).extent([[0, 0], [W, H]]);
        const resume = fitting;
        if (mid != null) T = d3.zoomIdentity.translate(0, PT + plotH / 2 - T.k * (PT + mid * base)).scale(T.k);
        d3.select(canvas).call(zoom.transform, T);   // re-clamp (this stops a zoom in flight...)
        draw();
        if (resume) zoomToRange(resume[0], resume[1], resume[2]);   // (...so pick it up again)
    }

    let zoom, settle, moving = false;
    // While the view moves (a zoom, or the time axis easing), the filtered layers are hidden;
    // once it has been still for SETTLE_MS they're painted again and fade in
    function markMoving() {
        moving = true;
        stage.classList.add('moving');
        clearTimeout(settle);
        settle = setTimeout(() => { moving = false; drawDeep(); loadWanted(); stage.classList.remove('moving'); }, SETTLE_MS);
    }
    let fitting = null;   // the layout range a zoom is heading for, so a resize can resume it
    function setupZoom() {
        zoom = d3.zoom()
            // Flying between views: scale changes geometrically, the centre moves straight. (D3's
            // default fly-over path overflows when the zoom changes a billionfold, deep in a tier.)
            .interpolate((a, b) => t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] * Math.pow(b[2] / a[2], t)])
            .constrain(t => {
                // Keep the tree filling the plot: x never moves, y stays within the content
                const lo = PT + plotH - t.k * (PT + plotH), hi = PT - t.k * PT;
                return d3.zoomIdentity.translate(0, Math.max(lo, Math.min(hi, t.y))).scale(t.k);
            })
            // Map-style: a plain wheel scrolls the page; ctrl/cmd + wheel (and a trackpad pinch,
            // which arrives as ctrl + wheel) zooms. Touch pinch and drag are untouched.
            .filter(e => e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.button)
            .on('start', () => hintEl.classList.add('gone'))
            .on('zoom', e => {
                T = e.transform;
                hideTip();
                markMoving();
                schedule();
            })
            .on('end.fit', () => { fitting = null; });
        d3.select(canvas).on('wheel.fit mousedown.fit touchstart.fit', () => { fitting = null; }, { passive: true });
        d3.select(canvas).call(zoom).on('dblclick.zoom', null);
        // A plain wheel over the chart says how to zoom, briefly
        const wheelHint = $('#wheel-hint');
        let wheelHintTimer = 0;
        wheelHint.textContent = `${/Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl'} + scroll to zoom`;
        canvas.addEventListener('wheel', e => {
            if (e.ctrlKey || e.metaKey) { wheelHint.classList.add('gone'); return; }
            wheelHint.classList.remove('gone');
            clearTimeout(wheelHintTimer);
            wheelHintTimer = setTimeout(() => wheelHint.classList.add('gone'), 1400);
        }, { passive: true });
    }

    function zoomTo(i, after) { zoomToRange(y0[i], y1[i], after); }

    // Fit a stretch of the 0-1 layout to the plot
    function zoomToRange(u0, u1, after) {
        const a = worldY(u0), b = worldY(u1);
        const k = Math.max(1, Math.min(kMax, (plotH * 0.86) / Math.max(1e-9, b - a)));
        const ty = PT + plotH / 2 - k * (a + b) / 2;
        if (!Number.isFinite(k) || !Number.isFinite(ty)) return;   // (never leave the view unusable)
        const t = d3.zoomIdentity.translate(0, ty).scale(k);
        const sel = d3.select(canvas);
        fitting = reduceMotion ? null : [u0, u1, after];
        (reduceMotion ? sel : sel.transition().duration(850).ease(d3.easeCubicInOut))
            .call(zoom.transform, t)
            .on('end', () => { fitting = null; if (after) after(); });
        if (reduceMotion && after) after();
    }

    // ---------- drawing ----------

    let queued = null;
    function schedule(what = 'all') {
        if (queued === 'all') return;
        const first = !queued;
        queued = what;
        if (first) requestAnimationFrame(() => { const q = queued; queued = null; q === 'all' ? draw() : drawTop(); });
    }

    function rng(seed) {   // mulberry32: the same haze for the same group every frame
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // What's on screen: each drawn branch (from its parent's branch point) and each
    // terminal line (a family, or a group too small on screen to open)
    function collect() {
        segs = []; terms = []; segOf = new Map(); wanted.clear();
        const top = PT - 30, bottom = PT + plotH + 30;
        const stack = [[0, widthOf(0)]];
        while (stack.length) {
            const [v, wv] = stack.pop();
            const xp = xOf(D.age[v]), yp = yS(ymid[v]);
            for (const c of kids[v]) {
                if (y1[c] <= y0[c]) continue;   // hidden (extinct, with only the living shown)
                const ya = yS(y0[c]), yb = yS(y1[c]), yc = yS(ymid[c]);
                const inView = yb >= top && ya <= bottom;
                if (!inView && (Math.max(yp, yc) < top || Math.min(yp, yc) > bottom)) continue;
                const open = kids[c].length > 0 && inView && yb - ya >= COLLAPSE_PX;
                const xs = xOf(D.age[c]);
                const fossil = !open && extinct(c);   // ends at its last fossil, not today
                const xe = open ? xs : fossil ? Math.max(xp + 2, xOf(D.last[c])) : X1;
                const L = Math.max(0.01, Math.min(xs - xp, Math.max(10, Math.abs(yc - yp) * 0.9 + 6)));
                const w = Math.min(widthOf(c), Math.max(0.5, (yb - ya) * 0.45));
                const seg = { i: c, p: v, xp, yp, yc, xe, L, w, wp: wv, ya, yb, open, fossil };
                segs.push(seg);
                segOf.set(c, seg);
                if (open) stack.push([c, w]);
                else if (inView) {
                    terms.push(seg);
                    if (yb - ya >= EXPAND_PX && canExpand(c)) wanted.add(c);
                }
            }
        }
        terms.sort((a, b) => a.yc - b.yc);
    }

    // A branch as the canvas path the hover and highlights use: an S-curve away from its
    // parent's branch point, then level to its own (or to the present)
    function path(c, s) {
        c.moveTo(s.xp, s.yp);
        c.bezierCurveTo(s.xp + s.L * 0.5, s.yp, s.xp + s.L * 0.5, s.yc, s.xp + s.L, s.yc);
        if (s.xe > s.xp + s.L) c.lineTo(s.xe, s.yc);
    }

    // ...and as a tapered ribbon, for the ink: it leaves the trunk wide and settles to its
    // own weight, like a dendrite
    const NIB = Math.PI / 4;   // the pen's slant: strokes across it are full, along it thin
    function ribbon(c, s, grow, nib) {
        const n = 10, L = s.L, x0 = s.xp, ya = s.yp, yb = s.yc;
        const w0 = Math.max(s.w, Math.min(s.wp * 0.85, s.w * 2.2)) + grow, w1 = s.w + grow;
        const left = [], right = [];
        for (let k = 0; k <= n; k++) {
            const t = k / n, mt = 1 - t;
            const x = x0 + L * (1.5 * mt * mt * t + 1.5 * mt * t * t + t * t * t);
            const y = ya + (yb - ya) * (3 * mt * t * t + t * t * t);
            const dx = 1.5 * L * (mt * mt + t * t), dy = 6 * mt * t * (yb - ya);
            const len = Math.hypot(dx, dy) || 1;
            const hw = (w0 + (w1 - w0) * t * t * (3 - 2 * t)) / 2 * (nib ? 0.55 + 0.45 * Math.abs(Math.sin(Math.atan2(dy, dx) - NIB)) : 1);
            left.push([x - dy / len * hw, y + dx / len * hw]);
            right.push([x + dy / len * hw, y - dx / len * hw]);
        }
        if (s.xe > x0 + L) {   // the level run, at the nib's width for a level stroke
            const hw = w1 / 2 * (nib ? 0.55 + 0.45 * Math.abs(Math.sin(NIB)) : 1);
            left.push([s.xe, yb + hw]);
            right.push([s.xe, yb - hw]);
        }
        c.moveTo(left[0][0], left[0][1]);
        for (let k = 1; k < left.length; k++) c.lineTo(left[k][0], left[k][1]);
        for (let k = right.length - 1; k >= 0; k--) c.lineTo(right[k][0], right[k][1]);
        c.closePath();
    }

    function clear(c, fill) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        if (fill) { c.fillStyle = fill; c.fillRect(0, 0, W, H); } else c.clearRect(0, 0, W, H);
    }

    function draw() {
        if (!D || !W) return;
        const goal = timeGoal();
        if (Math.abs(Math.log(tMax / goal)) > 0.003 && !reduceMotion) {
            tMax = Math.exp(Math.log(tMax) + (Math.log(goal) - Math.log(tMax)) * 0.16);
            markMoving();
            schedule();
        } else tMax = goal;
        collect();
        clear(gctx);   // (the page and its grain show through)
        drawTime(gctx);
        drawInk();
        if (!moving) { drawDeep(); loadWanted(); }
        drawTop();
    }

    // The top layer: highlights, the lineages being compared, labels
    function drawTop() {
        if (!D || !W) return;
        clear(octx);
        if (tMax < ROOT_AGE * 0.98) {
            const g = octx.createLinearGradient(0, 0, X0 + 36, 0);
            g.addColorStop(0, colors.stage);
            g.addColorStop(1, colors.stage + '00');
            octx.fillStyle = g;
            octx.fillRect(0, PT - 6, X0 + 36, plotH + 10);
        }
        drawHighlight(octx);
        drawTies(octx);
        drawLabels(octx);
        drawTrail();
    }

    function drawTime(c) {
        const yTop = PT - 6, yBot = PT + plotH + 4;
        // Era bands along the axis, faint alternating columns behind the tree
        c.font = '10px Inter, sans-serif';
        c.textBaseline = 'middle';
        const bands = tMax < 800 ? PERIODS : ERAS;
        bands.forEach(([name, from, to], k) => {
            if (to >= tMax) return;
            const a = Math.max(0, xOf(Math.min(from, tMax))), b = xOf(to);
            if (b - a < 1) return;
            if (k % 2) { c.fillStyle = colors.era; c.fillRect(a, yTop, b - a, yBot - yTop); }
            c.fillStyle = colors.grid;
            c.fillRect(a, yBot + 2, b - a - 1, 12);
            if (b - a > c.measureText(name).width + 8) {
                c.fillStyle = colors.muted; c.textAlign = 'center';
                c.fillText(name, (a + b) / 2, yBot + 8.5);
            }
        });
        // Time ticks
        const ticks = [4000, 3000, 2000, 1500, 1000, 700, 500, 400, 300, 200, 150, 100, 70, 50, 30, 20, 10, 5, 2, 1, 0]
            .filter(a => a <= tMax * 0.97 || a === 0);
        c.textAlign = 'center'; c.fillStyle = colors.muted;
        let last = -1e9;
        const today = xOf(0);
        for (const a of ticks) {
            const x = xOf(a);
            if (a !== 0 && (x - last < 44 || today - x < 40)) continue;
            last = x;
            c.fillStyle = colors.grid;
            c.fillRect(Math.round(x), yTop, 1, yBot - yTop);
            c.fillStyle = a === 0 ? colors['text-2'] : colors.muted;
            c.fillText(a === 0 ? 'Today' : fmtAge(a), x, yBot + 27);
        }
        // Moments
        c.save();
        c.setLineDash([2, 4]);
        c.strokeStyle = colors.muted; c.globalAlpha = 0.45; c.lineWidth = 1;
        c.textAlign = 'left'; c.font = '10.5px Inter, sans-serif';
        // A name that would run into the one before it steps up a line (three at most; past
        // that it's left out, and its line stays)
        const rowRight = [-1e9, -1e9, -1e9];
        for (const [age, name] of EVENTS) {
            if (age > tMax) continue;
            const x = Math.round(xOf(age)) + 0.5;
            c.beginPath(); c.moveTo(x, yTop); c.lineTo(x, yBot); c.stroke();
            const w = c.measureText(name).width, row = rowRight.findIndex(r => x + 4 > r);
            if (row >= 0 && x + 4 + w < X1) {
                c.globalAlpha = 0.9; c.fillStyle = colors.muted;
                c.fillText(name, x + 4, yBot - 8 - row * 13);
                c.globalAlpha = 0.45;
                rowRight[row] = x + 4 + w + 10;
            }
        }
        c.restore();
    }

    // The branches, in fountain-pen ink, one ink per group (see style.css). The nib swells and
    // thins with the stroke's direction; each stroke is a little heavier where the pen set
    // down and lifted. A branch point with a real date (TimeTree, or published dated trees)
    // gets a small pool of ink; one with an estimated date is drawn drier and lighter. A group
    // too small to open here is a wash of diluted ink, from its own first split to today. On
    // the light page the washes multiply, so where they overlap they darken as real ink does.
    const isDated = i => D.dated[i] === 1 || D.dated[i] === 3 || D.dated[i] === 5 || D.dated[i] === 7;   // (7: set by a fossil)
    // Where a closed line stops and fans out: a group's own first split, or, for a family
    // with nothing loaded below it, its dated crown (it keeps branching to today, unseen)
    const crownOf = i => kids[i].length ? D.age[i] : i < N0 && D.crown[i] > 0 ? D.crown[i] : 0;
    // mid: how much ink the middle of the stroke keeps (a long run to today thins out)
    function inkFill(c, rgb, x0, x1, a, mid = 0.75) {
        const g = c.createLinearGradient(x0, 0, Math.max(x0 + 1, x1), 0);
        g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.2, `rgba(${rgb},${a * mid * 0.96})`);
        g.addColorStop(0.8, `rgba(${rgb},${a * mid})`); g.addColorStop(1, `rgba(${rgb},${a * 0.95})`);
        return g;
    }
    function drawInk() {
        const comparing = state.compare.length > 0;
        clear(ictx);
        ictx.save();
        plotClip(ictx);
        ictx.globalCompositeOperation = theme === 'light' ? 'multiply' : 'source-over';
        const otherRgb = hexRgb(colors.other).join(',');
        const rgbOf = (i, quiet) => quiet ? otherRgb : nodeRgb[i].join(',');
        const far = s => s.yp < PT - 60 || s.yp > PT + plotH + 60;
        // Washes: closed groups, from their crown to today, across their share of the height
        for (const s of terms) {
            if (s.fossil || !crownOf(s.i)) continue;
            const xc = Math.min(X1 - 2, xOf(crownOf(s.i))), quiet = comparing && !ties.path.has(s.i);
            const h = Math.max(1, (s.yb - s.ya) / 2 - 0.6);
            ictx.globalAlpha = (quiet ? 0.2 : 1) * (far(s) ? 0.4 : 1);
            ictx.beginPath(); ictx.moveTo(xc, s.yc); ictx.lineTo(X1, s.yc - h); ictx.lineTo(X1, s.yc + h); ictx.closePath();
            ictx.fillStyle = `rgba(${rgbOf(s.i, quiet)},${theme === 'light' ? 0.1 : 0.13})`; ictx.fill();
            ictx.strokeStyle = `rgba(${rgbOf(s.i, quiet)},${theme === 'light' ? 0.24 : 0.28})`; ictx.lineWidth = 0.6; ictx.stroke();
        }
        ictx.globalAlpha = 1;
        // (the strokes paint plainly: multiplied, a dense stack of thin lines would go black)
        ictx.globalCompositeOperation = 'source-over';
        for (const s of segs) {
            const quiet = comparing && !ties.path.has(s.i);   // a neighbour: graphite, behind
            if (s.fossil) { drawFossil(ictx, s, rgbOf(s.i, quiet), (far(s) ? 0.35 : 1) * (quiet ? 0.12 : 1)); continue; }
            const modelled = D.sppEst[s.i] === '1' || D.other[s.i] === '1';   // (a count stood in for, or shared out)
            const dry = (s.open || kids[s.i].length) && !isDated(s.i);
            const grabBag = D.other[s.i] === '1';   // "Other fungi": species in no family, not a lineage
            const a = (grabBag ? 0.3 : modelled ? 0.62 : 0.95) * (far(s) ? 0.35 : 1) * (quiet ? 0.22 : 1) * (dry ? 0.8 : 1);
            // A closed group's own line ends at its crown, where its wash begins
            const t = !s.open && crownOf(s.i) ? { ...s, xe: Math.max(s.xp + s.L, Math.min(X1, xOf(crownOf(s.i)))) } : s;
            const toToday = !s.open && !crownOf(s.i) && t.xe - t.xp > 120;   // an undated family's long run to the present
            ictx.fillStyle = inkFill(ictx, rgbOf(s.i, quiet), t.xp, t.xe, a, toToday ? 0.38 : 0.75);
            const ghost = quiet ? null : ghostOf(s);   // (no ghost lines on neighbours while comparing)
            if (ghost) {   // dotted from where it split to its oldest fossil: fossils should exist there
                ictx.save(); ictx.beginPath(); ictx.rect(0, 0, ghost[0], H); ictx.rect(ghost[1], 0, W, H); ictx.clip();
                ictx.beginPath(); ribbon(ictx, t, 0, true); ictx.fill(); ictx.restore();
                ictx.strokeStyle = `rgba(${rgbOf(s.i, quiet)},${0.7 * a})`; ictx.lineWidth = Math.max(0.8, Math.min(1.6, s.w)); ictx.setLineDash([1.5, 3]);
                ictx.beginPath(); ictx.moveTo(ghost[0], s.yc); ictx.lineTo(ghost[1], s.yc); ictx.stroke(); ictx.setLineDash([]);
            } else {
                ictx.beginPath(); ribbon(ictx, t, 0, true); ictx.fill();
            }
            if (s.open && isDated(s.i) && !quiet) {   // a pool of ink where the date is real
                ictx.fillStyle = `rgba(${rgbOf(s.i)},${0.85 * a})`;
                ictx.beginPath(); ictx.arc(xOf(D.age[s.i]), s.yc, Math.max(1.1, s.w * 0.55 + 0.7), 0, Math.PI * 2); ictx.fill();
            }
        }
        // Tips: the families, at the present
        for (const s of terms) {
            if (s.fossil || kids[s.i].length) continue;
            const quiet = comparing && !ties.path.has(s.i);
            ictx.fillStyle = `rgba(${rgbOf(s.i, quiet)},${quiet ? 0.4 : 1})`;
            ictx.beginPath(); ictx.arc(X1, s.yc, Math.max(1.1, s.w * 0.45 + 0.4), 0, Math.PI * 2); ictx.fill();
        }
        ictx.restore();
    }

    // How much of a living group science has named: its described species over described plus
    // the undescribed estimate (under the Unknown setting). Null where there's no estimate.
    function namedShare(i) {
        if (extinct(i)) return null;
        const named = D.spp[i] || 0, waiting = D[state.dark === 'lo' ? 'darkLo' : 'darkHi'][i];
        if (!named) return null;
        if (waiting == null) return speciesBasis(i) === 'no estimate' ? null : 1;   // (an estimate that leaves none unnamed)
        return named / (named + Math.pow(10, waiting));
    }
    // ...as a row of ten cells, like a table with its gaps left in: filled for the named
    function drawCells(c, i, x, y, color) {
        const share = namedShare(i);
        if (share == null) return;
        const filled = Math.max(1, Math.min(10, Math.round(share * 10)));
        for (let k = 0; k < 10; k++) {
            const cx = x + k * 6.5;
            if (k < filled) { c.fillStyle = color; c.fillRect(cx, y - 2.5, 5, 5); }
            else { c.strokeStyle = color; c.globalAlpha *= 0.6; c.lineWidth = 0.8; c.strokeRect(cx + 0.4, y - 2.1, 4.2, 4.2); c.globalAlpha /= 0.6; }
        }
    }

    // A living family's ghost lineage: from where its line levels off after the split to its
    // oldest fossil, if that's later (null if there's none to show, or it's too small to see)
    function ghostOf(s) {
        const f = D.fossilFrom[s.i];
        if (f == null || s.open || kids[s.i].length && s.i >= N0 || s.yb - s.ya < 4) return null;
        const bend = s.xp + s.L, xf = Math.min(xOf(f), s.xe);
        return xf - bend > 6 ? [bend, xf] : null;
    }

    // An extinct lineage, the way palaeontologists draw one: its stem from the split, then a
    // dotted ghost lineage (it must have existed, but no fossils of that age are known) up to
    // its first fossil, a solid bar across the fossil record, and a dagger where it ends
    function drawFossil(c, s, rgb, fade) {
        const bend = s.xp + s.L, first = D.first[s.i] != null ? xOf(D.first[s.i]) : bend;
        // (a lighter hand than the living: thin, and translucent, so the living tree stays readable)
        const band = s.yb - s.ya, solidFrom = Math.min(s.xe - 1, Math.max(bend, first)), w = Math.max(0.6, Math.min(2.4, band * 0.35));
        fade *= band < 4 ? 0.45 : 0.7;
        c.fillStyle = inkFill(c, rgb, s.xp, bend, 0.75 * fade);
        c.beginPath(); ribbon(c, { ...s, xe: bend, w: Math.min(s.w, w), wp: Math.min(s.wp, w * 1.5) }, 0, true); c.fill();
        if (solidFrom > bend + 2) {   // the ghost lineage
            c.strokeStyle = `rgba(${rgb},${0.55 * fade})`; c.lineWidth = 1; c.setLineDash([1.5, 3]);
            c.beginPath(); c.moveTo(bend, s.yc); c.lineTo(solidFrom, s.yc); c.stroke(); c.setLineDash([]);
        }
        c.strokeStyle = `rgba(${rgb},${0.92 * fade})`; c.lineWidth = w; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(solidFrom, s.yc); c.lineTo(s.xe, s.yc); c.stroke();
        if (band >= 10) {
            c.fillStyle = `rgba(${rgb},${Math.min(1, fade * 1.3)})`; c.font = `600 ${Math.min(13, 8 + band * 0.2)}px Inter, sans-serif`;
            c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('\u2020', s.xe + 2, s.yc + 0.5);
        }
    }

    // ---------- the deep layer: possible species ----------

    // Missing links: faint veins, the lineages we infer but haven't seen. Each sprouts from a
    // lineage somewhere along its life and runs on with time (always rightward), wandering
    // and now and then forking. Some die out on the way: the extinct relatives, more the
    // longer the lineage has lived, since nearly every species that ever lived is gone.
    // The rest reach today: the undescribed species, as many as the estimate of its unnamed
    // share allows. Each is barely there; where there are many, they gather into a root mass
    // pulled toward the present. Where they sit is illustrative; how many is not.
    // Grown once per lineage, in time and in units of its height, so they zoom with it.
    const veinCache = new Map();
    function veinsOf(i) {
        const key = `${i}:${state.dark}`;
        if (veinCache.has(key)) return veinCache.get(key);
        const r = rng(i * 104729 + (state.dark === 'hi' ? 7 : 0));
        const begun = D.age[D.parent[i]], ends = kids[i].length ? D.age[i] : 0;
        const life = Math.max(0, begun - ends);
        const veins = [];
        const grow = (a0, a1, y, spread, depth) => {
            const pts = [[a0, y]], steps = 9;
            let dy = (r() - 0.5) * spread;
            for (let k = 1; k <= steps; k++) {
                const a = a0 + (a1 - a0) * k / steps;
                dy += (r() - 0.5) * spread * 0.35;
                y += dy / steps * 2.2;
                pts.push([a, y]);
                if (depth < 2 && k > 1 && k < steps - 1 && r() < 0.16) grow(a, a1, y, spread * 0.8, depth + 1);
            }
            veins.push(pts);
        };
        // The extinct
        const gone = Math.round(Math.min(14, Math.log2(1 + life / 10) * 2));
        for (let k = 0; k < gone; k++) {
            const a0 = ends + life * (0.05 + 0.9 * r());
            const len = Math.min(a0 - ends, life * (0.08 + 0.3 * r()) + 1);
            grow(a0, a0 - len, 0, 0.7, 1);
        }
        // The undescribed (lines that reach the present)
        if (!kids[i].length) {
            const dk = darkLog(i), known = Math.max(1, D.spp[i]);
            const f = dk > 0 ? 1 - known / (Math.pow(10, dk) + known) : 0;
            const n = Math.round(Math.min(60, dk * f * 5));
            for (let k = 0; k < n; k++) grow(begun * (0.02 + 0.55 * Math.pow(r(), 1.3)), 0, 0, 1.8, 0);
        }
        veinCache.set(key, veins);
        return veins;
    }

    function traceVeins(c, veins, s, height) {
        const X = xOf;
        for (const pts of veins) {
            let px = X(pts[0][0]), py = s.yc + pts[0][1] * height;
            c.moveTo(px, py);
            for (let k = 1; k < pts.length; k++) {
                const x = X(pts[k][0]), y = s.yc + pts[k][1] * height;
                c.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
                px = x; py = y;
            }
            c.lineTo(px, py);
        }
    }

    function plotClip(c) {
        c.beginPath(); c.rect(0, PT - 8, W, plotH + 14); c.clip();
    }

    function drawDeep() {
        if (!D) return;
        clear(dctx);
        dctx.save();
        plotClip(dctx);
        const comparing = state.compare.length > 0;
        dctx.lineCap = 'round'; dctx.lineJoin = 'round';
        dctx.lineWidth = 0.5;   // pencil
        const base = theme === 'dark' ? 0.16 : 0.13;
        for (const s of segs) {
            const veins = veinsOf(s.i);
            if (!veins.length) continue;
            const height = Math.min(Math.max(10, s.yb - s.ya), 70);
            // Many veins on one lineage each fade, so they add up to texture, not a glow
            const a = base * Math.min(1, Math.sqrt(6 / veins.length)) * (comparing ? (ties.path.has(s.i) ? 1.3 : 0.15) : 1);
            dctx.strokeStyle = `rgba(${tint(colors.ghost, s.i, comparing && !ties.path.has(s.i) ? 0 : 0.3)}, ${a})`;
            dctx.beginPath(); traceVeins(dctx, veins, s, height); dctx.stroke();
        }
        dctx.restore();
    }

    // The branch under the pointer (or just searched for), traced back to the root
    function drawHighlight(c) {
        const target = state.hover >= 0 ? state.hover : state.flash;
        if (target < 0) return;
        const chain = new Set();
        for (let v = target; v > 0; v = D.parent[v]) chain.add(v);
        c.save();
        c.lineCap = 'round';
        const lit = segs.filter(s => chain.has(s.i));
        // Outlines first, then the colour, so no outline cuts across the line before it
        c.strokeStyle = colors.halo;
        for (const s of lit) { c.lineWidth = s.w + 4; c.beginPath(); path(c, s); c.stroke(); }
        for (const s of lit) {
            c.strokeStyle = s.i === target ? colors.text : nodeColor[s.i];
            c.lineWidth = Math.max(1.6, s.w);
            c.beginPath(); path(c, s); c.stroke();
        }
        c.restore();
    }

    // ---------- common ancestors ----------

    // From the groups chosen: every branch on their lineages back to where the last of them
    // meet (`path`, for dimming the rest), the points where two or more of them join, the
    // last common ancestor of all, and the small tree that joins just those (`edges`), with
    // the branch points each edge passes, where other lineages split off
    function computeTies() {
        const sel = state.compare;
        ties = { path: new Set(), joins: [], mrca: -1, edges: [], y: new Map(), points: [], labelYs: [], marks: [], boxes: [] };
        if (!sel.length) return;
        const chains = sel.map(i => { const c = []; for (let v = i; ; v = D.parent[v]) { c.push(v); if (!v) break; } return c; });
        const onAll = new Map();
        for (const c of chains) for (const v of c) onAll.set(v, (onAll.get(v) || 0) + 1);
        const mrca = chains[0].find(v => onAll.get(v) === sel.length);
        for (const c of chains) for (const v of c) { ties.path.add(v); if (v === mrca) break; }
        if (sel.length < 2) return;
        ties.mrca = mrca;

        // The joins: where the chosen lineages part. A node is one when two or more of its
        // branches lead to chosen groups, or when it's chosen and holds another chosen group.
        const holds = v => sel.filter((i, k) => chains[k].includes(v));
        const keep = new Set([mrca, ...sel]);
        for (const v of ties.path) {
            const under = holds(v);
            if (under.length < 2) continue;
            const ways = kids[v].filter(c => ties.path.has(c)).length + (sel.includes(v) ? 1 : 0);
            if (ways >= 2) { keep.add(v); ties.joins.push({ v, under }); }
        }
        ties.joins.sort((a, b) => D.age[b.v] - D.age[a.v]);
        // The small tree: each kept node hangs from its nearest kept ancestor
        const children = new Map();
        for (const v of keep) {
            if (v === mrca) continue;
            const passed = [];
            let p = D.parent[v];
            while (!keep.has(p)) { passed.push(p); p = D.parent[p]; }
            ties.edges.push({ from: p, to: v, passed });
            if (!children.has(p)) children.set(p, []);
            children.get(p).push(v);
        }
        // Heights: a chosen group at its own place in the tree; a join midway between the
        // lines it joins (not at the middle of its whole subtree, which may be far off)
        const place = v => {
            if (sel.includes(v)) { ties.y.set(v, ymid[v]); (children.get(v) || []).forEach(place); return ymid[v]; }
            const ys = (children.get(v) || []).map(place);
            const y = (Math.min(...ys) + Math.max(...ys)) / 2;
            ties.y.set(v, y);
            return y;
        };
        place(mrca);
    }

    // On the top layer, over the dimmed ink: the small tree joining the chosen groups, crisp,
    // with a faint tick where each other lineage split off along the way; a ring at each join
    // with its age; the last common ancestor in the accent colour, with its time on the axis
    function drawTies(c) {
        if (state.compare.length < 2) { drawChosen(c); return; }
        const sel = state.compare;
        const ends = v => sel.includes(v) && !ties.edges.some(e => e.from === v);   // drawn to the present (or its last fossil)
        // An extinct one that would sit on a living line moves to a row of its own, so no
        // line runs on through the point where it ended
        const row = new Map();
        const taken = sel.filter(v => ends(v) && !extinct(v)).map(v => yS(ties.y.get(v)));
        for (const v of sel.filter(v => ends(v) && extinct(v))) {
            let y = yS(ties.y.get(v));
            for (let k = 0; k < 8 && taken.some(t => Math.abs(t - y) < 14); k++) y += 16;
            row.set(v, y); taken.push(y);
        }
        const at = v => ({ x: ends(v) ? (extinct(v) ? xOf(D.last[v]) : X1) : xOf(D.age[v]), y: row.has(v) ? row.get(v) : yS(ties.y.get(v)) });
        const lines = ties.edges.map(e => {
            const a = at(e.from), b = at(e.to);
            const xs = xOf(D.age[e.from]);
            const reach = Math.max(0.01, b.x - xs);
            const L = Math.min(reach, Math.max(26, Math.abs(b.y - a.y) * 0.55));
            return { e, s: { xp: xs, yp: a.y, yc: b.y, xe: b.x, L, w: 3, wp: 3 } };
        });
        c.save();
        c.lineCap = 'round';
        c.strokeStyle = colors.halo;   // outlines first (see drawHighlight)
        for (const { s } of lines) { c.lineWidth = 7; c.beginPath(); path(c, s); c.stroke(); }
        // In a heavier nib: blue-black while lineages still share their ancestry, then each in
        // its own group's ink once it goes its own way
        const inkRgb = hexRgb(colors.ink).join(',');
        for (const { e, s } of lines) {
            const own = sel.includes(e.to);
            c.fillStyle = inkFill(c, own ? nodeRgb[e.to].join(',') : inkRgb, s.xp, s.xe, 1);
            c.beginPath(); ribbon(c, s, 0, true); c.fill();
            // Ticks where other lineages branched off, on the level stretch
            c.strokeStyle = colors.muted; c.lineWidth = 1;
            let last = -1e9;
            for (const v of e.passed) {
                const x = xOf(D.age[v]);
                if (x < s.xp + s.L + 3 || x > s.xe - 3 || x - last < 4) continue;
                last = x;
                c.beginPath(); c.moveTo(x, s.yc - 3.5); c.lineTo(x, s.yc + 3.5); c.stroke();
            }
        }
        ties.points = []; ties.labelYs = []; ties.marks = []; ties.boxes = [];
        // The chosen groups, where their lines end, each with its portrait and name; nudged
        // apart when lines are close
        const scale = portraitScale(sel.length);
        const gap = scale ? PORTRAIT_H * scale + 8 : 15;
        // Each mark as near its line as it can be: pushed apart downwards, then, if that runs
        // off the bottom, pulled back up, so every one stays on the chart
        // The extinct, marked where they ended; one that would sit on another moves down
        const order = sel.filter(v => !(ends(v) && extinct(v))).sort((a, b) => at(a).y - at(b).y), lys = [];
        let below = -1e9;
        for (const i of order) { below = Math.max(at(i).y, below + gap); lys.push(below); }
        const floor = PT + plotH - gap / 2, ceil = PT + gap / 2;
        for (let k = lys.length - 1; k >= 0; k--) lys[k] = Math.min(lys[k], k === lys.length - 1 ? floor : lys[k + 1] - gap);
        for (let k = 0; k < lys.length; k++) lys[k] = Math.max(lys[k], k ? lys[k - 1] + Math.min(gap, 14) : ceil);
        // A group that died out almost today (a Neanderthal) is named out in the margin with the
        // living, clear of their names: left of its mark, its name would lie across ages it never saw
        const markH = Math.max(36, scale ? PORTRAIT_H * scale + 8 : 0), stacked = [];
        for (const i of sel.filter(v => ends(v) && extinct(v)).sort((a, b) => at(a).y - at(b).y)) {
            const { x, y } = at(i), recent = x > X1 - 60;
            let ly = y;
            while (stacked.some(t => Math.abs(t - ly) < markH) || (recent && lys.some(t => Math.abs(t - ly) < markH))) ly += markH;
            stacked.push(ly);
            fossilMark(c, i, x, y, scale, ly, recent);
        }
        order.forEach((i, k) => { const { x, y } = at(i); chosenMark(c, i, x, y, lys[k], scale); });
        // Joins, then the ancestor of all on top
        c.font = '500 10.5px Inter, sans-serif';
        for (const { v } of ties.joins) {
            if (v === ties.mrca || sel.includes(v)) continue;
            const { x, y } = at(v);
            if (y < PT || y > PT + plotH) continue;   // off the chart: its date would sit on the time axis
            ring(c, x, y, 3.5, colors.ink);
            ties.points.push({ i: v, x, y });
            c.font = '700 15px Caveat, cursive';
            haloText(c, fmtAge(D.age[v]), x + 7, y - 11, colors.ink);
        }
        const m = ties.mrca, { x, y } = at(m);
        c.setLineDash([3, 4]); c.strokeStyle = colors.accent; c.lineWidth = 1; c.globalAlpha = 0.7;
        c.beginPath(); c.moveTo(x, Math.max(PT, Math.min(PT + plotH, y)) + 10); c.lineTo(x, PT + plotH + 16); c.stroke();
        c.setLineDash([]); c.globalAlpha = 1;
        c.font = '700 16px Caveat, cursive'; c.textAlign = 'left';
        haloText(c, fmtAge(D.age[m]), x + 5, PT + plotH - 50, colors.accent);   // (above the extinctions' three rows of names)
        if (y >= PT - 10 && y <= PT + plotH + 10) {
            c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
            c.strokeStyle = colors.stage; c.lineWidth = 2; c.stroke();
            c.strokeStyle = colors.accent; c.lineWidth = 1;
            c.beginPath(); c.arc(x, y, 9.5, 0, Math.PI * 2); c.stroke();
            ties.points.push({ i: m, x, y });
            c.textAlign = 'right'; c.font = '700 17px Caveat, cursive';
            const text = `common ancestor · ${ancestorName(m, true)}`;
            // Left of the point when there's room, so it doesn't sit on the lines it starts
            const tw = c.measureText(text).width, left = x - 14 - tw > X0;
            c.textAlign = left ? 'right' : 'left';
            ties.boxes.push(left ? [x - 16 - tw, y - 11, x - 12, y + 11] : [x + 12, y - 11, x + 16 + tw, y + 11]);
            haloText(c, left ? text : clip(c, text, W - x - 22), left ? x - 14 : x + 14, y, colors.accent);
        }
        c.restore();
    }

    // One group chosen so far: just mark it
    function drawChosen(c) {
        ties.points = []; ties.labelYs = []; ties.marks = []; ties.boxes = [];
        for (const i of state.compare) {
            let v = i;
            while (v > 0 && !segOf.has(v)) v = D.parent[v];
            const s = segOf.get(v);
            if (!s) continue;
            const x = s.open ? xOf(D.age[v]) : s.xe;
            if (v === i && extinct(i) && !s.open) fossilMark(c, i, x, s.yc, portraitScale(1));
            else chosenMark(c, i, x, s.yc, s.yc, portraitScale(1));
        }
    }

    // A chosen group's end: a ring on its line, then, in the label column at height ly (which
    // may be nudged off the line), its portrait and its name. A group that ends before the
    // present (an open one) reaches the column by a faint leader, so nothing covers branches.
    function chosenMark(c, i, x, y, ly, scale) {
        c.save();
        ring(c, x, y, 4, colors.text);
        ties.points.push({ i, x, y });
        const col = X1 + 6;
        c.strokeStyle = colors.muted; c.lineWidth = 1;
        if (x < col - 8) {
            c.setLineDash([2, 3]);
            c.beginPath(); c.moveTo(x + 5, y); c.lineTo(col - 2, y); c.stroke();
            c.setLineDash([]);
        }
        const from = Math.max(x + 4, col - 2);
        if (Math.abs(ly - y) > 3) { c.beginPath(); c.moveTo(from, y); c.lineTo(from + 4, ly); c.stroke(); }
        let tx = Math.max(x, col) + 8;
        if (scale) tx += drawPortrait(c, i, tx, ly, scale) + 8;
        ties.labelYs.push({ y: ly, r: scale ? PORTRAIT_H * scale / 2 + 6 : 13 });
        c.textBaseline = 'middle'; c.textAlign = 'left';
        const room = Math.max(30, W - tx - 8);
        // Written in: the everyday name by hand, in the group's ink; the Latin name beneath
        const hand = (text, y) => { c.font = `700 ${room < 90 ? 14 : 18}px Caveat, cursive`; haloText(c, clip(c, text, room), tx, y, nodeColor[i]); };
        const latin = (text, y) => { c.font = 'italic 400 10.5px Inter, sans-serif'; haloText(c, clip(c, text, room), tx, y, colors['text-2']); };
        if (D.common[i] && room < 90) hand(D.common[i], ly);   // a narrow screen: the everyday name says it best
        else if (D.common[i]) { hand(D.common[i], ly - 6); latin(D.name[i], ly + 10); }
        else if (D.name[i]) { c.font = 'italic 600 11.5px Inter, sans-serif'; haloText(c, clip(c, D.name[i], room), tx, ly, colors.text); }
        else hand(display(i), ly);
        const half = scale ? PORTRAIT_H * scale / 2 : 9;
        ties.marks.push({ i, x0: Math.max(x, col), x1: W, y0: ly - half, y1: ly + half });
        c.restore();
    }

    // A chosen extinct lineage's end, marked where it ended rather than in the column of the
    // living: a dagger, then (to its right, or its left if today is too close) its silhouette,
    // faded, and its name, greyed, with when it died out
    function fossilMark(c, i, x, y, scale, ly = y, margin = false) {
        c.save();
        ring(c, x, y, 4, colors.muted);
        ties.points.push({ i, x, y });
        c.font = '600 14px Inter, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
        haloText(c, '\u2020', x + 7, y + 0.5, colors.muted);
        const lineY = y;
        y = ly;   // (the mark itself, which may sit below its line's end)
        const s = scale;
        let pw = s ? PORTRAIT_W * s : 0;
        const when = D.last[i] < 0.012 ? 'died out within the last 12,000 years' : `died out ${fmtAge(D.last[i])} ago`;
        c.font = '700 17px Caveat, cursive';
        const name = `\u2020 ${D.common[i] || D.name[i] || display(i)}`;
        let subs = [D.common[i] ? `${D.name[i]}, ${when}` : when];
        const nw = c.measureText(name).width;
        c.font = 'italic 400 10.5px Inter, sans-serif';
        const width = () => Math.max(nw, ...subs.map(t => c.measureText(t).width));
        let tw = width();
        // Right of the mark if it fits, else left. Where neither side fits it drops the portrait,
        // then puts the name and the date on lines of their own, then keeps it inside the chart.
        // (one that ended near today may use the margin, and never goes left)
        const side = w => { const need = 18 + (w ? w + 6 : 0) + tw; return x + need < (margin ? W - 6 : X1 - 8) ? 1 : !margin && x - need > X0 ? -1 : 0; };
        let fit = side(pw);
        if (!fit && pw) { pw = 0; fit = side(0); }
        if (!fit && D.common[i]) { subs = [D.name[i], when]; tw = width(); fit = side(0); }
        const right = fit ? fit > 0 : margin || X1 - x > x - X0;
        let tx = right ? x + 18 : x - 10 - tw;
        if (!fit) tx = right ? Math.min(tx, W - 6 - tw) : Math.max(tx, 6);
        const px = right ? tx : x - 10 - tw - pw - 6;
        if (Math.abs(y - lineY) > 3) {   // a thin leader from the line's end down to its mark
            c.strokeStyle = colors.halo; c.lineWidth = 3.5;   // (in its own ink, over a halo, to read across the tips)
            c.beginPath(); c.moveTo(x, lineY + 5); c.lineTo(right ? px - 3 : tx + tw + 4, y); c.stroke();
            c.strokeStyle = nodeColor[i]; c.globalAlpha = 0.75; c.lineWidth = 1.2; c.setLineDash([3, 3]);
            c.beginPath(); c.moveTo(x, lineY + 5); c.lineTo(right ? px - 3 : tx + tw + 4, y); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        }
        if (pw) { c.globalAlpha = 0.85; drawPortrait(c, i, px, y, s); c.globalAlpha = 1; if (right) tx += pw + 6; }
        c.textAlign = 'left';
        const up = 12 * (subs.length - 1);   // (two lines under the name: the block rises, clear of what's below)
        c.font = '700 17px Caveat, cursive'; haloText(c, name, tx, y - 6 - up, colors.muted);
        c.font = 'italic 400 10.5px Inter, sans-serif'; subs.forEach((t, k) => haloText(c, t, tx, y + 10 - up + 12 * k, colors.muted));
        const x0 = Math.min(px, tx) - 4, x1 = Math.max(tx + tw, px + pw) + 4;
        const half = Math.max(16 + 6 * (subs.length - 1), (pw ? PORTRAIT_H * s : 0) / 2);
        ties.marks.push({ i, x0, x1, y0: y - half, y1: y + half });
        ties.boxes.push([x0, y - half - 2, x1, y + half + 2]);
        c.restore();
    }

    // ---------- portraits ----------

    // A silhouette of each chosen group, from PhyloPic (phylopic.org), drawn beside its name on
    // the chart and in its hover card, in the lineage's colour.
    // A group without a silhouette of its own borrows its nearest relative's, and says so.
    const PORTRAIT_W = 48, PORTRAIT_H = 40, CARD_H = 64;
    const PUBLIC = /publicdomain/;   // CC0 and the public-domain mark need no credit
    const portraits = new Map();   // node -> { state: 'loading' | 'ready' | 'none', img, credit, drawn, card }

    // How big, given how many share the height: 2x, 1x, or none at all
    function portraitScale(n) {
        const each = plotH / Math.max(1, n), narrow = W - X1 < 180;
        if (each >= 112 && !narrow) return 2;
        return each >= 60 ? 1 : 0;
    }

    function portraitOf(i) {
        if (!portraits.has(i)) {
            portraits.set(i, { state: 'loading' });
            fetchPortrait(i);
        }
        return portraits.get(i);
    }

    // One request: PhyloPic resolves the first of the group's Open Tree ids it knows, most
    // specific first, to that taxon's chosen silhouette
    async function fetchPortrait(i) {
        const p = portraits.get(i), ids = [];
        for (let v = i; v >= 0 && ids.length < 40; v = v ? D.parent[v] : -1) {
            if (D.ott[v]) ids.push(D.ott[v]);
            if (!v) break;
        }
        try {
            if (!ids.length) throw new Error('no Open Tree id');
            // Remembered from an earlier visit: straight to the image (this browser only)
            const key = `dendrogram:silhouette:${ids[0]}`;
            let kept = null;
            try { kept = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { kept = null; }
            if (kept) {
                const img = await loadImage(kept.href).catch(() => null);
                if (img) {
                    p.img = img; p.credit = kept.credit; p.drawn = {}; p.card = {}; p.state = 'ready';
                    showCredits(); schedule('top');
                    return;
                }
            }
            const r = await inTime(fetch(`https://api.phylopic.org/resolve/opentreeoflife.org/taxonomy?objectIDs=${ids.join(',')}&embed_primaryImage=true`));
            if (!r.ok) throw new Error(r.status);
            const node = await r.json(), im = node._embedded && node._embedded.primaryImage;
            if (!im) throw new Error('no silhouette');
            const files = (im._links.rasterFiles || []).slice().sort((a, b) => parseInt(a.sizes.split('x')[1]) - parseInt(b.sizes.split('x')[1]));
            // Smallest first that's big enough; some CDN copies lack CORS headers (T. rex's large
            // PNGs, in Chrome), so fall through the sizes, then the vector and the source file,
            // which are cached apart, then whatever smaller sizes are left
            const tall = files.filter(f => parseInt(f.sizes.split('x')[1]) >= 256);
            const hrefs = [...new Set([...tall, ...[im._links.vectorFile, im._links.sourceFile].filter(Boolean), ...files.slice().reverse()].map(f => f.href))];
            let img = null, href = '';
            for (const h of hrefs) if ((img = await loadImage(h).catch(() => null))) { href = h; break; }
            if (!img) throw new Error('silhouette blocked');
            const of = (im._links.specificNode && im._links.specificNode.title) || '';
            const licence = (im._links.license && im._links.license.href) || '';
            p.img = img;
            p.credit = { of, by: PUBLIC.test(licence) ? '' : (im.attribution || ''), licence,
                         link: `https://www.phylopic.org${im._links.self.href.replace(/\?.*/, '')}` };
            p.drawn = {}; p.card = {};
            p.state = 'ready';
            try { localStorage.setItem(key, JSON.stringify({ href, credit: p.credit })); } catch (e) { /* (private window: fine) */ }
        } catch (e) {
            p.state = 'none';
            // A stalled request, or an image the CDN refused, may pass: one more try, a little
            // later. Only "PhyloPic has none" is final; anything else tries again when the
            // group is chosen again (portraitOf)
            p.final = /no silhouette|no Open Tree id/.test(e.message);
            if (!p.final && !p.retried) { p.state = 'loading'; setTimeout(() => { p.retried = true; fetchPortrait(i); }, 3000); }
        }
        showCredits();
        schedule('top');
    }

    // Anything from PhyloPic gives up after a while, so a stalled request can't leave a
    // portrait loading for ever
    const inTime = (promise, ms = 10000) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);
    function loadImage(src) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        return inTime(img.decode()).then(() => img);
    }

    // The silhouette in the lineage's colour, smooth, fitted inside w x h (CSS pixels), at
    // the screen's resolution; kept per theme and size
    function silhouetteCanvas(i, w, h) {
        const p = portraits.get(i), key = `${theme}:${w}x${h}:${nodeColor[i]}`;
        if (p.drawn[key]) return p.drawn[key];
        const s = Math.min(w / p.img.naturalWidth, h / p.img.naturalHeight);
        const cw = Math.max(1, Math.round(p.img.naturalWidth * s)), ch = Math.max(1, Math.round(p.img.naturalHeight * s));
        const cv = document.createElement('canvas'), r = window.devicePixelRatio || 1;
        cv.width = Math.round(cw * r); cv.height = Math.round(ch * r);
        const c = cv.getContext('2d');
        c.imageSmoothingQuality = 'high';
        c.drawImage(p.img, 0, 0, cv.width, cv.height);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = nodeColor[i]; c.fillRect(0, 0, cv.width, cv.height);
        cv.cssW = cw; cv.cssH = ch;
        return (p.drawn[key] = cv);
    }

    // The smooth silhouette for the hover card, as an image URL in the lineage's colour
    function cardSilhouette(i) {
        const p = portraits.get(i);
        if (!p || p.state !== 'ready') return '';
        if (p.card[theme]) return p.card[theme];
        const s = CARD_H / p.img.naturalHeight, w = Math.min(120, Math.round(p.img.naturalWidth * s));
        const h = Math.round(p.img.naturalHeight * Math.min(s, w / p.img.naturalWidth));
        const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        const c = cv.getContext('2d');
        c.imageSmoothingQuality = 'high';
        c.drawImage(p.img, 0, 0, cv.width, cv.height);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = nodeColor[i]; c.fillRect(0, 0, cv.width, cv.height);
        return (p.card[theme] = { src: cv.toDataURL(), w, h });
    }

    // Draws a silhouette with its left edge at x, centred on cy; returns its width
    function drawPortrait(c, i, x, cy, scale) {
        const p = portraitOf(i);
        const w = PORTRAIT_W * scale, h = PORTRAIT_H * scale;
        x = Math.round(x); const y = Math.round(cy - h / 2);
        if (p.state === 'ready') {   // centred in its box
            const sil = silhouetteCanvas(i, w, h);
            c.imageSmoothingEnabled = true;
            c.drawImage(sil, x + (w - sil.cssW) / 2, y + (h - sil.cssH) / 2, sil.cssW, sil.cssH);
        } else if (p.state === 'loading') {   // a faint outline where it will be
            c.save(); c.strokeStyle = colors.muted; c.globalAlpha *= 0.5; c.lineWidth = 1; c.setLineDash([2, 3]);
            c.beginPath(); c.roundRect ? c.roundRect(x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.8, 6) : c.rect(x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.8); c.stroke();
            c.restore();
        }
        return w;
    }

    // Credits for the silhouettes, under the panel's answer
    function showCredits() {
        const el = $('#compare-credits');
        const rows = state.compare.filter(i => portraits.has(i)).map(i => {
            const p = portraits.get(i);
            if (p.state === 'loading') return '';
            if (p.state === 'none') return `<li><b>${esc(display(i))}</b>: no silhouette</li>`;
            const of = p.credit.of && p.credit.of.toLowerCase() !== (D.name[i] || '').toLowerCase() ? ` (silhouette of <i>${esc(p.credit.of)}</i>)` : '';
            const by = p.credit.by ? `, <a href="${esc(p.credit.link)}" target="_blank" rel="noopener">${esc(p.credit.by)}</a>` : '';
            return `<li><b>${esc(display(i))}</b>${of}${by}</li>`;
        }).filter(Boolean);
        el.innerHTML = rows.length ? `Silhouettes from <a href="https://www.phylopic.org/" target="_blank" rel="noopener">PhyloPic</a>: <ul>${rows.join('')}</ul>` : '';
    }

    function ring(c, x, y, r, color) {
        c.fillStyle = colors.stage; c.strokeStyle = color; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    }

    // (in the written answer, the everyday name first: "chimpanzees (Pan)"; and the lines
    // already named in the sentence aren't named again, "where their lines split apart")
    function splitWords(v, named = []) {
        const two = [...kids[v]].sort((x, y) => leaves[y] - leaves[x]).slice(0, 2);
        const [a, b] = two.map(c => repName[c] ? plainName(c, repName[c]) : '').filter(Boolean);
        if (two.length === 2 && two.every(c => named.some(i => i === c || repName[c] === D.name[i]))) return 'where their lines split apart';
        return b ? `where ${a} and ${b} split apart` : 'at an unnamed branch point';
    }
    // Plain words first, the scientific name after: "animals and fungi (Opisthokonta)"
    function plainName(v, sci = D.name[v]) {
        const plain = sci === D.name[v] ? D.common[v] || PLAIN[sci] : '';
        return plain && fold(plain) !== fold(sci || '') ? `${plain} (${sci})` : sci;
    }
    // A name that's plural takes "are" and "their" (birds, moths & butterflies, fungi)
    const isPlural = i => { const n = (D.common[i] || '').trim(); return /&| and |,/.test(n) || /([^su]s|fungi|algae|people|fish|geese|mice)$/i.test(n); };
    // An ancestor's name; an unnamed one is known by the two largest groups it joins
    function ancestorName(v, short) {
        if (D.name[v]) return D.common[v] ? `${D.name[v]} (${D.common[v]})` : D.name[v];
        const [a, b] = [...kids[v]].sort((x, y) => leaves[y] - leaves[x]).map(c => repName[c]).filter(Boolean);
        if (!b) return short ? 'unnamed group' : 'an unnamed group';
        return short ? `${a} + ${b}` : `the unnamed group joining ${a} and ${b}`;
    }

    // ---------- deeper tiers ----------

    // The built data stops at families. A family (or a group inside one) that gets tall
    // enough on screen loads what's inside it from Open Tree's synthetic tree, a few levels
    // at a time; families Open Tree breaks apart fall back to its taxonomy (members, but no
    // branching order). Extinct groups are left out. Dates inside a family are spaced by a
    // pure-birth (Yule) model from species counts, between the family's crown and today;
    // populations and unknowns are shared down by species count, except for species with a
    // census of their own (estimates.csv), which keep it.
    const EXPAND_PX = 70;
    const OTOL = 'https://api.opentreeoflife.org/v3/';
    const expanding = new Map();   // node -> 'loading' | 'done' | 'none'
    const wanted = new Set();      // tall tips on screen that could open
    const tier = new Map();        // node inside a family -> { T, n }: the family's crown age and size
    let loadingNow = 0, thinLoaded = 0;   // (the thinnest loaded tip, for the deepest zoom)

    function canExpand(i) {
        return !kids[i].length && nodeId[i] && D.other[i] !== '1' && D.tips[i] !== 1 && !expanding.has(i);
    }

    // Start loading what's wanted, centre of the view first, two at a time
    function loadWanted() {
        const mid = PT + plotH / 2;
        const queue = [...wanted].sort((a, b) => Math.abs(yS(ymid[a]) - mid) - Math.abs(yS(ymid[b]) - mid));
        for (const i of queue) {
            if (loadingNow >= 2) break;
            if (canExpand(i)) expand(i);
        }
    }

    const post = (endpoint, body) => fetch(OTOL + endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.ok ? r.json() : null);

    const pending = new Map();   // node -> its load, for anything waiting on it
    function expand(i) {
        if (!pending.has(i)) pending.set(i, (async () => {
            expanding.set(i, 'loading');
            loadingNow++;
            schedule('top');
            try {
                const dates = datesFor(i);
                let inside = (await fromSynth(i)) || (await fromTaxonomy(i));
                if (inside) inside = await sortFossils(inside);
                if (inside && inside.length) {
                    const published = await dates;
                    inside = withForms(inside, published);
                    if (graft(i, inside, published) === 'again') { expanding.delete(i); loadingNow--; pending.delete(i); schedule(); return; }
                    expanding.set(i, 'done');
                }
                else expanding.set(i, 'none');
            } catch (e) {
                expanding.set(i, 'none');
            }
            loadingNow--;
            schedule();
        })());
        return pending.get(i);
    }

    // An extinct form of a species that the build dates (the Neanderthal, which Open Tree files
    // inside Homo sapiens) is drawn as a tip of its own, split off the species' stem at its
    // published date, rather than hanging inside the species from today
    function withForms(specs, published) {
        return specs.map(sp => {
            let out = { ...sp, children: withForms(sp.children, published) };
            for (const f of FORMS.get(sp.ott) || []) {
                if (nodeOfOtt(f.ott) >= 0) continue;
                const id = `mrcaott${sp.ott}ott${f.ott}`;
                published[id] = [f.split, 'c'];
                cited.set(id, `${f.source}: ${f.splitRange[0]}\u2013${f.splitRange[1]} Ma`);
                const form = { id: `ott${f.ott}`, name: f.name, ott: f.ott, rank: 'subspecies', tips: 1, hints: [], hint: '', flagged: false, children: [],
                               first: f.first, last: f.last, span: f.span };
                out = { id, name: '', ott: 0, rank: '', tips: sp.tips, hints: [sp.name], hint: sp.name, flagged: false, children: [out, form] };
            }
            return out;
        });
    }

    // Published dates inside a family, from the build's shards (by the family's index)
    const dateShards = new Map();
    function datesFor(i) {
        let f = i;
        while (f >= N0) f = D.parent[f];
        const k = f % SHARDS;
        if (!dateShards.has(k)) dateShards.set(k, fetch(fresh(`data/dates/${k}.json`)).then(r => r.ok ? r.json() : {}).catch(() => ({})));
        return dateShards.get(k);
    }

    // Load the way down to a taxon (by OTT id) that sits below what's loaded. Its lineage
    // names the nodes on the way: in the synthetic tree, and in the taxonomy (families the
    // tree breaks apart load from the taxonomy, so a path can switch between the two).
    // The deepest loaded node on it is opened, in turn, until the taxon is loaded or
    // nothing deeper can be. Resolves to the taxon's node, or the nearest ancestor reached.
    async function reach(ott) {
        const have = nodeOfOtt(ott);
        if (have >= 0) return have;
        const [synth, tax] = await Promise.all([
            post('tree_of_life/node_info', { ott_id: ott, include_lineage: true }).catch(() => null),
            post('taxonomy/taxon_info', { ott_id: ott, include_lineage: true }).catch(() => null),
        ]);
        const on = new Set([`ott${ott}`]);
        if (synth && synth.lineage) synth.lineage.forEach(n => on.add(n.node_id));
        if (tax && tax.lineage) tax.lineage.forEach(t => on.add(`ott${t.ott_id}`));
        if (on.size < 2) return -1;
        const onPath = v => on.has(nodeId[v]) || (D.ott[v] && on.has(`ott${D.ott[v]}`));
        const depthOf = v => { let d = 0; for (; v > 0; v = D.parent[v]) d++; return d; };
        for (let guard = 0; guard < 16; guard++) {
            const now = nodeOfOtt(ott);   // (an extinct form arrives beside its species, not inside it)
            if (now >= 0) return now;
            let best = -1, bestD = -1;
            for (let v = 0; v < N; v++) if (onPath(v)) { const d = depthOf(v); if (d > bestD) { bestD = d; best = v; } }
            if (best < 0 || D.ott[best] === ott) return best;
            // Already loading for another lookup (two species in one family): wait for it, then look again
            if (expanding.get(best) === 'loading') { await pending.get(best); continue; }
            if (kids[best].length || !canExpand(best)) return best;
            await expand(best);
            if (!kids[best].length && !canExpand(best)) return best;   // (else it became a group that opens further)
        }
        return -1;
    }
    function nodeOfOtt(ott) {
        for (let v = 0; v < N; v++) if (D.ott[v] === ott && D.name[v]) return v;
        return -1;
    }

    // Three levels of the synthetic tree below a node, as plain specs
    async function fromSynth(i) {
        const r = await post('tree_of_life/subtree', { node_id: nodeId[i], format: 'arguson', height_limit: 3 });
        if (!r || !r.arguson) return null;
        const spec = n => {
            const name = (n.taxon && n.taxon.name) || '';
            const species = isSpecies(name);
            // A species known only from GBIF or IRMNG is left out, as in fromTaxonomy: that's
            // where fossils nobody has flagged hide (Vulpes minimus)
            const thin = species && n.taxon && n.taxon.tax_sources && !n.taxon.tax_sources.some(t => /^(ncbi|worms|if|silva):/.test(t));
            return {
                id: n.node_id, name, ott: (n.taxon && n.taxon.ott_id) || 0, flagged: !!n.extinct || thin,
                rank: species ? 'species' : (n.taxon && n.taxon.rank) || '', tips: species ? 1 : n.num_tips || 1,
                hints: (n.descendant_name_list || []).slice(0, 6),   // members, for naming an unnamed one
                children: species ? [] : (n.children || []).map(spec),   // the tree stops at species
            };
        };
        return spec(r.arguson).children;
    }

    // One level of the taxonomy below a node (its members, unordered, uncounted)
    async function fromTaxonomy(i) {
        if (!D.ott[i]) return null;
        const r = await post('taxonomy/taxon_info', { ott_id: D.ott[i], include_children: true });
        if (!r || !r.children) return null;
        const skip = /hidden|barren|environmental|not_otu|viral|hybrid/;
        // Without a tree to go on, members known only from GBIF or IRMNG are left out too:
        // that's where fossils the taxonomy doesn't flag hide (it may drop an obscure living one)
        const listed = c => (c.tax_sources || []).some(t => /^(ncbi|worms|if|silva):/.test(t));
        const members = r.children.filter(c => !skip.test((c.flags || []).join(' ')))
            .map(c => ({ id: `ott${c.ott_id}`, name: c.name, ott: c.ott_id, rank: c.rank, tips: c.rank === 'species' ? 1 : 0, hints: [], children: [],
                         flagged: (c.flags || []).includes('extinct') || !listed(c) }));
        // Species counts, from the synthetic tree, for the members it has (one request; any it
        // doesn't know are left out of the ask and stay uncounted)
        let ask = members.filter(m => !m.tips && !m.flagged).map(m => m.id);
        for (let tries = 0; ask.length && tries < 2; tries++) {
            const info = await post('tree_of_life/node_info', { node_ids: ask }).catch(() => null);
            if (Array.isArray(info)) {
                for (const x of info) { const m = members.find(m => m.id === x.query); if (m) m.tips = x.num_tips || 1; }
                break;
            }
            const unknown = new Set(Object.keys((info && info.unknown) || {}));
            if (!unknown.size) break;
            ask = ask.filter(id => !unknown.has(id));
        }
        return members;
    }

    // A species name is two words, the second lower case (Homo sapiens); below that are
    // subspecies, which the tree folds into their species
    const isSpecies = name => /^[A-Z][a-z-]+ [a-z][a-z-]+$/.test(name) || /^Candidatus [A-Z][a-z]+ [a-z]+$/.test(name);

    // Specimens not yet named as species ("Car cf. condensatus NLG-2014", "Aus sp. BOLD:ABC123",
    // "Vulpes environmental sample")
    const informal = name => /\b(cf|aff|sp|spp|nr|indet)\.|\bsp\b|BOLD:|[A-Z]{2,}[-_]?\d|\d{3,}/.test(name)
        || /environmental sample|uncultured|unidentified|unclassified|incertae sedis/i.test(name);

    // A fossil range from the Paleobiology Database's bounds on a taxon's oldest and youngest
    // records: [first, last, oldest possible, youngest possible] in Ma, or null. The oldest
    // record is read at its young end (it lived by then), the youngest at its middle: many are
    // dated only to an epoch, and the Pleistocene's young end, 11,700 years, would carry Homo
    // erectus to the present. A youngest record in the Holocene keeps its young end (some died
    // out in historical times); a taxon known only from one broad interval sits at its middle.
    // So does one whose youngest record ends at a mass extinction: Tyrannosaurus, last found in
    // the Maastrichtian (72.2 to 66), died out with the rest at 66, not halfway through it.
    const MASS_EXTINCTIONS = [66, 201.4, 251.902, 372.15, 443.1];   // the stage tops PBDB uses, Ma
    function fossilRange(rec) {
        if (rec.firstapp_max_ma == null || rec.lastapp_min_ma == null) return null;
        const fMax = +rec.firstapp_max_ma, fMin = +(rec.firstapp_min_ma ?? fMax);
        const lMin = Math.max(0.0001, +rec.lastapp_min_ma), lMax = +(rec.lastapp_max_ma ?? lMin);
        const atMass = MASS_EXTINCTIONS.some(t => Math.abs(lMin - t) < 0.2);
        const last = lMax <= 0.0117 || atMass ? lMin : (lMax + lMin) / 2;
        return [fMin > last ? fMin : (fMax + fMin) / 2, last, fMax, lMin];
    }
    const fossilSpan = new Map();   // node -> [oldest, youngest] its records allow, for the card

    // Sort what was loaded into living and extinct. The Paleobiology Database is asked about
    // every named member at once: what it calls extinct, with dates, stays as a fossil lineage
    // (first and last appearance, by fossilRange); something extinct it can't date, or that
    // only Open Tree's flags call extinct, goes, since it can't be drawn in time. Informal
    // specimen names go too.
    async function sortFossils(specs) {
        const names = [];
        const gather = list => list.forEach(sp => { if (sp.name) names.push(sp.name); names.push(...sp.hints); gather(sp.children); });
        gather(specs);
        names.splice(0, names.length, ...new Set(names));
        const range = new Map();   // name -> fossilRange, for the extinct
        for (let k = 0; k < names.length; k += 120) {
            try {
                const q = encodeURIComponent(names.slice(k, k + 120).join(','));
                const r = await fetch(`https://paleobiodb.org/data1.2/taxa/list.json?name=${q}&vocab=pbdb&show=app`).then(r => r.ok ? r.json() : {});
                for (const rec of r.records || []) {
                    const f = rec.is_extant === 'extinct' && fossilRange(rec);
                    if (f) range.set(rec.taxon_name, f);
                }
            } catch (e) { break; }
        }
        for (const n of EXTINCT_NAMES) if (!range.has(n)) range.set(n, [0.126, 0.0004, 0.126, 0.0004]);   // gone in historical times
        const sort = list => list.flatMap(sp => {
            if (informal(sp.name)) return [];
            const r = range.get(sp.name);
            if (sp.flagged && !r && sp.name) return [];
            const kids = sort(sp.children);
            if (sp.children.length && !kids.length && !r) return [];   // nothing left in it that can be drawn
            const out = { ...sp, children: kids, hint: sp.hints.find(h => !informal(h)) || '' };
            if (r) { [out.first, out.last] = r; out.span = r.slice(2); }
            else if (kids.length && kids.every(k => k.last != null)) {   // a group of fossils: earliest in, latest out
                out.first = Math.max(...kids.map(k => k.first)); out.last = Math.min(...kids.map(k => k.last));
            }
            else if (sp.flagged && !sp.name && !sp.children.length) {
                // An unnamed extinct group whose members weren't loaded yet (Paranthropus boisei's
                // pair): dated by the members it's named for, or left out, never drawn as living
                const hr = sp.hints.map(h => range.get(h)).filter(Boolean);
                if (!hr.length) return [];
                out.first = Math.max(...hr.map(h => h[0])); out.last = Math.min(...hr.map(h => h[1]));
            }
            return [!out.name && kids.length === 1 ? kids[0] : out];
        });
        return sort(specs);
    }

    // Census figures for single species in this subtree, by the node ids on their paths
    const anchorsIn = id => deepAnchors.filter(a => a.metric === 'individuals' && a.path.includes(id));

    // Hang the loaded specs under node p: new nodes, laid out inside p's own height (so
    // nothing else moves), dated, and given their share of p's figures
    function graft(p, specs, published) {
        // An unnamed group holding a single living line is that line
        while (specs.length === 1 && !D.name[p] && tier.has(p)) {
            const sp = specs[0];
            D.name[p] = sp.name; D.ott[p] = sp.ott; nodeId[p] = sp.id; D.tips[p] = sp.tips; D.rank[p] = rankIndex(sp.rank);
            D.common[p] = commonByOtt.get(sp.ott) || ''; repName[p] = sp.name || sp.hint || repName[p];
            const own = dateIn(published, sp.id);
            if (own && own[0] < D.age[D.parent[p]]) { D.age[p] = own[0]; D.dated[p] = own[1]; D.ci[p] = own[2]; }
            const census = anchorsIn(sp.id).find(a => a.path[0] === sp.id);
            if (census) anchorsBy.set(`${p}:individuals`, census);
            if (D.name[p]) addEntry(p, D.name[p], 'latin');
            if (sp.last != null) {   // a fossil (Paranthropus boisei, the one dated member of its pair): it ends at its last record
                D.first[p] = sp.first; D.last[p] = sp.last; fossilSpan.set(p, sp.span);
                if (!sp.children.length) { D.age[p] = Math.min(sp.last, D.age[D.parent[p]] * 0.97); D.dated[p] = 4; }
            }
            if (!sp.children.length) {   // a species ends there; a group can open again
                if ((ranks[D.rank[p]] === 'species' || sp.tips <= 1) && sp.last == null) D.age[p] = 0;
                if (sp.last != null) layout();   // (now a fossil: it may leave the living-only view)
                colorNodes();
                return ranks[D.rank[p]] === 'species' || sp.tips <= 1 ? 'done' : 'again';
            }
            specs = sp.children;
        }
        const first = !tier.has(p);
        if (first) {   // p is a family from the built data: it becomes a branch point
            const crown = D.crown[p] > 0 ? D.crown[p] : D.age[D.parent[p]] * 0.5;
            D.age[p] = crown;
            D.dated[p] = D.crownBy[p] === 't' ? 1 : D.crownBy[p] === 'p' ? 3 : 0;
            D.ci[p] = D.crownBy[p] === 't' ? D.crownCi[p] : null;
            tier.set(p, { T: crown, n: Math.max(2, D.tips[p] || specs.length) });
        }
        const { T, n } = tier.get(p);
        const added = [];
        const place = (parent, list) => {
            list = list.filter(sp => sp.name || sp.children.length || sp.tips > 1);
            list = middleOut(list, sp => sp.tips || 1);
            const weights = list.map(sp => Math.pow(Math.max(1, sp.tips), SPACE_EXP));
            const total = weights.reduce((a, b) => a + b, 0) || 1;
            share(parent, list);
            let y = y0[parent];
            list.forEach((sp, k) => {
                const i = N++;
                for (const key of ['name', 'parent', 'rank', 'common', 'ott', 'age', 'dated', 'tips', 'spp', 'sppLog', 'sppEst', 'darkLo', 'darkHi', 'other', 'crown', 'first', 'last', 'placed', 'fossilFrom', 'ci', 'crownCi', 'firstAside']) D[key].push(null);
                D.name[i] = sp.name; D.parent[i] = parent; D.rank[i] = rankIndex(sp.rank); D.common[i] = commonByOtt.get(sp.ott) || ''; D.ott[i] = sp.ott;
                const own = dateIn(published, sp.id);
                D.age[i] = own ? own[0] : 0; D.dated[i] = own ? own[1] : 2; D.ci[i] = own ? own[2] : null; D.tips[i] = sp.tips;
                D.other[i] = '0'; D.crown[i] = 0; D.placed[i] = '-';
                D.first[i] = sp.first == null ? null : sp.first; D.last[i] = sp.last == null ? null : sp.last;
                if (sp.span) fossilSpan.set(i, sp.span);
                D.spp[i] = sp.spp; D.sppLog[i] = sp.spp > 0 ? Math.log10(sp.spp) : null; D.sppEst[i] = sp.sppEst ? '1' : '0';
                D.darkLo[i] = sp.darkLo; D.darkHi[i] = sp.darkHi;
                if (sp.census) anchorsBy.set(`${i}:individuals`, sp.census);
                kids.push([]); kids[parent].push(i); leaves.push(1); group.push(group[parent]); nodeId.push(sp.id);
                repName.push(sp.name || sp.hint || '');
                y0.push(y); y += (y1[parent] - y0[parent]) * weights[k] / total; y1.push(y); ymid.push((y0[i] + y1[i]) / 2);
                tier.set(i, { T, n });
                added.push(i);
                if (sp.children.length) { place(i, sp.children); expanding.set(i, 'done'); }
            });
        };
        place(p, specs);
        dateGraft(p, added);
        // Branch points sit midway between their outermost children, bottom-up
        for (let k = added.length - 1; k >= 0; k--) {
            const i = added[k], c = kids[i];
            if (c.length) ymid[i] = (ymid[c[0]] + ymid[c[c.length - 1]]) / 2;
            if (!D.name[i] && c.length) repName[i] = repName[c.reduce((a, b) => (D.tips[b] > D.tips[a] || D.tips[b] === D.tips[a] && extinct(a) && !extinct(b) ? b : a))];
            if (D.name[i]) addEntry(i, D.name[i], 'latin');
        }
        layout();
        colorNodes();
        // Let the zoom reach the thinnest new tip
        const thin = Math.min(...added.map(i => y1[i] - y0[i]));
        if (thin > 0) { thinLoaded = Math.min(thinLoaded || 1, thin); kMax = Math.min(MAX_ZOOM, Math.max(kMax, MAX_LEAF_PX / (base * thin))); zoom.scaleExtent([1, kMax]); }
    }

    // Dates for newly loaded nodes: Open Tree's published date where there is one. Elsewhere
    // a pure-birth (Yule) estimate from species counts, between the nearest dated ancestor
    // and today, kept older than any dated node below it. Every node stays younger than its
    // parent.
    // A node's own date, from the build's shards: [Ma, basis, interval], TimeTree (1) before published
    // trees (3), or a single published study (5, 'c': an extinct form's split, see withForms). A
    // TimeTree date may carry its interval and its studies' median ([Ma, 't', low, high, median]). (Older shards held a bare number.)
    function dateIn(shard, id) {
        const d = shard[id];
        if (d == null) return null;
        return Array.isArray(d) ? [d[0], d[1] === 't' ? 1 : d[1] === 'c' ? 5 : 3, d.length > 3 ? d.slice(2) : null] : [d, 3, null];
    }
    const hasOwn = i => D.dated[i] === 1 || D.dated[i] === 3 || D.dated[i] === 5;
    function dateGraft(p, added) {
        const floor = new Map();   // the oldest dated age below each node
        for (let k = added.length - 1; k >= 0; k--) {
            const i = added[k];
            let f = 0;
            for (const c of kids[i]) f = Math.max(f, hasOwn(c) ? D.age[c] : floor.get(c) || 0, D.first[c] || 0);
            floor.set(i, f);
        }
        for (const i of added) {   // parents first
            const parent = D.parent[i];
            if (extinct(i)) {   // a fossil: a leaf ends at its last record; a group is as old as its oldest fossil
                D.age[i] = kids[i].length ? Math.max(D.first[i] || 0, floor.get(i) || 0) : D.last[i];
                D.dated[i] = 4;
            } else if (!hasOwn(i)) {
                let a = parent;   // the nearest ancestor with a date of its own
                while (D.dated[a] === 2 && tier.has(D.parent[a])) a = D.parent[a];
                const big = Math.max(2, D.tips[a] || tier.get(a).n), tips = D.tips[i];
                const est = tips > 1 ? D.age[a] * Math.log(tips) / Math.log(Math.max(big, tips + 1))
                    : tips === 0 && ranks[D.rank[i]] !== 'species' ? D.age[a] * 0.55 : 0;   // uncounted: in between
                D.age[i] = Math.max(est, (floor.get(i) || 0) * 1.06);
            }
            if (D.age[i] >= D.age[parent] * 0.97 && hasOwn(i)) liftAncestors(i);   // a real date outranks estimates above it
            if (D.age[i] > D.age[parent] * 0.97 && hasOwn(i)) { D.dated[i] = 6; D.ci[i] = null; }   // (it gave way: no longer its own date)
            D.age[i] = Math.min(D.age[i], D.age[parent] * 0.97);
        }
    }
    // A node with a date of its own older than its parent's estimate: the estimated ancestors
    // (loaded earlier, from less to go on) move older to hold it, up to the first one with a
    // date of its own, which stands (then the node gives way instead)
    function liftAncestors(i) {
        let child = i;
        for (let a = D.parent[i]; a > 0 && tier.has(a); a = D.parent[a]) {
            if (D.age[a] > D.age[child] * 1.02) return;
            const family = !tier.has(D.parent[a]);   // (the family itself: liftable if its crown was a guess)
            if (hasOwn(a) || D.dated[a] === 4 || family && D.crown[a] > 0) return;
            const room = D.age[D.parent[a]] * 0.97;
            if (D.age[child] * 1.03 >= room) return;
            D.age[a] = D.age[child] * 1.03;
            if (family) { tier.get(a).T = D.age[a]; return; }
            child = a;
        }
    }

    // Share parent's figures among its new children by the tree's species counts: its described
    // living species (a species is one; a group's share is approximate) and its undescribed
    // estimate. A species with a census of its own keeps it, for its card.
    function share(parent, list) {
        const tipsOf = sp => sp.last != null ? 0 : Math.max(1, sp.tips || 1);   // (none of it goes to the extinct)
        const tipsAll = list.reduce((a, sp) => a + tipsOf(sp), 0) || 1;
        const pow = v => v == null ? null : Math.pow(10, v);
        const lg = v => v > 0 ? Math.log10(v) : null;
        const named = D.spp[parent] || 0;
        list.forEach(sp => {
            const one = sp.rank === 'species' || isSpecies(sp.name);
            sp.spp = sp.last != null ? 0 : one ? 1 : Math.max(1, Math.round(named * tipsOf(sp) / tipsAll));
            sp.sppEst = sp.last == null && !one;
            sp.darkLo = D.darkLo[parent] == null || one ? null : lg(pow(D.darkLo[parent]) * tipsOf(sp) / tipsAll);   // (a species is one species)
            sp.darkHi = D.darkHi[parent] == null || one ? null : lg(pow(D.darkHi[parent]) * tipsOf(sp) / tipsAll);
            sp.census = anchorsIn(sp.id).find(a => a.path[0] === sp.id);
        });
    }

    function rankIndex(r) {
        if (!r) return 0;
        let k = ranks.indexOf(r);
        if (k < 0) { ranks.push(r); k = ranks.length - 1; }
        return k;
    }

    // ---------- labels ----------

    function haloText(c, text, x, y, color) {
        c.strokeStyle = colors.halo; c.lineWidth = 3; c.lineJoin = 'round';
        c.strokeText(text, x, y);
        c.fillStyle = color;
        c.fillText(text, x, y);
    }

    let cellBoxes = [];   // where the named-so-far cells are, for their tooltip
    function drawLabels(c) {
        cellBoxes = [];
        c.save();
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        const maxW = W - X1 - 16;
        const comparing = state.compare.length > 0;
        let lastBottom = -1e9, lastFossil = -1e9;
        // (a name that would run into the comparison's own labels is left out)
        const onTies = (x0, x1, y) => comparing && (ties.boxes || []).some(b => x0 < b[2] && x1 > b[0] && y - 11 < b[3] && y + 11 > b[1]);
        for (const s of terms) {
            if (state.compare.includes(s.i)) continue;   // named by drawTies
            if (comparing && ties.labelYs.some(o => Math.abs(o.y - s.yc) < o.r)) continue;
            if (s.yb - s.ya < LABEL_PX && s.i !== state.hover) continue;
            if (s.yc < PT - 4 || s.yc > PT + plotH + 4) continue;
            if (s.fossil) {   // named where its record ends, past the dagger
                if (s.yc - 6 < lastFossil) continue;
                const x = s.xe + 14, room = X1 + maxW - x;
                if (room < 50) continue;
                c.globalAlpha = comparing ? 0.5 : 1;
                c.font = 'italic 500 11px Inter, sans-serif';
                const name = clip(c, display(s.i), room), nw = c.measureText(name).width;
                if (onTies(x - 12, x + nw, s.yc)) continue;
                haloText(c, name, x, s.yc, colors.muted);
                if (D.common[s.i] && room - nw > 50) { c.font = '400 10.5px Inter, sans-serif'; haloText(c, clip(c, D.common[s.i], room - nw - 6), x + nw + 6, s.yc, colors.muted); }
                lastFossil = s.yc + 6;
                continue;
            }
            if (s.yc - 6 < lastBottom || onTies(X1 + 12, X1 + 12 + maxW, s.yc)) continue;
            const other = D.other[s.i] === '1';
            c.globalAlpha = comparing ? 0.5 : 1;
            c.font = `${other ? 'italic ' : ''}500 11.5px Inter, sans-serif`;
            const x = X1 + 12;
            const cells = maxW > 170 && namedShare(s.i) != null;   // (the named share, at the column's end)
            if (cells) {
                const cx = X1 + 12 + maxW - 64;
                drawCells(c, s.i, cx, s.yc, nodeColor[s.i]);
                cellBoxes.push({ i: s.i, x0: cx - 3, x1: cx + 66, y0: s.yc - 6, y1: s.yc + 6 });
            }
            const name = clip(c, display(s.i), cells ? maxW - 72 : maxW);
            const nw = c.measureText(name).width;
            haloText(c, name, x, s.yc, other || !D.name[s.i] ? colors.muted : colors['text-2']);
            const common = D.common[s.i];
            const loading = expanding.get(s.i) === 'loading';
            if (common || loading) {
                c.font = '400 11px Inter, sans-serif';
                const rest = (cells ? maxW - 72 : maxW) - nw - 8;
                const extra = loading ? 'loading what\u2019s inside\u2026' : common;
                if (rest > 40) haloText(c, clip(c, extra, rest), x + nw + 6, s.yc, colors.muted);
            }
            lastBottom = s.yc + 6;
        }
        c.globalAlpha = 1;
        if (cellBoxes.length) {   // the column's heading
            const cx = X1 + 12 + maxW - 64;
            c.font = '500 9.5px Inter, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
            haloText(c, 'named so far', cx, PT - 8, colors.muted);
            c.strokeStyle = colors.muted; c.globalAlpha = 0.5; c.lineWidth = 0.8;
            c.beginPath(); c.moveTo(cx, PT - 4.5); c.lineTo(cx + 64, PT - 4.5); c.stroke(); c.globalAlpha = 1;
            c.textBaseline = 'middle';
        }
        // The major groups, written in by hand at their first split, in their own ink
        c.font = '700 19px Caveat, cursive';
        const written = [];
        for (const [i, name] of groupNodes) {
            const s = segOf.get(i);
            if (!s || !s.open || s.yb - s.ya < 46) continue;
            const x = xOf(D.age[i]) + 6, y = s.yc - 9, box = [x - 2, y - 10, x + c.measureText(name).width + 2, y + 10];
            if (y < PT + 8 || y > PT + plotH - 6 || x > X1 - 60) continue;
            if ((ties.boxes || []).some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
            c.globalAlpha = comparing ? 0.75 : 1;
            haloText(c, name, x, y, group[i] === 'other' ? colors.ink : nodeColor[i]);
            written.push([x - 2, y - 10, x + c.measureText(name).width + 2, y + 10]);
        }
        c.globalAlpha = 1;
        // Open groups, named at their branch point
        if (!comparing) {
            c.font = '600 10.5px Inter, sans-serif';
            const placed = [...written];
            let count = 0;
            for (const s of segs) {
                if (!s.open || !D.name[s.i] || groupNodes.has(s.i) || s.yb - s.ya < CLADE_LABEL_PX || count > 40) continue;
                const x = xOf(D.age[s.i]) + 5, y = s.yc - 8;
                if (y < PT + 6 || y > PT + plotH - 4 || x > X1 - 40) continue;
                const text = clip(c, D.common[s.i] ? `${D.name[s.i]} · ${D.common[s.i]}` : D.name[s.i], X1 - x - 6);
                const w = c.measureText(text).width;
                const box = [x - 2, y - 7, x + w + 2, y + 7];
                if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
                placed.push(box);
                haloText(c, text, x, y, colors.text);
                count++;
            }
        }
        c.restore();
    }

    function clip(c, text, maxW) {
        if (c.measureText(text).width <= maxW) return text;
        let lo = 0, hi = text.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (c.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
        }
        return lo ? text.slice(0, lo) + '…' : '';
    }

    // Where you are: the named groups that hold the middle of the view
    function drawTrail() {
        const mid = (T.invertY(PT + plotH / 2) - PT) / base;   // as a 0-1 layout position
        const names = [];
        let v = 0, last = '';
        while (kids[v].length) {
            const c = kids[v].find(c => y0[c] <= mid && mid < y1[c]);
            if (c == null || (yS(y1[c]) - yS(y0[c])) < plotH * 0.5) break;
            v = c;
            if (!D.name[v]) continue;
            const name = D.common[v] ? `${D.name[v]} (${D.common[v]})` : D.name[v];
            if (D.name[v] === last) names[names.length - 1] = name;   // (one name at two ranks, once)
            else names.push(name);
            last = D.name[v];
        }
        const key = names.join('\n');
        if (trailEl.dataset.key === key) return;
        trailEl.dataset.key = key;
        // Where you are matters most: a trail too long to fit loses its start, never its end
        const html = from => (from ? '… › ' : '') + names.slice(from, -1).map(esc).join(' › ')
            + (names.length - from > 1 ? ' › ' : '') + `<b>${esc(names[names.length - 1])}</b>`;
        if (!names.length) { trailEl.innerHTML = ''; return; }
        let from = 0;
        trailEl.innerHTML = html(from);
        while (from < names.length - 1 && trailEl.scrollWidth > trailEl.clientWidth + 1) trailEl.innerHTML = html(++from);
    }

    // ---------- hover ----------

    function hitTest(px, py) {
        let best = -1, bestD = Infinity;
        for (const p of ties.points) {   // the comparison's markers come first
            const d = Math.hypot(px - p.x, py - p.y);
            if (d < 10 && d < bestD) { bestD = d; best = p.i; }
        }
        if (best >= 0) return best;
        const mark = ties.marks.find(m => px >= m.x0 && px <= m.x1 && py >= m.y0 && py <= m.y1);
        if (mark) return mark.i;   // a chosen group's portrait and name
        if (px > X1 + 4) {   // in the haze: the terminal line at that height
            for (const s of terms) {
                const d = py >= s.ya && py <= s.yb ? 0 : Math.min(Math.abs(py - s.ya), Math.abs(py - s.yb));
                if (d < bestD && d < 8) { bestD = d; best = s.i; }
            }
            return best;
        }
        for (const s of segs) {
            if (px < s.xp - 2 || px > s.xe + 3) continue;
            let y = s.yc;
            if (px < s.xp + s.L) {
                const t = Math.max(0, (px - s.xp) / s.L);
                y = s.yp + (s.yc - s.yp) * t * t * (3 - 2 * t);
            }
            const d = Math.abs(py - y);
            if (d <= Math.max(5, s.w / 2 + 3) && d < bestD) { bestD = d; best = s.i; }
        }
        return best;
    }

    let dragging = false, touching = false;   // (touching: the last press was a finger)
    canvas.addEventListener('pointerdown', e => { dragging = true; touching = e.pointerType === 'touch'; });
    window.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse') touching = false;
        if (dragging && e.buttons) return;
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const cell = cellBoxes.find(b => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1);
        if (cell) { showCellTip(cell.i, px, py); canvas.classList.add('pointing'); return; }
        const i = hitTest(px, py);
        canvas.classList.toggle('pointing', i >= 0);
        if (i !== state.hover) { state.hover = i; state.flash = -1; schedule('top'); }
        if (i >= 0) showTip(i, px, py); else hideTip();
    });
    canvas.addEventListener('pointerleave', () => { state.hover = -1; hideTip(); schedule('top'); });
    canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const i = hitTest(px, py);
        if (i < 0) { if (state.hover >= 0) { state.hover = -1; hideTip(); schedule('top'); } return; }
        hintEl.classList.add('gone');
        // Touch has no hover: a tap shows the card, and its Select button selects
        if (touching) { state.hover = i; showTip(i, px, py); schedule('top'); return; }
        select(i);
        if (!tipEl.hidden) showTip(i, px, py);   // (its "click to select" now reads "deselect")
    });
    canvas.addEventListener('dblclick', e => {
        const r = canvas.getBoundingClientRect();
        const i = hitTest(e.clientX - r.left, e.clientY - r.top);
        if (i >= 0) zoomTo(kids[i].length ? i : D.parent[i]);   // (its two clicks selected and deselected it)
    });
    canvas.addEventListener('keydown', e => {
        const sel = d3.select(canvas), step = plotH * 0.15;
        const go = s => reduceMotion ? s : s.transition().duration(250);
        if (e.key === '+' || e.key === '=') go(sel).call(zoom.scaleBy, 1.6);
        else if (e.key === '-' || e.key === '_') go(sel).call(zoom.scaleBy, 1 / 1.6);
        else if (e.key === 'ArrowUp') go(sel).call(zoom.translateBy, 0, step / T.k);
        else if (e.key === 'ArrowDown') go(sel).call(zoom.translateBy, 0, -step / T.k);
        else if (e.key === '0') resetView();
        else return;
        e.preventDefault();
    });

    let tipFor = -1;
    function showTip(i, px, py) {
        tipFor = i;
        tipEl.innerHTML = tipHtml(i);
        tipEl.classList.toggle('tapped', touching);
        tipEl.hidden = false;
        const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
        let x = px + 16, y = py + 14;
        if (x + tw > W - 8) x = px - tw - 16;
        if (x < 8) x = 8;
        if (y + th > H - 8) y = Math.max(8, py - th - 14);
        tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
    }
    function hideTip() { tipEl.hidden = true; tipEl.classList.remove('tapped'); }
    // A tapped card stays until a tap elsewhere
    document.addEventListener('pointerdown', e => {
        if (tipEl.classList.contains('tapped') && !tipEl.contains(e.target) && e.target !== canvas) {
            state.hover = -1; hideTip(); schedule('top');
        }
    });
    // The tapped card's buttons
    tipEl.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('button[data-act]');
        if (!b || tipFor < 0) return;
        const i = tipFor;
        if (b.dataset.act === 'select') { select(i); tipEl.innerHTML = tipHtml(i); }
        else { hideTip(); zoomTo(kids[i].length ? i : D.parent[i]); }
    });
    // What a row of named-so-far cells means, for that group
    function showCellTip(i, px, py) {
        const share = namedShare(i), named = D.spp[i] || 0, filled = Math.max(1, Math.min(10, Math.round(share * 10)));
        const total = share > 0 ? named / share : named;
        const ratio = share >= 0.95 ? 'nearly all' : share > 0.5 ? `about ${Math.round(share * 100)}%` : `about 1 in ${fmtInt(Math.round(1 / share))}`;
        tipEl.innerHTML = `<h3><i style="background:${nodeColor[i]}"></i>${esc(display(i))}</h3>`
            + (D.common[i] ? `<div class="common">${esc(D.common[i])}</div>` : '')
            + `<p class="cells-say">Science has named <b>${ratio}</b> of its species: ${fmtCount(Math.log10(Math.max(1, named)))} of about ${fmtCount(Math.log10(Math.max(1, total)))} thought to exist.</p>`
            + `<p class="basis">Each square is a tenth of the species thought to exist. ${filled} filled: named. ${10 - filled} hollow: still to be found${10 - filled ? '' : ' (none, by this estimate)'}. Estimate: ${esc(speciesBasis(i))}; the <em>Unknown</em> setting switches between the low and high ends.</p>`;
        tipEl.hidden = false;
        const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
        let x = px - tw - 16, y = py + 14;
        if (x < 8) x = 8;
        if (y + th > H - 8) y = Math.max(8, py - th - 14);
        tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
    }

    // Figures published for this group itself, with their units and source: how many are alive,
    // and their biomass. (The build doesn't spread them to groups without one: shared out by
    // species they came out impossible, and cells, shoots and animals can't be added up)
    const UNIT_WORDS = { individuals: 'individuals', cells: 'cells', shoots: 'shoots', 'cell-equivalents': 'cell-equivalents' };
    const midOf = a => a.value || Math.sqrt(a.low * a.high);
    const rangeOf = (a, fmt) => a.low != null && a.high != null && a.low !== a.high ? `; range ${fmt(Math.log10(a.low))} to ${fmt(Math.log10(a.high))}` : '';
    function publishedRows(i) {
        const pop = anchorsBy.get(`${i}:individuals`), mass = anchorsBy.get(`${i}:biomass`);
        const unit = a => UNIT_WORDS[a.unit] || a.unit || 'individuals';
        return (pop ? `<dt>Alive now</dt><dd>${fmtCount(Math.log10(midOf(pop)))} ${esc(unit(pop))}<span class="basis">${esc(`${pop.confidence}: ${pop.source}${rangeOf(pop, fmtCount)}`)}</span></dd>` : '')
            + (mass ? `<dt>Biomass</dt><dd>${fmtMass(Math.log10(midOf(mass)))}<span class="basis">${esc(`${mass.confidence}: ${mass.source}${rangeOf(mass, v => fmtMass(v).replace(' of carbon', ''))}`)}</span></dd>` : '');
    }
    // Where a living group's described species count comes from
    function sppBasis(i) {
        if (extinct(i)) return 'fossil species (Paleobiology Database)';
        if (D.other[i] === '1' && !D.spp[i]) return 'counted in the families they’re filed in';
        if (i >= N0) return D.sppEst[i] === '1' ? 'approximate: its share of the family’s count, by the species Open Tree places in it' : 'Open Tree of Life';
        return D.sppEst[i] === '1' ? 'Open Tree’s count: its taxonomy lists none of them as living, so this may include fossils'
            : 'living species named in the Open Tree taxonomy (fossils and duplicate names left out)';
    }
    function speciesBasis(i) {
        for (let v = i; v >= 0; v = v ? D.parent[v] : -1) {
            const a = anchorsBy.get(`${v}:species`);
            if (a) return `share unnamed in ${a.name}: ${a.source}`;
            if (!v) break;
        }
        return kids[i].length && D.darkHi[i] != null ? 'the sum of the estimates for the groups in it' : 'no estimate';
    }

    // A branch point the tree leaves unresolved (more than two lines from one point, as Open Tree
    // or the classification gives it): how many lines, or 0. (The written answer says so where the
    // date isn't measured for the split itself: there the two may have split far more recently,
    // as English and sessile oaks did, inside Quercus.)
    function unresolvedAt(v) {
        const n = kids[v].filter(c => y1[c] > y0[c]).length;
        return n > 2 ? n : 0;
    }

    // Where a lineage split from its nearest living relatives: the nearest ancestor that
    // branches (one holding a single living line, like Homo, isn't a split)
    // ...and where it split from its nearest living ones
    function livingSplit(i) {
        for (let c = i, v = splitOf(i); v > 0; c = v, v = splitOf(v)) {
            while (D.parent[c] !== v) c = D.parent[c];
            if (kids[v].some(k => k !== c && y1[k] > y0[k] && !extinct(k))) return v;
        }
        return -1;
    }
    function splitOf(i) {
        let v = D.parent[i];
        while (v > 0 && kids[v].filter(c => y1[c] > y0[c]).length < 2) v = D.parent[v];   // (counting what's shown)
        return v;
    }

    function tipHtml(i) {
        const p = D.parent[i] >= 0 ? splitOf(i) : -1;
        const rank = rankName(i);
        const fams = leaves[i] > 1 ? `${fmtInt(leaves[i])} families` : '';
        const gone = extinct(i);
        const sub = [gone ? '† extinct' : '', rank, fams].filter(Boolean).join(' · ');
        const isSpeciesNode = rankName(i) === 'species' || (i >= N0 && D.tips[i] === 1 && !kids[i].length);
        const lo = D.darkLo[i], hi = D.darkHi[i];   // (the high end is never below the low)
        const none = v => v == null || v < -0.3;   // (fewer than half a species)
        const unknown = isSpeciesNode ? 'none (it is one species)'
            : none(hi) ? (hi == null && speciesBasis(i) === 'no estimate' ? 'none estimated' : 'none') : !none(lo) && hi - lo < 0.05 ? `about ${fmtCount(lo)}` : `${none(lo) ? 'none' : fmtCount(lo)} to ${fmtCount(hi)}`;
        const trail = [];
        for (let v = D.parent[i]; v > 0 && trail.length < 4; v = D.parent[v]) if (D.name[v]) trail.unshift(D.name[v]);
        const canCompare = D.other[i] !== '1';
        const inTree = state.compare.includes(i);
        const act = touching
            ? `<div class="tip-acts">${canCompare ? `<button type="button" data-act="select">${inTree ? 'Deselect' : 'Select'}</button>` : '<span>Unnamed: can\u2019t be selected</span>'}<button type="button" data-act="zoom">Zoom in</button></div>`
            : (canCompare ? (inTree ? 'Click to deselect' : 'Click to select') : 'Unnamed: can\u2019t be selected')
            + ' · double-click to zoom in';
        const sil = cardSilhouette(i);
        return (sil ? `<img class="sil" src="${sil.src}" width="${sil.w}" height="${sil.h}" alt="">` : '')
            + `<h3><i style="background:${nodeColor[i]}"></i>${esc(display(i))}</h3>`
            + (D.common[i] ? `<div class="common">${esc(D.common[i])}</div>` : '')
            + (sub ? `<div class="rank">${esc(sub)}</div>` : '')
            + '<dl>'
            + (p >= 0 ? `<dt>Split off</dt><dd>${agoOrUndated(D.age[p])}${rangeWords(p)}<span class="basis">${dateBasis(p)}${ciNote(p)}${unresolvedAt(p) ? `; unresolved: one of ${unresolvedAt(p)} lines from that point` : ''}</span></dd>` : '')
            + (kids[i].length ? `<dt>Diversified</dt><dd>${agoOrUndated(D.age[i])}${rangeWords(i)}<span class="basis">${dateBasis(i)}${ciNote(i)}</span></dd>` : '')
            + (gone ? fossilRows(i) : livingRows(i, unknown, isSpeciesNode))
            + '</dl>'
            + (trail.length ? `<div class="path">${trail.map(esc).join(' › ')}</div>` : '')
            + `<div class="act">${act}</div>`;
    }
    function fossilRows(i) {
        const end = D.last[i] < 0.012 ? 'within the last 12,000 years' : `${fmtAgeWords(D.last[i])}`;
        const lived = D.first[i] == null ? `until ${end}` : D.first[i] < 0.012 ? 'within the last 12,000 years'
            : fmtAge(D.first[i]) === fmtAge(D.last[i]) ? `about ${end}`   // (known from one loosely dated interval)
            : `from ${fmtAgeWords(D.first[i])} to ${end}`;
        // Records dated only to a long interval (an epoch) are read at its middle: say how wide the record allows
        const [old, young] = fossilSpan.get(i) || [];
        const loose = old != null && (old > D.first[i] * 1.2 && old >= 0.012 || young < D.last[i] * 0.8 && D.last[i] >= 0.012)
            ? `; some are dated only loosely, and the records allow anywhere from ${fmtAgeWords(old)} to ${young < 0.012 ? 'within the last 12,000 years' : `${fmtAgeWords(young)}`}` : '';
        return `<dt>Lived</dt><dd>${lived}<span class="basis">first and last fossils (Paleobiology Database)${loose}${asideWords(i)}</span></dd>`
            + `<dt>Described species</dt><dd>${D.tips[i] ? fmtInt(D.tips[i]) : 'not counted'}<span class="basis">known from fossils</span></dd>`
            + `<dt>Living today</dt><dd>none</dd>`
            + (D.placed[i] === 'x' ? '<dt>Placed</dt><dd>by its classification<span class="basis">no published tree includes it, so it hangs from its order or class</span></dd>'
                : D.placed[i] === 's' ? '<dt>Placed</dt><dd>on the stem of the living group it was filed in<span class="basis">its fossils are older than that group’s molecular date allows (beyond TimeTree’s range), so it can’t be inside it: it split off before the living members did</span></dd>' : '');
    }
    // A first appearance the build set aside as misfiled, said in words
    function asideWords(i) {
        const a = D.firstAside[i];
        if (!a) return '';
        return a[2] === 'o' ? `; the database's oldest record, ${fmtAge(a[0])} (the genus ${esc(a[1])}), is set aside: far older than any other genus in it, so likely misfiled`
            : `; the database's first appearance, ${fmtAge(a[0])}, is set aside: older than any genus in it, so it rests on fossils identified only to this group, or on spores or leaves named as form genera`;
    }
    function livingRows(i, unknown, isSpeciesNode) {
        const f = D.fossilFrom[i], stem = D.parent[i] >= 0 ? D.age[D.parent[i]] : null;
        const fossilRow = f == null ? '' : `<dt>Oldest fossil</dt><dd>${fmtAgeWords(f)}<span class="basis">${stem == null ? ''
            : D.dated[D.parent[i]] === 7 && f > stem * 0.95 ? 'it sets the date of its split: a lineage is at least as old as its oldest fossil'
            : f < stem ? `a gap of ${fmtAge(stem - f).replace(' Ma', ' million years')} since it split off, where fossils should exist but none are known yet`
            : `older than this tree's date for its split (${fmtAge(stem)})`}${asideWords(i)}</span></dd>`;
        const share = namedShare(i);
        const namedRow = share == null || isSpeciesNode ? '' : `<dt>Named so far</dt><dd>${share > 0.5 ? `${Math.round(share * 100)}%` : `about 1 in ${fmtInt(Math.round(1 / share))}`}<span class="basis">of the species thought to exist (the cells beside its name); the rest are still to be found</span></dd>`;
        const placedRow = D.placed[i] === 'x' ? '<dt>Placed</dt><dd>by its classification<span class="basis">no published tree resolves where it branches, so it sits with the rest of its group</span></dd>' : '';
        const spp = D.spp[i] ? `${D.sppEst[i] === '1' ? 'about ' : ''}${fmtInt(D.spp[i])}` : 'none here';
        return fossilRow + `<dt>Described species</dt><dd>${spp}${isSpeciesNode ? '' : `<span class="basis">${esc(sppBasis(i))}</span>`}</dd>` + namedRow + placedRow
            + `<dt>Undescribed</dt><dd>${unknown}${isSpeciesNode ? '' : `<span class="basis">${esc(speciesBasis(i))}</span>`}</dd>`
            + publishedRows(i);
    }
    let ranks = [];
    const DATE_BASIS = ['between dated branch points (interpolated)', 'TimeTree estimate', 'estimated from species counts (Yule model)', 'median of published dated trees (Open Tree)',
        'from the fossil record (Paleobiology Database)', 'published estimate', 'adjusted for consistency: moved to fit the dates around it',
        'set by the oldest fossil below it (a minimum age: Paleobiology Database)', 'an assumption, not a measurement'];
    const cited = new Map();   // node id -> the study a published estimate (5) is from
    const dateBasis = i => D.dated[i] === 5 && cited.has(nodeId[i]) ? `${DATE_BASIS[5]} (${cited.get(nodeId[i])})`
        : D.dated[i] === 8 && META.rootSource ? `${DATE_BASIS[8]}: ${META.rootSource}` : DATE_BASIS[D.dated[i]];
    // Where a date comes from, for the CSV
    const DATE_SOURCE = ['interpolated (BLADJ)', 'TimeTree (timetree.org)', 'Yule model on species counts', 'Open Tree of Life (dates.opentreeoflife.org)',
        'Paleobiology Database', 'published study', 'adjusted for consistency', 'Paleobiology Database (fossil minimum)', 'assumption'];
    const dateSource = i => D.dated[i] === 5 && cited.has(nodeId[i]) ? cited.get(nodeId[i]) : D.dated[i] === 8 && META.rootSource ? META.rootSource : DATE_SOURCE[D.dated[i]];
    // TimeTree's interval for a node's date [low, high, median of its studies], where it has one
    // (a single study gives none)
    const ciOf = i => D.dated[i] === 1 && D.ci[i] && D.ci[i][0] != null ? D.ci[i] : null;
    // TimeTree's date is its adjusted time, fitted to its whole tree; the interval is around its
    // studies' median, and may not hold it. As words after the age: ", range 6.2–6.7" (same units)
    const ciHolds = i => { const ci = ciOf(i); return ci && ci[0] <= D.age[i] && D.age[i] <= ci[1]; };
    const fmtIn = (a, x) => a >= 1000 ? (x / 1000).toFixed(2) : a >= 10 ? String(Math.round(x)) : a >= 0.1 ? x.toFixed(1) : String(Math.round(x * 1000));
    function rangeWords(i) {
        return ciHolds(i) ? `, range ${fmtIn(D.age[i], ciOf(i)[0])}–${fmtIn(D.age[i], ciOf(i)[1])}` : '';
    }
    // ...and for the card's small print, where the interval doesn't hold the adjusted time
    function ciNote(i) {
        const ci = ciOf(i);
        if (!ci || ciHolds(i)) return '';
        return `; adjusted to fit TimeTree's whole tree: its studies' median is ${fmtAge(ci[2])}, range ${fmtIn(ci[2], ci[0])}–${fmtIn(ci[2], ci[1])}`;
    }
    function rankName(i) { const r = ranks[D.rank[i]]; return r && r !== 'no rank' ? r : ''; }

    // ---------- formatting ----------

    function fmtAge(a) {
        if (a >= 1000) return `${(a / 1000).toFixed(2).replace(/\.?0+$/, '')} Ga`;
        if (a >= 10) return `${Math.round(a)} Ma`;
        if (a >= 0.1) return `${a.toFixed(1)} Ma`;
        if (a >= 0.001) return `${fmtInt(Math.round(a * 1000))} thousand years`;   // (the very recent, in thousands of years)
        if (a > 0) return `${fmtInt(Math.round(a * 1e6 / 100) * 100)} years`;
        return 'today';
    }
    function fmtAgeWords(a) {
        if (a >= 1000) return `${(a / 1000).toFixed(2).replace(/\.?0+$/, '')} billion years ago`;
        if (a >= 10) return `${Math.round(a)} million years ago`;
        if (a >= 0.1) return `${a.toFixed(1)} million years ago`;
        if (a >= 0.001) return `${fmtInt(Math.round(a * 1000))} thousand years ago`;
        if (a > 0) return `${fmtInt(a < 0.0001 ? Math.max(1, Math.round(a * 1e6)) : Math.round(a * 1e6 / 100) * 100)} years ago`;
        return 'too recently for this tree to date';   // (a lineage hung from a living species' tip)
    }
    const agoOrUndated = a => a > 0 ? fmtAgeWords(a) : 'too recently to date';
    // "about 6.5 million years ago", for the written answer (no "about" where there's no date)
    const aboutAge = (a, bold = true) => (a > 0 ? 'about ' : '') + (bold ? `<strong>${fmtAgeWords(a)}</strong>` : fmtAgeWords(a));
    const fmtInt = n => Math.round(n).toLocaleString('en-US');
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    function fmtCount(lg) {
        const v = Math.pow(10, lg);
        if (lg < 4) return fmtInt(v);
        if (lg < 6) return `${(v / 1e3).toFixed(v < 1e4 ? 1 : 0)} thousand`;
        const words = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
        if (lg < 15) {
            const [d, w] = words.find(([d]) => v >= d);
            return `${(v / d).toFixed(v / d < 10 ? 1 : 0)} ${w}`;
        }
        const e = Math.floor(lg), m = Math.pow(10, lg - e);
        return `${m.toFixed(1)} × 10${String(e).split('').map(c => SUP[c]).join('')}`;
    }
    function fmtMass(lg) {   // Gt of carbon -> readable
        const t = Math.pow(10, lg) * 1e9;
        const units = [[1e9, 'Gt'], [1e6, 'Mt'], [1e3, 'kt'], [1, 't'], [1e-3, 'kg']];
        const [d, u] = units.find(([d]) => t >= d) || [1e-3, 'kg'];
        const v = t / d;
        return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')} ${u} of carbon`;
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- controls ----------

    function resetView() {
        const sel = d3.select(canvas);
        (reduceMotion ? sel : sel.transition().duration(700)).call(zoom.transform, d3.zoomIdentity);
    }

    // ---------- search ----------

    // Every way to name a group: Latin names, the tree's own common names, everyday words,
    // and (fetched on first use) NCBI's common names for species and genera, each pointing
    // at the group in the tree that holds it
    // A species or genus below the loaded tree also carries its own OTT id and scientific
    // name (`ott`, `sci`); picking it loads the way down to it
    function addEntry(i, label, kind, ott, sci, pref) {
        const key = fold(label);
        searchIndex.push({ i, label, kind, key, ott, sci, pref, words: key.split(/[\s\-',.()/]+/).filter(Boolean) });
        byPrefix = null;
    }
    // Entries by the first one and two letters of each of their words, so a query only
    // looks at names it could match
    let byPrefix = null;
    function prefixIndex() {
        if (byPrefix) return byPrefix;
        byPrefix = new Map();
        searchIndex.forEach((e, k) => {
            const seen = new Set();
            for (const w of e.words) for (const p of [w.slice(0, 1), w.slice(0, 2)]) {
                if (seen.has(p)) continue;
                seen.add(p);
                if (!byPrefix.has(p)) byPrefix.set(p, []);
                byPrefix.get(p).push(e);
            }
        });
        return byPrefix;
    }
    // Lower case, no accents, and spellings that sound alike made alike (elefant, elephant)
    function fold(text) {
        return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/ph/g, 'f').replace(/ae/g, 'e').replace(/oe/g, 'e').replace(/ck/g, 'k').replace(/y/g, 'i')
            .replace(/\s+/g, ' ').trim();
    }
    const farCache = new Map();   // Open Tree name lookups, by query
    let namesLoaded = null;
    const commonByOtt = new Map();   // a species' or genus' everyday name, for the labels
    function loadNames() {
        if (!namesLoaded) namesLoaded = fetch(fresh('data/names.json'))
            .then(r => r.ok ? r.json() : [])
            .then(rows => {
                for (const [label, i, ott, sci, preferred] of rows) {
                    addEntry(i, label, 'species', ott, sci, !!preferred);
                    if (preferred) commonByOtt.set(ott, label);
                }
                for (let v = 0; v < N; v++) if (!D.common[v] && commonByOtt.has(D.ott[v])) D.common[v] = commonByOtt.get(D.ott[v]);
                if (state.compare.length && !$('#compare-result .busy')) compareChanged();
                else schedule();
            })
            .catch(() => {});
        return namesLoaded;
    }

    // Levenshtein distance, giving up once it's past `max`
    function editDistance(a, b, max) {
        if (Math.abs(a.length - b.length) > max) return max + 1;
        let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
        for (let x = 1; x <= a.length; x++) {
            const row = [x];
            let low = x;
            for (let y = 1; y <= b.length; y++) {
                row[y] = Math.min(prev[y] + 1, row[y - 1] + 1, prev[y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
                if (row[y] < low) low = row[y];
            }
            if (low > max) return max + 1;
            prev = row;
        }
        return prev[b.length];
    }

    // The groups a query names, best first: exact, then starts-with, then every word of the
    // query starting a word of the name, then contained; a typo is allowed only when that
    // finds little. Among equals, closer (shorter) names and bigger groups come first.
    function findGroups(query, limit = 8) {
        const q = fold(query);
        if (q.length < 2) return [];
        const qw = q.split(/[\s\-',.()/]+/).filter(Boolean);
        if (!qw.length) return [];
        const best = new Map();
        // One result per taxon: a species named twice (human, Homo sapiens) shows once
        const taxon = e => e.ott ? `o${e.ott}` : D.ott[e.i] ? `o${D.ott[e.i]}` : `n${e.i}`;
        const consider = (e, tier) => {
            // A species or genus by its own name beats the everyday word for its family
            const meant = PREFER[q] && e.sci === PREFER[q] ? -5e5 : 0;   // (beats even an exact match elsewhere)
            // (only by its preferred or scientific name: a plant also called "ape" doesn't beat the apes)
            const own = (e.ott && tier === 0 ? (e.pref || fold(e.sci || '') === e.key ? -600 : 400) : e.kind === 'species' && !e.ott ? 300 : e.kind === 'alias' ? 200 : 0) + (e.pref ? -150 : 0) + meant;
            const rank = tier * 1e6 + Math.abs(e.key.length - q.length) * 400 + own
                - Math.min(900, Math.log2(leaves[e.i] + 1) * 60);
            const key = taxon(e), cur = best.get(key);
            if (!cur || rank < cur.rank) best.set(key, { rank, e });
        };
        const index = prefixIndex();
        // Spacing and a plural don't matter (bumblebee, bumble bees)
        const loose = k => k.replace(/[\s-]/g, '');
        const forms = k => { const b = loose(k); return [b, b.replace(/s$/, ''), b.replace(/es$/, '')]; };
        const lq = forms(q);
        // A word and its plural, irregular ones too (goose, geese)
        const same = (a, b) => a === b || forms(a).some(f => forms(b).includes(f)) || IRREGULAR[a] === b || IRREGULAR[b] === a;
        const tail = qw.join(' ');
        for (const e of index.get(qw[0].slice(0, 2)) || []) {
            const w = e.words;
            // A scientific name is found by its genus first: Quercus alba before Lasiocampa quercus
            const epithet = e.sci && fold(e.sci) === e.key && w.length > 1 && !same(qw[0], w[0]);
            if (e.key === q) consider(e, 0);
            else if (epithet) { if (qw.every(x => w.some(y => y.startsWith(x)))) consider(e, 2); }
            else if (forms(e.key).some(f => lq.includes(f))) consider(e, 0.5);
            // The word as the name's last word, the thing it names ("rock dove", "greylag goose"),
            // beats the word used as a modifier ("dove weed") or the start of another ("goosefish")
            else if (w.length > qw.length && qw.every((x, k) => same(x, w[w.length - qw.length + k]))) consider(e, 0.7);
            else if (qw.every(x => w.some(y => same(x, y)))) consider(e, 0.8);
            else if (e.key.startsWith(q) || e.key.startsWith(tail)) consider(e, 1);
            else if (qw.every(x => w.some(y => y.startsWith(x)))) consider(e, 2);
        }
        for (const [plural, one] of Object.entries(IRREGULAR)) {   // (an irregular plural lives under another prefix)
            if (q !== plural && q !== one) continue;
            const other = q === plural ? one : plural;
            for (const e of index.get(other.slice(0, 2)) || []) {
                const w = e.words;
                if (e.key === other) consider(e, 0.5);
                else if (w.length > 1 && same(other, w[w.length - 1])) consider(e, 0.7);
            }
        }
        if (PREFER[q]) {   // the species an everyday word means, by its scientific name
            const e = searchIndex.find(e => e.sci === PREFER[q] && e.pref) || searchIndex.find(e => e.sci === PREFER[q] && e.key === fold(PREFER[q])) || searchIndex.find(e => e.sci === PREFER[q]);
            if (e) consider(e, 0);
        }
        if (q.length >= 3) {   // inside a word: only the tree's own names (the long list is species)
            for (const e of searchIndex) if (e.kind !== 'species' && !best.has(taxon(e)) && e.key.includes(q)) consider(e, 3);
        }
        if (best.size < 5 && q.length >= 4) {
            const max = q.length >= 8 ? 2 : 1;
            for (const e of index.get(q[0]) || []) {
                if (best.has(taxon(e))) continue;
                if (editDistance(q, e.key, max) <= max || e.words.some(x => x.length >= 4 && editDistance(q, x, max) <= max)) consider(e, 4);
            }
        }
        return [...best.values()].sort((a, b) => a.rank - b.rank).slice(0, limit).map(b => b.e);
    }

    // Where a group sits, for a result row: its nearest named order, class or phylum
    function placeOf(i) {
        const out = [];
        for (let v = D.parent[i]; v > 0 && out.length < 2; v = D.parent[v]) {
            const r = rankName(v);
            if (D.name[v] && /^(order|class|phylum|kingdom|subclass|superorder|infraclass)$/.test(r)) out.push(D.common[v] || D.name[v]);
        }
        if (!out.length) for (let v = D.parent[i]; v > 0 && out.length < 2; v = D.parent[v]) if (D.name[v]) out.push(D.name[v]);
        return out.join(' · ');
    }

    function highlight(text, q) {
        const at = text.toLowerCase().indexOf(q.trim().toLowerCase());
        if (at < 0 || !q.trim()) return esc(text);
        const end = at + q.trim().length;
        return `${esc(text.slice(0, at))}<mark>${esc(text.slice(at, end))}</mark>${esc(text.slice(end))}`;
    }

    // The search box: a pick (Enter, click) adds the group to the selection and the box
    // empties for the next one
    function attachSearch(input, list, go) {
        let results = [], active = -1, timer;
        const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
        const render = (more = [], asked = false) => {
            const q = input.value;
            results = VIRUS.test(q.trim()) ? [] : findGroups(q);
            if (q.trim().length < 2) { close(); return; }
            // (another name for a group here takes its place: Angiospermae → Magnoliopsida)
            const syn = new Set(more.filter(e => e.syn).map(e => e.ott));
            results = results.filter(e => !syn.has(e.ott || D.ott[e.i]));
            const have = new Set(results.map(e => e.ott || D.ott[e.i]));
            // (and Open Tree's homonyms of a name here, "Plasmodium falciparum (species in Opisthokonta)")
            const named = new Set(results.flatMap(e => [e.key, e.sci ? fold(e.sci) : ''].concat(e.i >= 0 && D.name[e.i] ? [fold(D.name[e.i])] : [])));
            more = more.filter(e => e.syn || !named.has(fold(e.label.replace(/ \(.*\)$/, ''))));
            const meant = fossilWord(q);
            const exact = e => e.key === fold(q) || meant && e.sci === meant ? 0 : 1;   // Open Tree's exact match beats weak matches here
            results = results.concat(more.filter(e => !have.has(e.ott)));
            if (more.length && (meant || !results.some(e => e.i >= 0 && e.key === fold(q)))) results.sort((a, b) => exact(a) - exact(b));
            results = results.slice(0, 10);
            // (asked too when nothing here even starts with what was typed)
            const old = OLD_NAMES[fold(q).trim()];
            const few = fossilWord(q) || q.trim().length >= 4 && (results.length < 4 || !results.some(e => e.key.startsWith(fold(q))));
            // (and for one word named nowhere here exactly, which may be a genus: Quercus)
            const willAsk = !asked && !old && !VIRUS.test(q.trim()) && (few || /^[a-z-]{4,}$/i.test(q.trim()) && !results.some(e => [fold(q), fold(q) + 's'].includes(e.key) || e.sci && fold(e.sci) === fold(q)));
            const id = input.id;
            list.innerHTML = results.map((e, k) => {
                const i = e.i, latin = e.kind === 'latin', far = i < 0;
                const sci = e.sci && fold(e.sci) !== e.key ? e.sci : '';
                const also = e.kind === 'pbdb' ? '' : e.syn ? ` <span class="sub">→</span> ${esc(e.sci)}` : e.ott ? (sci ? ` <span class="sub"><i>${esc(sci)}</i></span>` : '')
                    : latin ? (D.common[i] ? ` <span class="sub">${esc(D.common[i])}</span>` : '')
                    : D.name[i] ? ` <span class="sub">→</span> ${esc(D.name[i])}` : '';
                const where = e.kind === 'pbdb' ? ['a fossil in the Paleobiology Database']
                    : e.syn ? [`another name for ${e.sci}`] : far ? [e.higher ? 'a group in Open Tree’s taxonomy' : 'a species or genus in Open Tree’s taxonomy']
                    : e.ott ? [D.common[i] || D.name[i], placeOf(i)]
                    : [placeOf(i), leaves[i] > 1 ? `${fmtInt(leaves[i])} families` : (rankName(i) || 'family')];
                const chosen = !far && state.compare.some(c => c === i && !e.ott || e.ott && D.ott[c] === e.ott);
                return `<li role="option" id="${id}-${k}" aria-selected="false" data-k="${k}">`
                    + `<i class="dot" style="background:${far ? colors.muted : nodeColor[i]}"></i>`
                    + `<span class="main"><span class="hit">${highlight(e.label, q)}</span>${also}`
                    + `<span class="ctx">${esc(where.filter(Boolean).join(' · '))}</span></span>`
                    + (chosen ? '<span class="tag">selected</span>' : '')
                    + '</li>';
            }).join('') || `<li class="none" aria-disabled="true">${old ? esc(old) : willAsk ? 'Looking further…' : VIRUS.test(q.trim())
                ? 'Viruses aren’t cellular life, and can’t be placed on one tree with it, so they aren’t here.'
                : `Nothing called “${esc(q.trim())}” in the tree. It holds cellular life, living and fossil; viruses aren’t included.`}</li>`;
            list.hidden = false; input.setAttribute('aria-expanded', 'true');
            active = -1;
            farPending = willAsk ? further(q, few) : null;
        };
        // Few results here: ask Open Tree's own name index, which knows every scientific name
        // in its taxonomy (Wolbachia, Penicillium), and add what it finds
        let farPending = null;
        const further = (q, few) => {
            const key = q.trim().toLowerCase(), term = fossilWord(q) || q.trim();
            if (!farCache.has(key)) farCache.set(key, fetch(OTOL + 'tnrs/autocomplete_name', {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: term }),
            }).then(r => r.ok ? r.json() : []).catch(() => []));
            return farCache.get(key).then(found => {
                if (input.value !== q || document.activeElement !== input) return;
                found = Array.isArray(found) ? found : [];
                // (a leading "Candidatus" isn't part of the name: Candidatus Lokiarchaeota; and a
                // near miss counts only when nothing has the very name, Protista not Proutista)
                const bare = n => fold(n).replace(/^candidatus /, '').split(' ')[0];
                const exactly = found.some(t => bare(t.unique_name) === bare(term));
                const looksLike = n => { const a = bare(n), b = bare(term); return a.startsWith(b) || b.startsWith(a) || !exactly && editDistance(a, b, 2) <= 2; };
                // (the name as asked first, then the shortest: the species before its serovars)
                const rank = t => (bare(t.unique_name) === bare(term) ? 0 : 1) * 1000 + t.unique_name.length;
                const more = [...new Map(found.filter(t => !t.is_suppressed && looksLike(t.unique_name)).sort((a, b) => rank(a) - rank(b)).map(t => [t.ott_id, t])).values()].slice(0, 6)   // (one row per taxon)
                    .map(t => ({ i: -1, label: t.unique_name, kind: 'far', key: fold(t.unique_name), ott: t.ott_id, sci: t.unique_name, higher: t.is_higher, words: [] }));
                // Open Tree found it by another name: a synonym (Compositae is Asteraceae)
                const other = found.some(t => !t.is_suppressed && !looksLike(t.unique_name)) ? post('tnrs/match_names', { names: [term], do_approximate_matching: false })
                    .then(d => ((d.results || [])[0] || {}).matches || []).catch(() => []) : Promise.resolve([]);
                return other.then(ms => {
                    if (input.value !== q || document.activeElement !== input) return;
                    const syns = [...new Map(ms.filter(m => m.is_synonym && m.taxon && !m.taxon.is_suppressed).map(m => [m.taxon.ott_id, m])).values()]
                        .map(m => ({ i: -1, label: term, kind: 'far', syn: true, key: fold(term), ott: m.taxon.ott_id, sci: m.taxon.unique_name, higher: m.taxon.is_higher, words: [] }));
                    if (syns.length || more.length || !few) { render(syns.concat(more.filter(e => !syns.some(s => s.ott === e.ott))), true); farPending = null; return; }
                // Nothing there: the Paleobiology Database knows fossils Open Tree doesn't (Dimetrodon)
                return fetch(`https://paleobiodb.org/data1.2/taxa/auto.json?name=${encodeURIComponent(term)}&limit=5`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
                    .then(d => {
                        if (input.value !== q || document.activeElement !== input) return;
                        const fossils = [...new Map((d.records || []).filter(r => /^[A-Z][a-z]/.test(r.nam) && looksLike(r.nam)).map(r => [r.nam, r])).values()]   // (scientific names only)
                            .map(r => ({ i: -1, label: r.nam, kind: 'pbdb', key: fold(r.nam), sci: r.nam, words: [] }));
                        render(fossils, true);
                        farPending = null;
                    });
                });
            });
        };
        const pick = e => { close(); input.value = ''; go(e); };
        input.addEventListener('focus', () => loadNames().then(() => { if (document.activeElement === input && input.value.trim().length >= 2) render(); }));
        input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 70); });
        list.addEventListener('mousedown', ev => {
            const li = ev.target.closest('[data-k]');
            if (!li) return;
            ev.preventDefault();
            pick(results[+li.dataset.k]);
        });
        input.addEventListener('keydown', e => {
            const items = list.querySelectorAll('li[role="option"]');
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!items.length) return;
                active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items.forEach((li, k) => li.setAttribute('aria-selected', String(k === active)));
                input.setAttribute('aria-activedescendant', `${input.id}-${active}`);
                items[active].scrollIntoView({ block: 'nearest' });
                e.preventDefault();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(timer);
                if (list.hidden || !results.length) render();   // typed fast and pressed Enter
                if (farPending && active < 0) { farPending.then(() => { if (results.length) pick(results[0]); }); return; }   // (Open Tree's answer is on its way)
                if (results.length) pick(results[Math.max(0, active)]);
            } else if (e.key === 'Escape') close();
        });
        input.addEventListener('blur', () => setTimeout(close, 120));
    }

    // Example selections, while nothing is selected: one click to a finished picture
    const EXAMPLES = [['human', 'dog'], ['human', 'common octopus'], ['human', 'button mushroom'], ['English oak', 'wheat'], ['honey bee', 'ant'], ['blue whale', 'hippopotamus'], ['E. coli', 'human']];

    function setupControls() {
        document.querySelectorAll('[data-dark],[data-time],[data-life]').forEach(b => {
            b.addEventListener('click', () => {
                const [k, v] = b.dataset.dark ? ['dark', b.dataset.dark] : b.dataset.life ? ['life', b.dataset.life] : ['time', b.dataset.time];
                if (k === 'life') { setLife(v); return; }
                state[k] = v;
                b.parentElement.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
                if (k === 'dark' && state.compare.length) compareChanged();   // (the answer's species counts change too)
                else draw();
            });
        });
        $('#reset').addEventListener('click', resetView);

        attachSearch($('#search'), $('#search-results'), async e => {
            const i = await targetOf(e);
            if (i < 0) return;
            if (!state.compare.includes(i)) select(i, true);
            else { compareChanged(); fitTree(); }   // (says why nothing was added)
        });
        $('#compare-result').addEventListener('click', async e => {
            const b = e.target.closest('button[data-try]');
            if (!b) return;
            await loadNames();
            const picks = b.dataset.try.split('|').map(w => findGroups(w, 1)[0]).filter(Boolean);
            busy(`Finding ${picks.map(p => p.label).join(' and ')}…`);
            const sel = (await Promise.all(picks.map(targetOf))).filter(i => i >= 0);
            state.compare = [...new Set(sel)];
            compareChanged(true);
        });
        $('#compare-clear').addEventListener('click', () => { state.compare = []; compareChanged(); });
        $('#compare-fit').addEventListener('click', fitTree);
        $('#compare-download').addEventListener('click', () => download(`dendrogram-selection-${META.built || 'data'}.csv`, csv(selectionRows())));
        $('#tree-download').addEventListener('click', () => download(`dendrogram-tree-${META.built || 'data'}.csv`, csv(treeRows())));
        if ($('#cite-text')) $('#cite-text').textContent = citation();   // (the citation is hidden for now)
        $('#data-version').textContent = `Data built ${META.built}: Open Tree of Life synthesis ${META.synth}, taxonomy ${META.taxonomy}; TimeTree; Open Tree's published dates; the Paleobiology Database; NCBI Taxonomy for common names.`;
        $('#compare-copy').addEventListener('click', e => {
            const b = e.currentTarget;
            const done = ok => { b.textContent = ok ? 'Link copied' : 'Copy failed'; setTimeout(() => { b.textContent = 'Copy link'; }, 1600); };
            if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => done(true), () => done(false));
            else done(false);
        });
        $('#chips').addEventListener('click', e => {
            const b = e.target.closest('button[data-node]');
            if (b) select(+b.dataset.node);
        });
        const above = new ResizeObserver(fitStage);
        for (const el of ['.header', '.toolbar', '#compare']) above.observe($(el));
        window.addEventListener('hashchange', readHash);
    }

    // Show all life, or only the living: the extinct lineages take their share of the height,
    // or none, and the view refits to the selection (or the whole tree)
    function setLife(v) {
        if (state.life === v) return;
        state.life = v;
        document.querySelectorAll('[data-life]').forEach(o => o.setAttribute('aria-pressed', String(o.dataset.life === v)));
        if (v === 'living') {
            const gone = state.compare.filter(i => extinct(i));
            state.compare = state.compare.filter(i => !extinct(i));
            if (gone.length) note = `${gone.map(display).join(', ')} ${gone.length > 1 ? 'are' : 'is'} extinct, so ${gone.length > 1 ? 'they’re' : 'it’s'} hidden while only the living are shown.`;
        }
        layout();
        kMax = Math.min(MAX_ZOOM, Math.max(1, MAX_FAMILY_PX / (base * thinLeaf), thinLoaded ? MAX_LEAF_PX / (base * thinLoaded) : 1));
        zoom.scaleExtent([1, kMax]);
        compareChanged();
        if (state.compare.length) fitTree(); else resetView();
    }

    // The node a search result stands for, loading the way down to it if it's a species or
    // genus below what's loaded (named, then, by the everyday word it was found by)
    let note = '';   // said after the next answer: what search couldn't do exactly
    async function targetOf(e) {
        note = '';
        if (PARATAXA.has(e.sci || e.label)) {   // (found by Open Tree's or the Paleobiology Database's own search)
            $('#compare-result').textContent = `${e.sci || e.label} is a trace-fossil or egg family: it is named for what was found (tracks, nests, eggshell), not for the animals that left them, so the tree doesn’t draw it as a lineage.`;
            return -1;
        }
        if (e.kind === 'pbdb') {   // known only to the Paleobiology Database
            busy(`Finding ${e.label}…`);
            const i = await placeByRecord(e.label, -1);
            if (i < 0) { busy(''); $('#compare-result').textContent = `Couldn’t place ${e.label} in the tree.`; }
            return i;
        }
        if (!e.ott) return e.i;
        const loaded = nodeOfOtt(e.ott);
        if (loaded >= 0) {
            if (state.compare.includes(loaded)) {   // the same branch, by another name (a dog is a wolf)
                if (fold(e.label) !== fold(D.common[loaded] || '') && fold(e.label) !== fold(D.name[loaded]))
                    note = `${e.label} is the same branch as ${D.common[loaded] || D.name[loaded]} here (${D.name[loaded]}), already selected${/familiaris|dog/i.test(e.sci + e.label + D.common[loaded]) ? ': the dog is a domesticated form of the gray wolf' : ''}.`;
                return loaded;
            }
            nameAs(loaded, e);
            return loaded;
        }
        busy(`Finding ${e.label}${e.sci && fold(e.sci) !== e.key ? ` (${e.sci})` : ''}…`);
        let i = await reach(e.ott);
        if (i >= 0 && D.ott[i] === e.ott) { nameAs(i, e); return i; }
        // Not a branch of its own in Open Tree's tree: hang it beside its relatives instead, a
        // fossil with its dates from the Paleobiology Database, or a living one by its
        // classification, rather than selecting some large group that holds it
        const name = e.sci || e.label;
        const placed = await placeByRecord(name, i, e.ott);
        if (placed >= 0) {
            nameAs(placed, e, name);
            return placed;
        }
        if (i < 0) { busy(''); $('#compare-result').textContent = `Couldn’t place ${e.label} in the tree.`; return -1; }
        note = `${e.label} isn’t in the tree as its own branch; selected the nearest group that holds it.`;
        return i;
    }

    // A species found by an everyday word is called by it (dog, not the wolf it's a form of),
    // in the chip and in the shared link
    const picked = new Map();   // node -> { label, sci }: the word it was found by, and that word's species
    function nameAs(i, e, sci = e.sci) {
        if (e.kind !== 'species' || sci.includes(e.label) || fold(e.label) === fold(D.name[i])) return;
        D.common[i] = e.label;
        picked.set(i, { label: e.label, sci });
    }
    // The name a selection shows: the subspecies it was picked as, when the tree folds it into this species
    const shownName = i => picked.has(i) && picked.get(i).sci.startsWith(`${D.name[i]} `) ? picked.get(i).sci : display(i);

    // Hang a taxon the tree doesn't have beside its nearest relatives that it does. The
    // Paleobiology Database gives its ancestors (and, if it's extinct, its first and last
    // fossils); the host is the more precise of the nearest of those ancestors in the tree and
    // `near` (where Open Tree's lineage led). A family there that hasn't loaded yet loads first,
    // in case it holds the taxon after all. Marked as placed by its classification.
    async function placeByRecord(name, near, ott = 0) {
        let recs = [];
        try {
            recs = (await inTime(fetch(`https://paleobiodb.org/data1.2/taxa/list.json?name=${encodeURIComponent(name)}&rel=all_parents&show=app&vocab=pbdb`).then(r => r.ok ? r.json() : {}), 12000)).records || [];
        } catch (e) { recs = []; }
        let self = recs.find(r => r.taxon_name === name) || recs[recs.length - 1];
        let flags = [];
        if (!self && ott) {   // a name it doesn't know: Open Tree's flags, and its synonyms (Homo sapiens neanderthalensis is Homo neanderthalensis there)
            const info = await post('taxonomy/taxon_info', { ott_id: ott }).catch(() => null);
            flags = (info && info.flags) || [];
            for (const syn of ((info && info.synonyms) || []).filter(isSpecies).slice(0, 3)) {
                try {
                    recs = (await inTime(fetch(`https://paleobiodb.org/data1.2/taxa/list.json?name=${encodeURIComponent(syn)}&rel=all_parents&show=app&vocab=pbdb`).then(r => r.ok ? r.json() : {}), 8000)).records || [];
                } catch (e) { recs = []; }
                self = recs.find(r => r.taxon_name === syn);
                if (self) break;
            }
            if (!self) recs = [];
        }
        const gone = self ? self.is_extant === 'extinct' : flags.includes('extinct');
        if (!self && near < 0) return -1;
        const byName = name => { for (let v = 0; v < N; v++) if (D.name[v] === name && y1[v] > y0[v]) return v; return -1; };
        const depth = v => { let d = 0; for (; v > 0; v = D.parent[v]) d++; return d; };
        let host = near;
        for (let k = recs.length - 2; k >= 0; k--) {   // nearest ancestor first
            const v = byName(recs[k].taxon_name);
            if (v >= 0) { if (host < 0 || depth(v) > depth(host)) host = v; break; }
        }
        if (host < 0) return -1;
        if (!kids[host].length && canExpand(host)) {   // it may be inside, once loaded
            await expand(host);
            const found = ott ? nodeOfOtt(ott) : byName(name);
            if (found >= 0) return found;
        }
        const [first = null, last = null, ...span] = (gone && self && fossilRange(self)) || [];
        if (gone && last == null) return -1;   // extinct, but undated: it can't be drawn in time
        while (first != null && host > 0 && D.age[host] <= first) host = D.parent[host];   // older than the group: on its stem
        return addLeaf(host, { name, ott, first, last, span, rank: (self && (self.taxon_rank || self.accepted_rank)) || 'species' });
    }

    // One new tip under host, placed by its classification
    function addLeaf(host, sp) {
        const i = N++;
        for (const key of ['name', 'parent', 'rank', 'common', 'ott', 'age', 'dated', 'tips', 'spp', 'sppLog', 'sppEst', 'darkLo', 'darkHi', 'other', 'crown', 'first', 'last', 'placed', 'fossilFrom', 'ci', 'crownCi', 'firstAside']) D[key].push(null);
        D.name[i] = sp.name; D.parent[i] = host; D.rank[i] = rankIndex(sp.rank); D.ott[i] = sp.ott || 0;
        D.common[i] = commonByOtt.get(sp.ott) || ''; D.tips[i] = 1; D.other[i] = '0'; D.crown[i] = 0; D.placed[i] = 'x';
        D.first[i] = sp.first; D.last[i] = sp.last; D.spp[i] = sp.last != null ? 0 : 1; D.sppLog[i] = sp.last != null ? null : 0; D.sppEst[i] = '0';
        if (sp.span && sp.span.length) fossilSpan.set(i, sp.span);
        D.age[i] = Math.min(sp.last != null ? sp.last : 0, D.age[host] * 0.97); D.dated[i] = sp.last != null ? 4 : 2;
        kids.push([]); kids[host].push(i); leaves.push(1); group.push(group[host]); nodeId.push(sp.ott ? `ott${sp.ott}` : '');
        repName.push(sp.name); y0.push(0); y1.push(0); ymid.push(0);
        tier.set(i, tier.get(host) || { T: D.age[host], n: 2 });
        expanding.set(i, 'done');
        addEntry(i, sp.name, 'latin');
        layout(); colorNodes();
        const thin = y1[i] - y0[i];
        if (thin > 0) { kMax = Math.min(MAX_ZOOM, Math.max(kMax, MAX_LEAF_PX / (base * thin))); zoom.scaleExtent([1, kMax]); }
        return i;
    }
    function busy(text) {
        const out = $('#compare-result');
        out.innerHTML = text ? `<span class="busy">${esc(text)}</span>` : '';
        if (!text) compareChanged();
    }

    // The chart gives up the height of everything above it (header, toolbar, selection panel),
    // so its time axis sits above the site bar on first load. Resizing here, before any zoom
    // starts, keeps the resize from cutting that zoom short.
    function fitStage() {
        const top = stage.getBoundingClientRect().top + window.scrollY;
        document.documentElement.style.setProperty('--stage-top', `${Math.round(top)}px`);
        resize();
    }

    // Select a group, or take it out of the selection. From search the view moves to fit
    // the selection; from a click on the chart it stays put (the reader is finding their way).
    function select(i, refit = false) {
        if (D.other[i] === '1') return;
        if (extinct(i) && state.life !== 'all') setLife('all');
        const at = state.compare.indexOf(i);
        if (at >= 0) state.compare.splice(at, 1);
        else if (state.compare.length < MAX_COMPARE) state.compare.push(i);
        else note = `Up to ${MAX_COMPARE} at once: take one out (× on its chip) to add ${display(i)}.`;
        compareChanged(refit);
    }
    function fitTree() {
        const sel = state.compare;
        if (!sel.length) return;
        if (sel.length === 1) {   // a group itself; a single lineage among its nearest relatives
            const i = sel[0], split = kids[i].length ? i : splitOf(i);
            zoomTo(split > 0 && !kids[i].length ? D.parent[split] : split);
            return;
        }
        if (sel.includes(ties.mrca)) { zoomTo(ties.mrca); return; }   // one holds the rest: show it
        // The selected lines' own band, with a margin in proportion to it (never a fixed one: deep
        // inside a family the whole selection may be a millionth of the tree's height)
        const lo = Math.min(...sel.map(i => y0[i])), hi = Math.max(...sel.map(i => y1[i])), pad = (hi - lo) * 0.15;
        zoomToRange(Math.max(0, lo - pad), Math.min(1, hi + pad));
    }

    // After the selection changes: the chips, the written answer, the URL, the view
    let wasChosen = new Set();
    function compareChanged(refit) {
        computeTies();
        const sel = state.compare;
        // A silhouette that failed for a passing reason gets a fresh try when its group is chosen again
        for (const i of sel) {
            const p = portraits.get(i);
            if (p && p.state === 'none' && !p.final && !wasChosen.has(i)) portraits.delete(i);
        }
        wasChosen = new Set(sel);
        $('#chips').innerHTML = sel.map(i => `<li><i style="background:${nodeColor[i]}"></i>${esc(shownName(i))}${D.common[i] ? ` <span class="sub">${esc(D.common[i])}</span>` : ''}<button type="button" data-node="${i}" aria-label="Deselect ${esc(display(i))}">×</button></li>`).join('');
        $('#compare-tools').hidden = !sel.length;
        $('#compare').classList.toggle('empty', !sel.length);
        const out = $('#compare-result');
        const names = list => list.map(i => esc(D.common[i] || display(i)));
        const and = a => a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
        // The lines beside i's own at v, by name (none past two: "3 lines"); living ones only, if asked
        const relatives = (i, v, living) => {
            let c = i;
            while (D.parent[c] !== v && c > 0) c = D.parent[c];
            const r = kids[v].filter(k => k !== c && y1[k] > y0[k] && (!living || !extinct(k)));
            return r.length > 2 ? [`${r.length} lines`] : r.map(k => esc(D.common[k] || display(k)));
        };
        if (!sel.length) {
            out.innerHTML = `Search, or click any branch, to select it. Select two or more to see where they meet. Try `
                + EXAMPLES.map(([a, b]) => `<button type="button" class="try" data-try="${esc(a)}|${esc(b)}">${esc(a)} &amp; ${esc(b)}</button>`).join(' ');
        } else if (sel.length === 1) {
            const i = sel[0], p = D.parent[i] >= 0 ? splitOf(i) : -1, its = isPlural(i) ? 'their' : 'its';
            // A living lineage whose nearest relatives are all extinct (the Neanderthal, for us)
            // also says when it split from its nearest living ones
            const live = p >= 0 && !extinct(i) ? livingSplit(i) : p, gone = live !== p ? relatives(i, p) : [];
            out.innerHTML = `<b>${names([i])[0]}</b>`
                + (p >= 0 ? ` branched off from ${its} nearest relatives${gone.length ? `, now extinct (${and(gone)}),` : ''} ${aboutAge(D.age[p])}${rangeWords(p)} <span class="note">(${dateBasis(p).replace(/ \(.*\)$/, '')})</span>`
                    + (live > 0 && live !== p ? `, and from ${its} nearest living relatives${relatives(i, live, true).length ? ` (${and(relatives(i, live, true))})` : ''} ${aboutAge(D.age[live])}${rangeWords(live)}` : '')
                    + `${unresolvedAt(p) ? ` <span class="note">(one of ${unresolvedAt(p)} lines that branch from that point: which of them are ${its} nearest relatives is unresolved)</span>` : ''}.` : '.')
                + tally(i, its) + ' Select another to see where they meet.';
        } else if (sel.includes(ties.mrca)) {   // a group and members of it
            const m = ties.mrca, inside = sel.filter(i => i !== m);
            out.innerHTML = `<b>${and(names(inside))}</b> ${inside.length > 1 || isPlural(inside[0]) ? 'are' : 'is'} among the <b>${names([m])[0]}</b>, whose last common ancestor lived ${aboutAge(D.age[m])}${rangeWords(m)}.`
                + (inside.length === 1 && splitOf(inside[0]) >= 0 ? ` ${names(inside)[0][0].toUpperCase() + names(inside)[0].slice(1)} split from ${isPlural(inside[0]) ? 'their' : 'its'} nearest relatives ${aboutAge(D.age[splitOf(inside[0])], false)}.` : '');
        } else {
            const m = ties.mrca;
            const others = ties.joins.filter(j => j.v !== m);
            // Fossils hung from the ancestor itself by classification, far younger than it (a Neanderthal under Homo)
            const placedBy = sel.filter(i => D.placed[i] === 'x' && D.parent[i] === m && D.first[i] != null && D.first[i] < D.age[m] * 0.25);
            out.innerHTML = `The last common ancestor of ${sel.length === 2 ? and(names(sel)) : `all ${sel.length}`} lived ${aboutAge(D.age[m])}${rangeWords(m)}`
                + ` (${dateBasis(m).replace(/ \(.*\)$/, '')}), `
                + (D.name[m] ? `the ancestor of all <strong>${esc(plainName(m))}</strong>.` : `${esc(splitWords(m, sel.length === 2 ? sel : []))}.`)
                + (m === 0 && !sel.some(i => group[i] === 'bacteria') && sel.some(i => group[i] === 'archaea')
                    ? ' <span class="note">But many biologists now place eukaryotes inside the Archaea, which would make this ancestor about two billion years old.</span>'
                    : D.age[m] > 600 ? ' <span class="note">Dates this deep are uncertain by hundreds of millions of years.</span>' : '')
                + (m > 0 && unresolvedAt(m) && !hasOwn(m) ? ` <span class="note">The tree leaves this branch point unresolved (${unresolvedAt(m)} lines branch from it), so it doesn’t say how they’re related within ${D.name[m] ? esc(D.name[m]) : 'it'}: they may have split more recently than this.</span>` : '')
                + (placedBy.length ? ` <span class="note">${and(names(placedBy))} ${placedBy.length > 1 ? 'aren’t' : 'isn’t'} in any published tree, so ${placedBy.length > 1 ? 'they hang' : 'it hangs'} from ${placedBy.length > 1 ? 'their' : 'its'} group: the real split may be more recent.</span>` : '')
                + (others.length ? ` <span class="joins">Along the way, ${others.slice(0, 2).map(j => `<b>${and(names(j.under))}</b> met ${fmtAgeWords(D.age[j.v])}${D.name[j.v] ? `, in the ancestor of all ${esc(plainName(j.v))}` : ''}`).join('; ')}`
                    + (others.length > 2 ? `; ${others.length - 2} more marked on the chart` : '') + '.</span>' : '');
        }
        if (note) { out.insertAdjacentHTML('beforeend', ` <span class="note">${esc(note)}</span>`); note = ''; }
        writeHash();
        showCredits();
        fitStage();
        if (refit) fitTree();
        draw();
    }

    // What's known of a selected group, against what's thought to exist
    function tally(i, its = 'its') {
        if (extinct(i)) return D.tips[i] > 1 ? ` Known from ${fmtInt(D.tips[i])} fossil species, a small fraction of those that lived: most species never fossilise.` : '';
        const share = namedShare(i);
        if (share == null || D.spp[i] < 2) return '';
        const total = D.spp[i] / share;
        return ` Science has named <strong>${fmtCount(Math.log10(D.spp[i]))}</strong> of ${its} living species, of about ${fmtCount(Math.log10(total))} thought to exist${share < 0.5 ? ` (1 in ${fmtInt(Math.round(1 / share))})` : ''}.`;
    }

    // ---------- cite and download ----------

    function citation() {
        const year = (META.built || '').slice(0, 4);
        return `Wall, M. (${year}). Dendrogram: every family of life on one timeline. https://mac-wall.com/dendrogram/ `
            + `(data built ${META.built}; Open Tree of Life ${META.synth}, OTT ${META.taxonomy}; TimeTree; Paleobiology Database).`;
    }
    // Every download opens with where its data comes from and on what terms (lines starting
    // with #, which most spreadsheet and data tools can be told to skip)
    function attribution() {
        return [`# Dendrogram (https://mac-wall.com/dendrogram/) data built ${META.built}`,
            `# Sources: Open Tree of Life (synthesis ${META.synth}; taxonomy ${META.taxonomy}; https://tree.opentreeoflife.org); TimeTree (https://timetree.org); NCBI Taxonomy (common names; https://www.ncbi.nlm.nih.gov/taxonomy)`,
            '# Fossil data from the Paleobiology Database (https://paleobiodb.org) under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); this file is derived from it'];
    }
    function csv(rows) {
        const cell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
        return [...attribution(), ...rows.map(r => r.map(cell).join(','))].join('\n') + '\n';
    }
    function download(name, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
        a.download = name;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const round = (v, d = 3) => v == null || !Number.isFinite(v) ? null : +v.toFixed(d);
    // The selection, a row each, then their common ancestor
    function selectionRows() {
        const rows = [['name', 'common_name', 'rank', 'ott_id', 'status', 'first_fossil_ma', 'last_fossil_ma', 'split_off_ma', 'split_off_ci_low_ma', 'split_off_ci_high_ma', 'split_off_median_ma', 'split_off_basis', 'split_off_source',
            ...SPECIES_COLUMNS, 'named_share', ...PUBLISHED_COLUMNS, 'placed_by', 'path']];
        for (const i of state.compare) {
            const p = D.parent[i] >= 0 ? splitOf(i) : -1, share = namedShare(i), path = [];
            for (let v = D.parent[i]; v > 0; v = D.parent[v]) if (D.name[v]) path.unshift(D.name[v]);
            rows.push([display(i), D.common[i], rankName(i), D.ott[i] || null, extinct(i) ? 'extinct' : 'living', round(D.first[i]), round(D.last[i], 4),
                p >= 0 ? round(D.age[p], 2) : null, ...(p >= 0 && ciOf(p) ? ciOf(p) : [null, null, null]),
                p >= 0 ? dateBasis(p) : null, p >= 0 ? dateSource(p) : null, ...speciesCells(i), share == null ? null : round(share, 3),
                ...publishedCells(i), D.placed[i] === 'x' ? 'classification' : 'phylogeny', path.join(' > ')]);
        }
        const m = ties.mrca;
        if (m >= 0) rows.push([`common ancestor: ${ancestorName(m)}`, '', rankName(m), D.ott[m] || null, '', null, null, round(D.age[m], 2),
            ...(ciOf(m) || [null, null, null]), dateBasis(m), dateSource(m), ...speciesCells(m), null, ...publishedCells(m), '', '']);
        return rows;
    }
    // The whole tree as built (families and everything above them), a row a node
    function treeRows() {
        const rows = [['id', 'parent_id', 'name', 'common_name', 'rank', 'ott_id', 'age_ma', 'age_ci_low_ma', 'age_ci_high_ma', 'age_median_ma', 'age_basis', 'age_source', 'status', 'first_fossil_ma', 'last_fossil_ma',
            ...SPECIES_COLUMNS, ...PUBLISHED_COLUMNS, 'placed_by']];
        for (let i = 0; i < N0; i++) rows.push([i, D.parent[i], D.name[i], D.common[i], rankName(i), D.ott[i] || null, round(D.age[i], 2),
            ...(ciOf(i) || [null, null, null]), dateBasis(i), dateSource(i),
            extinct(i) ? 'extinct' : 'living', round(D.first[i]), round(D.last[i], 4), ...speciesCells(i), ...publishedCells(i),
            D.placed[i] === 'x' ? 'classification' : 'phylogeny']);
        return rows;
    }
    // Species, as counts: described (living, or for the extinct their fossil species), and the
    // undescribed estimate under each setting, each with where it comes from
    const SPECIES_COLUMNS = ['described_species', 'described_species_source', 'undescribed_species_conservative', 'undescribed_species_liberal', 'undescribed_source'];
    function speciesCells(i) {
        const n = extinct(i) ? D.tips[i] : D.spp[i], count = v => v == null ? 0 : Math.round(Math.pow(10, v));
        return [n || null, sppBasis(i), extinct(i) ? null : count(D.darkLo[i]), extinct(i) ? null : count(D.darkHi[i]), extinct(i) ? null : speciesBasis(i)];
    }
    // Figures published for the group itself (empty for the rest): how many are alive, in what
    // units, and its biomass in gigatonnes of carbon
    const PUBLISHED_COLUMNS = ['alive_now', 'alive_now_unit', 'alive_now_source', 'biomass_gt_carbon', 'biomass_source'];
    function publishedCells(i) {
        const pop = anchorsBy.get(`${i}:individuals`), mass = anchorsBy.get(`${i}:biomass`);
        return [pop ? midOf(pop) : null, pop ? pop.unit || 'individuals' : null, pop ? `${pop.confidence}: ${pop.source}` : null,
            mass ? midOf(mass) : null, mass ? `${mass.confidence}: ${mass.source}` : null];
    }

    // The selection lives in the address (#compare=ott ids), so it can be shared; ids below
    // the loaded tree are loaded the way down to. An id found by an everyday word carries
    // it (#compare=247341:dog), so the link opens with the words its sender saw.
    function hashOf(sel) {
        const ids = sel.filter(i => D.ott[i]).map(i => picked.has(i) && picked.get(i).label === D.common[i] && D.common[i] !== commonByOtt.get(D.ott[i])
            ? `${D.ott[i]}:${encodeURIComponent(D.common[i])}` : D.ott[i]);
        return ids.length ? `#compare=${ids.join(',')}` : '';
    }
    function writeHash() {
        const want = hashOf(state.compare);
        if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
    }
    let hashReads = 0;   // (a later address wins over one still loading)
    async function readHash() {
        const m = location.hash.match(/^#compare=(\d+(?::[^,:]*)?(?:,\d+(?::[^,:]*)?)*)$/);
        if (!m) {   // (back to the page with nothing selected)
            if (!location.hash && state.compare.length) { state.compare = []; compareChanged(); }
            return;
        }
        if (location.hash === hashOf(state.compare)) return;
        const ticket = ++hashReads;
        const asked = new Map();   // ott -> the word it was found by, if any
        const parts = m[1].split(',');
        for (const part of parts) {
            const [o, word] = part.split(':');
            if (asked.size < MAX_COMPARE && !asked.has(+o)) { try { asked.set(+o, word ? decodeURIComponent(word) : ''); } catch (e) { asked.set(+o, ''); } }
        }
        const otts = [...asked.keys()];
        if (otts.some(o => nodeOfOtt(o) < 0)) busy('Loading the shared selection…');
        if ([...asked.values()].some(Boolean)) await loadNames();
        const found = await Promise.all(otts.map(o => reach(o)));
        if (ticket !== hashReads) return;
        // Only a word the names list has for that species is taken from the address
        found.forEach((i, k) => {
            const e = asked.get(otts[k]) && searchIndex.find(e => e.kind === 'species' && e.ott === otts[k] && e.label === asked.get(otts[k]));
            if (i >= 0 && e && D.ott[i] === e.ott) nameAs(i, e);
        });
        state.compare = [...new Set(found.filter(i => i >= 0 && D.name[i]))];
        if (new Set(parts.map(x => x.split(':')[0])).size > MAX_COMPARE) note = `The link names ${new Set(parts.map(x => x.split(':')[0])).size} groups; up to ${MAX_COMPARE} can be selected at once, so the first ${MAX_COMPARE} are shown.`;
        compareChanged(true);
    }

    // ---------- legend, table, sources ----------

    function buildLegend() {
        // Groups in the order they stack on screen
        const seen = [];
        const stack = [0];
        while (stack.length) {
            const v = stack.pop();
            if (!kids[v].length || group[v] !== 'other') { if (!seen.includes(group[v])) seen.push(group[v]); continue; }
            for (let k = kids[v].length - 1; k >= 0; k--) stack.push(kids[v][k]);
        }
        if (!seen.includes('other')) seen.push('other');
        $('#legend-groups').innerHTML = seen.map(g => `<li><i style="background:${groupSwatch(g)}"></i><span>${esc(GROUPS[g].label)}<small>${esc(GROUPS[g].pigment)}</small></span></li>`).join('');

        const m = METRICS[state.metric];
        $('#legend-weights-label').textContent = m.label;
        const svg = $('#legend-weights');
        svg.innerHTML = m.legend.map((v, k) => {
            const x = 6 + k * 72, w = widthForLog(v);
            const label = fmtInt(Math.pow(10, v));
            return `<line x1="${x}" x2="${x + 52}" y1="14" y2="14" stroke="${colors['text-2']}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`
                + `<text x="${x}" y="38">${label}</text>`;
        }).join('');
    }

    function buildTable(data) {
        const rows = new Set(data.anchors.map(a => a.node));
        for (const def of Object.values(GROUPS)) {
            if (!def.clade) continue;
            const i = D.name.indexOf(def.clade);
            if (i >= 0) rows.add(i);
        }
        const tb = $('#table tbody');
        tb.innerHTML = [...rows].sort((a, b) => a - b).map(i => {
            const lo = D.darkLo[i], hi = D.darkHi[i];
            const pop = anchorsBy.get(`${i}:individuals`), mass = anchorsBy.get(`${i}:biomass`);
            return `<tr><td><button type="button" data-node="${i}">${esc(D.name[i])}</button>${D.common[i] ? ` <span class="sub">${esc(D.common[i])}</span>` : ''}</td>`
                + `<td class="num">${fmtInt(D.spp[i])}</td>`
                + `<td class="num">${lo == null ? '0' : fmtCount(lo)} to ${hi == null ? '0' : fmtCount(hi)}</td>`
                + `<td class="num">${pop ? `${fmtCount(Math.log10(midOf(pop)))} ${esc(UNIT_WORDS[pop.unit] || pop.unit)}` : '—'}</td>`
                + `<td class="num">${mass ? fmtMass(Math.log10(midOf(mass))).replace(' of carbon', '') : '—'}</td></tr>`;
        }).join('');
        tb.addEventListener('click', e => {
            const b = e.target.closest('button[data-node]');
            if (!b) return;
            const i = +b.dataset.node;
            stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
            state.flash = i;
            zoomTo(kids[i].length ? i : D.parent[i], () => drawTop());
        });
    }

    function buildSources(data) {
        const m = data.meta;
        $('#sources').innerHTML = `Built ${esc(m.built)} from the ${esc(m.sources.tree)}, ${esc(m.sources.names)}, and ${esc(m.sources.dates)}.`;
        const metric = a => a.metric === 'individuals' ? `Alive now (${a.unit || 'individuals'})` : a.metric === 'biomass' ? 'Biomass (Gt C)' : 'Total species';
        const num = v => v == null ? '' : v >= 1e5 || v < 0.01 ? v.toExponential(1).replace('e+', 'e') : String(v);
        $('#figures tbody').innerHTML = data.anchors.map(a => {
            const range = a.low != null && a.high != null ? `${num(a.low)} to ${num(a.high)}` : '';
            return `<tr><td>${esc(a.name)}</td><td>${esc(metric(a))}</td><td class="num">${esc(num(a.value) || range)}</td>`
                + `<td>${esc(a.value != null ? range : '')}</td><td>${esc(a.confidence)}</td><td>${esc(a.source)}</td></tr>`;
        }).join('');
    }
})();
