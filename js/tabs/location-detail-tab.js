// js/tabs/location-detail-tab.js
/**
 * =============================================================================
 * LOCATION DETAIL TAB
 * js/tabs/location-detail-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-detail-tab.js
 *
 * Renders the details view for a single location: header with Edit / Delete
 * buttons, key stat grid, location details, and government / culture
 * assignments.
 *
 * SCOPE
 * -----
 * - Reads the place, its statistics, its parent, and its government / culture
 *   assignments via LocationQueries.
 * - Delegates Edit / Delete to the canonical modals in modals-location.js
 *   (which own the form, command invocation, and persist boundary).
 *
 * OUT OF SCOPE
 * ------------
 * - Edit / delete forms and the parent picker (owned by modals-location.js).
 * - Command invocation and persist (owned by modals-location.js).
 * - Inline CSS. Styling comes from css/location-tabs.css.
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(locationId)
 *   - LocationQueries.getLocationStatistics(locationId)
 *   - LocationQueries.getLocationTypeName(typeId)
 *   - GovernmentQueries.getGovernmentType(governmentTypeId)  (soft)
 *   - CultureQueries.getCulture(cultureId)                    (soft)
 *
 * FILTERS: none.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries     — REQUIRED
 *   - TabManager          — REQUIRED
 *   - formatting.js       (escapeHtml) — REQUIRED
 *   - icons.js            (Icons)      — soft
 *   - modals-location.js  (openEditPlaceModal, openDeletePlaceModal) — soft (toast if missing)
 *
 * TIME CONTRACT: none on this tab (no year reads).
 * ICON POLICY: no emojis. Glyphs from Icons[name], '' fallback.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Refactored to the Education tab skeleton:
 *     - Renderer contract is now fn(container, context), not fn(containerId, placeId, onRefresh).
 *     - Registers with TabManager at load time.
 *     - Empty states are three-way: no-context / no-place / no-data.
 *     - All reads go through container.querySelector; no document.*.
 *     - One delegated click handler on the container, not per-button listeners.
 *     - escapeHtml is a required dependency; _esc throws if it is missing.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'details';
    var SCOPE  = 'location';

    // =========================================================================
    // 2. DEPENDENCY HELPERS (soft; strict fallbacks)
    // =========================================================================

    function _queries() {
        return (typeof window.LocationQueries !== 'undefined') ? window.LocationQueries : null;
    }
    function _tabManager() {
        return (typeof window.TabManager !== 'undefined') ? window.TabManager : null;
    }
    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try { var s = window.getIcon(name); if (typeof s === 'string') return s; }
            catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') return window.Icons[name];
        return '';
    }
    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }
    function _resolveModal(name) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            _toast('Action unavailable: ' + name + ' is not loaded.', 'error');
            return null;
        }
        return fn;
    }

    // =========================================================================
    // 3. PRESENTATION HELPERS
    // =========================================================================

    function _governmentTypeName(governmentTypeId) {
        if (!governmentTypeId) return 'None';
        if (!window.GovernmentQueries
            || typeof window.GovernmentQueries.getGovernmentType !== 'function') return 'None';
        var gt = window.GovernmentQueries.getGovernmentType(governmentTypeId);
        return gt && gt.name ? gt.name : 'None';
    }
    function _cultureName(cultureId) {
        if (!cultureId) return 'None';
        if (!window.CultureQueries
            || typeof window.CultureQueries.getCulture !== 'function') return 'None';
        var c = window.CultureQueries.getCulture(cultureId);
        return c && c.name ? c.name : 'None';
    }
    function _parentName(place, Q) {
        if (!place || !place.parentId) return 'None';
        var parent = Q.getPlace(place.parentId);
        return parent && parent.displayName ? parent.displayName : 'None';
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function _renderDetailHeader(place, typeName) {
        var statusLine = [typeName];
        if (place.isCapital) statusLine.push('Capital');
        if (place.status && place.status !== 'active') statusLine.push(place.status);

        var html = '';
        html += '<div class="loc-tab-header">';
        html +=   '<div class="loc-tab-header-text">';
        html +=     '<div class="loc-tab-header-title">' +
                        _icon('LOCATION') + ' ' + _esc(place.displayName) +
                    '</div>';
        html +=     '<div class="loc-tab-header-subtitle">' +
                        _esc(statusLine.join(' · ')) +
                    '</div>';
        html +=   '</div>';
        html +=   '<div class="loc-tab-header-actions">';
        html +=     '<button type="button" class="loc-tab-btn" data-action="edit">' +
                        _icon('EDIT') + ' Edit' +
                    '</button>';
        html +=     '<button type="button" class="loc-tab-btn loc-tab-btn--danger" data-action="delete">' +
                        _icon('TRASH') + ' Delete' +
                    '</button>';
        html +=   '</div>';
        html += '</div>';
        return html;
    }

    function _renderStats(stats) {
        var html = '<div class="loc-tab-stats-grid">';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-label">' + _icon('HOME') + ' Type</div>' +
                    '<div class="loc-tab-stat-value">' + _esc(stats.typeName || 'Unknown') + '</div>' +
                '</div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-label">' + _icon('PERSON') + ' Population</div>' +
                    '<div class="loc-tab-stat-value">' + (stats.totalPopulation || 0).toLocaleString() + '</div>' +
                '</div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-label">Children</div>' +
                    '<div class="loc-tab-stat-value">' + (stats.childCount || 0) + '</div>' +
                '</div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-label">Depth</div>' +
                    '<div class="loc-tab-stat-value">' + (stats.depth || 0) + '</div>' +
                '</div>';
        html += '</div>';
        return html;
    }

    function _renderDetailsSection(place, parentName) {
        var html = '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' + _icon('LOCATION') + ' Location Details</div>';
        html +=   '<div class="loc-tab-grid-2">';
        html +=     '<div><span class="loc-tab-label">ID:</span> ' +
                        '<span class="loc-tab-mono">' + _esc(place.id) + '</span></div>';
        html +=     '<div><span class="loc-tab-label">Parent:</span> ' +
                        '<span class="loc-tab-value">' + _esc(parentName) + '</span></div>';
        html +=     '<div><span class="loc-tab-label">Status:</span> ' +
                        '<span class="loc-tab-value">' + _esc(place.status || 'active') + '</span></div>';
        html +=     '<div><span class="loc-tab-label">Capital:</span> ' +
                        '<span class="loc-tab-value">' + (place.isCapital ? 'Yes' : 'No') + '</span></div>';
        if (place.variableKey) {
            html += '<div><span class="loc-tab-label">Key:</span> ' +
                        '<span class="loc-tab-mono">' + _esc(place.variableKey) + '</span></div>';
        }
        html +=   '</div>';
        if (place.notes) {
            html += '<div class="loc-tab-notes">' + _esc(place.notes) + '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderAssignmentsSection(place) {
        var govName = _governmentTypeName(place.governmentTypeId);
        var cultureName = _cultureName(place.cultureId);
        var html = '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' + _icon('STAR_4') + ' Assignments</div>';
        html +=   '<div class="loc-tab-grid-2">';
        html +=     '<div class="loc-tab-card">' +
                        '<div class="loc-tab-card-label">Government</div>' +
                        '<div class="loc-tab-card-value">' + _esc(govName) + '</div>' +
                        '<div class="loc-tab-card-sub">' + _esc(place.governmentStyle || 'No style set') + '</div>' +
                    '</div>';
        html +=     '<div class="loc-tab-card">' +
                        '<div class="loc-tab-card-label">Culture</div>' +
                        '<div class="loc-tab-card-value">' + _esc(cultureName) + '</div>' +
                    '</div>';
        html +=   '</div>';
        html += '</div>';
        return html;
    }

    function renderDetailTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="empty-state">Select a location from the sidebar.</div>';
            return;
        }

        var Q = _queries();
        if (!Q) {
            container.innerHTML =
                '<div class="rt-unavailable">LocationQueries is not available. ' +
                'Load js/location/location-queries.js.</div>';
            return;
        }

        var place = Q.getPlace(context.locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found.</div>';
            return;
        }

        var stats = {};
        try { stats = Q.getLocationStatistics(context.locationId) || {}; }
        catch (e) { /* stats is best-effort */ }
        var typeName = Q.getLocationTypeName(place.typeId) || 'Unknown';
        var parentName = _parentName(place, Q);
        stats.typeName = typeName;

        var html = '<div class="loc-tab">';
        html += _renderDetailHeader(place, typeName);
        html += _renderStats(stats);
        html += _renderDetailsSection(place, parentName);
        html += _renderAssignmentsSection(place);
        html += '</div>';
        container.innerHTML = html;

        if (!container.__locationDetailWired) {
            container.__locationDetailWired = true;
            container.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (!btn || !container.contains(btn)) return;
                var action = btn.dataset.action;
                if (action === 'edit') {
                    var fn = _resolveModal('openEditPlaceModal');
                    if (!fn) return;
                    fn(context.locationId, function () { _refresh(); });
                } else if (action === 'delete') {
                    var dfn = _resolveModal('openDeletePlaceModal');
                    if (!dfn) return;
                    dfn(context.locationId, function () {
                        // After a delete, ask TabManager for a re-render; the
                        // sidebar reselects the initial place via the manager
                        // topbar callback in location-manager-bootstrap.js.
                        _refresh();
                    });
                }
            });
        }
    }

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try { TM.requestRender(SCOPE); } catch (e) { /* ignore */ }
        }
    }

    // =========================================================================
    // 5. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderDetailTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('location-detail-tab.js: TabManager is not available at load time; the tab was not registered. Load tab-manager.js first.');
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.LocationDetailTab = { id: TAB_ID, render: renderDetailTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationDetailTab;
    }
})();
