/**
 * =============================================================================
 * STILL WATERS - RELIGION UI LIST (religion-ui-list.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-ui-list.js
 * 
 * UI rendering for religion lists, cards, and tables.
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState
 *   - religion-queries.js: ReligionQueries
 *   - religion-format.js: ReligionFormat (display names)
 *   - formatting.js: escapeHtml
 *   - icons.js: Icons
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - Deleted local _getReligiousTraitName. Delegates to ReligionFormat.
 *   - Deleted _getTraitColor. Trait colors now emitted as CSS classes:
 *     religion-trait--<traitId>. CSS owns the visual mapping.
 *   - Deleted _getTraitIcon. Trait decoration is presentation; if a caller
 *     wants a glyph, they emit a CSS class and let CSS handle it via ::before.
 *   - Deleted _getStatusBadge HTML builder. Status is now emitted as a class:
 *     religion-status--active / religion-status--deprecated. CSS owns styling.
 *   - Deleted '✦' fallback for religion.icon. Per ADR Decision 4, icons are
 *     user-authored world data; empty renders empty.
 * 
 * PHASE 4 will restructure the file further (view models, event delegation,
 * CSS extraction). Phase 2 only consolidates vocabulary.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        return '';
    }

    function _getAllReligions(options) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getAllReligions === 'function') {
            return window.ReligionQueries.getAllReligions(options);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions(options);
        }
        return [];
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getFollowerCount === 'function') {
            return window.ReligionQueries.getFollowerCount(religionId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            return window.ReligionState.getFollowerCount(religionId);
        }
        return 0;
    }

    function _getGodCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getGodCount === 'function') {
            return window.ReligionQueries.getGodCount(religionId);
        }
        return 0;
    }

    function _getLawCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getLawsByReligion === 'function') {
            return window.ReligionQueries.getLawsByReligion(religionId).length;
        }
        return 0;
    }

    function _getPlaceCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getPlaceOfWorshipCount === 'function') {
            return window.ReligionQueries.getPlaceOfWorshipCount(religionId);
        }
        return 0;
    }

    function _getReligiousTraitName(trait) {
        if (typeof window.ReligionFormat !== 'undefined' &&
            typeof window.ReligionFormat.getReligiousTraitName === 'function') {
            return window.ReligionFormat.getReligiousTraitName(trait);
        }
        return trait;
    }

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        if (typeof window.getCharacterById === 'function') {
            var char = window.getCharacterById(id);
            if (char) {
                return char.name + (char.surname ? ' ' + char.surname : '');
            }
        }
        return 'Unknown';
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(id);
            if (place) return place.displayName;
        }
        return 'Unknown';
    }

    function _getLocationIds(locationIds) {
        if (!locationIds || locationIds.length === 0) return [];
        var result = [];
        for (var i = 0; i < locationIds.length; i++) {
            result.push(_getPlaceName(locationIds[i]));
        }
        return result;
    }

    // =========================================================================
    // 3. PRESENTATION HELPERS
    // =========================================================================
    // Vocabulary has moved to ReligionFormat. Visual styling is now emitted
    // as CSS classes. The renderer never returns colors or glyphs.

    function _traitClass(traitId) {
        if (!traitId) return 'religion-trait';
        return 'religion-trait religion-trait--' + traitId;
    }

    function _statusClass(religion) {
        var isDeprecated = religion && religion.isDeprecated;
        return isDeprecated ? 'religion-status religion-status--deprecated'
                            : 'religion-status religion-status--active';
    }

    function _statusLabel(religion) {
        return (religion && religion.isDeprecated) ? 'Deprecated' : 'Active';
    }

    // =========================================================================
    // 4. RENDER RELIGION LIST
    // =========================================================================

    function renderReligionList(containerId, options) {
        if (_rendering) return false;

        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                return false;
            }

            options = options || {};

            var religions = options.filteredReligions || _getAllReligions({
                includeDeprecated: options.includeDeprecated || false
            });

            if (!religions || religions.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                    _escapeHtml(options.emptyMessage || 'No religions found') +
                    '</div>';
                return true;
            }

            if (!options.sortBy) {
                religions = religions.slice().sort(function(a, b) {
                    return _getFollowerCount(b.id) - _getFollowerCount(a.id);
                });
            } else if (options.sortBy === 'name') {
                religions = religions.slice().sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            var html = '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var showActions = options.showActions !== false;
            var showStats = options.showStats !== false;
            var rowClass = options.rowClass || '';

            html += '<div class="religion-list" style="display:flex;flex-direction:column;gap:8px;">';

            for (var i = 0; i < religions.length; i++) {
                var religion = religions[i];
                var followerCount = _getFollowerCount(religion.id);
                var godCount = _getGodCount(religion.id);
                var lawCount = _getLawCount(religion.id);
                var placeCount = _getPlaceCount(religion.id);
                var traitName = _getReligiousTraitName(religion.trait);
                var traitClass = _traitClass(religion.trait);

                var isSelected = (selectedId === religion.id);
                var isDeprecated = religion.isDeprecated || false;

                var leaderName = religion.leader ? _getCharacterName(religion.leader.characterId) : 'None';

                var locationNames = _getLocationIds(religion.locations || []);
                var locationDisplay = locationNames.length > 0 ? locationNames.slice(0, 2).join(', ') :
                    'None';
                if (locationNames.length > 2) {
                    locationDisplay += ' (+' + (locationNames.length - 2) + ')';
                }

                var style = '';
                var borderStyle = '';

                if (isSelected) {
                    style += 'background:var(--accent-dim);';
                    borderStyle = 'border:2px solid var(--accent);';
                } else {
                    borderStyle = 'border:1px solid var(--border);';
                }

                if (isDeprecated) {
                    style += 'opacity:0.5;';
                }

                var itemClass = 'religion-item';
                if (isSelected) itemClass += ' religion-item--selected';
                if (isDeprecated) itemClass += ' religion-item--deprecated';
                if (rowClass) itemClass += ' ' + rowClass;

                html += '<div class="' + itemClass + '" data-religion-id="' + religion.id + '" style="' +
                    'display:flex;' +
                    'align-items:center;' +
                    'justify-content:space-between;' +
                    'padding:12px 16px;' +
                    'background:var(--bg2);' +
                    'border-radius:8px;' +
                    'cursor:' + (onSelect ? 'pointer' : 'default') + ';' +
                    'transition:all 0.2s;' +
                    borderStyle +
                    style +
                    '">';

                // Left: Name, Trait, Status
                html += '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">';

                // Icon — no fallback. Empty renders empty.
                var iconDisplay = religion.icon || '';
                if (iconDisplay) {
                    html += '<span style="font-size:1.2rem;">' + _escapeHtml(iconDisplay) + '</span>';
                }

                // Name and details
                html += '<div style="min-width:0;">';
                html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
                html += '<span style="font-weight:bold;font-size:0.9rem;">' + _escapeHtml(religion.displayName || religion.name) + '</span>';
                html += '<span class="' + _statusClass(religion) + '">' + _escapeHtml(_statusLabel(religion)) + '</span>';

                if (religion.isOrganized) {
                    html += '<span style="font-size:0.5rem;padding:1px 6px;border:1px solid var(--border);border-radius:4px;color:var(--dim);">Organized</span>';
                }

                html += '</div>';

                html += '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:0.6rem;color:var(--dim);margin-top:2px;">';
                html += '<span class="' + traitClass + '">' + _escapeHtml(traitName) + '</span>';

                if (religion.leader) {
                    html += '<span>◉ ' + _escapeHtml(leaderName) + '</span>';
                }

                if (religion.locations && religion.locations.length > 0) {
                    html += '<span>⌂ ' + _escapeHtml(locationDisplay) + '</span>';
                }

                html += '</div>';
                html += '</div>';

                html += '</div>';

                // Right: Stats and Actions
                html += '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">';

                if (showStats) {
                    html += '<div style="display:flex;gap:12px;font-size:0.55rem;color:var(--dim);">';
                    html += '<span title="Followers">' + followerCount + '</span>';
                    html += '<span title="Gods">' + godCount + '</span>';
                    html += '<span title="Laws">' + lawCount + '</span>';
                    html += '<span title="Places of Worship">' + placeCount + '</span>';
                    html += '</div>';
                }

                if (showActions) {
                    html += '<div style="display:flex;gap:4px;">';
                    html += '<button class="btn view-religion-btn" data-religion-id="' + religion.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:4px 10px;' +
                        'border-radius:4px;' +
                        'font-size:0.55rem;' +
                        'cursor:pointer;' +
                        '">View</button>';

                    if (!isDeprecated) {
                        html += '<button class="btn edit-religion-btn" data-religion-id="' + religion.id + '" style="' +
                            'background:var(--bg3);' +
                            'border:1px solid var(--border);' +
                            'color:var(--text);' +
                            'padding:4px 10px;' +
                            'border-radius:4px;' +
                            'font-size:0.55rem;' +
                            'cursor:pointer;' +
                            '">Edit</button>';
                    }
                    html += '</div>';
                }

                html += '</div>';

                html += '</div>';
            }

            html += '</div>';

            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.religion-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var id = this.dataset.religionId;
                            var religion = _getAllReligions({ includeDeprecated: true }).find(function(r) {
                                return r.id === id;
                            });
                            if (religion && onSelect) {
                                onSelect(religion);
                            }
                        });
                    })(items[i]);
                }
            }

            var viewBtns = container.querySelectorAll('.view-religion-btn');
            for (var i = 0; i < viewBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.religionId;
                        if (typeof window.openReligionDetailsModal === 'function') {
                            window.openReligionDetailsModal(id);
                        }
                    });
                })(viewBtns[i]);
            }

            var editBtns = container.querySelectorAll('.edit-religion-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.religionId;
                        if (typeof window.openEditReligionModal === 'function') {
                            window.openEditReligionModal(id);
                        }
                    });
                })(editBtns[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER RELIGION CARD
    // =========================================================================

    function renderReligionCard(religionId, options) {
        if (_rendering) return '';

        _rendering = true;

        try {
            var religion = _getAllReligions({ includeDeprecated: true }).find(function(r) {
                return r.id === religionId;
            });

            if (!religion) {
                return '<div style="padding:20px;color:var(--dim);">Religion not found</div>';
            }

            options = options || {};
            var compact = options.compact || false;
            var showActions = options.showActions !== false;

            var followerCount = _getFollowerCount(religion.id);
            var godCount = _getGodCount(religion.id);
            var lawCount = _getLawCount(religion.id);
            var placeCount = _getPlaceCount(religion.id);
            var traitName = _getReligiousTraitName(religion.trait);
            var traitClass = _traitClass(religion.trait);

            var leaderName = religion.leader ? _getCharacterName(religion.leader.characterId) : 'None';
            var locationNames = _getLocationIds(religion.locations || []);
            var locationDisplay = locationNames.length > 0 ? locationNames.slice(0, 3).join(', ') :
                'None';
            if (locationNames.length > 3) {
                locationDisplay += ' (+' + (locationNames.length - 3) + ')';
            }

            var html = '';

            html += '<div class="religion-card" style="' +
                'background:var(--bg2);' +
                'border:1px solid var(--border);' +
                'border-radius:8px;' +
                'padding:' + (compact ? '12px' : '20px') + ';' +
                'display:flex;' +
                'flex-direction:column;' +
                'gap:' + (compact ? '8px' : '12px') + ';' +
                '">';

            // Header
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
            html += '<div style="display:flex;align-items:center;gap:10px;">';

            var iconDisplay = religion.icon || '';
            if (iconDisplay) {
                html += '<span style="font-size:' + (compact ? '1.2rem' : '1.5rem') + ';">' + _escapeHtml(iconDisplay) + '</span>';
            }

            html += '<div>';
            html += '<div style="font-weight:bold;font-size:' + (compact ? '0.9rem' : '1.1rem') + ';">' + _escapeHtml(religion.displayName || religion.name) + '</div>';
            html += '<div class="' + traitClass + '" style="font-size:0.6rem;">' + _escapeHtml(traitName) + '</div>';
            html += '</div>';
            html += '</div>';

            html += '<div style="display:flex;gap:4px;">';
            html += '<span class="' + _statusClass(religion) + '">' + _escapeHtml(_statusLabel(religion)) + '</span>';
            html += '</div>';
            html += '</div>';

            // Description
            if (religion.description) {
                html += '<div style="font-size:0.7rem;color:var(--dim);' + (compact ? 'display:none;' : '') + '">' + _escapeHtml(religion.description) + '</div>';
            }

            // Stats
            html += '<div style="display:flex;flex-wrap:wrap;gap:' + (compact ? '8px' : '12px') + ';font-size:0.6rem;color:var(--dim);border-top:1px solid var(--border-light);padding-top:' + (compact ? '6px' : '10px') + ';">';
            html += '<span>' + followerCount + ' followers</span>';
            html += '<span>' + godCount + ' gods</span>';
            html += '<span>' + lawCount + ' laws</span>';
            html += '<span>' + placeCount + ' places</span>';
            html += '<span>' + _escapeHtml(leaderName) + '</span>';
            html += '</div>';

            // Locations
            if (locationNames.length > 0) {
                html += '<div style="font-size:0.55rem;color:var(--dim);">Locations: ' + _escapeHtml(locationDisplay) + '</div>';
            }

            // Traits
            if (religion.isOrganized) {
                html += '<div style="font-size:0.5rem;color:var(--dim);">Organized religion</div>';
            }

            // Actions
            if (showActions) {
                html += '<div style="display:flex;gap:6px;margin-top:' + (compact ? '4px' : '8px') + ';">';
                html += '<button class="btn view-religion-btn" data-religion-id="' + religion.id + '" style="' +
                    'background:var(--bg3);' +
                    'border:1px solid var(--border);' +
                    'color:var(--text);' +
                    'padding:4px 12px;' +
                    'border-radius:4px;' +
                    'font-size:0.55rem;' +
                    'cursor:pointer;' +
                    '">View Details</button>';

                if (!religion.isDeprecated) {
                    html += '<button class="btn edit-religion-btn" data-religion-id="' + religion.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:4px 12px;' +
                        'border-radius:4px;' +
                        'font-size:0.55rem;' +
                        'cursor:pointer;' +
                        '">Edit</button>';
                }
                html += '</div>';
            }

            html += '</div>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER RELIGION TABLE
    // =========================================================================

    function renderReligionTable(religions, options) {
        if (_rendering) return '';

        _rendering = true;

        try {
            options = options || {};
            var columns = options.columns || ['name', 'trait', 'followers', 'gods', 'laws', 'places', 'leader', 'status'];
            var showActions = options.showActions !== false;

            var html = '';

            html += '<table class="religion-table" style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
            html += '<thead style="border-bottom:2px solid var(--border);">';
            html += '<tr style="text-align:left;">';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                var label = '';
                switch (col) {
                    case 'name':
                        label = 'Name';
                        break;
                    case 'trait':
                        label = 'Trait';
                        break;
                    case 'followers':
                        label = 'Followers';
                        break;
                    case 'gods':
                        label = 'Gods';
                        break;
                    case 'laws':
                        label = 'Laws';
                        break;
                    case 'places':
                        label = 'Places';
                        break;
                    case 'leader':
                        label = 'Leader';
                        break;
                    case 'locations':
                        label = 'Locations';
                        break;
                    case 'status':
                        label = 'Status';
                        break;
                    default:
                        label = col;
                }
                html += '<th style="padding:8px 10px;font-weight:600;color:var(--dim);">' + _escapeHtml(label) + '</th>';
            }

            if (showActions) {
                html += '<th style="padding:8px 10px;font-weight:600;color:var(--dim);">Actions</th>';
            }

            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';

            for (var i = 0; i < religions.length; i++) {
                var religion = religions[i];
                var isDeprecated = religion.isDeprecated || false;

                html += '<tr style="' + (isDeprecated ? 'opacity:0.5;' : '') + 'border-bottom:1px solid var(--border-light);">';

                for (var j = 0; j < columns.length; j++) {
                    var col = columns[j];
                    html += '<td style="padding:8px 10px;">';

                    switch (col) {
                        case 'name':
                            var iconDisplay = religion.icon || '';
                            if (iconDisplay) {
                                html += _escapeHtml(iconDisplay) + ' ';
                            }
                            html += _escapeHtml(religion.displayName || religion.name);
                            break;
                        case 'trait':
                            var traitName = _getReligiousTraitName(religion.trait);
                            var traitClass = _traitClass(religion.trait);
                            html += '<span class="' + traitClass + '">' + _escapeHtml(traitName) + '</span>';
                            break;
                        case 'followers':
                            html += _getFollowerCount(religion.id);
                            break;
                        case 'gods':
                            html += _getGodCount(religion.id);
                            break;
                        case 'laws':
                            html += _getLawCount(religion.id);
                            break;
                        case 'places':
                            html += _getPlaceCount(religion.id);
                            break;
                        case 'leader':
                            if (religion.leader) {
                                html += _escapeHtml(_getCharacterName(religion.leader.characterId));
                            } else {
                                html += '<span style="color:var(--dim);">None</span>';
                            }
                            break;
                        case 'locations':
                            var locationNames = _getLocationIds(religion.locations || []);
                            html += locationNames.length > 0 ? _escapeHtml(locationNames.join(', ')) : 'None';
                            break;
                        case 'status':
                            html += '<span class="' + _statusClass(religion) + '">' + _escapeHtml(_statusLabel(religion)) + '</span>';
                            break;
                        default:
                            html += '—';
                    }

                    html += '</td>';
                }

                if (showActions) {
                    html += '<td style="padding:8px 10px;">';
                    html += '<div style="display:flex;gap:4px;">';
                    html += '<button class="btn view-religion-btn" data-religion-id="' + religion.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:2px 8px;' +
                        'border-radius:4px;' +
                        'font-size:0.5rem;' +
                        'cursor:pointer;' +
                        '">View</button>';

                    if (!isDeprecated) {
                        html += '<button class="btn edit-religion-btn" data-religion-id="' + religion.id + '" style="' +
                            'background:var(--bg3);' +
                            'border:1px solid var(--border);' +
                            'color:var(--text);' +
                            'padding:2px 8px;' +
                            'border-radius:4px;' +
                            'font-size:0.5rem;' +
                            'cursor:pointer;' +
                            '">Edit</button>';
                    }
                    html += '</div>';
                    html += '</td>';
                }

                html += '</tr>';
            }

            html += '</tbody>';
            html += '</table>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. REFRESH FUNCTIONS
    // =========================================================================

    var _refreshTimeout = null;

    function refreshReligionList(containerId, options) {
        if (_refreshTimeout) {
            clearTimeout(_refreshTimeout);
        }

        _refreshTimeout = setTimeout(function() {
            renderReligionList(containerId, options);
            _refreshTimeout = null;
        }, 50);
    }

    function debouncedRefresh(containerId, options) {
        refreshReligionList(containerId, options);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ReligionUI = {
        renderReligionList: renderReligionList,
        renderReligionCard: renderReligionCard,
        renderReligionTable: renderReligionTable,
        refreshReligionList: refreshReligionList,
        debouncedRefresh: debouncedRefresh,

        // Presentation helpers (return CSS classes, not colors/icons)
        getTraitClass: _traitClass,
        getStatusClass: _statusClass,
        getStatusLabel: _statusLabel,

        // Vocabulary (delegates to ReligionFormat)
        getTraitName: _getReligiousTraitName
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionUI: window.ReligionUI
        };
    }

})();
