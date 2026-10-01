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
 *   - This module is pure UI. It reads via NameQueries, mutates via
 *     NameCommands, and renders. It does not touch storage, masterData,
 *     or NameState directly.
 *   - Required dependencies throw at load. No silent fallbacks.
 *   - Missing optional data (a character with no surname history) is a
 *     legitimate UI state and renders as "no history".
 *   - Presentation is owned by CSS. This module emits classes only.
 *     No inline style attributes.
 *   - Events are delegated on the modal root, scoped via data-action.
 *     No per-render listener stacks.
 *   - The generated name is held in local state, not read back from DOM
 *     text. The DOM renders state; it is not the state.
 *   - Year 0 is preserved in year rendering.
 *   - No browser confirm(). Confirmation goes through confirmDialog.
 *   - No Unicode arrows in buttons. Icons come from icons.js.
 *   - Any string from canonical data that ends up in innerHTML is
 *     escaped. Generated strings that end up in textContent are not
 *     (textContent does not interpret HTML).
 *
 * KNOWN DEBT (MIGRATION NOTE):
 *   This modal reads character display names via `getCharacterById`
 *   directly, because NameQueries does not yet expose a character-name
 *   projection. The correct fix is a follow-up patch to name-queries.js
 *   adding `NameQueries.getCharacterDisplayName(characterId)`. Until
 *   that lands, `getCharacterById` is declared as a REQUIRED dependency
 *   of this module and used directly. There is no `? : null` fallback.
 *
 * ICON CONTRACT:
 *   All icons used by this module (REFRESH, BOOK, UNDO, TRASH) are
 *   required. An unknown icon name throws. A missing icon is a
 *   programming error, not a UI state.
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
 *     .name-modal__action-button--danger
 *     .name-modal__error
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:    escapeHtml
 *   - icons.js:         Icons
 *   - modals-core.js:   openModal, confirmDialog
 *   - name-queries.js:  NameQueries
 *   - name-commands.js: NameCommands
 *   - world.js:         getCountryPlaces
 *   - accessors.js:     getCharacterById  (see KNOWN DEBT note)
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
            'getCountryPlaces',
            'getCharacterById'
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
    // 1. MODULE STATE
    // =========================================================================

    // Per-modal-instance counter for unique DOM IDs. Labels use these to
    // associate with their inputs without relying on global singletons.
    var _instanceCounter = 0;

    function _nextInstanceId() {
        _instanceCounter += 1;
        return 'name-modal-' + _instanceCounter;
    }

    // =========================================================================
    // 2. HELPERS
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
     * Returns an icon SVG by name. Unknown names throw: a missing icon
     * is a programming error, not a UI state. See ICON CONTRACT above.
     */
    function _icon(name) {
        var svg = window.Icons[name];
        if (typeof svg !== 'string' || svg.length === 0) {
            throw new Error('modals-name.js: unknown icon "' + name + '"');
        }
        return svg;
    }

    /**
     * Formats a year for display. Missing yields the missingText.
     * Year 0 renders as '0'.
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
        if (typeof surname !== 'string' || surname.length === 0) {
            return '(no surname)';
        }
        return surname;
    }

    /**
     * Renders an error line inside the modal. Errors are shown inline,
     * not as toasts, because the modal is already the user's focus.
     *
     * Auto-clears after 5 seconds. Calling this again while an error is
     * visible removes the previous one and starts a fresh timer.
     */
    function _renderError(root, message) {
        if (!root) return;
        var existing = root.querySelector('.name-modal__error');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var errorEl = document.createElement('div');
        errorEl.className = 'name-modal__error';
        errorEl.textContent = message;
        root.appendChild(errorEl);
        setTimeout(function() {
            if (errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
        }, 5000);
    }

    /**
     * Reads a character's display name. See KNOWN DEBT note in the
     * module header: this is the one direct accessor read in this file,
     * and it is declared as a required dependency.
     */
    function _getCharacterDisplayName(characterId) {
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        if (typeof character.name === 'string' && character.name.length > 0) {
            return character.name;
        }
        return characterId;
    }

    // =========================================================================
    // 3. NAME GENERATOR MODAL
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
     *                 name has been generated. "Open then close without
     *                 generating" is a legitimate outcome and is not
     *                 signaled separately.
     *
     * @param {Object} [options]
     * @returns {Object} the modal handle from openModal
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
            throw new Error(
                "openNameGeneratorModal: gender must be 'male', 'female', or 'all'"
            );
        }

        var instanceId = _nextInstanceId();
        var countrySelectId = instanceId + '-country';
        var genderSelectId = instanceId + '-gender';

        // Local state — the DOM renders this, not the other way around.
        var state = {
            generatedName: null
        };

        var countries = window.getCountryPlaces();
        if (!Array.isArray(countries)) {
            throw new Error(
                'openNameGeneratorModal: getCountryPlaces() did not return an array'
            );
        }

        var hasCountries = countries.length > 0;

        var html = '';
        html += '<div class="name-modal">';

        html += '<p class="name-modal__intro">'
             + (hasCountries
                ? 'Choose a country to draw names from its cultural pool.'
                : 'No countries with name data are available yet.')
             + '</p>';

        // Country
        html += '<div class="name-modal__field">';
        html += '<label class="name-modal__label" for="' + _esc(countrySelectId) + '">Country</label>';
        html += '<select class="name-modal__input" id="' + _esc(countrySelectId) + '"'
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
        html += '<label class="name-modal__label" for="' + _esc(genderSelectId) + '">Gender</label>';
        html += '<select class="name-modal__input" id="' + _esc(genderSelectId) + '" data-role="gender">';
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
                // If no name has been generated, we do not call onSelect.
                // The modal still closes; "opened and closed without
                // choosing" is a legitimate outcome.
            }
        });

        return modal;
    }

    function _bindNameGeneratorActions(root, state, onSelect) {
        var countrySelect = root.querySelector('[data-role="country"]');
        var genderSelect = root.querySelector('[data-role="gender"]');
        var previewEl = root.querySelector('[data-role="preview"]');

        function _clearPreview() {
            state.generatedName = null;
            if (previewEl) {
                previewEl.textContent = 'No name generated yet';
                previewEl.classList.remove('name-modal__preview--filled');
                previewEl.classList.add('name-modal__preview--empty');
            }
        }

        // Country or gender change invalidates any previously generated
        // name. The displayed controls must describe the value that
        // onConfirm will hand to the caller.
        if (countrySelect) countrySelect.addEventListener('change', _clearPreview);
        if (genderSelect) genderSelect.addEventListener('change', _clearPreview);

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
    // 4. SURNAME MANAGEMENT MODAL
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
     * @returns {Object} the modal handle from openModal
     * @throws {Error} when characterId is missing or invalid
     */
    function openSurnameManagementModal(characterId, onChange) {
        if (!_hasId(characterId)) {
            throw new Error('openSurnameManagementModal: characterId is required');
        }
        if (!_isMissing(onChange) && typeof onChange !== 'function') {
            throw new Error('openSurnameManagementModal: onChange must be a function');
        }

        var displayName = _getCharacterDisplayName(characterId);
        if (displayName === null) {
            throw new Error(
                'openSurnameManagementModal: character "' + characterId + '" not found'
            );
        }

        var html = _buildSurnameManagementContent(characterId);

        var modal = window.openModal({
            titleHtml: _esc('Surname: ' + displayName),
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
     *
     * Assumption: NameQueries.getSurnameChanges returns entries in
     * chronological order (oldest first). The last entry is the current
     * surname. This is a domain invariant enforced by NameCommands, which
     * appends. If that ever changes, this rendering changes with it.
     */
    function _buildSurnameManagementContent(characterId) {
        var changes = window.NameQueries.getSurnameChanges(characterId);
        var birthSurname = window.NameQueries.getBirthSurname(characterId);
        var currentSurname = window.NameQueries.getCurrentSurname(characterId);

        // Birth surname query returns null when no history exists.
        // Distinguish that from "empty birth surname".
        var birthSurnameForDisplay = _isMissing(birthSurname) ? '' : birthSurname;

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

        if (changes.length === 0) {
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
     *
     * The delegated click handler lives on `root`, not on the body, so
     * rebuilding the body does not detach it. No rebinding is needed.
     *
     * If the modal body is not found, this throws. Replacing `root`
     * would destroy the modal shell, focus management, close controls,
     * and accessibility structure. That is not a recoverable fallback.
     */
    function _refreshSurnameModalContent(root, characterId) {
        var contentHost = root.querySelector('.modal-body');
        if (!contentHost) {
            throw new Error(
                'modals-name.js: modal body not found; cannot refresh surname content'
            );
        }
        contentHost.innerHTML = _buildSurnameManagementContent(characterId);
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.openNameGeneratorModal = openNameGeneratorModal;
    window.openSurnameManagementModal = openSurnameManagementModal;

})();
