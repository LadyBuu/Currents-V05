// js/tabs/location-detail-tab.js
/**
 * =============================================================================
 * LOCATION DETAIL TAB (singular)
 * =============================================================================
 *
 * Renders the details view for a single location. Edit and Delete
 * delegate to the canonical modals from modals-location.js, which own
 * the form, the command invocation, and the persist boundary.
 *
 * SCOPE
 * -----
 * - Read the place, its statistics, its parent, and its government /
 *   culture assignments via the canonical location queries.
 * - Render the details view.
 * - Delegate Edit / Delete to window.openEditPlaceModal /
 *   window.openDeletePlaceModal.
 *
 * OUT OF SCOPE
 * ------------
 * - Edit / delete forms and the parent picker (owned by
 *   modals-location.js; the parent picker there is hierarchical).
 * - Command invocation and persist (owned by modals-location.js via
 *   LocationModals.runCommand).
 * - CSS. Every class used here is defined in css/location-tabs.css.
 *
 * HARD DEPENDENCIES (load-time):
 *   - js/core/formatting.js            (window.escapeHtml)
 *   - js/core/icons.js                 (window.getIcon)
 *   - js/location/location-queries.js  (window.LocationQueries)
 *
 * OPTIONAL DEPENDENCIES (call-time, guarded):
 *   - window.GovernmentQueries.getGovernmentType
 *   - window.CultureQueries.getCulture
 *   - window.openEditPlaceModal
 *   - window.openDeletePlaceModal
 *   - window.showToast
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'location-detail-tab.js requires core/formatting.js ' +
            '(window.escapeHtml).'
        );
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error(
            'location-detail-tab.js requires core/icons.js ' +
            '(window.getIcon).'
        );
    }
    if (!window.LocationQueries ||
        typeof window.LocationQueries.getPlace !== 'function') {
        throw new Error(
            'location-detail-tab.js requires location-queries.js ' +
            '(window.LocationQueries.getPlace).'
        );
    }

    var LQ = window.LocationQueries;

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _governmentTypeName(governmentTypeId) {
        if (!governmentTypeId) return 'None';
        if (!window.GovernmentQueries ||
            typeof window.GovernmentQueries.getGovernmentType !== 'function') {
            return 'None';
        }
        var gt = window.GovernmentQueries.getGovernmentType(governmentTypeId);
        return gt && gt.name ? gt.name : 'None';
    }

    function _cultureName(cultureId) {
        if (!cultureId) return 'None';
        if (!window.CultureQueries ||
            typeof window.CultureQueries.getCulture !== 'function') {
            return 'None';
        }
        var c = window.CultureQueries.getCulture(cultureId);
        return c && c.name ? c.name : 'None';
    }

    function _parentName(place) {
        if (!place || !place.parentId) return 'None';
        var parent = LQ.getPlace(place.parentId);
        return parent && parent.displayName ? parent.displayName : 'None';
    }

    // =========================================================================
    // 3. DELEGATION TO CANONICAL MODALS
    // =========================================================================

    function _openEdit(placeId, onRefresh) {
        if (typeof window.openEditPlaceModal !== 'function') {
            if (typeof window.showToast === 'function') {
                window.showToast('Edit modal unavailable', 'error');
            }
            return;
        }
        window.openEditPlaceModal(placeId, function () {
            if (typeof onRefresh === 'function') onRefresh();
        });
    }

    function _openDelete(placeId, onRefresh) {
        if (typeof window.openDeletePlaceModal !== 'function') {
            if (typeof window.showToast === 'function') {
                window.showToast('Delete modal unavailable', 'error');
            }
            return;
        }
        window.openDeletePlaceModal(placeId, function () {
            if (typeof onRefresh === 'function') onRefresh();
        });
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function render(containerId, placeId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!placeId) {
            container.innerHTML =
                '<div class="loc-tab-empty">Select a location from the sidebar</div>';
            return;
        }

        var place = LQ.getPlace(placeId);
        if (!place) {
            container.innerHTML =
                '<div class="loc-tab-empty">Location not found</div>';
            return;
        }

        var stats = LQ.getLocationStatistics(placeId) || {};
        var typeName = LQ.getLocationTypeName(place.typeId) || 'Unknown';
        var parentName = _parentName(place);
        var govName = _governmentTypeName(place.governmentTypeId);
        var cultureName = _cultureName(place.cultureId);

        var statusLine = [typeName];
        if (place.isCapital) statusLine.push('Capital');
        if (place.status && place.status !== 'active') {
            statusLine.push(place.status);
        }

        var html = '';

        // ---- HEADER ----
        html += '<div class="loc-tab-header">';
        html +=   '<div class="loc-tab-header-text">';
        html +=     '<div class="loc-tab-header-title">' +
                        window.getIcon('LOCATION') + ' ' +
                        window.escapeHtml(place.displayName) +
                    '</div>';
        html +=     '<div class="loc-tab-header-subtitle">' +
                        window.escapeHtml(statusLine.join(' · ')) +
                    '</div>';
        html +=   '</div>';
        html +=   '<div class="loc-tab-header-actions">';
        html +=     '<button type="button" id="editLocationBtn" class="loc-tab-btn">' +
                        window.getIcon('EDIT') + ' Edit' +
                    '</button>';
        html +=     '<button type="button" id="deleteLocationBtn" class="loc-tab-btn loc-tab-btn--danger">' +
                        window.getIcon('TRASH') + ' Delete' +
                    '</button>';
        html +=   '</div>';
        html += '</div>';

        // ---- KEY STATS ----
        html += '<div class="loc-tab-stats-grid">';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-label">' +
                        window.getIcon('HOME') + ' Type' +
                    '</div>';
        html +=     '<div class="loc-tab-stat-value">' +
                        window.escapeHtml(typeName) +
                    '</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-label">' +
                        window.getIcon('PERSON') + ' Population' +
                    '</div>';
        html +=     '<div class="loc-tab-stat-value">' +
                        (stats.totalPopulation || 0).toLocaleString() +
                    '</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-label">Children</div>';
        html +=     '<div class="loc-tab-stat-value">' +
                        (stats.childCount || 0) +
                    '</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-label">Depth</div>';
        html +=     '<div class="loc-tab-stat-value">' +
                        (stats.depth || 0) +
                    '</div>';
        html +=   '</div>';

        html += '</div>';

        // ---- LOCATION DETAILS ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' +
                    window.getIcon('LOCATION') + ' Location Details' +
                  '</div>';
        html +=   '<div class="loc-tab-grid-2">';

        html +=     '<div>' +
                        '<span class="loc-tab-label">ID:</span> ' +
                        '<span class="loc-tab-mono">' +
                            window.escapeHtml(place.id) +
                        '</span>' +
                    '</div>';

        html +=     '<div>' +
                        '<span class="loc-tab-label">Parent:</span> ' +
                        '<span class="loc-tab-value">' +
                            window.escapeHtml(parentName) +
                        '</span>' +
                    '</div>';

        html +=     '<div>' +
                        '<span class="loc-tab-label">Status:</span> ' +
                        '<span class="loc-tab-value">' +
                            window.escapeHtml(place.status || 'active') +
                        '</span>' +
                    '</div>';

        html +=     '<div>' +
                        '<span class="loc-tab-label">Capital:</span> ' +
                        '<span class="loc-tab-value">' +
                            (place.isCapital ? 'Yes' : 'No') +
                        '</span>' +
                    '</div>';

        if (place.variableKey) {
            html += '<div>' +
                        '<span class="loc-tab-label">Key:</span> ' +
                        '<span class="loc-tab-mono">' +
                            window.escapeHtml(place.variableKey) +
                        '</span>' +
                    '</div>';
        }

        html +=   '</div>';

        if (place.notes) {
            html += '<div class="loc-tab-notes">' +
                        window.escapeHtml(place.notes) +
                    '</div>';
        }

        html += '</div>';

        // ---- ASSIGNMENTS ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' +
                    window.getIcon('STAR_4') + ' Assignments' +
                  '</div>';
        html +=   '<div class="loc-tab-grid-2">';

        html +=     '<div class="loc-tab-card">';
        html +=       '<div class="loc-tab-card-label">Government</div>';
        html +=       '<div class="loc-tab-card-value">' +
                          window.escapeHtml(govName) +
                      '</div>';
        html +=       '<div class="loc-tab-card-sub">' +
                          window.escapeHtml(place.governmentStyle || 'No style set') +
                      '</div>';
        html +=     '</div>';

        html +=     '<div class="loc-tab-card">';
        html +=       '<div class="loc-tab-card-label">Culture</div>';
        html +=       '<div class="loc-tab-card-value">' +
                          window.escapeHtml(cultureName) +
                      '</div>';
        html +=     '</div>';

        html +=   '</div>';
        html += '</div>';

        container.innerHTML = html;

        // ---- BIND EVENTS ----
        var editBtn = container.querySelector('#editLocationBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                _openEdit(placeId, onRefresh);
            });
        }

        var deleteBtn = container.querySelector('#deleteLocationBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                _openDelete(placeId, onRefresh);
            });
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationDetailTab = { render: render };
    window.renderLocationDetail = render;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationDetailTab;
    }

})();
