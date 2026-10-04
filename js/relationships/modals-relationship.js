/**
 * modals-relationship.js
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
 * Load order: after relationship-types.js, relationship-ui-metadata.js,
 * romance-commands.js, friendship-commands.js, rivalry-commands.js,
 * professional-commands.js.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var UI = window.RelationshipUI;

    if (!A || !ATTR || !UI) {
        throw new Error('modals-relationship.js: relationship-types.js and relationship-ui-metadata.js must load first');
    }

    // -------------------------------------------------------------------------
    // UI HELPERS
    // -------------------------------------------------------------------------

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE_DOT) return window.Icons.CIRCLE_DOT;
        return '';
    }

    function _escape(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
    }

    function _openModal(opts) {
        if (typeof window.openModal !== 'function') {
            throw new Error('modals-relationship.js: openModal required');
        }
        return window.openModal(opts);
    }

    function _closeModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('modals-relationship.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('modals-relationship.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _age(character) {
        if (!character) return null;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(
                character.birthYear,
                character.isDeceased,
                character.deathYear
            );
        }
        return null;
    }

    function _location(character) {
        if (!character) return null;
        if (typeof window.getCurrentLocation === 'function') {
            var loc = window.getCurrentLocation(character);
            return (loc === undefined) ? null : loc;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // CATEGORIES
    // -------------------------------------------------------------------------

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

            html += '<optgroup label="' + _escape(catName) + '">';
            for (var i = 0; i < cat.types.length; i++) {
                var t = cat.types[i];
                var name = UI.archetypeName(t);
                if (name === null) continue;
                var iconName = UI.archetypeIcon(t);
                var iconSvg = iconName ? _icon(iconName) : '';
                html += '<option value="' + _escape(t) + '"' +
                        (first ? ' selected' : '') + '>' +
                        (iconSvg ? iconSvg + ' ' : '') +
                        _escape(name) +
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
                '<input type="checkbox" class="attr-checkbox" value="' + _escape(a) + '">' +
                (iconSvg ? iconSvg + ' ' : '') +
                _escape(name) +
            '</label>';
        }
        return html;
    }

    // -------------------------------------------------------------------------
    // DISPATCH
    // -------------------------------------------------------------------------

    function _requireCommand(name, label) {
        if (typeof window[name] !== 'object' || window[name] === null) {
            throw new Error('modals-relationship.js: ' + label + ' required');
        }
        return window[name];
    }

    function _dispatchCreate(type, aId, bId, form) {
        switch (type) {
            case A.CASUAL_DATING:
                return _requireCommand('RomanceCommands', 'RomanceCommands')
                    .startCasualDating(aId, bId, {
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.ONE_NIGHT_STAND:
                return _requireCommand('RomanceCommands', 'RomanceCommands')
                    .startOneNightStand(aId, bId, {
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.COMMITTED:
                return _requireCommand('RomanceCommands', 'RomanceCommands')
                    .startCommittedRelationship(aId, bId, {
                        startYear: form.startYear,
                        attributes: form.attributes || [],
                        isScandalous: (form.attributes || []).indexOf(ATTR.SCANDALOUS) !== -1,
                        isSecret: (form.attributes || []).indexOf(ATTR.SECRET) !== -1,
                        notes: form.notes
                    });

            case A.FRIENDSHIP:
                return _requireCommand('FriendshipCommands', 'FriendshipCommands')
                    .createFriendship(aId, bId, {
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.RIVALRY:
                return _requireCommand('RivalryCommands', 'RivalryCommands')
                    .createRivalry(aId, bId, {
                        startYear: form.startYear
                    });

            case A.ENMITY:
                return _requireCommand('RivalryCommands', 'RivalryCommands')
                    .createEnmity(aId, bId, {
                        startYear: form.startYear
                    });

            case A.APPRENTICESHIP:
                if (!form.roleId) {
                    return {
                        success: false,
                        code: 'MISSING_ROLE',
                        message: 'roleId required for apprenticeship'
                    };
                }
                return _requireCommand('ProfessionalCommands', 'ProfessionalCommands')
                    .createApprenticeship(aId, bId, {
                        roleId: form.roleId,
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.MASTERSHIP:
                return _requireCommand('ProfessionalCommands', 'ProfessionalCommands')
                    .createMastership(aId, bId, {
                        roleId: form.roleId,
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.EMPLOYMENT:
                return _requireCommand('ProfessionalCommands', 'ProfessionalCommands')
                    .createEmployment(aId, bId, {
                        role: form.role,
                        wages: form.wages,
                        startYear: form.startYear,
                        notes: form.notes
                    });

            case A.GUILD_MEMBERSHIP:
                return _requireCommand('ProfessionalCommands', 'ProfessionalCommands')
                    .createGuildMembership(aId, bId, {
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

    // -------------------------------------------------------------------------
    // PUBLIC ENTRY POINT
    // -------------------------------------------------------------------------

    /**
     * openRelationshipModal(char1, char2, onSuccess, context)
     *
     * char1 and char2 are character projections or live records with at
     * least { id, name, surname, birthYear, isDeceased, deathYear }.
     * The modal never holds a live reference; it reads by id when it
     * needs fresh data.
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
                        '<strong>' + _escape(char1.name) + ' ' + _escape(char1.surname || '') + '</strong>' +
                        (age1 !== null ? ' <span style="color:var(--dim);font-size:0.65rem;">' + age1 + 'y' +
                            (loc1 ? ' · ' + _escape(String(loc1)) : '') + '</span>' : '') +
                    '</div>' +
                    '<div style="color:var(--accent);">' + heartIcon + '</div>' +
                    '<div style="text-align:right;">' +
                        '<strong>' + _escape(char2.name) + ' ' + _escape(char2.surname || '') + '</strong>' +
                        (age2 !== null ? ' <span style="color:var(--dim);font-size:0.65rem;">' + age2 + 'y' +
                            (loc2 ? ' · ' + _escape(String(loc2)) : '') + '</span>' : '') +
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
            title: (heartIcon ? heartIcon + ' ' : '') + 'Create Relationship',
            content: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + 'Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var typeEl = document.getElementById('relType');
                var yearEl = document.getElementById('relStartYear');
                var notesEl = document.getElementById('relNotes');

                if (!typeEl || !yearEl) {
                    _toast('Form missing', 'error');
                    return;
                }

                var type = typeEl.value;
                var startYear = parseInt(yearEl.value, 10);
                var notes = notesEl ? (notesEl.value || '') : '';

                if (isNaN(startYear)) {
                    _toast('Invalid start year', 'error');
                    return;
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
                    var boxes = document.querySelectorAll('.attr-checkbox:checked');
                    for (var i = 0; i < boxes.length; i++) {
                        form.attributes.push(boxes[i].value);
                    }
                }

                if (_typeNeedsRoleField(type)) {
                    var roleEl = document.getElementById('relRoleId');
                    form.roleId = roleEl ? (roleEl.value || '').trim() : '';
                }

                if (_typeNeedsEmploymentFields(type)) {
                    var rEl = document.getElementById('relEmpRole');
                    var wEl = document.getElementById('relEmpWages');
                    form.role = rEl ? (rEl.value || '').trim() : null;
                    if (wEl) {
                        var parsed = parseInt(wEl.value, 10);
                        if (!isNaN(parsed)) form.wages = parsed;
                    }
                }

                if (_typeNeedsGuildFields(type)) {
                    var gEl = document.getElementById('relGuildRank');
                    form.rank = gEl ? (gEl.value || '').trim() : null;
                }

                var result = _dispatchCreate(type, char1.id, char2.id, form);

                if (!result || !result.success) {
                    var msg = (result && result.message) || 'Failed to create relationship';
                    _toast(msg, 'error');
                    return;
                }

                _toast('Relationship created', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                _closeModal();
            }
        });

        // Wire up the type selector after the modal is in the DOM.
        setTimeout(function() {
            var select = document.getElementById('relType');
            var attrsSection = document.getElementById('relAttributesSection');
            var roleSection = document.getElementById('relRoleSection');
            var empSection = document.getElementById('relEmploymentSection');
            var guildSection = document.getElementById('relGuildSection');

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
        }, 50);
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.openRelationshipModal = openRelationshipModal;
    window.openMatchModal = openRelationshipModal;

})();
