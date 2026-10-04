/**
 * modals-friendship.js
 *
 * Friendship-specific modals.
 *
 * UI only. Dispatches to FriendshipCommands. No domain logic, no
 * direct state access, no persistence.
 *
 * Owns:
 *   - bulk friendship creation modal (multi-character)
 *   - friendship detail view
 *   - friendship edit modal (strength, notes)
 *   - friendship breakup modal
 *
 * Does NOT own:
 *   - friendship policy
 *   - strength bounds (read from FriendshipRules)
 *   - any interpretation of friendship metadata
 *
 * Load order: after friendship-rules.js, friendship-queries.js,
 * friendship-commands.js, relationship-ui-metadata.js.
 */

(function() {
    'use strict';

    var FR = window.FriendshipRules;
    var FQ = window.FriendshipQueries;

    if (!FR || !FQ) {
        throw new Error('modals-friendship.js: friendship-rules.js and friendship-queries.js must load first');
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
            throw new Error('modals-friendship.js: openModal required');
        }
        return window.openModal(opts);
    }

    function _closeModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('modals-friendship.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('modals-friendship.js: getCurrentYearSafe required');
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

    function _strengthColor(strength) {
        if (typeof strength !== 'number') return '#888888';
        if (strength < FR.THRESHOLD_ACQUAINTANCE) return '#c84444';
        if (strength < FR.THRESHOLD_FRIEND) return '#c8a844';
        if (strength < FR.THRESHOLD_CLOSE) return '#4a9060';
        return '#2a6e40';
    }

    // -------------------------------------------------------------------------
    // BULK FRIENDSHIP CREATION
    //
    // openFriendshipModal(characters, onSuccess)
    // characters: array of character projections with { id, name, surname, ... }
    // -------------------------------------------------------------------------

    function openFriendshipModal(characters, onSuccess) {
        if (!Array.isArray(characters) || characters.length < 2) {
            _toast('At least two characters are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();

        // Partition pairs
        var validPairs = [];
        var existingPairs = [];
        for (var i = 0; i < characters.length; i++) {
            for (var j = i + 1; j < characters.length; j++) {
                var a = characters[i];
                var b = characters[j];
                if (!a || !b || a.id === b.id) continue;
                if (FQ.areFriends(a.id, b.id)) {
                    existingPairs.push({ a: a, b: b });
                } else {
                    validPairs.push({ a: a, b: b });
                }
            }
        }

        if (validPairs.length === 0) {
            _toast('All selected characters are already friends', 'info');
            return;
        }

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var warningIcon = _icon('WARNING');

        var listHtml = '';
        for (var k = 0; k < characters.length; k++) {
            var c = characters[k];
            var age = _age(c);
            listHtml += '<div style="padding:6px 0;border-bottom:1px solid var(--border2);">' +
                '<strong>' + _escape(c.name) + ' ' + _escape(c.surname || '') + '</strong>' +
                (age !== null ? ' <span style="color:var(--dim);font-size:0.6rem;">' + age + 'y</span>' : '') +
            '</div>';
        }

        var existingHtml = existingPairs.length > 0
            ? '<div style="background:rgba(200,112,64,0.15);border:1px solid var(--warn);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                warningIcon + ' ' + existingPairs.length +
                ' pair(s) already friends (will be skipped)' +
              '</div>'
            : '';

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div style="font-weight:bold;color:var(--accent);margin-bottom:8px;">Selected (' +
                    characters.length + '):</div>' +
                listHtml +
                '<div style="margin-top:8px;font-size:0.6rem;color:var(--dim);">' +
                    infoIcon + ' Will create ' + validPairs.length + ' new friendship(s)' +
                '</div>' +
            '</div>' +
            existingHtml +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="fndStartYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Starting Strength</label>' +
                '<input type="range" id="fndStartStrength" min="0" max="100" value="' +
                    FR.STRENGTH_DEFAULT + '" style="width:100%;">' +
                '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.6rem;">' +
                    '<span>0</span>' +
                    '<span id="fndStartStrengthDisplay">' + FR.STRENGTH_DEFAULT + '%</span>' +
                    '<span>100</span>' +
                '</div>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="fndNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>';

        _openModal({
            title: (infoIcon ? infoIcon + ' ' : '') + 'Create Friendships',
            content: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + 'Create ' + validPairs.length,
            cancelText: 'Cancel',
            onConfirm: function() {
                var yearEl = document.getElementById('fndStartYear');
                var strengthEl = document.getElementById('fndStartStrength');
                var notesEl = document.getElementById('fndNotes');

                if (!yearEl || !strengthEl) {
                    _toast('Form missing', 'error');
                    return;
                }

                var year = parseInt(yearEl.value, 10);
                var strength = parseInt(strengthEl.value, 10);
                var notes = notesEl ? (notesEl.value || '') : '';

                if (isNaN(year)) {
                    _toast('Invalid start year', 'error');
                    return;
                }
                if (isNaN(strength)) strength = FR.STRENGTH_DEFAULT;

                var ids = [];
                for (var i = 0; i < characters.length; i++) ids.push(characters[i].id);

                var result = window.FriendshipCommands.createMutualFriendships(ids, {
                    startYear: year,
                    strength: FR.clampStrength(strength),
                    notes: notes
                });

                if (!result.success) {
                    _toast(result.message || 'Failed to create friendships', 'error');
                    return;
                }

                _toast(result.createdCount + ' friendship(s) created', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                _closeModal();
            }
        });

        setTimeout(function() {
            var slider = document.getElementById('fndStartStrength');
            var display = document.getElementById('fndStartStrengthDisplay');
            if (slider && display) {
                slider.addEventListener('input', function() {
                    display.textContent = slider.value + '%';
                });
            }
        }, 50);
    }

    // -------------------------------------------------------------------------
    // VIEW FRIENDSHIP
    // -------------------------------------------------------------------------

    function openViewFriendshipModal(aId, bId, onEdit) {
        var a = _getCharacter(aId);
        var b = _getCharacter(bId);
        if (!a || !b) {
            _toast('Character not found', 'error');
            return;
        }

        var rel = FQ.getActiveFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No active friendship found', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var strength = rel.strength;
        var color = _strengthColor(strength);
        var duration = (typeof rel.startYear === 'number')
            ? Math.max(0, currentYear - rel.startYear)
            : null;

        var infoIcon = _icon('CIRCLE_DOT');
        var friendshipIcon = _icon('FRIENDSHIP');

        var strengthHtml = '';
        if (typeof strength === 'number') {
            strengthHtml =
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                        infoIcon + ' Strength</label>' +
                    '<div style="background:var(--bg3);border-radius:4px;height:8px;overflow:hidden;">' +
                        '<div style="background:' + color + ';height:100%;width:' + strength +
                            '%;border-radius:4px;"></div>' +
                    '</div>' +
                    '<div style="font-size:0.65rem;color:' + color +
                        ';margin-top:4px;">' + strength + '% · ' +
                        _escape(rel.tier || 'unknown') + '</div>' +
                '</div>';
        }

        var events = FQ.getFriendshipEvents(rel.relationshipId);
        var eventsHtml = '';
        if (events.length > 0) {
            eventsHtml = '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                    'Recent Events</label>' +
                '<div style="max-height:160px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:6px;">';
            // Show last 8
            var start = Math.max(0, events.length - 8);
            for (var i = events.length - 1; i >= start; i--) {
                var e = events[i];
                eventsHtml += '<div style="font-size:0.65rem;padding:3px 0;border-bottom:1px solid var(--border2);">' +
                    _escape(e.type) +
                    (typeof e.year === 'number' ? ' · ' + e.year : '') +
                    (typeof e.impact === 'number' && e.impact !== 0
                        ? ' · ' + (e.impact > 0 ? '+' : '') + e.impact
                        : '') +
                    (e.description ? ' — ' + _escape(e.description) : '') +
                '</div>';
            }
            eventsHtml += '</div></div>';
        }

        var notes = rel.notes || '';
        var notesHtml = notes
            ? '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;font-size:0.65rem;">' +
                    _escape(notes) +
                '</div>' +
              '</div>'
            : '';

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;">' +
                (friendshipIcon ? '<div style="font-size:1.5rem;">' + friendshipIcon + '</div>' : '') +
                '<div style="margin-top:8px;">' +
                    '<strong>' + _escape(a.name) + ' ' + _escape(a.surname || '') + '</strong> ' +
                    (infoIcon || '·') + ' ' +
                    '<strong>' + _escape(b.name) + ' ' + _escape(b.surname || '') + '</strong>' +
                '</div>' +
                '<div style="margin-top:6px;font-size:0.6rem;color:var(--dim);">' +
                    (typeof rel.startYear === 'number' ? 'since ' + rel.startYear : '') +
                    (duration !== null ? ' (' + duration + ' years)' : '') +
                '</div>' +
            '</div>' +
            strengthHtml +
            eventsHtml +
            notesHtml;

        _openModal({
            title: (friendshipIcon ? friendshipIcon + ' ' : '') + 'Friendship Details',
            content: html,
            confirmText: 'Edit',
            cancelText: 'Close',
            onConfirm: function() {
                _closeModal();
                if (typeof onEdit === 'function') onEdit();
                else openEditFriendshipModal(aId, bId);
            }
        });
    }

    // -------------------------------------------------------------------------
    // EDIT FRIENDSHIP
    // -------------------------------------------------------------------------

    function openEditFriendshipModal(aId, bId, onSuccess) {
        var a = _getCharacter(aId);
        var b = _getCharacter(bId);
        if (!a || !b) {
            _toast('Character not found', 'error');
            return;
        }

        var rel = FQ.getActiveFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No active friendship found', 'error');
            return;
        }

        var strength = (typeof rel.strength === 'number') ? rel.strength : FR.STRENGTH_DEFAULT;
        var notes = rel.notes || '';
        var currentYear = _getCurrentYear();
        var startYear = (typeof rel.startYear === 'number') ? rel.startYear : currentYear;

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var crossIcon = _icon('X_HEAVY');
        var editIcon = _icon('EDIT');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<strong>' + _escape(a.name) + ' ' + _escape(a.surname || '') + '</strong> ' +
                (infoIcon || '·') + ' ' +
                '<strong>' + _escape(b.name) + ' ' + _escape(b.surname || '') + '</strong>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Strength</label>' +
                '<input type="range" id="fndEditStrength" min="0" max="100" value="' +
                    strength + '" style="width:100%;">' +
                '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.6rem;">' +
                    '<span>0</span>' +
                    '<span id="fndStrengthDisplay">' + strength + '%</span>' +
                    '<span>100</span>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="fndEditNotes" rows="3" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    _escape(notes) +
                '</textarea>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="fndEditYear" value="' + startYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
                '<button id="fndEndBtn" type="button" ' +
                    'style="background:#8a3020;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.65rem;">' +
                    (crossIcon ? crossIcon + ' ' : '') + 'End Friendship' +
                '</button>' +
            '</div>';

        _openModal({
            title: (editIcon ? editIcon + ' ' : '') + 'Edit Friendship',
            content: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var strengthEl = document.getElementById('fndEditStrength');
                var notesEl = document.getElementById('fndEditNotes');
                var yearEl = document.getElementById('fndEditYear');

                if (!strengthEl || !notesEl || !yearEl) {
                    _toast('Form missing', 'error');
                    return;
                }

                var newStrength = parseInt(strengthEl.value, 10);
                var newNotes = notesEl.value || '';
                var newYear = parseInt(yearEl.value, 10);

                if (isNaN(newStrength) || isNaN(newYear)) {
                    _toast('Invalid input', 'error');
                    return;
                }

                var result = window.RelationshipCommands.update(rel.relationshipId, {
                    startYear: newYear,
                    metadata: {
                        strength: FR.clampStrength(newStrength),
                        notes: newNotes
                    }
                });

                if (!result.success) {
                    _toast(result.message || 'Failed to update', 'error');
                    return;
                }

                _toast('Friendship updated', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                _closeModal();
            }
        });

        setTimeout(function() {
            var slider = document.getElementById('fndEditStrength');
            var display = document.getElementById('fndStrengthDisplay');
            if (slider && display) {
                slider.addEventListener('input', function() {
                    display.textContent = slider.value + '%';
                });
            }
            var endBtn = document.getElementById('fndEndBtn');
            if (endBtn) {
                endBtn.addEventListener('click', function() {
                    _closeModal();
                    openBreakupFriendshipModal(aId, bId, onSuccess);
                });
            }
        }, 50);
    }

    // -------------------------------------------------------------------------
    // BREAKUP FRIENDSHIP
    // -------------------------------------------------------------------------

    function openBreakupFriendshipModal(aId, bId, onSuccess) {
        var a = _getCharacter(aId);
        var b = _getCharacter(bId);
        if (!a || !b) {
            _toast('Character not found', 'error');
            return;
        }

        var rel = FQ.getActiveFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No active friendship found', 'error');
            return;
        }

        var currentYear = _getCurrentYear();

        // Reason options built from END_REASONS
        var reasonLabels = {
            drifted_apart:   'Drifted Apart',
            betrayal:        'Betrayal',
            argument:        'Major Argument',
            jealousy:        'Jealousy',
            distance:        'Distance',
            different_paths: 'Different Paths',
            romance:         'Became Romantic',
            rivalry:         'Became Rivals',
            mutual:          'Mutual Agreement',
            unknown:         'Other / Unknown'
        };

        var reasonOptions = '';
        var keys = Object.keys(FR.END_REASONS);
        for (var i = 0; i < keys.length; i++) {
            var id = FR.END_REASONS[keys[i]];
            reasonOptions += '<option value="' + _escape(id) + '">' +
                _escape(reasonLabels[id] || id) + '</option>';
        }

        var infoIcon = _icon('CIRCLE_DOT');
        var crossIcon = _icon('X_HEAVY');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<strong>' + _escape(a.name) + ' ' + _escape(a.surname || '') + '</strong> ' +
                (infoIcon || '·') + ' ' +
                '<strong>' + _escape(b.name) + ' ' + _escape(b.surname || '') + '</strong>' +
                (typeof rel.startYear === 'number'
                    ? '<div style="font-size:0.6rem;color:var(--dim);">Friends since ' + rel.startYear + '</div>'
                    : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                '<input type="number" id="fndEndYear" value="' + currentYear + '" ' +
                    'min="' + (rel.startYear || 1) + '" max="' + (currentYear + 5) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                '<select id="fndEndReason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    reasonOptions +
                '</select>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="fndEndNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>';

        _openModal({
            title: (crossIcon ? crossIcon + ' ' : '') + 'End Friendship',
            content: html,
            confirmText: (crossIcon ? crossIcon + ' ' : '') + 'Confirm End',
            cancelText: 'Cancel',
            onConfirm: function() {
                var yearEl = document.getElementById('fndEndYear');
                var reasonEl = document.getElementById('fndEndReason');

                if (!yearEl || !reasonEl) {
                    _toast('Form missing', 'error');
                    return;
                }

                var year = parseInt(yearEl.value, 10);
                var reason = reasonEl.value;

                if (isNaN(year)) {
                    _toast('Invalid end year', 'error');
                    return;
                }

                var result = window.FriendshipCommands.removeFriendship(aId, bId, {
                    endYear: year,
                    reason: reason
                });

                if (!result.success) {
                    _toast(result.message || 'Failed to end friendship', 'error');
                    return;
                }

                _toast('Friendship ended', 'info');
                if (typeof onSuccess === 'function') onSuccess(result);
                _closeModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.openFriendshipModal = openFriendshipModal;
    window.openViewFriendshipModal = openViewFriendshipModal;
    window.openEditFriendshipModal = openEditFriendshipModal;
    window.openBreakupFriendshipModal = openBreakupFriendshipModal;

})();
