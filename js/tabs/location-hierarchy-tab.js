// js/tabs/location-hierarchy-tab.js
/**
 * =============================================================================
 * LOCATION HIERARCHY TAB
 * =============================================================================
 * 
 * Displays the ancestor chain and descendants for a specific location.
 * 
 * Exports:
 *   - window.LocationHierarchyTab.render(containerId, locationId, onRefresh)
 * =============================================================================
 */

(function() {
    'use strict';

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        return (window.Icons && window.Icons[name]) ? window.Icons[name] : '';
    }

    function _getPlace(id) {
        if (window.LocationQueries && window.LocationQueries.getPlace) {
            return window.LocationQueries.getPlace(id);
        }
        return null;
    }

    function _getHierarchy(id) {
        if (window.LocationQueries && window.LocationQueries.getPlaceHierarchy) {
            return window.LocationQueries.getPlaceHierarchy(id);
        }
        return [];
    }

    function _getDescendants(id) {
        if (window.LocationQueries && window.LocationQueries.getPlaceChildren) {
            return window.LocationQueries.getPlaceChildren(id, true);
        }
        return [];
    }

    function _getTypeName(typeId) {
        if (window.LocationQueries && window.LocationQueries.getLocationTypeName) {
            return window.LocationQueries.getLocationTypeName(typeId);
        }
        return 'Unknown';
    }

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var place = _getPlace(locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var chain = _getHierarchy(locationId);
        var descendants = _getDescendants(locationId);

        var html = '<div style="padding: 4px;">';

        // --- ANCESTRY SECTION ---
        html += '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px;">';
        html += '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold; margin-bottom: 10px;">' + _getIcon('LOCATION') + ' Hierarchy Path</div>';
        
        if (chain.length === 0) {
            html += '<div style="color: var(--dim); font-size: 0.7rem;">No hierarchy path found.</div>';
        } else {
            html += '<div style="display: flex; flex-direction: column; gap: 2px;">';
            for (var i = 0; i < chain.length; i++) {
                var node = chain[i];
                var isSelf = node.id === locationId;
                var typeName = _getTypeName(node.typeId);
                
                var bg = isSelf ? 'var(--accent-dim)' : 'transparent';
                var borderLeft = isSelf ? '3px solid var(--accent)' : '3px solid transparent';
                var color = isSelf ? 'var(--accent-light)' : 'var(--text)';
                var weight = isSelf ? 'bold' : 'normal';

                html += '<div style="display: flex; align-items: center; padding: 6px 8px; border-radius: 4px; background: ' + bg + '; border-left: ' + borderLeft + ';">';
                
                // Indent based on depth
                var indent = '';
                for (var j = 0; j < i; j++) {
                    indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
                }
                if (i > 0) {
                    indent += '└─ ';
                }
                
                html += '<span style="font-size: 0.75rem; color: ' + color + '; font-weight: ' + weight + '; flex: 1;">' +
                    indent + _escapeHtml(node.displayName) + 
                    '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px; font-weight: normal;">(' + _escapeHtml(typeName) + ')</span>' +
                    '</span>';
                
                // Button to navigate to this ancestor (if not self)
                if (!isSelf && onRefresh) {
                    html += '<button class="btn btn-small nav-ancestor-btn" data-id="' + node.id + '" style="background: var(--bg3); border: 1px solid var(--border); padding: 2px 8px; font-size: 0.55rem; cursor: pointer; color: var(--accent); border-radius: 4px;">Go to</button>';
                }

                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // --- DESCENDANTS SECTION ---
        html += '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px;">';
        html += '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold; margin-bottom: 10px;">' + _getIcon('PEOPLE') + ' Descendants (' + descendants.length + ')</div>';

        if (descendants.length === 0) {
            html += '<div style="color: var(--dim); font-size: 0.7rem; text-align: center; padding: 12px 0;">This location has no sub-locations.</div>';
        } else {
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">';
            for (var k = 0; k < descendants.length; k++) {
                var desc = descendants[k];
                var descType = _getTypeName(desc.typeId);
                var descParent = _getPlace(desc.parentId);
                var descParentName = descParent ? descParent.displayName : 'Unknown';

                html += '<div style="background: var(--bg3); padding: 8px 10px; border-radius: 6px; border-left: 2px solid var(--border);">';
                html += '<div style="font-size: 0.7rem; font-weight: 500; color: var(--text);">' + _escapeHtml(desc.displayName) + '</div>';
                html += '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">';
                html += _escapeHtml(descType) + ' · Parent: ' + _escapeHtml(descParentName);
                html += '</div>';
                if (onRefresh) {
                    html += '<button class="btn btn-small nav-desc-btn" data-id="' + desc.id + '" style="margin-top: 6px; background: transparent; border: 1px solid var(--border); padding: 2px 8px; font-size: 0.55rem; cursor: pointer; color: var(--accent); border-radius: 4px;">View Details</button>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;

        // Bind events
        if (onRefresh) {
            container.querySelectorAll('.nav-ancestor-btn, .nav-desc-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = this.getAttribute('data-id');
                    if (id) {
                        // Dispatch a global custom event that LocationManager listens to
                        var event = new CustomEvent('locationSelected', { detail: { id: id } });
                        document.dispatchEvent(event);
                    }
                });
            });
        }
    }

    window.LocationHierarchyTab = {
        render: render
    };

})();
