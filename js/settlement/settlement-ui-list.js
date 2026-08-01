/**
 * =============================================================================
 * SETTLEMENT UI LIST - UI list rendering for settlements js/settlement/settlement-ui-list.js
 * =============================================================================
 * 
 * Responsibilities:
 * - Render settlement lists with filters
 * - Render settlement cards
 * - Render settlement tables
 * - Render feature lists
 * - Handle selection and sorting
 * - RENDER SETTLEMENT ROLES
 * - RENDER SETTLEMENT APPRENTICESHIPS
 * - RENDER SETTLEMENT EDUCATION
 * - RENDER PLACES OF WORSHIP
 * - RENDER RELIGIOUS DEMOGRAPHICS
 * - RENDER CIVIL LAWS (NEW)
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - settlement-queries.js (SettlementQueries)
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
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
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    function _getSettlementRoleStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementRoleStats) {
            return SettlementQueries.getSettlementRoleStats(locationId);
        }
        return null;
    }

    function _getSettlementApprenticeshipDensity(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementApprenticeshipDensity) {
            return SettlementQueries.getSettlementApprenticeshipDensity(locationId);
        }
        return null;
    }

    function _getSettlementEducationStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementEducationStats) {
            return SettlementQueries.getSettlementEducationStats(locationId);
        }
        return null;
    }

    function _getSettlementSchools(locationId, filters) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSchools) {
            return SettlementQueries.getSettlementSchools(locationId, filters);
        }
        return [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getReligion(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    }

    function _getPlacesOfWorship(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getPlacesOfWorship) {
            return SettlementQueries.getPlacesOfWorship(locationId);
        }
        return [];
    }

    function _getSettlementPlacesOfWorship(locationId, options) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementPlacesOfWorship) {
            return SettlementQueries.getSettlementPlacesOfWorship(locationId, options);
        }
        return [];
    }

    function _getPlaceOfWorshipStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getPlaceOfWorshipStats) {
            return SettlementQueries.getPlaceOfWorshipStats(locationId);
        }
        return null;
    }

    function _getReligiousDemographics(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getReligiousDemographics) {
            return SettlementQueries.getReligiousDemographics(locationId);
        }
        return null;
    }

    function _getSettlementReligions(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementReligions) {
            return SettlementQueries.getSettlementReligions(locationId);
        }
        return {};
    }

    function _getReligiousUnity(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getReligiousUnity) {
            return SettlementQueries.getReligiousUnity(locationId);
        }
        return 50;
    }

    function _getDominantReligion(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getDominantReligion) {
            return SettlementQueries.getDominantReligion(locationId);
        }
        return null;
    }

    function _getCivilLaws(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getCivilLaws) {
            return SettlementQueries.getCivilLaws(locationId);
        }
        return [];
    }

    function _getCivilLawStatistics(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getCivilLawStatistics) {
            return SettlementQueries.getCivilLawStatistics(locationId);
        }
        return null;
    }

    function _getCivilLawTypeName(type) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawTypeName === 'function') {
            return window.GovernmentLaws.getLawTypeName(type);
        }
        var names = {
            'law': 'Law',
            'taboo': 'Taboo',
            'guideline': 'Guideline'
        };
        return names[type] || type;
    }

    function _getCivilLawDomainName(domain) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawDomainName === 'function') {
            return window.GovernmentLaws.getLawDomainName(domain);
        }
        var names = {
            'marriage': 'Marriage',
            'behavior': 'Behavior',
            'worship': 'Worship',
            'food': 'Food',
            'social': 'Social',
            'economic': 'Economic',
            'political': 'Political',
            'sexual': 'Sexual',
            'violence': 'Violence',
            'death': 'Death'
        };
        return names[domain] || domain;
    }

    function _getCivilLawSeverityName(severity) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawSeverityName === 'function') {
            return window.GovernmentLaws.getLawSeverityName(severity);
        }
        var names = {
            'minor': 'Minor',
            'major': 'Major',
            'mortal': 'Mortal'
        };
        return names[severity] || severity;
    }

    function _getCivilLawSeverityColor(severity) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawSeverityColor === 'function') {
            return window.GovernmentLaws.getLawSeverityColor(severity);
        }
        var colors = {
            'minor': 'var(--text-dim)',
            'major': 'var(--warning)',
            'mortal': 'var(--error)'
        };
        return colors[severity] || 'var(--text)';
    }

    function _getCivilLawTypeIcon(type) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawTypeIcon === 'function') {
            return window.GovernmentLaws.getLawTypeIcon(type);
        }
        var icons = {
            'law': '◉',
            'taboo': '✕',
            'guideline': '○'
        };
        return icons[type] || '◉';
    }

    // =========================================================================
    // 3. RENDER SETTLEMENT LIST
    // =========================================================================

    function renderSettlementList(containerId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var searchTerm = options.searchTerm || '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var rankFilter = options.rankFilter || 'all';
            var prosperityFilter = options.prosperityFilter || 'all';
            var sortBy = options.sortBy || 'name';
            var sortOrder = options.sortOrder || 'asc';
            var limit = options.limit || 0;

            var settlements = SettlementState.getAllSettlements({
                sortBy: sortBy,
                sortOrder: sortOrder,
                limit: 0
            });

            if (searchTerm) {
                var lower = searchTerm.toLowerCase();
                settlements = settlements.filter(function(s) {
                    return s.locationName.toLowerCase().indexOf(lower) !== -1 ||
                        (s.data.notes && s.data.notes.toLowerCase().indexOf(lower) !== -1);
                });
            }

            if (rankFilter !== 'all') {
                settlements = settlements.filter(function(s) {
                    return s.data.rankId === rankFilter;
                });
            }

            if (prosperityFilter !== 'all') {
                settlements = settlements.filter(function(s) {
                    var prosperity = s.data.prosperity || 50;
                    if (prosperityFilter === 'thriving') return prosperity >= 70;
                    if (prosperityFilter === 'stable') return prosperity >= 40 && prosperity < 70;
                    if (prosperityFilter === 'struggling') return prosperity < 40;
                    return true;
                });
            }

            if (limit > 0) {
                settlements = settlements.slice(0, limit);
            }

            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');
            var religionIcon = _getIcon('CIRCLE_DOT');

            var html = '<div class="settlement-list">';

            if (settlements.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--dim);">No settlements found</div>';
            } else {
                for (var i = 0; i < settlements.length; i++) {
                    var s = settlements[i];
                    var isSelected = (selectedId === s.locationId);
                    var population = _getLocationPopulationCount(s.locationId);
                    var prosperity = s.data.prosperity || 50;
                    var wealth = s.data.wealth || 0;
                    var debt = s.data.totalDebt || 0;
                    var ranks = _getSettlementRanks();
                    var rank = ranks.find(function(r) { return r.id === s.data.rankId; });
                    var rankName = rank ? rank.name : 'Unknown';

                    var dominantReligion = _getDominantReligion(s.locationId);
                    var religiousUnity = _getReligiousUnity(s.locationId);
                    var placeCount = s.data.placesOfWorship ? s.data.placesOfWorship.length : 0;
                    var lawCount = _getCivilLaws(s.locationId).length;

                    var prosperityColor = prosperity >= 70 ? 'var(--success)' :
                                         prosperity >= 40 ? 'var(--accent)' :
                                         'var(--danger)';

                    var prosperityLabel = prosperity >= 70 ? 'Thriving' :
                                         prosperity >= 40 ? 'Stable' :
                                         'Struggling';

                    html +=
                        '<div class="settlement-item" data-loc-id="' + s.locationId + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 12px 16px;' +
                        'margin-bottom: 8px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                        '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                        '<strong style="font-size: 0.85rem;">' + locationIcon + ' ' + _escapeHtml(s.locationName) + '</strong>' +
                        '<span style="font-size: 0.55rem; background: var(--bg2); padding: 2px 8px; border-radius: 10px;">' + _escapeHtml(rankName) + '</span>' +
                        '<span style="font-size: 0.55rem; color: ' + prosperityColor + '; padding: 2px 8px; border-radius: 10px; border: 1px solid ' + prosperityColor + ';">' + prosperityLabel + '</span>' +
                        (religiousUnity ? '<span style="font-size: 0.5rem; color: var(--dim); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--dim);">☯ ' + religiousUnity + '%</span>' : '') +
                        (lawCount > 0 ? '<span style="font-size: 0.5rem; color: var(--accent); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--accent);">⚖ ' + lawCount + ' laws</span>' : '') +
                        (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white;">Selected</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">' +
                        '<span>' + homeIcon + ' ' + population + ' pop</span>' +
                        '<span>💰 ' + wealth + ' gold' +
                        (debt > 0 ? ' <span style="color: var(--danger);">(Debt: ' + debt + ')</span>' : '') +
                        '</span>' +
                        '<span>☀ ' + prosperity + '%</span>' +
                        (placeCount > 0 ? '<span>⌂ ' + placeCount + ' places</span>' : '') +
                        (dominantReligion ? '<span>◉ ' + _escapeHtml(dominantReligion.name) + '</span>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div style="text-align: right; flex-shrink: 0;">' +
                        '<span style="font-size: 0.55rem; color: var(--accent);">View</span>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.settlement-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var locId = this.dataset.locId;
                            var place = _getPlaceById(locId);
                            if (place) {
                                onSelect(place);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            if (this.dataset.locId !== selectedId) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (this.dataset.locId !== selectedId) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 4. RENDER SETTLEMENT CARD
    // =========================================================================

    function renderSettlementCard(locationId, options) {
        if (_rendering) {
            return '';
        }
        _rendering = true;

        try {
            options = options || {};
            var summary = SettlementQueries.getSettlementSummary(locationId);
            if (!summary) {
                return '<div style="text-align:center;padding:20px;color:var(--dim);">Settlement not found</div>';
            }

            var population = _getLocationPopulationCount(locationId);
            var prosperityColor = summary.prosperity.value >= 70 ? 'var(--success)' :
                                 summary.prosperity.value >= 40 ? 'var(--accent)' :
                                 'var(--danger)';

            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');
            var religionIcon = _getIcon('CIRCLE_DOT');

            var dominant = summary.religion ? summary.religion.dominant : null;
            var unity = summary.religion ? summary.religion.unity : 50;
            var places = summary.religion ? summary.religion.placesOfWorship : 0;

            var unityColor = unity >= 70 ? 'var(--success)' :
                            unity >= 40 ? 'var(--accent)' :
                            'var(--danger)';

            var lawCount = _getCivilLaws(locationId).length;

            var html =
                '<div class="settlement-card" style="' +
                'background: var(--bg2);' +
                'border-radius: 8px;' +
                'padding: 16px;' +
                'border: 1px solid var(--border);' +
                '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">' +
                '<h4 style="margin: 0; font-size: 0.9rem;">' + locationIcon + ' ' + _escapeHtml(summary.name) + '</h4>' +
                '<span style="font-size: 0.6rem; color: ' + prosperityColor + '; padding: 2px 10px; border-radius: 12px; border: 1px solid ' + prosperityColor + ';">' + _escapeHtml(summary.prosperity.description) + '</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Rank</span><br><strong>' + _escapeHtml(summary.rank.name) + '</strong></div>' +
                '<div><span style="color: var(--dim);">Population</span><br><strong>' + population + '</strong></div>' +
                '<div><span style="color: var(--dim);">Prosperity</span><br><strong style="color:' + prosperityColor + ';">' + summary.prosperity.value + '%</strong></div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Wealth</span><br><strong>' + summary.wealth + '</strong></div>' +
                '<div><span style="color: var(--dim);">Debt</span><br><strong style="color:' + (summary.totalDebt > 0 ? 'var(--danger)' : 'var(--dim)') + ';">' + summary.totalDebt + '</strong></div>' +
                '<div><span style="color: var(--dim);">Features</span><br><strong>' + (summary.features ? summary.features.length : 0) + '</strong></div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.55rem;">' +
                '<div><span style="color: var(--dim);">Religion</span><br><strong>' + (dominant ? _escapeHtml(dominant.name) : 'None') + '</strong></div>' +
                '<div><span style="color: var(--dim);">Unity</span><br><strong style="color:' + unityColor + ';">' + unity + '%</strong></div>' +
                '<div><span style="color: var(--dim);">Places</span><br><strong>' + places + '</strong></div>' +
                '</div>' +
                // NEW: Civil laws row
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.55rem;">' +
                '<div><span style="color: var(--dim);">Civil Laws</span><br><strong>' + lawCount + '</strong></div>' +
                '<div><span style="color: var(--dim);">Justice</span><br><strong style="text-transform:capitalize;">' + _escapeHtml(summary.justice?.severity || 'medium') + '</strong></div>' +
                '</div>' +
                (summary.features && summary.features.length > 0 ?
                    '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.55rem; color: var(--dim);">' +
                    summary.features.slice(0, 3).map(function(f) { return _escapeHtml(f.name); }).join(' · ') +
                    (summary.features.length > 3 ? ' · +' + (summary.features.length - 3) + ' more' : '') +
                    '</div>' : '') +
                '</div>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER SETTLEMENT TABLE
    // =========================================================================

    function renderSettlementTable(settlements, options) {
        if (_rendering) {
            return '';
        }
        _rendering = true;

        try {
            options = options || {};
            var items = settlements || SettlementState.getAllSettlements();
            var columns = options.columns || ['name', 'rank', 'population', 'prosperity', 'wealth', 'features', 'religion', 'laws'];

            var columnLabels = {
                name: 'Name',
                rank: 'Rank',
                population: 'Population',
                prosperity: 'Prosperity',
                wealth: 'Wealth',
                debt: 'Debt',
                features: 'Features',
                taxRate: 'Tax Rate',
                religion: 'Religion',
                unity: 'Unity',
                places: 'Places',
                laws: 'Laws',
                justice: 'Justice'
            };

            var html = '<table style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
            html += '<thead><tr style="border-bottom:1px solid var(--border);">';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                html += '<th style="text-align:left;padding:6px 8px;color:var(--dim);font-weight:normal;">' + _escapeHtml(columnLabels[col] || col) + '</th>';
            }
            html += '</tr></thead><tbody>';

            for (var j = 0; j < items.length; j++) {
                var s = items[j];
                var summary = SettlementQueries.getSettlementSummary(s.locationId);
                if (!summary) continue;

                var population = _getLocationPopulationCount(s.locationId);
                var dominant = summary.religion ? summary.religion.dominant : null;
                var unity = summary.religion ? summary.religion.unity : 50;
                var places = summary.religion ? summary.religion.placesOfWorship : 0;
                var lawCount = _getCivilLaws(s.locationId).length;

                html += '<tr style="border-bottom:1px solid var(--border-light);">';

                for (var k = 0; k < columns.length; k++) {
                    var col = columns[k];
                    var value = '';

                    switch (col) {
                        case 'name':
                            value = _escapeHtml(summary.name);
                            break;
                        case 'rank':
                            value = _escapeHtml(summary.rank.name);
                            break;
                        case 'population':
                            value = population;
                            break;
                        case 'prosperity':
                            var color = summary.prosperity.value >= 70 ? 'var(--success)' :
                                       summary.prosperity.value >= 40 ? 'var(--accent)' :
                                       'var(--danger)';
                            value = '<span style="color:' + color + ';">' + summary.prosperity.value + '%</span>';
                            break;
                        case 'wealth':
                            value = summary.wealth;
                            break;
                        case 'debt':
                            var debtColor = summary.totalDebt > 0 ? 'var(--danger)' : 'var(--dim)';
                            value = '<span style="color:' + debtColor + ';">' + summary.totalDebt + '</span>';
                            break;
                        case 'features':
                            value = summary.features ? summary.features.length : 0;
                            break;
                        case 'taxRate':
                            value = summary.taxRate + '%';
                            break;
                        case 'religion':
                            value = dominant ? _escapeHtml(dominant.name) : '<span style="color:var(--dim);">None</span>';
                            break;
                        case 'unity':
                            var unityColor = unity >= 70 ? 'var(--success)' :
                                            unity >= 40 ? 'var(--accent)' :
                                            'var(--danger)';
                            value = '<span style="color:' + unityColor + ';">' + unity + '%</span>';
                            break;
                        case 'places':
                            value = places;
                            break;
                        // NEW: Civil law columns
                        case 'laws':
                            value = lawCount;
                            break;
                        case 'justice':
                            value = '<span style="text-transform:capitalize;">' + _escapeHtml(summary.justice?.severity || 'medium') + '</span>';
                            break;
                        default:
                            value = summary[col] || '';
                    }

                    html += '<td style="padding:6px 8px;">' + value + '</td>';
                }

                html += '</tr>';
            }

            html += '</tbody></table>';
            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER FEATURE LIST
    // =========================================================================

    function renderFeatureList(containerId, locationId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var features = _getSettlementFeatures(locationId);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;

            var gearIcon = _getIcon('GEAR');

            var html = '<div class="feature-list">';

            if (features.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);">No features built</div>';
            } else {
                for (var i = 0; i < features.length; i++) {
                    var f = features[i];
                    var isSelected = (selectedId === f.id);
                    var categoryLabel = f.category ? f.category.charAt(0).toUpperCase() + f.category.slice(1) : 'Other';

                    html +=
                        '<div class="feature-item" data-feature-id="' + f.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 8px 12px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.7rem;">' + gearIcon + ' ' + _escapeHtml(f.name) + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(categoryLabel) + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        (f.maintenance ? '<span>🔧 ' + f.maintenance + 'g/yr</span>' : '') +
                        (f.cost ? '<span>💰 ' + f.cost + 'g</span>' : '') +
                        (f.prosperityBonus ? '<span style="color:var(--success);">+ ' + f.prosperityBonus + '%</span>' : '') +
                        (isSelected ? '<span style="color: var(--success);">✓ Selected</span>' : '') +
                        '</div>' +
                        '</div>' +
                        (f.description ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(f.description) + '</div>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.feature-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var featureId = this.dataset.featureId;
                            var feature = SettlementQueries.getFeatureById(featureId);
                            if (feature) {
                                onSelect(feature);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. RENDER SETTLEMENT ROLES
    // =========================================================================

    function renderSettlementRoles(containerId, locationId, options) {
        if (_rendering) {
            return false;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var limit = options.limit || 10;
            var showMasters = options.showMasters !== undefined ? options.showMasters : true;
            var onRoleClick = options.onRoleClick || null;

            var stats = _getSettlementRoleStats(locationId);

            if (!stats) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No role data available</div>';
                return true;
            }

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');

            var html = '<div class="settlement-roles">';

            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
            html += '<div style="font-size: 0.6rem; color: var(--dim);">' +
                personIcon + ' ' + stats.totalProfessions + ' professions · ' + stats.uniqueRoles + ' unique roles</div>';
            html += '<button class="view-all-roles-btn" data-location-id="' + locationId + '" style="font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 8px; cursor: pointer;">View All</button>';
            html += '</div>';

            if (stats.topRoles.length === 0) {
                html += '<div style="color: var(--dim); text-align: center; padding: 10px; font-size: 0.55rem;">No roles found in this settlement</div>';
            } else {
                html += '<div style="display: flex; flex-direction: column; gap: 4px;">';

                for (var i = 0; i < Math.min(limit, stats.topRoles.length); i++) {
                    var role = stats.topRoles[i];
                    var barWidth = Math.max(5, role.percentage || 5);

                    html +=
                        '<div class="settlement-role-item" data-role-id="' + role.id + '" data-location-id="' + locationId + '" style="' +
                        'display: flex; align-items: center; gap: 8px; font-size: 0.6rem;' +
                        'padding: 4px 6px;' +
                        'border-radius: 4px;' +
                        'cursor: ' + (onRoleClick ? 'pointer' : 'default') + ';' +
                        'transition: background 0.1s;' +
                        '">' +
                        '<span style="min-width: 80px; color: var(--text);">' + _escapeHtml(role.name) + '</span>' +
                        '<div style="flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + barWidth + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right; color: var(--dim);">' + role.count + '</span>' +
                        '</div>';
                }

                if (stats.topRoles.length > limit) {
                    html += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding: 4px;">+' +
                        (stats.topRoles.length - limit) + ' more roles</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            var roleItems = container.querySelectorAll('.settlement-role-item');
            for (var i = 0; i < roleItems.length; i++) {
                (function(item) {
                    if (onRoleClick) {
                        item.addEventListener('click', function() {
                            var roleId = this.dataset.roleId;
                            var locId = this.dataset.locationId;
                            onRoleClick(roleId, locId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                    }
                })(roleItems[i]);
            }

            var viewAllBtn = container.querySelector('.view-all-roles-btn');
            if (viewAllBtn) {
                viewAllBtn.addEventListener('click', function() {
                    var locId = this.dataset.locationId;
                    if (typeof window.openSettlementRolesModal === 'function') {
                        window.openSettlementRolesModal(locId);
                    }
                });
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. RENDER SETTLEMENT MASTER LIST
    // =========================================================================

    function renderSettlementMasters(containerId, locationId, options) {
        if (_rendering) {
            return false;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var roleId = options.roleId || null;
            var limit = options.limit || 20;
            var onSelect = options.onSelect || null;

            var stats = typeof SettlementQueries !== 'undefined' ?
                SettlementQueries.getSettlementMasterStats(locationId, roleId) : null;

            if (!stats) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No master data available</div>';
                return true;
            }

            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');

            var html = '<div class="settlement-masters">';

            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
            html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                crownIcon + ' ' + stats.totalMasters + ' Masters · ' + stats.uniqueMasterRoles + ' roles</div>';
            html += '</div>';

            if (stats.totalMasters === 0) {
                html += '<div style="color: var(--dim); text-align: center; padding: 10px; font-size: 0.55rem;">No masters found in this settlement</div>';
            } else {
                var roleIds = Object.keys(stats.byRole);
                for (var i = 0; i < Math.min(5, roleIds.length); i++) {
                    var rId = roleIds[i];
                    var roleData = stats.byRole[rId];

                    html += '<div style="margin-bottom: 6px;">';
                    html += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 2px;">' +
                        _escapeHtml(roleData.name) + ' (' + roleData.count + ' masters)</div>';

                    var masters = roleData.masters || [];
                    for (var j = 0; j < Math.min(limit / roleIds.length, masters.length); j++) {
                        var m = masters[j];
                        html +=
                            '<div class="master-item" data-character-id="' + m.id + '" style="' +
                            'font-size: 0.55rem; padding: 2px 6px; ' +
                            'border-radius: 3px; ' +
                            'cursor: ' + (onSelect ? 'pointer' : 'default') + '; ' +
                            'transition: background 0.1s;' +
                            '">' +
                            personIcon + ' ' + _escapeHtml(m.name) + ' (Skill: ' + m.skillLevel + ')' +
                            '</div>';
                    }
                    html += '</div>';
                }

                if (roleIds.length > 5) {
                    html += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding: 4px;">+' +
                        (roleIds.length - 5) + ' more master roles</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            var masterItems = container.querySelectorAll('.master-item');
            for (var i = 0; i < masterItems.length; i++) {
                (function(item) {
                    if (onSelect) {
                        item.addEventListener('click', function() {
                            var charId = this.dataset.characterId;
                            onSelect(charId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                    }
                })(masterItems[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. RENDER SETTLEMENT APPRENTICESHIPS
    // =========================================================================

    function renderSettlementApprenticeships(containerId, locationId, options) {
        if (_rendering) return false;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var limit = options.limit || 5;
            var onMasterClick = options.onMasterClick || null;

            var density = _getSettlementApprenticeshipDensity(locationId);

            if (!density) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No apprenticeship data available</div>';
                return true;
            }

            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');

            var html = '<div class="settlement-apprenticeships">';

            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
            html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                crownIcon + ' ' + density.totalMasters + ' Masters · ' +
                personIcon + ' ' + density.totalApprentices + ' Apprentices</div>';
            html += '<span style="font-size: 0.5rem; color: var(--dim);">Ratio: ' + 
                density.masterToApprenticeRatio + ':1</span>';
            html += '</div>';

            var densityPercent = Math.min(100, (density.apprenticeDensity || 0) * 5);
            html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">';
            html += '<span style="font-size: 0.5rem; color: var(--dim); min-width: 60px;">Density</span>';
            html += '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">';
            html += '<div style="width: ' + densityPercent + '%; height: 100%; background: var(--accent); border-radius: 2px;"></div>';
            html += '</div>';
            html += '<span style="font-size: 0.5rem; color: var(--dim);">' + 
                (density.apprenticeDensity || 0) + '%</span>';
            html += '</div>';

            var topRoles = density.topRoles || [];
            if (topRoles.length > 0) {
                html += '<div style="font-size: 0.5rem; color: var(--dim); margin-bottom: 4px;">Apprentices by Role:</div>';
                html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
                for (var i = 0; i < Math.min(limit, topRoles.length); i++) {
                    var role = topRoles[i];
                    html += '<span style="font-size: 0.5rem; background: var(--bg2); padding: 2px 6px; border-radius: 4px; border-left: 2px solid var(--accent);">' +
                        _escapeHtml(role.name) + ': ' + role.count +
                        '</span>';
                }
                if (topRoles.length > limit) {
                    html += '<span style="font-size: 0.5rem; color: var(--dim);">+' + 
                        (topRoles.length - limit) + ' more</span>';
                }
                html += '</div>';
            }

            var topMasters = density.topMasters || [];
            if (topMasters.length > 0 && onMasterClick) {
                html += '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 8px; margin-bottom: 4px;">Top Masters:</div>';
                html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
                for (var i = 0; i < Math.min(3, topMasters.length); i++) {
                    var m = topMasters[i];
                    html += '<span class="master-click" data-char-id="' + m.id + '" style="font-size: 0.5rem; background: var(--bg2); padding: 2px 6px; border-radius: 4px; border-left: 2px solid var(--crown); cursor: pointer;">' +
                        crownIcon + ' ' + _escapeHtml(m.name) + ' (' + m.apprenticeCount + ' apps)' +
                        '</span>';
                }
                if (topMasters.length > 3) {
                    html += '<span style="font-size: 0.5rem; color: var(--dim);">+' + 
                        (topMasters.length - 3) + ' more</span>';
                }
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            if (onMasterClick) {
                var masterEls = container.querySelectorAll('.master-click');
                for (var i = 0; i < masterEls.length; i++) {
                    (function(el) {
                        el.addEventListener('click', function() {
                            var charId = this.dataset.charId;
                            onMasterClick(charId);
                        });
                        el.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--accent-dim)';
                        });
                        el.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg2)';
                        });
                    })(masterEls[i]);
                }
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 10. RENDER SETTLEMENT EDUCATION
    // =========================================================================

    function renderSettlementEducation(containerId, locationId, options) {
        if (_rendering) return false;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var onSchoolClick = options.onSchoolClick || null;
            var maxSchools = options.maxSchools || 3;

            var stats = _getSettlementEducationStats(locationId);

            if (!stats) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No education data available</div>';
                return true;
            }

            var bookIcon = _getIcon('BOOK');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var statusColor = stats.needsMoreSchools ? 'var(--warn)' : 'var(--success)';
            var statusText = stats.needsMoreSchools ? '⚠️ Needs more schools' : '✅ Adequate coverage';

            var coverageColor = stats.coverageRatio >= 80 ? 'var(--success)' :
                               stats.coverageRatio >= 50 ? 'var(--accent)' :
                               'var(--danger)';

            var html = '<div class="settlement-education">';

            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
            html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                bookIcon + ' ' + stats.totalInstitutions + ' Schools · ' +
                personIcon + ' ' + stats.totalStudents + ' Students</div>';
            html += '<span style="font-size: 0.5rem; color: ' + statusColor + ';">' + statusText + '</span>';
            html += '</div>';

            html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">';
            html += '<span style="font-size: 0.5rem; color: var(--dim); min-width: 60px;">Coverage</span>';
            html += '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">';
            html += '<div style="width: ' + Math.min(100, stats.coverageRatio) + '%; height: 100%; background: ' + coverageColor + '; border-radius: 2px;"></div>';
            html += '</div>';
            html += '<span style="font-size: 0.5rem; color: ' + coverageColor + ';">' + stats.coverageRatio + '%</span>';
            html += '</div>';

            html += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 0.55rem; margin-top: 6px;">';
            html += '<div style="background: var(--bg2); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                '<div style="color: var(--dim); font-size: 0.5rem;">Capacity</div>' +
                '<strong>' + stats.totalCapacity + '</strong>' +
                '</div>';
            html += '<div style="background: var(--bg2); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                '<div style="color: var(--dim); font-size: 0.5rem;">Teachers</div>' +
                '<strong>' + stats.totalTeachers + '</strong>' +
                '</div>';
            html += '<div style="background: var(--bg2); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                '<div style="color: var(--dim); font-size: 0.5rem;">Literacy</div>' +
                '<strong style="color: ' + (stats.literacyRate > 70 ? 'var(--success)' : 'var(--accent)') + ';">' + stats.literacyRate + '%</strong>' +
                '</div>';
            html += '</div>';

            if (stats.religiousSchools !== undefined && stats.religiousSchools > 0) {
                html += '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">' +
                    '⛪ ' + stats.religiousSchools + ' religious schools' +
                    '</div>';
            }

            if (stats.totalInstitutions > 0) {
                var schools = _getSettlementSchools(locationId, {});
                
                html += '<div style="margin-top: 8px;">';
                html += '<div style="font-size: 0.5rem; color: var(--dim); margin-bottom: 4px;">Schools:</div>';
                html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';

                for (var i = 0; i < Math.min(maxSchools, schools.length); i++) {
                    var s = schools[i];
                    var capUsed = s.capacityUsed || 0;
                    var capColor = capUsed > 90 ? 'var(--warn)' : (capUsed > 70 ? 'var(--accent)' : 'var(--success)');
                    var religionLabel = s.isReligiousSchool && s.religionName ? ' (' + _escapeHtml(s.religionName) + ')' : '';

                    html += '<span class="school-item" data-school-id="' + s.id + '" style="' +
                        'font-size: 0.5rem; background: var(--bg2); padding: 2px 8px; border-radius: 4px; ' +
                        'border-left: 2px solid ' + capColor + '; ' +
                        (onSchoolClick ? 'cursor: pointer;' : '') +
                        '">' +
                        bookIcon + ' ' + _escapeHtml(s.name) + ' (' + s.studentCount + '/' + s.capacity + ')' +
                        religionLabel +
                        '</span>';
                }

                if (schools.length > maxSchools) {
                    html += '<span style="font-size: 0.5rem; color: var(--dim);">+' + 
                        (schools.length - maxSchools) + ' more</span>';
                }

                html += '</div></div>';
            }

            html += '<div style="margin-top: 8px; padding: 4px 8px; background: var(--bg3); border-radius: 4px; font-size: 0.45rem; color: var(--dim); display: flex; justify-content: space-between;">';
            html += '<span>' + infoIcon + ' ' + stats.schoolAgePopulation + ' school-age children</span>';
            html += '<span>' + (stats.needsMoreSchools ? 'Need ' + stats.capacityGap + ' more seats' : 'Sufficient capacity') + '</span>';
            html += '</div>';

            html += '</div>';
            container.innerHTML = html;

            if (onSchoolClick) {
                var schoolItems = container.querySelectorAll('.school-item');
                for (var i = 0; i < schoolItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var schoolId = this.dataset.schoolId;
                            onSchoolClick(schoolId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg3)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg2)';
                        });
                    })(schoolItems[i]);
                }
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 11. RENDER PLACES OF WORSHIP
    // =========================================================================

    function renderPlacesOfWorship(containerId, locationId, options) {
        if (_rendering) return false;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var onPlaceClick = options.onPlaceClick || null;
            var limit = options.limit || 5;
            var includeDetails = options.includeDetails || false;

            var places = _getSettlementPlacesOfWorship(locationId, { includeDetails: includeDetails });
            var stats = _getPlaceOfWorshipStats(locationId);

            if (!places || places.length === 0) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No places of worship in this settlement</div>';
                return true;
            }

            var religionIcon = _getIcon('CIRCLE_DOT');
            var locationIcon = _getIcon('LOCATION');

            var html = '<div class="places-of-worship">';

            if (stats) {
                html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
                html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                    religionIcon + ' ' + stats.total + ' Places of Worship</div>';
                html += '<span style="font-size: 0.5rem; color: var(--dim);">' + stats.active + ' active · ' + stats.producingIncome + ' producing income</span>';
                html += '</div>';

                if (Object.keys(stats.byReligion).length > 1) {
                    html += '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">';
                    for (var relId in stats.byReligion) {
                        if (stats.byReligion.hasOwnProperty(relId)) {
                            var religion = _getReligion(relId);
                            var name = religion ? religion.name : 'Unknown';
                            html += '<span style="font-size: 0.5rem; background: var(--bg2); padding: 1px 6px; border-radius: 4px;">' +
                                _escapeHtml(name) + ': ' + stats.byReligion[relId] +
                                '</span>';
                        }
                    }
                    html += '</div>';
                }
            }

            var displayPlaces = limit > 0 ? places.slice(0, limit) : places;

            for (var i = 0; i < displayPlaces.length; i++) {
                var p = displayPlaces[i];
                var isActive = p.isActive !== false;
                var statusColor = isActive ? 'var(--success)' : 'var(--danger)';
                var statusLabel = isActive ? 'Active' : 'Inactive';

                var religion = p.religionId ? _getReligion(p.religionId) : null;
                var religionName = religion ? religion.name : (p.religionName || 'Unknown');

                html +=
                    '<div class="place-of-worship-item" data-place-id="' + p.id + '" style="' +
                    'background: var(--bg3);' +
                    'border: 1px solid var(--border);' +
                    'border-left: 3px solid ' + statusColor + ';' +
                    'border-radius: 4px;' +
                    'padding: 8px 12px;' +
                    'margin-bottom: 4px;' +
                    'cursor: ' + (onPlaceClick ? 'pointer' : 'default') + ';' +
                    'transition: all 0.1s;' +
                    '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                    '<div>' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(p.name || 'Unnamed Place') + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(p.type || 'temple') + '</span>' +
                    (p.religionName ? '<span style="font-size: 0.5rem; color: var(--accent); margin-left: 6px;">' + _escapeHtml(p.religionName) + '</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.5rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                    '<span style="color: ' + statusColor + ';">' + statusLabel + '</span>' +
                    (p.foundedYear ? '<span>Founded ' + p.foundedYear + '</span>' : '') +
                    (p.producesIncome ? '<span>💰 Tithes</span>' : '') +
                    (p.wealth ? '<span>💰 ' + p.wealth + 'g</span>' : '') +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }

            if (places.length > limit && limit > 0) {
                html += '<div style="text-align: center; font-size: 0.5rem; color: var(--dim); padding: 4px;">+' +
                    (places.length - limit) + ' more places of worship</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            if (onPlaceClick) {
                var placeItems = container.querySelectorAll('.place-of-worship-item');
                for (var i = 0; i < placeItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var placeId = this.dataset.placeId;
                            onPlaceClick(placeId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(placeItems[i]);
                }
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 12. RENDER RELIGIOUS DEMOGRAPHICS
    // =========================================================================

    function renderReligiousDemographics(containerId, locationId, options) {
        if (_rendering) return false;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showChart = options.showChart !== false;
            var onReligionClick = options.onReligionClick || null;

            var demographics = _getReligiousDemographics(locationId);
            var religions = _getSettlementReligions(locationId);
            var unity = _getReligiousUnity(locationId);
            var dominant = _getDominantReligion(locationId);

            if (!religions || Object.keys(religions).length === 0) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No religious data available</div>';
                return true;
            }

            var personIcon = _getIcon('PERSON');
            var religionIcon = _getIcon('CIRCLE_DOT');

            var unityColor = unity >= 70 ? 'var(--success)' :
                            unity >= 40 ? 'var(--accent)' :
                            'var(--danger)';

            var html = '<div class="religious-demographics">';

            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
            html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                religionIcon + ' Religious Demographics</div>';
            html += '<div style="font-size: 0.55rem; color: ' + unityColor + '; padding: 2px 8px; border: 1px solid ' + unityColor + '; border-radius: 12px;">Unity: ' + unity + '%</div>';
            html += '</div>';

            if (dominant) {
                html += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 6px;">' +
                    'Dominant: <strong>' + _escapeHtml(dominant.name) + '</strong>' +
                    '</div>';
            }

            var total = 0;
            var religionIds = Object.keys(religions);
            for (var i = 0; i < religionIds.length; i++) {
                total += religions[religionIds[i]].count || 0;
            }

            if (total > 0 && showChart) {
                var sorted = religionIds.sort(function(a, b) {
                    return (religions[b].count || 0) - (religions[a].count || 0);
                });

                html += '<div style="display: flex; flex-direction: column; gap: 3px;">';

                for (var i = 0; i < sorted.length; i++) {
                    var id = sorted[i];
                    var r = religions[id];
                    var percentage = total > 0 ? Math.round((r.count / total) * 100) : 0;
                    var barWidth = Math.max(2, percentage);

                    var color = id === 'unaffiliated' ? 'var(--dim)' :
                               (i === 0 ? 'var(--accent)' : 'var(--bg4)');

                    html +=
                        '<div class="religion-bar-item" data-religion-id="' + id + '" style="' +
                        'display: flex; align-items: center; gap: 6px; font-size: 0.5rem;' +
                        'cursor: ' + (onReligionClick ? 'pointer' : 'default') + ';' +
                        '">' +
                        '<span style="min-width: 60px; color: var(--dim);">' + _escapeHtml(r.name) + '</span>' +
                        '<div style="flex: 1; height: 8px; background: var(--bg3); border-radius: 2px; overflow: hidden;">' +
                        '<div style="width: ' + barWidth + '%; height: 100%; background: ' + color + '; border-radius: 2px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + r.count + '</span>' +
                        '<span style="min-width: 35px; text-align: right; color: var(--dim);">' + percentage + '%</span>' +
                        '</div>';
                }

                html += '</div>';
            } else {
                html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
                for (var id in religions) {
                    if (religions.hasOwnProperty(id)) {
                        var r = religions[id];
                        html += '<span style="font-size: 0.5rem; background: var(--bg2); padding: 2px 8px; border-radius: 4px;">' +
                            _escapeHtml(r.name) + ': ' + r.count +
                            '</span>';
                    }
                }
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            if (onReligionClick) {
                var barItems = container.querySelectorAll('.religion-bar-item');
                for (var i = 0; i < barItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var religionId = this.dataset.religionId;
                            onReligionClick(religionId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                    })(barItems[i]);
                }
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 13. RENDER CIVIL LAWS (NEW)
    // =========================================================================

    function renderCivilLawList(containerId, locationId, options) {
        if (_rendering) return false;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var onLawClick = options.onLawClick || null;
            var selectedLawId = options.selectedLawId || null;
            var showActions = options.showActions !== false;
            var limit = options.limit || 0;

            var laws = _getCivilLaws(locationId);
            var stats = _getCivilLawStatistics(locationId);

            if (!laws || laws.length === 0) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No civil laws in this settlement</div>';
                return true;
            }

            // Sort by severity (mortal first, then major, then minor)
            var severityOrder = { 'mortal': 0, 'major': 1, 'minor': 2, 'guideline': 3 };
            var displayLaws = limit > 0 ? laws.slice(0, limit) : laws;
            displayLaws = displayLaws.sort(function(a, b) {
                return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
            });

            var shieldIcon = _getIcon('SHIELD');
            var editIcon = _getIcon('EDIT');
            var deleteIcon = _getIcon('X_HEAVY');

            var html = '<div class="civil-law-list">';

            // Stats header
            if (stats) {
                html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">';
                html += '<div style="font-size: 0.6rem; color: var(--accent);">' +
                    shieldIcon + ' ' + stats.totalLaws + ' Civil Laws</div>';
                html += '<span style="font-size: 0.5rem; color: var(--dim);">' + stats.enforced + ' enforced · ' + stats.notEnforced + ' not enforced</span>';
                html += '</div>';

                // By severity summary
                var severityLabels = { 'minor': 'Minor', 'major': 'Major', 'mortal': 'Mortal' };
                var severityColors = { 'minor': 'var(--text-dim)', 'major': 'var(--warning)', 'mortal': 'var(--error)' };
                var severityKeys = ['mortal', 'major', 'minor'];
                html += '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">';
                for (var i = 0; i < severityKeys.length; i++) {
                    var key = severityKeys[i];
                    var count = stats.bySeverity[key] || 0;
                    if (count > 0) {
                        html += '<span style="font-size: 0.45rem; color: ' + severityColors[key] + '; background: var(--bg2); padding: 1px 8px; border-radius: 8px;">' +
                            severityLabels[key] + ': ' + count +
                            '</span>';
                    }
                }
                html += '</div>';
            }

            // List of laws
            for (var i = 0; i < displayLaws.length; i++) {
                var law = displayLaws[i];
                var isSelected = (selectedLawId === law.id);
                var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;
                var typeName = _getCivilLawTypeName(law.type);
                var domainName = _getCivilLawDomainName(law.domain);
                var severityName = _getCivilLawSeverityName(law.severity);
                var severityColor = _getCivilLawSeverityColor(law.severity);
                var typeIcon = _getCivilLawTypeIcon(law.type);

                var statusColor = isEnforced ? 'var(--success)' : 'var(--dim)';
                var statusLabel = isEnforced ? 'Enforced' : 'Not Enforced';

                var crimeTypeLabel = law.crimeMapping && law.crimeMapping.crimeType ? 
                    _escapeHtml(law.crimeMapping.crimeType) : 'None';
                var punishmentLabel = law.crimeMapping && law.crimeMapping.punishment ? 
                    _escapeHtml(law.crimeMapping.punishment) : 'None';

                html +=
                    '<div class="civil-law-item" data-law-id="' + law.id + '" style="' +
                    'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                    'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-left: 3px solid ' + severityColor + ';' +
                    'border-radius: 4px;' +
                    'padding: 8px 12px;' +
                    'margin-bottom: 4px;' +
                    'cursor: ' + (onLawClick ? 'pointer' : 'default') + ';' +
                    'transition: all 0.1s;' +
                    '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                    '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                    '<span style="font-size: 0.65rem; font-weight: bold;">' + typeIcon + ' ' + _escapeHtml(law.name) + '</span>' +
                    '<span style="font-size: 0.45rem; color: ' + severityColor + '; padding: 1px 6px; border: 1px solid ' + severityColor + '; border-radius: 8px;">' + severityName + '</span>' +
                    '<span style="font-size: 0.45rem; color: ' + statusColor + '; padding: 1px 6px; border: 1px solid ' + statusColor + '; border-radius: 8px;">' + statusLabel + '</span>' +
                    (isSelected ? '<span style="font-size: 0.45rem; background: var(--accent); padding: 1px 8px; border-radius: 8px; color: white;">Selected</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' +
                    'Domain: ' + domainName + ' · Type: ' + typeName +
                    (law.crimeMapping && law.crimeMapping.crimeType ? ' · Crime: ' + crimeTypeLabel : '') +
                    (law.crimeMapping && law.crimeMapping.punishment ? ' · Punishment: ' + punishmentLabel : '') +
                    '</div>' +
                    (law.description ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(law.description) + '</div>' : '') +
                    '</div>' +
                    (showActions ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="law-edit-btn" data-law-id="' + law.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.55rem; padding: 2px 4px;" title="Edit">' + editIcon + '</button>' +
                        '<button class="law-delete-btn" data-law-id="' + law.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 2px 4px;" title="Delete">' + deleteIcon + '</button>' +
                        '</div>' : '') +
                    '</div>' +
                    '</div>';
            }

            if (laws.length > limit && limit > 0) {
                html += '<div style="text-align: center; font-size: 0.5rem; color: var(--dim); padding: 4px;">+' +
                    (laws.length - limit) + ' more laws</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            if (onLawClick) {
                var lawItems = container.querySelectorAll('.civil-law-item');
                for (var i = 0; i < lawItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var lawId = this.dataset.lawId;
                            var locId = this.dataset.locationId || locationId;
                            onLawClick(lawId, locId);
                        });
                        item.addEventListener('mouseenter', function() {
                            if (this.dataset.lawId !== selectedLawId) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (this.dataset.lawId !== selectedLawId) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                    })(lawItems[i]);
                }
            }

            // Edit handlers
            var editBtns = container.querySelectorAll('.law-edit-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var lawId = this.dataset.lawId;
                        var locId = this.dataset.locationId;
                        if (typeof window.openEditCivilLawModal === 'function') {
                            window.openEditCivilLawModal(locId, lawId);
                        } else {
                            _showToast('Edit modal not available', 'error');
                        }
                    });
                })(editBtns[i]);
            }

            // Delete handlers
            var deleteBtns = container.querySelectorAll('.law-delete-btn');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var lawId = this.dataset.lawId;
                        var locId = this.dataset.locationId;
                        if (typeof window.openDeleteCivilLawModal === 'function') {
                            window.openDeleteCivilLawModal(locId, lawId);
                        } else {
                            _showToast('Delete modal not available', 'error');
                        }
                    });
                })(deleteBtns[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    function renderCivilLawTable(laws, options) {
        if (_rendering) return '';
        _rendering = true;

        try {
            options = options || {};
            var showActions = options.showActions !== false;
            var onLawClick = options.onLawClick || null;

            if (!laws || laws.length === 0) {
                return '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No civil laws</div>';
            }

            var html = '<table style="width:100%;border-collapse:collapse;font-size:0.65rem;">';
            html += '<thead><tr style="border-bottom:1px solid var(--border);">';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Name</th>';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Type</th>';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Domain</th>';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Severity</th>';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Enforced</th>';
            html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Punishment</th>';
            if (showActions) {
                html += '<th style="text-align:left;padding:4px 6px;color:var(--dim);font-weight:normal;">Actions</th>';
            }
            html += '</tr></thead><tbody>';

            var severityColors = {
                'minor': 'var(--text-dim)',
                'major': 'var(--warning)',
                'mortal': 'var(--error)'
            };

            for (var i = 0; i < laws.length; i++) {
                var law = laws[i];
                var severityColor = severityColors[law.severity] || 'var(--text)';
                var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;
                var typeName = _getCivilLawTypeName(law.type);
                var domainName = _getCivilLawDomainName(law.domain);
                var severityName = _getCivilLawSeverityName(law.severity);

                html += '<tr style="border-bottom:1px solid var(--border-light);">';
                html += '<td style="padding:4px 6px;">' + _escapeHtml(law.name) + '</td>';
                html += '<td style="padding:4px 6px;">' + typeName + '</td>';
                html += '<td style="padding:4px 6px;">' + domainName + '</td>';
                html += '<td style="padding:4px 6px;color:' + severityColor + ';">' + severityName + '</td>';
                html += '<td style="padding:4px 6px;color:' + (isEnforced ? 'var(--success)' : 'var(--dim)') + ';">' + (isEnforced ? '✓' : '✕') + '</td>';
                html += '<td style="padding:4px 6px;">' + (law.crimeMapping && law.crimeMapping.punishment ? _escapeHtml(law.crimeMapping.punishment) : '—') + '</td>';
                if (showActions) {
                    html += '<td style="padding:4px 6px;">' +
                        '<button class="law-view-btn" data-law-id="' + law.id + '" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.5rem;">View</button>' +
                        '</td>';
                }
                html += '</tr>';
            }

            html += '</tbody></table>';
            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.SettlementUI = {
        renderSettlementList: renderSettlementList,
        renderSettlementCard: renderSettlementCard,
        renderSettlementTable: renderSettlementTable,
        renderFeatureList: renderFeatureList,
        renderSettlementRoles: renderSettlementRoles,
        renderSettlementMasters: renderSettlementMasters,
        renderSettlementApprenticeships: renderSettlementApprenticeships,
        renderSettlementEducation: renderSettlementEducation,
        renderPlacesOfWorship: renderPlacesOfWorship,
        renderReligiousDemographics: renderReligiousDemographics,
        // NEW: Civil Law UI
        renderCivilLawList: renderCivilLawList,
        renderCivilLawTable: renderCivilLawTable
    };

})();