/**
 * =============================================================================
 * STILL WATERS - CULTURE UI LIST (js/culture/culture-ui-list.js)
 * =============================================================================
 * 
 * UI rendering for culture lists and cards.
 * 
 * UPDATED: Fixed icon rendering - uses Icons from icons.js
 * 
 * DEPENDENCIES:
 *   - culture-state.js (CultureState)
 *   - culture-queries.js (CultureQueries)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _getQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
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
        // If it's a direct icon string (like '✦'), return it
        if (name && name.length === 1) {
            return name;
        }
        return '';
    }

    function _getLocationName(locationId) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(locationId);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(locationId);
            return place ? place.displayName : 'Unknown';
        }
        return 'Unknown';
    }

    function _getReligionName(religionId) {
        if (typeof window.ReligionState !== 'undefined' && 
            typeof window.ReligionState.getReligion === 'function') {
            var religion = window.ReligionState.getReligion(religionId);
            return religion ? religion.displayName || religion.name : 'Unknown';
        }
        return 'Unknown';
    }

    function _getCultureIconHtml(culture) {
        if (!culture) return '';
        
        var iconName = culture.icon || 'STAR_4';
        var iconHtml = _getIcon(iconName);
        
        // If we got an icon from icons.js, use it
        if (iconHtml) {
            return iconHtml;
        }
        
        // If culture has a displayIcon (like '✦'), use it
        if (culture.icon && culture.icon.length === 1) {
            return culture.icon;
        }
        
        // Fallback to star
        return _getIcon('STAR_4') || '✦';
    }

    // =========================================================================
    // 2. RENDER CULTURE LIST
    // =========================================================================

    function renderCultureList(containerId, options) {
        options = options || {};

        var container = typeof containerId === 'string' ?
            document.getElementById(containerId) :
            containerId;

        if (!container) {
            return false;
        }

        var state = _getState();
        if (!state) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">Culture system not available</div>';
            return false;
        }

        var cultures = options.filteredCultures || state.getAllCultures();
        var onSelect = options.onSelect || null;
        var emptyMessage = options.emptyMessage || 'No cultures found';
        var showLocations = options.showLocations !== undefined ? options.showLocations : true;
        var showReligions = options.showReligions !== undefined ? options.showReligions : true;
        var showMythology = options.showMythology !== undefined ? options.showMythology : true;
        var selectedId = options.selectedId || null;

        if (!cultures || cultures.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">' + _escapeHtml(emptyMessage) + '</div>';
            return true;
        }

        var sorted = cultures.slice().sort(function(a, b) {
            return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '');
        });

        var html = '<div class="culture-list" style="display:flex;flex-direction:column;gap:4px;">';

        for (var i = 0; i < sorted.length; i++) {
            var c = sorted[i];
            var isSelected = (selectedId === c.id);
            
            // Get icon HTML
            var iconHtml = _getCultureIconHtml(c);
            
            var locationNames = [];
            if (showLocations && c.locations) {
                for (var j = 0; j < Math.min(3, c.locations.length); j++) {
                    var name = _getLocationName(c.locations[j]);
                    if (name) locationNames.push(name);
                }
                if (c.locations.length > 3) {
                    locationNames.push('+' + (c.locations.length - 3) + ' more');
                }
            }

            var religionNames = [];
            if (showReligions && c.religions) {
                for (var j = 0; j < Math.min(3, c.religions.length); j++) {
                    var name = _getReligionName(c.religions[j]);
                    if (name) religionNames.push(name);
                }
                if (c.religions.length > 3) {
                    religionNames.push('+' + (c.religions.length - 3) + ' more');
                }
            }

            var hasMythology = c.mythology && (
                c.mythology.creation ||
                c.mythology.afterlife ||
                (c.mythology.keyDeities && c.mythology.keyDeities.length > 0)
            );

            var rowClass = options.rowClass || 'culture-row';
            var clickable = onSelect ? 'cursor:pointer;' : '';
            var bgColor = isSelected ? 'var(--accent-dim)' : 'var(--bg3)';
            var borderColor = isSelected ? 'var(--accent)' : 'transparent';

            html += '<div class="' + _escapeHtml(rowClass) + '" data-culture-id="' + _escapeHtml(c.id) + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 12px;background:' + bgColor + ';border-radius:6px;' +
                'border-left:3px solid ' + borderColor + ';' +
                clickable +
                '">';

            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-weight:bold;font-size:0.8rem;display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;align-items:center;flex-shrink:0;">' + iconHtml + '</span>' +
                '<span>' + _escapeHtml(c.displayName || c.name) + '</span>' +
                (isSelected ? ' <span style="font-size:0.5rem;color:var(--accent);">◀</span>' : '') +
                '</div>';

            if (c.description) {
                html += '<div style="font-size:0.6rem;color:var(--dim);">' + _escapeHtml(c.description) + '</div>';
            }

            var details = [];
            if (showLocations && locationNames.length > 0) {
                var locIcon = _getIcon('LOCATION') || '📍';
                details.push(locIcon + ' ' + locationNames.join(', '));
            }
            if (showReligions && religionNames.length > 0) {
                var relIcon = _getIcon('CIRCLE_DOT') || '⛪';
                details.push(relIcon + ' ' + religionNames.join(', '));
            }
            if (showMythology && hasMythology) {
                var bookIcon = _getIcon('BOOK') || '📖';
                details.push(bookIcon + ' Has mythology');
            }

            if (details.length > 0) {
                html += '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' + details.join(' · ') + '</div>';
            }

            html += '</div>';

            // Show count badge
            var count = (c.locations ? c.locations.length : 0);
            if (count > 0) {
                html += '<div style="font-size:0.55rem;color:var(--dim);flex-shrink:0;margin-left:12px;background:var(--bg2);padding:2px 8px;border-radius:10px;">' +
                    count + ' locations' +
                    '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        if (onSelect) {
            var rows = container.querySelectorAll('.culture-row');
            for (var i = 0; i < rows.length; i++) {
                (function(row) {
                    row.addEventListener('click', function() {
                        var id = this.dataset.cultureId;
                        var state = _getState();
                        if (state) {
                            var culture = state.getCulture(id);
                            if (culture && onSelect) {
                                onSelect(culture);
                            }
                        }
                    });
                    row.addEventListener('mouseenter', function() {
                        if (!this.style.borderLeftColor || this.style.borderLeftColor !== 'var(--accent)') {
                            this.style.background = 'var(--bg2)';
                        }
                    });
                    row.addEventListener('mouseleave', function() {
                        if (!this.style.borderLeftColor || this.style.borderLeftColor !== 'var(--accent)') {
                            this.style.background = 'var(--bg3)';
                        }
                    });
                })(rows[i]);
            }
        }

        return true;
    }

    // =========================================================================
    // 3. RENDER CULTURE CARD
    // =========================================================================

    function renderCultureCard(culture) {
        if (!culture) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">Culture not found</div>';
        }

        var iconHtml = _getCultureIconHtml(culture);

        var locationNames = [];
        if (culture.locations) {
            for (var i = 0; i < culture.locations.length; i++) {
                var name = _getLocationName(culture.locations[i]);
                if (name) locationNames.push(name);
            }
        }

        var religionNames = [];
        if (culture.religions) {
            for (var i = 0; i < culture.religions.length; i++) {
                var name = _getReligionName(culture.religions[i]);
                if (name) religionNames.push(name);
            }
        }

        var appearanceHtml = '';
        if (culture.appearance) {
            var categories = [];
            for (var key in culture.appearance) {
                if (culture.appearance.hasOwnProperty(key) && Array.isArray(culture.appearance[key])) {
                    var options = culture.appearance[key];
                    var preview = options.slice(0, 3).map(function(o) { return o.value; }).join(', ');
                    if (options.length > 3) {
                        preview += ', +' + (options.length - 3) + ' more';
                    }
                    categories.push('<span style="font-size:0.55rem;color:var(--dim);">' + 
                        _escapeHtml(key) + ': ' + _escapeHtml(preview) + '</span>');
                }
            }
            if (categories.length > 0) {
                appearanceHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">' +
                    categories.join(' · ') +
                    '</div>';
            }
        }

        var mythologyHtml = '';
        if (culture.mythology && (culture.mythology.creation || culture.mythology.afterlife)) {
            var parts = [];
            if (culture.mythology.creation) {
                parts.push('<span style="font-size:0.55rem;color:var(--dim);">Creation: ' + _escapeHtml(culture.mythology.creation) + '</span>');
            }
            if (culture.mythology.afterlife) {
                parts.push('<span style="font-size:0.55rem;color:var(--dim);">Afterlife: ' + _escapeHtml(culture.mythology.afterlife) + '</span>');
            }
            if (culture.mythology.keyDeities && culture.mythology.keyDeities.length > 0) {
                parts.push('<span style="font-size:0.55rem;color:var(--dim);">Deities: ' + 
                    _escapeHtml(culture.mythology.keyDeities.slice(0, 5).join(', ')) + 
                    (culture.mythology.keyDeities.length > 5 ? ' +' + (culture.mythology.keyDeities.length - 5) : '') + 
                    '</span>');
            }
            if (parts.length > 0) {
                mythologyHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">' +
                    parts.join('<br>') +
                    '</div>';
            }
        }

        return '<div class="culture-card" style="' +
            'background:var(--bg2);border-radius:8px;padding:16px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h4 style="margin:0;font-size:0.9rem;display:flex;align-items:center;gap:8px;">' +
            '<span style="display:inline-flex;align-items:center;">' + iconHtml + '</span>' +
            _escapeHtml(culture.displayName || culture.name) +
            '</h4>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' +
            (culture.locations ? culture.locations.length : 0) + ' locations · ' +
            (culture.religions ? culture.religions.length : 0) + ' religions' +
            '</span>' +
            '</div>' +
            (culture.description ? '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' + _escapeHtml(culture.description) + '</div>' : '') +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.6rem;">' +
            '<div><span style="color:var(--dim);">Locations</span><br><strong>' + (locationNames.length > 0 ? _escapeHtml(locationNames.join(', ')) : 'None') + '</strong></div>' +
            '<div><span style="color:var(--dim);">Religions</span><br><strong>' + (religionNames.length > 0 ? _escapeHtml(religionNames.join(', ')) : 'None') + '</strong></div>' +
            '</div>' +
            appearanceHtml +
            mythologyHtml +
            (culture.notes ? '<div style="margin-top:8px;font-size:0.55rem;color:var(--dim);padding-top:8px;border-top:1px solid var(--border-light);">' + _escapeHtml(culture.notes) + '</div>' : '') +
            '</div>';
    }

    // =========================================================================
    // 4. RENDER CULTURE DROPDOWN
    // =========================================================================

    function renderCultureDropdown(selectedId, placeholder, options) {
        options = options || {};
        var state = _getState();
        if (!state) {
            return '<select disabled><option>Culture system not available</option></select>';
        }

        var cultures = options.filteredCultures || state.getAllCultures();
        var sorted = cultures.slice().sort(function(a, b) {
            return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '');
        });

        var html = '<select id="' + (options.id || 'cultureSelect') + '" style="' +
            'width:100%;padding:8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;color:var(--text);' +
            'font-size:0.8rem;' +
            '">';

        if (placeholder) {
            html += '<option value="">' + _escapeHtml(placeholder) + '</option>';
        }

        for (var i = 0; i < sorted.length; i++) {
            var c = sorted[i];
            var selected = (selectedId === c.id) ? 'selected' : '';
            var iconHtml = _getCultureIconHtml(c);
            html += '<option value="' + _escapeHtml(c.id) + '" ' + selected + '>' +
                iconHtml + ' ' + _escapeHtml(c.displayName || c.name) +
                '</option>';
        }

        html += '</select>';
        return html;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.CultureUI = {
        renderCultureList: renderCultureList,
        renderCultureCard: renderCultureCard,
        renderCultureDropdown: renderCultureDropdown
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureUI;
    }

})();