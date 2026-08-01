/**
 * =============================================================================
 * HOUSEHOLD ACTIVITY LOG TAB (household-activity-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Displays all household events, history, and transactions in a
 *          filterable, searchable timeline view.
 * 
 * FEATURES:
 *   - Chronological timeline of all household events
 *   - Filter by event type (members, economy, enterprise, residence, etc.)
 *   - Search by keyword
 *   - Click events for details
 *   - Event count by type
 *   - Year range filtering
 * 
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdCommands (household-commands.js)
 *   - HouseholdQueries (household-queries.js)
 *   - HouseholdEconomy (household-economy.js)
 *   - ResidenceSystem (residence-system.js)
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _currentHouseholdId = null;

    // =========================================================================
    // 2. GET CURRENT HOUSEHOLD ID
    // =========================================================================

    function _getCurrentHouseholdId() {
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getEconomy() {
        return typeof window.HouseholdEconomy !== 'undefined' ? window.HouseholdEconomy : null;
    }

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
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

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 5. EVENT TYPE CONFIGURATION
    // =========================================================================

    var EVENT_TYPES = {
        // Member events
        member_added: { 
            label: 'Member Added', 
            icon: 'PERSON_PLUS', 
            color: '#4a9e6a',
            category: 'members',
            priority: 1
        },
        member_removed: { 
            label: 'Member Removed', 
            icon: 'PERSON_MINUS', 
            color: '#c87040',
            category: 'members',
            priority: 1
        },
        member_updated: { 
            label: 'Member Updated', 
            icon: 'EDIT', 
            color: '#c8a844',
            category: 'members',
            priority: 2
        },
        member_transferred_out: { 
            label: 'Member Transferred Out', 
            icon: 'ARROW_RIGHT', 
            color: '#c87040',
            category: 'members',
            priority: 1
        },
        member_transferred_in: { 
            label: 'Member Transferred In', 
            icon: 'ARROW_LEFT', 
            color: '#4a9e6a',
            category: 'members',
            priority: 1
        },
        head_changed: { 
            label: 'Head Changed', 
            icon: 'CROWN', 
            color: '#c8a844',
            category: 'members',
            priority: 0
        },
        head_appointed: { 
            label: 'Head Appointed', 
            icon: 'CROWN_PLUS', 
            color: '#c8a844',
            category: 'members',
            priority: 0
        },
        head_removed: { 
            label: 'Head Removed', 
            icon: 'CROWN_MINUS', 
            color: '#c87040',
            category: 'members',
            priority: 0
        },

        // Department events
        department_added: { 
            label: 'Department Created', 
            icon: 'PLUS', 
            color: '#4a8a9e',
            category: 'departments',
            priority: 2
        },
        department_deleted: { 
            label: 'Department Deleted', 
            icon: 'X_HEAVY', 
            color: '#c87040',
            category: 'departments',
            priority: 2
        },
        department_updated: { 
            label: 'Department Updated', 
            icon: 'EDIT', 
            color: '#c8a844',
            category: 'departments',
            priority: 2
        },

        // Position events
        position_created: { 
            label: 'Position Created', 
            icon: 'PERSON_PLUS', 
            color: '#4a8a9e',
            category: 'positions',
            priority: 2
        },
        position_updated: { 
            label: 'Position Updated', 
            icon: 'EDIT', 
            color: '#c8a844',
            category: 'positions',
            priority: 2
        },
        position_deleted: { 
            label: 'Position Deleted', 
            icon: 'X_HEAVY', 
            color: '#c87040',
            category: 'positions',
            priority: 2
        },
        assigned_to_position: { 
            label: 'Staff Assigned', 
            icon: 'PERSON_CHECK', 
            color: '#4a9e6a',
            category: 'positions',
            priority: 1
        },
        assignment_ended: { 
            label: 'Assignment Ended', 
            icon: 'PERSON_MINUS', 
            color: '#c87040',
            category: 'positions',
            priority: 2
        },

        // Economy events
        wealth_change: { 
            label: 'Wealth Changed', 
            icon: 'COIN', 
            color: '#c8a844',
            category: 'economy',
            priority: 2
        },
        debt_change: { 
            label: 'Debt Changed', 
            icon: 'COIN_MINUS', 
            color: '#c87040',
            category: 'economy',
            priority: 2
        },
        salary_added: { 
            label: 'Salary Received', 
            icon: 'COIN_PLUS', 
            color: '#4a9e6a',
            category: 'economy',
            priority: 2
        },
        tuition_deducted: { 
            label: 'Tuition Paid', 
            icon: 'COIN_MINUS', 
            color: '#c87040',
            category: 'economy',
            priority: 2
        },
        school_profit_added: { 
            label: 'School Profit', 
            icon: 'COIN_PLUS', 
            category: 'economy',
            color: '#4a9e6a',
            priority: 2
        },
        enterprise_profit: { 
            label: 'Enterprise Profit', 
            icon: 'INDUSTRY_PLUS', 
            color: '#4a9e6a',
            category: 'economy',
            priority: 1
        },
        enterprise_loss: { 
            label: 'Enterprise Loss', 
            icon: 'INDUSTRY_MINUS', 
            color: '#c87040',
            category: 'economy',
            priority: 1
        },
        economic_event: { 
            label: 'Economic Event', 
            icon: 'WARNING', 
            color: '#c8a844',
            category: 'economy',
            priority: 2
        },
        bankruptcy: { 
            label: 'Bankruptcy', 
            icon: 'WARNING', 
            color: '#8a2020',
            category: 'economy',
            priority: 0
        },
        recovery: { 
            label: 'Recovery', 
            icon: 'CHECK_SIMPLE', 
            color: '#4a9e6a',
            category: 'economy',
            priority: 1
        },
        rent_income: { 
            label: 'Rent Income', 
            icon: 'HOME_PLUS', 
            color: '#4a9e6a',
            category: 'economy',
            priority: 2
        },
        rent_expense: { 
            label: 'Rent Expense', 
            icon: 'HOME_MINUS', 
            color: '#c87040',
            category: 'economy',
            priority: 2
        },

        // Residence events
        residence_assigned: { 
            label: 'Residence Assigned', 
            icon: 'HOME_PLUS', 
            color: '#4a8a9e',
            category: 'residence',
            priority: 1
        },
        residence_unassigned: { 
            label: 'Residence Unassigned', 
            icon: 'HOME_MINUS', 
            color: '#c87040',
            category: 'residence',
            priority: 1
        },
        unit_assigned: { 
            label: 'Unit Assigned', 
            icon: 'SQUARE_PLUS', 
            color: '#4a8a9e',
            category: 'residence',
            priority: 1
        },
        unit_vacated: { 
            label: 'Unit Vacated', 
            icon: 'SQUARE_MINUS', 
            color: '#c87040',
            category: 'residence',
            priority: 2
        },

        // Enterprise events
        enterprise_acquired: { 
            label: 'Enterprise Acquired', 
            icon: 'INDUSTRY_PLUS', 
            color: '#4a9e6a',
            category: 'enterprise',
            priority: 2
        },
        enterprise_removed: { 
            label: 'Enterprise Removed', 
            icon: 'INDUSTRY_MINUS', 
            color: '#c87040',
            category: 'enterprise',
            priority: 2
        },
        enterprise_transferred: { 
            label: 'Enterprise Transferred', 
            icon: 'ARROW_DOUBLE_H', 
            color: '#c8a844',
            category: 'enterprise',
            priority: 2
        },

        // Name changes
        household_renamed: { 
            label: 'Household Renamed', 
            icon: 'EDIT', 
            color: '#c8a844',
            category: 'history',
            priority: 2
        },

        // Inheritance / Succession
        inheritance: { 
            label: 'Inheritance', 
            icon: 'CROWN', 
            color: '#c8a844',
            category: 'members',
            priority: 1
        },
        vacant: { 
            label: 'Household Vacant', 
            icon: 'CIRCLE_HALF_LEFT', 
            color: '#c87040',
            category: 'status',
            priority: 0
        },

        // Status changes
        status_changed: { 
            label: 'Status Changed', 
            icon: 'CIRCLE_DOT', 
            color: '#c8a844',
            category: 'status',
            priority: 2
        }
    };

    // =========================================================================
    // 6. DATA COLLECTION
    // =========================================================================

    function _collectActivityLog(householdId) {
        var HS = _getState();
        var HE = _getEconomy();
        var HQ = _getQueries();
        var RS = _getResidenceSystem();

        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        var events = [];
        var currentYear = _getCurrentYear();

        // ================================================================
        // 1. Activity Log from household
        // ================================================================
        if (household.activityLog) {
            for (var i = 0; i < household.activityLog.length; i++) {
                var log = household.activityLog[i];
                events.push({
                    year: log.year || currentYear,
                    type: log.action || 'unknown',
                    label: _getEventLabel(log.action || 'unknown'),
                    details: log.details || '',
                    actorId: log.actorId || null,
                    color: _getEventColor(log.action || 'unknown'),
                    icon: _getEventIcon(log.action || 'unknown'),
                    category: _getEventCategory(log.action || 'unknown'),
                    timestamp: log.timestamp || Date.now(),
                    source: 'activity_log',
                    raw: log
                });
            }
        }

        // ================================================================
        // 2. Event Log
        // ================================================================
        if (household.eventLog) {
            for (var i = 0; i < household.eventLog.length; i++) {
                var log = household.eventLog[i];
                var type = log.type || 'unknown';
                var label = log.message || log.eventName || type;
                events.push({
                    year: log.year || currentYear,
                    type: type,
                    label: _getEventLabel(type),
                    details: label,
                    amount: log.amount || log.delta || null,
                    color: _getEventColor(type),
                    icon: _getEventIcon(type),
                    category: _getEventCategory(type),
                    timestamp: log.timestamp || Date.now(),
                    source: 'event_log',
                    raw: log
                });
            }
        }

        // ================================================================
        // 3. Economy Transactions
        // ================================================================
        if (household.economy && household.economy.transactions) {
            for (var i = 0; i < household.economy.transactions.length; i++) {
                var t = household.economy.transactions[i];
                events.push({
                    year: t.year || currentYear,
                    type: t.type || 'wealth_change',
                    label: _getEventLabel(t.type || 'wealth_change'),
                    details: t.reason || '',
                    amount: t.amount || null,
                    color: _getEventColor(t.type || 'wealth_change'),
                    icon: _getEventIcon(t.type || 'wealth_change'),
                    category: _getEventCategory(t.type || 'wealth_change'),
                    timestamp: t.timestamp || Date.now(),
                    source: 'economy',
                    raw: t
                });
            }
        }

        // ================================================================
        // 4. Enterprise History
        // ================================================================
        if (household.enterpriseHistory) {
            for (var i = 0; i < household.enterpriseHistory.length; i++) {
                var e = household.enterpriseHistory[i];
                var action = e.action || 'acquired';
                var type = action === 'acquired' ? 'enterprise_acquired' : 
                           (action === 'removed' ? 'enterprise_removed' : 'enterprise_transferred');
                events.push({
                    year: e.year || currentYear,
                    type: type,
                    label: _getEventLabel(type),
                    details: (e.action || '') + ' enterprise: ' + (e.enterpriseId || 'Unknown'),
                    amount: e.profit || null,
                    color: _getEventColor(type),
                    icon: _getEventIcon(type),
                    category: _getEventCategory(type),
                    timestamp: e.timestamp || Date.now(),
                    source: 'enterprise',
                    raw: e
                });
            }
        }

        // ================================================================
        // 5. Residence History
        // ================================================================
        if (household.residenceHistory) {
            for (var i = 0; i < household.residenceHistory.length; i++) {
                var r = household.residenceHistory[i];
                var type = r.action === 'assigned' ? 'residence_assigned' : 'residence_unassigned';
                events.push({
                    year: r.year || currentYear,
                    type: type,
                    label: _getEventLabel(type),
                    details: (r.action || '') + ' residence: ' + (r.residenceName || 'Unknown'),
                    color: _getEventColor(type),
                    icon: _getEventIcon(type),
                    category: _getEventCategory(type),
                    timestamp: r.timestamp || Date.now(),
                    source: 'residence',
                    raw: r
                });
            }
        }

        // ================================================================
        // 6. Name History
        // ================================================================
        if (household.nameHistory) {
            for (var i = 0; i < household.nameHistory.length; i++) {
                var n = household.nameHistory[i];
                events.push({
                    year: n.year || currentYear,
                    type: 'household_renamed',
                    label: 'Household Renamed',
                    details: 'Renamed from "' + (n.oldName || '?') + '" to "' + n.newName + '"' + 
                             (n.reason ? ' (' + n.reason + ')' : ''),
                    color: _getEventColor('household_renamed'),
                    icon: _getEventIcon('household_renamed'),
                    category: _getEventCategory('household_renamed'),
                    timestamp: n.timestamp || Date.now(),
                    source: 'name_history',
                    raw: n
                });
            }
        }

        // ================================================================
        // 7. Sort by year and timestamp
        // ================================================================
        events.sort(function(a, b) {
            if (a.year !== b.year) return b.year - a.year;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        return {
            household: household,
            events: events,
            total: events.length
        };
    }

    // =========================================================================
    // 7. EVENT HELPERS
    // =========================================================================

    function _getEventTypeConfig(type) {
        return EVENT_TYPES[type] || EVENT_TYPES.unknown || { 
            label: type || 'Unknown Event', 
            icon: 'CIRCLE_DOT', 
            color: 'var(--dim)',
            category: 'unknown'
        };
    }

    function _getEventLabel(type) {
        var config = _getEventTypeConfig(type);
        return config.label || type || 'Unknown Event';
    }

    function _getEventIcon(type) {
        var config = _getEventTypeConfig(type);
        var iconName = config.icon || 'CIRCLE_DOT';
        return _getIconSafe(iconName);
    }

    function _getEventColor(type) {
        var config = _getEventTypeConfig(type);
        return config.color || 'var(--dim)';
    }

    function _getEventCategory(type) {
        var config = _getEventTypeConfig(type);
        return config.category || 'unknown';
    }

    function _getEventPriority(type) {
        var config = _getEventTypeConfig(type);
        return config.priority !== undefined ? config.priority : 2;
    }

    // =========================================================================
    // 8. FILTER FUNCTIONS
    // =========================================================================

    function _applyFilters(events, filters) {
        filters = filters || {};
        var result = events.slice();

        // Filter by category
        if (filters.category && filters.category !== 'all') {
            result = result.filter(function(e) {
                return e.category === filters.category;
            });
        }

        // Filter by search term
        if (filters.search) {
            var searchLower = filters.search.toLowerCase();
            result = result.filter(function(e) {
                return (e.label || '').toLowerCase().indexOf(searchLower) !== -1 ||
                       (e.details || '').toLowerCase().indexOf(searchLower) !== -1;
            });
        }

        // Filter by year range
        if (filters.minYear) {
            result = result.filter(function(e) {
                return e.year >= filters.minYear;
            });
        }
        if (filters.maxYear) {
            result = result.filter(function(e) {
                return e.year <= filters.maxYear;
            });
        }

        // Filter by source
        if (filters.source && filters.source !== 'all') {
            result = result.filter(function(e) {
                return e.source === filters.source;
            });
        }

        // Limit results
        if (filters.limit && filters.limit > 0) {
            result = result.slice(0, filters.limit);
        }

        return result;
    }

    // =========================================================================
    // 9. RENDER FUNCTIONS
    // =========================================================================

    function _renderStats(data, filteredCount) {
        var total = data.total || 0;
        var categories = {};
        var bySource = {};

        for (var i = 0; i < data.events.length; i++) {
            var e = data.events[i];
            var cat = e.category || 'unknown';
            if (!categories[cat]) categories[cat] = 0;
            categories[cat]++;
            
            var src = e.source || 'unknown';
            if (!bySource[src]) bySource[src] = 0;
            bySource[src]++;
        }

        var categoryHtml = '';
        var categoryOrder = ['members', 'economy', 'enterprise', 'residence', 'departments', 'positions', 'status', 'history', 'unknown'];
        for (var i = 0; i < categoryOrder.length; i++) {
            var cat = categoryOrder[i];
            var count = categories[cat] || 0;
            if (count > 0) {
                var label = cat.charAt(0).toUpperCase() + cat.slice(1);
                categoryHtml += '<span style="background:var(--bg3);padding:2px 8px;border-radius:10px;font-size:0.5rem;margin:2px;">' + 
                    _escapeHtml(label) + ': ' + count + 
                    '</span>';
            }
        }

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Total Events</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + total + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Displayed</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + filteredCount + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Categories</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + Object.keys(categories).length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Sources</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + Object.keys(bySource).length + '</div>' +
                '</div>' +
            '</div>' +
            (categoryHtml ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;padding:6px;background:var(--bg2);border-radius:4px;">' + categoryHtml + '</div>' : '');
    }

    function _renderEventCard(event, index) {
        var icon = event.icon || _getIconSafe('CIRCLE_DOT');
        var color = event.color || 'var(--dim)';
        var priority = _getEventPriority(event.type);
        
        // Priority badge
        var priorityBadge = '';
        if (priority === 0) {
            priorityBadge = '<span style="background:#8a3020;color:white;padding:1px 6px;border-radius:8px;font-size:0.4rem;">Important</span>';
        } else if (priority === 1) {
            priorityBadge = '<span style="background:#c87040;color:white;padding:1px 6px;border-radius:8px;font-size:0.4rem;">Major</span>';
        }

        // Amount display
        var amountDisplay = '';
        if (event.amount !== null && event.amount !== undefined) {
            var amount = event.amount;
            var isPositive = amount >= 0;
            var sign = isPositive ? '+' : '';
            var colorClass = isPositive ? 'var(--success)' : 'var(--danger)';
            amountDisplay = '<span style="font-size:0.55rem;color:' + colorClass + ';margin-left:8px;">' + sign + amount + 'g</span>';
        }

        // Click handler
        var dataAttrs = ' data-event-type="' + _escapeHtml(event.type) + '"';
        dataAttrs += ' data-event-index="' + index + '"';

        return '' +
            '<div class="event-item" ' + dataAttrs + ' style="' +
                'display:flex;' +
                'justify-content:space-between;' +
                'align-items:center;' +
                'padding:6px 10px;' +
                'background:var(--bg2);' +
                'border-radius:4px;' +
                'margin-bottom:2px;' +
                'border-left:3px solid ' + color + ';' +
                'cursor:pointer;' +
                'transition:background 0.1s;' +
            '">' +
                '<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">' +
                    '<span style="font-size:0.6rem;color:' + color + ';">' + icon + '</span>' +
                    '<span style="font-size:0.6rem;font-weight:bold;color:var(--dim);min-width:40px;">' + event.year + '</span>' +
                    '<span style="font-size:0.6rem;font-weight:bold;">' + _escapeHtml(event.label) + '</span>' +
                    amountDisplay +
                    '<span style="font-size:0.5rem;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + _escapeHtml(event.details) + '</span>' +
                    '<span style="font-size:0.4rem;color:var(--dim);">' + (event.source || '') + '</span>' +
                    priorityBadge +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="event-detail-btn" data-event-index="' + index + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="View details">' + _getIconSafe('EDIT') + '</button>' +
                '</div>' +
            '</div>';
    }

    function _renderEmptyState() {
        return '' +
            '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.7rem;">' +
                '<div style="font-size:2rem;margin-bottom:12px;">??</div>' +
                'No activity records found for this household' +
                '<div style="font-size:0.55rem;margin-top:8px;">Events will appear as members join, wealth changes, and more.</div>' +
            '</div>';
    }

    function _renderFilters(data, filters) {
        var categories = [
            { id: 'all', label: 'All' },
            { id: 'members', label: 'Members' },
            { id: 'economy', label: 'Economy' },
            { id: 'enterprise', label: 'Enterprise' },
            { id: 'residence', label: 'Residence' },
            { id: 'departments', label: 'Departments' },
            { id: 'positions', label: 'Positions' },
            { id: 'status', label: 'Status' },
            { id: 'history', label: 'History' }
        ];

        var sources = [
            { id: 'all', label: 'All Sources' },
            { id: 'activity_log', label: 'Activity Log' },
            { id: 'event_log', label: 'Event Log' },
            { id: 'economy', label: 'Economy' },
            { id: 'enterprise', label: 'Enterprise' },
            { id: 'residence', label: 'Residence' },
            { id: 'name_history', label: 'Name History' }
        ];

        var categoryOptions = categories.map(function(c) {
            var selected = (filters.category === c.id) ? 'selected' : '';
            return '<option value="' + c.id + '" ' + selected + '>' + c.label + '</option>';
        }).join('');

        var sourceOptions = sources.map(function(s) {
            var selected = (filters.source === s.id) ? 'selected' : '';
            return '<option value="' + s.id + '" ' + selected + '>' + s.label + '</option>';
        }).join('');

        var currentYear = _getCurrentYear();
        var minYear = filters.minYear || 0;
        var maxYear = filters.maxYear || currentYear;

        return '' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<div style="display:flex;gap:4px;flex-wrap:wrap;flex:1;">' +
                    '<input type="text" id="activitySearchInput" placeholder="Search events..." value="' + _escapeHtml(filters.search || '') + '" style="flex:2;min-width:100px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;color:var(--text);">' +
                    '<select id="activityCategoryFilter" style="padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;color:var(--text);">' +
                        categoryOptions +
                    '</select>' +
                    '<select id="activitySourceFilter" style="padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;color:var(--text);">' +
                        sourceOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:flex;gap:4px;align-items:center;">' +
                    '<label style="font-size:0.5rem;color:var(--dim);">Year:</label>' +
                    '<input type="number" id="activityMinYear" value="' + minYear + '" placeholder="Min" style="width:50px;padding:2px 4px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;color:var(--text);">' +
                    '<span style="font-size:0.5rem;color:var(--dim);">-</span>' +
                    '<input type="number" id="activityMaxYear" value="' + maxYear + '" placeholder="Max" style="width:50px;padding:2px 4px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;color:var(--text);">' +
                    '<button id="activityClearFiltersBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 10. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdActivityTab(containerId, householdId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[ActivityTab] Container not found: ' + containerId);
                return;
            }

            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            _currentHouseholdId = householdId;

            var data = _collectActivityLog(householdId);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            // Load filters from state or use defaults
            var filters = {
                search: '',
                category: 'all',
                source: 'all',
                minYear: 0,
                maxYear: _getCurrentYear(),
                limit: 100
            };

            var filteredEvents = _applyFilters(data.events, filters);
            var eventCount = filteredEvents.length;

            var html = '' +
                '<div style="max-width:750px;margin:0 auto;">' +
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
                            '<h3 style="font-size:0.7rem;color:var(--accent);margin:0;">' + _getIconSafe('REFRESH') + ' Activity Log</h3>' +
                            '<span style="font-size:0.55rem;color:var(--dim);">' + data.total + ' total events</span>' +
                        '</div>' +

                        _renderStats(data, eventCount) +

                        _renderFilters(data, filters) +

                        '<div style="margin-bottom:12px;">' +
                            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                                '<div style="font-size:0.6rem;color:var(--accent);">Events (' + eventCount + ')</div>' +
                                '<div style="display:flex;gap:4px;">' +
                                    '<button id="activityRefreshBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + _getIconSafe('REFRESH') + ' Refresh</button>' +
                                '</div>' +
                            '</div>' +
                            '<div style="max-height:500px;overflow-y:auto;">' +
                                (eventCount === 0 ? 
                                    _renderEmptyState() :
                                    filteredEvents.map(function(e, idx) {
                                        return _renderEventCard(e, idx);
                                    }).join('')
                                ) +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                        'Showing ' + eventCount + ' events ， ' +
                        data.total + ' total ， ' +
                        'Click an event for details' +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            _attachEventHandlers(container, householdId, data, filters);

        } catch (e) {
            console.error('[ActivityTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading activity log</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 11. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, householdId, data, filters) {
        // ================================================================
        // Filter handlers
        // ================================================================
        var searchInput = document.getElementById('activitySearchInput');
        var categoryFilter = document.getElementById('activityCategoryFilter');
        var sourceFilter = document.getElementById('activitySourceFilter');
        var minYearInput = document.getElementById('activityMinYear');
        var maxYearInput = document.getElementById('activityMaxYear');
        var clearBtn = document.getElementById('activityClearFiltersBtn');
        var refreshBtn = document.getElementById('activityRefreshBtn');

        function applyFilters() {
            var newFilters = {
                search: searchInput ? searchInput.value : '',
                category: categoryFilter ? categoryFilter.value : 'all',
                source: sourceFilter ? sourceFilter.value : 'all',
                minYear: parseInt(minYearInput ? minYearInput.value : 0) || 0,
                maxYear: parseInt(maxYearInput ? maxYearInput.value : _getCurrentYear()) || _getCurrentYear(),
                limit: 100
            };

            var filteredEvents = _applyFilters(data.events, newFilters);
            
            // Update stats
            var statsEl = container.querySelector('.event-stats');
            if (statsEl) {
                var countEl = statsEl.querySelector('.event-count');
                if (countEl) countEl.textContent = filteredEvents.length;
            }

            // Update event list
            var eventsContainer = container.querySelector('.events-list');
            if (eventsContainer) {
                if (filteredEvents.length === 0) {
                    eventsContainer.innerHTML = _renderEmptyState();
                } else {
                    eventsContainer.innerHTML = filteredEvents.map(function(e, idx) {
                        return _renderEventCard(e, idx);
                    }).join('');
                }
                _attachEventClickHandlers(eventsContainer, householdId);
            }

            // Update count display
            var countDisplay = container.querySelector('.event-count-display');
            if (countDisplay) {
                countDisplay.textContent = filteredEvents.length;
            }
        }

        // Debounced search
        var searchTimeout = null;
        if (searchInput) {
            searchInput.oninput = function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(applyFilters, 300);
            };
        }

        if (categoryFilter) {
            categoryFilter.onchange = applyFilters;
        }

        if (sourceFilter) {
            sourceFilter.onchange = applyFilters;
        }

        if (minYearInput) {
            minYearInput.onchange = applyFilters;
        }

        if (maxYearInput) {
            maxYearInput.onchange = applyFilters;
        }

        if (clearBtn) {
            clearBtn.onclick = function() {
                if (searchInput) searchInput.value = '';
                if (categoryFilter) categoryFilter.value = 'all';
                if (sourceFilter) sourceFilter.value = 'all';
                if (minYearInput) minYearInput.value = '';
                if (maxYearInput) maxYearInput.value = _getCurrentYear();
                applyFilters();
            };
        }

        if (refreshBtn) {
            refreshBtn.onclick = function() {
                renderHouseholdActivityTab('tab-activity', householdId);
            };
        }

        // ================================================================
        // Click handlers for event items
        // ================================================================
        _attachEventClickHandlers(container, householdId);
    }

    function _attachEventClickHandlers(container, householdId) {
        var items = container.querySelectorAll('.event-item');
        items.forEach(function(item) {
            var newItem = item.cloneNode(true);
            if (item.parentNode) {
                item.parentNode.replaceChild(newItem, item);
            }

            newItem.onclick = function(e) {
                if (e.target.closest('button')) return;
                var type = this.dataset.eventType;
                var index = parseInt(this.dataset.eventIndex);
                _showEventDetails(householdId, type, index);
            };

            newItem.onmouseenter = function() {
                this.style.background = 'var(--bg3)';
            };
            newItem.onmouseleave = function() {
                this.style.background = 'var(--bg2)';
            };
        });

        // Detail buttons
        var detailBtns = container.querySelectorAll('.event-detail-btn');
        detailBtns.forEach(function(btn) {
            var newBtn = btn.cloneNode(true);
            if (btn.parentNode) {
                btn.parentNode.replaceChild(newBtn, btn);
            }

            newBtn.onclick = function(e) {
                e.stopPropagation();
                var index = parseInt(this.dataset.eventIndex);
                _showEventDetails(householdId, null, index);
            };
        });
    }

    // =========================================================================
    // 12. EVENT DETAILS MODAL
    // =========================================================================

    function _showEventDetails(householdId, type, index) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                return;
            }

            var data = _collectActivityLog(householdId);
            if (data.error) {
                _showToast(data.error, 'error');
                return;
            }

            // Get the event
            var events = data.events;
            if (index < 0 || index >= events.length) {
                _showToast('Event not found', 'error');
                return;
            }

            var event = events[index];
            if (type && event.type !== type) {
                // Find by type if index doesn't match
                var found = null;
                for (var i = 0; i < events.length; i++) {
                    if (events[i].type === type) {
                        found = events[i];
                        break;
                    }
                }
                if (found) event = found;
            }

            if (!event) {
                _showToast('Event not found', 'error');
                return;
            }

            var icon = event.icon || _getIconSafe('CIRCLE_DOT');
            var color = event.color || 'var(--dim)';
            var label = event.label || event.type || 'Unknown';
            var category = event.category || 'unknown';

            // Build details
            var detailsHtml = '';
            var raw = event.raw || {};

            var fields = [
                { key: 'year', label: 'Year' },
                { key: 'type', label: 'Type' },
                { key: 'label', label: 'Label' },
                { key: 'details', label: 'Details' },
                { key: 'amount', label: 'Amount' },
                { key: 'source', label: 'Source' },
                { key: 'actorId', label: 'Actor ID' }
            ];

            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                var value = event[f.key];
                if (value !== undefined && value !== null && value !== '') {
                    var displayValue = f.key === 'amount' ? 
                        (value >= 0 ? '+' : '') + value + 'g' : 
                        _escapeHtml(String(value));
                    detailsHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                        '<span style="color:var(--dim);">' + f.label + '</span>' +
                        '<span>' + displayValue + '</span>' +
                        '</div>';
                }
            }

            // Raw data
            var rawHtml = '';
            try {
                rawHtml = '<pre style="font-size:0.5rem;color:var(--dim);max-height:150px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px;margin:0;">' + 
                    _escapeHtml(JSON.stringify(raw, null, 2)) + 
                    '</pre>';
            } catch (e) {
                rawHtml = '<div style="font-size:0.5rem;color:var(--dim);">No raw data available</div>';
            }

            var modalContent = '' +
                '<div style="margin-bottom:16px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:12px;background:var(--bg2);border-radius:8px;border-left:4px solid ' + color + ';">' +
                        '<div>' +
                            '<div style="font-size:0.8rem;font-weight:bold;">' + icon + ' ' + _escapeHtml(label) + '</div>' +
                            '<div style="font-size:0.6rem;color:var(--dim);">' + event.year + ' ， ' + _escapeHtml(category) + ' ， ' + (event.source || 'unknown') + '</div>' +
                        '</div>' +
                        '<span style="font-size:0.5rem;color:' + color + ';">' + event.type + '</span>' +
                    '</div>' +
                    '<div style="background:var(--bg3);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                        detailsHtml +
                    '</div>' +
                    '<div style="margin-bottom:12px;">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Raw Data</div>' +
                        rawHtml +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Event Details',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                }
            });

        } catch (e) {
            console.error('[ActivityTab] Event details error:', e);
            _showToast('Error showing event details', 'error');
        }
    }

    // =========================================================================
    // 13. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdActivityTab(householdId) {
        var containerId = 'tab-activity';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="activity"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }

        if (!container) {
            console.warn('[ActivityTab] Container not found');
            return;
        }

        renderHouseholdActivityTab(containerId, householdId);
    }

    // =========================================================================
    // 14. TAB SYSTEM REGISTRATION
    // =========================================================================

    function registerActivityTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('activity', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdActivityTab(containerId, householdId);
            }, true);
            console.log('[HouseholdActivityTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.renderHouseholdActivityTab = renderHouseholdActivityTab;
    window.refreshHouseholdActivityTab = refreshHouseholdActivityTab;
    window.registerActivityTabRenderer = registerActivityTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerActivityTabRenderer, 100);
        });
    } else {
        setTimeout(registerActivityTabRenderer, 100);
    }

})();