// js/tabs/location-hierarchy-tab.js
/**
 * =============================================================================
 * LOCATION HIERARCHY TAB
 * js/tabs/location-hierarchy-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-hierarchy-tab.js
 *
 * Displays the ancestor chain and all descendants for the selected location.
 * Each ancestor and descendant has a "Go to" button that dispatches a
 * 'locationSelected' custom event; the bootstrap listens and routes it to
 * _selectLocation.
 *
 * SCOPE
 * -----
 * - Reads the place, its ancestors, and its descendants via LocationQueries.
 * - Renders two sections: Hierarchy Path (root → self) and Descendants.
 * - Delegates navigation to the bootstrap via a 'locationSelected' event.
 *
 * OUT OF SCOPE
 * ------------
 * - Selection state (owned by LocationUIState + the bootstrap).
 * - Navigation routing (owned by the bootstrap's locationSelected listener).
 * - Inline CSS. Classes resolve from the shell's inline <style> block.
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(id)
 *   - LocationQueries.getPlaceHierarchy(id)      (ancestors root→self)
 *   - LocationQueries.getPlaceChildren(id, true) (descendants)
 *   - LocationQueries.getLocationTypeName(typeId)
 *
 * FILTERS: none.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries — REQUIRED (renderer refuses if absent)
 *   - TabManager      — REQUIRED (registration; logs on absence)
 *   - formatting.js   (escapeHtml) — soft fallback in _esc
 *   - icons.js        (Icons)      — soft
 *
 * TIME CONTRACT: none.
 * ICON POLICY: no emojis, no literal Unicode box-drawing glyphs in JS output.
 *   The tree-guide glyph is a CSS ::before content rule (\2514) keyed off
 *   [data-depth], defined in the shell's inline <style>.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Renderer contract is fn(container, context); registers with TabManager
 *     at load time via _registerTab (signature-adaptive, never throws).
 *   - Removed every inline style attribute; layout from .loc-hier-* classes.
 *   - Removed the literal '└─' glyph from JS. Depth is data-depth="N";
 *     the guide is CSS.
 *   - Removed per-button listeners. One delegated click handler on the
 *     container, routed via data-action + data-id.
 *   - Empty states are three-way: no-context / no-place / no-data.
 *   - Removed all file-scope throw blocks; the renderer refuses with a
 *     visible rt-unavailable panel when LocationQueries is missing.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'hierarchy';
    var SCOPE  = 'location';

    // =========================================================================
    // 1. DEPENDENCY HELPERS (soft; no throws at load time)
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
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') return window.Icons[name];
        return '';
    }
    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }
    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try { TM.requestRender(SCOPE, TAB_ID); } catch (e) { /* ignore */ }
        }
    }

    /**
     * Register this tab with TabManager, adapting to whichever register()
     * signature the loaded TabManager exposes. Never throws.
     *
     *   A: register(scope, tabId, renderFn)
     *   B: register(scope, { id, render })
     *   C: register(tabId, renderFn)
     */
    function _registerTab(scope, tabId, renderFn) {
        var TM = _tabManager();
        if (!TM || typeof TM.register !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('location-' + tabId + '-tab.js: TabManager.register unavailable; tab not registered.');
            }
            return false;
        }

        var eA = null, eB = null, eC = null;

        try {
            TM.register(scope, tabId, renderFn);
            if (typeof console !== 'undefined' && console.info) {
                console.info('location-' + tabId + '-tab.js: registered via signature A (scope, tabId, render).');
            }
            return true;
        } catch (err) { eA = err; }

        try {
            TM.register(scope, { id: tabId, render: renderFn });
            if (typeof console !== 'undefined' && console.info) {
                console.info('location-' + tabId + '-tab.js: registered via signature B (scope, {id, render}).');
            }
            return true;
        } catch (err) { eB = err; }

        try {
            TM.register(tabId, renderFn);
            if (typeof console !== 'undefined' && console.info) {
                console.info('location-' + tabId + '-tab.js: registered via signature C (tabId, render).');
            }
            return true;
        } catch (err) { eC = err; }

        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'location-' + tabId + '-tab.js: no TabManager.register signature accepted this tab.',
                { A: eA && eA.message, B: eB && eB.message, C: eC && eC.message }
            );
        }
        return false;
    }

    // =========================================================================
    // 2. RENDER SECTIONS
    // =========================================================================

    function _renderAncestry(chain, locationId, Q) {
        var html = '<div class="loc-hier-section">';
        html += '<div class="loc-tab-section-title">' + _icon('LOCATION') + ' Hierarchy Path</div>';
        if (chain.length === 0) {
            html += '<div class="loc-tab-empty">No hierarchy path found.</div>';
        } else {
            html += '<div class="loc-hier-list">';
            for (var i = 0; i < chain.length; i++) {
                var node = chain[i];
                var isSelf = node.id === locationId;
                var typeName = Q.getLocationTypeName(node.typeId) || 'Unknown';
                var cls = 'loc-hier-row' + (isSelf ? ' is-self' : '');
                html += '<div class="' + cls + '" data-depth="' + i + '">';
                html +=   '<span class="loc-hier-row-name">' +
                            _esc(node.displayName) +
                            '<span class="loc-hier-row-type">(' + _esc(typeName) + ')</span>' +
                          '</span>';
                if (!isSelf) {
                    html += '<button type="button" class="loc-hier-nav-btn" ' +
                              'data-action="navigate" data-id="' + _esc(node.id) + '">Go to</button>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderDescendants(descendants, Q) {
        var html = '<div class="loc-hier-section">';
        html += '<div class="loc-tab-section-title">' +
                    _icon('PEOPLE') + ' Descendants (' + descendants.length + ')' +
                '</div>';
        if (descendants.length === 0) {
            html += '<div class="loc-tab-empty">This location has no sub-locations.</div>';
        } else {
            html += '<div class="loc-hier-desc-grid">';
            for (var k = 0; k < descendants.length; k++) {
                var desc = descendants[k];
                var descType = Q.getLocationTypeName(desc.typeId) || 'Unknown';
                var descParent = Q.getPlace(desc.parentId);
                var descParentName = descParent ? descParent.displayName : 'Unknown';
                html += '<div class="loc-hier-desc-card">';
                html +=   '<div class="loc-hier-desc-name">' + _esc(desc.displayName) + '</div>';
                html +=   '<div class="loc-hier-desc-meta">' +
                            _esc(descType) + ' · Parent: ' + _esc(descParentName) +
                          '</div>';
                html +=   '<button type="button" class="loc-hier-nav-btn" ' +
                            'data-action="navigate" data-id="' + _esc(desc.id) + '">View Details</button>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderHierarchyTab(container, context) {
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

        var chain = [];
        var descendants = [];
        try { chain = Q.getPlaceHierarchy(context.locationId) || []; }
        catch (e) { /* chain stays [] */ }
        try { descendants = Q.getPlaceChildren(context.locationId, true) || []; }
        catch (e) { /* descendants stays [] */ }

        var html = '<div class="loc-tab">';
        html += _renderAncestry(chain, context.locationId, Q);
        html += _renderDescendants(descendants, Q);
        html += '</div>';
        container.innerHTML = html;

        if (!container.__locationHierarchyWired) {
            container.__locationHierarchyWired = true;
            container.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action="navigate"]');
                if (!btn || !container.contains(btn)) return;
                var id = btn.getAttribute('data-id');
                if (!id) return;
                // Route through a custom event. The bootstrap owns selection
                // (it also updates the sidebar highlight and the year control).
                document.dispatchEvent(new CustomEvent('locationSelected', {
                    detail: { id: id }
                }));
            });
        }
    }

    // =========================================================================
    // 4. REGISTRATION
    // =========================================================================

    _registerTab(SCOPE, TAB_ID, renderHierarchyTab);

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationHierarchyTab = { id: TAB_ID, render: renderHierarchyTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationHierarchyTab;
    }
})();
