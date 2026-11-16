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
 *   modals-core.js accepts titleHtml / confirmText / cancelText.
 *   Those fields are inserted as HTML (via innerHTML), not text.
 *   An SVG icon may be prepended directly. Only the plain-text
 *   portion of the string may be escaped.
 *
 *   The prior revision escaped the WHOLE string (icon + text) with
 *   _escape(...). escapeHtml turns '<svg>' into '&lt;svg&gt;', and
 *   modals-core then inserts the string into innerHTML, which the
 *   browser renders as literal text — the raw SVG markup showed up
 *   in the title bar and on the confirm button. See the screenshot
 *   in the bug report.
 *
 *   The current revision prepends the icon raw and escapes only the
 *   text:
 *
 *       titleHtml: icon + ' ' + _escape('Create Friendships')
 *
 *   This matches how the modal body already handles icons (see the
 *   listHtml / existingHtml blocks in openFriendshipModal: they
 *   interpolate infoIcon / warningIcon directly into the innerHTML
 *   string, without escaping), and how modals-relationship.js now
 *   builds its title.
 *
 * VIEW → EDIT HANDOFF
 *
 *   openViewFriendshipModal's confirm button ("Edit") closes the view
 *   and opens the edit modal. modals-core.js fires onConfirm BEFORE
 *   _closeAsConfirmed() (see its callback contract). The prior
 *   revision worked around this by calling _closeModal() manually
 *   and opening the edit modal synchronously; that relied on
 *   _teardownStackEntry being idempotent to absorb the core's
 *   follow-up close. The current revision follows the framework
 *   contract — onConfirm returns true and the framework closes —
 *   and schedules the edit modal from a setTimeout(0) so it opens
 *   AFTER the view's teardown has completed.
 *
 *   The module's MODAL LIFECYCLE rule forbids setTimeout for HANDLER
 *   BINDING ON MOUNT (which would race the modal's own DOM
 *   insertion). It does not forbid setTimeout for SEQUENCING A
 *   POST-CLOSE FOLLOW-UP; there is no DOM to race, because the view
 *   modal is already gone by the time the timer fires.
 *
 * CREATE COUNT vs BUTTON LABEL
 *
 *   openFriendshipModal computes validPairs at open time and labels
 *   the confirm button "Create N" from validPairs.length. It then
 *   passes ALL selected ids to FriendshipCommands.createMutualFriendships,
 *   which is responsible for skipping pairs that are already friends
 *   (including any that became friends between open and confirm).
 *   The success toast reports result.createdCount, the command's
 *   authoritative post-skip count. Re-reading state inside the modal
 *   to keep the label in sync would violate the module's "UI only,
 *   no direct state access" contract, so the two counts are allowed
 *   to differ; the toast is the truth.
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
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
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
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
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
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('modals-friendship.js: getCurrentYear required');
        }
        return window.getCurrentYear();
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

    /**
     * Returns the tier label for a strength value.
     *
     * The friendship record does not carry a precomputed `tier` field
     * (the previous revision read rel.tier, which always rendered as
     * "unknown"). The canonical derivation is
     * FriendshipRules.strengthTier(strength).
     */
    function _strengthTier(strength) {
        if (typeof strength !== 'number') return 'unknown';
        if (typeof FR.strengthTier !== 'function') return 'unknown';
        return FR.strengthTier(strength) || 'unknown';
    }

    /**
     * Dispatches an update to a friendship record.
     *
     * Preferred surface: FriendshipCommands.updateFriendship, when
     * present. That surface validates strength against
     * FriendshipRules.isValidStrength and clamps via clampStrength
     * before delegating to RelationshipCommands.update.
     *
     * Fallback: RelationshipCommands.update, the structural primitive.
     * Used only when the FriendshipCommands method has not landed yet
     * in this build. The fallback still clamps strength (the caller
     * already did) but skips the domain-level validation. When the
     * command lands, delete the fallback branch; no call site changes.
     *
     * The bootstrap does not list updateFriendship under
     * REQUIRED_METHODS.FriendshipCommands, so its absence is not a
     * load-time failure.
     */
    function _updateFriendshipRecord(relationshipId, patch, aId, bId) {
        if (window.FriendshipCommands &&
            typeof window.FriendshipCommands.updateFriendship === 'function') {
            return window.FriendshipCommands.updateFriendship(aId, bId, patch);
        }
        if (!window.RelationshipCommands ||
            typeof window.RelationshipCommands.update !== 'function') {
            return {
                success: false,
                code: 'NO_COMMAND',
                message: 'No command available to update friendship'
            };
        }
        return window.RelationshipCommands.update(relationshipId, patch);
    }

    // -------------------------------------------------------------------------
    // BULK FRIENDSHIP CREATION
    // -------------------------------------------------------------------------

    function openFriendshipModal(characters, onSuccess) {
        if (!Array.isArray(characters) || characters.length < 2) {
            _toast('At least two characters are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();

        // Partition pairs. The command re-checks areFriends at create
        // time (see CREATE COUNT vs BUTTON LABEL in the header), so
        // the label built from validPairs.length is allowed to differ
        // from result.createdCount; the toast is authoritative.
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
            // Icon (SVG) is raw. Text portion is escaped. modals-core
            // inserts titleHtml as innerHTML, not textContent. See
            // TITLE / CONFIRM HTML CONTRACT in the module header.
            titleHtml: (infoIcon ? infoIcon + ' ' : '') + _escape('Create Friendships'),
            contentHtml: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + _escape('Create ' + validPairs.length),
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var slider = modalEl.querySelector('#fndStartStrength');
                var display = modalEl.querySelector('#fndStartStrengthDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function() {
                        display.textContent = slider.value + '%';
                    });
                }
            },
            onConfirm: function(modalEl) {
                var yearEl = modalEl.querySelector('#fndStartYear');
                var strengthEl = modalEl.querySelector('#fndStartStrength');
                var notesEl = modalEl.querySelector('#fndNotes');

                if (!yearEl || !strengthEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var year = parseInt(yearEl.value, 10);
                var strength = parseInt(strengthEl.value, 10);
                var notes = notesEl ? (notesEl.value || '') : '';

                if (isNaN(year)) {
                    _toast('Invalid start year', 'error');
                    return false;
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
                    return false;
                }

                // result.createdCount is the command's authoritative
                // post-skip count. It may be less than validPairs.length
                // if a pair became friends between open and confirm;
                // the toast is the truth. See CREATE COUNT vs BUTTON
                // LABEL in the module header.
                _toast(result.createdCount + ' friendship(s) created', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                // Framework closes on any non-false return.
                return true;
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

        var rel = FQ.getActiveFriendshipBetween(aId, bId);
        if (!rel) {
            _toast('No active friendship found', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var strength = rel.strength;
        var color = _strengthColor(strength);
        var tierLabel = _strengthTier(strength);
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
                        _escape(tierLabel) + '</div>' +
                '</div>';
        }

        var events = FQ.getFriendshipEvents(rel.relationshipId);
        var eventsHtml = '';
        if (events.length > 0) {
            eventsHtml = '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                    'Recent Events</label>' +
                '<div style="max-height:160px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:6px;">';
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
            titleHtml: (friendshipIcon ? friendshipIcon + ' ' : '') + _escape('Friendship Details'),
            contentHtml: html,
            confirmText: 'Edit',
            cancelText: 'Close',
            onConfirm: function() {
                // Framework contract: return true → framework closes.
                // The edit modal must open AFTER the view's teardown
                // (otherwise the new modal sits behind the still-mounted
                // view and the escape handler binds to the wrong stack
                // entry). See VIEW → EDIT HANDOFF in the header: the
                // module forbids setTimeout for handler binding on
                // mount, not for sequencing a post-close follow-up.
                setTimeout(function() {
                    if (typeof onEdit === 'function') onEdit();
                    else openEditFriendshipModal(aId, bId);
                }, 0);
                return true;
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
            titleHtml: (editIcon ? editIcon + ' ' : '') + _escape('Edit Friendship'),
            contentHtml: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + _escape('Save'),
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var slider = modalEl.querySelector('#fndEditStrength');
                var display = modalEl.querySelector('#fndStrengthDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function() {
                        display.textContent = slider.value + '%';
                    });
                }
                var endBtn = modalEl.querySelector('#fndEndBtn');
                if (endBtn) {
                    endBtn.addEventListener('click', function() {
                        // Close the edit modal, then open breakup. Same
                        // post-close sequencing as VIEW → EDIT HANDOFF
                        // in the header — setTimeout for sequencing,
                        // not for handler binding.
                        _closeModal();
                        setTimeout(function() {
                            openBreakupFriendshipModal(aId, bId, onSuccess);
                        }, 0);
                    });
                }
            },
            onConfirm: function(modalEl) {
                var strengthEl = modalEl.querySelector('#fndEditStrength');
                var notesEl = modalEl.querySelector('#fndEditNotes');
                var yearEl = modalEl.querySelector('#fndEditYear');

                if (!strengthEl || !notesEl || !yearEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var newStrength = parseInt(strengthEl.value, 10);
                var newNotes = notesEl.value || '';
                var newYear = parseInt(yearEl.value, 10);

                if (isNaN(newStrength) || isNaN(newYear)) {
                    _toast('Invalid input', 'error');
                    return false;
                }

                // _updateFriendshipRecord prefers FriendshipCommands.updateFriendship
                // (domain-validated) and falls back to RelationshipCommands.update
                // (structural) when the command is not present in this build.
                // See the helper's docblock.
                var patch = {
                    startYear: newYear,
                    metadata: {
                        strength: FR.clampStrength(newStrength),
                        notes: newNotes
                    }
                };
                var result = _updateFriendshipRecord(
                    rel.relationshipId, patch, aId, bId
                );

                if (!result.success) {
                    _toast(result.message || 'Failed to update', 'error');
                    return false;
                }

                _toast('Friendship updated', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                return true;
            }
        });
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
            titleHtml: (crossIcon ? crossIcon + ' ' : '') + _escape('End Friendship'),
            contentHtml: html,
            confirmText: (crossIcon ? crossIcon + ' ' : '') + _escape('Confirm End'),
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var yearEl = modalEl.querySelector('#fndEndYear');
                var reasonEl = modalEl.querySelector('#fndEndReason');

                if (!yearEl || !reasonEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var year = parseInt(yearEl.value, 10);
                var reason = reasonEl.value;

                if (isNaN(year)) {
                    _toast('Invalid end year', 'error');
                    return false;
                }

                var result = window.FriendshipCommands.removeFriendship(aId, bId, {
                    endYear: year,
                    reason: reason
                });

                if (!result.success) {
                    _toast(result.message || 'Failed to end friendship', 'error');
                    return false;
                }

                _toast('Friendship ended', 'info');
                if (typeof onSuccess === 'function') onSuccess(result);
                return true;
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
