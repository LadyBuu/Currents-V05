/**
 * =============================================================================
 * STILL WATERS - NAME MODALS (modals-name.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/modals-name.js
 *
 * Name generator modal (preview random names, select one). Surname
 * history modal (view changes, revert, clear).
 *
 * CULTURE KEY
 * -----------
 * The name generator picks a culture, not a country. There is no
 * country concept in this module. See name-queries.js's header.
 *
 * PERSISTENCE: unchanged. The surname modal calls NameCommands.persist
 * after every successful command. The generator does not persist.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (culture-keyed):
 *     - Name generator's selector is a culture list. Drops
 *       getCountryPlaces from the guard.
 *     - Calls NameQueries.getRandomName(cultureId, gender).
 *   Previous revision:
 *     - _formatYear delegates to window.formatYear.
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
            'formatYear',
            'openModal',
            'confirmDialog'
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
        if (typeof window.CultureQueries === 'undefined') missing.push('CultureQueries');
        if (typeof window.NameCommands !== 'undefined'
            && typeof window.NameCommands.persist !== 'function') {
            missing.push('NameCommands.persist');
        }

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

    function _icon(name) {
        var svg = window.Icons[name];
        if (typeof svg !== 'string' || svg.length === 0) {
            throw new Error('modals-name.js: unknown icon "' + name + '"');
        }
        return svg;
    }

    function _formatYear(year, missingText) {
        if (_isMissing(year)) return missingText || '—';
        return window.formatYear(year);
    }

    function _displaySurname(surname) {
        if (typeof surname !== 'string' || surname.length === 0) {
            return '(no surname)';
        }
        return surname;
    }

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

    function _getCharacterDisplayName(characterId) {
        return window.NameQueries.getCharacterDisplayName(characterId);
    }

    function _persistOrReport(root) {
        var saveResult = window.NameCommands.persist();
        if (saveResult && saveResult.success === false) {
            _renderError(root, 'Save failed: ' + (saveResult.reason || 'unknown error'));
            return false;
        }
        return true;
    }

    // =========================================================================
    // 3. NAME GENERATOR MODAL (culture selector)
    // =========================================================================

    function openNameGeneratorModal(options) {
        if (_isMissing(options)) options = {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openNameGeneratorModal: options must be an object');
        }

        var title = _isMissing(options.title) ? 'Generate Name' : options.title;
        var initialCultureId = _isMissing(options.cultureId) ? null : options.cultureId;
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
        var cultureSelectId = instanceId + '-culture';
        var genderSelectId = instanceId + '-gender';

        var state = {
            generatedName: null
        };

        var cultures = window.CultureQueries.getAllCultures();
        if (!Array.isArray(cultures)) {
            throw new Error(
                'openNameGeneratorModal: CultureQueries.getAllCultures() did not return an array'
            );
        }

        var hasCultures = cultures.length > 0;

        var html = '';
        html += '<div class="name-modal">';

        html += '<p class="name-modal__intro">'
             + (hasCultures
                ? 'Choose a culture to draw names from its pool.'
                : 'No cultures with name data are available yet.')
             + '</p>';

        html += '<div class="name-modal__field">';
        html += '<label class="name-modal__label" for="' + _esc(cultureSelectId) + '">Culture</label>';
        html += '<select class="name-modal__input" id="' + _esc(cultureSelectId) + '"'
             + ' data-role="culture"'
             + (hasCultures ? '' : ' disabled') + '>';
        html += '<option value="">— Select culture —</option>';
        for (var ci = 0; ci < cultures.length; ci++) {
            var culture = cultures[ci];
            if (!culture || !_hasId(culture.id)) continue;
            var selected = (culture.id === initialCultureId) ? ' selected' : '';
            var label = culture.displayName || culture.name || culture.id;
            html += '<option value="' + _esc(culture.id) + '"' + selected + '>'
                 + _esc(label)
                 + '</option>';
        }
        html += '</select>';
        html += '</div>';

        html += '<div class="name-modal__field">';
        html += '<label class="name-modal__label" for="' + _esc(genderSelectId) + '">Gender</label>';
        html += '<select class="name-modal__input" id="' + _esc(genderSelectId) + '" data-role="gender">';
        html += '<option value="all"' + (initialGender === 'all' ? ' selected' : '') + '>Any</option>';
        html += '<option value="male"' + (initialGender === 'male' ? ' selected' : '') + '>Male</option>';
        html += '<option value="female"' + (initialGender === 'female' ? ' selected' : '') + '>Female</option>';
        html += '</select>';
        html += '</div>';

        html += '<div class="name-modal__button-row">';
        html += '<button type="button" class="name-modal__generate" data-action="generate">'
             + _icon('REFRESH') + ' Generate'
             + '</button>';
        html += '</div>';

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
            }
        });

        return modal;
    }

    function _bindNameGeneratorActions(root, state, onSelect) {
        var cultureSelect = root.querySelector('[data-role="culture"]');
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

        if (cultureSelect) cultureSelect.addEventListener('change', _clearPreview);
        if (genderSelect) genderSelect.addEventListener('change', _clearPreview);

        root.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action="generate"]');
            if (!target) return;

            var cultureId = cultureSelect ? cultureSelect.value : '';
            var gender = genderSelect ? genderSelect.value : 'all';

            if (!cultureId) {
                _renderError(root, 'Please choose a culture first.');
                return;
            }

            var name;
            try {
                name = window.NameQueries.getRandomName(cultureId, gender);
            } catch (err) {
                _renderError(root, err.message || 'Could not generate name.');
                return;
            }

            if (!name) {
                state.generatedName = null;
                if (previewEl) {
                    previewEl.textContent = 'No names available for this culture.';
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
    // 4. SURNAME MANAGEMENT MODAL (unchanged apart from the character projection)
    // =========================================================================

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

    function _buildSurnameManagementContent(characterId) {
        var changes = window.NameQueries.getSurnameChanges(characterId);
        var birthSurname = window.NameQueries.getBirthSurname(characterId);
        var currentSurname = window.NameQueries.getCurrentSurname(characterId);

        var birthSurnameForDisplay = _isMissing(birthSurname) ? '' : birthSurname;

        var html = '';
        html += '<div class="name-modal">';

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
                _persistOrReport(root);
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
                        _persistOrReport(root);
                        _refreshSurnameModalContent(root, characterId);
                        if (onChange) onChange();
                    }
                );
                return;
            }
        });
    }

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
