import re

with open("paper test.html", "r") as f:
    content = f.read()

# Replace Style block
new_style = """    <style>
        /* THEME VARIABLES - Subtle Hyper-Realistic Paper */
        :root[data-theme="light"] {
            --bg-color: #dfdbd2; /* Warmer, softer cardstock */
            --text-color: #2b2a28; /* Dark ink */
            --accent-color: #b32626; /* Deep stamped red */
            --line-color: rgba(0, 0, 0, 0.1);
            --p-color: #4a4946;
            --strong-color: #111;
            --nav-hover-text: #fff;
            --nav-hover-bg: #b32626;
            --watermark-rgb: 0, 0, 0;
            
            /* Subtle Depth Variables */
            --press-light: rgba(255, 255, 255, 0.8);
            --press-dark: rgba(0, 0, 0, 0.15);
            --blend: multiply;
            --ambient-light: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%);
        }

        :root[data-theme="dark"] {
            --bg-color: #1a1918; /* Deep matte charcoal */
            --text-color: rgba(230, 225, 215, 0.85); /* Slightly transparent metallic ink */
            --accent-color: #e83535; 
            --line-color: rgba(255, 255, 255, 0.05);
            --p-color: #a3a19c;
            --strong-color: #fff;
            --nav-hover-text: #fff;
            --nav-hover-bg: #e83535;
            --watermark-rgb: 255, 255, 255;

            /* Subtle Depth Variables */
            --press-light: rgba(255, 255, 255, 0.05); 
            --press-dark: rgba(0, 0, 0, 0.8); 
            --blend: normal; /* Light ink doesn't multiply on dark bg */
            --ambient-light: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%);
        }

        * {
            box-sizing: border-box;
            transition: background-color 0.4s ease, color 0.4s ease, border-color 0.4s ease, text-shadow 0.4s ease;
        }

        body {
            background-color: var(--bg-color);
            /* Ultra-fine noise for realistic fibers */
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='3.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
            color: var(--text-color);
            font-family: 'Inter', sans-serif;
            margin: 0;
            height: 100vh;
            overflow: hidden; 
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
        }

        /* Ambient Lighting Overlay */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: var(--ambient-light);
            pointer-events: none; /* Let clicks pass through */
            z-index: 9999;
            mix-blend-mode: overlay;
        }

        /* TACTILE IMPRINT UTILITY - Sub-pixel shadows */
        .imprint {
            mix-blend-mode: var(--blend);
            text-shadow: 
                0.5px 0.5px 0px var(--press-light), 
                -0.5px -0.5px 0px var(--press-dark);
        }

        /* THEME TOGGLE BUTTON - Frosted Glass */
        #theme-toggle {
            position: absolute;
            top: 2rem;
            right: 3rem;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid var(--line-color);
            color: var(--text-color);
            font-size: 1.2rem;
            cursor: pointer;
            padding: 8px 12px;
            z-index: 10000;
            border-radius: 6px; /* Modern rounded corners */
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            transition: all 0.3s ease;
        }

        #theme-toggle:hover {
            color: var(--accent-color);
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-1px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.08);
        }

        :root[data-theme="dark"] #theme-toggle {
            background: rgba(0, 0, 0, 0.2);
        }
        :root[data-theme="dark"] #theme-toggle:hover {
            background: rgba(0, 0, 0, 0.4);
        }

        .container {
            width: 85%;
            max-width: 1400px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
        }

        /* BACKGROUND ELEMENT - Pressed Watermark */
        .watermark {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 0;
            pointer-events: none;
            mix-blend-mode: var(--blend);
        }

        /* TYPOGRAPHY */
        h1 {
            font-family: 'Oswald', sans-serif;
            font-size: clamp(4rem, 10vw, 12rem); 
            text-transform: uppercase;
            margin: 0;
            line-height: 0.9;
            letter-spacing: -2px;
            
            border-left: 10px solid var(--accent-color);
            box-shadow: inset 1px 0px 1px rgba(0,0,0,0.1);
            
            padding-left: 2rem;
            animation: slideIn 1.5s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
            opacity: 0;
        }

        h2 {
            font-family: 'Inter', sans-serif;
            font-weight: 300;
            text-transform: uppercase;
            letter-spacing: 0.2rem;
            font-size: clamp(1rem, 2vw, 1.5rem);
            margin-top: 1rem;
            margin-left: 2.5rem; 
            color: var(--text-color);
            animation: slideIn 1.5s cubic-bezier(0.1, 0.8, 0.2, 1) 0.1s forwards;
            opacity: 0;
        }

        /* THE "DATA" SECTION */
        .data-block {
            margin-top: 4rem;
            margin-left: 2.5rem;
            max-width: 600px;
            animation: slideIn 1.5s cubic-bezier(0.1, 0.8, 0.2, 1) 0.2s forwards;
            opacity: 0;
        }

        p {
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 2rem;
            color: var(--p-color);
            mix-blend-mode: var(--blend);
        }

        strong {
            color: var(--strong-color);
            font-weight: 600;
        }

        /* NAVIGATION LINKS */
        .nav-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr); 
            gap: 20px;
            margin-top: 3rem;
        }

        .nav-item {
            text-decoration: none;
            color: var(--text-color);
            
            border: 1px solid var(--line-color);
            
            padding: 1.5rem;
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-family: 'Oswald', sans-serif;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 1.2rem;
            position: relative;
            overflow: hidden;
            border-radius: 4px;
        }

        /* Subtle glowing hover effect */
        .nav-item::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: var(--nav-hover-bg);
            opacity: 0;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: width 0.4s ease, height 0.4s ease, opacity 0.4s ease;
            z-index: -1;
        }

        .nav-item:hover {
            color: var(--nav-hover-text);
            border-color: transparent;
            text-shadow: none;
            transform: translateY(-2px); /* Slight modern lift */
            box-shadow: 0 10px 20px rgba(0,0,0,0.05);
        }

        .nav-item:hover::after {
            width: 300%;
            height: 300%;
            opacity: 1;
        }

        .nav-item i {
            font-size: 1rem;
            color: var(--accent-color);
            transition: color 0.3s;
        }

        .nav-item:hover i {
            color: var(--nav-hover-text);
        }

        /* ANIMATION */
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); filter: blur(2px); }
            to { opacity: 1; transform: translateX(0); filter: blur(0); }
        }

        /* MOBILE RESPONSIVE LAYOUT */
        @media (max-width: 768px) {
            body {
                height: auto;
                overflow-y: auto;
                padding-bottom: 50px;
                padding-top: 60px; 
                justify-content: flex-start;
            }

            #theme-toggle {
                top: 1rem;
                right: 1.5rem;
            }

            .nav-grid {
                grid-template-columns: 1fr; 
                gap: 15px;
            }

            .data-block {
                margin-left: 0; 
                padding-left: 2.5rem; 
                padding-right: 2.5rem;
            }
        }
    </style>"""

content = re.sub(r'    <style>.*?</style>', new_style, content, flags=re.DOTALL)

# Replace SVG watermark
old_svg = """    <!-- Watermark updated to use RGB CSS variables for dynamic opacity -->
    <svg class="watermark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="15" height="100" fill="rgba(var(--watermark-rgb), 0.02)" />
        <rect x="85" y="0" width="14" height="100" fill="rgba(var(--watermark-rgb), 0.015)" />
        <polygon points="15,0  50,100  85,0  65,0  50,50  35,0" fill="rgba(var(--watermark-rgb), 0.012)" />
        <rect x="101" y="0" width="14" height="100" fill="rgba(var(--watermark-rgb), 0.01)" />
        <rect x="185" y="0" width="15" height="100" fill="rgba(var(--watermark-rgb), 0.008)" />
        <polygon points="115,100  150,0  185,100  165,100  150,50  135,100" fill="rgba(var(--watermark-rgb), 0.006)" />
    </svg>"""

new_svg = """    <!-- Very subtle watermark -->
    <svg class="watermark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="15" height="100" fill="rgba(var(--watermark-rgb), 0.01)" />
        <rect x="85" y="0" width="14" height="100" fill="rgba(var(--watermark-rgb), 0.008)" />
        <polygon points="15,0  50,100  85,0  65,0  50,50  35,0" fill="rgba(var(--watermark-rgb), 0.006)" />
        <rect x="101" y="0" width="14" height="100" fill="rgba(var(--watermark-rgb), 0.005)" />
        <rect x="185" y="0" width="15" height="100" fill="rgba(var(--watermark-rgb), 0.004)" />
        <polygon points="115,100  150,0  185,100  165,100  150,50  135,100" fill="rgba(var(--watermark-rgb), 0.003)" />
    </svg>"""
content = content.replace(old_svg, new_svg)

# Replace Script
old_script = """    <!-- Theme Persistence Script -->
    <script>
        const themeToggle = document.getElementById('theme-toggle');
        
        function initTheme() {
            const savedTheme = localStorage.getItem('portfolio-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('portfolio-theme', newTheme);
        });

        initTheme();
    </script>"""

new_script = """    <!-- Theme Persistence Script and Interactions -->
    <script>
        const themeToggle = document.getElementById('theme-toggle');
        
        function initTheme() {
            const savedTheme = localStorage.getItem('portfolio-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('portfolio-theme', newTheme);
        });

        initTheme();

        // Subtle Ambient Light Tracking
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            document.documentElement.style.setProperty('--mouse-x', `${x}%`);
            document.documentElement.style.setProperty('--mouse-y', `${y}%`);
        });
    </script>"""
content = content.replace(old_script, new_script)

with open("paper test.html", "w") as f:
    f.write(content)
print("Updated paper test.html successfully")
