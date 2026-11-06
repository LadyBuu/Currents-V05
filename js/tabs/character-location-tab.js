// js/tabs/character-location-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER LOCATION TAB
 * (js/tabs/character-location-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-location-tab.js
 *
 * The Location tab of the Character Manager. Shows the character's
 * current location, birthplace, household memberships (current +
 * historical), associated residences, and move history. All read data
 * comes from CharacterViewModels.buildLocationModel. All write actions
 * delegate to the appropriate modal (household, residence, or move).
 *
 * SECTIONS (each collapsible, all default expanded):
 *   1. Current Location    resolved location + raw-field note + birthplace
 *                          read-only. A small note explains the Identity
 *                          tab owns the birthplace editor.
 *   2. Household           current household header + member list.
 *                          Action buttons: Add Member, Rename, Edit
 *                          Details, Transfer, Remove (with history),
 *                          Remove (fix mistake), Details.
 *   3. Previous Households Read-only accordion of householdHistory
 *                          entries (joined / left years). Rows are
 *                          informational; clicking a historical
 *                          household is not offered because there is no
 *                          household-page shell in this build.
 *   4. Residences          residences associated with the character's
 *                          current household. Per-row: View, Edit,
 *                          Delete. Footer: Assign Residence, Create
 *                          Residence.
 *   5. Moves               chronological list. Per-row: Edit, Delete.
 *                          Footer: Add Move.
 *
 * WRITE AFFORDANCES
 *
 *   Every write action delegates to a modal. The tab does not call any
 *   command module directly. Specifically:
 *
 *     Household section
 *       Add Member       openAddHouseholdMemberModal(householdId, cb,
 *                        { preselectedCharacterId: characterId })
 *       Rename           openRenameHouseholdModal(householdId, cb,
 *                        { withHistory: <default true> })
 *       Edit Details     openEditHouseholdDetailsModal(householdId, cb)
 *       Transfer         openTransferCharacterToHouseholdModal(
 *                        characterId, cb)
 *       Remove (history) openRemoveHouseholdMemberModal(householdId,
 *                        characterId, cb, { withHistory: true })
 *       Remove (fix)     openRemoveHouseholdMemberModal(householdId,
 *                        characterId, cb, { withHistory: false })
 *       Details          openHouseholdDetailsModal(householdId, cb)
 *
 *     Residences section
 *       View             openResidenceDetailsModal(residenceId, cb)
 *       Edit             openEditResidenceForHouseholdModal(residenceId, cb)
 *       Delete           openDeleteResidenceForHouseholdModal(residenceId, cb)
 *       Assign Residence openAssignResidenceToHouseholdModal(householdId, cb)
 *       Create Residence openCreateResidenceForHouseholdModal(householdId, cb)
 *
 *     Moves section
 *       Add Move         openMoveCharacterModal(characterId, cb)
 *       Edit Move        openEditMoveModal(characterId, moveIndex, cb)
 *       Delete Move      confirm + LocationCommands.deleteMove + persist
 *
 *   Delete Move is the ONE write path that goes through the command
 *   directly (there is no "delete move" modal in the modal surface —
 *   the confirm dialog + command is the whole flow). Persist is called
 *   explicitly via LocationCommands.persist() after the delete; the
 *   modal-free pattern is documented at the call site.
 *
 *   Disabled-with-title pattern: any button whose backing modal or
 *   command is not loaded renders disabled with an explanatory title
 *   instead of a silent no-op. This is the same discipline used by the
 *   Identity / Family / Romance / Friendship tabs.
 *
 * RELATIONSHIP CIRCLES:
 *   Each household member row renders a small colored dot indicating the
 *   relationship class between the viewing character (the tab's subject)
 *   and the member:
 *
 *     red    'spouse'   active committed romantic partner
 *     blue   'blood'    FamilyRules reports a kinship relation
 *     yellow 'relative' any other tracked relationship (friendship,
 *                       non-committed romance)
 *     none   no relationship tracked in the current domain
 *
 *   The classification is computed by CharacterViewModels.
 *   _resolveRelationshipClass (invoked via buildLocationModel's
 *   relationshipCircles.byTargetId). The tab does not re-derive it.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * COLLAPSED-STATE PERSISTENCE: global per-tab via
 *   CharacterUIState.getCollapsed('location', sectionKey) /
 *   setCollapsed. Not per-character.
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatCount)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state + post-mutation refresh)
 *   - CharacterViewModels     (buildLocationModel, compactRow)
 *   - LocationCommands        (deleteMove — the one write that does
 *                              not route through a modal)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - openHouseholdDetailsModal             Details button
 *   - openAddHouseholdMemberModal           Add Member
 *   - openRenameHouseholdModal              Rename
 *   - openEditHouseholdDetailsModal         Edit Details
 *   - openTransferCharacterToHouseholdModal Transfer
 *   - openRemoveHouseholdMemberModal        Remove (both modes)
 *   - openResidenceDetailsModal             Residence View
 *   - openEditResidenceForHouseholdModal    Residence Edit
 *   - openDeleteResidenceForHouseholdModal  Residence Delete
 *   - openAssignResidenceToHouseholdModal   Assign Residence
 *   - openCreateResidenceForHouseholdModal  Create Residence
 *   - openMoveCharacterModal                Add Move
 *   - openEditMoveModal                     Edit Move
 *   - LocationModals.persist (via LocationCommands.persist)
 *   - window.confirmDialog                  Delete Move confirmation
 *   - window.showToast                      error + success surfacing
 *   - window.CharacterManagerBootstrap.renderActive  post-mutation refresh
 *
 * TIME CONTRACT: uses window.getCurrentYear where needed.
 *
 * ICON POLICY: SVG from icons.js. No emojis. No literal Unicode glyphs
 *              in the output except the section-toggle triangles
 *              (▶ / ▼) already used by every tab.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision (household-tab P8).
 *     - Five collapsible sections: Current Location, Household,
 *       Previous Households, Residences, Moves.
 *     - Every write delegates to the corresponding modal. The only
 *       direct command call is LocationCommands.deleteMove (there is
 *       no delete-move modal).
 *     - Relationship circles on household members.
 *     - Disabled-with-title pattern on every action button whose
 *       backing modal is not loaded.
 *     - householdHistoryStructured flag honoured: the Previous
 *       Households section renders an "unavailable" note when the
 *       projection is still the pre-P1 string-array shape.
 *     - The current-location block distinguishes three states:
 *       resolved, recorded-but-dangling, and no-recorded-location.
 *     - Placeholder for "view household page" click: not offered
 *       because there is no household-page shell.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'location';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'currentLocation',   label: 'Current Location',      icon: 'LOCATION' },
        { key: 'household',         label: 'Household',             icon: 'FAMILY_TREE' },
        { key: 'householdHistory',  label: 'Previous Households',   icon: 'TIMELINE' },
        { key: 'residences',        label: 'Residences',            icon: 'CROWN' },
        { key: 'moves',             label: 'Move History',          icon: 'ARROW_RIGHT' }
    ];

    // =========================================================================
    // 1. SMALL HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _isMissing(v) { return v === undefined || v === null; }
    function _hasId(v) { return typeof v === 'string' && v.length > 0; }

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _uiState() { return window.CharacterUIState || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); }
            catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[location-tab] ' + (type || 'info') + ': ' + msg);
        }
    }

    function _refresh() {
        if (window.CharacterManagerBootstrap
            && typeof window.CharacterManagerBootstrap.renderActive === 'function') {
            try { window.CharacterManagerBootstrap.renderActive(); }
            catch (e) { /* non-fatal */ }
        }
    }

    function _year(v) {
        if (typeof window.formatYear === 'function') return window.formatYear(v);
        if (_isMissing(v)) return '?';
        return String(v);
    }

    function _count(n, singular, plural) {
        if (typeof window.formatCount === 'function') {
            return window.formatCount(n, singular, plural);
        }
        return n + ' ' + (n === 1 ? singular : plural);
    }

    function _isCollapsed(key) {
        var ui = _uiState();
        if (!ui || typeof ui.getCollapsed !== 'function') return false;
        return ui.getCollapsed(TAB_ID, key) === true;
    }

    function _setCollapsed(key, collapsed) {
        var ui = _uiState();
        if (!ui || typeof ui.setCollapsed !== 'function') return;
        ui.setCollapsed(TAB_ID, key, collapsed);
    }

    // =========================================================================
    // 2. SECTION SHELL
    // =========================================================================

    function _sectionHtml(section, bodyHtml, count) {
        var collapsed = _isCollapsed(section.key);
        var cls = 'character-tab-section' + (collapsed ? '' : ' is-expanded');
        var ariaExpanded = collapsed ? 'false' : 'true';
        var countHtml = (typeof count === 'number')
            ? '<span class="character-family-section-count">' + count + '</span>'
            : '';
        return '' +
            '<div class="' + cls + '" data-section="' + _esc(section.key) + '">' +
                '<button type="button" class="character-tab-section__header" ' +
                    'aria-expanded="' + ariaExpanded + '" ' +
                    'data-action="toggle-section" ' +
                    'data-section-key="' + _esc(section.key) + '">' +
                    '<span class="character-tab-section__toggle" aria-hidden="true">' +
                        (collapsed ? '\u25B6' : '\u25BC') +
                    '</span>' +
                    '<span class="character-tab-section__icon" aria-hidden="true">' +
                        _icon(section.icon) +
                    '</span>' +
                    '<span class="character-tab-section__title">' +
                        _esc(section.label) +
                    '</span>' +
                    countHtml +
                '</button>' +
                '<div class="character-tab-section__body">' +
                    bodyHtml +
                '</div>' +
            '</div>';
    }

    function _empty(message) {
        return '<div class="character-tab-empty">' + _esc(message) + '</div>';
    }

    function _unavailable(message) {
        return '<div class="character-tab-unavailable">' + _esc(message) + '</div>';
    }

    // =========================================================================
    // 3. ACTION-BUTTON HELPERS
    // =========================================================================
    //
    // Disabled-with-title pattern: any button whose backing modal is not
    // loaded renders disabled with an explanatory title.

    function _actionBtn(action, label, opts) {
        opts = opts || {};
        var disabledAttr = opts.disabled
            ? ' disabled title="' + _esc(opts.disabledTitle || 'Unavailable') + '"'
            : '';
        var cls = 'character-tab-btn' + (opts.danger ? ' danger' : '')
            + (opts.primary ? ' primary' : '')
            + (opts.small ? ' character-tab-btn-small' : '');
        var dataAttrs = '';
        if (opts.data) {
            for (var k in opts.data) {
                if (!Object.prototype.hasOwnProperty.call(opts.data, k)) continue;
                dataAttrs += ' data-' + k + '="' + _esc(opts.data[k]) + '"';
            }
        }
        return '<button type="button" class="' + cls + '" ' +
            'data-action="' + _esc(action) + '"' + dataAttrs + disabledAttr + '>' +
            label +
        '</button>';
    }

    function _modalAvailable(fnName) {
        return (window[fnName] && typeof window[fnName] === 'function');
    }

    function _disabledForMissingModal(fnName, displayName) {
        return _modalAvailable(fnName)
            ? null
            : (displayName || fnName) + ' is not available in this build';
    }

    // =========================================================================
    // 4. RELATIONSHIP CIRCLE
    // =========================================================================
    //
    // The relationship circle is a small colored dot rendered before the
    // member's name. Colors come from the CharacterViewModels classification
    // (spouse / blood / relative / null).

    var _CIRCLE_COLORS = {
        spouse:   '#c84a4a',
        blood:    '#4a7ac8',
        relative: '#c8a844'
    };

    function _circleHtml(cls, title) {
        var color = _CIRCLE_COLORS[cls];
        if (!color) return '';
        return '<span class="character-location-member-circle" ' +
            'style="display:inline-block;width:0.5rem;height:0.5rem;' +
            'border-radius:50%;background:' + color + ';margin-right:0.5rem;" ' +
            'title="' + _esc(title) + '"></span>';
    }

    function _circleTitle(cls) {
        if (cls === 'spouse') return 'Spouse';
        if (cls === 'blood') return 'Blood relative';
        if (cls === 'relative') return 'Relative';
        return '';
    }

    // =========================================================================
    // 5. SECTION BODIES
    // =========================================================================

    // ---------- 5a. Current Location ----------

    function _bodyCurrentLocation(model) {
        var cl = model.currentLocation || {};
        var bp = model.birthplace || {};

        var html = '';

        // Resolved location + source hint.
        if (cl.locationId) {
            var sourceNote = '';
            if (cl.resolvedDiffersFromRaw) {
                sourceNote = ' <span class="character-tab-note">' +
                    '(located via ' + _esc(cl.source || 'history') + ')</span>';
            }
            html += '<div class="character-tab-field">' +
                '<div class="character-tab-field__label">Current</div>' +
                '<div class="character-tab-field__value">' +
                    _esc(cl.locationName || cl.locationId) +
                    sourceNote +
                '</div>' +
            '</div>';
            if (cl.rawCurrentLocationId
                && cl.rawCurrentLocationId !== cl.locationId) {
                html += '<div class="character-tab-note">' +
                    'Explicit currentLocationId: ' +
                    _esc(cl.rawCurrentLocationId) +
                    ' (the resolved location takes precedence).' +
                '</div>';
            }
        } else {
            html += '<div class="character-tab-field">' +
                '<div class="character-tab-field__label">Current</div>' +
                '<div class="character-tab-field__value">' +
                    '<span class="character-tab-note">No location recorded.</span>' +
                '</div>' +
            '</div>';
        }

        // Birthplace.
        if (bp.placeId) {
            html += '<div class="character-tab-field">' +
                '<div class="character-tab-field__label">Birthplace</div>' +
                '<div class="character-tab-field__value">' +
                    _esc(bp.placeName || bp.placeId) +
                '</div>' +
            '</div>';
        } else {
            html += '<div class="character-tab-field">' +
                '<div class="character-tab-field__label">Birthplace</div>' +
                '<div class="character-tab-field__value">' +
                    '<span class="character-tab-note">None recorded.</span>' +
                '</div>' +
            '</div>';
        }

        html += '<div class="character-tab-note">' +
            'Editing the birthplace is on the Identity tab. ' +
            'Location changes are recorded as moves.' +
        '</div>';

        return html;
    }

    // ---------- 5b. Household ----------

    function _bodyHousehold(model, characterId) {
        var h = model.household || {};
        var members = Array.isArray(model.householdMembers)
            ? model.householdMembers : [];
        var circles = (model.relationshipCircles
            && model.relationshipCircles.byTargetId)
            ? model.relationshipCircles.byTargetId : {};

        if (h.available === false) {
            return _unavailable(h.reason || 'Household data is unavailable.');
        }

        if (!h.householdId) {
            return _empty(
                'Not currently in a household. Use "Transfer" to join one.'
            );
        }

        var html = '';

        // Header card.
        html += '<div class="character-tab-section" style="margin-bottom:0.75rem;">' +
            '<div class="character-tab-section__body">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">' +
                    '<div>' +
                        '<div style="font-size:0.85rem;font-weight:600;">' +
                            _esc(h.householdName || '(unknown household)') +
                            (h.danglingReference
                                ? ' <span class="character-tab-note">(deleted)</span>'
                                : '') +
                        '</div>' +
                        '<div style="font-size:0.6rem;color:var(--dim);margin-top:0.125rem;">' +
                            (h.role ? _esc(h.role) : 'Member') +
                            (h.isHead
                                ? ' · <strong style="color:var(--accent);">Head</strong>'
                                : '') +
                            (typeof h.memberCount === 'number'
                                ? ' · ' + _count(h.memberCount, 'member', 'members')
                                : '') +
                            (h.currentLocationName
                                ? ' · ' + _esc(h.currentLocationName)
                                : '') +
                            (typeof h.currentNameSince === 'number'
                                ? ' · named since ' + _year(h.currentNameSince)
                                : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

        // Members list.
        if (members.length === 0) {
            html += _empty('No other members recorded.');
        } else {
            html += '<div class="character-tab-subhead">Members (' +
                members.length + ')</div>';
            for (var i = 0; i < members.length; i++) {
                html += _memberRowHtml(members[i], circles, characterId);
            }
        }

        // Action buttons.
        html += '<div class="character-tab-actions">';

        var addDisabled = _disabledForMissingModal(
            'openAddHouseholdMemberModal', 'Add Member');
        html += _actionBtn('add-household-member', '+ Add Member', {
            primary: true,
            disabled: addDisabled !== null,
            disabledTitle: addDisabled,
            data: { 'household-id': h.householdId }
        });

        var renameDisabled = _disabledForMissingModal(
            'openRenameHouseholdModal', 'Rename');
        html += _actionBtn('rename-household', 'Rename', {
            disabled: renameDisabled !== null,
            disabledTitle: renameDisabled,
            data: { 'household-id': h.householdId }
        });

        var editDisabled = _disabledForMissingModal(
            'openEditHouseholdDetailsModal', 'Edit Details');
        html += _actionBtn('edit-household-details', 'Edit Details', {
            disabled: editDisabled !== null,
            disabledTitle: editDisabled,
            data: { 'household-id': h.householdId }
        });

        var transferDisabled = _disabledForMissingModal(
            'openTransferCharacterToHouseholdModal', 'Transfer');
        html += _actionBtn('transfer-character', 'Transfer', {
            disabled: transferDisabled !== null,
            disabledTitle: transferDisabled
        });

        var removeWithDisabled = _disabledForMissingModal(
            'openRemoveHouseholdMemberModal', 'Remove');
        html += _actionBtn('remove-household-member-history', 'Remove (history)', {
            danger: true,
            disabled: removeWithDisabled !== null,
            disabledTitle: removeWithDisabled,
            data: {
                'household-id': h.householdId,
                'character-id': characterId,
                'with-history': 'true'
            }
        });
        html += _actionBtn('remove-household-member-silent', 'Remove (fix mistake)', {
            danger: true,
            disabled: removeWithDisabled !== null,
            disabledTitle: removeWithDisabled,
            data: {
                'household-id': h.householdId,
                'character-id': characterId,
                'with-history': 'false'
            }
        });

        var detailsDisabled = _disabledForMissingModal(
            'openHouseholdDetailsModal', 'Details');
        html += _actionBtn('household-details', 'Details', {
            disabled: detailsDisabled !== null,
            disabledTitle: detailsDisabled,
            data: { 'household-id': h.householdId }
        });

        html += '</div>';

        return html;
    }

    function _memberRowHtml(member, circles, subjectId) {
        if (!member || !_hasId(member.characterId)) return '';

        var cls = circles[member.characterId] || null;
        var circleHtml = _circleHtml(cls, _circleTitle(cls));

        var display = member.characterName
            || ((member.name || '') + (member.surname ? ' ' + member.surname : '')).trim()
            || member.characterId;

        var meta = [];
        if (typeof member.age === 'number') meta.push(member.age + 'y');
        if (member.gender && member.gender !== 'unknown') {
            meta.push(member.gender);
        }
        if (member.isDeceased) meta.push('deceased');
        if (member.isMissing) meta.push('missing');
        if (member.role && member.role !== 'Member') {
            meta.push(member.role);
        }
        if (typeof member.joinedYear === 'number') {
            meta.push('joined ' + _year(member.joinedYear));
        }

        var isSelf = member.characterId === subjectId;

        // Clicking another member selects them in the sidebar (identity
        // switch). Clicking the current character is a no-op.
        var nameLink = isSelf
            ? '<strong>' + _esc(display) + '</strong> <span class="character-tab-note">(you)</span>'
            : '<a href="#" class="character-row__name" ' +
                'data-character-id="' + _esc(member.characterId) + '">' +
                _esc(display) +
              '</a>';

        var headChip = member.isHead
            ? ' <span class="character-tab-history__badge">Head</span>'
            : '';

        return '<div class="character-family-row' +
                (member.isDeceased ? ' is-deceased' : '') +
                '" data-member-id="' + _esc(member.characterId) + '">' +
            '<div class="character-family-row__main">' +
                circleHtml +
                nameLink +
                headChip +
                (meta.length > 0
                    ? '<div class="character-tab-note" style="margin-top:0.125rem;">' +
                        _esc(meta.join(' · ')) +
                      '</div>'
                    : '') +
            '</div>' +
        '</div>';
    }

    // ---------- 5c. Previous Households ----------

    function _bodyHouseholdHistory(model) {
        if (model.householdHistoryStructured === false) {
            return _unavailable(
                'Household history is not structured in this build. ' +
                'The projection is emitting pre-P1 string entries; ' +
                'the CharacterState projection needs to be rebuilt.'
            );
        }

        var history = Array.isArray(model.householdHistory)
            ? model.householdHistory : [];

        // Exclude the current household (already shown in the Household
        // section). The current entry has leftYear === null.
        var past = [];
        for (var i = 0; i < history.length; i++) {
            var e = history[i];
            if (!e) continue;
            if (e.isCurrent) continue;
            past.push(e);
        }

        if (past.length === 0) {
            return _empty('No prior household memberships recorded.');
        }

        // Newest first.
        past.sort(function (a, b) {
            var ja = typeof a.joinedYear === 'number' ? a.joinedYear : -Infinity;
            var jb = typeof b.joinedYear === 'number' ? b.joinedYear : -Infinity;
            return jb - ja;
        });

        var html = '';
        for (var p = 0; p < past.length; p++) {
            var entry = past[p];
            var meta = [];
            if (typeof entry.joinedYear === 'number') {
                meta.push('joined ' + _year(entry.joinedYear));
            }
            if (typeof entry.leftYear === 'number') {
                meta.push('left ' + _year(entry.leftYear));
            }
            if (entry.leftReason) meta.push(entry.leftReason);
            if (entry.role) meta.push(entry.role);
            if (entry.isHead) meta.push('was head');

            html += '<div class="character-tab-history__row">' +
                '<div class="character-tab-history__main">' +
                    '<span class="character-tab-history__value">' +
                        _esc(entry.householdName || entry.householdId || 'Unknown') +
                    '</span>' +
                    (meta.length > 0
                        ? '<span class="character-tab-history__reason">' +
                            _esc(meta.join(' · ')) +
                          '</span>'
                        : '') +
                '</div>' +
            '</div>';
        }
        return html;
    }

    // ---------- 5d. Residences ----------

    function _bodyResidences(model, characterId) {
        var r = model.residences || {};
        var h = model.household || {};

        if (r.available === false) {
            return _unavailable(r.reason || 'Residence data is unavailable.');
        }

        if (!h.householdId) {
            return _empty(
                'No household. Assign a household before managing residences.'
            );
        }

        var entries = Array.isArray(r.entries) ? r.entries : [];

        var html = '';

        if (entries.length === 0) {
            html += _empty('This household does not occupy a residence.');
        } else {
            html += '<div class="character-tab-subhead">Occupied (' +
                entries.length + ')</div>';
            for (var i = 0; i < entries.length; i++) {
                html += _residenceRowHtml(entries[i], characterId);
            }
        }

        // Footer actions.
        html += '<div class="character-tab-actions">';

        var assignDisabled = _disabledForMissingModal(
            'openAssignResidenceToHouseholdModal', 'Assign Residence');
        html += _actionBtn('assign-residence', 'Assign Residence', {
            disabled: assignDisabled !== null,
            disabledTitle: assignDisabled,
            data: { 'household-id': h.householdId }
        });

        var createDisabled = _disabledForMissingModal(
            'openCreateResidenceForHouseholdModal', 'Create Residence');
        html += _actionBtn('create-residence', '+ Create Residence', {
            primary: true,
            disabled: createDisabled !== null,
            disabledTitle: createDisabled,
            data: { 'household-id': h.householdId }
        });

        html += '</div>';

        return html;
    }

    function _residenceRowHtml(entry, characterId) {
        if (!entry || !_hasId(entry.id)) return '';

        var meta = [];
        if (entry.typeName) meta.push(entry.typeName);
        if (entry.locationName) meta.push(entry.locationName);
        if (entry.condition) meta.push(entry.condition);
        if (entry.isMultiUnit) {
            meta.push('multi-unit');
            if (entry.occupiedUnitNumber !== null
                && entry.occupiedUnitNumber !== undefined) {
                meta.push('unit ' + entry.occupiedUnitNumber);
            }
        }
        if (entry.isDemolished) meta.push('demolished');

        var viewDisabled = _disabledForMissingModal(
            'openResidenceDetailsModal', 'View');
        var editDisabled = _disabledForMissingModal(
            'openEditResidenceForHouseholdModal', 'Edit');
        var deleteDisabled = _disabledForMissingModal(
            'openDeleteResidenceForHouseholdModal', 'Delete');

        return '<div class="character-family-row' +
                (entry.isDemolished ? ' is-deceased' : '') +
                '" data-residence-id="' + _esc(entry.id) + '">' +
            '<div class="character-family-row__main">' +
                '<strong>' + _esc(entry.name) + '</strong>' +
                (meta.length > 0
                    ? '<div class="character-tab-note" style="margin-top:0.125rem;">' +
                        _esc(meta.join(' · ')) +
                      '</div>'
                    : '') +
            '</div>' +
            '<div class="character-family-actions">' +
                _actionBtn('view-residence', 'View', {
                    small: true,
                    disabled: viewDisabled !== null,
                    disabledTitle: viewDisabled,
                    data: { 'residence-id': entry.id }
                }) +
                _actionBtn('edit-residence', 'Edit', {
                    small: true,
                    disabled: editDisabled !== null,
                    disabledTitle: editDisabled,
                    data: { 'residence-id': entry.id }
                }) +
                _actionBtn('delete-residence', 'Delete', {
                    small: true,
                    danger: true,
                    disabled: deleteDisabled !== null,
                    disabledTitle: deleteDisabled,
                    data: { 'residence-id': entry.id }
                }) +
            '</div>' +
        '</div>';
    }

    // ---------- 5e. Moves ----------

    function _bodyMoves(model, characterId) {
        var moves = Array.isArray(model.moves) ? model.moves : [];

        var html = '';

        if (moves.length === 0) {
            html += _empty('No moves recorded.');
        } else {
            // Newest first in the display; the model is ascending.
            for (var i = moves.length - 1; i >= 0; i--) {
                html += _moveRowHtml(moves[i], characterId);
            }
        }

        html += '<div class="character-tab-actions">';

        var addDisabled = _disabledForMissingModal(
            'openMoveCharacterModal', 'Add Move');
        html += _actionBtn('add-move', '+ Add Move', {
            primary: true,
            disabled: addDisabled !== null,
            disabledTitle: addDisabled
        });

        html += '</div>';

        return html;
    }

    function _moveRowHtml(move, characterId) {
        if (!move) return '';

        var editDisabled = _disabledForMissingModal(
            'openEditMoveModal', 'Edit');
        var deleteDisabled = _disabledForMissingModal(null, null);
        if (typeof window.LocationCommands === 'undefined'
            || !window.LocationCommands
            || typeof window.LocationCommands.deleteMove !== 'function') {
            deleteDisabled = 'Delete is not available in this build';
        } else {
            deleteDisabled = null;
        }

        var yearText = (typeof move.year === 'number')
            ? _year(move.year)
            : 'year unknown';

        var locationText = move.locationName
            || move.locationId
            || '(unknown location)';

        var meta = [yearText];
        if (move.fromLocationName) meta.push('from ' + move.fromLocationName);
        if (move.isBirthMove) meta.push('birth');

        var noteHtml = move.note
            ? '<div class="character-tab-note" style="margin-top:0.125rem;">' +
                _esc(move.note) +
              '</div>'
            : '';

        return '<div class="character-family-row" ' +
                'data-move-index="' + move.index + '">' +
            '<div class="character-family-row__main">' +
                '<strong>' + _esc(locationText) + '</strong>' +
                '<div class="character-tab-note" style="margin-top:0.125rem;">' +
                    _esc(meta.join(' · ')) +
                '</div>' +
                noteHtml +
            '</div>' +
            '<div class="character-family-actions">' +
                _actionBtn('edit-move', 'Edit', {
                    small: true,
                    disabled: editDisabled !== null,
                    disabledTitle: editDisabled,
                    data: {
                        'move-index': String(move.index),
                        'character-id': characterId
                    }
                }) +
                _actionBtn('delete-move', 'Delete', {
                    small: true,
                    danger: true,
                    disabled: deleteDisabled !== null,
                    disabledTitle: deleteDisabled,
                    data: {
                        'move-index': String(move.index),
                        'character-id': characterId
                    }
                }) +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    function renderLocationTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildLocationModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels.buildLocationModel is not loaded; ' +
                'cannot render the Location tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildLocationModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var movesCount = Array.isArray(model.moves) ? model.moves.length : 0;
        var householdMembersCount = Array.isArray(model.householdMembers)
            ? model.householdMembers.length : 0;
        var pastHouseholdsCount = Array.isArray(model.householdHistory)
            ? model.householdHistory.filter(function (e) {
                return e && !e.isCurrent;
            }).length
            : 0;
        var residencesCount = (model.residences
            && Array.isArray(model.residences.entries))
            ? model.residences.entries.length
            : 0;

        var body = '';
        body += _sectionHtml(SECTIONS[0],
            _bodyCurrentLocation(model));
        body += _sectionHtml(SECTIONS[1],
            _bodyHousehold(model, context.characterId), householdMembersCount);
        body += _sectionHtml(SECTIONS[2],
            _bodyHouseholdHistory(model), pastHouseholdsCount);
        body += _sectionHtml(SECTIONS[3],
            _bodyResidences(model, context.characterId), residencesCount);
        body += _sectionHtml(SECTIONS[4],
            _bodyMoves(model, context.characterId), movesCount);

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    // =========================================================================
    // 7. WIRING
    // =========================================================================

    function _wire(container, characterId, model) {
        // Collapsible headers.
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        // Delegated click handler for actions + character links.
        container.addEventListener('click', function (e) {
            var target = e.target;

            // Character name link in a member row: re-select.
            var nameLink = target.closest
                ? target.closest('a.character-row__name[data-character-id]')
                : null;
            if (nameLink) {
                e.preventDefault();
                var linkId = nameLink.getAttribute('data-character-id');
                if (_hasId(linkId) && linkId !== characterId) {
                    _selectCharacter(linkId);
                }
                return;
            }

            var btn = target.closest
                ? target.closest('[data-action]')
                : null;
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            if (action === 'toggle-section') return; // handled above
            if (btn.disabled) return;

            e.preventDefault();
            _dispatchAction(action, btn, characterId, model);
        });
    }

    function _onToggleSection(e) {
        var btn = e.currentTarget;
        if (!btn) return;
        var key = btn.getAttribute('data-section-key');
        if (!_hasId(key)) return;
        var section = btn.parentNode;
        if (!section) return;
        var isExpanded = section.classList.contains('is-expanded');
        if (isExpanded) {
            section.classList.remove('is-expanded');
            btn.setAttribute('aria-expanded', 'false');
            var icon = btn.querySelector('.character-tab-section__toggle');
            if (icon) icon.textContent = '\u25B6';
            _setCollapsed(key, true);
        } else {
            section.classList.add('is-expanded');
            btn.setAttribute('aria-expanded', 'true');
            var icon2 = btn.querySelector('.character-tab-section__toggle');
            if (icon2) icon2.textContent = '\u25BC';
            _setCollapsed(key, false);
        }
    }

    function _selectCharacter(characterId) {
        var ui = _uiState();
        if (!ui || typeof ui.setSelectedCharacterId !== 'function') return;
        ui.setSelectedCharacterId(characterId);
        _refresh();
    }

    function _dispatchAction(action, btn, characterId, model) {
        switch (action) {
            // Household
            case 'add-household-member':
                _onAddHouseholdMember(btn, characterId); return;
            case 'rename-household':
                _onRenameHousehold(btn); return;
            case 'edit-household-details':
                _onEditHouseholdDetails(btn); return;
            case 'transfer-character':
                _onTransferCharacter(characterId); return;
            case 'remove-household-member-history':
                _onRemoveHouseholdMember(btn, true); return;
            case 'remove-household-member-silent':
                _onRemoveHouseholdMember(btn, false); return;
            case 'household-details':
                _onHouseholdDetails(btn); return;

            // Residences
            case 'view-residence':
                _onViewResidence(btn); return;
            case 'edit-residence':
                _onEditResidence(btn); return;
            case 'delete-residence':
                _onDeleteResidence(btn); return;
            case 'assign-residence':
                _onAssignResidence(btn); return;
            case 'create-residence':
                _onCreateResidence(btn); return;

            // Moves
            case 'add-move':
                _onAddMove(characterId); return;
            case 'edit-move':
                _onEditMove(btn, characterId); return;
            case 'delete-move':
                _onDeleteMove(btn, characterId, model); return;

            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[location-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 8. ACTION IMPLEMENTATIONS — HOUSEHOLD
    // =========================================================================

    function _onAddHouseholdMember(btn, characterId) {
        if (typeof window.openAddHouseholdMemberModal !== 'function') {
            _toast('Add Member modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;

        window.openAddHouseholdMemberModal(
            householdId,
            function () { _refresh(); },
            { preselectedCharacterId: characterId }
        );
    }

    function _onRenameHousehold(btn) {
        if (typeof window.openRenameHouseholdModal !== 'function') {
            _toast('Rename modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;
        window.openRenameHouseholdModal(householdId, function () { _refresh(); });
    }

    function _onEditHouseholdDetails(btn) {
        if (typeof window.openEditHouseholdDetailsModal !== 'function') {
            _toast('Edit Details modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;
        window.openEditHouseholdDetailsModal(
            householdId, function () { _refresh(); }
        );
    }

    function _onTransferCharacter(characterId) {
        if (typeof window.openTransferCharacterToHouseholdModal !== 'function') {
            _toast('Transfer modal is not available.', 'error');
            return;
        }
        window.openTransferCharacterToHouseholdModal(
            characterId, function () { _refresh(); }
        );
    }

    function _onRemoveHouseholdMember(btn, withHistory) {
        if (typeof window.openRemoveHouseholdMemberModal !== 'function') {
            _toast('Remove modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        var characterId = btn.getAttribute('data-character-id');
        if (!_hasId(householdId) || !_hasId(characterId)) return;

        window.openRemoveHouseholdMemberModal(
            householdId,
            characterId,
            function () { _refresh(); },
            { withHistory: withHistory }
        );
    }

    function _onHouseholdDetails(btn) {
        if (typeof window.openHouseholdDetailsModal !== 'function') {
            _toast('Household details modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;
        window.openHouseholdDetailsModal(householdId);
    }

    // =========================================================================
    // 9. ACTION IMPLEMENTATIONS — RESIDENCES
    // =========================================================================

    function _onViewResidence(btn) {
        if (typeof window.openResidenceDetailsModal !== 'function') {
            _toast('Residence details modal is not available.', 'error');
            return;
        }
        var residenceId = btn.getAttribute('data-residence-id');
        if (!_hasId(residenceId)) return;
        window.openResidenceDetailsModal(residenceId, function () {
            _refresh();
        });
    }

    function _onEditResidence(btn) {
        if (typeof window.openEditResidenceForHouseholdModal !== 'function') {
            _toast('Edit residence modal is not available.', 'error');
            return;
        }
        var residenceId = btn.getAttribute('data-residence-id');
        if (!_hasId(residenceId)) return;
        window.openEditResidenceForHouseholdModal(
            residenceId, function () { _refresh(); }
        );
    }

    function _onDeleteResidence(btn) {
        if (typeof window.openDeleteResidenceForHouseholdModal !== 'function') {
            _toast('Delete residence modal is not available.', 'error');
            return;
        }
        var residenceId = btn.getAttribute('data-residence-id');
        if (!_hasId(residenceId)) return;
        window.openDeleteResidenceForHouseholdModal(
            residenceId, function () { _refresh(); }
        );
    }

    function _onAssignResidence(btn) {
        if (typeof window.openAssignResidenceToHouseholdModal !== 'function') {
            _toast('Assign residence modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;
        window.openAssignResidenceToHouseholdModal(
            householdId, function () { _refresh(); }
        );
    }

    function _onCreateResidence(btn) {
        if (typeof window.openCreateResidenceForHouseholdModal !== 'function') {
            _toast('Create residence modal is not available.', 'error');
            return;
        }
        var householdId = btn.getAttribute('data-household-id');
        if (!_hasId(householdId)) return;
        window.openCreateResidenceForHouseholdModal(
            householdId, function () { _refresh(); }
        );
    }

    // =========================================================================
    // 10. ACTION IMPLEMENTATIONS — MOVES
    // =========================================================================

    function _onAddMove(characterId) {
        if (typeof window.openMoveCharacterModal !== 'function') {
            _toast('Add move modal is not available.', 'error');
            return;
        }
        window.openMoveCharacterModal(characterId, function () {
            _refresh();
        });
    }

    function _onEditMove(btn, characterId) {
        if (typeof window.openEditMoveModal !== 'function') {
            _toast('Edit move modal is not available.', 'error');
            return;
        }
        var idx = parseInt(btn.getAttribute('data-move-index'), 10);
        if (!Number.isInteger(idx) || idx < 0) return;

        window.openEditMoveModal(characterId, idx, function () {
            _refresh();
        });
    }

    function _onDeleteMove(btn, characterId, model) {
        if (typeof window.LocationCommands === 'undefined'
            || !window.LocationCommands
            || typeof window.LocationCommands.deleteMove !== 'function') {
            _toast('Delete move is not available.', 'error');
            return;
        }

        var idx = parseInt(btn.getAttribute('data-move-index'), 10);
        if (!Number.isInteger(idx) || idx < 0) return;

        // Look up the move for the confirm message.
        var move = null;
        if (model && Array.isArray(model.moves)) {
            for (var i = 0; i < model.moves.length; i++) {
                if (model.moves[i] && model.moves[i].index === idx) {
                    move = model.moves[i];
                    break;
                }
            }
        }

        var locationText = move && move.locationName
            ? move.locationName
            : '(unknown location)';
        var yearText = move && typeof move.year === 'number'
            ? String(move.year)
            : 'unknown year';

        var message =
            'Delete this move?\n\n' +
            locationText + ' in ' + yearText + '\n\n' +
            'This removes the entry from the character\'s move history. ' +
            'It does not change the character\'s current location.';

        var doDelete = function () {
            var result = null;
            try {
                result = window.LocationCommands.deleteMove(characterId, idx);
            } catch (e) {
                result = {
                    success: false,
                    reason: (e && e.message) ? e.message : 'deleteMove threw'
                };
            }

            if (!result || result.success !== true) {
                _toast('Failed to delete move: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error');
                return;
            }

            // Persist once, via the location domain's persist boundary.
            if (typeof window.LocationCommands.persist === 'function') {
                var persistResult = null;
                try {
                    persistResult = window.LocationCommands.persist();
                } catch (e) {
                    persistResult = {
                        success: false,
                        reason: (e && e.message) ? e.message : 'persist threw'
                    };
                }
                if (!persistResult || persistResult.success !== true) {
                    _toast('Move deleted, but save failed: ' +
                        (persistResult && persistResult.reason
                            ? persistResult.reason
                            : 'unknown'),
                        'warning');
                    // The in-memory mutation is applied; refresh so the
                    // tab reflects the current state.
                    _refresh();
                    return;
                }
            }

            _toast('Move deleted.', 'success');
            _refresh();
        };

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'Delete Move', doDelete);
        } else if (window.confirm && window.confirm(message)) {
            doDelete();
        }
    }

    // =========================================================================
    // 11. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderLocationTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-location-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.CharacterLocationTab = {
        id: TAB_ID,
        render: renderLocationTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLocationTab;
    }
})();
