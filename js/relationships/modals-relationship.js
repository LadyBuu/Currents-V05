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
 *   - family relation warning (non-blocking)
 *   - secret -> affair pipeline routing
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
 *     committed          → AffairCommands.createAffair (if secret/affair)
 *                          OR RomanceCommands.startCommittedRelationship
 *     friendship         → FriendshipCommands.createFriendship
 *     rivalry            → RivalryCommands.createRivalry
 *     enmity             → RivalryCommands.createEnmity
 *     apprenticeship     → ApprenticeshipCommands.createApprenticeship
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
 * TITLE / CONFIRM HTML CONTRACT
 *
 *   modals-core.js inserts titleHtml / contentHtml / confirmText /
 *   cancelText as HTML (via innerHTML). It does NOT escape them.
 *   Callers that prepend an SVG icon must insert the icon RAW and
 *   escape only the plain-text portion:
 *
 *       titleHtml: (heartIcon ? heartIcon + ' ' : '') + _esc('Create Relationship')
 *
 *   The previous revision escaped the WHOLE string (icon + text):
 *
 *       titleHtml: _esc((heartIcon ? heartIcon + ' ' : '') + 'Create Relationship')
 *
 *   escapeHtml turns '<svg>' into '&lt;svg&gt;', and modals-core then
 *   inserts the escaped string into innerHTML, which the browser
 *   renders as literal text. The visible symptom was a raw
 *   "<svg class="icon-svg"...>...</svg> Create Relationship" string in
 *   the title bar.
 *
 * ATTRIBUTE CHECKBOXES (CSS FIX)
 *
 *   The checkbox list now uses a scoped CSS grid (injected via <style>)
 *   to ensure the checkbox is on the left and the label is on the
 *   right, avoiding global CSS conflicts that previously forced the
 *   checkbox onto a line above the text.
 *
 * RELATIVE WARNING
 *
 *   A non-blocking warning banner appears when the two characters are
 *   blood relatives. It uses FamilyQueries.classifyKinship to detect
 *   the relationship and FamilyRules.kinshipLabel (if available) to
 *   render the label. It is purely informational; it does not disable
 *   the Create button.
 *
 * SECRET -> AFFAIR PIPELINE
 *
 *   If the user checks the Secret attribute, or if RomanceRules would
 *   classify the committed relationship as an affair (because one or
 *   both participants already have a committed partner and lack
 *   polyamorous permissions), the modal routes the creation through
 *   AffairCommands.createAffair instead of
 *   RomanceCommands.startCommittedRelationship.
 *
 *   This ensures the relationship receives the full affair metadata
 *   block (affairType, discovery state, consequence arrays) and is
 *   therefore fully compatible with the Affair tab and the annual
 *   discovery lifecycle.
 *
 * PREVIOUS REVISIONS (FIXED)
 *
 *   - Type-selector wiring used setTimeout + document.getElementById.
 *     Converted to onMount + modalEl.querySelector.
 *   - Attribute checkbox collection used document.querySelectorAll,
 *     which would collide with any other modal. Scoped to modalEl.
 *   - getCurrentYearSafe (deprecated alias) -> getCurrentYear.
 *   - getCurrentLocation guard threw on load because that name is not
 *     exported by accessors.js. Replaced with getCurrentPlace +
 *     getCurrentLocationId fallback.
 *   - context.defaultType was applied unconditionally, leading to
 *     visual/field desync if the default type was not in the rendered
 *     options. Now validated via _resolveInitialType.
 *
 * DEPENDENCIES (must be loaded first):
 *   - relationship-types.js           (RELATIONSHIP_ARCHETYPES,
 *                                      RELATIONSHIP_ATTRIBUTES)
 *   - relationship-ui-metadata.js     (RelationshipUI)
 *   - modals-core.js                  (openModal, closeTopModal)
 *   - formatting.js                   (_escapeHtml)
 *   - ui.js                           (_showToast)
 *   - icons.js                        (Icons via _getIcon)
 *   - accessors.js                    (getCharacterById)
 *   - world.js                        (getCurrentPlace)
 *   - time.js                         (getCurrentYear, calculateAge)
 *   - family-queries.js               (classifyKinship)
 *   - family-rules.js                 (KINSHIP constants)
 *   - romance-commands.js             (RomanceCommands)
 *   - affair-commands.js              (AffairCommands)
 *   - friendship-commands.js          (FriendshipCommands)
 *   - rivalry-commands.js             (RivalryCommands)
 *   - professional-commands.js        (ProfessionalCommands)
 *   - apprenticeship-commands.js      (ApprenticeshipCommands)
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
        ['getCurrentYear',           'time.js'],
        ['calculateAge',             'time.js'],
        ['FamilyQueries',            'family-queries.js'],
        ['FamilyRules',              'family-rules.js'],
        ['RomanceCommands',          'romance-commands.js'],
        ['FriendshipCommands',       'friendship-commands.js'],
        ['RivalryCommands',          'rivalry-commands.js'],
        ['ProfessionalCommands',     'professional-commands.js'],
        ['ApprenticeshipCommands',   'apprenticeship-commands.js'],
        ['LocationCommands',          'location-commands.js']
    ];

    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-relationship.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    // AffairCommands is optional at load time (guarded at call time)
    var HAS_AFFAIR_COMMANDS = (window.AffairCommands && typeof window.AffairCommands.createAffair === 'function');

    if (typeof window.getCurrentPlace !== 'function') {
        throw new Error(
            'modals-relationship.js requires world.js (getCurrentPlace).'
        );
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

    /**
     * Resolves the character's current place id, or null.
     */
    function _getCurrentLocationOrNull(character) {
        if (!character) return null;
        if (typeof window.getCurrentPlace === 'function') {
            var place = window.getCurrentPlace(character);
            if (place && typeof place.id === 'string' && place.id.length > 0) {
                return place.id;
            }
        }
        if (typeof window.getCurrentLocationId === 'function') {
            var id = window.getCurrentLocationId(character);
            if (typeof id === 'string' && id.length > 0) return id;
        }
        return null;
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
        var values = [];

        for (var c = 0; c < CATEGORIES.length; c++) {
            var cat = CATEGORIES[c];
            var catName = UI.categoryName(cat.key);
            if (catName === null) continue;

            var groupHtml = '';
            for (var i = 0; i < cat.types.length; i++) {
                var t = cat.types[i];
                var name = UI.archetypeName(t);
                if (name === null) continue;
                var iconName = UI.archetypeIcon(t);
                var iconSvg = iconName ? _icon(iconName) : '';
                groupHtml += '<option value="' + _esc(t) + '">' +
                        (iconSvg ? iconSvg + ' ' : '') +
                        _esc(name) +
                        '</option>';
                values.push(t);
            }
            if (groupHtml !== '') {
                html += '<optgroup label="' + _esc(catName) + '">' +
                        groupHtml +
                    '</optgroup>';
            }
        }

        return { html: html, values: values };
    }

    function _resolveInitialType(renderedValues, requestedType) {
        if (renderedValues.length === 0) return null;
        if (typeof requestedType === 'string' &&
            renderedValues.indexOf(requestedType) !== -1) {
            return requestedType;
        }
        return renderedValues[0];
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
            
            // Use the new .rel-attr-row classes (defined in the <style> block)
            html += '<label class="rel-attr-row">' +
                '<input type="checkbox" class="attr-checkbox" value="' + _esc(a) + '">' +
                '<span class="rel-attr-name">' + _esc(name) + '</span>' +
            '</label>';
        }
        return html;
    }

    // =========================================================================
    // 4. DISPATCH
    // =========================================================================

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
                var isExplicitSecret = (form.attributes || []).indexOf(ATTR.SECRET) !== -1;
                var willClassifyAsAffair = false;
                
                // Check if the rule engine will classify this as an affair.
                // We do a lightweight check against existing partners.
                if (window.RomanceQueries && typeof window.RomanceQueries.getActiveCommittedPartners === 'function') {
                    var partnersA = window.RomanceQueries.getActiveCommittedPartners(aId);
                    var partnersB = window.RomanceQueries.getActiveCommittedPartners(bId);
                    
                    var aAllowsMultiple = false;
                    var bAllowsMultiple = false;
                    
                    // Check rank permissions
                    if (window.RomanceCommands && typeof window.RomanceCommands._getExternalMultiPartnerFacts === 'function') {
                        var factsA = window.RomanceCommands._getExternalMultiPartnerFacts(_getCharacter(aId));
                        var factsB = window.RomanceCommands._getExternalMultiPartnerFacts(_getCharacter(bId));
                        aAllowsMultiple = !!(factsA && factsA.allowsMultipleByRank);
                        bAllowsMultiple = !!(factsB && factsB.allowsMultipleByRank);
                    }
                    
                    if ((partnersA.length > 0 && !aAllowsMultiple) || (partnersB.length > 0 && !bAllowsMultiple)) {
                        willClassifyAsAffair = true;
                    }
                }
                
                // Route to AffairCommands if needed.
                if ((isExplicitSecret || willClassifyAsAffair) && HAS_AFFAIR_COMMANDS) {
                    return window.AffairCommands.createAffair(aId, bId, {
                        startYear: form.startYear,
                        notes: form.notes,
                        isScandalous: (form.attributes || []).indexOf(ATTR.SCANDALOUS) !== -1
                    });
                }
                
                // Standard legitimate relationship fallback.
                return window.RomanceCommands.startCommittedRelationship(aId, bId, {
                    startYear: form.startYear,
                    attributes: form.attributes || [],
                    isScandalous: (form.attributes || []).indexOf(ATTR.SCANDALOUS) !== -1,
                    isSecret: false,
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
        var loc1 = _getCurrentLocationOrNull(char1);
        var loc2 = _getCurrentLocationOrNull(char2);

        var infoIcon = _icon('CIRCLE_DOT');
        var heartIcon = _icon('HEART');
        var checkIcon = _icon('CHECK_SIMPLE');
        var warningIcon = _icon('WARNING');

        var options = _typeOptionsHtml();
        var initialType = _resolveInitialType(options.values, context.defaultType);

        if (initialType === null) {
            _toast('No relationship types are available', 'error');
            return;
        }

        var html = '' +
            // --- START CSS FIX ---
            '<style>' +
                '.rel-attr-list { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }' +
                '.rel-attr-row { display: grid; grid-template-columns: 20px 1fr; align-items: center; gap: 8px; cursor: pointer; font-size: 0.7rem; color: var(--text); user-select: none; padding: 2px 0; }' +
                '.rel-attr-row input[type="checkbox"] { width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: var(--accent); }' +
                '.rel-attr-name { display: block; line-height: 1.2; }' +
            '</style>' +
            // --- END CSS FIX ---

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

            // --- START FAMILY WARNING ---
            '<div id="relFamilyWarning" style="display:none;background:rgba(200,112,64,0.15);border:1px solid var(--warn);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;color:var(--text);">' +
                warningIcon + ' <strong>Warning:</strong> <span id="relFamilyWarningText"></span>' +
            '</div>' +
            // --- END FAMILY WARNING ---

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Relationship Type</label>' +
                '<select id="relType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    options.html +
                '</select>' +
            '</div>' +

            '<div id="relLocationSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Different locations</label>' +
                '<select id="relLocationChoice" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<option value="long_distance">Keep them in separate locations (long-distance)</option>' +
                    '<option value="move1">Move ' + _esc(char1.name + ' ' + (char1.surname || '')) + ' to ' + _esc(String(loc2 || 'the other location')) + '</option>' +
                    '<option value="move2">Move ' + _esc(char2.name + ' ' + (char2.surname || '')) + ' to ' + _esc(String(loc1 || 'the other location')) + '</option>' +
                '</select>' +
                '<small style="font-size:0.6rem;color:var(--dim);">Moving records a location-history entry using the Location system.</small>' +
            '</div>' +

            '<div id="relAttributesSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Attributes</label>' +
                // Use the new class for the container
                '<div class="rel-attr-list" style="background:var(--bg2);padding:12px;border-radius:8px;max-height:220px;overflow-y:auto;">' +
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

            '<div id="relHouseholdSection" style="display:none;margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household</label>' +
                '<select id="relHouseholdChoice" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<option value="none">Leave household membership unchanged</option>' +
                    '<option value="partner1">Join ' + _esc(char1.name + ' ' + (char1.surname || '')) + '\'s household</option>' +
                    '<option value="partner2">Join ' + _esc(char2.name + ' ' + (char2.surname || '')) + '\'s household</option>' +
                    '<option value="new">Create a new household for both</option>' +
                '</select>' +
                '<input id="relHouseholdName" type="text" placeholder="New household name" style="display:none;width:100%;margin-top:8px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<small style="font-size:0.6rem;color:var(--dim);">Household membership is updated through HouseholdCommands.</small>' +
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
            titleHtml: (heartIcon ? heartIcon + ' ' : '') + _esc('Create Relationship'),
            contentHtml: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + 'Create',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var select = modalEl.querySelector('#relType');
                var attrsSection = modalEl.querySelector('#relAttributesSection');
                var roleSection = modalEl.querySelector('#relRoleSection');
                var empSection = modalEl.querySelector('#relEmploymentSection');
                var guildSection = modalEl.querySelector('#relGuildSection');
                var locationSection = modalEl.querySelector('#relLocationSection');
                var householdSection = modalEl.querySelector('#relHouseholdSection');
                var householdChoice = modalEl.querySelector('#relHouseholdChoice');
                var householdName = modalEl.querySelector('#relHouseholdName');

                if (!select) return;

                function sync() {
                    var t = select.value;
                    if (locationSection) locationSection.style.display = (loc1 && loc2 && loc1 !== loc2 && (t === A.CASUAL_DATING || t === A.ONE_NIGHT_STAND || t === A.COMMITTED)) ? 'block' : 'none';
                    if (householdSection) householdSection.style.display = (t === A.CASUAL_DATING || t === A.ONE_NIGHT_STAND || t === A.COMMITTED) ? 'block' : 'none';
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
                if (householdChoice && householdName) {
                    householdChoice.addEventListener('change', function() {
                        householdName.style.display = householdChoice.value === 'new' ? 'block' : 'none';
                    });
                }

                // --- START FAMILY WARNING LOGIC ---
                var warningBox = modalEl.querySelector('#relFamilyWarning');
                var warningText = modalEl.querySelector('#relFamilyWarningText');

                if (warningBox && warningText && window.FamilyQueries && window.FamilyRules) {
                    try {
                        var kinship = window.FamilyQueries.classifyKinship(char1.id, char2.id);
                        // Check if they are blood relatives (not unrelated, not self)
                        if (kinship && kinship.type !== window.FamilyRules.KINSHIP.UNRELATED && kinship.type !== window.FamilyRules.KINSHIP.SELF) {
                            var relationLabel = 'blood relatives';
                            if (typeof window.FamilyRules.kinshipLabel === 'function') {
                                relationLabel = window.FamilyRules.kinshipLabel(kinship.type);
                            }
                            warningText.textContent = 'These characters are ' + relationLabel + '. Romantic relationships between relatives may have social or cultural consequences.';
                            warningBox.style.display = 'block';
                        }
                    } catch (e) {
                        // Fail silently if family query throws
                        warningBox.style.display = 'none';
                    }
                }
                // --- END FAMILY WARNING LOGIC ---
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

                var householdChoicePreflight = modalEl.querySelector('#relHouseholdChoice');
                if ((type === A.CASUAL_DATING || type === A.ONE_NIGHT_STAND || type === A.COMMITTED) &&
                    householdChoicePreflight && householdChoicePreflight.value === 'new') {
                    var householdNamePreflight = modalEl.querySelector('#relHouseholdName');
                    if (!householdNamePreflight || !(householdNamePreflight.value || '').trim()) {
                        _toast('Enter a name for the new household', 'error');
                        return false;
                    }
                    if (!loc1 && !loc2) {
                        _toast('A household requires at least one character with a current location', 'error');
                        return false;
                    }
                }

                var locationChoiceEl = modalEl.querySelector('#relLocationChoice');
                var locationChoice = locationChoiceEl ? locationChoiceEl.value : 'long_distance';
                if (loc1 && loc2 && loc1 !== loc2 &&
                    (type === A.CASUAL_DATING || type === A.ONE_NIGHT_STAND || type === A.COMMITTED) &&
                    locationChoice !== 'long_distance') {
                    var moverId = locationChoice === 'move1' ? char1.id : char2.id;
                    var destinationId = locationChoice === 'move1' ? loc2 : loc1;
                    var moveResult = window.LocationCommands.recordMove(moverId, destinationId, {
                        year: startYear,
                        note: 'Moved to be with ' + (locationChoice === 'move1'
                            ? (char2.name + ' ' + (char2.surname || ''))
                            : (char1.name + ' ' + (char1.surname || '')))
                    });
                    if (!moveResult || !moveResult.success) {
                        _toast((moveResult && (moveResult.message || moveResult.reason)) || 'Could not record the move; relationship was not created.', 'error');
                        return false;
                    }
                }

                var result = _dispatchCreate(type, char1.id, char2.id, form);

                if (!result || !result.success) {
                    var msg = (result && (result.message || result.reason)) ||
                              'Failed to create relationship';
                    _toast(msg, 'error');
                    return false;
                }

                // Toast warnings if the command returned any (e.g. underage)
                if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                    for (var w = 0; w < result.warnings.length; w++) {
                        var warning = result.warnings[w];
                        var warningText = warning && warning.message
                            ? warning.message
                            : (warning && warning.code ? String(warning.code) : 'Warning.');
                        _toast(warningText, 'warning');
                    }
                }

                // Apply the requested household integration after relationship creation.
                // HouseholdCommands owns membership history and cross-household transfers.
                var householdChoiceEl = modalEl.querySelector('#relHouseholdChoice');
                var householdChoiceValue = householdChoiceEl ? householdChoiceEl.value : 'none';
                if ((type === A.CASUAL_DATING || type === A.ONE_NIGHT_STAND || type === A.COMMITTED) &&
                    householdChoiceValue !== 'none' && window.HouseholdCommands && window.HouseholdQueries) {
                    var householdTargetId = null;
                    if (householdChoiceValue === 'partner1' || householdChoiceValue === 'partner2') {
                        var targetCharacterId = householdChoiceValue === 'partner1' ? char1.id : char2.id;
                        var targetHouseholds = window.HouseholdQueries.getHouseholdsByMember(targetCharacterId);
                        if (!targetHouseholds.length) {
                            _toast('Relationship created, but the selected partner has no household to join.', 'warning');
                            if (typeof onSuccess === 'function') onSuccess(result);
                            _closeModal();
                            return true;
                        }
                        householdTargetId = targetHouseholds[0].id;
                    } else if (householdChoiceValue === 'new') {
                        var householdNameEl = modalEl.querySelector('#relHouseholdName');
                        var newHouseholdName = householdNameEl ? (householdNameEl.value || '').trim() : '';
                        if (!newHouseholdName) {
                            _toast('Relationship created, but a name is required to create the household.', 'warning');
                            if (typeof onSuccess === 'function') onSuccess(result);
                            _closeModal();
                            return true;
                        }
                        var householdLocationId = loc1 || loc2;
                        if (!householdLocationId) {
                            _toast('Relationship created, but a household cannot be created without a location.', 'warning');
                            if (typeof onSuccess === 'function') onSuccess(result);
                            _closeModal();
                            return true;
                        }
                        var createHouseholdResult = window.HouseholdCommands.createHousehold({
                            name: newHouseholdName,
                            foundedYear: startYear,
                            locationId: householdLocationId,
                            headId: char1.id
                        });
                        if (!createHouseholdResult || !createHouseholdResult.success) {
                            _toast('Relationship created, but household creation failed: ' +
                                ((createHouseholdResult && (createHouseholdResult.message || createHouseholdResult.reason)) || 'unknown error'), 'warning');
                            if (typeof onSuccess === 'function') onSuccess(result);
                            _closeModal();
                            return true;
                        }
                        householdTargetId = createHouseholdResult.data && createHouseholdResult.data.householdId;
                    }
                    if (householdTargetId) {
                        [char1.id, char2.id].forEach(function(memberId) {
                            var currentHouseholds = window.HouseholdQueries.getHouseholdsByMember(memberId);
                            if (currentHouseholds.some(function(h) { return h.id === householdTargetId; })) return;
                            var transferResult = window.HouseholdCommands.transferMember(memberId, householdTargetId, {
                                year: startYear,
                                reason: 'Joined household with romantic partner',
                                type: 'family',
                                role: 'Family Member'
                            });
                            if (!transferResult || !transferResult.success) {
                                _toast('Relationship created, but household membership could not be fully updated: ' +
                                    ((transferResult && (transferResult.message || transferResult.reason)) || 'unknown error'), 'warning');
                            }
                        });
                    }
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
