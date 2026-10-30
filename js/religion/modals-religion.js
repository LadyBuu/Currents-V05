/**
 * =============================================================================
 * STILL WATERS - RELIGION MODALS (modals-religion.js)
 * =============================================================================
 *
 * LOCATION: js/religion/modals-religion.js
 *
 * Modal UI for religion operations:
 *   - Create Religion
 *   - Edit Religion
 *   - Delete Religion
 *   - Deprecate Religion
 *   - Religion Details
 *   - Set Leader
 *   - End Leader Term
 *   - Add God
 *   - Add Law
 *   - Create Place of Worship
 *   - Assign Character Religion
 *
 * PERSISTENCE
 * -----------
 * Commands do not save (see religion-commands.js). The modal is the save
 * owner. After every successful command, call ReligionCommands.persist()
 * exactly once. A failed persist is a toast, not a thrown error — the
 * canonical data is already updated and in-memory state is consistent.
 *
 * MODAL CONTRACT
 * --------------
 *   window.openModal(options)  -> { element, close }
 *   window.closeTopModal()
 *   window.showToast(message, type)
 *   window.escapeHtml(str)
 *   window.getIcon(name)
 *
 *   Accepted option keys: titleHtml, contentHtml, confirmText,
 *   cancelText, size, onMount, onConfirm, onCancel.
 *
 *   `onConfirm(root)` returning truthy closes the modal (confirmed).
 *   Returning `false` keeps the modal open. Every non-confirmed close
 *   path (Cancel button, Escape, overlay, close X) fires `onCancel`
 *   exactly once.
 *
 * ONCONFIRM / ONCANCEL CONTRACT
 * -----------------------------
 *   The modal's onConfirm handlers RETURN the result of
 *   _handleCommandResult. That helper returns `true` on success (the
 *   modal closes with a confirmed outcome, onCancel does NOT fire) and
 *   `false` on failure (the modal stays open, the failure toast is
 *   already shown, onCancel does NOT fire either).
 *
 *   Prior revisions did NOT return a value from onConfirm. Every
 *   success path called _closeTopModal() internally AND returned
 *   undefined, which modals-core.js interpreted as "confirmed close"
 *   and closed again. The second close was a no-op for the modal stack
 *   but did fire the modal-level onCancel through _finishClose.
 *   Currently no religion modal passes onCancel, so the spurious fire
 *   had no effect. Adding an onCancel handler to any modal would have
 *   made every successful command fire the caller's cancel callback.
 *   Fixed by returning the boolean and not calling closeTopModal()
 *   directly.
 *
 * CALLBACK ORDERING
 * -----------------
 *   On success, _handleCommandResult fires the caller's onSuccess
 *   BEFORE the modal closes. The ordering is:
 *
 *     1. toast(successMessage, 'success')
 *     2. ReligionCommands.persist()
 *        (failure → second toast; caller's onSuccess still runs;
 *         the modal still closes — the operation succeeded in memory)
 *     3. onSuccess(result.data || result)    ← modal still open
 *     4. return true                         ← modals-core closes
 *
 *   onSuccess-before-close lets a caller that reopens another modal
 *   from onSuccess (details → edit, details → set leader) do so without
 *   the modal stack flashing empty. The close still happens after
 *   onSuccess returns, so callers that do not reopen see the normal
 *   confirmed-close behavior.
 *
 *   onSuccess exceptions are caught and logged. A throwing onSuccess
 *   cannot prevent the modal from closing.
 *
 * TIME CONTRACT
 * -------------
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   "safe" alias is NOT used.
 *
 * DEFERRALS
 * ---------
 *   - Inline styles remain. Layout rewrite is a design task, deferred.
 *   - The details modal uses setTimeout(100) between close and open to
 *     avoid a z-index/transition race. Documented as deferral. Callers
 *     that reopen via onSuccess do not need the timeout; the timeout is
 *     only used by the details modal's button handlers that
 *     close-then-open in a single click.
 *
 * DEPENDENCIES:
 *   - modals-core.js: openModal, closeTopModal
 *   - ui.js: showToast
 *   - formatting.js: escapeHtml
 *   - icons.js: getIcon
 *   - modals-char-select.js: openCharacterSelector
 *   - religion-state.js: ReligionState
 *   - religion-commands.js: ReligionCommands (including persist)
 *   - religion-queries.js: ReligionQueries
 *   - religion-format.js: ReligionFormat
 *   - religion-constants.js: ReligionConstants
 *   - locationDropdown.js: getFilteredLocationOptions
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById,
 *                   getPlaces, getCharacterFullNameById, getPlaceName
 *   - time.js: getCurrentYear
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - onConfirm handlers in every write modal now RETURN the result of
 *       _handleCommandResult (true on success, false on failure).
 *       _closeTopModal() is no longer called from within
 *       _handleCommandResult; modals-core.js closes the modal because
 *       onConfirm returned truthy. This eliminates the double-close and
 *       the latent onCancel-spurious-fire hazard. See
 *       ONCONFIRM / ONCANCEL CONTRACT in the header.
 *     - _handleCommandResult signature is unchanged (result,
 *       successMessage, failurePrefix, onSuccess) → boolean. Its success
 *       path no longer calls _closeTopModal(); it returns true. Its
 *       failure path returns false.
 *     - Details modal button handlers that close-then-open another
 *       modal still use _closeTopModal() + setTimeout(100). That is the
 *       documented deferral for the navigation buttons, not the
 *       command-result path.
 *     - No behavioral change to any modal's rendered output, callback
 *       ordering on success, or failure messaging.
 *   Previous revisions:
 *     - onSuccess-before-close ordering; onSuccess exceptions caught.
 *     - Header CALLBACK ORDERING section added.
 *     - Phase 0-7: incremental (see religion-docs.txt history).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        return window.openModal(options);
    }

    function _closeTopModal() {
        window.closeTopModal();
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'modals-religion.js requires formatting.js (escapeHtml).'
            );
        }
        return window.escapeHtml(str);
    }

    function _showToast(message, type) {
        window.showToast(message, type);
    }

    function _getIcon(name) {
        return window.getIcon(name);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'modals-religion.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _resolveParsedYear(inputValue) {
        var parsed = parseInt(inputValue, 10);
        if (Number.isNaN(parsed)) {
            return _getCurrentYear();
        }
        return parsed;
    }

    function _getCharacterById(id) {
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        return window.getCharacters();
    }

    function _getPlaceById(id) {
        return window.getPlaceById(id);
    }

    function _getPlaces() {
        return window.getPlaces();
    }

    function _getAllReligions(options) {
        return window.ReligionQueries.getAllReligions(options);
    }

    function _getReligion(id) {
        return window.ReligionQueries.getReligion(id);
    }

    function _getFollowerCount(id) {
        return window.ReligionQueries.getFollowerCount(id);
    }

    function _getGodsByReligion(id) {
        return window.ReligionQueries.getGodsByReligion(id);
    }

    function _getLawsByReligion(id) {
        return window.ReligionQueries.getLawsByReligion(id);
    }

    function _getPlacesOfWorshipByReligion(id) {
        return window.ReligionQueries.getPlacesOfWorshipByReligion(id);
    }

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        var char = _getCharacterById(id);
        if (char) {
            return char.name + (char.surname ? ' ' + char.surname : '');
        }
        return 'Unknown';
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        var place = _getPlaceById(id);
        if (place) return place.displayName;
        return 'Unknown';
    }

    function _getLocationOptions(selectedId) {
        return window.getFilteredLocationOptions(selectedId);
    }

    // =========================================================================
    // 2. VOCABULARY RESOLUTION
    // =========================================================================

    function _getReligiousTraits() {
        return Object.values(window.ReligionConstants.RELIGIOUS_TRAITS);
    }

    function _getReligiousTraitName(trait) {
        return window.ReligionFormat.getReligiousTraitName(trait);
    }

    function _getInheritanceRules() {
        return window.ReligionConstants.INHERITANCE_RULES;
    }

    function _getInheritanceRuleName(rule) {
        return window.ReligionFormat.getInheritanceRuleName(rule);
    }

    function _getConversionReasons() {
        return window.ReligionConstants.CONVERSION_REASONS;
    }

    function _getConversionReasonName(reason) {
        return window.ReligionFormat.getConversionReasonName(reason);
    }

    function _getLawTypeName(id) {
        return window.ReligionFormat.getLawTypeName(id);
    }

    function _getLawCategoryName(id) {
        return window.ReligionFormat.getLawCategoryName(id);
    }

    function _getLawDomainName(id) {
        return window.ReligionFormat.getLawDomainName(id);
    }

    function _getLawSeverityName(id) {
        return window.ReligionFormat.getLawSeverityName(id);
    }

    function _getWorshipTypeName(id) {
        return window.ReligionFormat.getWorshipTypeName(id);
    }

    function _openCharacterSelector(options) {
        return window.openCharacterSelector(options);
    }

    // =========================================================================
    // 3. RESULT HANDLING
    // =========================================================================
    //
    // Returns `true` on success (modal closes with confirmed outcome,
    // onCancel does NOT fire), `false` on failure (modal stays open,
    // onCancel does NOT fire).
    //
    // Does NOT call closeTopModal() directly. modals-core.js closes the
    // modal because onConfirm returned truthy. See ONCONFIRM / ONCANCEL
    // CONTRACT in the header.
    //
    // Fires onSuccess BEFORE returning. That keeps the modal open during
    // the callback (needed for chained navigation) while still letting
    // modals-core.js perform the close after the return value.

    function _handleCommandResult(result, successMessage, failurePrefix, onSuccess) {
        if (result && result.success) {
            _showToast(successMessage, 'success');

            var saveResult = window.ReligionCommands.persist();
            if (saveResult && saveResult.success === false) {
                _showToast(
                    'Save failed: ' + (saveResult.reason || 'unknown error'),
                    'error'
                );
            }

            if (typeof onSuccess === 'function') {
                try {
                    onSuccess(result.data || result);
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'modals-religion.js: onSuccess threw:', e
                        );
                    }
                }
            }

            return true;
        }

        var reason = (result && result.reason) ? result.reason : 'Unknown error';
        _showToast(failurePrefix + ': ' + reason, 'error');
        return false;
    }

    // =========================================================================
    // 4. CREATE RELIGION MODAL
    // =========================================================================

    function openCreateReligionModal(options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var traits = _getReligiousTraits();
        var traitOptions = '';
        for (var i = 0; i < traits.length; i++) {
            traitOptions += '<option value="' + traits[i] + '">' + _escapeHtml(_getReligiousTraitName(traits[i])) + '</option>';
        }

        var inheritanceRules = _getInheritanceRules();
        var inheritanceOptions = '';
        for (var key in inheritanceRules) {
            if (inheritanceRules.hasOwnProperty(key)) {
                var value = inheritanceRules[key];
                inheritanceOptions += '<option value="' + value + '">' + _escapeHtml(_getInheritanceRuleName(value)) + '</option>';
            }
        }

        var content =
            '<div class="religion-form" style="display:flex;flex-direction:column;gap:12px;">' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Religion Name *</label>' +
            '<input type="text" id="religionName" placeholder="e.g., The Old Gods" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Display Name</label>' +
            '<input type="text" id="religionDisplayName" placeholder="e.g., The Old Gods of the North" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description (Lore)</label>' +
            '<textarea id="religionDescription" rows="3" placeholder="Describe the religion\'s beliefs, origins, and practices..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;resize:vertical;"></textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Trait</label>' +
            '<select id="religionTrait" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            traitOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Inheritance Rule</label>' +
            '<select id="religionInheritance" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            inheritanceOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Icon</label>' +
            '<input type="text" id="religionIcon" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionOrganized" style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Organized Religion (has hierarchy/clergy)</label>' +
            '</div>' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionAllowsConversion" checked style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Allows Conversion</label>' +
            '</div>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionProselytizes" style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Proselytizes (actively seeks converts)</label>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="religionNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +

            '</div>';

        var modal = _openModal({
            titleHtml: 'Create New Religion',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#religionName').value.trim();
                if (!name) {
                    _showToast('Religion name is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    displayName: root.querySelector('#religionDisplayName').value.trim() || name,
                    description: root.querySelector('#religionDescription').value.trim(),
                    trait: root.querySelector('#religionTrait').value,
                    icon: root.querySelector('#religionIcon').value.trim(),
                    isOrganized: root.querySelector('#religionOrganized').checked,
                    allowsConversion: root.querySelector('#religionAllowsConversion').checked,
                    proselytizes: root.querySelector('#religionProselytizes').checked,
                    inheritanceRule: {
                        type: root.querySelector('#religionInheritance').value
                    },
                    notes: root.querySelector('#religionNotes').value.trim()
                };

                var result = window.ReligionCommands.createReligion(data);
                return _handleCommandResult(
                    result,
                    'Religion created: ' + (result && result.data ? result.data.name : name),
                    'Failed to create religion',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 5. EDIT RELIGION MODAL
    // =========================================================================

    function openEditReligionModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var traits = _getReligiousTraits();
        var traitOptions = '';
        for (var i = 0; i < traits.length; i++) {
            var selected = (religion.trait === traits[i]) ? 'selected' : '';
            traitOptions += '<option value="' + traits[i] + '" ' + selected + '>' + _escapeHtml(_getReligiousTraitName(traits[i])) + '</option>';
        }

        var inheritanceRules = _getInheritanceRules();
        var inheritanceOptions = '';
        var currentRule = religion.inheritanceRule ? religion.inheritanceRule.type : 'mother';
        for (var key in inheritanceRules) {
            if (inheritanceRules.hasOwnProperty(key)) {
                var value = inheritanceRules[key];
                var selected = (currentRule === value) ? 'selected' : '';
                inheritanceOptions += '<option value="' + value + '" ' + selected + '>' + _escapeHtml(_getInheritanceRuleName(value)) + '</option>';
            }
        }

        var isDeprecated = religion.isDeprecated || false;

        var content =
            '<div class="religion-form" style="display:flex;flex-direction:column;gap:12px;">' +

            (isDeprecated ? '<div style="padding:8px 12px;background:rgba(181,74,74,0.1);border:1px solid #b54a4a;border-radius:4px;font-size:0.65rem;color:#b54a4a;">This religion is deprecated. Edit is limited.</div>' : '') +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Religion Name *</label>' +
            '<input type="text" id="religionName" value="' + _escapeHtml(religion.name) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Display Name</label>' +
            '<input type="text" id="religionDisplayName" value="' + _escapeHtml(religion.displayName || religion.name) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description (Lore)</label>' +
            '<textarea id="religionDescription" rows="3" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;resize:vertical;">' + _escapeHtml(religion.description || '') + '</textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Trait</label>' +
            '<select id="religionTrait" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            traitOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Inheritance Rule</label>' +
            '<select id="religionInheritance" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            inheritanceOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Icon</label>' +
            '<input type="text" id="religionIcon" value="' + _escapeHtml(religion.icon || '') + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionOrganized" ' + (religion.isOrganized ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Organized Religion</label>' +
            '</div>' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionAllowsConversion" ' + (religion.allowsConversion ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Allows Conversion</label>' +
            '</div>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="religionProselytizes" ' + (religion.proselytizes ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Proselytizes</label>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="religionNotes" value="' + _escapeHtml(religion.notes || '') + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +

            '</div>';

        var modal = _openModal({
            titleHtml: 'Edit Religion: ' + _escapeHtml(religion.name),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#religionName').value.trim();
                if (!name) {
                    _showToast('Religion name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    displayName: root.querySelector('#religionDisplayName').value.trim() || name,
                    description: root.querySelector('#religionDescription').value.trim(),
                    trait: root.querySelector('#religionTrait').value,
                    icon: root.querySelector('#religionIcon').value.trim(),
                    isOrganized: root.querySelector('#religionOrganized').checked,
                    allowsConversion: root.querySelector('#religionAllowsConversion').checked,
                    proselytizes: root.querySelector('#religionProselytizes').checked,
                    inheritanceRule: {
                        type: root.querySelector('#religionInheritance').value
                    },
                    notes: root.querySelector('#religionNotes').value.trim()
                };

                var result = window.ReligionCommands.updateReligion(religionId, updates);
                return _handleCommandResult(
                    result,
                    'Religion updated',
                    'Failed to update religion',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 6. DELETE RELIGION MODAL
    // =========================================================================

    function openDeleteReligionModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var followerCount = _getFollowerCount(religionId);

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.75rem;">Are you sure you want to delete <strong>' + _escapeHtml(religion.name) + '</strong>?</p>';

        if (followerCount > 0) {
            content +=
                '<div style="padding:8px 12px;background:rgba(181,74,74,0.1);border:1px solid #b54a4a;border-radius:4px;font-size:0.65rem;color:#b54a4a;">' +
                'This religion has ' + followerCount + ' followers. It cannot be deleted while it has followers. Consider deprecating it instead.' +
                '</div>';
        } else {
            content +=
                '<p style="font-size:0.65rem;color:var(--dim);">This action cannot be undone. All gods, laws, and places of worship associated with this religion will also be removed.</p>';
        }

        content += '</div>';

        var modal = _openModal({
            titleHtml: 'Delete Religion',
            contentHtml: content,
            confirmText: followerCount > 0 ? 'Cannot Delete' : 'Delete',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                if (followerCount > 0) {
                    _showToast('Cannot delete religion with followers. Deprecate it instead.', 'error');
                    return false;
                }

                var result = window.ReligionCommands.deleteReligion(religionId);
                return _handleCommandResult(
                    result,
                    'Religion deleted: ' + religion.name,
                    'Failed to delete religion',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 7. DEPRECATE RELIGION MODAL
    // =========================================================================

    function openDeprecateReligionModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        if (religion.isDeprecated) {
            _showToast('Religion is already deprecated', 'info');
            return null;
        }

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.75rem;">Deprecate <strong>' + _escapeHtml(religion.name) + '</strong>?</p>' +
            '<p style="font-size:0.65rem;color:var(--dim);">Deprecating a religion marks it as no longer active. Existing followers will keep it, but new followers cannot be assigned.</p>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Year of Deprecation</label>' +
            '<input type="number" id="deprecateYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Deprecate Religion',
            contentHtml: content,
            confirmText: 'Deprecate',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var year = _resolveParsedYear(root.querySelector('#deprecateYear').value);

                var result = window.ReligionCommands.deprecateReligion(religionId, year);
                return _handleCommandResult(
                    result,
                    'Religion deprecated',
                    'Failed to deprecate religion',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 8. RELIGION DETAILS MODAL
    // =========================================================================

    function openReligionDetailsModal(religionId, options) {
        options = options || {};
        var onRefresh = options.onRefresh || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var followerCount = _getFollowerCount(religionId);
        var gods = _getGodsByReligion(religionId);
        var laws = _getLawsByReligion(religionId);
        var places = _getPlacesOfWorshipByReligion(religionId);
        var traitName = _getReligiousTraitName(religion.trait);
        var inheritanceName = _getInheritanceRuleName(religion.inheritanceRule ? religion.inheritanceRule.type : 'mother');

        var leaderName = religion.leader ? _getCharacterName(religion.leader.characterId) : 'None';
        var leaderTitle = religion.leader ? religion.leader.title : '';

        var locationNames = [];
        if (religion.locations) {
            for (var i = 0; i < religion.locations.length; i++) {
                locationNames.push(_getPlaceName(religion.locations[i]));
            }
        }

        var isDeprecated = religion.isDeprecated || false;

        var iconDisplay = religion.icon || '';

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +

            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
            (iconDisplay ? '<span style="font-size:1.5rem;">' + _escapeHtml(iconDisplay) + '</span>' : '') +
            '<div>' +
            '<div style="font-size:1rem;font-weight:bold;">' + _escapeHtml(religion.displayName || religion.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' + _escapeHtml(religion.name) + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;">' +
            (isDeprecated ? '<span class="religion-status religion-status--deprecated">Deprecated</span>' : '<span class="religion-status religion-status--active">Active</span>') +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;background:var(--bg);border-radius:4px;">' +
            '<div style="text-align:center;"><div style="font-size:0.55rem;color:var(--dim);">Followers</div><div style="font-size:0.9rem;font-weight:bold;">' + followerCount + '</div></div>' +
            '<div style="text-align:center;"><div style="font-size:0.55rem;color:var(--dim);">Gods</div><div style="font-size:0.9rem;font-weight:bold;">' + gods.length + '</div></div>' +
            '<div style="text-align:center;"><div style="font-size:0.55rem;color:var(--dim);">Laws</div><div style="font-size:0.9rem;font-weight:bold;">' + laws.length + '</div></div>' +
            '<div style="text-align:center;"><div style="font-size:0.55rem;color:var(--dim);">Places</div><div style="font-size:0.9rem;font-weight:bold;">' + places.length + '</div></div>' +
            '</div>' +

            (religion.description ? '<div style="font-size:0.7rem;color:var(--dim);padding:6px 0;">' + _escapeHtml(religion.description) + '</div>' : '') +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.65rem;">' +
            '<div><span style="color:var(--dim);">Trait:</span> ' + _escapeHtml(traitName) + '</div>' +
            '<div><span style="color:var(--dim);">Inheritance:</span> ' + _escapeHtml(inheritanceName) + '</div>' +
            '<div><span style="color:var(--dim);">Organized:</span> ' + (religion.isOrganized ? 'Yes' : 'No') + '</div>' +
            '<div><span style="color:var(--dim);">Allows Conversion:</span> ' + (religion.allowsConversion ? 'Yes' : 'No') + '</div>' +
            '<div><span style="color:var(--dim);">Proselytizes:</span> ' + (religion.proselytizes ? 'Yes' : 'No') + '</div>' +
            '<div><span style="color:var(--dim);">Leader:</span> ' + _escapeHtml(leaderName) + (leaderTitle ? ' (' + _escapeHtml(leaderTitle) + ')' : '') + '</div>' +
            '</div>' +

            (locationNames.length > 0 ? '<div style="font-size:0.65rem;color:var(--dim);">Locations: ' + locationNames.join(', ') + '</div>' : '') +

            '<div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px solid var(--border-light);">';

        if (!isDeprecated) {
            content +=
                '<button class="btn edit-religion-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Edit Religion</button>' +
                '<button class="btn set-leader-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Set Leader</button>' +
                '<button class="btn add-god-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Add God</button>' +
                '<button class="btn add-law-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Add Law</button>' +
                '<button class="btn create-place-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Create Place of Worship</button>';
        }

        content +=
            '<button class="btn deprecate-religion-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">' + (isDeprecated ? 'Reactivate' : 'Deprecate') + '</button>' +
            '<button class="btn delete-religion-btn" data-religion-id="' + religionId + '" style="background:var(--bg3);border:1px solid #b54a4a;color:#b54a4a;padding:4px 12px;border-radius:4px;font-size:0.6rem;cursor:pointer;">Delete</button>' +
            '</div>' +

            (gods.length > 0 ? '<div style="font-size:0.65rem;margin-top:8px;"><div style="font-weight:bold;margin-bottom:4px;">Gods:</div><ul style="margin:0;padding-left:16px;list-style:none;">' +
            gods.map(function(g) {
                var symbolPart = g.symbol ? _escapeHtml(g.symbol) + ' ' : '';
                return '<li style="padding:2px 0;">' + symbolPart + _escapeHtml(g.displayName || g.name) + ' (' + _escapeHtml(g.domain) + ')</li>';
            }).join('') +
            '</ul></div>' : '') +

            (laws.length > 0 ? '<div style="font-size:0.65rem;margin-top:8px;"><div style="font-weight:bold;margin-bottom:4px;">Laws:</div><ul style="margin:0;padding-left:16px;list-style:none;">' +
            laws.map(function(l) {
                return '<li style="padding:2px 0;">' + _escapeHtml(l.name) + ' (' + _escapeHtml(l.type) + ', ' + _escapeHtml(l.domain) + ')</li>';
            }).join('') +
            '</ul></div>' : '') +

            (religion.notes ? '<div style="font-size:0.55rem;color:var(--dim);margin-top:8px;">Notes: ' + _escapeHtml(religion.notes) + '</div>' : '') +

            '</div>';

        var modal = _openModal({
            titleHtml: 'Religion Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function(root) {
                var editBtn = root.querySelector('.edit-religion-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openEditReligionModal(id);
                        }, 100);
                    });
                }

                var leaderBtn = root.querySelector('.set-leader-btn');
                if (leaderBtn) {
                    leaderBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openSetLeaderModal(id);
                        }, 100);
                    });
                }

                var godBtn = root.querySelector('.add-god-btn');
                if (godBtn) {
                    godBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openAddGodModal(id);
                        }, 100);
                    });
                }

                var lawBtn = root.querySelector('.add-law-btn');
                if (lawBtn) {
                    lawBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openAddLawModal(id);
                        }, 100);
                    });
                }

                var placeBtn = root.querySelector('.create-place-btn');
                if (placeBtn) {
                    placeBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openCreatePlaceOfWorshipModal(id);
                        }, 100);
                    });
                }

                var deprecateBtn = root.querySelector('.deprecate-religion-btn');
                if (deprecateBtn) {
                    deprecateBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        var r = _getReligion(id);
                        _closeTopModal();
                        setTimeout(function() {
                            if (r && r.isDeprecated) {
                                var result = window.ReligionCommands.reactivateReligion(id);
                                // Note: this path runs from a button
                                // (not from onConfirm), so _handleCommandResult
                                // returns boolean but is not connected to a
                                // modal close path. The modal is already
                                // closed. The toast and persist run as
                                // normal; the boolean return is discarded.
                                _handleCommandResult(
                                    result,
                                    'Religion reactivated',
                                    'Failed to reactivate religion',
                                    function() { if (onRefresh) onRefresh(); }
                                );
                            } else {
                                openDeprecateReligionModal(id, {
                                    onSuccess: function() {
                                        if (onRefresh) onRefresh();
                                    }
                                });
                            }
                        }, 100);
                    });
                }

                var deleteBtn = root.querySelector('.delete-religion-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function() {
                        var id = this.dataset.religionId;
                        _closeTopModal();
                        setTimeout(function() {
                            openDeleteReligionModal(id, {
                                onSuccess: function() {
                                    if (onRefresh) onRefresh();
                                }
                            });
                        }, 100);
                    });
                }
            }
        });

        return modal;
    }

    // =========================================================================
    // 9. SET LEADER MODAL
    // =========================================================================

    function openSetLeaderModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var currentLeader = religion.leader;
        var currentName = currentLeader ? _getCharacterName(currentLeader.characterId) : 'None';

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Current Leader: <strong>' + _escapeHtml(currentName) + '</strong></p>' +
            '<button id="selectLeaderBtn" class="btn" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:4px;font-size:0.65rem;cursor:pointer;width:100%;">Select Character</button>' +
            '<div id="selectedLeaderDisplay" style="font-size:0.65rem;color:var(--dim);text-align:center;">No character selected</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Title</label>' +
            '<input type="text" id="leaderTitle" placeholder="e.g., High Priest, Archbishop" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Start Year</label>' +
            '<input type="number" id="leaderStartYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="leaderNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var selectedCharacterId = null;

        var modal = _openModal({
            titleHtml: 'Set Religious Leader: ' + _escapeHtml(religion.name),
            contentHtml: content,
            confirmText: 'Set Leader',
            cancelText: 'Cancel',
            onMount: function(root) {
                var selectBtn = root.querySelector('#selectLeaderBtn');
                var display = root.querySelector('#selectedLeaderDisplay');

                if (selectBtn) {
                    selectBtn.addEventListener('click', function() {
                        _openCharacterSelector({
                            title: 'Select Religious Leader',
                            preset: 'elder',
                            filters: {
                                showDeceased: false
                            },
                            onSelect: function(character) {
                                selectedCharacterId = character.id;
                                display.textContent = 'Selected: ' + character.name + (character.surname ? ' ' + character.surname : '');
                                display.style.color = 'var(--accent)';
                            }
                        });
                    });
                }
            },
            onConfirm: function(root) {
                if (!selectedCharacterId) {
                    _showToast('Please select a character', 'error');
                    return false;
                }

                var title = root.querySelector('#leaderTitle').value.trim() || 'Religious Leader';
                var startYear = _resolveParsedYear(root.querySelector('#leaderStartYear').value);
                var notes = root.querySelector('#leaderNotes').value.trim();

                var result = window.ReligionCommands.setReligionLeader(
                    religionId,
                    selectedCharacterId,
                    {
                        title: title,
                        startYear: startYear,
                        notes: notes
                    }
                );
                return _handleCommandResult(
                    result,
                    'Religious leader appointed: ' + _getCharacterName(selectedCharacterId),
                    'Failed to set leader',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 10. END LEADER TERM MODAL
    // =========================================================================

    function openEndLeaderTermModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        if (!religion.leader) {
            _showToast('No leader to end', 'info');
            return null;
        }

        var leaderName = _getCharacterName(religion.leader.characterId);

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.75rem;">End the term of <strong>' + _escapeHtml(leaderName) + '</strong> as leader of ' + _escapeHtml(religion.name) + '?</p>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">End Year</label>' +
            '<input type="number" id="endYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Reason</label>' +
            '<input type="text" id="endReason" placeholder="e.g., Resignation, Death, Removal" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'End Leader Term',
            contentHtml: content,
            confirmText: 'End Term',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var endYear = _resolveParsedYear(root.querySelector('#endYear').value);
                var reason = root.querySelector('#endReason').value.trim() || 'Term ended';

                var result = window.ReligionCommands.endReligionLeaderTerm(
                    religionId,
                    religion.leader.characterId,
                    endYear,
                    reason
                );
                return _handleCommandResult(
                    result,
                    'Leader term ended',
                    'Failed to end leader term',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 11. ADD GOD MODAL
    // =========================================================================

    function openAddGodModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var domains = ['war', 'fertility', 'wisdom', 'death', 'love', 'justice', 'craft', 'nature', 'sky', 'sea', 'fire', 'earth'];

        var domainOptions = '';
        for (var i = 0; i < domains.length; i++) {
            domainOptions += '<option value="' + domains[i] + '">' + domains[i].charAt(0).toUpperCase() + domains[i].slice(1) + '</option>';
        }

        var genders = ['male', 'female', 'neuter'];
        var genderOptions = '';
        for (var i = 0; i < genders.length; i++) {
            genderOptions += '<option value="' + genders[i] + '">' + genders[i].charAt(0).toUpperCase() + genders[i].slice(1) + '</option>';
        }

        var alignments = ['good', 'neutral', 'evil', 'chaotic', 'lawful'];
        var alignmentOptions = '';
        for (var i = 0; i < alignments.length; i++) {
            alignmentOptions += '<option value="' + alignments[i] + '">' + alignments[i].charAt(0).toUpperCase() + alignments[i].slice(1) + '</option>';
        }

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">God Name *</label>' +
            '<input type="text" id="godName" placeholder="e.g., Thor" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Display Name</label>' +
            '<input type="text" id="godDisplayName" placeholder="e.g., Thor, God of Thunder" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="godDescription" rows="2" placeholder="Describe the god..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;resize:vertical;"></textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="godDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Symbol</label>' +
            '<input type="text" id="godSymbol" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Gender</label>' +
            '<select id="godGender" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            genderOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Alignment</label>' +
            '<select id="godAlignment" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            alignmentOptions +
            '</select>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Parent God ID (optional)</label>' +
            '<input type="text" id="godParent" placeholder="ID of parent god" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Add God to ' + _escapeHtml(religion.name),
            contentHtml: content,
            confirmText: 'Add God',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#godName').value.trim();
                if (!name) {
                    _showToast('God name is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    displayName: root.querySelector('#godDisplayName').value.trim() || name,
                    description: root.querySelector('#godDescription').value.trim(),
                    domain: root.querySelector('#godDomain').value,
                    symbol: root.querySelector('#godSymbol').value.trim(),
                    gender: root.querySelector('#godGender').value,
                    alignment: root.querySelector('#godAlignment').value,
                    parentGodId: root.querySelector('#godParent').value.trim() || null
                };

                var result = window.ReligionCommands.addGod(religionId, data);
                return _handleCommandResult(
                    result,
                    'God added: ' + (result && result.data ? result.data.name : name),
                    'Failed to add god',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 12. ADD LAW MODAL
    // =========================================================================

    function openAddLawModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        // Read law enums from ReligionCommands (canonical resolver). If
        // the enums are not loaded (settlement-law-definitions.js /
        // crime-constants.js not present), the pickers show a disabled
        // "not available" message. The command will reject the save
        // with a specific error naming the missing enum.
        var enums = (typeof window.ReligionCommands !== 'undefined'
            && typeof window.ReligionCommands.getLawEnums === 'function')
            ? window.ReligionCommands.getLawEnums()
            : { types: null, categories: null, domains: null, severities: null, crimeTypes: null };

        function _buildOptionsFromEnum(enumObj, preferredKey, fallback) {
            // Prefer the canonical enum. Fall back to a single-option
            // entry only when the enum is entirely missing — the option
            // value is the module's current default, so a save succeeds
            // against the fallback the command already uses. The
            // dropdown is minimal but functional; the caller will see
            // the missing enum error on save if the canonical value
            // differs from the fallback default.
            if (enumObj && typeof enumObj === 'object') {
                var out = '';
                for (var k in enumObj) {
                    if (!Object.prototype.hasOwnProperty.call(enumObj, k)) continue;
                    var v = enumObj[k];
                    if (typeof v !== 'string' || v.length === 0) continue;
                    out += '<option value="' + _escapeHtml(v) + '">'
                        + _escapeHtml(v.charAt(0).toUpperCase() + v.slice(1))
                        + '</option>';
                }
                if (out.length > 0) return out;
            }
            return '<option value="' + _escapeHtml(fallback) + '">'
                + _escapeHtml('(enum not loaded — using ' + fallback + ')')
                + '</option>';
        }

        function _buildLabeledOptionsFromEnum(enumObj, nameResolver, preferredKey, fallback) {
            if (enumObj && typeof enumObj === 'object') {
                var out = '';
                for (var k in enumObj) {
                    if (!Object.prototype.hasOwnProperty.call(enumObj, k)) continue;
                    var v = enumObj[k];
                    if (typeof v !== 'string' || v.length === 0) continue;
                    var label = nameResolver(v);
                    if (typeof label !== 'string' || label.length === 0) {
                        label = v.charAt(0).toUpperCase() + v.slice(1);
                    }
                    out += '<option value="' + _escapeHtml(v) + '">'
                        + _escapeHtml(label) + '</option>';
                }
                if (out.length > 0) return out;
            }
            var fbLabel = nameResolver(fallback);
            if (typeof fbLabel !== 'string' || fbLabel.length === 0) {
                fbLabel = fallback;
            }
            return '<option value="' + _escapeHtml(fallback) + '">'
                + _escapeHtml('(enum not loaded — using ' + fbLabel + ')')
                + '</option>';
        }

        var typeOptions = _buildLabeledOptionsFromEnum(
            enums.types, _getLawTypeName, 'LAW', 'law'
        );
        var categoryOptions = _buildLabeledOptionsFromEnum(
            enums.categories, _getLawCategoryName, 'RELIGIOUS', 'religious'
        );
        var domainOptions = _buildLabeledOptionsFromEnum(
            enums.domains, _getLawDomainName, 'BEHAVIOR', 'behavior'
        );
        var severityOptions = _buildLabeledOptionsFromEnum(
            enums.severities, _getLawSeverityName, 'MINOR', 'minor'
        );
        var crimeTypeOptions = '<option value="">None</option>'
            + _buildOptionsFromEnum(enums.crimeTypes, null, '');

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Law Name *</label>' +
            '<input type="text" id="lawName" placeholder="e.g., No Marriage Outside Faith" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="lawType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Category</label>' +
            '<select id="lawCategory" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            categoryOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="lawDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="lawDescription" rows="2" placeholder="Describe the law or taboo..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;resize:vertical;"></textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Severity</label>' +
            '<select id="lawSeverity" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            severityOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Crime Type (for enforcement)</label>' +
            '<select id="lawCrimeType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            crimeTypeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="lawEnforced" style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Is Enforced</label>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Default Punishment</label>' +
            '<input type="text" id="lawPunishment" placeholder="e.g., Excommunication, Fine, Execution" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="lawNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Add Law to ' + _escapeHtml(religion.name),
            contentHtml: content,
            confirmText: 'Add Law',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#lawName').value.trim();
                if (!name) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var crimeTypeValue = root.querySelector('#lawCrimeType').value || null;

                var data = {
                    name: name,
                    type: root.querySelector('#lawType').value,
                    lawCategory: root.querySelector('#lawCategory').value,
                    domain: root.querySelector('#lawDomain').value,
                    description: root.querySelector('#lawDescription').value.trim(),
                    severity: root.querySelector('#lawSeverity').value,
                    crimeType: crimeTypeValue,
                    isEnforced: root.querySelector('#lawEnforced').checked,
                    punishment: root.querySelector('#lawPunishment').value.trim() || null,
                    notes: root.querySelector('#lawNotes').value.trim()
                };

                var result = window.ReligionCommands.addLaw(religionId, data);
                return _handleCommandResult(
                    result,
                    'Law added: ' + (result && result.data ? result.data.name : name),
                    'Failed to add law',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 13. CREATE PLACE OF WORSHIP MODAL
    // =========================================================================

    function openCreatePlaceOfWorshipModal(religionId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var religion = _getReligion(religionId);
        if (!religion) {
            _showToast('Religion not found', 'error');
            return null;
        }

        var worshipTypes = window.ReligionConstants.WORSHIP_TYPES;

        var typeOptions = '';
        for (var key in worshipTypes) {
            if (worshipTypes.hasOwnProperty(key)) {
                var val = worshipTypes[key];
                typeOptions += '<option value="' + val + '">' + _escapeHtml(_getWorshipTypeName(val)) + '</option>';
            }
        }

        var locationOptions = _getLocationOptions(null);

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Place Name *</label>' +
            '<input type="text" id="placeName" placeholder="e.g., The Great Temple" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="placeType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Location</label>' +
            '<select id="placeLocation" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            locationOptions +
            '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Base Tithe (per follower)</label>' +
            '<input type="number" id="placeTithe" value="1" min="0" step="0.5" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Founded Year</label>' +
            '<input type="number" id="placeFoundedYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="placeProducesIncome" checked style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Produces Income (Collects Tithes)</label>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="placeNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Create Place of Worship for ' + _escapeHtml(religion.name),
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#placeName').value.trim();
                if (!name) {
                    _showToast('Place name is required', 'error');
                    return false;
                }

                var locationId = root.querySelector('#placeLocation').value;
                if (!locationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var titheValue = parseFloat(root.querySelector('#placeTithe').value);
                if (Number.isNaN(titheValue)) titheValue = 1;

                var data = {
                    name: name,
                    religionId: religionId,
                    locationId: locationId,
                    locationName: _getPlaceName(locationId),
                    type: root.querySelector('#placeType').value,
                    baseTithe: titheValue,
                    foundedYear: _resolveParsedYear(root.querySelector('#placeFoundedYear').value),
                    producesIncome: root.querySelector('#placeProducesIncome').checked,
                    notes: root.querySelector('#placeNotes').value.trim()
                };

                var result = window.ReligionCommands.createPlaceOfWorship(data);
                return _handleCommandResult(
                    result,
                    'Place of worship created: ' + (result && result.data ? result.data.name : name),
                    'Failed to create place of worship',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 14. ASSIGN CHARACTER RELIGION MODAL
    // =========================================================================

    function openAssignCharacterReligionModal(characterId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var character = _getCharacterById(characterId);
        if (!character) {
            _showToast('Character not found', 'error');
            return null;
        }

        var religions = _getAllReligions({ includeDeprecated: false });
        if (religions.length === 0) {
            _showToast('No active religions available', 'error');
            return null;
        }

        var currentReligion = character.religionId ? _getReligion(character.religionId) : null;
        var currentName = currentReligion ? currentReligion.name : 'None';

        var religionOptions = '';
        for (var i = 0; i < religions.length; i++) {
            var selected = (currentReligion && currentReligion.id === religions[i].id) ? 'selected' : '';
            religionOptions += '<option value="' + religions[i].id + '" ' + selected + '>' + _escapeHtml(religions[i].displayName || religions[i].name) + '</option>';
        }

        var conversionReasons = _getConversionReasons();
        var reasonOptions = '';
        for (var key in conversionReasons) {
            if (conversionReasons.hasOwnProperty(key)) {
                var val = conversionReasons[key];
                var label = _getConversionReasonName(val);
                reasonOptions += '<option value="' + val + '">' + _escapeHtml(label) + '</option>';
            }
        }

        var charName = character.name + (character.surname ? ' ' + character.surname : '');

        var content =
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Assign a religion to <strong>' + _escapeHtml(charName) + '</strong></p>' +
            '<p style="font-size:0.6rem;color:var(--dim);">Current: ' + _escapeHtml(currentName) + '</p>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Religion</label>' +
            '<select id="assignReligion" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            religionOptions +
            '</select>' +
            '</div>' +

            (currentReligion ? '<div style="padding:8px 12px;background:rgba(181,164,74,0.1);border:1px solid #c87040;border-radius:4px;font-size:0.6rem;color:#c87040;">This will record a conversion in the character\'s history.</div>' : '') +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Year</label>' +
            '<input type="number" id="assignYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.75rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Reason</label>' +
            '<select id="assignReason" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            reasonOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="assignNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Assign Religion to Character',
            contentHtml: content,
            confirmText: 'Assign',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var religionId = root.querySelector('#assignReligion').value;
                if (!religionId) {
                    _showToast('Please select a religion', 'error');
                    return false;
                }

                var year = _resolveParsedYear(root.querySelector('#assignYear').value);
                var reason = root.querySelector('#assignReason').value;
                var notes = root.querySelector('#assignNotes').value.trim();

                var opts = {
                    year: year,
                    reason: reason,
                    notes: notes
                };

                var result = window.ReligionCommands.assignReligionToCharacter(
                    characterId, religionId, opts
                );

                var successMessage = result && result.success && result.data && result.data.conversion
                    ? 'Character converted to: ' + result.data.conversion.toReligionName
                    : 'Religion assigned to character';

                return _handleCommandResult(
                    result,
                    successMessage,
                    'Failed to assign religion',
                    onSuccess
                );
            }
        });

        return modal;
    }

    // =========================================================================
    // 15. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (typeof window.openModal !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.openModal is missing. ' +
                'Check script tag order (modals-core.js must load first).'
            );
        }
        if (typeof window.closeTopModal !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.closeTopModal is missing. ' +
                'Check script tag order (modals-core.js must load first).'
            );
        }
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.escapeHtml is missing. ' +
                'Check script tag order (formatting.js must load first).'
            );
        }
        if (typeof window.showToast !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.showToast is missing. ' +
                'Check script tag order (ui.js must load first).'
            );
        }
        if (typeof window.getIcon !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.getIcon is missing. ' +
                'Check script tag order (icons.js must load first).'
            );
        }
        if (typeof window.openCharacterSelector !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.openCharacterSelector is missing. ' +
                'Check script tag order (modals-char-select.js must load first).'
            );
        }
        if (!window.ReligionCommands) {
            throw new Error(
                'modals-religion.js loaded but window.ReligionCommands is missing. ' +
                'Check script tag order (religion-commands.js must load first).'
            );
        }
        if (typeof window.ReligionCommands.persist !== 'function') {
            throw new Error(
                'modals-religion.js loaded but ReligionCommands.persist is missing. ' +
                'Modals are the save owner; persist() is required.'
            );
        }
        if (!window.ReligionQueries) {
            throw new Error(
                'modals-religion.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order (religion-queries.js must load first).'
            );
        }
        if (!window.ReligionFormat) {
            throw new Error(
                'modals-religion.js loaded but window.ReligionFormat is missing. ' +
                'Check script tag order (religion-format.js must load first).'
            );
        }
        if (!window.ReligionConstants) {
            throw new Error(
                'modals-religion.js loaded but window.ReligionConstants is missing. ' +
                'Check script tag order (religion-constants.js must load first).'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getPlaceById !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.getPlaceById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getFilteredLocationOptions !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.getFilteredLocationOptions is missing. ' +
                'Check script tag order (locationDropdown.js must load first).'
            );
        }
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'modals-religion.js loaded but window.getCurrentYear is missing. ' +
                'Check script tag order (time.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.openCreateReligionModal = openCreateReligionModal;
    window.openEditReligionModal = openEditReligionModal;
    window.openDeleteReligionModal = openDeleteReligionModal;
    window.openDeprecateReligionModal = openDeprecateReligionModal;
    window.openReligionDetailsModal = openReligionDetailsModal;
    window.openSetLeaderModal = openSetLeaderModal;
    window.openEndLeaderTermModal = openEndLeaderTermModal;
    window.openAddGodModal = openAddGodModal;
    window.openAddLawModal = openAddLawModal;
    window.openCreatePlaceOfWorshipModal = openCreatePlaceOfWorshipModal;
    window.openAssignCharacterReligionModal = openAssignCharacterReligionModal;

    window.ReligionModals = {
        openCreateReligionModal: openCreateReligionModal,
        openEditReligionModal: openEditReligionModal,
        openDeleteReligionModal: openDeleteReligionModal,
        openDeprecateReligionModal: openDeprecateReligionModal,
        openReligionDetailsModal: openReligionDetailsModal,
        openSetLeaderModal: openSetLeaderModal,
        openEndLeaderTermModal: openEndLeaderTermModal,
        openAddGodModal: openAddGodModal,
        openAddLawModal: openAddLawModal,
        openCreatePlaceOfWorshipModal: openCreatePlaceOfWorshipModal,
        openAssignCharacterReligionModal: openAssignCharacterReligionModal
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionModals: window.ReligionModals
        };
    }

})();
