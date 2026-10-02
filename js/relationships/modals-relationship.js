/**
 * modals-relationship.js
 *
 * Unified relationship creation modal.
 * UI only. Dispatches to commands. No domain logic.
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
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _escape(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
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

    function _age(character) {
        if (!character) return 0;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(
                character.birthYear,
                character.isDeceased,
                character.deathYear
            );
        }
        return 0;
    }

    function _location(character) {
        if (!character) return '';
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return '';
    }

    // -------------------------------------------------------------------------
    // CATEGORIES FOR THE DROPDOWN
    // -------------------------------------------------------------------------

    var CATEGORIES = [
        { key: 'ROMANTIC', label: 'Romantic', types: [
            A.CASUAL_DATING, A.ONE_NIGHT_STAND, A.COMMITTED
        ]},
        { key: 'SOCIAL', label: 'Social', types: [
            A.FRIENDSHIP, A.RIVALRY, A.ENMITY
        ]},
        { key: 'PROFESSIONAL', label: 'Professional', types: [
            A.APPRENTICESHIP, A.EMPLOYMENT, A.GUILD_MEMBERSHIP
        ]}
    ];

    function _typeOptionsHtml() {
        var html = '';
        var first = true;
        for (var c = 0; c < CATEGORIES.length; c++) {
            var cat = CATEGORIES[c];
            html += '<optgroup label="' + cat.label + '">';
            for (var i = 0; i < cat.types.length; i++) {
                var t = cat.types[i];
                var name = UI.archetypeName(t);
                var icon = _icon(UI.archetypeIcon(t));
                html += '<option value="' + t + '"' +
                        (first ? ' selected' : '') + '>' +
                        icon + ' ' + _escape(name) +
                        '</option>';
                first = false;
            }
            html += '</optgroup>';
        }
        return html;
    }

    function _attributeCheckboxesHtml() {
        var ordered = [
            ATTR.MARRIED, ATTR.ENGAGED, ATTR.COHABITING,
            ATTR.POLYAMOROUS, ATTR.SECRET,
            ATTR.ARRANGED, ATTR.LOVE_MATCH, ATTR.DUTY_MATCH
        ];
        var html = '';
        for (var i = 0; i < ordered.length; i++) {
            var a = ordered[i];
            var name = UI.attributeName(a);
            var icon = _icon(UI.attributeIcon(a));
            html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="checkbox" class="attr-checkbox" value="' + a + '">' +
                icon + ' ' + _escape(name) +
            '</label>';
        }
        return html;
    }

    // -------------------------------------------------------------------------
    // DISPATCHER
    // -------------------------------------------------------------------------

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
                    isScandalous: !!(form.attributes || []).indexOf(ATTR.SCANDALOUS) !== -1,
                    notes: form.notes
                });

            case A.FRIENDSHIP:
                return window.FriendshipCommands.createFriendship(aId, bId, {
                    startYear: form.startYear,
                    notes: form.notes
                });

            case A.RIVALRY:
            case A.ENMITY:
                return window.RelationshipCommands.create({
                    participantA: aId,
                    participantB: bId,
                    type: type,
                    startYear: form.startYear,
                    metadata: { notes: form.notes || '' }
                });

            case A.APPRENTICESHIP:
                return window.ProfessionalCommands.createApprenticeship(aId, bId, {
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
                    message: 'Relationship type not supported: ' + type
                };
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

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

        var currentYear = (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;
        if (currentYear === null) {
            throw new Error('modals-relationship.js: getCurrentYearSafe required');
        }

        var age1 = _age(char1);
        var age2 = _age(char2);
        var loc1 = _location(char1);
        var loc2 = _location(char2);

        var infoIcon = _icon('CIRCLE_DOT');
        var heartIcon = _icon('HEART');
        var checkIcon = _icon('CHECK_SIMPLE');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                    '<div>' +
                        '<strong>' + _escape(char1.name) + ' ' + _escape(char1.surname || '') + '</strong>' +
                        ' <span style="color:var(--dim);font-size:0.65rem;">' + age1 + 'y · ' + _escape(loc1) + '</span>' +
                    '</div>' +
                    '<div style="color:var(--accent);">' + heartIcon + '</div>' +
                    '<div style="text-align:right;">' +
                        '<strong>' + _escape(char2.name) + ' ' + _escape(char2.surname || '') + '</strong>' +
                        ' <span style="color:var(--dim);font-size:0.65rem;">' + age2 + 'y · ' + _escape(loc2) + '</span>' +
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
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                    _attributeCheckboxesHtml() +
                '</div>' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon + ' Attributes apply to committed relationships only</small>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="relStartYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<input type="text" id="relNotes" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" ' +
                    'placeholder="e.g., How they met...">' +
            '</div>';

        _openModal({
            title: heartIcon + ' Create Relationship',
            content: html,
            confirmText: checkIcon + ' Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var type = document.getElementById('relType').value;
                var startYear = parseInt(document.getElementById('relStartYear').value, 10);
                var notes = document.getElementById('relNotes').value || '';

                if (isNaN(startYear)) {
                    _toast('Invalid start year', 'error');
                    return;
                }

                var attributes = [];
                if (type === A.COMMITTED) {
                    var boxes = document.querySelectorAll('.attr-checkbox:checked');
                    for (var i = 0; i < boxes.length; i++) {
                        attributes.push(boxes[i].value);
                    }
                }

                var result = _dispatchCreate(type, char1.id, char2.id, {
                    startYear: startYear,
                    notes: notes,
                    attributes: attributes
                });

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

        // Toggle attribute section based on type
        setTimeout(function() {
            var typeSelect = document.getElementById('relType');
            var attrsSection = document.getElementById('relAttributesSection');
            if (!typeSelect || !attrsSection) return;

            function sync() {
                attrsSection.style.display =
                    typeSelect.value === A.COMMITTED ? 'block' : 'none';
            }
            typeSelect.addEventListener('change', sync);
            sync();
        }, 50);
    }

    // -------------------------------------------------------------------------

    window.openRelationshipModal = openRelationshipModal;
    window.openMatchModal = openRelationshipModal;
    window.openPolygynyRelationshipModal = openRelationshipModal;

})();
