/**
 * =============================================================================
 * SETTLEMENT HISTORY TAB - UI for settlement history timeline
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement History tab.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;
    var _filterTimeout = null;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getSettlementSummary(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary) {
            return SettlementQueries.getSettlementSummary(locationId);
        }
        return null;
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _getSettlementHistory(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementHistory) {
            return SettlementState.getSettlementHistory(locationId);
        }
        return [];
    }

    function _getSettlementFeatures(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementFeatures) {
            return SettlementState.getSettlementFeatures(locationId);
        }
        return [];
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementBudget(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementBudget) {
            return SettlementState.getSettlementBudget(locationId);
        }
        return null;
    }

    function _getFeatureById(featureId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getFeatureById) {
            return SettlementQueries.getFeatureById(featureId);
        }
        return null;
    }

    function _getReligion(id) {
        if (typeof ReligionState !== 'undefined' && ReligionState.getReligion) {
            return ReligionState.getReligion(id);
        }
        return null;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 4. EVENT TYPE CONFIGURATION
    // =========================================================================

    var EVENT_TYPES = {
        'created': { label: 'Created', icon: 'STAR_4', color: 'var(--accent)', category: 'lifecycle' },
        'upgraded': { label: 'Upgraded', icon: 'ARROW_UP', color: 'var(--success)', category: 'lifecycle' },
        'auto_upgraded': { label: 'Auto-Upgraded', icon: 'ARROW_UP', color: 'var(--success)', category: 'lifecycle' },
        'feature_built': { label: 'Feature Built', icon: 'GEAR', color: 'var(--accent)', category: 'features' },
        'feature_removed': { label: 'Feature Removed', icon: 'GEAR', color: 'var(--warn)', category: 'features' },
        'feature_demolished': { label: 'Feature Demolished', icon: 'TRASH', color: 'var(--danger)', category: 'features' },
        'budget_allocated': { label: 'Budget Allocated', icon: 'COIN', color: 'var(--success)', category: 'economy' },
        'education_budget_allocated': { label: 'Education Budget', icon: 'BOOK', color: 'var(--accent)', category: 'economy' },
        'government_budget_allocated': { label: 'Gov Salary Budget', icon: 'COIN', color: 'var(--accent)', category: 'economy' },
        'tax_rate_change': { label: 'Tax Rate Changed', icon: 'COIN', color: 'var(--warn)', category: 'economy' },
        'trade_tariff_change': { label: 'Trade Tariff Changed', icon: 'COIN', color: 'var(--warn)', category: 'economy' },
        'industry_tax_rate_change': { label: 'Industry Tax Changed', icon: 'COIN', color: 'var(--warn)', category: 'economy' },
        'wealth_change': { label: 'Wealth Changed', icon: 'COIN', color: 'var(--warn)', category: 'economy' },
        'debt_change': { label: 'Debt Changed', icon: 'COIN', color: 'var(--danger)', category: 'economy' },
        'debt_interest': { label: 'Debt Interest', icon: 'COIN', color: 'var(--danger)', category: 'economy' },
        'public_enterprise_profit': { label: 'Public Enterprise Profit', icon: 'COIN', color: 'var(--success)', category: 'economy' },
        'dominant_religion_changed': { label: 'Dominant Religion Changed', icon: 'CIRCLE_DOT', color: 'var(--warn)', category: 'religion' },
        'place_of_worship_added': { label: 'Place of Worship Added', icon: 'LOCATION', color: 'var(--accent)', category: 'religion' },
        'place_of_worship_removed': { label: 'Place of Worship Removed', icon: 'LOCATION', color: 'var(--danger)', category: 'religion' },
        'civil_law_added': { label: 'Civil Law Added', icon: 'SHIELD', color: 'var(--accent)', category: 'laws' },
        'civil_law_updated': { label: 'Civil Law Updated', icon: 'SHIELD', color: 'var(--warn)', category: 'laws' },
        'civil_law_removed': { label: 'Civil Law Removed', icon: 'SHIELD', color: 'var(--danger)', category: 'laws' },
        'role_assigned': { label: 'Role Assigned', icon: 'PERSON', color: 'var(--accent)', category: 'roles' },
        'role_removed': { label: 'Role Removed', icon: 'PERSON', color: 'var(--danger)', category: 'roles' },
        'skill_updated': { label: 'Skill Updated', icon: 'STAR_4', color: 'var(--accent)', category: 'roles' },
        'state_enterprise_created': { label: 'State Enterprise Created', icon: 'GEAR', color: 'var(--accent)', category: 'enterprises' },
        'state_enterprise_removed': { label: 'State Enterprise Removed', icon: 'GEAR', color: 'var(--danger)', category: 'enterprises' },
        'public_enterprise_added': { label: 'Public Enterprise Added', icon: 'GEAR', color: 'var(--accent)', category: 'enterprises' },
        'public_enterprise_removed': { label: 'Public Enterprise Removed', icon: 'GEAR', color: 'var(--danger)', category: 'enterprises' },
        'justice_changed': { label: 'Justice Severity Changed', icon: 'SHIELD', color: 'var(--warn)', category: 'justice' },
        'watch_changed': { label: 'Watch Changed', icon: 'SHIELD', color: 'var(--warn)', category: 'justice' },
        'government_changed': { label: 'Government Changed', icon: 'STAR_4', color: 'var(--warn)', category: 'government' },
        'specialization_set': { label: 'Specialization Set', icon: 'STAR_4', color: 'var(--accent)', category: 'government' },
        'annual_processed': { label: 'Annual Processed', icon: 'REFRESH', color: 'var(--dim)', category: 'annual' },
        'default': { label: 'Event', icon: 'CIRCLE_DOT', color: 'var(--dim)', category: 'other' }
    };

    function _getEventType(event) {
        var type = event.type || 'default';
        return EVENT_TYPES[type] || EVENT_TYPES['default'];
    }

    function _getEventCategory(event) {
        var type = _getEventType(event);
        return type.category || 'other';
    }

    function _getEventIcon(event) {
        var type = _getEventType(event);
        return _icon(type.icon) || _icon('CIRCLE_DOT');
    }

    function _getEventColor(event) {
        var type = _getEventType(event);
        return type.color || 'var(--dim)';
    }

    function _getEventLabel(event) {
        var type = _getEventType(event);
        return type.label || event.type || 'Event';
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementHistory(containerId, locationId, summary) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            if (!summary) {
                summary = _getSettlementSummary(locationId);
                if (!summary) {
                    container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                    _rendering = false;
                    return;
                }
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            var history = _getSettlementHistory(locationId);
            var features = _getSettlementFeatures(locationId);
            var population = _getLocationPopulationCount(locationId);

            var filterState = _loadFilterState(locationId);

            var BOOK = _icon('BOOK');
            var INFO = _icon('CIRCLE_DOT');
            var SEARCH = _icon('SEARCH');
            var REFRESH = _icon('REFRESH');
            var TRASH = _icon('TRASH');
            var COIN = _icon('COIN');
            var GEAR = _icon('GEAR');
            var PERSON = _icon('PERSON');
            var SHIELD = _icon('SHIELD');
            var STAR = _icon('STAR_4');
            var CIRCLE = _icon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + BOOK + ' Settlement History</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + ' · ' + history.length + ' events recorded</div>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                '<button class="history-action-btn" data-action="refresh" style="font-size: 0.55rem; padding: 3px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '<button class="history-action-btn" data-action="export" style="font-size: 0.55rem; padding: 3px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + COIN + ' Export</button>' +
                (history.length > 0 ? '<button class="history-action-btn" data-action="clear" style="font-size: 0.55rem; padding: 3px 10px; background: var(--bg3); border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; color: var(--danger-lt);">' + TRASH + ' Clear</button>' : '') +
                '</div>' +
                '</div>';

            // FILTERS
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 8px;">' +
                '<div>' +
                '<label style="font-size: 0.55rem; color: var(--dim); display: block; margin-bottom: 2px;">' + SEARCH + ' Search</label>' +
                '<input type="text" id="historySearch" value="' + _escapeHtml(filterState.search || '') + '" placeholder="Search events..." style="width:100%; padding:4px 8px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.6rem;">' +
                '</div>' +
                '<div>' +
                '<label style="font-size: 0.55rem; color: var(--dim); display: block; margin-bottom: 2px;">Category</label>' +
                '<select id="historyCategory" style="width:100%; padding:4px 8px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.6rem;">' +
                '<option value="all" ' + (filterState.category === 'all' ? 'selected' : '') + '>All Categories</option>' +
                '<option value="lifecycle" ' + (filterState.category === 'lifecycle' ? 'selected' : '') + '>Lifecycle</option>' +
                '<option value="features" ' + (filterState.category === 'features' ? 'selected' : '') + '>Features</option>' +
                '<option value="economy" ' + (filterState.category === 'economy' ? 'selected' : '') + '>Economy</option>' +
                '<option value="religion" ' + (filterState.category === 'religion' ? 'selected' : '') + '>Religion</option>' +
                '<option value="laws" ' + (filterState.category === 'laws' ? 'selected' : '') + '>Civil Laws</option>' +
                '<option value="roles" ' + (filterState.category === 'roles' ? 'selected' : '') + '>Roles</option>' +
                '<option value="enterprises" ' + (filterState.category === 'enterprises' ? 'selected' : '') + '>Enterprises</option>' +
                '<option value="justice" ' + (filterState.category === 'justice' ? 'selected' : '') + '>Justice</option>' +
                '<option value="government" ' + (filterState.category === 'government' ? 'selected' : '') + '>Government</option>' +
                '<option value="annual" ' + (filterState.category === 'annual' ? 'selected' : '') + '>Annual</option>' +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="font-size: 0.55rem; color: var(--dim); display: block; margin-bottom: 2px;">Year Range</label>' +
                '<div style="display: flex; gap: 4px;">' +
                '<input type="number" id="historyYearStart" value="' + (filterState.yearStart || '') + '" placeholder="From" style="width:50%; padding:4px 6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.55rem;">' +
                '<input type="number" id="historyYearEnd" value="' + (filterState.yearEnd || '') + '" placeholder="To" style="width:50%; padding:4px 6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.55rem;">' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                '<span style="font-size: 0.5rem; color: var(--dim);" id="historyCountDisplay">Showing ' + history.length + ' events</span>' +
                '<button id="historyClearFilters" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + _icon('X_HEAVY') + ' Clear Filters</button>' +
                '</div>' +
                '</div>';

            // STATISTICS SUMMARY
            if (history.length > 0) {
                var categoryCounts = {};
                for (var i = 0; i < history.length; i++) {
                    var cat = _getEventCategory(history[i]);
                    if (!categoryCounts[cat]) categoryCounts[cat] = 0;
                    categoryCounts[cat]++;
                }

                var categoryLabels = {
                    'lifecycle': STAR + ' Lifecycle',
                    'features': GEAR + ' Features',
                    'economy': COIN + ' Economy',
                    'religion': CIRCLE + ' Religion',
                    'laws': SHIELD + ' Laws',
                    'roles': PERSON + ' Roles',
                    'enterprises': GEAR + ' Enterprises',
                    'justice': SHIELD + ' Justice',
                    'government': STAR + ' Government',
                    'annual': REFRESH + ' Annual',
                    'other': CIRCLE + ' Other'
                };

                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + COIN + ' Event Statistics</div>' +
                    '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

                var sortedCategories = Object.keys(categoryCounts).sort(function(a, b) {
                    return categoryCounts[b] - categoryCounts[a];
                });

                for (var i = 0; i < sortedCategories.length; i++) {
                    var cat = sortedCategories[i];
                    var count = categoryCounts[cat];
                    var label = categoryLabels[cat] || cat;
                    content += '<span style="font-size: 0.5rem; background: var(--bg); padding: 2px 10px; border-radius: 12px; border: 1px solid var(--border); color: var(--text);">' +
                        label + ': <strong>' + count + '</strong>' +
                        '</span>';
                }

                content += '</div></div>';
            }

            // TIMELINE
            if (history.length === 0) {
                content += '<div style="background: var(--bg2); padding: 40px; border-radius: 8px; text-align: center; color: var(--dim); font-size: 0.7rem; border: 1px solid var(--border);">' +
                    BOOK + ' No historical events recorded for this settlement yet.<br>' +
                    '<span style="font-size: 0.6rem;">Events will appear as the settlement grows and changes.</span>' +
                    '</div>';
            } else {
                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + BOOK + ' Timeline</div>' +
                    '<div id="historyTimeline">' +
                    _renderTimeline(history, filterState) +
                    '</div>' +
                    '</div>';
            }

            // INFO FOOTER
            content += '<div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' History tracks all significant events in the settlement\'s life. Events are automatically recorded when changes occur.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER TIMELINE
    // =========================================================================

    function _renderTimeline(history, filterState) {
        var filtered = _filterHistory(history, filterState);

        if (filtered.length === 0) {
            return '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.6rem;">No events match the current filters</div>';
        }

        var grouped = {};
        for (var i = 0; i < filtered.length; i++) {
            var event = filtered[i];
            var year = event.year || 'Unknown';
            if (!grouped[year]) grouped[year] = [];
            grouped[year].push(event);
        }

        var years = Object.keys(grouped).sort(function(a, b) {
            if (a === 'Unknown') return 1;
            if (b === 'Unknown') return -1;
            return parseInt(b) - parseInt(a);
        });

        var html = '<div class="history-timeline" style="position:relative; padding-left: 24px;">';
        html += '<div style="position:absolute; left:6px; top:0; bottom:0; width:2px; background:var(--border);"></div>';

        for (var y = 0; y < years.length; y++) {
            var year = years[y];
            var events = grouped[year];

            html += '<div style="margin-bottom: 12px; position:relative;">' +
                '<div style="position:absolute; left:-18px; top:6px; width:12px; height:12px; border-radius:50%; background:var(--accent); border:2px solid var(--bg2);"></div>' +
                '<div style="font-size: 0.7rem; font-weight: bold; color: var(--accent-light); margin-bottom: 4px;">' + year + ' (' + events.length + ' events)</div>';

            for (var i = 0; i < events.length; i++) {
                var event = events[i];
                html += _renderEventItem(event);
            }

            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. RENDER EVENT ITEM
    // =========================================================================

    function _renderEventItem(event) {
        var icon = _getEventIcon(event);
        var color = _getEventColor(event);
        var label = _getEventLabel(event);
        var category = _getEventCategory(event);

        var details = _formatEventDetails(event);

        var html = '<div class="history-event" style="' +
            'background: var(--bg); border: 1px solid var(--border); border-left: 3px solid ' + color + ';' +
            'border-radius: 4px; padding: 6px 10px; margin-bottom: 4px; cursor: pointer;' +
            'transition: background 0.1s;' +
            '" data-event-index="' + (event._index || 0) + '">' +
            '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">' +
            '<div style="flex: 1; min-width: 0;">' +
            '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
            '<span style="font-size: 0.55rem; color: ' + color + ';">' + icon + '</span>' +
            '<span style="font-size: 0.6rem; font-weight: bold; color: ' + color + ';">' + label + '</span>' +
            '<span style="font-size: 0.45rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--border); border-radius: 8px;">' + category + '</span>' +
            '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px; word-break: break-word;">' + _escapeHtml(details.summary) + '</div>' +
            '</div>' +
            '<div style="flex-shrink: 0; font-size: 0.5rem; color: var(--dim);">' +
            '<span class="event-toggle" style="cursor:pointer;">' + _icon('ARROW_DOWN') + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="event-details" style="display:none; margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border-light); font-size: 0.55rem; color: var(--dim);">' +
            details.full +
            '</div>' +
            '</div>';

        return html;
    }

    // =========================================================================
    // 8. FORMAT EVENT DETAILS
    // =========================================================================

    function _formatEventDetails(event) {
        var summary = '';
        var full = '';

        if (event.featureName) {
            summary = 'Feature: ' + event.featureName;
            if (event.cost) summary += ' (Cost: ' + event.cost + 'g)';
        } else if (event.featureId) {
            var feature = _getFeatureById(event.featureId);
            summary = 'Feature: ' + (feature ? feature.name : event.featureId);
        } else if (event.fromRank && event.toRank) {
            summary = 'Upgraded from ' + event.fromRank + ' to ' + event.toRank;
            if (event.population) summary += ' (Population: ' + event.population + ')';
        } else if (event.oldRole && event.newRole) {
            summary = 'Specialization changed from ' + (event.oldRole || 'None') + ' to ' + (event.newRole || 'None');
        } else if (event.oldRate !== undefined && event.newRate !== undefined) {
            summary = event.type.replace('_change', '').replace('_', ' ') + ': ' + event.oldRate + '% → ' + event.newRate + '%';
        } else if (event.amount) {
            if (event.type === 'wealth_change' || event.type === 'debt_change') {
                summary = event.reason || 'Changed by ' + event.amount + 'g';
            } else {
                summary = event.amount + 'g';
            }
            if (event.newWealth !== undefined) summary += ' (New wealth: ' + event.newWealth + 'g)';
        } else if (event.action) {
            summary = event.action;
        } else if (event.event) {
            summary = event.event;
        } else if (event.message) {
            summary = event.message;
        } else if (event.details) {
            if (typeof event.details === 'string') {
                summary = event.details;
            } else if (event.details.totalProfit !== undefined) {
                summary = 'Total profit: ' + event.details.totalProfit + 'g';
            } else {
                summary = JSON.stringify(event.details);
            }
        } else if (event.reason) {
            summary = event.reason;
        } else {
            summary = event.type || 'Event';
        }

        var lines = [];
        for (var key in event) {
            if (key === '_index' || key === 'type' || key === 'year') continue;
            if (event[key] === null || event[key] === undefined) continue;
            if (typeof event[key] === 'object') {
                lines.push('<strong>' + key + ':</strong> ' + JSON.stringify(event[key]));
            } else {
                lines.push('<strong>' + key + ':</strong> ' + _escapeHtml(String(event[key])));
            }
        }

        if (lines.length > 0) {
            full = lines.join('<br>');
        } else {
            full = 'No additional details';
        }

        return { summary: summary, full: full };
    }

    // =========================================================================
    // 9. FILTER HISTORY
    // =========================================================================

    function _filterHistory(history, filterState) {
        var filtered = [];
        var search = (filterState.search || '').toLowerCase().trim();
        var category = filterState.category || 'all';
        var yearStart = filterState.yearStart ? parseInt(filterState.yearStart) : null;
        var yearEnd = filterState.yearEnd ? parseInt(filterState.yearEnd) : null;

        for (var i = 0; i < history.length; i++) {
            var event = history[i];
            event._index = i;

            if (category !== 'all') {
                var eventCategory = _getEventCategory(event);
                if (eventCategory !== category) continue;
            }

            var year = event.year;
            if (yearStart !== null && year !== undefined) {
                if (year < yearStart) continue;
            }
            if (yearEnd !== null && year !== undefined) {
                if (year > yearEnd) continue;
            }

            if (search) {
                var searchable = '';
                for (var key in event) {
                    if (key === '_index') continue;
                    if (typeof event[key] === 'string') {
                        searchable += event[key] + ' ';
                    } else if (typeof event[key] === 'number') {
                        searchable += event[key] + ' ';
                    }
                }
                if (!searchable.toLowerCase().includes(search)) continue;
            }

            filtered.push(event);
        }

        return filtered;
    }

    // =========================================================================
    // 10. LOAD/SAVE FILTER STATE
    // =========================================================================

    function _loadFilterState(locationId) {
        var key = 'settlement_history_filters_' + locationId;
        try {
            var stored = localStorage.getItem(key);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch(e) {}
        return { search: '', category: 'all', yearStart: '', yearEnd: '' };
    }

    function _saveFilterState(locationId, state) {
        var key = 'settlement_history_filters_' + locationId;
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch(e) {}
    }

    // =========================================================================
    // 11. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var actionBtns = container.querySelectorAll('.history-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'refresh':
                            renderSettlementHistory('tab-history', locationId, _getSettlementSummary(locationId));
                            break;
                        case 'export':
                            _exportHistory(locationId);
                            break;
                        case 'clear':
                            _clearHistory(locationId);
                            break;
                    }
                });
            })(actionBtns[i]);
        }

        var searchInput = container.querySelector('#historySearch');
        var categorySelect = container.querySelector('#historyCategory');
        var yearStartInput = container.querySelector('#historyYearStart');
        var yearEndInput = container.querySelector('#historyYearEnd');
        var clearFiltersBtn = container.querySelector('#historyClearFilters');

        function applyFilters() {
            var state = {
                search: searchInput ? searchInput.value : '',
                category: categorySelect ? categorySelect.value : 'all',
                yearStart: yearStartInput ? yearStartInput.value : '',
                yearEnd: yearEndInput ? yearEndInput.value : ''
            };
            _saveFilterState(locationId, state);

            var timelineContainer = container.querySelector('#historyTimeline');
            var history = _getSettlementHistory(locationId);
            if (timelineContainer) {
                timelineContainer.innerHTML = _renderTimeline(history, state);
                _attachEventClickHandlers(timelineContainer, locationId);
            }

            var countDisplay = container.querySelector('#historyCountDisplay');
            if (countDisplay) {
                var filtered = _filterHistory(history, state);
                countDisplay.textContent = 'Showing ' + filtered.length + ' of ' + history.length + ' events';
            }
        }

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                if (_filterTimeout) clearTimeout(_filterTimeout);
                _filterTimeout = setTimeout(applyFilters, 300);
            });
        }

        if (categorySelect) {
            categorySelect.addEventListener('change', applyFilters);
        }

        if (yearStartInput) {
            yearStartInput.addEventListener('change', applyFilters);
        }

        if (yearEndInput) {
            yearEndInput.addEventListener('change', applyFilters);
        }

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', function() {
                if (searchInput) searchInput.value = '';
                if (categorySelect) categorySelect.value = 'all';
                if (yearStartInput) yearStartInput.value = '';
                if (yearEndInput) yearEndInput.value = '';
                applyFilters();
            });
        }

        var timelineContainer = container.querySelector('#historyTimeline');
        if (timelineContainer) {
            _attachEventClickHandlers(timelineContainer, locationId);
        }
    }

    // =========================================================================
    // 12. EVENT CLICK HANDLERS
    // =========================================================================

    function _attachEventClickHandlers(container, locationId) {
        var events = container.querySelectorAll('.history-event');
        for (var i = 0; i < events.length; i++) {
            (function(el) {
                el.addEventListener('click', function(e) {
                    if (e.target.closest('button')) return;

                    var details = this.querySelector('.event-details');
                    var toggle = this.querySelector('.event-toggle');
                    if (details) {
                        if (details.style.display === 'none') {
                            details.style.display = 'block';
                            if (toggle) toggle.textContent = _icon('ARROW_UP');
                        } else {
                            details.style.display = 'none';
                            if (toggle) toggle.textContent = _icon('ARROW_DOWN');
                        }
                    }
                });
                el.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--bg3)';
                });
                el.addEventListener('mouseleave', function() {
                    this.style.background = 'var(--bg)';
                });
            })(events[i]);
        }
    }

    // =========================================================================
    // 13. EXPORT HISTORY
    // =========================================================================

    function _exportHistory(locationId) {
        try {
            var history = _getSettlementHistory(locationId);
            var place = _getPlaceById(locationId);

            if (history.length === 0) {
                _showToast('No history to export', 'warning');
                return;
            }

            var data = {
                settlement: place ? place.displayName : 'Unknown',
                locationId: locationId,
                exportDate: new Date().toISOString(),
                totalEvents: history.length,
                events: history
            };

            var json = JSON.stringify(data, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            var timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            a.download = 'settlement_history_' + (place ? place.displayName : locationId) + '_' + timestamp + '.json';
            a.click();
            URL.revokeObjectURL(url);

            _showToast('History exported successfully', 'success');

        } catch(e) {
            _showToast('Failed to export history: ' + e.message, 'error');
        }
    }

    // =========================================================================
    // 14. CLEAR HISTORY
    // =========================================================================

    function _clearHistory(locationId) {
        var place = _getPlaceById(locationId);
        var history = _getSettlementHistory(locationId);

        if (history.length === 0) {
            _showToast('No history to clear', 'warning');
            return;
        }

        _confirmDialog(
            'Clear all history for ' + (place ? place.displayName : 'this settlement') + '?\n\n' +
            'This will permanently delete ' + history.length + ' historical events.\n\n' +
            'This action cannot be undone.',
            'Clear History',
            function() {
                var data = _getSettlementData(locationId);
                if (data) {
                    data.history = [];
                    if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                        SettlementState._updateSettlementData(locationId, { history: [] });
                        _showToast('History cleared', 'info');
                        renderSettlementHistory('tab-history', locationId, _getSettlementSummary(locationId));
                    } else {
                        _showToast('Failed to clear history', 'error');
                    }
                }
            }
        );
    }

    // =========================================================================
    // 15. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('history', renderSettlementHistory, true);
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.renderSettlementHistory = renderSettlementHistory;
    window._renderSettlementHistory = renderSettlementHistory;

})();