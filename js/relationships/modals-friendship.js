/**
 * modals-friendship.js
 *
 * Friendship modals. UI only. Dispatches to FriendshipCommands.
 * No domain logic, no direct character mutation, no persistence.
 * No group system — that belongs in a separate module.
 */

(function() {
    'use strict';

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
        if (!character) return 0;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(character.birthYear, character.isDeceased, character.deathYear);
        }
        return 0;
    }

    function _strengthColor(strength) {
        if (typeof strength !== 'number') return '#888888';
        if (strength < 20) return '#c84444';
        if (strength < 50) return '#c8a844';
        if (strength < 75) return '#4a9060';
        return '#2a6e40';
    }

    // -------------------------------------------------------------------------
    // CREATE FRIENDSHIPS (bulk)
    // -------------------------------------------------------------------------

    function openFriendshipModal(characters, onSuccess) {
        if (!Array.isArray(characters) || characters.length < 2) {
            _toast('At least two characters are required', 'error');
            return;
        }

        var FR = window.FriendshipRules;
        var FQ = window.FriendshipQueries;
        var currentYear = _getCurrentYear();

        // Filter valid pairs (not already friends, not self)
        var validPairs = [];
        var existingPairs = [];
        for (var i = 0; i < characters.length; i++) {
            for (var j = i + 1; j < characters.length; j++) {
                var a = characters[i];
                var b = characters[j];
                if (a.id === b.id) continue;
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
            listHtml += '<div style="padding:6px 0;border-bottom:1px solid var(--border2);">' +
                '<strong>' + _escape(c.name) + ' ' + _escape(c.surname || '') + '</strong>' +
                ' <span style="color:var(--dim);font-size:0.6rem;">' + _age(c) + 'y</span>' +
            '</div>';
        }

        var existingHtml = existingPairs.length > 0
            ? '<div style="background:rgba(200,112,64,0.15);border:1px solid var(--warn);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                warningIcon + ' ' + existingPairs.length + ' pair(s) already friends (will be skipped)' +
              '</div>'
            : '';

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<div style="font-weight:bold;color:var(--accent);margin-bottom:8px;">Selected (' + characters.length + '):</div>' +
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
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="fndNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>';

        _openModal({
            title: infoIcon + ' Create Friendships',
            content: html,
            confirmText: checkIcon + ' Create ' + validPairs.length,
            cancelText: 'Cancel',
            onConfirm: function() {
                var year = parseInt(document.getElementById('fndStartYear').value, 10);
                var notes = document.getElementById('fndNotes').value || '';
                if (isNaN(year)) {
                    _toast('Invalid year', 'error');
                    return;
                }

                var ids = characters.map(function(c) { return c.id; });
                var result = window.FriendshipCommands.createMutualFriendships(ids, {
                    startYear: year,
                    notes: notes,
                    strength: FR.STRENGTH_DEFAULT
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

        var rel = window.FriendshipQueries.getFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No friendship found', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var meta = rel.metadata || {};
        var strength = (typeof meta.strength === 'number') ? meta.strength : null;
        var color = _strengthColor(strength);
        var status = rel.status;
        var statusLabel = (status === 'ongoing') ? 'Active' : 'Ended';
        var notes = meta.notes || '';

        var infoIcon = _icon('CIRCLE_DOT');
        var friendshipIcon = _icon('FRIENDSHIP');

        var strengthHtml = '';
        if (typeof strength === 'number') {
            strengthHtml = '' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Strength</label>' +
                    '<div style="background:var(--bg3);border-radius:4px;height:8px;">' +
                        '<div style="background:' + color + ';height:100%;width:' + strength + '%;border-radius:4px;"></div>' +
                    '</div>' +
                    '<div style="font-size:0.65rem;color:' + color + ';margin-top:4px;">' + strength + '%</div>' +
                '</div>';
        }

        var duration = (typeof rel.startYear === 'number')
            ? (currentYear - rel.startYear)
            : null;

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;">' +
                '<div style="font-size:1.5rem;">' + friendshipIcon + '</div>' +
                '<div style="margin-top:8px;">' +
                    '<strong>' + _escape(a.name) + ' ' + _escape(a.surname || '') + '</strong>' +
                    ' <span style="color:var(--dim);">' + infoIcon + '</span> ' +
                    '<strong>' + _escape(b.name) + ' ' + _escape(b.surname || '') + '</strong>' +
                '</div>' +
                '<div style="margin-top:6px;font-size:0.6rem;color:var(--dim);">' +
                    statusLabel +
                    (rel.startYear ? ' · since ' + rel.startYear : '') +
                    (duration !== null ? ' (' + duration + ' years)' : '') +
                '</div>' +
            '</div>' +

            strengthHtml +

            (notes ? '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;font-size:0.65rem;">' +
                    _escape(notes) +
                '</div>' +
            '</div>' : '');

        _openModal({
            title: friendshipIcon + ' Friendship Details',
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onEdit === 'function') onEdit();
            }
        });
    }

    // -------------------------------------------------------------------------
    // EDIT FRIENDSHIP (strength, notes, status)
    // -------------------------------------------------------------------------

    function openEditFriendshipModal(aId, bId, onSuccess) {
        var a = _getCharacter(aId);
        var b = _getCharacter(bId);
        if (!a || !b) {
            _toast('Character not found', 'error');
            return;
        }

        var rel = window.FriendshipQueries.getFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No friendship found', 'error');
            return;
        }

        var meta = rel.metadata || {};
        var strength = (typeof meta.strength === 'number') ? meta.strength : 50;
        var notes = meta.notes || '';
        var currentYear = _getCurrentYear();
        var startYear = (typeof rel.startYear === 'number') ? rel.startYear : currentYear;

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var crossIcon = _icon('X_HEAVY');
        var editIcon = _icon('EDIT');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<strong>' + _escape(a.name) + ' ' + _escape(a.surname || '') + '</strong> ' + infoIcon + ' ' +
                '<strong>' + _escape(b.name) + ' ' + _escape(b.surname || '') + '</strong>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="fndEditYear" value="' + startYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Strength</label>' +
                '<input type="range" id="fndEditStrength" min="0" max="100" value="' + strength + '" style="width:100%;">' +
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

            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">' +
                '<button id="fndEndBtn" type="button" ' +
                    'style="background:#8a3020;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.65rem;">' +
                    crossIcon + ' End Friendship' +
                '</button>' +
            '</div>';

        _openModal({
            title: editIcon + ' Edit Friendship',
            content: html,
            confirmText: checkIcon + ' Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var year = parseInt(document.getElementById('fndEditYear').value, 10);
                var newStrength = parseInt(document.getElementById('fndEditStrength').value, 10);
                var newNotes = document.getElementById('fndEditNotes').value || '';
                if (isNaN(year) || isNaN(newStrength)) {
                    _toast('Invalid input', 'error');
                    return;
                }

                // Update metadata directly via RelationshipCommands
                var result = window.RelationshipCommands.update(rel.id, {
                    startYear: year,
                    metadata: {
                        strength: window.FriendshipRules.clampStrength(newStrength),
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

        var FR = window.FriendshipRules;
        var currentYear = _getCurrentYear();
        var rel = window.FriendshipQueries.getFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No friendship found', 'error');
            return;
        }

        var reasons = FR.END_REASONS;
        var reasonLabels = {
            drifted_apart: 'Drifted Apart',
            betrayal: 'Betrayal',
            argument: 'Major Argument',
            jealousy: 'Jealousy',
            distance: 'Distance',
            different_paths: 'Different Paths',
            romance: 'Became Romantic',
            rivalry: 'Became Rivals',
            mutual: 'Mutual Agreement',
            unknown: 'Other / Unknown'
        };

        var reasonOptions = '';
        for (var key in reasons) {
            if (!Object.prototype.hasOwnProperty.call(reasons, key)) continue;
            var id = reasons[key];
            reasonOptions += '<option value="' + id + '">' + _escape(reasonLabels[id] || id) + '</option>';
        }

        var warningIcon = _icon('WARNING');
        var crossIcon = _icon('X_HEAVY');
        var infoIcon = _icon('CIRCLE_DOT');

        var html = '' +
            '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin-bottom:16px;">' +
                '<strong>' + _escape(a.name) + '</strong> ' + infoIcon + ' <strong>' + _escape(b.name) + '</strong>' +
                (rel.startYear ? '<div style="font-size:0.6rem;color:var(--dim);">Friends since ' + rel.startYear + '</div>' : '') +
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
            title: crossIcon + ' End Friendship',
            content: html,
            confirmText: crossIcon + ' Confirm End',
            cancelText: 'Cancel',
            onConfirm: function() {
                var year = parseInt(document.getElementById('fndEndYear').value, 10);
                var reason = document.getElementById('fndEndReason').value;
                if (isNaN(year)) {
                    _toast('Invalid year', 'error');
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

    window.openFriendshipModal = openFriendshipModal;
    window.openViewFriendshipModal = openViewFriendshipModal;
    window.openEditFriendshipModal = openEditFriendshipModal;
    window.openBreakupFriendshipModal = openBreakupFriendshipModal;

})();
