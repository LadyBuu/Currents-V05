/**
 * modals-family.js
 *
 * Family modals. UI only. Dispatches to FamilyCommands.
 * No domain logic, no state access, no persistence.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // HELPERS
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
            throw new Error('modals-family.js: openModal required');
        }
        return window.openModal(opts);
    }

    function _closeModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('modals-family.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('modals-family.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _age(character) {
        if (!character) return 0;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(character.birthYear, character.isDeceased, character.deathYear);
        }
        return 0;
    }

    // -------------------------------------------------------------------------
    // SET BIRTH PARENTS
    // -------------------------------------------------------------------------

    /**
     * openSetBirthParentsModal(child, father, mother, onSuccess)
     * father/mother may be null. At least one must be present.
     */
    function openSetBirthParentsModal(child, father, mother, onSuccess) {
        if (!child) {
            _toast('Child not found', 'error');
            return;
        }
        if (!father && !mother) {
            _toast('At least one parent is required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var childAge = _age(child);
        var personIcon = _icon('PERSON');
        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div style="margin-bottom:6px;">' +
                    '<strong>' + personIcon + ' ' + _escape(child.name) + ' ' + _escape(child.surname || '') + '</strong>' +
                    ' <span style="color:var(--dim);font-size:0.65rem;">' + childAge + 'y</span>' +
                '</div>' +
                (father ? '<div>Father: <strong>' + _escape(father.name) + ' ' + _escape(father.surname || '') + '</strong></div>' : '') +
                (mother ? '<div>Mother: <strong>' + _escape(mother.name) + ' ' + _escape(mother.surname || '') + '</strong></div>' : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Birth Year</label>' +
                '<input type="number" id="famBirthYear" value="' + (child.birthYear || currentYear) + '" ' +
                    'min="1" max="' + currentYear + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon + ' Used to set parent relationship start year</small>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="famBirthNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" ' +
                    'placeholder="e.g., Legitimized, birth record found..."></textarea>' +
            '</div>';

        _openModal({
            title: 'Set Birth Parents: ' + child.name,
            content: html,
            confirmText: checkIcon + ' Set Parents',
            cancelText: 'Cancel',
            onConfirm: function() {
                var birthYear = parseInt(document.getElementById('famBirthYear').value, 10);
                var notes = document.getElementById('famBirthNotes').value || '';
                if (isNaN(birthYear)) {
                    _toast('Invalid birth year', 'error');
                    return;
                }

                var anySuccess = false;
                var lastErr = null;

                if (father) {
                    var rf = window.FamilyCommands.setParent(child.id, father.id, {
                        parentRole: 'father',
                        parentType: 'biological',
                        startYear: birthYear,
                        notes: notes
                    });
                    if (rf.success) anySuccess = true; else lastErr = rf;
                }
                if (mother) {
                    var rm = window.FamilyCommands.setParent(child.id, mother.id, {
                        parentRole: 'mother',
                        parentType: 'biological',
                        startYear: birthYear,
                        notes: notes
                    });
                    if (rm.success) anySuccess = true; else lastErr = rm;
                }

                if (!anySuccess) {
                    _toast((lastErr && lastErr.message) || 'Failed to set parents', 'error');
                    return;
                }

                _toast('Birth parents set', 'success');
                if (typeof onSuccess === 'function') onSuccess();
                _closeModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // CREATE ADOPTION
    // -------------------------------------------------------------------------

    /**
     * openCreateAdoptionModal(child, guardian, partner, onSuccess)
     * partner may be null for single adoption.
     */
    function openCreateAdoptionModal(child, guardian, partner, onSuccess) {
        if (!child || !guardian) {
            _toast('Child and guardian are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var childAge = _age(child);
        var isCouple = !!partner;
        var personIcon = _icon('PERSON');
        var warningIcon = _icon('WARNING');
        var checkIcon = _icon('CHECK_SIMPLE');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div>' +
                    '<strong>' + personIcon + ' ' + _escape(child.name) + ' ' + _escape(child.surname || '') + '</strong>' +
                    ' <span style="color:var(--dim);font-size:0.65rem;">' + childAge + 'y</span>' +
                '</div>' +
                '<div>' +
                    'Adopter' + (isCouple ? 's' : '') + ': ' +
                    '<strong>' + _escape(guardian.name) + ' ' + _escape(guardian.surname || '') + '</strong>' +
                    (isCouple ? ' & <strong>' + _escape(partner.name) + ' ' + _escape(partner.surname || '') + '</strong>' : '') +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Adoption Type</label>' +
                '<select id="famAdoptType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<option value="legal">Legal Adoption</option>' +
                    '<option value="guardianship">Guardianship</option>' +
                    '<option value="social">Social / Foster</option>' +
                '</select>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                '<input type="number" id="famAdoptYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="famAdoptNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>';

        _openModal({
            title: (isCouple ? 'Adoption' : 'Guardianship') + ': ' + child.name,
            content: html,
            confirmText: checkIcon + ' Confirm',
            cancelText: 'Cancel',
            onConfirm: function() {
                var type = document.getElementById('famAdoptType').value;
                var year = parseInt(document.getElementById('famAdoptYear').value, 10);
                var notes = document.getElementById('famAdoptNotes').value || '';
                if (isNaN(year)) {
                    _toast('Invalid year', 'error');
                    return;
                }

                var parentType = (type === 'legal') ? 'legal'
                                : (type === 'guardianship') ? 'legal'
                                : 'social';

                var results = [];
                var guardRole = guardian.gender === 'male' ? 'father'
                              : guardian.gender === 'female' ? 'mother'
                              : 'parent';
                results.push(window.FamilyCommands.createAdoption(child.id, guardian.id, {
                    parentRole: guardRole,
                    parentType: parentType,
                    startYear: year,
                    notes: notes
                }));

                if (partner) {
                    var partnerRole = partner.gender === 'male' ? 'father'
                                    : partner.gender === 'female' ? 'mother'
                                    : 'parent';
                    results.push(window.FamilyCommands.createAdoption(child.id, partner.id, {
                        parentRole: partnerRole,
                        parentType: parentType,
                        startYear: year,
                        notes: notes
                    }));
                }

                var anySuccess = false;
                var lastErr = null;
                for (var i = 0; i < results.length; i++) {
                    if (results[i].success) anySuccess = true;
                    else lastErr = results[i];
                }

                if (!anySuccess) {
                    _toast((lastErr && lastErr.message) || 'Failed to create adoption', 'error');
                    return;
                }

                _toast('Adoption recorded', 'success');
                if (typeof onSuccess === 'function') onSuccess();
                _closeModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // REMOVE ADOPTION
    // -------------------------------------------------------------------------

    function openRemoveAdoptionModal(child, guardian, partner, onSuccess) {
        if (!child || !guardian) {
            _toast('Child and guardian are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var warningIcon = _icon('WARNING');
        var crossIcon = _icon('X_HEAVY');

        var html = '' +
            '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<strong>' + warningIcon + ' This will remove the adoption relationship</strong>' +
                '<div style="margin-top:6px;font-size:0.7rem;">' +
                    _escape(child.name) + ' will no longer be a legal child of ' +
                    _escape(guardian.name) +
                    (partner ? ' and ' + _escape(partner.name) : '') + '.' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Termination</label>' +
                '<input type="number" id="famRemoveYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                '<textarea id="famRemoveReason" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>';

        _openModal({
            title: crossIcon + ' Remove Adoption: ' + child.name,
            content: html,
            confirmText: crossIcon + ' Remove',
            cancelText: 'Cancel',
            onConfirm: function() {
                var year = parseInt(document.getElementById('famRemoveYear').value, 10);
                var reason = document.getElementById('famRemoveReason').value || 'adoption ended';
                if (isNaN(year)) {
                    _toast('Invalid year', 'error');
                    return;
                }

                var results = [];
                results.push(window.FamilyCommands.removeAdoption(child.id, guardian.id, {
                    endYear: year,
                    reason: reason
                }));
                if (partner) {
                    results.push(window.FamilyCommands.removeAdoption(child.id, partner.id, {
                        endYear: year,
                        reason: reason
                    }));
                }

                var anySuccess = false;
                var lastErr = null;
                for (var i = 0; i < results.length; i++) {
                    if (results[i].success) anySuccess = true;
                    else lastErr = results[i];
                }

                if (!anySuccess) {
                    _toast((lastErr && lastErr.message) || 'Failed to remove adoption', 'error');
                    return;
                }

                _toast('Adoption removed', 'info');
                if (typeof onSuccess === 'function') onSuccess();
                _closeModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // LEGITIMIZE
    // -------------------------------------------------------------------------

    function openLegitimizationModal(child, father, mother, onSuccess) {
        if (!child) {
            _toast('Child not found', 'error');
            return;
        }
        if (!father && !mother) {
            _toast('At least one parent is required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var crownIcon = _icon('CROWN');
        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div><strong>' + crownIcon + ' ' + _escape(child.name) + ' ' + _escape(child.surname || '') + '</strong></div>' +
                (father ? '<div>Father: ' + _escape(father.name) + ' ' + _escape(father.surname || '') + '</div>' : '') +
                (mother ? '<div>Mother: ' + _escape(mother.name) + ' ' + _escape(mother.surname || '') + '</div>' : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Legitimization</label>' +
                '<input type="number" id="famLegitYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Inheritance Rights</label>' +
                '<select id="famLegitInherit" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<option value="full">Full inheritance rights</option>' +
                    '<option value="limited">Limited inheritance</option>' +
                    '<option value="none">No inheritance rights</option>' +
                '</select>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="famLegitNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>' +

            '<div style="font-size:0.55rem;color:var(--dim);">' +
                infoIcon + ' Legitimization declares a child as legitimate heir.' +
            '</div>';

        _openModal({
            title: crownIcon + ' Legitimize: ' + child.name,
            content: html,
            confirmText: checkIcon + ' Legitimize',
            cancelText: 'Cancel',
            onConfirm: function() {
                var year = parseInt(document.getElementById('famLegitYear').value, 10);
                var inheritance = document.getElementById('famLegitInherit').value;
                var notes = document.getElementById('famLegitNotes').value || '';
                if (isNaN(year)) {
                    _toast('Invalid year', 'error');
                    return;
                }

                var result = window.FamilyCommands.legitimize(child.id, {
                    fatherId: father ? father.id : null,
                    motherId: mother ? mother.id : null,
                    year: year,
                    inheritanceRights: inheritance,
                    notes: notes
                });

                if (!result.success) {
                    _toast(result.message || 'Failed to legitimize', 'error');
                    return;
                }

                _toast(child.name + ' has been legitimized', 'success');
                if (typeof onSuccess === 'function') onSuccess();
                _closeModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // FIND ADOPTION CANDIDATES
    //
    // Simple picker: shows characters without an active legal parent.
    // All filtering is done via CharacterQueries + FamilyQueries reads.
    // -------------------------------------------------------------------------

    function openAdoptionSearchModal(onSelect) {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('modals-family.js: getCharacters required');
        }
        var all = window.getCharacters();
        var candidates = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (c.isDeceased) continue;
            var legalIds = window.FamilyQueries.getLegalParentIds(c.id, { activeOnly: true });
            if (legalIds.length > 0) continue;
            candidates.push(c);
        }

        if (candidates.length === 0) {
            _toast('No adoption candidates found', 'info');
            return;
        }

        var infoIcon = _icon('CIRCLE_DOT');
        var html = '<div style="max-height:400px;overflow-y:auto;">';
        for (var j = 0; j < candidates.length; j++) {
            var ch = candidates[j];
            html += '<div class="fam-candidate" data-id="' + _escape(ch.id) + '" ' +
                'style="padding:8px;margin-bottom:6px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;cursor:pointer;">' +
                '<strong>' + _escape(ch.name) + ' ' + _escape(ch.surname || '') + '</strong>' +
                ' <span style="color:var(--dim);font-size:0.6rem;">' + _age(ch) + 'y</span>' +
            '</div>';
        }
        html += '</div>';

        _openModal({
            title: infoIcon + ' Select Adoption Candidate',
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        setTimeout(function() {
            var items = document.querySelectorAll('.fam-candidate');
            for (var k = 0; k < items.length; k++) {
                (function(el) {
                    el.addEventListener('click', function() {
                        var id = el.getAttribute('data-id');
                        var character = _getCharacter(id);
                        if (character && typeof onSelect === 'function') {
                            _closeModal();
                            onSelect(character);
                        }
                    });
                })(items[k]);
            }
        }, 50);
    }

    // -------------------------------------------------------------------------

    window.openSetBirthParentsModal = openSetBirthParentsModal;
    window.openCreateAdoptionModal = openCreateAdoptionModal;
    window.openRemoveAdoptionModal = openRemoveAdoptionModal;
    window.openLegitimizationModal = openLegitimizationModal;
    window.openAdoptionSearchModal = openAdoptionSearchModal;

})();
