/**
 * =============================================================================
 * STILL WATERS - UNIFIED RELATIONSHIP MODAL (modals-relationship.js)
 * =============================================================================
 *
 * LOCATION: js/social/modals-relationship.js
 *
 * Unified relationship creation modal.
 *
 * UI only. Dispatches to the domain commands by archetype. Contains no
 * domain policy and no direct state mutation.
 *
 * Owns:
 *   - the creation modal (archetype picker, optional attribute
 *     checkboxes for committed, start year, notes)
 *   - the dispatch table from archetype to the right command
 *   - integration with the character selector
 *
 * Does NOT own:
 *   - validation (the command validates; the modal trusts the
 *     response)
 *   - interpretation of returned projections (the modal passes them
 *     back to the caller's onSuccess)
 *   - family edges (that is modals-family territory)
 *
 * DISPATCH TABLE
 *
 *   Every archetype maps to exactly one command. The table below is
 *   authoritative; if an archetype is added to RELATIONSHIP_ARCHETYPES
 *   without a case here, the modal returns UNSUPPORTED_TYPE and the
 *   caller sees a toast.
 *
 *     casual_dating      → RomanceCommands.startCasualDating
 *     one_night_stand    → RomanceCommands.startOneNightStand
 *     committed          → RomanceCommands.startCommittedRelationship
 *     friendship         → FriendshipCommands.createFriendship
 *     rivalry            → RivalryCommands.createRivalry
 *     enmity             → RivalryCommands.createEnmity
 *     apprenticeship     → ApprenticeshipCommands.createApprenticeship
 *                          (NOT ProfessionalCommands — that module owns
 *                          the professional EDGE primitive, not the
 *                          apprenticeship LIFECYCLE)
 *     mastership         → ProfessionalCommands.createMastership
 *     employment         → ProfessionalCommands.createEmployment
 *     guild_membership   → ProfessionalCommands.createGuildMembership
 *
 *   Ownership boundary: ProfessionalCommands owns the professional
 *   edge primitive and the mastership/employment/guild commands. The
 *   apprenticeship lifecycle — creation, progression, completion,
 *   termination — lives in ApprenticeshipCommands. This modal must not
 *   bypass that boundary.
 *
 * MODAL LIFECYCLE
 *
 *   Every modal uses onMount (from modals-core.js) to attach handlers.
 *   onMount runs synchronously during openModal, before the caller
 *   regains control, so there is no setTimeout-based binding. Element
 *   lookups inside onMount and onConfirm are scoped to the modal
 *   element (modalEl.querySelector(...)), not to document. This
 *   prevents cross-modal ID collisions when one modal opens over
 *   another.
 *
 * PREVIOUS REVISION (FIXED IN THIS ONE)
 *
 *   Every call site used `title:` / `content:`. modals-core.js reads
 *   ONLY `titleHtml:` / `contentHtml:`; it does not read `title` or
 *   `content`. Result: the modal rendered with "Modal" as the title
 *   and empty body — no archetype picker, no fields, nothing to click.
 *   This is the same class of bug that modals-apprenticeship.js and
 *   modals-role-select.js had; all three were fixed in the same pass.
 *
 *   Type-selector wiring used setTimeout(50) + document.getElementById,
 *   which worked but contradicted the onMount convention used by
 *   modals-roles.js and modals-education.js. Converted to onMount.
 *
 *   The attribute-checkbox collection used document.querySelectorAll,
 *   which would collide with any other modal containing elements with
 *   the same class. Scoped to the modal element.
 *
 *   getCurrentYearSafe (deprecated alias in time.js) → getCurrentYear.
 *
 * DEPENDENCIES (must be loaded first):
 *   - relationship-types.js           (RELATIONSHIP_ARCHETYPES,
 *                                      RELATIONSHIP_ATTRIBUTES)
 *   - relationship-ui-metadata.js     (RelationshipUI)
 *   - modals-core.js                  (openModal, closeTopModal)
 *   - formatting.js                   (_escapeHtml)
 *   - ui.js                           (_showToast)
 *   - icons.js                        (Icons via _getIcon)
 *   - accessors.js                    (getCharacterById,
 *                                      getCurrentLocation)
 *   - time.js                         (getCurrentYear, calculateAge)
 *   - romance-commands.js             (RomanceCommands)
 *   - friendship-commands.js          (FriendshipCommands)
 *   - rivalry-commands.js             (RivalryCommands)
 *   - professional-commands.js        (ProfessionalCommands)
 *   - apprenticeship-commands.js      (ApprenticeshipCommands) —
 *                                      required because the
 *                                      apprenticeship dispatch calls it
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['RELATIONSHIP_ARCHETYPES',  'relationship-types.js'],
        ['RELATIONSHIP_ATTRIBUTES',  'relationship-types.js'],
        ['RelationshipUI',           'relationship-ui-metadata.js'],
        ['openModal',                'modals-core.js'],
        ['closeTopModal',            'modals-core.js'],
        ['_escapeHtml',              'formatting.js'],
        ['_showToast',               'ui.js'],
        ['Icons',                    'icons.js'],
        ['getCharacterById',         'accessors.js'],
        ['getCurrentLocation',       'accessors.js'],
        ['getCurrentYear',           'time.js'],
        ['calculateAge',             'time.js'],
        ['RomanceCommands',          'romance-commands.js'],
        ['FriendshipCommands',       'friendship-commands.js'],
        ['RivalryCommands',          'rivalry-commands.js'],
        ['ProfessionalCommands',     'professional-commands.js'],
        ['ApprenticeshipCommands',   'apprenticeship-commands.js']
    ];

    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-relationship.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var UI = window.RelationshipUI;

    // =========================================================================
    // 2. UI HELPERS
    // =========================================================================

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE_DOT) return window.Icons.CIRCLE_DOT;
        return '';
    }

    function _esc(str) {
        return window._escapeHtml(str == null ? '' : String(str));
    }

    function _toast(msg, type) {
        window._showToast(msg, type);
    }

    function _openModal(opts) {
        return window.openModal(opts);
    }

    function _closeModal() {
        window.closeTopModal();
    }

    function _getCharacter(id) {
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    function _age(character) {
        if (!character) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    function _location(character) {
        if (!character) return null;
        var loc = window.getCurrentLocation(character);
        return (loc === undefined) ? null : loc;
    }

    // =========================================================================
    // 3. CATEGORIES FOR THE TYPE PICKER
    // =========================================================================

    var CATEGORIES = [
        {
            key: 'romantic',
            types: [A.CASUAL_DATING, A.ONE_NIGHT_STAND, A.COMMITTED]
        },
        {
            key: 'social',
            types: [A.FRIENDSHIP, A.RIVALRY, A.ENMITY]
        },
        {
            key: 'professional',
            types: [A.APPRENTICESHIP, A.MASTERSHIP, A.EMPLOYMENT, A.GUILD_MEMBERSHIP]
        }
    ];

    function _typeOptionsHtml() {
        var html = '';
        var first = true;

        for (var c = 0; c < CATEGORIES.length; c++) {
            var cat = CATEGORIES[c];
            var catName = UI.categoryName(cat.key);
            if (catName === null) continue;

            html += '<optgroup label="' + _esc(catName) + '">';
            for (var i = 0; i < cat.types.length; i++) {
                var t = cat.types[i];
                var name = UI.archetypeName(t);
                if (name === null) continue;
                var iconName = UI.archetypeIcon(t);
                var iconSvg = iconName ? _icon(iconName) : '';
                html += '<option value="' + _esc(t) + '"' +
                        (first ? ' selected' : '') + '>' +
                        (iconSvg ? iconSvg + ' ' : '') +
                        _esc(name) +
                        '</option>';
                first = false;
            }
            html += '</optgroup>';
        }
        return html;
    }

    function _attributeCheckboxesHtml() {
        var ordered = [
            ATTR.MARRIED,
            ATTR.HANDFASTED,
            ATTR.CIVIL_UNION,
            ATTR.ENGAGED,
            ATTR.COHABITING,
            ATTR.POLYAMOROUS,
            ATTR.MONOGAMOUS,
            ATTR.ARRANGED,
            ATTR.LOVE_MATCH,
            ATTR.DUTY_MATCH,
            ATTR.SECRET,
            ATTR.PUBLIC,
            ATTR.SCANDALOUS,
            ATTR.MORGANATIC,
            ATTR.LEVITIC,
            ATTR.POSTHUMOUS
        ];

        var html = '';
        for (var i = 0; i < ordered.length; i++) {
            var a = ordered[i];
            var name = UI.attributeName(a);
            if (name === null) continue;
            var iconName = UI.attributeIcon(a);
            var iconSvg = iconName ? _icon(iconName) : '';
            html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="checkbox" class="attr-checkbox" value="' + _esc(a) + '">' +
                (iconSvg ? iconSvg + ' ' : '') +
                _esc(name) +
            '</label>';
        }
        return html;
    }

    // =========================================================================
    // 4. DISPATCH
    // =========================================================================
    //
    // Every archetype maps to exactly one command. The dispatch is
    // where the ownership boundary is enforced:
    //
    //   - ProfessionalCommands owns the professional EDGE primitive and
    //     the mastership / employment / guild commands.
    //
    //   - ApprenticeshipCommands owns the apprenticeship LIFECYCLE.
    //     ProfessionalCommands.createEdge is the primitive that
    //     ApprenticeshipCommands uses internally, but the modal must
    //     NOT call ProfessionalCommands.createEdge for apprenticeship
    //     creation — that would bypass the apprenticeship lifecycle
    //     (profession record, teaching history, etc.).

    function _dispatchCreate(type, aId, bId, form) {
        switch (type) {
            case A.CASUAL_DATING:
                return window.RomanceCommands.startCasualDating(aId, bId, {
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.ONE_NIGHT_STAND:
                return window.RomanceCommands.startOneNightStand(aId, bId, {
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.COMMITTED:
                return window.RomanceCommands.startCommittedRelationship(aId, bId, {
                    startYear: form.startYear,
                    attributes: form.attributes || [],
                    isScandalous: (form.attributes || []).indexOf(ATTR.SCANDALOUS) !== -1,
                    isSecret: (form.attributes || []).indexOf(ATTR.SECRET) !== -1,
                    notes: form.notes
                });

            case A.FRIENDSHIP:
                return window.FriendshipCommands.createFriendship(aId, bId, {
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.RIVALRY:
                return window.RivalryCommands.createRivalry(aId, bId, {
                    startYear: form.startYear
                });

            case A.ENMITY:
                return window.RivalryCommands.createEnmity(aId, bId, {
                    startYear: form.startYear
                });

            case A.APPRENTICESHIP:
                // Apprenticeship lifecycle lives on ApprenticeshipCommands,
                // not ProfessionalCommands. The command requires roleId.
                if (!form.roleId) {
                    return {
                        success: false,
                        code: 'MISSING_ROLE',
                        message: 'roleId is required to create an apprenticeship'
                    };
                }
                return window.ApprenticeshipCommands.createApprenticeship({
                    masterId: aId,
                    apprenticeId: bId,
                    roleId: form.roleId,
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.MASTERSHIP:
                return window.ProfessionalCommands.createMastership(aId, bId, {
                    roleId: form.roleId,
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.EMPLOYMENT:
                return window.ProfessionalCommands.createEmployment(aId, bId, {
                    role: form.role,
                    wages: form.wages,
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.GUILD_MEMBERSHIP:
                return window.ProfessionalCommands.createGuildMembership(aId, bId, {
                    rank: form.rank,
                    startYear: form.startYear,
                    notes: form.notes
                });

            default:
                return {
                    success: false,
                    code: 'UNSUPPORTED_TYPE',
                    message: 'relationship type not supported: ' + type
                };
        }
    }

    function _typeNeedsRoleField(type) {
        return type === A.APPRENTICESHIP || type === A.MASTERSHIP;
    }

    function _typeNeedsEmploymentFields(type) {
        return type === A.EMPLOYMENT;
    }

    function _typeNeedsGuildFields(type) {
        return type === A.GUILD_MEMBERSHIP;
    }

    // =========================================================================
    // 5. PUBLIC ENTRY POINT
    // =========================================================================

    /**
     * openRelationshipModal(char1, char2, onSuccess, context)
     *
     * char1 and char2 are character projections or live records with at
     * least { id, name, surname, birthYear, isDeceased, deathYear }.
     * The modal never holds a live reference; it reads by id when it
     * needs fresh data.
     *
     * context (optional):
     *   { defaultType: <archetype id> }
     */
    function openRelationshipModal(char1, char2, onSuccess, context) {
        context = context || {};

        if (!char1 || !char2) {
            _toast('Two characters are required', 'error');
            return;
        }
        if (char1.id === char2.id) {
            _toast('Cannot create a relationship with the same character', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var age1 = _age(char1);
        var age2 = _age(char2);
        var loc1 = _location(char1);
        var loc2 = _location(char2);

        var infoIcon = _icon('CIRCLE_DOT');
        var heartIcon = _icon('HEART');
        var checkIcon = _icon('CHECK_SIMPLE');

        var initialType = context.defaultType || A.FRIENDSHIP;

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                    '<div>' +
                        '<strong>' + _esc(char1.name) + ' ' + _esc(char1.surname || '') + '</strong>' +
                        (age1 !== null ? ' <span style="color:var(--dim);font-size:0.65rem;">' + age1 + 'y' +
                            (loc1 ? ' · ' + _esc(String(loc1)) : '') + '</span>' : '') +
                    '</div>' +
                    '<div style="color:var(--accent);">' + heartIcon + '</div>' +
                    '<div style="text-align:right;">' +
                        '<strong>' + _esc(char2.name) + ' ' + _esc(char2.surname || '') + '</strong>' +
                        (age2 !== null ? ' <span style="color:var(--dim);font-size:0.65rem;">' + age2 + 'y' +
                            (loc2 ? ' · ' + _esc(String(loc2)) : '') + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Relationship Type</label>' +
                '<select id="relType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    _typeOptionsHtml() +
                '</select>' +
            '</div>' +

            '<div id="relAttributesSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Attributes</label>' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;max-height:220px;overflow-y:auto;">' +
                    _attributeCheckboxesHtml() +
                '</div>' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon +
                    ' Attributes apply to committed relationships only</small>' +
            '</div>' +

            '<div id="relRoleSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role ID</label>' +
                '<input type="text" id="relRoleId" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" ' +
                    'placeholder="e.g., blacksmith">' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon +
                    ' Role ID required for apprenticeship and mastership</small>' +
            '</div>' +

            '<div id="relEmploymentSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role (optional)</label>' +
                '<input type="text" id="relEmpRole" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:8px;" ' +
                    'placeholder="e.g., steward">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Wages (optional)</label>' +
                '<input type="number" id="relEmpWages" min="0" step="1" value="0" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div id="relGuildSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Rank (optional)</label>' +
                '<input type="text" id="relGuildRank" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" ' +
                    'placeholder="e.g., journeyman">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="relStartYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<input type="text" id="relNotes" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" ' +
                    'placeholder="e.g., how they met...">' +
            '</div>';

        _openModal({
            titleHtml: _esc((heartIcon ? heartIcon + ' ' : '') + 'Create Relationship'),
            contentHtml: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + 'Create',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                // Scoped to the modal element — not document. See
                // MODAL LIFECYCLE in the module header.
                var select = modalEl.querySelector('#relType');
                var attrsSection = modalEl.querySelector('#relAttributesSection');
                var roleSection = modalEl.querySelector('#relRoleSection');
                var empSection = modalEl.querySelector('#relEmploymentSection');
                var guildSection = modalEl.querySelector('#relGuildSection');

                if (!select) return;

                function sync() {
                    var t = select.value;
                    if (attrsSection) {
                        attrsSection.style.display = (t === A.COMMITTED) ? 'block' : 'none';
                    }
                    if (roleSection) {
                        roleSection.style.display = _typeNeedsRoleField(t) ? 'block' : 'none';
                    }
                    if (empSection) {
                        empSection.style.display = _typeNeedsEmploymentFields(t) ? 'block' : 'none';
                    }
                    if (guildSection) {
                        guildSection.style.display = _typeNeedsGuildFields(t) ? 'block' : 'none';
                    }
                }

                select.value = initialType;
                select.addEventListener('change', sync);
                sync();
            },
            onConfirm: function(modalEl) {
                var typeEl = modalEl.querySelector('#relType');
                var yearEl = modalEl.querySelector('#relStartYear');
                var notesEl = modalEl.querySelector('#relNotes');

                if (!typeEl || !yearEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var type = typeEl.value;
                var startYear = parseInt(yearEl.value, 10);
                var notes = notesEl ? (notesEl.value || '') : '';

                if (isNaN(startYear)) {
                    _toast('Invalid start year', 'error');
                    return false;
                }

                var form = {
                    startYear: startYear,
                    notes: notes,
                    attributes: [],
                    roleId: null,
                    role: null,
                    wages: null,
                    rank: null
                };

                if (type === A.COMMITTED) {
                    var boxes = modalEl.querySelectorAll('.attr-checkbox:checked');
                    for (var i = 0; i < boxes.length; i++) {
                        form.attributes.push(boxes[i].value);
                    }
                }

                if (_typeNeedsRoleField(type)) {
                    var roleEl = modalEl.querySelector('#relRoleId');
                    var raw = roleEl ? (roleEl.value || '').trim() : '';
                    if (!raw) {
                        _toast('Role ID is required for this relationship type', 'error');
                        return false;
                    }
                    form.roleId = raw;
                }

                if (_typeNeedsEmploymentFields(type)) {
                    var rEl = modalEl.querySelector('#relEmpRole');
                    var wEl = modalEl.querySelector('#relEmpWages');
                    form.role = rEl ? (rEl.value || '').trim() : null;
                    if (wEl) {
                        var parsed = parseInt(wEl.value, 10);
                        if (!isNaN(parsed)) form.wages = parsed;
                    }
                }

                if (_typeNeedsGuildFields(type)) {
                    var gEl = modalEl.querySelector('#relGuildRank');
                    form.rank = gEl ? (gEl.value || '').trim() : null;
                }

                var result = _dispatchCreate(type, char1.id, char2.id, form);

                if (!result || !result.success) {
                    var msg = (result && (result.message || result.reason)) ||
                              'Failed to create relationship';
                    _toast(msg, 'error');
                    return false;
                }

                _toast('Relationship created', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                _closeModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openRelationshipModal = openRelationshipModal;
    window.openMatchModal = openRelationshipModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openRelationshipModal: openRelationshipModal,
            openMatchModal: openRelationshipModal
        };
    }
})();
