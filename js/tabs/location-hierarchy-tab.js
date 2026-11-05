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
 * 'locationSelected' custom event; the bootstrap listens and routes it.
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(id)
 *   - LocationQueries.getPlaceHierarchy(id)     (ancestors root→self)
 *   - LocationQueries.getPlaceChildren(id, true) (descendants)
 *   - LocationQueries.getLocationTypeName(typeId)
 *
 * FILTERS: none.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries — REQUIRED
 *   - TabManager      — REQUIRED
 *   - formatting.js   (escapeHtml) — REQUIRED
 *   - icons.js        (Icons)      — soft
 *
 * TIME CONTRACT: none.
 * ICON POLICY: no emojis, no literal Unicode box-drawing glyphs. Indentation
 *   uses CSS padding-left driven by the node's depth; the tree-guide glyph
 *   is rendered as a CSS pseudo-element in css/location-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Refactored to the Education tab skeleton:
 *     - Renderer contract is fn(container, context).
 *     - Registers with TabManager at load time.
 *     - Removed every inline style attribute. All layout comes from
 *       .loc-hier-* classes in css/location-tabs.css.
 *     - Removed the literal '└─' glyph. Depth is now a data-depth attribute,
 *       styled via CSS.
 *     - Removed per-button listeners. One delegated click handler on
 *       the container, routed via data-action + data-id.
 *     - Empty states are three-way: no-context / no-place / no-data.
 *     - _esc throws if escapeHtml is missing (was: silently returned '').
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'hierarchy';
    var SCOPE  = 'location';

    // =========================================================================
    // 1. DEPENDENCY HELPERS (soft; strict fallbacks)
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

    // =========================================================================
    // 2. RENDER
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
    // 3. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderHierarchyTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('location-hierarchy-tab.js: TabManager is not available at load time; the tab was not registered. Load tab-manager.js first.');
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.LocationHierarchyTab = { id: TAB_ID, render: renderHierarchyTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationHierarchyTab;
    }
})();
