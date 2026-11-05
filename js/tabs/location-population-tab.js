// js/tabs/location-population-tab.js
/**
 * =============================================================================
 * LOCATION POPULATION TAB
 * js/tabs/location-population-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-population-tab.js
 *
 * Displays demographics and the resident list for a location. Age-band
 * aggregation (children / adults / elderly) is presentation shape, not a
 * domain fact — the boundaries are local to this tab.
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(id)
 *   - LocationQueries.getLocationStatistics(id)
 *   - LocationQueries.getResidentsAtLocation(id, { includeDeceased: true })
 *
 * FILTERS: none yet. (A future revision may add a living/deceased filter
 *   persisted per-context under location_population_filters_<id>.)
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries  — REQUIRED
 *   - TabManager       — REQUIRED
 *   - formatting.js    (escapeHtml) — REQUIRED
 *   - icons.js         (Icons)      — soft
 *   - time.js          (calculateAge, getCurrentYear) — soft (age shows 'unknown' when absent)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback year).
 * ICON POLICY: no emojis, no literal Unicode gender glyphs (♂ / ♀).
 *   Gender is rendered from Icons.MALE / Icons.FEMALE, '' fallback.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Refactored to the Education tab skeleton:
 *     - Renderer contract is fn(container, context).
 *     - Registers with TabManager at load time.
 *     - Removed literal ♂ / ♀ glyphs; gender comes from Icons[name].
 *     - Removed every inline style attribute; layout from .loc-pop-* classes.
 *     - Empty states are three-way: no-context / no-place / no-residents.
 *     - _ageOf uses window.getCurrentYear (no hardcoded fallback year).
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'population';
    var SCOPE  = 'location';

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

    function _ageOf(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        if (typeof window.calculateAge !== 'function') return null;
        var currentYear = (typeof window.getCurrentYear === 'function')
            ? window.getCurrentYear() : null;
        if (currentYear === null) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear,
            currentYear
        );
    }
    function _displayName(character) {
        if (!character) return 'Unknown';
        var full = ((character.name || '') + ' ' + (character.surname || '')).trim();
        return full || 'Unknown';
    }
    function _genderIcon(gender) {
        if (gender === 'male')   return _icon('MALE');
        if (gender === 'female') return _icon('FEMALE');
        return '';
    }

    function _renderStats(stats, living, deceased) {
        var html = '<div class="loc-tab-stats-grid loc-tab-stats-grid--wrap">';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-value loc-tab-stat-value--accent">' +
                        (stats.totalPopulation || 0).toLocaleString() +
                    '</div>' +
                    '<div class="loc-tab-stat-label">Total Pop</div></div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-value loc-tab-stat-value--ok">' +
                        (stats.ownPopulation || 0).toLocaleString() +
                    '</div>' +
                    '<div class="loc-tab-stat-label">Direct Residents</div></div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-value">' + living.toLocaleString() + '</div>' +
                    '<div class="loc-tab-stat-label">Living</div></div>';
        html += '<div class="loc-tab-stat">' +
                    '<div class="loc-tab-stat-value loc-tab-stat-value--danger">' +
                        deceased.toLocaleString() +
                    '</div>' +
                    '<div class="loc-tab-stat-label">Deceased</div></div>';
        html += '</div>';
        return html;
    }

    function _renderAgeBreakdown(children, adults, elderly) {
        var html = '<div class="loc-tab-section">';
        html += '<div class="loc-tab-section-title">Age Breakdown (Living)</div>';
        html += '<div class="loc-pop-age-row">';
        html += '<div><span class="loc-tab-label">Children (0-17):</span> ' +
                    '<span class="loc-tab-value loc-tab-value--bold">' + children + '</span></div>';
        html += '<div><span class="loc-tab-label">Adults (18-59):</span> ' +
                    '<span class="loc-tab-value loc-tab-value--bold">' + adults + '</span></div>';
        html += '<div><span class="loc-tab-label">Elderly (60+):</span> ' +
                    '<span class="loc-tab-value loc-tab-value--bold">' + elderly + '</span></div>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function _renderResidentList(residents) {
        var html = '<div class="loc-tab-section">';
        html += '<div class="loc-tab-section-title">Resident List (' + residents.length + ')</div>';
        if (residents.length === 0) {
            html += '<div class="loc-tab-empty">No characters reside here.</div>';
        } else {
            var sorted = residents.slice().sort(function (a, b) {
                return _displayName(a).localeCompare(_displayName(b));
            });
            html += '<div class="loc-resident-list">';
            for (var k = 0; k < sorted.length; k++) {
                var res = sorted[k];
                var age = _ageOf(res);
                var isDead = res.isDeceased === true;
                var genderSym = _genderIcon(res.gender);
                html += '<div class="loc-resident-row">';
                html +=   '<div class="loc-resident-row-name">';
                if (genderSym) {
                    html += '<span class="loc-resident-row-gender">' + genderSym + '</span>';
                }
                html +=     '<span>' + _esc(_displayName(res)) + '</span>';
                if (isDead) {
                    html += '<span class="loc-resident-row-deceased">(Deceased)</span>';
                }
                html +=   '</div>';
                html +=   '<div class="loc-resident-row-age">' +
                            (age !== null ? _esc(String(age)) + ' years' : 'Age unknown') +
                          '</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderPopulationTab(container, context) {
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
        catch (e) { /* stats best-effort */ }

        var residents = [];
        if (typeof Q.getResidentsAtLocation === 'function') {
            try {
                residents = Q.getResidentsAtLocation(context.locationId, {
                    includeDeceased: true
                }) || [];
            } catch (e) { residents = []; }
        }

        var living = 0, deceased = 0, children = 0, adults = 0, elderly = 0;
        for (var i = 0; i < residents.length; i++) {
            var c = residents[i];
            if (c.isDeceased === true) { deceased++; continue; }
            living++;
            var age = _ageOf(c);
            if (age === null) continue;
            if (age < 18) children++;
            else if (age >= 60) elderly++;
            else adults++;
        }

        var html = '<div class="loc-tab">';
        html += '<div class="loc-tab-header">' +
                    '<div class="loc-tab-header-text">' +
                      '<div class="loc-tab-header-title">' +
                        _icon('PERSON') + ' Demographics: ' + _esc(place.displayName) +
                      '</div>' +
                    '</div>' +
                '</div>';
        html += _renderStats(stats, living, deceased);
        html += _renderAgeBreakdown(children, adults, elderly);
        html += _renderResidentList(residents);
        html += '</div>';
        container.innerHTML = html;
    }

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderPopulationTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('location-population-tab.js: TabManager is not available at load time; the tab was not registered. Load tab-manager.js first.');
    }

    window.LocationPopulationTab = { id: TAB_ID, render: renderPopulationTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationPopulationTab;
    }
})();
