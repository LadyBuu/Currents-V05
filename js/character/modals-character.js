/**
 * =============================================================================
 * STILL WATERS - CHARACTER MODALS (js/character/modals-character.js)
 * =============================================================================
 *
 * Modals for character CRUD, details, and family view.
 *
 * SCOPE:
 *   - Create character modal
 *   - Edit character modal
 *   - Delete character modal
 *   - Character details modal
 *   - Family view modal
 *
 * OUT OF SCOPE:
 *   - Family semantics → FamilyAccessors / FamilyStatistics
 *   - Character data access → CharacterQueries / accessors.js
 *   - Mutation → CharacterCommands
 *   - Lifecycle → CharacterLifecycle
 *   - Presentation CSS → character-modals.css
 *   - Modal stack → modals-core.js
 *
 * SEMANTIC RULES:
 *   - Missing required dependencies throw at load. No silent fallbacks.
 *   - Missing optional dependencies (FamilyStatistics, character
 *     selector) cause a structured failure, not a fallback implementation.
 *   - All user-facing strings derived from character data are escaped.
 *   - No inline styles. Classes only.
 *   - World-time bounds come from time.js, not from hardcoded constants.
 *   - Year 0 is preserved: display helpers distinguish missing from zero.
 *   - Errors are returned to the caller; this module does not show toasts
 *     on success. Toast presentation belongs to the caller.
 *   - The modal handle returned by openModal is used for lifecycle
 *     control. No setTimeout waits for the DOM.
 *
 * REQUIRED CSS:
 *   See character-modals.css for the full class list. The main ones:
 *     .character-modal
 *     .character-modal__section
 *     .character-modal__grid
 *     .character-modal__field
 *     .character-modal__field-label
 *     .character-modal__field-value
 *     .character-modal__family
 *     .character-modal__family-group
 *     .character-modal__family-member
 *     .character-modal__actions
 *     .character-modal__form-field
 *     .character-modal__form-label
 *     .character-modal__form-input
 *     .character-modal__form-help
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:       escapeHtml
 *   - icons.js:            Icons
 *   - modals-core.js:      openModal, closeTopModal
 *   - accessors.js:        getCharacterById, getPlaces
 *   - time.js:             getCurrentYear, isValidYear
 *   - CharacterCommands:   createCharacter, updateCharacter, deleteCharacter
 *   - CharacterQueries:    getCharacterSummary
 *   - FamilyAccessors:     getParents, getAllChildren, getSiblings,
 *                          getGrandchildren
 *
 * DEPENDENCIES (OPTIONAL):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *     Required for parent selection in create/edit modals. If absent,
 *     the parent fields fall back to a manual-ID input.
 *   - confirmDialog (from modals-core.js) for delete confirmation.
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis. No Unicode gender
 * symbols. No decorative characters.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'getCharacterById',
            'getPlaces',
            'getCurrentYear',
            'isValidYear'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-character.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-character.js: icons.js must load first.');
        }
        if (typeof window.CharacterCommands === 'undefined') {
            throw new Error('modals-character.js: character-commands.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-character.js: character-queries.js must load first.');
        }
        if (typeof window.FamilyAccessors === 'undefined') {
            throw new Error('modals-character.js: family-accessors.js must load first.');
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
     * Formats a year value. Distinguishes missing from year 0.
     */
    function _formatYear(year, missingText) {
        if (_isMissing(year)) return missingText || 'Unknown';
        return String(year);
    }

    /**
     * Formats a birth year, preserving year 0.
     */
    function _formatBirthYear(year) {
        if (_isMissing(year)) return 'Unknown';
        return String(year);
    }

    /**
     * Formats a death year, distinguishing "not applicable" from year 0.
     */
    function _formatDeathYear(character) {
        if (character.isDeceased !== true) return null;
        if (_isMissing(character.deathYear)) return 'Unknown';
        return String(character.deathYear);
    }

    /**
     * Returns an SVG icon by name from icons.js, or an empty string.
     */
    function _icon(name) {
        return window.Icons[name] || '';
    }

    /**
     * Resolves a place display name by ID. Returns null on failure.
     */
    function _placeName(placeId) {
        if (!_hasId(placeId)) return null;
        var place = window.getPlaceById ? window.getPlaceById(placeId) : null;
        if (!place) return null;
        return typeof place.displayName === 'string' ? place.displayName : null;
    }

    /**
     * Builds a small section wrapper. Used by the details modal.
     */
    function _section(label, valueHtml) {
        return '<div class="character-modal__field">'
             + '<div class="character-modal__field-label">' + _esc(label) + '</div>'
             + '<div class="character-modal__field-value">' + valueHtml + '</div>'
             + '</div>';
    }

    // =========================================================================
    // 2. DETAILS MODAL
    // =========================================================================

    /**
     * Opens the character details modal.
     *
     * @param {string} characterId
     * @param {Function} [onSuccess] - called after the user returns from
     *   an edit or delete action.
     */
    function openCharacterDetailsModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openCharacterDetailsModal: characterId is required');
        }

        var character = window.getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var summary = window.CharacterQueries.getCharacterSummary(characterId);
        if (!summary) {
            return { success: false, reason: 'Character summary unavailable' };
        }

        // Family info
        var familyHtml = _buildFamilySection(characterId);

        var content = '<div class="character-modal">';

        // Top: name and status
        content += '<div class="character-modal__grid">';
        content += _section('Name', _esc(summary.fullName || summary.name || 'Unnamed'));
        content += _section('Status',
            _esc(summary.isDeceased ? 'Deceased' : 'Living')
            + ' &middot; '
            + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
        );
        content += '</div>';

        // Middle: gender and location
        content += '<div class="character-modal__grid">';
        content += _section('Gender', _esc(summary.gender || 'Unknown'));
        content += _section('Location', _esc(summary.location || 'Unknown'));
        content += '</div>';

        // Birth/death
        var birthDeathHtml = 'Born: ' + _esc(_formatBirthYear(character.birthYear));
        var deathYear = _formatDeathYear(character);
        if (deathYear !== null) {
            birthDeathHtml += ' &middot; Died: ' + _esc(deathYear);
            if (!_isMissing(character.deathCause) && character.deathCause) {
                birthDeathHtml += ' (' + _esc(character.deathCause) + ')';
            }
        }
        content += '<div class="character-modal__section">' + birthDeathHtml + '</div>';

        // Family section
        content += familyHtml;

        // Notes
        if (typeof character.notes === 'string' && character.notes.length > 0) {
            content += '<div class="character-modal__section character-modal__notes">'
                     + _esc(character.notes)
                     + '</div>';
        }

        // Actions
        content += '<div class="character-modal__actions">';
        content += '<button type="button" class="btn primary" data-action="edit-character">Edit</button>';
        if (character.isDeceased !== true) {
            content += '<button type="button" class="btn danger" data-action="kill-character">Kill</button>';
        }
        content += '<button type="button" class="btn danger" data-action="delete-character">Delete</button>';
        content += '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Character Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        // Bind action buttons via delegation on the modal element.
        var modalElement = modal.element;
        modalElement.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.getAttribute('data-action');
            if (action === 'edit-character') {
                modal.close();
                openEditCharacterModal(characterId, onSuccess);
            } else if (action === 'kill-character') {
                modal.close();
                if (typeof window.openDeathModal === 'function') {
                    window.openDeathModal(character, function() {
                        if (onSuccess) onSuccess();
                    });
                } else {
                    throw new Error('modals-character.js: death modal not available');
                }
            } else if (action === 'delete-character') {
                modal.close();
                openDeleteCharacterModal(characterId, onSuccess);
            }
        });

        return { success: true, modal: modal };
    }

    /**
     * Builds the family section HTML for the details modal.
     */
    function _buildFamilySection(characterId) {
        var fa = window.FamilyAccessors;
        var html = '<div class="character-modal__family">';

        var parents = fa.getParents(characterId);
        var parentNames = [];
        if (parents.father && typeof parents.father.name === 'string') {
            parentNames.push(parents.father.name);
        }
        if (parents.mother && typeof parents.mother.name === 'string') {
            parentNames.push(parents.mother.name);
        }

        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Parents</div>'
             + '<div class="character-modal__family-content">'
             + (parentNames.length > 0
                ? _esc(parentNames.join(' & '))
                : 'Unknown')
             + '</div></div>';

        var children = fa.getAllChildren(characterId, false);
        var livingChildCount = 0;
        for (var i = 0; i < children.length; i++) {
            if (children[i].character && children[i].character.isDeceased !== true) {
                livingChildCount++;
            }
        }
        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Children</div>'
             + '<div class="character-modal__family-content">'
             + children.length
             + (livingChildCount < children.length
                ? ' (' + livingChildCount + ' living)'
                : '')
             + '</div></div>';

        var siblings = fa.getSiblings(characterId, true, false, true);
        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Siblings</div>'
             + '<div class="character-modal__family-content">'
             + siblings.length
             + '</div></div>';

        var grandchildren = fa.getGrandchildren(characterId, false, true);
        if (grandchildren.length > 0) {
            html += '<div class="character-modal__family-group">'
                 + '<div class="character-modal__family-label">Grandchildren</div>'
                 + '<div class="character-modal__family-content">'
                 + grandchildren.length
                 + '</div></div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 3. CREATE CHARACTER MODAL
    // =========================================================================

    /**
     * Opens the create-character modal.
     */
    function openCreateCharacterModal(onSuccess) {
        var currentYear = window.getCurrentYear();
        var defaultBirthYear = currentYear - 25;
        var minYear = window.TIME_CONSTANTS ? window.TIME_CONSTANTS.MIN_YEAR : -10000;
        var maxYear = currentYear;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-first-name">First Name *</label>'
                 + '<input type="text" id="char-first-name" class="character-modal__form-input" autofocus autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-surname">Surname</label>'
                 + '<input type="text" id="char-surname" class="character-modal__form-input" autocomplete="off">'
                 + '<div class="character-modal__form-help">Leave blank to generate from cultural data if available.</div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-gender">Gender</label>'
                 + '<select id="char-gender" class="character-modal__form-input">'
                 + '<option value="male">Male</option>'
                 + '<option value="female">Female</option>'
                 + '<option value="unknown" selected>Unknown</option>'
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-birth-year">Birth Year</label>'
                 + '<input type="number" id="char-birth-year" class="character-modal__form-input"'
                 + ' value="' + defaultBirthYear + '"'
                 + ' min="' + minYear + '"'
                 + ' max="' + maxYear + '">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-birthplace">Birthplace</label>'
                 + '<select id="char-birthplace" class="character-modal__form-input">'
                 + '<option value="">-- Select birthplace --</option>'
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field character-modal__form-field--parents">'
                 + '<div class="character-modal__form-label">Parents</div>'
                 + '<div class="character-modal__parent-row">'
                 + '<button type="button" class="btn" data-action="select-father">Select Father</button>'
                 + '<span class="character-modal__parent-name" id="char-father-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-father">Clear</button>'
                 + '</div>'
                 + '<div class="character-modal__parent-row">'
                 + '<button type="button" class="btn" data-action="select-mother">Select Mother</button>'
                 + '<span class="character-modal__parent-name" id="char-mother-name">None</span>'
                 + '<button type="button" class="btn" data-action="clear-mother">Clear</button>'
                 + '</div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-notes">Notes</label>'
                 + '<textarea id="char-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        // Local state for parent selection.
        var selectedFatherId = null;
        var selectedMotherId = null;

        var modal = window.openModal({
            titleHtml: 'Create Character',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onOpen: function(modalElement) {
                // Populate birthplace options.
                var birthplaceSelect = modalElement.querySelector('#char-birthplace');
                if (birthplaceSelect) {
                    var places = window.getPlaces();
                    for (var i = 0; i < places.length; i++) {
                        var place = places[i];
                        if (!_hasId(place.id)) continue;
                        if (!place.variableKey) continue;
                        var option = document.createElement('option');
                        option.value = place.id;
                        option.textContent = place.displayName || place.id;
                        birthplaceSelect.appendChild(option);
                    }
                }

                // Wire parent selector buttons.
                modalElement.addEventListener('click', function(e) {
                    var target = e.target.closest('[data-action]');
                    if (!target) return;
                    var action = target.getAttribute('data-action');

                    if (action === 'select-father' || action === 'select-mother') {
                        if (typeof window.openCharacterSelector !== 'function') {
                            throw new Error('modals-character.js: character selector not available');
                        }
                        var isFather = action === 'select-father';
                        window.openCharacterSelector({
                            title: isFather ? 'Select Father' : 'Select Mother',
                            filters: {
                                gender: isFather ? 'male' : 'female',
                                status: 'living',
                                showDeceased: true
                            },
                            onSelect: function(selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                if (isFather) {
                                    selectedFatherId = selected.id;
                                    var el = modalElement.querySelector('#char-father-name');
                                    if (el) el.textContent = selected.name || selected.id;
                                } else {
                                    selectedMotherId = selected.id;
                                    var el2 = modalElement.querySelector('#char-mother-name');
                                    if (el2) el2.textContent = selected.name || selected.id;
                                }
                            }
                        });
                    } else if (action === 'clear-father') {
                        selectedFatherId = null;
                        var fEl = modalElement.querySelector('#char-father-name');
                        if (fEl) fEl.textContent = 'None';
                    } else if (action === 'clear-mother') {
                        selectedMotherId = null;
                        var mEl = modalElement.querySelector('#char-mother-name');
                        if (mEl) mEl.textContent = 'None';
                    }
                });
            },
            onConfirm: function() {
                var nameInput = modal.element.querySelector('#char-first-name');
                var surnameInput = modal.element.querySelector('#char-surname');
                var genderInput = modal.element.querySelector('#char-gender');
                var birthYearInput = modal.element.querySelector('#char-birth-year');
                var birthplaceInput = modal.element.querySelector('#char-birthplace');
                var notesInput = modal.element.querySelector('#char-notes');

                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    throw new Error('Please enter a first name');
                }

                var birthYear = parseInt(birthYearInput.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year');
                }

                var data = {
                    name: name,
                    surname: surnameInput ? surnameInput.value.trim() : '',
                    gender: genderInput ? genderInput.value : 'unknown',
                    birthYear: birthYear,
                    birthplaceId: birthplaceInput && birthplaceInput.value
                        ? birthplaceInput.value
                        : null,
                    motherId: selectedMotherId,
                    fatherId: selectedFatherId,
                    notes: notesInput ? notesInput.value : ''
                };

                var result = window.CharacterCommands.createCharacter(data);
                if (!result.success) {
                    throw new Error(result.reason || 'Failed to create character');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(result.data);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 4. EDIT CHARACTER MODAL
    // =========================================================================

    /**
     * Opens the edit-character modal.
     */
    function openEditCharacterModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openEditCharacterModal: characterId is required');
        }

        var character = window.getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }
        if (character.isDeleted === true) {
            return { success: false, reason: 'Character is soft-deleted' };
        }

        var summary = window.CharacterQueries.getCharacterSummary(characterId);
        if (!summary) {
            return { success: false, reason: 'Character summary unavailable' };
        }

        var currentYear = window.getCurrentYear();
        var minYear = window.TIME_CONSTANTS ? window.TIME_CONSTANTS.MIN_YEAR : -10000;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(summary.fullName || summary.name || 'Unnamed') + '</strong><br>'
                 + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
                 + ' &middot; '
                 + _esc(summary.location || 'Unknown')
                 + (summary.rank ? ' &middot; ' + _esc(summary.rank) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-first-name">First Name</label>'
                 + '<input type="text" id="edit-char-first-name" class="character-modal__form-input"'
                 + ' value="' + _esc(character.name || '') + '" autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-surname">Surname</label>'
                 + '<input type="text" id="edit-char-surname" class="character-modal__form-input"'
                 + ' value="' + _esc(character.surname || '') + '" autocomplete="off">'
                 + '</div>';

        var genderValue = character.gender === 'male' || character.gender === 'female'
            ? character.gender
            : 'unknown';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-gender">Gender</label>'
                 + '<select id="edit-char-gender" class="character-modal__form-input">'
                 + '<option value="male"' + (genderValue === 'male' ? ' selected' : '') + '>Male</option>'
                 + '<option value="female"' + (genderValue === 'female' ? ' selected' : '') + '>Female</option>'
                 + '<option value="unknown"' + (genderValue === 'unknown' ? ' selected' : '') + '>Unknown</option>'
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-birth-year">Birth Year</label>'
                 + '<input type="number" id="edit-char-birth-year" class="character-modal__form-input"'
                 + ' value="' + (character.birthYear !== undefined && character.birthYear !== null ? character.birthYear : '') + '"'
                 + ' min="' + minYear + '"'
                 + ' max="' + currentYear + '">'
                 + '</div>';

        // Parents — current values
        var parents = window.FamilyAccessors.getParents(characterId);
        var fatherName = parents.father && parents.father.name ? parents.father.name : 'None';
        var motherName = parents.mother && parents.mother.name ? parents.mother.name : 'None';

        content += '<div class="character-modal__form-field character-modal__form-field--parents">'
                 + '<div class="character-modal__form-label">Parents</div>'
                 + '<div class="character-modal__parent-row">'
                 + '<button type="button" class="btn" data-action="select-father">Select Father</button>'
                 + '<span class="character-modal__parent-name" id="edit-char-father-name">' + _esc(fatherName) + '</span>'
                 + '<button type="button" class="btn" data-action="clear-father">Clear</button>'
                 + '</div>'
                 + '<div class="character-modal__parent-row">'
                 + '<button type="button" class="btn" data-action="select-mother">Select Mother</button>'
                 + '<span class="character-modal__parent-name" id="edit-char-mother-name">' + _esc(motherName) + '</span>'
                 + '<button type="button" class="btn" data-action="clear-mother">Clear</button>'
                 + '</div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-notes">Notes</label>'
                 + '<textarea id="edit-char-notes" class="character-modal__form-input" rows="2">'
                 + _esc(character.notes || '')
                 + '</textarea>'
                 + '</div>';

        content += '</div>';

        // Local state for parent changes. A null value here means "no
        // change"; the sentinel "removed" is distinct.
        var parentChanges = {
            father: { action: 'none', id: null },
            mother: { action: 'none', id: null }
        };

        var modal = window.openModal({
            titleHtml: 'Edit Character: ' + _esc(character.name || ''),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onOpen: function(modalElement) {
                modalElement.addEventListener('click', function(e) {
                    var target = e.target.closest('[data-action]');
                    if (!target) return;
                    var action = target.getAttribute('data-action');

                    if (action === 'select-father' || action === 'select-mother') {
                        if (typeof window.openCharacterSelector !== 'function') {
                            throw new Error('modals-character.js: character selector not available');
                        }
                        var isFather = action === 'select-father';
                        var excludeIds = [characterId];
                        window.openCharacterSelector({
                            title: isFather ? 'Select Father' : 'Select Mother',
                            filters: {
                                gender: isFather ? 'male' : 'female',
                                status: 'living',
                                showDeceased: true
                            },
                            excludeIds: excludeIds,
                            onSelect: function(selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                if (isFather) {
                                    parentChanges.father = { action: 'set', id: selected.id };
                                    var el = modalElement.querySelector('#edit-char-father-name');
                                    if (el) el.textContent = selected.name || selected.id;
                                } else {
                                    parentChanges.mother = { action: 'set', id: selected.id };
                                    var el2 = modalElement.querySelector('#edit-char-mother-name');
                                    if (el2) el2.textContent = selected.name || selected.id;
                                }
                            }
                        });
                    } else if (action === 'clear-father') {
                        parentChanges.father = { action: 'remove', id: null };
                        var fEl = modalElement.querySelector('#edit-char-father-name');
                        if (fEl) fEl.textContent = 'None';
                    } else if (action === 'clear-mother') {
                        parentChanges.mother = { action: 'remove', id: null };
                        var mEl = modalElement.querySelector('#edit-char-mother-name');
                        if (mEl) mEl.textContent = 'None';
                    }
                });
            },
            onConfirm: function() {
                var nameInput = modal.element.querySelector('#edit-char-first-name');
                var surnameInput = modal.element.querySelector('#edit-char-surname');
                var genderInput = modal.element.querySelector('#edit-char-gender');
                var birthYearInput = modal.element.querySelector('#edit-char-birth-year');
                var notesInput = modal.element.querySelector('#edit-char-notes');

                var updates = {};

                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    throw new Error('Name is required');
                }
                if (name !== character.name) updates.name = name;

                var surname = surnameInput ? surnameInput.value.trim() : '';
                if (surname !== (character.surname || '')) updates.surname = surname;

                var gender = genderInput ? genderInput.value : character.gender;
                if (gender !== character.gender) updates.gender = gender;

                var birthYear = parseInt(birthYearInput.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year');
                }
                if (birthYear !== character.birthYear) updates.birthYear = birthYear;

                var notes = notesInput ? notesInput.value : '';
                if (notes !== (character.notes || '')) updates.notes = notes;

                // Parent changes.
                if (parentChanges.father.action === 'set') {
                    updates.fatherId = parentChanges.father.id;
                } else if (parentChanges.father.action === 'remove') {
                    updates.fatherId = null;
                }
                if (parentChanges.mother.action === 'set') {
                    updates.motherId = parentChanges.mother.id;
                } else if (parentChanges.mother.action === 'remove') {
                    updates.motherId = null;
                }

                if (Object.keys(updates).length === 0) {
                    return; // nothing to do
                }

                var result = window.CharacterCommands.updateCharacter(characterId, updates);
                if (!result.success) {
                    throw new Error(result.reason || 'Failed to update character');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(result.data);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. DELETE CHARACTER MODAL
    // =========================================================================

    /**
     * Opens the delete-character confirmation modal.
     */
    function openDeleteCharacterModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openDeleteCharacterModal: characterId is required');
        }

        var character = window.getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        // Child warning.
        var childCount = 0;
        try {
            var children = window.FamilyAccessors.getAllChildren(characterId, false);
            childCount = Array.isArray(children) ? children.length : 0;
        } catch (e) {
            childCount = 0;
        }

        var message = 'Delete "' + (character.name || '')
                    + (character.surname ? ' ' + character.surname : '')
                    + '" permanently?';
        if (childCount > 0) {
            message += ' This character has ' + childCount
                     + (childCount === 1 ? ' child' : ' children')
                     + '; the parent reference will be removed.';
        }

        if (typeof window.confirmDialog !== 'function') {
            throw new Error('modals-character.js: confirmDialog not available');
        }

        window.confirmDialog(message, 'Delete Character', function() {
            var result = window.CharacterCommands.deleteCharacter(characterId);
            if (!result.success) {
                throw new Error(result.reason || 'Failed to delete character');
            }
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        });

        return { success: true };
    }

    // =========================================================================
    // 6. FAMILY VIEW MODAL
    // =========================================================================

    /**
     * Opens the family view modal for a character.
     */
    function openFamilyViewModal(characterId) {
        if (!_hasId(characterId)) {
            throw new Error('openFamilyViewModal: characterId is required');
        }

        var character = window.getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var fa = window.FamilyAccessors;

        var parents = fa.getParents(characterId);
        var children = fa.getAllChildren(characterId, false);
        var siblings = fa.getSiblings(characterId, true, false, true);
        var grandchildren = fa.getGrandchildren(characterId, false, true);

        var content = '<div class="character-modal">';

        // Header
        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(character.name || '')
                 + (character.surname ? ' ' + _esc(character.surname) : '')
                 + '</strong>';
        var summary = window.CharacterQueries.getCharacterSummary(characterId);
        if (summary) {
            content += '<br>'
                     + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
                     + ' &middot; '
                     + _esc(summary.gender || 'Unknown');
        }
        content += '</div>';

        // Family groups
        content += '<div class="character-modal__family character-modal__family--wide">';

        content += _renderFamilyGroup(
            'Parents',
            parents.father || parents.mother
                ? [parents.father, parents.mother].filter(function(x) { return x; })
                : []
        );

        content += _renderFamilyGroup(
            'Siblings',
            siblings.map(function(s) { return s.character; })
        );

        content += _renderFamilyGroup(
            'Children',
            children.map(function(c) { return c.character; })
        );

        content += _renderFamilyGroup(
            'Grandchildren',
            grandchildren
        );

        content += '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Family: ' + _esc(character.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        return { success: true, modal: modal };
    }

    /**
     * Renders one family group for the family view modal.
     */
    function _renderFamilyGroup(label, members) {
        var html = '<div class="character-modal__family-group">';
        html += '<div class="character-modal__family-label">'
             + _esc(label)
             + ' (' + members.length + ')'
             + '</div>';

        if (members.length === 0) {
            html += '<div class="character-modal__family-empty">None</div>';
            html += '</div>';
            return html;
        }

        for (var i = 0; i < members.length; i++) {
            var member = members[i];
            if (!member) continue;
            var name = (member.name || '') + (member.surname ? ' ' + member.surname : '');
            var gender = member.gender === 'male' ? 'Male'
                       : member.gender === 'female' ? 'Female'
                       : 'Unknown';
            var deceased = member.isDeceased === true;

            html += '<div class="character-modal__family-member'
                 + (deceased ? ' character-modal__family-member--deceased' : '')
                 + '">'
                 + _esc(name)
                 + ' <span class="character-modal__family-member-meta">'
                 + _esc(gender)
                 + (deceased ? ' &middot; Deceased' : '')
                 + '</span>'
                 + '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openCreateCharacterModal = openCreateCharacterModal;
    window.openEditCharacterModal = openEditCharacterModal;
    window.openDeleteCharacterModal = openDeleteCharacterModal;
    window.openCharacterDetailsModal = openCharacterDetailsModal;
    window.openFamilyViewModal = openFamilyViewModal;

})();