/**
 * =============================================================================
 * EVENTS ADOPTION TAB
 * js/tabs/events-adoption-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-adoption-tab.js
 *
 * The Events Manager's Adoption tab. Renders every adoption metadata
 * record in the world, grouped by type (Legal Adoption / Guardianship
 * / Foster Care), sorted within each type group by status (active
 * first) and then by the caller-selected sort key. Provides filter
 * controls, a stats bar with adoption-specific counts, an inline
 * "New Adoption" creation block (child picker + adopter picker +
 * Create button), and per-row Edit / End actions.
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *              eventsState: { statsBar, ... } -- bootstrap-provided
 *              initial reads (may be absent; this tab computes its
 *              own adoption-specific stats bar regardless).
 *
 * DATA SOURCES:
 *   EventsQueries.getAdoptionRecords(locationId)
 *   EventsViewModels.toAdoptionRow / toAdoptionRows
 *                   .toAdoptionTypeFilterOptions
 *                   .toAdoptionStatusFilterOptions
 *                   .toAdoptionSortOptions
 *                   .toAdoptionStatsBarViewModel
 *                   .adoptionStatusPriority
 *   EventsUIList.renderAdoptionTabBody / renderOptionList
 *   UIState.getFilters / setFilters
 *   window.openCreateAdoptionModal(childId, adopterId, onSuccess)
 *   window.openEditAdoptionModal(adoptionId, onSuccess)
 *   window.openEndAdoptionModal(adoptionId, onSuccess)
 *   CharacterQueries.getAllCharacters  (for the inline pickers)
 *
 * FILTERS (persisted per location via UIState):
 *   search           string
 *   type             'all' | 'legal' | 'guardianship' | 'foster'
 *   status           'all' | 'active' | 'ended' | 'dissolved'
 *   sortBy           'year' | 'childName' | 'adopterName'
 *   showAllLocations boolean (default true)
 *   collapsed        boolean (filters collapsed)
 *
 * ACTION SET:
 *   Per-row, on active records:   End Adoption, Edit
 *   Per-row, on ended/dissolved:  Edit only
 *     (endAdoptionMetadata refuses non-active records; showing an
 *      End button that always errors would be misleading)
 *
 * CREATE FLOW:
 *   The inline New Adoption block has two <select> pickers (child,
 *   adopter) and a Create button. Both pickers are populated from
 *   CharacterQueries.getAllCharacters, filtered to living characters
 *   (the modals-character adoption modal requires living
 *   participants). On submit, the tab calls openCreateAdoptionModal
 *   with both ids resolved. The modal itself collects the record's
 *   type, role, year, and notes; the tab does not duplicate that
 *   form.
 *
 *   NOTE: openCreateAdoptionModal does NOT accept null ids -- it
 *   resolves _readSummary(childId) and fails immediately on a missing
 *   child. That is why this tab has an inline picker bar instead of
 *   delegating picker selection to the modal.
 *
 * DELEGATED EVENTS:
 *   One click listener on the tab container (attached once via
 *   container.__eventsAdoptionWired).
 *     data-action="new-adoption"
 *     data-action="edit-adoption"     data-adoption-id=<id>
 *     data-action="end-adoption"      data-adoption-id=<id>
 *     data-action="refresh"
 *     data-action="clear-filters"
 *     data-action="toggle-collapse"
 *   Input/change listeners on the search box and filter selects are
 *   attached per render (they are new elements every render).
 *
 * FILTER APPLICATION:
 *   - type      narrows the rendered type groups (an empty type group
 *               is omitted entirely)
 *   - status    narrows the rows within each group
 *   - search    matches child name, child surname, adopter name,
 *               adopter surname
 *   The type grouping itself is stable: groups render in a fixed
 *   order (legal, guardianship, foster) regardless of filters or
 *   sort. Filters remove groups, they never reorder them.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - EventsQueries         REQUIRED
 *   - EventsViewModels      REQUIRED
 *   - EventsUIList          REQUIRED
 *   - EventsConstants       REQUIRED
 *   - TabManager            REQUIRED for registration
 *   - formatting.js escapeHtml  REQUIRED (via EventsUIList at load)
 *   - icons.js getIcon          REQUIRED (via EventsUIList at load)
 *   - ui.js showToast       OPTIONAL (silent if absent)
 *   - UIState               REQUIRED (filters persistence)
 *   - CharacterQueries      OPTIONAL (only used to populate the
 *                           inline New Adoption pickers; if absent,
 *                           the picker block renders an unavailable
 *                           hint and the Create button is disabled)
 *   - window.openCreateAdoptionModal OPTIONAL (toast if absent)
 *   - window.openEditAdoptionModal   OPTIONAL (toast if absent)
 *   - window.openEndAdoptionModal    OPTIONAL (toast if absent)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis, no Unicode glyphs. Icons via EventsUIList.icon.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision (Phase 3B).
 *     - Ported the create / edit / end adoption flows from
 *       modals-children-adoption.js into a per-row tab surface.
 *     - Inline New Adoption picker (two <select>s populated from
 *       CharacterQueries.getAllCharacters) is used INSTEAD of
 *       delegating picker selection to the modal, because
 *       openCreateAdoptionModal requires both ids.
 *     - Filters (search, type, status, sortBy) persist per-location
 *       via UIState (key: 'events-adoption:<locationId|all>').
 *     - Filters reset on location change via _lastPanelId.
 *     - Adapter-specific stats bar (Total / Active / Ended / Legal /
 *       Guardianship / Foster) is computed by
 *       toAdoptionStatsBarViewModel from the already-fetched
 *       records. The bootstrap's generic eventsState.statsBar is
 *       ignored.
 *     - Delegated click handler lives on the tab container,
 *       guarded by container.__eventsAdoptionWired.
 *     - Filter inputs wired per render (they're new elements).
 *     - Three-way empty state (no-adoptions / no-matches /
 *       unavailable).
 *     - No setTimeout. No document.getElementById outside
 *       _ensureStyles. No literal Unicode glyphs. No hardcoded
 *       colors. No inline writes.
 *     - Per-row action set: End + Edit on active; Edit only on
 *       inactive (endAdoptionMetadata refuses non-active records).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'adoption';
    var SCOPE  = 'events';

    // =========================================================================
    // 2. DEPENDENCY ACCESSORS
    // =========================================================================

    function _queries()           { return window.EventsQueries || null; }
    function _vm()                { return window.EventsViewModels || null; }
    function _ui()                { return window.EventsUIList || null; }
    function _constants()         { return window.EventsConstants || null; }
    function _tabManager()        { return window.TabManager || null; }
    function _uiState()           { return window.UIState || null; }
    function _characterQueries()  { return window.CharacterQueries || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v == null ? '' : String(v));
        }
        return '';
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            return window.getIcon(name, 'CIRCLE');
        }
        return '';
    }

    // =========================================================================
    // 3. PANEL ID
    // =========================================================================

    function _panelId(locationId) {
        var C = _constants();
        var base = C ? C.panelIdFor(TAB_ID) : ('events-' + TAB_ID);
        return base + ':' + (locationId || 'all');
    }

    // =========================================================================
    // 4. FILTER STATE
    // =========================================================================

    var _state = null;
    var _lastPanelId = null;

    function _defaultFilters() {
        var C = _constants();
        if (C && typeof C.getDefaultFiltersForFacet === 'function') {
            return C.getDefaultFiltersForFacet(TAB_ID);
        }
        return {
            search: '',
            type: 'all',
            status: 'all',
            sortBy: 'year',
            locationId: null,
            showAllLocations: true,
            collapsed: false
        };
    }

    function _readFilters(panelId) {
        var U = _uiState();
        if (!U) return _defaultFilters();
        var stored = U.getFilters(panelId);
        if (!stored || typeof stored !== 'object') return _defaultFilters();

        var base = _defaultFilters();
        for (var key in stored) {
            if (Object.prototype.hasOwnProperty.call(stored, key)) {
                base[key] = stored[key];
            }
        }
        return base;
    }

    function _writeFilters(panelId, filters) {
        var U = _uiState();
        if (!U) return;
        U.setFilters(panelId, filters);
    }

    // =========================================================================
    // 5. FILTER APPLICATION
    // =========================================================================
    //
    // Applies the type / status / search filters to the records.
    // Returns the filtered records (still sorted by the query layer
    // for stability; the grouping step does its own sorting within
    // each group).

    function _applyFilters(records, filters) {
        if (!Array.isArray(records)) return [];

        var type = filters.type || 'all';
        var status = filters.status || 'all';
        var search = (typeof filters.search === 'string')
            ? filters.search.trim().toLowerCase()
            : '';

        var filtered = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r) continue;
            if (type !== 'all' && r.type !== type) continue;
            if (status !== 'all' && r.status !== status) continue;

            if (search.length > 0) {
                var child = r.child || null;
                var adopter = r.adopter || null;
                var childHay = child
                    ? ((child.name || '') + ' ' + (child.surname || '')).toLowerCase()
                    : '';
                var adopterHay = adopter
                    ? ((adopter.name || '') + ' ' + (adopter.surname || '')).toLowerCase()
                    : '';
                if (childHay.indexOf(search) === -1
                    && adopterHay.indexOf(search) === -1) {
                    continue;
                }
            }

            filtered.push(r);
        }
        return filtered;
    }

    // =========================================================================
    // 6. GROUPING
    // =========================================================================
    //
    // Groups the filtered rows by type, sorts within each group by
    // status priority (active first, then ended, then dissolved),
    // then by the caller-selected sortBy. The groups themselves
    // render in a fixed order (legal, guardianship, foster) so the
    // UI is stable across renders.
    //
    // The type group order is a UI contract: users learn "legal
    // adoptions appear first" and expect it to stay that way.

    var TYPE_GROUP_ORDER = ['legal', 'guardianship', 'foster'];

    function _groupByType(filteredRecords, filters) {
        var sortBy = filters.sortBy || 'year';
        var VM = _vm();

        var buckets = { legal: [], guardianship: [], foster: [] };

        for (var i = 0; i < filteredRecords.length; i++) {
            var r = filteredRecords[i];
            if (!r) continue;
            var bucket = buckets[r.type];
            if (!bucket) {
                // Unknown type (defensive): skip -- no group to add to.
                continue;
            }
            bucket.push(r);
        }

        // Sort within each bucket: status priority, then sortBy key.
        for (var t = 0; t < TYPE_GROUP_ORDER.length; t++) {
            var typeKey = TYPE_GROUP_ORDER[t];
            var list = buckets[typeKey];
            list.sort(function(a, b) {
                var pa = VM && typeof VM.adoptionStatusPriority === 'function'
                    ? VM.adoptionStatusPriority(a.status)
                    : 0;
                var pb = VM && typeof VM.adoptionStatusPriority === 'function'
                    ? VM.adoptionStatusPriority(b.status)
                    : 0;
                if (pa !== pb) return pa - pb;

                if (sortBy === 'childName') {
                    var an = a.child
                        ? ((a.child.name || '') + ' ' + (a.child.surname || '')).trim()
                        : '';
                    var bn = b.child
                        ? ((b.child.name || '') + ' ' + (b.child.surname || '')).trim()
                        : '';
                    return an.localeCompare(bn);
                }
                if (sortBy === 'adopterName') {
                    var aan = a.adopter
                        ? ((a.adopter.name || '') + ' ' + (a.adopter.surname || '')).trim()
                        : '';
                    var bbn = b.adopter
                        ? ((b.adopter.name || '') + ' ' + (b.adopter.surname || '')).trim()
                        : '';
                    return aan.localeCompare(bbn);
                }
                // year (default, descending -- newest first)
                var ya = (typeof a.year === 'number') ? a.year : 0;
                var yb = (typeof b.year === 'number') ? b.year : 0;
                if (ya !== yb) return yb - ya;
                return String(a.id).localeCompare(String(b.id));
            });
        }

        var groups = [];
        for (var g = 0; g < TYPE_GROUP_ORDER.length; g++) {
            var typeId = TYPE_GROUP_ORDER[g];
            var rows = buckets[typeId];
            if (rows.length === 0) continue;
            groups.push({
                typeId: typeId,
                typeLabel: VM && typeof VM.adoptionTypeLabel === 'function'
                    ? VM.adoptionTypeLabel(typeId)
                    : typeId,
                typeIconName: VM && typeof VM.adoptionTypeIconName === 'function'
                    ? VM.adoptionTypeIconName(typeId)
                    : 'ADOPTION_LEGAL',
                rows: rows
            });
        }

        return groups;
    }

    // =========================================================================
    // 7. EMPTY-STATE CASE DETECTION
    // =========================================================================
    //
    // Cases:
    //   'unavailable'   records query failed
    //   'no-adoptions'  zero records exist at all (before filters)
    //   'no-matches'    records exist but filters exclude all
    //   null            filtered records exist; render the groups

    function _detectEmptyState(recordsResult, totalRecordCount, filteredCount) {
        if (!recordsResult || recordsResult.available !== true) {
            return 'unavailable';
        }
        if (totalRecordCount === 0) return 'no-adoptions';
        if (filteredCount === 0) return 'no-matches';
        return null;
    }

    // =========================================================================
    // 8. INLINE NEW ADOPTION BLOCK
    // =========================================================================
    //
    // The create modal requires both ids. This block collects them
    // inline via two <select> pickers populated from
    // CharacterQueries.getAllCharacters, filtered to living
    // characters.
    //
    // If CharacterQueries is absent, the pickers render an
    // "unavailable" hint and the Create button is disabled. That is
    // a legitimate reduced-harness state, not an error.

    var _creationSelection = { childId: '', adopterIds: [], showSingles: false };

    function _livingCharacters() {
        var CQ = _characterQueries();
        if (!CQ || typeof CQ.getAllCharacters !== 'function') return null;
        var all = CQ.getAllCharacters();
        if (!Array.isArray(all)) return null;
        var year = typeof window.getCurrentYear === 'function' ? window.getCurrentYear() : null;
        return all.filter(function(c) {
            return !!c && !!c.id && c.isDeleted !== true && c.isDeceased !== true;
        }).map(function(c) {
            if (typeof c.age === 'number' || typeof c.birthYear !== 'number' || typeof year !== 'number') return c;
            return Object.assign({}, c, { age: year - c.birthYear });
        });
    }

    function _personName(c) {
        return ((c && c.name) || '') + ((c && c.surname) ? ' ' + c.surname : '');
    }
    function _personLocation(c) {
        var id = c && (c.locationId || c.currentLocationId || c.location);
        var LQ = window.LocationQueries;
        if (id && LQ && typeof LQ.getPlaceById === 'function') {
            var place = LQ.getPlaceById(id);
            if (place) return place.displayName || place.name || id;
        }
        return id || 'Location unknown';
    }
    function _parentsFor(c) {
        var FQ = window.FamilyQueries;
        if (!FQ || typeof FQ.hasAnyParent !== 'function') return true;
        return FQ.hasAnyParent(c.id) !== false;
    }
    function _couples(characters) {
        var RQ = window.RomanceQueries, seen = {}, out = [];
        if (!RQ || typeof RQ.getActiveRomanticRelationships !== 'function') return out;
        characters.forEach(function(c) {
            (RQ.getActiveRomanticRelationships(c.id) || []).forEach(function(p) {
                var id = p.partnerId;
                if (!id || id === c.id || !characters.some(function(x){return x.id===id;})) return;
                var key = [c.id,id].sort().join('|');
                if (seen[key]) return;
                seen[key] = true;
                var other = characters.find(function(x){return x.id===id;});
                out.push([c,other]);
            });
        });
        out.forEach(function(pair){ pair.sort(function(a,b){ var ga=String(a.gender||'').toLowerCase()==='male'?0:String(a.gender||'').toLowerCase()==='female'?1:2; var gb=String(b.gender||'').toLowerCase()==='male'?0:String(b.gender||'').toLowerCase()==='female'?1:2; return ga-gb || (typeof b.age==='number'?b.age:-1)-(typeof a.age==='number'?a.age:-1); }); });
        out.sort(function(a,b){return Math.max(b[0].age||-1,b[1].age||-1)-Math.max(a[0].age||-1,a[1].age||-1);});
        return out;
    }
    function _kinshipLabel(childId, adopterId) {
        var FQ = window.FamilyQueries;
        if (!FQ || typeof FQ.classifyKinship !== 'function') return '';
        var k = FQ.classifyKinship(childId, adopterId);
        if (!k) return '';
        var type = String(k.type || '').toLowerCase().replace(/_/g,' ');
        if (type === 'unrelated') return '';
        if (type === 'cousin') return (k.degree || 1) + ' degree cousin' + (k.removed ? ', removed ' + k.removed : '');
        return type;
    }
    function _candidateCard(label, ids, child, people) {
        var shared = child && people.length && people.every(function(p){return child.locationId && p.locationId === child.locationId;});
        var kin = child ? people.map(function(p){return _kinshipLabel(child.id,p.id);}).filter(Boolean) : [];
        var aids = [];
        if (shared) aids.push('<span class="events-adoption-aid">⌂ Same location</span>');
        if (kin.length) aids.push('<span class="events-adoption-aid">Family: '+_esc(kin.join(' / '))+'</span>');
        if (child && people.some(function(p){return typeof p.age==='number'&&typeof child.age==='number'&&(p.age-child.age<13);})) aids.push('<span class="events-adoption-aid events-adoption-age-warning">Age gap under 13 years</span>');
        if (child && people.some(function(p){return typeof p.age==='number'&&typeof child.age==='number'&&p.age<child.age;})) aids.push('<span class="events-adoption-aid events-adoption-age-warning">Adoptee older than adopter</span>');
        return '<button type="button" class="events-adoption-candidate'+(ids.join('|')===_creationSelection.adopterIds.join('|')?' is-selected':'')+'" data-action="select-adopters" data-ids="'+_esc(ids.join('|'))+'"><strong>'+_esc(label)+'</strong><small>'+people.map(function(p){return _esc((p.age == null?'Age unknown':p.age+' years')+' · '+_personLocation(p));}).join('<br>')+'</small>'+aids.join('')+'</button>';
    }
    function _renderNewAdoptionBlock() {
        var characters = _livingCharacters();
        if (!Array.isArray(characters)) return '<div class="events-adoption-new">Character picker unavailable.</div>';
        var eligible = characters.filter(function(c){return !_parentsFor(c);});
        var child = characters.find(function(c){return c.id===_creationSelection.childId;}) || null;
        var couples = _couples(characters), html = '<section class="events-adoption-new"><div class="events-adoption-new__header">'+_icon('ADOPTION_LEGAL')+'<span>New placement</span></div><div class="events-adoption-columns">';
        html += '<div class="events-adoption-column"><h4>People with no parents</h4>';
        html += eligible.map(function(c){return '<button type="button" class="events-adoption-candidate'+(c.id===_creationSelection.childId?' is-selected':'')+'" data-action="select-adoptee" data-id="'+_esc(c.id)+'"><strong>'+_esc(_personName(c))+'</strong><small>'+_esc((c.age == null?'Age unknown':c.age+' years')+' · '+_personLocation(c))+'</small></button>';}).join('') || '<p>No eligible adoptees.</p>';
        html += '</div><div class="events-adoption-column"><h4>All romantic couples</h4>';
        html += '<label class="events-adoption-show-singles"><input type="checkbox" data-input="show-singles"'+(_creationSelection.showSingles?' checked':'')+'> Show single people</label>';
        html += couples.map(function(pair){return _candidateCard(_personName(pair[0])+' + '+_personName(pair[1]),pair.map(function(p){return p.id;}),child,pair);}).join('') || '<p>No romantic couples found.</p>';
        if (_creationSelection.showSingles) html += '<h4>Single adopters</h4>'+characters.filter(function(c){return !couples.some(function(pair){return pair.some(function(p){return p.id===c.id;});});}).map(function(c){return _candidateCard(_personName(c),[c.id],child,[c]);}).join('');
        html += '</div></div><div class="events-adoption-create-controls"><label>Placement type <select data-input="placement-type"><option value="legal">Adoption</option><option value="foster">Foster care</option><option value="guardianship">Guardianship</option></select></label><button type="button" class="events-adoption-new__create" data-action="new-adoption"'+(!_creationSelection.childId||!_creationSelection.adopterIds.length?' disabled':'')+'>'+_icon('CHECK_SIMPLE')+'<span>Create placement</span></button></div></section>';
        return html;
    }
    function _wireNewAdoptionBlock(container) {
        var checkbox = container.querySelector('[data-input="show-singles"]');
        if (checkbox) checkbox.addEventListener('change',function(){_creationSelection.showSingles=checkbox.checked;_refresh();});
    }

    // =========================================================================
    // 9. FILTER BAR
    // =========================================================================

    function _renderFilterBar(context, filters) {
        var C = _constants();
        var VM = _vm();
        var U = _ui();
        if (!C || !VM || !U) return '';

        var typeOpts = VM.toAdoptionTypeFilterOptions(filters.type);
        var statusOpts = VM.toAdoptionStatusFilterOptions(filters.status);
        var sortOpts = VM.toAdoptionSortOptions(filters.sortBy);

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';
        var collapsed = filters.collapsed === true;
        var collapseIconName = collapsed ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters events-filters--adoption">';

        // Header line
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIconName) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-adoption-input" ' +
            'data-input="show-all-locations"' +
            (showAllLocations ? ' checked' : '') + '>';
        html += '<span>Show all locations</span>';
        html += '</label>';

        if (!showAllLocations && locationName) {
            html += '<span class="events-filters__scope-name">' +
                _esc(locationName) + '</span>';
        }

        html += '<span class="events-filters__spacer"></span>';

        html += '<button type="button" class="events-filters__clear" ' +
            'data-action="clear-filters" aria-label="Clear filters">' +
            _icon('X_HEAVY') +
            '<span>Clear</span>' +
            '</button>';
        html += '<button type="button" class="events-filters__refresh" ' +
            'data-action="refresh" aria-label="Refresh">' +
            _icon('REFRESH') +
            '<span>Refresh</span>' +
            '</button>';
        html += '</div>';

        // Body of filters (collapses)
        html += '<div class="events-filters__body"' +
            (collapsed ? ' hidden' : '') + '>';

        html += '<input type="search" class="ev-adoption-input events-filters__search" ' +
            'data-input="search" placeholder="Search by name…" ' +
            'value="' + _esc(filters.search || '') + '">';

        html += '<select class="ev-adoption-input events-filters__select" data-input="type">' +
            U.renderOptionList(typeOpts) + '</select>';
        html += '<select class="ev-adoption-input events-filters__select" data-input="status">' +
            U.renderOptionList(statusOpts) + '</select>';
        html += '<select class="ev-adoption-input events-filters__select" data-input="sortBy">' +
            U.renderOptionList(sortOpts) + '</select>';

        var lq = window.LocationQueries;
        var locationChain = [];
        if (lq && typeof lq.getPlaceHierarchy === 'function' && filters.locationId) {
            try { locationChain = lq.getPlaceHierarchy(filters.locationId) || []; } catch (e) {}
        }
        var locationOptions = [];
        if (lq && typeof lq.getRootPlaces === 'function') {
            try { locationOptions = lq.getRootPlaces({ includeDeprecated: false }) || []; } catch (e) {}
        }
        var level = 0;
        while (locationOptions.length) {
            var selectedPlace = locationChain[level] || null;
            var foundSelected = false;
            html += '<select class="ev-adoption-input events-filters__select" data-input="location-level" data-level="' + level + '">';
            html += '<option value="">All ' + (level === 0 ? 'locations' : 'sub-locations') + '</option>';
            for (var li = 0; li < locationOptions.length; li++) {
                var place = locationOptions[li];
                if (!place || !place.id) continue;
                var selected = !!selectedPlace && selectedPlace.id === place.id;
                if (selected) foundSelected = true;
                html += '<option value="' + _esc(place.id) + '"' + (selected ? ' selected' : '') + '>' +
                    _esc(place.displayName || place.name || place.id) + '</option>';
            }
            html += '</select>';
            if (!foundSelected || !selectedPlace || !lq || typeof lq.getPlaceChildren !== 'function') break;
            try { locationOptions = lq.getPlaceChildren(selectedPlace.id, false) || []; } catch (e) { break; }
            level++;
        }

        html += '</div>';
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. MAIN RENDER
    // =========================================================================

    function renderAdoptionTab(container, context) {
        if (!container) return;

        var q = _queries();
        var VM = _vm();
        var U = _ui();
        var C = _constants();

        if (!q || !VM || !U || !C) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Events module is not fully loaded. Check that ' +
                     'events-constants.js, events-queries.js, ' +
                     'events-view-models.js, events-ui-list.js are loaded.') +
                '</div>';
            return;
        }

        // Resolve scope + filters
        var locationId = (context && context.locationId) || null;
        var panelId = _panelId(locationId);
        if (_lastPanelId !== panelId) {
            _state = _readFilters(panelId);
            _lastPanelId = panelId;
        }
        if (!_state) _state = _defaultFilters();

        // Fetch
        var effectiveLocationId = _state.showAllLocations ? null : (_state.locationId || locationId);
        var result = q.getAdoptionRecords(effectiveLocationId);

        if (!result || result.available !== true) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Adoption records are not available: ' +
                     (result && result.reason ? result.reason : 'unknown')) +
                '</div>';
            return;
        }

        var records = Array.isArray(result.records) ? result.records : [];
        var totalRecordCount = records.length;

        // Filter + group
        var filtered = _applyFilters(records, _state);
        var typeGroups = _groupByType(filtered, _state);

        // Empty state detection
        var emptyState = _detectEmptyState(result, totalRecordCount, filtered.length);
        var emptyStateOptions = emptyState
            ? _emptyStateOptions(emptyState)
            : null;

        // Adoption-specific stats bar (computed from the RAW records,
        // not the filtered set -- the stats bar describes the world,
        // the filters narrow the list below it).
        var statsBar = VM.toAdoptionStatsBarViewModel(records);

        // Build the HTML
        var filterBarHtml = _renderFilterBar(
            { locationId: locationId, locationName: context && context.locationName },
            _state
        );
        var newAdoptionHtml = _renderNewAdoptionBlock();
        var bodyHtml = U.renderAdoptionTabBody({
            statsBar: statsBar,
            typeGroups: typeGroups,
            emptyState: emptyState,
            emptyStateOptions: emptyStateOptions
        });

        container.innerHTML =
            '<div class="events-adoption-tab">' +
            filterBarHtml +
            newAdoptionHtml +
            bodyHtml +
            '</div>';

        // Wire
        _wireFilterInputs(container, locationId);
        _wireNewAdoptionBlock(container);
        _wireDelegatedHandlers(container, locationId);
    }

    function _emptyStateOptions(caseId) {
        var options = {};
        if (caseId === 'no-matches') {
            options.extraHint = 'Try clearing filters or widening the search.';
        }
        if (caseId === 'no-adoptions') {
            options.extraHint = 'Use the New Adoption block above to create one.';
        }
        return options;
    }

    // =========================================================================
    // 11. FILTER INPUT WIRING (per-render, fresh elements)
    // =========================================================================

    function _wireFilterInputs(container, locationId) {
        var U = _uiState();
        if (!U) return;

        var panelId = _panelId(locationId);

        function commit(patch) {
            for (var key in patch) {
                if (Object.prototype.hasOwnProperty.call(patch, key)) {
                    _state[key] = patch[key];
                }
            }
            _writeFilters(panelId, _state);
            _refresh();
        }

        var inputs = container.querySelectorAll('.ev-adoption-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                var key = input.getAttribute('data-input');
                if (!key) return;
                // The new-adoption pickers are wired by
                // _wireNewAdoptionBlock, not by this loop.
                if (key === 'new-child-id' || key === 'new-adopter-id') return;

                // Search input: debounced.
                if (input.type === 'search') {
                    var timer = null;
                    input.addEventListener('input', function() {
                        if (timer) clearTimeout(timer);
                        timer = setTimeout(function() {
                            timer = null;
                            commit({ search: input.value || '' });
                        }, 200);
                    });
                    return;
                }

                if (input.type === 'checkbox') {
                    input.addEventListener('change', function() {
                        if (key === 'show-all-locations') {
                            commit({ showAllLocations: input.checked === true });
                            return;
                        }
                    });
                    return;
                }

                if (input.tagName === 'SELECT') {
                    input.addEventListener('change', function() {
                        if (key === 'location-level') {
                            var selectedLocationId = input.value || null;
                            var level = parseInt(input.getAttribute('data-level'), 10);
                            if (!selectedLocationId && level > 0) {
                                var prior = container.querySelector('[data-input="location-level"][data-level="' + (level - 1) + '"]');
                                selectedLocationId = prior && prior.value ? prior.value : null;
                            }
                            commit({ locationId: selectedLocationId, showAllLocations: !selectedLocationId });
                            return;
                        }
                        var patch = {};
                        patch[key] = input.value;
                        commit(patch);
                    });
                    return;
                }
            })(inputs[i]);
        }
    }

    // =========================================================================
    // 12. DELEGATED CLICK HANDLER
    // =========================================================================

    function _wireDelegatedHandlers(container, locationId) {
        if (container.__eventsAdoptionWired) return;
        container.__eventsAdoptionWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionEl = target.closest('[data-action]');
            if (!actionEl || !container.contains(actionEl)) return;

            var action = actionEl.getAttribute('data-action');

            if (action === 'select-adoptee') {
                e.preventDefault();
                _creationSelection.childId = actionEl.getAttribute('data-id') || '';
                _creationSelection.adopterIds = [];
                _refresh();
                return;
            }
            if (action === 'select-adopters') {
                e.preventDefault();
                var ids = (actionEl.getAttribute('data-ids') || '').split('|').filter(Boolean);
                _creationSelection.adopterIds = ids.join('|') === _creationSelection.adopterIds.join('|') ? [] : ids;
                _refresh();
                return;
            }

            if (action === 'new-adoption') {
                e.preventDefault();
                _handleNewAdoption(container);
                return;
            }

            if (action === 'edit-adoption') {
                e.preventDefault();
                e.stopPropagation();
                var editId = actionEl.getAttribute('data-adoption-id');
                if (editId) _openEditAdoption(editId);
                return;
            }

            if (action === 'end-adoption') {
                e.preventDefault();
                e.stopPropagation();
                var endId = actionEl.getAttribute('data-adoption-id');
                if (endId) _openEndAdoption(endId);
                return;
            }

            if (action === 'refresh') {
                e.preventDefault();
                _refresh();
                return;
            }

            if (action === 'clear-filters') {
                e.preventDefault();
                _clearFilters(locationId);
                return;
            }

            if (action === 'toggle-collapse') {
                e.preventDefault();
                _state.collapsed = !_state.collapsed;
                _writeFilters(_panelId(locationId), _state);
                _refresh();
                return;
            }
        });
    }

    // =========================================================================
    // 13. ACTION HANDLERS
    // =========================================================================

    function _handleNewAdoption(container) {
        var childId = _creationSelection.childId;
        var adopterIds = _creationSelection.adopterIds || [];
        var typeEl = container.querySelector('[data-input="placement-type"]');
        var type = typeEl ? typeEl.value : 'legal';
        if (!childId || !adopterIds.length) { _toast('Select an adoptee and adopter(s).','error'); return; }
        if (adopterIds.indexOf(childId)!==-1) { _toast('A character cannot adopt themselves.','error'); return; }
        if (typeof window.openCreateAdoptionModal !== 'function') { _toast('Adoption modal is unavailable.','error'); return; }
        var result = window.openCreateAdoptionModal(childId, adopterIds, function(){_creationSelection={childId:'',adopterIds:[],showSingles:_creationSelection.showSingles};_refresh();}, type);
        if (!result || result.success !== true) _toast('Could not open placement modal: '+(result&&result.reason?result.reason:'unknown'),'error');
    }

    function _openEditAdoption(adoptionId) {
        if (typeof window.openEditAdoptionModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-adoption-tab] openEditAdoptionModal is not ' +
                    'loaded; load modals-children-adoption.js.'
                );
            }
            _toast(
                'Adoption editing is unavailable: the adoption modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openEditAdoptionModal(adoptionId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open edit-adoption modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openEndAdoption(adoptionId) {
        if (typeof window.openEndAdoptionModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-adoption-tab] openEndAdoptionModal is not ' +
                    'loaded; load modals-children-adoption.js.'
                );
            }
            _toast(
                'Adoption ending is unavailable: the adoption modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openEndAdoptionModal(adoptionId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open end-adoption modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    // =========================================================================
    // 14. FILTER RESET
    // =========================================================================

    function _clearFilters(locationId) {
        var defaults = _defaultFilters();
        _state = {
            search: defaults.search,
            type: defaults.type,
            status: defaults.status,
            sortBy: defaults.sortBy,
            showAllLocations: _state.showAllLocations,
            collapsed: _state.collapsed
        };
        _writeFilters(_panelId(locationId), _state);
        _refresh();
        _toast('Filters cleared.', 'info');
    }

    // =========================================================================
    // 15. REFRESH
    // =========================================================================

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 16. STYLES
    // =========================================================================
    //
    // The base .events-filters, .events-stats-bar, .events-list,
    // .events-empty, .events-unavailable classes are defined by
    // events-deaths-tab.js's own injected stylesheet. This stylesheet
    // adds the classes specific to the adoption facet: the new-
    // adoption block, the type group containers, and the row layout.

    function _ensureStyles() {}
    // =========================================================================
    // 17. REGISTRATION
    // =========================================================================

    _ensureStyles();

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderAdoptionTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-adoption-tab.js: TabManager is not available at load ' +
            'time; the adoption tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.EventsAdoptionTab = {
        id: TAB_ID,
        render: renderAdoptionTab,

        // Exposed for tests.
        _helpers: {
            applyFilters: _applyFilters,
            groupByType: _groupByType,
            defaultFilters: _defaultFilters,
            detectEmptyState: _detectEmptyState,
            panelId: _panelId
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsAdoptionTab;
    }
})();
