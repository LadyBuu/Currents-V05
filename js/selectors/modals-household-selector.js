/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD SELECTOR MODAL (js/selectors/modals-household-selector.js)
 * =============================================================================
 *
 * LOCATION: js/selectors/modals-household-selector.js
 *
 * PURPOSE
 * -------
 * Modal picker for selecting a household. Used by residence assignment,
 * character transfer, matchmaker flows, and any other UI where a
 * household must be chosen from a filtered list.
 *
 * PUBLIC SURFACE
 * --------------
 *   window.openHouseholdSelector(options)
 *
 *   options:
 *     title           string   (default 'Select Household')
 *     onSelect        Function called with the household snapshot on pick
 *     onCancel        Function called when the modal closes without a pick
 *     filterConfig    Object   household-level filters (see below)
 *     characterId     string   optional; when set, the picker shows the
 *                              character's current household as "current"
 *                              and uses SelectorHelpers relationship
 *                              predicates to highlight relatives
 *
 *   filterConfig (household-level):
 *     showActive      boolean  default true
 *     showVacant      boolean  default true
 *     showEmpty       boolean  default true
 *     showDeprecated  boolean  default false
 *     showDeleted     boolean  default false
 *     searchText      string   default ''
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not a household query layer. Reads via HouseholdQueries only.
 *   - Not a mutation. Selecting a household does not change anything.
 *   - Not family-semantic. Family facts (parents, siblings) come from
 *     FamilyQueries when a characterId is supplied.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal element returned by
 *   openModal (result.element). The prior version used a fallback chain
 *   that ended at document.body.
 *
 * MODAL INFRASTRUCTURE
 * --------------------
 *   Uses the canonical core modal shell directly:
 *
 *     window.openModal(options)  -> { element, close }
 *     window.closeTopModal()
 *
 *   The accepted option keys are `titleHtml` and `contentHtml`.
 *   `title:` and `content:` are NOT read by the core; a modal that
 *   passes them renders with the default title ("Modal") and an empty
 *   body. Prior revisions of this file used `title:` / `content:` and
 *   the picker was silently dead.
 *
 *   The returned object's `element` field is the modal element to
 *   scope DOM queries against. Do not query document.body.
 *
 *   onConfirm returning truthy closes the modal. When a row is
 *   clicked, we call closeTopModal() explicitly and then fire the
 *   caller's onSelect on the next tick. onCancel is wired through
 *   onCancel on the modal options so the caller's onCancel fires for
 *   every non-confirmed close path (Escape, overlay click, close
 *   button, Cancel button).
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - formatting.js        (escapeHtml)
 *   - modals-core.js       (openModal, closeTopModal)
 *   - household-queries.js (HouseholdQueries)
 *   - selector-base.js     (SelectorHelpers)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - family-queries.js    (FamilyQueries) — used when characterId is set
 *                          to compute blood-relative badges
 *   - icons.js             (Icons) — used for status icons if present
 *
 * ICON POLICY: Icons come from icons.js if loaded. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - openModal call site switched from `title:`/`content:` to
 *       `titleHtml:`/`contentHtml:`. The prior call site rendered an
 *       empty modal — the picker's title bar said "Modal" and the
 *       body was blank, so no rows could be clicked. Same bug class
 *       that modals-role-select.js documents having fixed.
 *     - The `window._openModal` fallback was removed. It was a phantom:
 *       no module in the tree ever exported `_openModal`, and the
 *       fallback resolved to undefined, which the load-time guard
 *       caught as "missing openModal" — meaning the module could not
 *       load at all if `window.openModal` were absent. The fallback
 *       was dead and misleading.
 *     - onCancel is now threaded through the modal options. The prior
 *       revision called `onCancel()` inside the modal's own
 *       `onCancel` handler but the handler only fired if the caller
 *       passed an onCancel to openModal — which the code did, but
 *       the surrounding wiring had a duplicate `onCancel()` fire
 *       when the caller clicked Cancel after already closing via a
 *       row. Simplified: one modal-level onCancel that invokes the
 *       caller's onCancel exactly once per non-confirmed close.
 *     - The list container's click handler is now scoped to
 *       `listEl` (a descendant of `root = modal.element`) and uses
 *       addEventListener instead of onclick. Prior revision used
 *       `listEl.onclick = ...`, which is a single-handler slot:
 *       re-rendering the list preserved the handler, but any
 *       future addition of a second listener would have silently
 *       replaced the row-click handler.
 *     - _currentHouseholdId now tolerates HouseholdQueries returning
 *       a household id (string) as well as a household record
 *       (object with .id). The exact return shape of
 *       getCharacterHousehold is not visible in the core/selector
 *       surface; both shapes are handled so a future refactor of
 *       HouseholdQueries does not break the "current" badge.
 *     - Header MODAL INFRASTRUCTURE section added.
 *     - No other behavioural change. Filtering, sorting, row
 *       rendering, and relationship badges are unchanged.
 *   Previous revisions:
 *     - Dropped FamilyAccessors; parentage via FamilyQueries.
 *     - No char.motherId / char.fatherId / char.relationships reads.
 *     - DOM lookups scoped to modal element.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'modals-household-selector: ' + name + ' is required'
            );
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error(
                'modals-household-selector: ' + name + ' is required'
            );
        }
        return obj;
    }

    var _escapeHtml = _requireFunction(
        'escapeHtml (formatting.js)',
        window.escapeHtml
    );
    var _openModal = _requireFunction(
        'openModal (modals-core.js)',
        window.openModal
    );
    var _closeTopModal = _requireFunction(
        'closeTopModal (modals-core.js)',
        window.closeTopModal
    );
    var _queries = _requireObject(
        'HouseholdQueries',
        window.HouseholdQueries
    );
    _requireFunction(
        'HouseholdQueries.getHousehold',
        _queries.getHousehold
    );
    _requireFunction(
        'HouseholdQueries.getAllHouseholds',
        _queries.getAllHouseholds
    );
    _requireFunction(
        'HouseholdQueries.getHouseholdMembers',
        _queries.getHouseholdMembers
    );
    _requireFunction(
        'HouseholdQueries.getCharacterHousehold',
        _queries.getCharacterHousehold
    );
    var _selector = _requireObject(
        'SelectorHelpers (selector-base.js)',
        window.SelectorHelpers || window._SelectorBaseHelpers
    );

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _familyQueries() {
        return (typeof window.FamilyQueries !== 'undefined'
                && window.FamilyQueries)
            ? window.FamilyQueries
            : null;
    }

    // =========================================================================
    // 2. FILTER NORMALISATION
    // =========================================================================

    function _defaultFilterConfig() {
        return {
            showActive: true,
            showVacant: true,
            showEmpty: true,
            showDeprecated: false,
            showDeleted: false,
            searchText: ''
        };
    }

    function _normalizeFilterConfig(config) {
        var defaults = _defaultFilterConfig();
        if (_isMissing(config) || typeof config !== 'object'
            || Array.isArray(config)) {
            return defaults;
        }

        var out = {};
        var key;
        for (key in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
            out[key] = defaults[key];
        }
        for (key in config) {
            if (!Object.prototype.hasOwnProperty.call(config, key)) continue;
            out[key] = config[key];
        }

        if (typeof out.searchText !== 'string') out.searchText = '';
        if (typeof out.showActive !== 'boolean') out.showActive = true;
        if (typeof out.showVacant !== 'boolean') out.showVacant = true;
        if (typeof out.showEmpty !== 'boolean') out.showEmpty = true;
        if (typeof out.showDeprecated !== 'boolean') out.showDeprecated = false;
        if (typeof out.showDeleted !== 'boolean') out.showDeleted = false;

        return out;
    }

    // =========================================================================
    // 3. HOUSEHOLD STATUS CLASSIFICATION
    // =========================================================================

    function _classifyHousehold(household) {
        if (!household) return 'unknown';

        var persisted = household.status;

        if (persisted === 'deprecated') return 'deprecated';
        if (persisted === 'destroyed') return 'deprecated';

        var members = _queries.getHouseholdMembers(household.id);
        var total = Array.isArray(members) ? members.length : 0;
        if (total === 0) return 'empty';

        var living = 0;
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (!m || m.isMissing) continue;
            if (m.isDeceased === true) continue;
            living++;
        }

        if (living === 0) return 'vacant';
        return 'active';
    }

    function _passesFilter(household, classification, filterConfig) {
        if (!household) return false;

        if (classification === 'deprecated') {
            return filterConfig.showDeprecated === true;
        }
        if (classification === 'empty') {
            return filterConfig.showEmpty === true;
        }
        if (classification === 'vacant') {
            return filterConfig.showVacant === true;
        }
        if (classification === 'active') {
            return filterConfig.showActive === true;
        }
        return false;
    }

    function _passesSearch(household, searchText) {
        if (!searchText) return true;
        var name = typeof household.name === 'string' ? household.name : '';
        return name.toLowerCase().indexOf(searchText.toLowerCase()) !== -1;
    }

    // =========================================================================
    // 4. CHARACTER-CENTRIC BADGES
    // =========================================================================

    /**
     * Returns the character's current household id, or null.
     *
     * HouseholdQueries.getCharacterHousehold's exact return shape is not
     * pinned by the core contract. Historically it returned a household
     * record (object with .id). A reasonable refactor might make it
     * return the id directly (string), matching other query modules.
     * Both shapes are handled so the "current" badge survives either.
     *
     * @private
     * @returns {string|null}
     */
    function _getCurrentHouseholdId(characterId) {
        if (!_hasId(characterId)) return null;
        var current = _queries.getCharacterHousehold(characterId);
        if (!current) return null;

        // Object shape: { id, ... }
        if (typeof current === 'object' && _hasId(current.id)) {
            return current.id;
        }
        // String shape: '<householdId>'
        if (typeof current === 'string' && current.length > 0) {
            return current;
        }
        return null;
    }

    function _householdHasBloodRelative(householdId, characterId) {
        if (!_hasId(householdId) || !_hasId(characterId)) return false;

        var fq = _familyQueries();
        if (!fq || typeof fq.isBloodRelated !== 'function') return false;

        var members = _queries.getHouseholdMembers(householdId);
        if (!Array.isArray(members) || members.length === 0) return false;

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (!m || !_hasId(m.characterId)) continue;
            if (m.characterId === characterId) continue;
            if (_selector.isBloodRelativeBasic(characterId, m.characterId)) {
                return true;
            }
        }
        return false;
    }

    // =========================================================================
    // 5. ROW RENDERING
    // =========================================================================

    function _statusBadgeForClassification(classification) {
        switch (classification) {
            case 'active':
                return { label: 'Active', color: 'var(--success)', icon: 'CIRCLE_DOT' };
            case 'vacant':
                return { label: 'Vacant', color: 'var(--warn)', icon: 'CIRCLE_HALF_LEFT' };
            case 'empty':
                return { label: 'Empty', color: 'var(--dim)', icon: 'CIRCLE_OUTLINE' };
            case 'deprecated':
                return { label: 'Deprecated', color: 'var(--dim)', icon: 'X_HEAVY' };
            default:
                return { label: 'Unknown', color: 'var(--dim)', icon: 'CIRCLE_OUTLINE' };
        }
    }

    function _renderHouseholdRow(household, classification, currentHouseholdId,
                                 hasBloodRelative) {
        var badge = _statusBadgeForClassification(classification);
        var badgeIcon = _getIcon(badge.icon);

        var memberCount = 0;
        var members = _queries.getHouseholdMembers(household.id);
        if (Array.isArray(members)) memberCount = members.length;

        var isCurrent = currentHouseholdId && household.id === currentHouseholdId;

        var rowClasses = ['household-picker-row'];
        if (isCurrent) rowClasses.push('household-picker-row--current');

        var html = '';
        html += '<button type="button" class="' + rowClasses.join(' ') + '"'
             + ' data-household-id="' + _escapeHtml(household.id) + '"'
             + ' style="display:flex;align-items:center;gap:8px;width:100%;'
             + 'text-align:left;padding:8px 10px;margin-bottom:4px;'
             + 'background:var(--bg2);border:1px solid var(--border);'
             + 'border-radius:4px;cursor:pointer;transition:background 0.1s;">';

        html += '<span class="household-picker-icon"'
             + ' style="color:' + badge.color + ';font-size:0.7rem;"'
             + ' aria-hidden="true">' + badgeIcon + '</span>';

        html += '<span style="flex:1;min-width:0;">';

        html += '<span style="display:block;font-size:0.7rem;font-weight:600;'
             + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
             + _escapeHtml(household.name || 'Unnamed Household')
             + '</span>';

        var secondaryBits = [];
        if (household.locationName) {
            secondaryBits.push(_escapeHtml(household.locationName));
        }
        secondaryBits.push(memberCount + (memberCount === 1 ? ' member' : ' members'));
        if (isCurrent) {
            secondaryBits.push(
                '<span style="color:var(--accent);font-weight:600;">current</span>'
            );
        }
        if (hasBloodRelative) {
            secondaryBits.push(
                '<span style="color:var(--accent);font-weight:600;">relative</span>'
            );
        }
        html += '<span style="display:block;font-size:0.55rem;color:var(--dim);'
             + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
             + secondaryBits.join(' · ')
             + '</span>';

        html += '</span>';

        html += '<span style="font-size:0.5rem;color:' + badge.color + ';'
             + 'padding:2px 8px;border:1px solid ' + badge.color + ';'
             + 'border-radius:8px;flex-shrink:0;">'
             + _escapeHtml(badge.label)
             + '</span>';

        html += '</button>';
        return html;
    }

    // =========================================================================
    // 6. FILTER UI RENDERING
    // =========================================================================

    function _renderFilterUI(filterConfig, classificationCounts) {
        var html = '<div style="margin-bottom:12px;padding:8px;'
             + 'background:var(--bg3);border-radius:6px;">';

        html += '<div style="margin-bottom:8px;">'
             + '<input type="text" data-field="searchText"'
             + ' placeholder="Search households"'
             + ' value="' + _escapeHtml(filterConfig.searchText) + '"'
             + ' style="width:100%;padding:6px;background:var(--bg);'
             + 'border:1px solid var(--border);border-radius:4px;font-size:0.7rem;">'
             + '</div>';

        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.6rem;">';

        var checkboxes = [
            { field: 'showActive',     label: 'Active',     count: classificationCounts.active },
            { field: 'showVacant',     label: 'Vacant',     count: classificationCounts.vacant },
            { field: 'showEmpty',      label: 'Empty',      count: classificationCounts.empty },
            { field: 'showDeprecated', label: 'Deprecated', count: classificationCounts.deprecated }
        ];

        for (var i = 0; i < checkboxes.length; i++) {
            var cb = checkboxes[i];
            var checked = filterConfig[cb.field] === true ? ' checked' : '';
            html += '<label style="display:flex;align-items:center;gap:4px;'
                 + 'cursor:pointer;color:var(--dim);">'
                 + '<input type="checkbox" data-field="' + cb.field + '"' + checked + '>'
                 + '<span>' + cb.label
                 + ' <span style="color:var(--dim);opacity:0.7;">('
                 + cb.count + ')</span></span>'
                 + '</label>';
        }

        html += '</div>';
        html += '</div>';
        return html;
    }

    function _countByClassification(households) {
        var counts = { active: 0, vacant: 0, empty: 0, deprecated: 0, unknown: 0 };
        for (var i = 0; i < households.length; i++) {
            var classification = _classifyHousehold(households[i]);
            if (counts[classification] === undefined) {
                counts[classification] = 0;
            }
            counts[classification]++;
        }
        return counts;
    }

    // =========================================================================
    // 7. MAIN ENTRY POINT
    // =========================================================================

    function openHouseholdSelector(options) {
        options = options || {};

        var title = typeof options.title === 'string'
            ? options.title
            : 'Select Household';
        var onSelect = (typeof options.onSelect === 'function')
            ? options.onSelect
            : function() {};
        var onCancel = (typeof options.onCancel === 'function')
            ? options.onCancel
            : function() {};
        var characterId = _hasId(options.characterId)
            ? options.characterId
            : null;
        var filterConfig = _normalizeFilterConfig(options.filterConfig);

        // Snapshot the household list once. The selector is a point-in-time
        // picker; it does not re-read on every render.
        var households = _queries.getAllHouseholds({ includeDeprecated: true });
        if (!Array.isArray(households)) households = [];

        var currentHouseholdId = _getCurrentHouseholdId(characterId);
        var classificationCounts = _countByClassification(households);

        // Precompute "has relative" once per household, so re-renders do
        // not re-walk the family graph per keystroke.
        var relativeFlags = {};
        if (characterId) {
            for (var r = 0; r < households.length; r++) {
                var hh = households[r];
                if (!hh || !_hasId(hh.id)) continue;
                relativeFlags[hh.id] = _householdHasBloodRelative(hh.id, characterId);
            }
        }

        var content =
            '<div style="min-width:360px;max-width:520px;">'
            + _renderFilterUI(filterConfig, classificationCounts)
            + '<div data-role="household-list" style="max-height:400px;overflow-y:auto;">'
            + '</div>'
            + '</div>';

        var modal = _openModal({
            titleHtml: _escapeHtml(title),
            contentHtml: content,
            confirmText: '',
            cancelText: 'Cancel',
            onConfirm: function() {
                // The user must pick a row. Confirm is treated as a
                // cancel: nothing is selected, so we do not pretend
                // otherwise.
                return false;
            },
            onCancel: function() {
                onCancel();
            }
        });

        var root = modal && modal.element ? modal.element : null;
        if (!root) return modal;

        var listEl = root.querySelector('[data-role="household-list"]');
        if (!listEl) return modal;

        var selectionMade = false;

        function _render() {
            var filtered = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!h) continue;
                var classification = _classifyHousehold(h);
                if (!_passesFilter(h, classification, filterConfig)) continue;
                if (!_passesSearch(h, filterConfig.searchText)) continue;
                filtered.push({ household: h, classification: classification });
            }

            filtered.sort(function(a, b) {
                var aCurrent = currentHouseholdId
                    && a.household.id === currentHouseholdId;
                var bCurrent = currentHouseholdId
                    && b.household.id === currentHouseholdId;
                if (aCurrent && !bCurrent) return -1;
                if (bCurrent && !aCurrent) return 1;
                var an = a.household.name || '';
                var bn = b.household.name || '';
                return an.localeCompare(bn);
            });

            if (filtered.length === 0) {
                listEl.innerHTML =
                    '<div style="text-align:center;padding:24px;'
                    + 'color:var(--dim);font-size:0.65rem;">'
                    + 'No households match your filters.'
                    + '</div>';
                return;
            }

            var html = '';
            for (var k = 0; k < filtered.length; k++) {
                var entry = filtered[k];
                html += _renderHouseholdRow(
                    entry.household,
                    entry.classification,
                    currentHouseholdId,
                    relativeFlags[entry.household.id] === true
                );
            }
            listEl.innerHTML = html;
        }

        // Delegated row-click handler. Scoped to listEl.
        listEl.addEventListener('click', function(e) {
            if (!e.target || typeof e.target.closest !== 'function') return;
            var row = e.target.closest('[data-household-id]');
            if (!row || !listEl.contains(row)) return;
            var hid = row.getAttribute('data-household-id');
            if (!_hasId(hid)) return;

            var snapshot = _queries.getHousehold(hid);
            if (!snapshot) return;

            selectionMade = true;
            _closeTopModal();
            setTimeout(function() {
                onSelect(snapshot);
            }, 0);
        });

        // Wire filter UI.
        var searchInput = root.querySelector('[data-field="searchText"]');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                filterConfig.searchText = searchInput.value || '';
                _render();
            });
        }

        var checkboxes = root.querySelectorAll('[data-field^="show"]');
        for (var c = 0; c < checkboxes.length; c++) {
            (function(cb) {
                cb.addEventListener('change', function() {
                    var field = cb.getAttribute('data-field');
                    if (field && Object.prototype.hasOwnProperty.call(
                        filterConfig, field)) {
                        filterConfig[field] = cb.checked === true;
                        _render();
                    }
                });
            })(checkboxes[c]);
        }

        _render();
        return modal;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openHouseholdSelector = openHouseholdSelector;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openHouseholdSelector: openHouseholdSelector
        };
    }

})();
