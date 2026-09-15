/**
 * =============================================================================
 * STILL WATERS - NAME MODALS (modals-name.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/modals-name.js
 *
 * SCOPE:
 *   - Name generator modal (preview random names, select one)
 *   - Surname history modal (view changes, revert, clear)
 *
 * OUT OF SCOPE:
 *   - Name/surname generation logic → name-queries.js, name-rules.js
 *   - Name/surname mutations → name-commands.js
 *   - Surname history reads/writes → name-queries.js, name-commands.js
 *   - Country resolution → world.js
 *   - Modal lifecycle → modals-core.js
 *   - Presentation CSS → name-modals.css
 *   - Confirmation dialogs → modals-core.js (confirmDialog)
 *
 * SEMANTIC RULES:
 *   - This module is pure UI. It reads via NameQueries and world.js,
 *     mutates via NameCommands, and renders. It does not touch storage,
 *     masterData, NameState, or accessors directly.
 *   - Required dependencies throw at load. No silent fallbacks.
 *   - Missing optional data (a character with no surname history) is a
 *     legitimate UI state and renders as "no history" — not as a hidden
 *     empty pane.
 *   - Presentation is owned by CSS. This module emits classes only.
 *     No inline style attributes.
 *   - Events are delegated on the modal root, scoped via data-action.
 *     No global element IDs, no per-render listener stacks.
 *   - The generated name is held in a local variable, not read back from
 *     DOM text. The DOM is a rendering of state, not the state itself.
 *   - Year 0 is preserved in any year rendering.
 *   - No browser confirm(). Confirmation goes through confirmDialog.
 *   - No Unicode arrows in buttons. Icons come from icons.js.
 *   - Any string from canonical data that ends up in innerHTML is escaped.
 *     Any generated string that ends up in textContent is not (textContent
 *     does not interpret HTML).
 *
 * REQUIRED CSS:
 *   See name-modals.css. The module emits:
 *     .name-modal
 *     .name-modal__intro
 *     .name-modal__field
 *     .name-modal__label
 *     .name-modal__input
 *     .name-modal__button-row
 *     .name-modal__generate
 *     .name-modal__preview
 *     .name-modal__preview--empty
 *     .name-modal__preview--filled
 *     .name-modal__history
 *     .name-modal__history-title
 *     .name-modal__history-list
 *     .name-modal__history-entry
 *     .name-modal__history-entry--current
 *     .name-modal__history-entry--past
 *     .name-modal__history-year
 *     .name-modal__history-reason
 *     .name-modal__history-surname
 *     .name-modal__history-previous
 *     .name-modal__history-empty
 *     .name-modal__surname-summary
 *     .name-modal__surname-summary-cell
 *     .name-modal__surname-summary-label
 *     .name-modal__surname-summary-value
 *     .name-modal__surname-summary-value--accent
 *     .name-modal__actions
 *     .name-modal__action-button
 *     .name-modal__error
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:    escapeHtml
 *   - icons.js:         Icons
 *   - modals-core.js:   openModal, confirmDialog
 *   - name-queries.js:  NameQueries
 *   - name-commands.js: NameCommands
 *   - world.js:         getCountryPlaces
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None.
 *
 * ICON POLICY: Uses icons.js. No emojis. No Unicode arrows.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var requiredFns = [
            'escapeHtml',
            'openModal',
            'confirmDialog',
            'getCountryPlaces'
        ];
        var missing = [];
        for (var i = 0; i < requiredFns.length; i++) {
            if (typeof window[requiredFns[i]] !== 'function') {
                missing.push(requiredFns[i]);
            }
        }
        if (typeof window.Icons === 'undefined') missing.push('Icons');
        if (typeof window.NameQueries === 'undefined') missing.push('NameQueries');
        if (typeof window.NameCommands === 'undefined') missing.push('NameCommands');

        if (missing.length > 0) {
            throw new Error(
                'modals-name.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

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

    /**
     * Returns an icon SVG by name, or '' if the name is unknown.
     * The icon module is required, so a missing name is a programming
     * error worth surfacing quietly in the DOM (no SVG rendered) rather
     * than throwing during a render.
     */
    function _icon(name) {
        return window.Icons[name] || '';
    }

    /**
     * Formats a year for display. Missing yields the missingText.
     * Year 0 is rendered as '0'.
     */
    function _formatYear(year, missingText) {
        if (_isMissing(year)) return missingText || 'Unknown';
        return String(year);
    }

    /**
     * Formats a surname for display. Missing or empty yields a visible
     * placeholder so the UI does not look broken.
     */
    function _displaySurname(surname) {
        if (typeof surname !== 'string' || surname.length === 0) return '(no surname)';
        return surname;
    }

    /**
     * Renders an error line inside the modal. Errors are shown inline,
     * not as toasts, because the modal is already the user's focus.
     */
    function _renderError(root, message) {
        if (!root) return;
        var existing = root.querySelector('.name-modal__error');
        if (existing) existing.parentNode.removeChild(existing);
        var errorEl = document.createElement('div');
        errorEl.className = 'name-modal__error';
        errorEl.textContent = message;
        root.appendChild(errorEl);
        // Auto-clear on next successful action, but for now leave it.
        setTimeout(function() {
            if (errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
        }, 5000);
    }

    // =========================================================================
    // 2. NAME GENERATOR MODAL
    // =========================================================================

    /**
     * Opens the name generator modal.
     *
     * Options:
     *   title       - modal title (default 'Generate Name')
     *   countryId   - preselect a country
     *   gender      - 'male' | 'female' | 'all' (default 'all')
     *   onSelect    - called with the chosen name string when the user
     *                 confirms. Not called if the user cancels or if no
     *                 name has been generated yet.
     *
     * @param {Object} [options]
     * @returns {{ element: HTMLElement, close: Function }|null}
     */
    function openNameGeneratorModal(options) {
        if (_isMissing(options)) options = {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openNameGeneratorModal: options must be an object');
        }

        var title = _isMissing(options.title) ? 'Generate Name' : options.title;
        var initialCountryId = _isMissing(options.countryId) ? null : options.countryId;
        var initialGender = _isMissing(options.gender) ? 'all' : options.gender;
        var onSelect = _isMissing(options.onSelect) ? null : options.onSelect;

        if (onSelect !== null && typeof onSelect !== 'function') {
            throw new Error('openNameGeneratorModal: onSelect must be a function');
        }
        if (initialGender !== 'male' && initialGender !== 'female' && initialGender !== 'all') {
            throw new Error("openNameGeneratorModal: gender must be 'male', 'female', or 'all'");
        }

        // Local state — the DOM renders this, not the other way around.
        var state = {
            generatedName: null
        };

        // Country list. Uses world's canonical country query.
        var countries = window.getCountryPlaces();
        if (!Array.isArray(countries)) countries = [];

        var hasCountries = countries.length > 0;

        var html = '';
        html += '<div class="name-modal">';

        // Intro
        html += '<p class="name-modal__intro">'
             + (hasCountries
                ? 'Choose a country to draw names from its cultural pool.'
                : 'No countries with name data are available yet.')
             + '</p>';

        // Country
        html += '<div class="name-modal__field">';
        html += '<label class="name-modal__label" for="name-modal-country">Country</label>';
        html += '<select class="name-modal__input" id="name-modal-country"'
             + ' data-role="country"'
             + (hasCountries ? '' : ' disabled') + '>';
        html += '<option value="">— Select country —</option>';
        for (var ci = 0; ci < countries.length; ci++) {
            var country = countries[ci];
            if (!country || !_hasId(country.id)) continue;
            var selected = (country.id === initialCountryId) ? ' selected' : '';
            html += '<option value="' + _esc(country.id) + '"' + selected + '>'
                 + _esc(country.displayName || country.id)
                 + '</option>';
        }
        html += '</select>';
        html += '</div>';

        // Gender
        html += '<div class="name-modal__field">';
        html += '<label class="name-modal__label" for="name-modal-gender">Gender</label>';
        html += '<select class="name-modal__input" id="name-modal-gender" data-role="gender">';
        html += '<option value="all"' + (initialGender === 'all' ? ' selected' : '') + '>Any</option>';
        html += '<option value="male"' + (initialGender === 'male' ? ' selected' : '') + '>Male</option>';
        html += '<option value="female"' + (initialGender === 'female' ? ' selected' : '') + '>Female</option>';
        html += '</select>';
        html += '</div>';

        // Generate button
        html += '<div class="name-modal__button-row">';
        html += '<button type="button" class="name-modal__generate" data-action="generate">'
             + _icon('REFRESH') + ' Generate'
             + '</button>';
        html += '</div>';

        // Preview
        html += '<div class="name-modal__preview name-modal__preview--empty" data-role="preview">'
             + 'No name generated yet'
             + '</div>';

        html += '</div>';

        var modal = window.openModal({
            titleHtml: _esc(title),
            contentHtml: html,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onOpen: function(root) {
                _bindNameGeneratorActions(root, state, onSelect);
            },
            onConfirm: function() {
                if (state.generatedName && onSelect) {
                    onSelect(state.generatedName);
                }
                // If no name has been generated, we simply do not call
                // onSelect. The modal still closes — the caller can decide
                // whether that matters. We do not block the close with an
                // error, since "user opened and closed without choosing"
                // is a legitimate outcome.
            }
        });

        return modal;
    }

    function _bindNameGeneratorActions(root, state, onSelect) {
        var countrySelect = root.querySelector('[data-role="country"]');
        var genderSelect = root.querySelector('[data-role="gender"]');
        var previewEl = root.querySelector('[data-role="preview"]');

        root.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action="generate"]');
            if (!target) return;

            var countryId = countrySelect ? countrySelect.value : '';
            var gender = genderSelect ? genderSelect.value : 'all';

            if (!countryId) {
                _renderError(root, 'Please choose a country first.');
                return;
            }

            var name;
            try {
                name = window.NameQueries.getRandomName(countryId, gender);
            } catch (err) {
                _renderError(root, err.message || 'Could not generate name.');
                return;
            }

            if (!name) {
                state.generatedName = null;
                if (previewEl) {
                    previewEl.textContent = 'No names available for this country.';
                    previewEl.classList.remove('name-modal__preview--filled');
                    previewEl.classList.add('name-modal__preview--empty');
                }
                return;
            }

            state.generatedName = name;
            if (previewEl) {
                previewEl.textContent = name;
                previewEl.classList.remove('name-modal__preview--empty');
                previewEl.classList.add('name-modal__preview--filled');
            }
        });
    }

    // =========================================================================
    // 3. SURNAME MANAGEMENT MODAL
    // =========================================================================

    /**
     * Opens the surname history modal for a character.
     *
     * Actions available:
     *   - Revert the most recent surname change.
     *   - Clear the entire surname history (destructive; the birth
     *     surname and current surname are preserved).
     *
     * @param {string} characterId
     * @param {Function} [onChange] - called after a successful revert or
     *   clear, so the caller can re-render.
     * @returns {{ element: HTMLElement, close: Function }|null}
     */
    function openSurnameManagementModal(characterId, onChange) {
        if (!_hasId(characterId)) {
            throw new Error('openSurnameManagementModal: characterId is required');
        }
        if (!_isMissing(onChange) && typeof onChange !== 'function') {
            throw new Error('openSurnameManagementModal: onChange must be a function');
        }

        var character = window.getCharacterById
            ? window.getCharacterById(characterId)
            : null;
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var html = _buildSurnameManagementContent(characterId);

        var modal = window.openModal({
            titleHtml: _esc('Surname: ' + (character.name || characterId)),
            contentHtml: html,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function(root) {
                _bindSurnameManagementActions(root, characterId, onChange);
            },
            onConfirm: function() {}
        });

        return modal;
    }

    /**
     * Builds the modal's HTML from current canonical data. Called at open
     * time and again after a mutation to rebuild the content in place.
     */
    function _buildSurnameManagementContent(characterId) {
        var character = window.getCharacterById
            ? window.getCharacterById(characterId)
            : null;
        if (!character) {
            return '<div class="name-modal"><p class="name-modal__error">'
                 + 'Character not found.'
                 + '</p></div>';
        }

        var history = window.NameQueries.getSurnameHistory(characterId);
        var changes = window.NameQueries.getSurnameChanges(characterId);
        var birthSurname = window.NameQueries.getBirthSurname(characterId);
        var currentSurname = window.NameQueries.getCurrentSurname(characterId);

        // Birth surname query returns null for missing history. Distinguish
        // that from "empty birth surname".
        var hasHistory = _isMissing(history) === false;
        var birthSurnameForDisplay = _isMissing(birthSurname)
            ? (typeof character.surname === 'string' ? character.surname : '')
            : birthSurname;

        var html = '';
        html += '<div class="name-modal">';

        // Summary: current + birth
        html += '<div class="name-modal__surname-summary">';
        html += '<div class="name-modal__surname-summary-cell">';
        html += '<div class="name-modal__surname-summary-label">Current Surname</div>';
        html += '<div class="name-modal__surname-summary-value name-modal__surname-summary-value--accent">'
             + _esc(_displaySurname(currentSurname))
             + '</div>';
        html += '</div>';
        html += '<div class="name-modal__surname-summary-cell">';
        html += '<div class="name-modal__surname-summary-label">Birth Surname</div>';
        html += '<div class="name-modal__surname-summary-value">'
             + _esc(_displaySurname(birthSurnameForDisplay))
             + '</div>';
        html += '</div>';
        html += '</div>';

        // History
        html += '<div class="name-modal__history">';
        html += '<div class="name-modal__history-title">'
             + _icon('BOOK') + ' History (' + changes.length + ')'
             + '</div>';

        if (!hasHistory || changes.length === 0) {
            html += '<div class="name-modal__history-empty">No surname changes recorded.</div>';
        } else {
            html += '<div class="name-modal__history-list">';
            for (var i = 0; i < changes.length; i++) {
                var c = changes[i];
                var isCurrent = (i === changes.length - 1);
                var entryClass = 'name-modal__history-entry '
                    + (isCurrent ? 'name-modal__history-entry--current'
                                 : 'name-modal__history-entry--past');

                html += '<div class="' + entryClass + '">';
                html += '<span class="name-modal__history-year">'
                     + _esc(_formatYear(c.year, '—'))
                     + '</span>';
                html += '<span class="name-modal__history-reason">'
                     + _esc(c.reason || 'change')
                     + '</span>';
                html += '<span class="name-modal__history-surname">'
                     + _esc(_displaySurname(c.surname))
                     + '</span>';
                if (typeof c.previousSurname === 'string' && c.previousSurname.length > 0) {
                    html += '<span class="name-modal__history-previous">'
                         + 'from ' + _esc(c.previousSurname)
                         + '</span>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Actions
        html += '<div class="name-modal__actions">';
        if (changes.length > 0) {
            html += '<button type="button" class="name-modal__action-button" data-action="revert-surname">'
                 + _icon('UNDO') + ' Revert Last Change'
                 + '</button>';
            html += '<button type="button" class="name-modal__action-button name-modal__action-button--danger" data-action="clear-surname-history">'
                 + _icon('TRASH') + ' Clear History'
                 + '</button>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _bindSurnameManagementActions(root, characterId, onChange) {
        root.addEventListener('click', function(e) {
            var actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            var action = actionEl.getAttribute('data-action');

            if (action === 'revert-surname') {
                var result = window.NameCommands.revertLastSurnameChange(characterId);
                if (!result.success) {
                    _renderError(root, result.reason || 'Failed to revert surname change.');
                    return;
                }
                _refreshSurnameModalContent(root, characterId);
                if (onChange) onChange();
                return;
            }

            if (action === 'clear-surname-history') {
                window.confirmDialog(
                    'Clear all surname history entries? The birth surname and current surname are preserved. This action cannot be undone.',
                    'Clear Surname History',
                    function() {
                        var clearResult = window.NameCommands.clearSurnameHistory(characterId);
                        if (!clearResult.success) {
                            _renderError(root, clearResult.reason || 'Failed to clear surname history.');
                            return;
                        }
                        _refreshSurnameModalContent(root, characterId);
                        if (onChange) onChange();
                    }
                );
                return;
            }
        });
    }

    /**
     * Re-renders the surname management content in place, preserving the
     * modal shell. Called after a successful mutation.
     */
    function _refreshSurnameModalContent(root, characterId) {
        var contentHost = root.querySelector('.modal-body');
        if (!contentHost) {
            // Fallback: if we can't find the body, just replace the whole
            // content. This should not happen given modals-core's structure,
            // but we do not want to crash a working modal.
            contentHost = root;
        }
        contentHost.innerHTML = _buildSurnameManagementContent(characterId);
        // The delegated click handler is on the root, not on the body, so
        // rebuilding the body does not detach it. No rebinding needed.
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.openNameGeneratorModal = openNameGeneratorModal;
    window.openSurnameManagementModal = openSurnameManagementModal;

})();