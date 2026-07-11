/**
 * =============================================================================
 * STILL WATERS - LOCATION DROPDOWN UI (locationDropdown.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ui/locationDropdown.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for location dropdown components.
 * All other modules should use these functions.
 * 
 * DEPENDENCIES:
 *   - formatting.js: escapeHtml
 *   - accessors.js: getPlaces, getPlaceById, getLocationTypes, getLocationTypePriority
 *   - world.js: getLocationHierarchyDisplay, getLocationCountry, getLocationDistrict,
 *               getChildPlaces, getPlacesByPriority, getPlacePriority
 * 
 * ICON POLICY: No emojis. Use icons.js sparingly.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION
// =============================================================================

if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
}

// =============================================================================
// 1. DEPENDENCY WRAPPERS - ALIASES TO CANONICAL SOURCES
// =============================================================================

function _escapeHtml(str) {
    return window.escapeHtml(str);
}

function _getPlaces() {
    if (typeof window.getPlaces === 'function') {
        return window.getPlaces();
    }
    return [];
}

function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') {
        return window.getPlaceById(id);
    }
    return null;
}

function _getLocationTypes() {
    if (typeof window.getLocationTypes === 'function') {
        return window.getLocationTypes();
    }
    return [];
}

function _getLocationTypePriority(typeId) {
    if (typeof window.getLocationTypePriority === 'function') {
        return window.getLocationTypePriority(typeId);
    }
    var types = _getLocationTypes();
    for (var i = 0; i < types.length; i++) {
        if (types[i].id === typeId) {
            return types[i].priority || 5;
        }
    }
    return 5;
}

function _getLocationHierarchyDisplay(place) {
    if (typeof window.getLocationHierarchyDisplay === 'function') {
        return window.getLocationHierarchyDisplay(place);
    }
    return place ? place.displayName : '';
}

function _getLocationCountry(place) {
    if (typeof window.getLocationCountry === 'function') {
        return window.getLocationCountry(place);
    }
    return 'Other Locations';
}

function _getLocationDistrict(place) {
    if (typeof window.getLocationDistrict === 'function') {
        return window.getLocationDistrict(place);
    }
    return null;
}

function _getChildPlaces(parentId) {
    if (typeof window.getChildPlaces === 'function') {
        return window.getChildPlaces(parentId);
    }
    return [];
}

function _getPlacesByPriority(priority) {
    if (typeof window.getPlacesByPriority === 'function') {
        return window.getPlacesByPriority(priority);
    }
    return [];
}

function _getPlacePriority(place) {
    if (typeof window.getPlacePriority === 'function') {
        return window.getPlacePriority(place);
    }
    if (place && place.priority) return place.priority;
    return 5;
}

function _matchesLocationFilters(placeId) {
    if (typeof window._locationFilterFn === 'function') {
        return window._locationFilterFn(placeId);
    }
    return true;
}

// =============================================================================
// 2. HIERARCHICAL LOCATION OPTIONS BUILDER - PRIMARY IMPLEMENTATION
// =============================================================================

function buildHierarchicalLocationOptions(locations) {
    var options = [];
    
    for (var i = 0; i < locations.length; i++) {
        var place = locations[i];
        options.push({
            id: place.id,
            displayText: _getLocationHierarchyDisplay(place),
            priority: _getPlacePriority(place),
            country: _getLocationCountry(place),
            district: _getLocationDistrict(place)
        });
    }
    
    options.sort(function(a, b) {
        if (a.country !== b.country) return a.country.localeCompare(b.country);
        if (a.district !== b.district) {
            if (!a.district) return 1;
            if (!b.district) return -1;
            return a.district.localeCompare(b.district);
        }
        return a.priority - b.priority;
    });
    
    return options;
}

// =============================================================================
// 3. RENDER HIERARCHICAL LOCATION OPTIONS HTML - PRIMARY IMPLEMENTATION
// =============================================================================

function renderHierarchicalLocationOptionsHtml(options, selectedId) {
    if (!options || options.length === 0) {
        return '<option value="">— No locations available —</option>';
    }
    
    var html = '<option value="">— Select a location —</option>';
    var currentCountry = '';
    var currentDistrict = '';
    
    for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        
        if (currentDistrict !== opt.district && currentDistrict !== '') {
            html += '</optgroup>';
            currentDistrict = '';
        }
        
        if (currentCountry !== opt.country && currentCountry !== '') {
            html += '</optgroup>';
            currentCountry = '';
        }
        
        if (currentCountry !== opt.country) {
            currentCountry = opt.country;
            html += '<optgroup label="' + _escapeHtml(currentCountry) + '">';
            currentDistrict = '';
        }
        
        if (currentDistrict !== opt.district && opt.district) {
            currentDistrict = opt.district;
            html += '<optgroup label="  └ ' + _escapeHtml(currentDistrict) + '" style="font-style:italic;">';
        }
        
        var indentLevel = 0;
        if (opt.priority === 3) indentLevel = 16;
        else if (opt.priority === 4) indentLevel = 32;
        else if (opt.priority >= 5) indentLevel = 48;
        
        var style = indentLevel > 0 ? 'style="padding-left:' + indentLevel + 'px;"' : '';
        var selectedAttr = (selectedId === opt.id) ? 'selected' : '';
        
        html += '<option value="' + opt.id + '" ' + selectedAttr + ' ' + style + '>' + _escapeHtml(opt.displayText) + '</option>';
    }
    
    if (currentDistrict !== '') html += '</optgroup>';
    if (currentCountry !== '') html += '</optgroup>';
    
    return html;
}

// =============================================================================
// 4. FILTERED LOCATION OPTIONS - PRIMARY IMPLEMENTATION
// =============================================================================

function getFilteredLocationOptions(selectedId) {
    var allPlaces = _getPlaces();
    var filteredPlaces = [];
    
    for (var i = 0; i < allPlaces.length; i++) {
        if (_matchesLocationFilters(allPlaces[i].id)) {
            filteredPlaces.push(allPlaces[i]);
        }
    }
    
    var hierarchicalOptions = buildHierarchicalLocationOptions(filteredPlaces);
    return renderHierarchicalLocationOptionsHtml(hierarchicalOptions, selectedId);
}

// =============================================================================
// 5. SIMPLE LOCATION OPTIONS
// =============================================================================

function renderSimpleLocationOptions(places, selectedId) {
    if (!places || places.length === 0) {
        return '<option value="">— No locations available —</option>';
    }
    
    var sorted = places.slice().sort(function(a, b) {
        return a.displayName.localeCompare(b.displayName);
    });
    
    var html = '<option value="">— Select a location —</option>';
    for (var i = 0; i < sorted.length; i++) {
        var selectedAttr = (selectedId === sorted[i].id) ? 'selected' : '';
        html += '<option value="' + sorted[i].id + '" ' + selectedAttr + '>' + _escapeHtml(sorted[i].displayName) + '</option>';
    }
    
    return html;
}

// =============================================================================
// 6. LOCATION OPTIONS BY PRIORITY OR PARENT
// =============================================================================

function renderLocationOptionsByPriority(priority, selectedId) {
    var places = _getPlacesByPriority(priority);
    var filteredPlaces = [];
    for (var i = 0; i < places.length; i++) {
        if (_matchesLocationFilters(places[i].id)) {
            filteredPlaces.push(places[i]);
        }
    }
    return renderSimpleLocationOptions(filteredPlaces, selectedId);
}

function renderLocationOptionsByParent(parentId, selectedId) {
    if (!parentId) return '<option value="">— Select a location —</option>';
    var children = _getChildPlaces(parentId);
    var filteredChildren = [];
    for (var i = 0; i < children.length; i++) {
        if (_matchesLocationFilters(children[i].id)) {
            filteredChildren.push(children[i]);
        }
    }
    return renderSimpleLocationOptions(filteredChildren, selectedId);
}

// =============================================================================
// 7. LOCATION SELECTOR COMPONENT
// =============================================================================

function createLocationSelector(containerId, options) {
    options = options || {};
    var container = document.getElementById(containerId);
    if (!container) return null;
    
    var onChange = options.onChange || null;
    var selectedId = options.selectedId || null;
    var showClear = options.showClear !== undefined ? options.showClear : true;
    var respectGlobalFilters = options.respectGlobalFilters !== undefined ? options.respectGlobalFilters : true;
    
    var currentSelectedId = selectedId;
    
    function render() {
        var html = 
            '<div class="location-selector">' +
            '<select id="' + containerId + '_select" class="location-select" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">';
        
        if (respectGlobalFilters) {
            html += getFilteredLocationOptions(currentSelectedId);
        } else {
            var allPlaces = _getPlaces();
            var hierarchicalOptions = buildHierarchicalLocationOptions(allPlaces);
            html += renderHierarchicalLocationOptionsHtml(hierarchicalOptions, currentSelectedId);
        }
        
        html += '</select>';
        
        if (showClear) {
            html += '<button type="button" id="' + containerId + '_clear" class="btn small" style="margin-top:4px;width:100%;background:var(--bg3);border:1px solid var(--border);padding:4px;border-radius:4px;cursor:pointer;">Clear</button>';
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        var selectEl = document.getElementById(containerId + '_select');
        var clearBtn = showClear ? document.getElementById(containerId + '_clear') : null;
        
        if (selectEl && onChange) {
            selectEl.addEventListener('change', function(e) {
                var value = e.target.value;
                currentSelectedId = value || null;
                if (onChange) onChange(currentSelectedId);
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                if (selectEl) selectEl.value = '';
                currentSelectedId = null;
                if (onChange) onChange(null);
            });
        }
    }
    
    render();
    
    return {
        getValue: function() { return currentSelectedId; },
        setValue: function(id) {
            currentSelectedId = id;
            render();
        },
        refresh: function() { render(); },
        destroy: function() { container.innerHTML = ''; }
    };
}

// =============================================================================
// 8. FILTER-AWARE SELECTOR
// =============================================================================

var _filterAwareSelectors = [];

function createFilterAwareLocationSelector(containerId, options) {
    options = options || {};
    var selector = createLocationSelector(containerId, {
        onChange: options.onChange,
        selectedId: options.selectedId,
        showClear: options.showClear,
        respectGlobalFilters: true
    });
    
    _filterAwareSelectors.push(selector);
    return selector;
}

function refreshAllFilterAwareSelectors() {
    for (var i = 0; i < _filterAwareSelectors.length; i++) {
        var selector = _filterAwareSelectors[i];
        if (selector && selector.refresh) {
            var currentValue = selector.getValue();
            selector.refresh();
            selector.setValue(currentValue);
        }
    }
}

function registerLocationFilterListener() {
    if (typeof window.addEventListener === 'function') {
        window.removeEventListener('locationFiltersChanged', refreshAllFilterAwareSelectors);
        window.addEventListener('locationFiltersChanged', refreshAllFilterAwareSelectors);
    }
}

function notifyLocationFiltersChanged() {
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('locationFiltersChanged'));
    }
}

function setLocationFilterFn(fn) {
    window._locationFilterFn = fn;
}

// =============================================================================
// 9. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Core builders - PRIMARY EXPORTS
window.buildHierarchicalLocationOptions = buildHierarchicalLocationOptions;
window.renderHierarchicalLocationOptionsHtml = renderHierarchicalLocationOptionsHtml;
window.getFilteredLocationOptions = getFilteredLocationOptions;

// Simple renderers
window.renderSimpleLocationOptions = renderSimpleLocationOptions;
window.renderLocationOptionsByPriority = renderLocationOptionsByPriority;
window.renderLocationOptionsByParent = renderLocationOptionsByParent;

// Component creators
window.createLocationSelector = createLocationSelector;
window.createFilterAwareLocationSelector = createFilterAwareLocationSelector;
window.refreshAllFilterAwareSelectors = refreshAllFilterAwareSelectors;
window.registerLocationFilterListener = registerLocationFilterListener;
window.notifyLocationFiltersChanged = notifyLocationFiltersChanged;
window.setLocationFilterFn = setLocationFilterFn;

// Alias for backward compatibility
window.buildLocationDropdown = function(selectedId, placeholderText, includeAll, includeUnknown) {
    var allPlaces = _getPlaces();
    var hierarchicalOptions = buildHierarchicalLocationOptions(allPlaces);
    return renderHierarchicalLocationOptionsHtml(hierarchicalOptions, selectedId);
};

window.buildLocationDropdownOptions = window.buildLocationDropdown;

// Auto-register listener
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerLocationFilterListener);
    } else {
        registerLocationFilterListener();
    }
}