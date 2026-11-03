// js/core/theme-boot.js
(function () {
    'use strict';

    var STORAGE_KEY = 'stillwaters_theme';
    var THEMES = [
        'dark', 'light', 'vaporwave', 'pastel', 'carnival', 'maximal', 
        'gits', 'nouveau', 'ukiyo-e', 'nature', 'kmt', 'gaslight', 
        'grotesque', 'illuminated', 'discowing', 'choc-cake', 'dada', 
        'brutalist', 'orchestrion', 'rococo', 'nautical-tile'
    ];

    function getSavedTheme() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved && THEMES.indexOf(saved) !== -1) {
                return saved;
            }
        } catch (e) {}
        return null;
    }

    function applyTheme(id) {
        if (THEMES.indexOf(id) === -1) id = 'dark';
        document.documentElement.setAttribute('data-theme', id);
        try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
    }

    // 1. Apply theme immediately on load (prevents flash)
    var saved = getSavedTheme();
    if (saved) {
        applyTheme(saved);
    } else {
        // Default to OS preference if nothing is saved
        var mq = window.matchMedia('(prefers-color-scheme: light)');
        applyTheme(mq.matches ? 'light' : 'dark');
        
        // Listen for OS changes if no user preference is saved
        mq.addEventListener('change', function (ev) {
            if (!getSavedTheme()) {
                applyTheme(ev.matches ? 'light' : 'dark');
            }
        });
    }

    // 2. Expose global API so managers can build their dropdown menus
    window.ThemeSwitcher = {
        apply: applyTheme,
        getSaved: getSavedTheme,
        themes: THEMES.slice()
    };

})();
