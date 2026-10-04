/**
 * =============================================================================
 * STILL WATERS - CHILDREN SURROGACY MODALS
 * (js/character/modals-children-surrogacy.js)
 * =============================================================================
 *
 * Surrogacy arrangement modals.
 *
 * SCOPE:
 *   - openSurrogacyArrangementModal(intendedParentId, onSuccess)
 *       Full arrangement wizard: intended parent, partner, surrogate,
 *       donors (optional), child count, birth year, notes.
 *   - openCancelSurrogacyModal(arrangementId, onSuccess)
 *       Cancels an active arrangement.
 *   - openCompleteSurrogacyModal(arrangementId, onSuccess)
 *       Marks an active arrangement as completed.
 *
 * OUT OF SCOPE:
 *   - Donor / surrogate selection UI     -> delegate to the character
 *                                            selector; no dedicated picker
 *   - Surrogacy policy                   -> ChildrenRules
 *   - Arrangement mutation               -> ChildrenCommands
 *   - Persistence                        -> ChildrenState
 *   - Presentation CSS                   -> stylesheet
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries and ChildrenQueries. Mutates
 *     only via ChildrenCommands.
 *   - No swap-arrangement UI. Not implemented.
 *   - No fallback for missing dependencies. Missing openModal,
 *     CharacterQueries, ChildrenCommands, ChildrenQueries, or
 *     ChildrenRules throws at load.
 *   - The character selector is required for donor and surrogate
 *     selection. Its absence is a structured failure, not a fallback.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:        escapeHtml
 *   - icons.js:             Icons
 *   - modals-core.js:       openModal, closeTopModal
 *   - time.js:              getCurrentYear, isValidYear, calculateAge
 *   - CharacterQueries:     getCharacterSummary
 *   - ChildrenCommands:     recordSurrogacyArrangement,
 *                           completeSurrogacyArrangement,
 *                           cancelSurrogacyArrangement
 *   - ChildrenQueries:      getSurrogacyArrangement
 *   - ChildrenRules:        SURROGACY_TYPE, SURROGACY_STATUS
 *
 * DEPENDENCIES (OPTIONAL, required for donor/surrogate selection):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'getCurrentYear',
            'isValidYear',
            'calculateAge'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-children-surrogacy.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-children-surrogacy.js: icons.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-children-surrogacy.js: character-queries.js must load first.');
        }
        if (typeof window.ChildrenCommands === 'undefined') {
            throw new Error('modals-children-surrogacy.js: children-commands.js must load first.');
        }
        if (typeof window.ChildrenQueries === 'undefined') {
            throw new Error('modals-children-surrogacy.js: children-queries.js must load first.');
        }
        if (typeof window.ChildrenRules === 'undefined') {
            throw new Error('modals-children-surrogacy.js: children-rules.js must load first.');
        }
    }

    _requireDependencies();

    var CQ = window.CharacterQueries;
    var ChC = window.ChildrenCommands;
    var ChQ = window.ChildrenQueries;
    var ChR = window.ChildrenRules;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _icon(name) {
        return window.Icons[name] || '';
    }

    function _readSummary(id) {
        if (!_hasId(id)) return null;
        return CQ.getCharacterSummary(id);
    }

    function _fullName(summary) {
        if (!summary) return '';
        return (summary.fullName || summary.name || '').trim();
    }

    function _requireSelector() {
        if (typeof window.openCharacterSelector !== 'function') {
            throw new Error(
                'modals-children-surrogacy.js: character selector ' +
                '(openCharacterSelector) is required.'
            );
        }
        return window.openCharacterSelector;
    }

    // =========================================================================
    // 2. SURROGACY ARRANGEMENT MODAL
    // =========================================================================

    /**
     * @param {string} intendedParentId
     * @param {Function} [onSuccess]
     */
    function openSurrogacyArrangementModal(intendedParentId, onSuccess) {
        var intendedParent = _readSummary(intendedParentId);
        if (!intendedParent) {
            return { success: false, reason: 'Intended parent not found.' };
        }
        if (intendedParent.isDeceased === true) {
            return { success: false, reason: 'Intended parent is deceased.' };
        }

        var currentYear = window.getCurrentYear();

        // Local selection state.
        var selectedPartnerId = null;
        var selectedSurrogateId = null;
        var selectedSpermDonorId = null;
        var selectedEggDonorId = null;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Intended Parent: '
                 + _esc(_fullName(intendedParent))
                 + '</strong>'
                 + '<br>' + _esc(intendedParent.age === null
                     ? 'Unknown age'
                     : intendedParent.age + ' years')
                 + ' &middot; ' + _esc(intendedParent.gender || 'Unknown')
                 + '</div>';

        // Intended partner
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Intended Partner</label>'
                 + '<div style="display:flex; gap:8px; align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-partner">'
                 + 'Select Partner</button>'
                 + '<span id="surro-partner-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-partner">'
                 + 'Clear</button>'
                 + '</div>'
                 + '</div>';

        // Surrogate
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Surrogate (required)</label>'
                 + '<div style="display:flex; gap:8px; align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-surrogate">'
                 + 'Select Surrogate</button>'
                 + '<span id="surro-surrogate-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-surrogate">'
                 + 'Clear</button>'
                 + '</div>'
                 + '</div>';

        // Sperm donor (optional)
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Sperm Donor (optional)</label>'
                 + '<div style="display:flex; gap:8px; align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-sperm-donor">'
                 + 'Select Sperm Donor</button>'
                 + '<span id="surro-sperm-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-sperm-donor">'
                 + 'Clear</button>'
                 + '</div>'
                 + '</div>';

        // Egg donor (optional)
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Egg Donor (optional)</label>'
                 + '<div style="display:flex; gap:8px; align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-egg-donor">'
                 + 'Select Egg Donor</button>'
                 + '<span id="surro-egg-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-egg-donor">'
                 + 'Clear</button>'
                 + '</div>'
                 + '</div>';

        // Type
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="surro-type">Type</label>'
                 + '<select id="surro-type" class="character-modal__form-input">'
                 + '<option value="traditional">Traditional (surrogate is also egg donor)</option>'
                 + '<option value="gestational">Gestational (separate egg donor)</option>'
                 + '</select>'
                 + '</div>';

        // Child count
        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="surro-count">Children</label>'
                 + '<input type="number" id="surro-count" class="character-modal__form-input" '
                 + 'value="1" min="1" max="3">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="surro-birth-year">Birth Year</label>'
                 + '<input type="number" id="surro-birth-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear + 1) + '" '
                 + 'min="' + currentYear + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        // Notes
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="surro-notes">Notes</label>'
                 + '<textarea id="surro-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Surrogacy Arrangement',
            contentHtml: content,
            confirmText: 'Create Arrangement',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                modalElement.addEventListener('click', function (e) {
                    var btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var openSelector = _requireSelector();

                    if (action === 'select-partner') {
                        openSelector({
                            title: 'Select Intended Partner',
                            filters: { status: 'living', showDeceased: false },
                            excludeIds: [intendedParentId],
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                selectedPartnerId = selected.id;
                                var el = modalElement.querySelector('#surro-partner-name');
                                if (el) el.textContent = selected.name || selected.id;
                            }
                        });
                    } else if (action === 'clear-partner') {
                        selectedPartnerId = null;
                        var pEl = modalElement.querySelector('#surro-partner-name');
                        if (pEl) pEl.textContent = 'None';
                    } else if (action === 'select-surrogate') {
                        openSelector({
                            title: 'Select Surrogate',
                            filters: {
                                gender: 'female',
                                status: 'living',
                                showDeceased: false
                            },
                            excludeIds: [intendedParentId, selectedPartnerId]
                                .filter(_hasId),
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                selectedSurrogateId = selected.id;
                                var el = modalElement.querySelector('#surro-surrogate-name');
                                if (el) el.textContent = selected.name || selected.id;
                            }
                        });
                    } else if (action === 'clear-surrogate') {
                        selectedSurrogateId = null;
                        var sEl = modalElement.querySelector('#surro-surrogate-name');
                        if (sEl) sEl.textContent = 'None';
                    } else if (action === 'select-sperm-donor') {
                        openSelector({
                            title: 'Select Sperm Donor',
                            filters: {
                                gender: 'male',
                                status: 'living',
                                showDeceased: false
                            },
                            excludeIds: [intendedParentId, selectedPartnerId]
                                .filter(_hasId),
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                selectedSpermDonorId = selected.id;
                                var el = modalElement.querySelector('#surro-sperm-name');
                                if (el) el.textContent = selected.name || selected.id;
                            }
                        });
                    } else if (action === 'clear-sperm-donor') {
                        selectedSpermDonorId = null;
                        var spEl = modalElement.querySelector('#surro-sperm-name');
                        if (spEl) spEl.textContent = 'None';
                    } else if (action === 'select-egg-donor') {
                        openSelector({
                            title: 'Select Egg Donor',
                            filters: {
                                gender: 'female',
                                status: 'living',
                                showDeceased: false
                            },
                            excludeIds: [intendedParentId, selectedPartnerId]
                                .filter(_hasId),
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                selectedEggDonorId = selected.id;
                                var el = modalElement.querySelector('#surro-egg-name');
                                if (el) el.textContent = selected.name || selected.id;
                            }
                        });
                    } else if (action === 'clear-egg-donor') {
                        selectedEggDonorId = null;
                        var eEl = modalElement.querySelector('#surro-egg-name');
                        if (eEl) eEl.textContent = 'None';
                    }
                });
            },
            onConfirm: function () {
                if (!_hasId(selectedSurrogateId)) {
                    throw new Error('Please select a surrogate.');
                }

                var typeEl = modal.element.querySelector('#surro-type');
                var countEl = modal.element.querySelector('#surro-count');
                var yearEl = modal.element.querySelector('#surro-birth-year');
                var notesEl = modal.element.querySelector('#surro-notes');

                var type = typeEl.value === 'gestational' ? 'gestational' : 'traditional';
                var count = parseInt(countEl.value, 10);
                if (!Number.isInteger(count) || count < 1 || count > 3) {
                    throw new Error('Children count must be between 1 and 3.');
                }

                var birthYear = parseInt(yearEl.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year.');
                }

                var options = {
                    type: type,
                    childCount: count,
                    birthYear: birthYear,
                    arrangementYear: currentYear,
                    notes: notesEl.value || ''
                };

                if (_hasId(selectedPartnerId)) {
                    options.intendedPartnerId = selectedPartnerId;
                }
                if (_hasId(selectedSpermDonorId)) {
                    options.spermDonorId = selectedSpermDonorId;
                }
                if (_hasId(selectedEggDonorId)) {
                    options.eggDonorId = selectedEggDonorId;
                }

                var result = ChC.recordSurrogacyArrangement(
                    intendedParentId,
                    selectedSurrogateId,
                    options
                );
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to create surrogacy arrangement.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(result.arrangementId, result.childIds);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 3. COMPLETE SURROGACY MODAL
    // =========================================================================

    function openCompleteSurrogacyModal(arrangementId, onSuccess) {
        if (!_hasId(arrangementId)) {
            return { success: false, reason: 'arrangementId is required.' };
        }

        var arrangement = ChQ.getSurrogacyArrangement(arrangementId);
        if (!arrangement) {
            return { success: false, reason: 'Arrangement not found.' };
        }
        if (arrangement.status === 'completed') {
            return { success: false, reason: 'Arrangement is already completed.' };
        }
        if (arrangement.status === 'cancelled') {
            return { success: false, reason: 'Arrangement is cancelled.' };
        }

        var intendedParent = _readSummary(arrangement.intendedParentId);
        var surrogate = _readSummary(arrangement.surrogateId);
        var currentYear = window.getCurrentYear();

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Intended Parent:</strong> '
                 + _esc(_fullName(intendedParent) || arrangement.intendedParentId)
                 + '<br><strong>Surrogate:</strong> '
                 + _esc(_fullName(surrogate) || arrangement.surrogateId)
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="complete-birth-year">'
                 + 'Year of Birth</label>'
                 + '<input type="number" id="complete-birth-year" class="character-modal__form-input" '
                 + 'value="' + _esc(arrangement.actualBirthYear || currentYear) + '" '
                 + 'min="' + arrangement.arrangementYear + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Complete Surrogacy Arrangement',
            contentHtml: content,
            confirmText: 'Complete',
            cancelText: 'Cancel',
            onConfirm: function () {
                var yearEl = modal.element.querySelector('#complete-birth-year');
                var birthYear = parseInt(yearEl.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year.');
                }

                var result = ChC.completeSurrogacyArrangement(arrangementId, {
                    birthYear: birthYear
                });
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to complete arrangement.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(arrangementId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 4. CANCEL SURROGACY MODAL
    // =========================================================================

    function openCancelSurrogacyModal(arrangementId, onSuccess) {
        if (!_hasId(arrangementId)) {
            return { success: false, reason: 'arrangementId is required.' };
        }

        var arrangement = ChQ.getSurrogacyArrangement(arrangementId);
        if (!arrangement) {
            return { success: false, reason: 'Arrangement not found.' };
        }
        if (arrangement.status === 'cancelled') {
            return { success: false, reason: 'Arrangement is already cancelled.' };
        }
        if (arrangement.status === 'completed') {
            return { success: false, reason: 'Completed arrangements cannot be cancelled.' };
        }

        var content = '<div class="character-modal">'
                    + '<div class="character-modal__section">'
                    + 'Cancel this surrogacy arrangement? This cannot be undone.'
                    + '</div>'
                    + '</div>';

        var modal = window.openModal({
            titleHtml: 'Cancel Surrogacy Arrangement',
            contentHtml: content,
            confirmText: 'Cancel Arrangement',
            cancelText: 'Keep Arrangement',
            onConfirm: function () {
                var result = ChC.cancelSurrogacyArrangement(arrangementId);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to cancel arrangement.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(arrangementId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.openSurrogacyArrangementModal = openSurrogacyArrangementModal;
    window.openCompleteSurrogacyModal = openCompleteSurrogacyModal;
    window.openCancelSurrogacyModal = openCancelSurrogacyModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openSurrogacyArrangementModal: openSurrogacyArrangementModal,
            openCompleteSurrogacyModal: openCompleteSurrogacyModal,
            openCancelSurrogacyModal: openCancelSurrogacyModal
        };
    }
})();
