import re

with open("paper test.html", "r") as f:
    content = f.read()

new_style = """    <style>
        /* THEME VARIABLES - Subtle Hyper-Realistic Paper */
        :root[data-theme="light"] {
            --bg-color: #d8d4c7; /* Muted, warm cardstock to fix blinding brightness */
            --text-color: #33322e; /* Softened charcoal ink */
            --accent-color: #a82b2b; /* Slightly muted, deep stamped red */
            --line-color: rgba(0, 0, 0, 0.1);
            --p-color: #52504c;
            --strong-color: #1a1a18;
            --nav-hover-text: #f5f5f5;
            --watermark-rgb: 0, 0, 0;
            --highlight-color: rgba(240, 219, 79, 0.6); /* Yellow marker */
            
            /* Physical Depth Variables */
            --press-light: rgba(255, 255, 255, 0.7);
            --press-dark: rgba(0, 0, 0, 0.15);
            --blend: multiply;
        }

        :root[data-theme="dark"] {
            --bg-color: #181716; /* Richer, darker matte charcoal */
            --text-color: rgba(200, 195, 185, 0.75); /* Softer text to reduce harsh contrast */
            --accent-color: #d13030; /* Subdued red for dark mode */
            --line-color: rgba(255, 255, 255, 0.06);
            --p-color: #8f8d88;
            --strong-color: rgba(230, 225, 215, 0.9);
            --nav-hover-text: #181716;
            --watermark-rgb: 255, 255, 255;
            --highlight-color: rgba(255, 255, 255, 0.15); /* White highlight on dark */

            /* Physical Depth Variables */
            --press-light: rgba(255, 255, 255, 0.04); 
            --press-dark: rgba(0, 0, 0, 0.9); 
            --blend: normal;
        }

        * {
            box-sizing: border-box;
            /* Ultra slow transition on global elements for heavy/luxurious feel */
            transition: background-color 0.8s ease, color 0.8s ease, border-color 0.8s ease, text-shadow 0.8s ease;
        }

        /* TEXT SELECTION - Realistic Highlighter */
        ::selection {
            background: var(--highlight-color);
            color: inherit;
            text-shadow: none; /* Removes imprint depth when highlighted */
        }

        body {
            background-color: var(--bg-color);
            /* Very subtle, high-frequency noise that registers strictly as material grain */
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.02'/%3E%3C/svg%3E");
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

        /* SUBTLE AMBIENT BREATHING - Extremely slow light shift */
        @keyframes ambientShift {
            0% { background-position: 0% 50%; opacity: 0.3; }
            50% { background-position: 100% 50%; opacity: 0.6; }
            100% { background-position: 0% 50%; opacity: 0.3; }
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            /* A very gentle gradient that acts as a room light source */
            background: linear-gradient(120deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.03) 50%, rgba(255,255,255,0.02) 100%);
            background-size: 200% 200%;
            animation: ambientShift 45s ease-in-out infinite;
            pointer-events: none;
            z-index: 9999;
            mix-blend-mode: overlay;
        }

        /* TACTILE IMPRINT UTILITY - Extremely subtle sub-pixel shadows */
        .imprint {
            mix-blend-mode: var(--blend);
            text-shadow: 
                0.5px 0.5px 0px var(--press-light), 
                -0.5px -0.5px 0px var(--press-dark);
        }

        /* THEME TOGGLE BUTTON - Machined hardware feel */
        #theme-toggle {
            position: absolute;
            top: 2rem;
            right: 3rem;
            background: transparent;
            border: 1px solid var(--line-color);
            color: var(--text-color);
            font-size: 1.2rem;
            cursor: pointer;
            padding: 8px 12px;
            z-index: 10;
            box-shadow: inset 1px 1px 2px var(--press-dark), 1px 1px 0px var(--press-light);
            border-radius: 2px;
            /* Slower transition for a more deliberate feel */
            transition: all 0.6s ease;
        }

        #theme-toggle:hover {
            color: var(--accent-color);
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
            z-index: -1;
            pointer-events: none;
            mix-blend-mode: var(--blend);
            /* Very slow pulsing of the watermark ink */
            animation: inkPulse 30s ease-in-out infinite;
        }
        
        @keyframes inkPulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
        }

        /* TYPOGRAPHY */
        h1 {
            font-family: 'Oswald', sans-serif;
            font-size: clamp(4rem, 10vw, 12rem); 
            text-transform: uppercase;
            margin: 0;
            line-height: 0.9;
            letter-spacing: -2px;
            
            /* Physical painted stripe */
            border-left: 10px solid var(--accent-color);
            box-shadow: inset 1px 0px 2px rgba(0,0,0,0.15);
            
            padding-left: 2rem;
            animation: slideIn 1.2s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
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
            animation: slideIn 1.2s cubic-bezier(0.1, 0.8, 0.2, 1) 0.1s forwards;
            opacity: 0;
        }

        /* THE "DATA" SECTION */
        .data-block {
            margin-top: 4rem;
            margin-left: 2.5rem;
            max-width: 600px;
            animation: slideIn 1.2s cubic-bezier(0.1, 0.8, 0.2, 1) 0.2s forwards;
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
            /* Engraved groove styling */
            border: 1px solid var(--press-dark);
            box-shadow: 1px 1px 0px var(--press-light);
            
            padding: 1.5rem;
            /* Extremely slow, luxurious transition for heavy mechanical feel */
            transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-family: 'Oswald', sans-serif;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 1.2rem;
        }

        /* HOVER EFFECTS - Subtle physical depression */
        .nav-item:hover {
            background-color: var(--accent-color);
            border-color: var(--accent-color);
            color: var(--nav-hover-text);
            /* Press straight down into the page */
            transform: translateY(2px); 
            box-shadow: inset 1px 2px 4px rgba(0,0,0,0.3);
            text-shadow: none;
        }

        .nav-item i {
            font-size: 1rem;
            color: var(--accent-color);
            /* Match the slow transition */
            transition: color 0.8s;
        }

        .nav-item:hover i {
            color: var(--nav-hover-text);
        }

        /* ANIMATION */
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-30px); }
            to { opacity: 1; transform: translateX(0); }
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

with open("paper test.html", "w") as f:
    f.write(content)
print("Updated paper test.html with subtle life successfully")
