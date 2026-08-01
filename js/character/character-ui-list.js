/**
 * =============================================================================
 * STILL WATERS - CHARACTER UI LIST (js/character/character-ui-list.js)
 * =============================================================================
 * 
 * UI rendering for character lists.
 * 
 * DEPENDENCIES:
 *   - character-queries.js (CharacterQueries)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - culture-queries.js (CultureQueries) - NEW
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getQueries() {
        return typeof window.CharacterQueries !== 'undefined' ? window.CharacterQueries : null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // NEW: Culture Helpers
    // =========================================================================

    function _getCultureName(cultureId) {
        if (typeof window.CultureState !== 'undefined' &&
            typeof window.CultureState.getCulture === 'function') {
            var culture = window.CultureState.getCulture(cultureId);
            return culture ? (culture.displayName || culture.name) : null;
        }
        return null;
    }

    function _getCultureIcon(cultureId) {
        if (typeof window.CultureState !== 'undefined' &&
            typeof window.CultureState.getCulture === 'function') {
            var culture = window.CultureState.getCulture(cultureId);
            return culture ? (culture.icon || '✦') : null;
        }
        return null;
    }

    // =========================================================================
    // 2. RENDER CHARACTER LIST
    // =========================================================================

    function renderCharacterList(containerId, options) {
        options = options || {};

        var container = typeof containerId === 'string' ?
            document.getElementById(containerId) :
            containerId;

        if (!container) {
            return false;
        }

        var queries = _getQueries();
        if (!queries) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">Character system not available</div>';
            return false;
        }

        var characters = options.filteredCharacters || queries.getAllCharacters();
        var onSelect = options.onSelect || null;
        var emptyMessage = options.emptyMessage || 'No characters found';
        var showStatus = options.showStatus !== undefined ? options.showStatus : true;
        var showLocation = options.showLocation !== undefined ? options.showLocation : true;
        var showAge = options.showAge !== undefined ? options.showAge : true;
        var showCulture = options.showCulture !== undefined ? options.showCulture : true;  // NEW

        if (!characters || characters.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">' + _escapeHtml(emptyMessage) + '</div>';
            return true;
        }

        var sorted = characters.slice().sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var html = '<div class="character-list" style="display:flex;flex-direction:column;gap:4px;">';

        for (var i = 0; i < sorted.length; i++) {
            var c = sorted[i];
            var age = _calculateAge(c.birthYear, c.isDeceased, c.deathYear);
            var isDeceased = c.isDeceased === true;

            var statusColor = isDeceased ? 'var(--dim)' : 'var(--success)';
            var statusText = isDeceased ? 'Deceased' : 'Living';

            var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');

            var rowClass = options.rowClass || 'character-row';
            var clickable = onSelect ? 'cursor:pointer;' : '';

            // NEW: Culture badge
            var cultureBadge = '';
            if (showCulture && c.cultureId) {
                var cultureName = _getCultureName(c.cultureId);
                var cultureIcon = _getCultureIcon(c.cultureId);
                if (cultureName) {
                    cultureBadge = '<span style="font-size:0.5rem;background:var(--bg2);padding:1px 6px;border-radius:10px;border:1px solid var(--border-light);margin-left:6px;">' +
                        (cultureIcon ? _escapeHtml(cultureIcon) + ' ' : '') +
                        _escapeHtml(cultureName) +
                        '</span>';
                }
            }

            html += '<div class="' + _escapeHtml(rowClass) + '" data-character-id="' + _escapeHtml(c.id) + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 12px;background:var(--bg3);border-radius:6px;' +
                (isDeceased ? 'opacity:0.6;' : '') +
                clickable +
                '">';

            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-weight:bold;font-size:0.8rem;">' +
                genderSymbol + ' ' +
                _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') +
                (isDeceased ? ' <span style="font-size:0.6rem;color:var(--dim);">†</span>' : '') +
                cultureBadge +
                '</div>';

            var details = [];
            if (showAge) details.push(age + 'y');
            if (showLocation && c.currentLocation) details.push(_escapeHtml(c.currentLocation));
            if (c.household) details.push('Household: ' + _escapeHtml(c.household));

            if (details.length > 0) {
                html += '<div style="font-size:0.6rem;color:var(--dim);">' + details.join(' · ') + '</div>';
            }

            html += '</div>';

            if (showStatus) {
                html += '<div style="font-size:0.6rem;color:' + statusColor + ';flex-shrink:0;margin-left:12px;">' +
                    statusText +
                    '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        if (onSelect) {
            var rows = container.querySelectorAll('.character-row');
            for (var i = 0; i < rows.length; i++) {
                (function(row) {
                    row.addEventListener('click', function() {
                        var id = this.dataset.characterId;
                        var queries = _getQueries();
                        if (queries) {
                            var character = queries.getCharacter(id);
                            if (character && onSelect) {
                                onSelect(character);
                            }
                        }
                    });
                    row.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg2)';
                    });
                    row.addEventListener('mouseleave', function() {
                        this.style.background = 'var(--bg3)';
                    });
                })(rows[i]);
            }
        }

        return true;
    }

    // =========================================================================
    // 3. RENDER CHARACTER CARD
    // =========================================================================

    function renderCharacterCard(character) {
        if (!character) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">Character not found</div>';
        }

        var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
        var isDeceased = character.isDeceased === true;
        var genderSymbol = character.gender === 'male' ? '♂' : (character.gender === 'female' ? '♀' : '⚥');

        var statusColor = isDeceased ? 'var(--dim)' : 'var(--success)';
        var statusText = isDeceased ? 'Deceased' : 'Living';

        // NEW: Culture badge
        var cultureBadge = '';
        if (character.cultureId) {
            var cultureName = _getCultureName(character.cultureId);
            var cultureIcon = _getCultureIcon(character.cultureId);
            if (cultureName) {
                cultureBadge = '<span style="font-size:0.55rem;background:var(--bg3);padding:2px 10px;border-radius:12px;border:1px solid var(--border-light);">' +
                    (cultureIcon ? _escapeHtml(cultureIcon) + ' ' : '') +
                    _escapeHtml(cultureName) +
                    '</span>';
            }
        }

        // Appearance preview (NEW)
        var appearancePreview = '';
        if (character.appearance && Object.keys(character.appearance).length > 0) {
            var app = character.appearance;
            var parts = [];
            if (app.skinTone) parts.push(app.skinTone);
            if (app.eyeColor) parts.push(app.eyeColor + ' eyes');
            if (app.hairColor) parts.push(app.hairColor + ' hair');
            if (app.build) parts.push(app.build);
            if (app.height) parts.push(app.height + 'cm');
            if (parts.length > 0) {
                appearancePreview = '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                    parts.join(' · ') +
                    '</div>';
            }
        }

        return '<div class="character-card" style="' +
            'background:var(--bg2);border-radius:8px;padding:16px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h4 style="margin:0;font-size:0.9rem;">' +
            genderSymbol + ' ' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') +
            '</h4>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            cultureBadge +
            '<span style="font-size:0.6rem;color:' + statusColor + ';padding:2px 10px;border-radius:12px;border:1px solid ' + statusColor + ';">' +
            statusText +
            '</span>' +
            '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:0.65rem;">' +
            '<div><span style="color:var(--dim);">Age</span><br><strong>' + age + ' years</strong></div>' +
            '<div><span style="color:var(--dim);">Gender</span><br><strong>' + _escapeHtml(character.gender || 'Unknown') + '</strong></div>' +
            '<div><span style="color:var(--dim);">Location</span><br><strong>' + _escapeHtml(character.currentLocation || 'Unknown') + '</strong></div>' +
            '</div>' +
            appearancePreview +
            (character.notes ? '<div style="margin-top:8px;font-size:0.55rem;color:var(--dim);padding-top:8px;border-top:1px solid var(--border-light);">' + _escapeHtml(character.notes) + '</div>' : '') +
            '</div>';
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.CharacterUI = {
        renderCharacterList: renderCharacterList,
        renderCharacterCard: renderCharacterCard
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterUI;
    }

})();