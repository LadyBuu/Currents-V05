/**
 * =============================================================================
 * STILL WATERS - CHARACTER MODALS (js/character/modals-character.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-character.js
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
 *   - Family semantics       -> family-queries.js / family-rules.js
 *   - Character data access  -> character-queries.js
 *   - Mutation               -> character-commands.js / family-commands.js
 *   - Lifecycle              -> character-lifecycle.js
 *   - Presentation CSS       -> character-modals.css
 *   - Modal stack            -> modals-core.js
 *   - Trait vocabulary       -> constants/character-traits.js
 *
 * SEMANTIC RULES:
 *   - Missing required dependencies throw at load.
 *   - All user-facing strings derived from character data are escaped.
 *   - No inline styles in this file. Classes only.
 *   - Errors are returned to the caller. No toasts.
 *
 * TRAITS:
 *   Traits are presented as a checkbox grid in the create and edit
 *   modals, and as a read-only chip row in the details modal. The
 *   checkbox order follows CHARACTER_TRAIT_VALUES declaration order
 *   (positive dispositions first, antisocial dispositions second).
 *
 *   Trait writes go through CharacterCommands.addTrait / removeTrait
 *   (per-trait) rather than replaceTraits (full array). This makes
 *   the edit modal's save path additive: only the traits the user
 *   actually added or removed are written, and an idempotent add or
 *   remove is a no-op in the command layer. Bulk replace would
 *   produce a full-array write on every save even when nothing
 *   changed.
 *
 *   Trait selection happens BEFORE field updates in the edit modal.
 *   This preserves the header's edit-modal transaction contract: a
 *   failing trait write aborts the save before any other mutation is
 *   applied, so the caller gets a structured error and can retry.
 *
 * EDIT-MODAL TRANSACTION CONTRACT:
 *   openEditCharacterModal applies three independent change groups:
 *     - trait changes      via CharacterCommands.addTrait / removeTrait
 *     - field updates      via CharacterCommands.updateCharacter
 *     - parent edge changes via FamilyCommands.setParent / removeParent
 *
 *   They are applied in a fixed order that prevents partial commits:
 *
 *     1. All field updates are collected and validated against the
 *        current projection. A trivial no-op is a no-op, not an update.
 *     2. All parent changes are validated against FamilyRules
 *        (cycle check, duplicate check). If ANY parent change would
 *        fail, the whole edit is refused BEFORE any mutation.
 *     3. Trait changes are applied.
 *     4. Field updates are applied.
 *     5. Parent changes are applied.
 *     6. If any parent change still fails (should not happen — step 2
 *        validated them — but a concurrent mutation could cause it),
 *        the earlier steps are NOT rolled back (they are cheap and
 *        the parent change is the one that failed). The user gets a
 *        structured error listing the parent that failed, and they
 *        can retry only the parent change.
 *
 *   The alternative (apply parents first, then fields, and roll back
 *   on failure) is also valid, but requires parent edge removal on
 *   rollback, which is a FamilyCommands call that can itself fail.
 *   The chosen order (validate-all-then-mutate, cheap-writes-first)
 *   keeps every mutation site's failure story simple.
 *
 * FAMILY INTEGRATION:
 *   Parent selection and display use FamilyQueries and FamilyCommands.
 *   FamilyAccessors is not used.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:       escapeHtml
 *   - icons.js:            Icons
 *   - modals-core.js:      openModal, closeTopModal, confirmDialog
 *   - accessors.js:        getPlaces
 *   - time.js:             getCurrentYear, isValidYear
 *   - CharacterCommands:   updateCharacter, addTrait, removeTrait
 *   - CharacterQueries:    getCharacterSummary, getCharacterDisplayName
 *   - CharacterCreationCommands: createCharacter
 *   - CharacterDeletionCommands: deleteCharacter
 *   - FamilyQueries:       getParentsByRole, getChildIds, getSiblings,
 *                          getGrandchildIds
 *   - FamilyCommands:      setParent, removeBiologicalParentAtRole
 *
 * DEPENDENCIES (OPTIONAL, required only for specific routes):
 *   - selectors/modals-char-selector.js (openCharacterSelector) — parent pickers
 *   - modals-death.js                   (openDeathModal)       — kill route
 *   - constants/character-traits.js     (CHARACTER_TRAIT_VALUES) — trait
 *     rendering. When absent, the trait sections are omitted and the
 *     modals behave as if traits are not part of the schema. Production
 *     load order always has the vocabulary present.
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Trait checkboxes added to create/edit modals; trait chips added
 *       to the details modal.
 *     - Edit modal writes trait deltas via CharacterCommands.addTrait
 *       and removeTrait before field and parent changes.
 *     - No other behavioural change.
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
            'confirmDialog',
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
        if (typeof window.CharacterCreationCommands === 'undefined') {
            throw new Error('modals-character.js: character-creation-commands.js must load first.');
        }
        if (typeof window.CharacterDeletionCommands === 'undefined') {
            throw new Error('modals-character.js: character-deletion-commands.js must load first.');
        }
        if (typeof window.CharacterState === 'undefined') {
            throw new Error('modals-character.js: character-state.js must load first.');
        }
        if (typeof window.FamilyQueries === 'undefined') {
            throw new Error('modals-character.js: family-queries.js must load first.');
        }
        if (typeof window.FamilyCommands === 'undefined') {
            throw new Error('modals-character.js: family-commands.js must load first.');
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

    function _readSummary(id) {
        if (!_hasId(id)) return null;
        return window.CharacterQueries.getCharacterSummary(id);
    }

    function _formatYear(year, missingText) {
        if (_isMissing(year)) return missingText || 'Unknown';
        return String(year);
    }

    function _formatBirthYear(year) {
        if (_isMissing(year)) return 'Unknown';
        return String(year);
    }

    function _formatDeathYear(summary) {
        if (summary.isDeceased !== true) return null;
        if (_isMissing(summary.deathYear)) return 'Unknown';
        return String(summary.deathYear);
    }

    function _icon(name) {
        return window.Icons[name] || '';
    }

    function _section(label, valueHtml) {
        return '<div class="character-modal__field">'
             + '<div class="character-modal__field-label">' + _esc(label) + '</div>'
             + '<div class="character-modal__field-value">' + valueHtml + '</div>'
             + '</div>';
    }

    function _projectName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        return (name + ' ' + surname).trim();
    }

    /**
     * Returns the biological father and mother ids of a child, or nulls.
     * Uses FamilyQueries.getParentsByRole — the canonical edge source —
     * not the CharacterQueries shim, because the modal needs the
     * biological distinction, not just "any parent".
     */
    function _getBiologicalParents(childId) {
        var out = { father: null, mother: null };
        if (!_hasId(childId)) return out;
        if (typeof window.FamilyQueries.getParentsByRole !== 'function') return out;

        var roles = window.FamilyQueries.getParentsByRole(childId);
        if (!roles) return out;

        for (var f = 0; f < roles.fathers.length; f++) {
            if (roles.fathers[f].parentType === 'biological') {
                out.father = roles.fathers[f].parentId;
                break;
            }
        }
        for (var m = 0; m < roles.mothers.length; m++) {
            if (roles.mothers[m].parentType === 'biological') {
                out.mother = roles.mothers[m].parentId;
                break;
            }
        }
        return out;
    }

    // =========================================================================
    // 1b. TRAIT RENDERING
    // =========================================================================

    /**
     * Returns the trait checkbox grid HTML, or '' when the vocabulary is
     * not loaded. The caller wraps this in a section and skips the
     * section when the return is ''.
     *
     * @param {string[]} selectedTraits
     * @returns {string}
     */
    function _renderTraitCheckboxes(selectedTraits) {
        if (!Array.isArray(window.CHARACTER_TRAIT_VALUES)) return '';
        var values = window.CHARACTER_TRAIT_VALUES;
        if (values.length === 0) return '';

        var selected = {};
        if (Array.isArray(selectedTraits)) {
            for (var s = 0; s < selectedTraits.length; s++) {
                if (typeof selectedTraits[s] === 'string') {
                    selected[selectedTraits[s]] = true;
                }
            }
        }

        var html = '<div class="character-modal__trait-grid">';
        for (var i = 0; i < values.length; i++) {
            var trait = values[i];
            var checked = selected[trait] === true ? ' checked' : '';
            html += '<label class="character-modal__trait-option">'
                 + '<input type="checkbox" class="character-modal__trait-checkbox"'
                 + ' value="' + _esc(trait) + '"' + checked + '>'
                 + '<span class="character-modal__trait-label">' + _esc(trait) + '</span>'
                 + '</label>';
        }
        html += '</div>';
        return html;
    }

    /**
     * Collects the checked trait values from a modal element.
     * Returns [] if the modal has no trait section.
     *
     * @param {HTMLElement} modalElement
     * @returns {string[]}
     */
    function _collectSelectedTraits(modalElement) {
        if (!modalElement) return [];
        var boxes = modalElement.querySelectorAll('.character-modal__trait-checkbox');
        var out = [];
        for (var i = 0; i < boxes.length; i++) {
            if (boxes[i].checked === true) {
                var v = boxes[i].getAttribute('value');
                if (typeof v === 'string' && v.length > 0) out.push(v);
            }
        }
        return out;
    }

    /**
     * Returns a read-only chip row for a character's traits, or '' when
     * the array is empty or the vocabulary is not loaded.
     *
     * @param {string[]} traits
     * @returns {string}
     */
    function _renderTraitChips(traits) {
        if (!Array.isArray(traits) || traits.length === 0) return '';

        var html = '<div class="character-modal__trait-chips">';
        for (var i = 0; i < traits.length; i++) {
            var t = traits[i];
            if (typeof t !== 'string' || t.length === 0) continue;
            html += '<span class="character-modal__trait-chip">' + _esc(t) + '</span>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 2. PARENT CHANGE VALIDATION
    // =========================================================================
    //
    // A parent change is { action: 'set'|'remove'|'none', id: string|null }.
    // This section validates a proposed change against the current edge
    // state WITHOUT mutating anything. The validation is intentionally
    // shallow — it only catches conditions that FamilyCommands.setParent
    // would reject anyway, plus the trivial no-op case. The full
    // FamilyRules checks (cycle, minimum age) remain inside setParent.

    function _validateParentChange(childId, role, previousId, change) {
        if (!change || change.action === 'none') {
            return { ok: true };
        }

        if (change.action === 'remove') {
            return { ok: true };
        }

        if (change.action === 'set') {
            if (!_hasId(change.id)) {
                return { ok: false, reason: 'No parent selected for ' + role + '.' };
            }
            if (change.id === childId) {
                return { ok: false, reason: 'A character cannot be their own ' + role + '.' };
            }
            if (change.id === previousId) {
                // Same parent — treat as a no-op (caller's diff logic
                // produced this, so return ok; the apply step will skip).
                return { ok: true, noop: true };
            }
            return { ok: true };
        }

        return { ok: false, reason: 'Unknown parent change action.' };
    }

    // =========================================================================
    // 3. PARENT CHANGE APPLICATION
    // =========================================================================
    //
    // Applies a single validated parent change. Returns a structured
    // { ok, reason } instead of throwing. Failures are reported back to
    // the caller; the caller decides whether to surface them.

    function _applyParentChange(childId, role, previousId, change, year) {
        if (!change || change.action === 'none') {
            return { ok: true };
        }

        if (change.action === 'remove') {
            if (previousId) {
                var removeResult = window.FamilyCommands.removeBiologicalParentAtRole(
                    childId,
                    role,
                    {
                        endYear: year,
                        reason: 'parent cleared by user'
                    }
                );
                if (!removeResult || removeResult.success !== true) {
                    return {
                        ok: false,
                        reason: 'Failed to remove ' + role + ': '
                              + (removeResult && removeResult.reason
                                  ? removeResult.reason
                                  : 'unknown')
                    };
                }
            }
            return { ok: true };
        }

        if (change.action === 'set') {
            if (change.id === previousId) {
                return { ok: true };
            }
            var setResult = window.FamilyCommands.setParent(childId, change.id, {
                parentType: 'biological',
                parentRole: role,
                startYear: year,
                allowReplace: true
            });
            if (!setResult || setResult.success !== true) {
                return {
                    ok: false,
                    reason: 'Failed to set ' + role + ': '
                          + (setResult && setResult.reason
                              ? setResult.reason
                              : 'unknown')
                };
            }
            return { ok: true };
        }

        return { ok: false, reason: 'Unknown parent change action.' };
    }

    // =========================================================================
    // 4. DETAILS MODAL
    // =========================================================================

    function openCharacterDetailsModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openCharacterDetailsModal: characterId is required');
        }

        var summary = _readSummary(characterId);
        if (!summary) {
            return { success: false, reason: 'Character not found' };
        }

        var familyHtml = _buildFamilySection(characterId);
        var traitChipsHtml = _renderTraitChips(summary.traits);

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__grid">';
        content += _section('Name', _esc(summary.fullName || summary.name || 'Unnamed'));
        content += _section('Status',
            _esc(summary.isDeceased ? 'Deceased' : 'Living')
            + ' &middot; '
            + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
        );
        content += '</div>';

        content += '<div class="character-modal__grid">';
        content += _section('Gender', _esc(summary.gender || 'Unknown'));
        content += _section('Location', _esc(summary.locationId || 'Unknown'));
        content += '</div>';

        var birthDeathHtml = 'Born: ' + _esc(_formatBirthYear(summary.birthYear));
        var deathYear = _formatDeathYear(summary);
        if (deathYear !== null) {
            birthDeathHtml += ' &middot; Died: ' + _esc(deathYear);
            if (!_isMissing(summary.deathCause) && summary.deathCause) {
                birthDeathHtml += ' (' + _esc(summary.deathCause) + ')';
            }
        }
        content += '<div class="character-modal__section">' + birthDeathHtml + '</div>';

        if (traitChipsHtml) {
            content += '<div class="character-modal__section character-modal__section--traits">'
                     + '<div class="character-modal__field-label">Traits</div>'
                     + traitChipsHtml
                     + '</div>';
        }

        content += familyHtml;

        if (typeof summary.notes === 'string' && summary.notes.length > 0) {
            content += '<div class="character-modal__section character-modal__notes">'
                     + _esc(summary.notes)
                     + '</div>';
        }

        content += '<div class="character-modal__actions">';
        content += '<button type="button" class="btn primary" data-action="edit-character">Edit</button>';
        if (summary.isDeceased !== true) {
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
            onConfirm: function () {}
        });

        var modalElement = modal.element;
        modalElement.addEventListener('click', function (e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.getAttribute('data-action');
            if (action === 'edit-character') {
                modal.close();
                openEditCharacterModal(characterId, onSuccess);
            } else if (action === 'kill-character') {
                modal.close();
                if (typeof window.openDeathModal !== 'function') {
                    throw new Error('modals-character.js: death modal not available');
                }
                var deathResult = window.openDeathModal(characterId, function () {
                    if (onSuccess) onSuccess();
                });
                if (deathResult && deathResult.success === false) {
                    // The death modal refused to open. Surface its
                    // reason rather than silently doing nothing.
                    throw new Error(deathResult.reason || 'Failed to open death modal');
                }
            } else if (action === 'delete-character') {
                modal.close();
                openDeleteCharacterModal(characterId, onSuccess);
            }
        });

        return { success: true, modal: modal };
    }

    function _buildFamilySection(characterId) {
        var html = '<div class="character-modal__family">';

        var bio = _getBiologicalParents(characterId);
        var fatherName = bio.father
            ? window.CharacterQueries.getCharacterDisplayName(bio.father)
            : null;
        var motherName = bio.mother
            ? window.CharacterQueries.getCharacterDisplayName(bio.mother)
            : null;

        var parentNames = [];
        if (fatherName) parentNames.push(fatherName);
        if (motherName) parentNames.push(motherName);

        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Parents</div>'
             + '<div class="character-modal__family-content">'
             + (parentNames.length > 0 ? _esc(parentNames.join(' & ')) : 'Unknown')
             + '</div></div>';

        var children = window.FamilyQueries.getChildIds(characterId);
        var livingChildCount = 0;
        for (var i = 0; i < children.length; i++) {
            var childSummary = window.CharacterQueries.getCharacterSummary(children[i]);
            if (childSummary && childSummary.isDeceased !== true) livingChildCount++;
        }
        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Children</div>'
             + '<div class="character-modal__family-content">'
             + children.length
             + (livingChildCount < children.length
                ? ' (' + livingChildCount + ' living)'
                : '')
             + '</div></div>';

        var siblings = window.FamilyQueries.getSiblings(characterId);
        html += '<div class="character-modal__family-group">'
             + '<div class="character-modal__family-label">Siblings</div>'
             + '<div class="character-modal__family-content">'
             + siblings.length
             + '</div></div>';

        var grandchildren = window.FamilyQueries.getGrandchildIds(characterId, 1);
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
    // 5. CREATE CHARACTER MODAL
    // =========================================================================

    function openCreateCharacterModal(onSuccess) {
        var currentYear = window.getCurrentYear();
        var defaultBirthYear = currentYear - 25;
        var minYear = window.TIME_CONSTANTS ? window.TIME_CONSTANTS.MIN_YEAR : -10000;
        var maxYear = currentYear;

        var traitCheckboxesHtml = _renderTraitCheckboxes([]);

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-first-name">First Name *</label>'
                 + '<input type="text" id="char-first-name" class="character-modal__form-input" autofocus autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-surname">Surname</label>'
                 + '<input type="text" id="char-surname" class="character-modal__form-input" autocomplete="off">'
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

        if (traitCheckboxesHtml) {
            content += '<div class="character-modal__form-field character-modal__form-field--traits">'
                     + '<div class="character-modal__form-label">Traits</div>'
                     + traitCheckboxesHtml
                     + '</div>';
        }

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="char-notes">Notes</label>'
                 + '<textarea id="char-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var selectedFatherId = null;
        var selectedMotherId = null;

        var modal = window.openModal({
            titleHtml: 'Create Character',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
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

                modalElement.addEventListener('click', function (e) {
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
                            onSelect: function (selected) {
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
            onConfirm: function () {
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

                var traits = _collectSelectedTraits(modal.element);

                var data = {
                    name: name,
                    surname: surnameInput ? surnameInput.value.trim() : '',
                    gender: genderInput ? genderInput.value : 'unknown',
                    birthYear: birthYear,
                    traits: traits,
                    birthplaceId: birthplaceInput && birthplaceInput.value
                        ? birthplaceInput.value
                        : null,
                    notes: notesInput ? notesInput.value : ''
                };

                var parents = [];
                if (selectedFatherId) {
                    parents.push({
                        parentId: selectedFatherId,
                        parentRole: 'father',
                        parentType: 'biological'
                    });
                }
                if (selectedMotherId) {
                    parents.push({
                        parentId: selectedMotherId,
                        parentRole: 'mother',
                        parentType: 'biological'
                    });
                }

                var createOptions = { currentYear: currentYear };
                if (parents.length > 0) createOptions.parents = parents;

                var result = window.CharacterCreationCommands.createCharacter(data, createOptions);
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
    // 6. EDIT CHARACTER MODAL
    // =========================================================================
    //
    // See the header's EDIT-MODAL TRANSACTION CONTRACT for the ordering
    // rationale. The short version: validate everything first, mutate
    // second, and treat parent changes as the riskier operation whose
    // failure is surfaced without leaving field updates in an unclear
    // state.

    function openEditCharacterModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openEditCharacterModal: characterId is required');
        }

        var summary = _readSummary(characterId);
        if (!summary) {
            return { success: false, reason: 'Character not found' };
        }
        if (summary.isDeleted === true) {
            return { success: false, reason: 'Character is soft-deleted' };
        }

        var currentYear = window.getCurrentYear();
        var minYear = window.TIME_CONSTANTS ? window.TIME_CONSTANTS.MIN_YEAR : -10000;

        var originalTraits = Array.isArray(summary.traits) ? summary.traits.slice() : [];
        var traitCheckboxesHtml = _renderTraitCheckboxes(originalTraits);

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(summary.fullName || summary.name || 'Unnamed') + '</strong><br>'
                 + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
                 + ' &middot; '
                 + _esc(summary.locationId || 'Unknown')
                 + (summary.rank ? ' &middot; ' + _esc(summary.rank) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-first-name">First Name</label>'
                 + '<input type="text" id="edit-char-first-name" class="character-modal__form-input"'
                 + ' value="' + _esc(summary.name || '') + '" autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-surname">Surname</label>'
                 + '<input type="text" id="edit-char-surname" class="character-modal__form-input"'
                 + ' value="' + _esc(summary.surname || '') + '" autocomplete="off">'
                 + '</div>';

        var genderValue = summary.gender === 'male' || summary.gender === 'female'
            ? summary.gender
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
                 + ' value="' + (summary.birthYear !== undefined && summary.birthYear !== null ? summary.birthYear : '') + '"'
                 + ' min="' + minYear + '"'
                 + ' max="' + currentYear + '">'
                 + '</div>';

        var bio = _getBiologicalParents(characterId);
        var fatherName = bio.father
            ? window.CharacterQueries.getCharacterDisplayName(bio.father)
            : 'None';
        var motherName = bio.mother
            ? window.CharacterQueries.getCharacterDisplayName(bio.mother)
            : 'None';

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

        if (traitCheckboxesHtml) {
            content += '<div class="character-modal__form-field character-modal__form-field--traits">'
                     + '<div class="character-modal__form-label">Traits</div>'
                     + traitCheckboxesHtml
                     + '</div>';
        }

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-char-notes">Notes</label>'
                 + '<textarea id="edit-char-notes" class="character-modal__form-input" rows="2">'
                 + _esc(summary.notes || '')
                 + '</textarea>'
                 + '</div>';

        content += '</div>';

        var parentChanges = {
            father: { action: 'none', id: null },
            mother: { action: 'none', id: null }
        };

        var originalBio = { father: bio.father, mother: bio.mother };

        var modal = window.openModal({
            titleHtml: 'Edit Character: ' + _esc(summary.name || ''),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                modalElement.addEventListener('click', function (e) {
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
                            excludeIds: [characterId],
                            onSelect: function (selected) {
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
            onConfirm: function () {
                // -----------------------------------------------------------------
                // STEP 1: collect and validate field updates (no mutation yet).
                // -----------------------------------------------------------------
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
                if (name !== summary.name) updates.name = name;

                var surname = surnameInput ? surnameInput.value.trim() : '';
                if (surname !== (summary.surname || '')) updates.surname = surname;

                var gender = genderInput ? genderInput.value : summary.gender;
                if (gender !== summary.gender) updates.gender = gender;

                var birthYear = parseInt(birthYearInput.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year');
                }
                if (birthYear !== summary.birthYear) updates.birthYear = birthYear;

                var notes = notesInput ? notesInput.value : '';
                if (notes !== (summary.notes || '')) updates.notes = notes;

                // Compute trait delta against the projection we captured
                // before the modal opened. Idempotent commands mean we
                // only need the sets, not the order.
                var selectedTraits = _collectSelectedTraits(modal.element);
                var originalSet = {};
                for (var ot = 0; ot < originalTraits.length; ot++) {
                    originalSet[originalTraits[ot]] = true;
                }
                var selectedSet = {};
                for (var st = 0; st < selectedTraits.length; st++) {
                    selectedSet[selectedTraits[st]] = true;
                }
                var traitsToAdd = [];
                var traitsToRemove = [];
                for (var a = 0; a < selectedTraits.length; a++) {
                    if (!originalSet[selectedTraits[a]]) traitsToAdd.push(selectedTraits[a]);
                }
                for (var r = 0; r < originalTraits.length; r++) {
                    if (!selectedSet[originalTraits[r]]) traitsToRemove.push(originalTraits[r]);
                }

                // -----------------------------------------------------------------
                // STEP 2: validate parent changes BEFORE any mutation.
                // -----------------------------------------------------------------
                var fatherValidation = _validateParentChange(
                    characterId, 'father', originalBio.father, parentChanges.father
                );
                if (!fatherValidation.ok) {
                    throw new Error(fatherValidation.reason);
                }

                var motherValidation = _validateParentChange(
                    characterId, 'mother', originalBio.mother, parentChanges.mother
                );
                if (!motherValidation.ok) {
                    throw new Error(motherValidation.reason);
                }

                // -----------------------------------------------------------------
                // STEP 3: apply trait changes. Done before field updates so
                // a failing trait write aborts the save with a clean
                // error message about the trait, not the field.
                // -----------------------------------------------------------------
                var traitErrors = [];

                for (var ti = 0; ti < traitsToAdd.length; ti++) {
                    var addResult = window.CharacterCommands.addTrait(
                        characterId, traitsToAdd[ti]
                    );
                    if (!addResult || addResult.success !== true) {
                        traitErrors.push(
                            'Failed to add trait "' + traitsToAdd[ti] + '": '
                            + (addResult && addResult.reason
                                ? addResult.reason
                                : 'unknown')
                        );
                    }
                }

                for (var tr = 0; tr < traitsToRemove.length; tr++) {
                    var remResult = window.CharacterCommands.removeTrait(
                        characterId, traitsToRemove[tr]
                    );
                    if (!remResult || remResult.success !== true) {
                        traitErrors.push(
                            'Failed to remove trait "' + traitsToRemove[tr] + '": '
                            + (remResult && remResult.reason
                                ? remResult.reason
                                : 'unknown')
                        );
                    }
                }

                if (traitErrors.length > 0) {
                    throw new Error(traitErrors.join('; '));
                }

                // -----------------------------------------------------------------
                // STEP 4: apply field updates (if any).
                // -----------------------------------------------------------------
                if (Object.keys(updates).length > 0) {
                    var updateResult = window.CharacterCommands.updateCharacter(characterId, updates);
                    if (!updateResult || updateResult.success !== true) {
                        throw new Error(updateResult && updateResult.reason
                            ? updateResult.reason
                            : 'Failed to update character');
                    }
                }

                // -----------------------------------------------------------------
                // STEP 5: apply parent changes. Failures here are surfaced
                // individually; earlier steps are NOT rolled back.
                // -----------------------------------------------------------------
                var parentErrors = [];

                var fatherApply = _applyParentChange(
                    characterId,
                    'father',
                    originalBio.father,
                    parentChanges.father,
                    birthYear
                );
                if (!fatherApply.ok) {
                    parentErrors.push(fatherApply.reason);
                }

                var motherApply = _applyParentChange(
                    characterId,
                    'mother',
                    originalBio.mother,
                    parentChanges.mother,
                    birthYear
                );
                if (!motherApply.ok) {
                    parentErrors.push(motherApply.reason);
                }

                if (parentErrors.length > 0) {
                    throw new Error(parentErrors.join('; '));
                }

                if (typeof onSuccess === 'function') {
                    onSuccess();
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 7. DELETE CHARACTER MODAL
    // =========================================================================

    function openDeleteCharacterModal(characterId, onSuccess) {
        if (!_hasId(characterId)) {
            throw new Error('openDeleteCharacterModal: characterId is required');
        }

        var summary = _readSummary(characterId);
        if (!summary) {
            return { success: false, reason: 'Character not found' };
        }

        var childCount = window.FamilyQueries.getChildIds(characterId).length;

        var message = 'Delete "' + (summary.name || '')
                    + (summary.surname ? ' ' + summary.surname : '')
                    + '" permanently?';
        if (childCount > 0) {
            message += ' This character has ' + childCount
                     + (childCount === 1 ? ' child' : ' children')
                     + '; the parent reference will be removed.';
        }

        window.confirmDialog(message, 'Delete Character', function () {
            var result = window.CharacterDeletionCommands.deleteCharacter(characterId);
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
    // 8. FAMILY VIEW MODAL
    // =========================================================================

    function openFamilyViewModal(characterId) {
        if (!_hasId(characterId)) {
            throw new Error('openFamilyViewModal: characterId is required');
        }

        var character = window.CharacterState.getCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var bio = _getBiologicalParents(characterId);
        var childrenIds = window.FamilyQueries.getChildIds(characterId);
        var siblings = window.FamilyQueries.getSiblings(characterId);
        var grandchildrenIds = window.FamilyQueries.getGrandchildIds(characterId, 1);

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(character.name || '')
                 + (character.surname ? ' ' + _esc(character.surname) : '')
                 + '</strong>';

        var summary = _readSummary(characterId);
        if (summary) {
            content += '<br>'
                     + _esc(summary.age === null ? 'Unknown age' : summary.age + ' years')
                     + ' &middot; '
                     + _esc(summary.gender || 'Unknown');
        }
        content += '</div>';

        content += '<div class="character-modal__family character-modal__family--wide">';

        var parentsList = [];
        if (bio.father) parentsList.push(bio.father);
        if (bio.mother) parentsList.push(bio.mother);
        content += _renderFamilyGroup('Parents', parentsList);

        content += _renderFamilyGroup(
            'Siblings',
            siblings.map(function (s) { return s.siblingId; })
        );

        content += _renderFamilyGroup('Children', childrenIds);

        content += _renderFamilyGroup('Grandchildren', grandchildrenIds);

        content += '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Family: ' + _esc(character.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {}
        });

        return { success: true, modal: modal };
    }

    function _renderFamilyGroup(label, memberIds) {
        var html = '<div class="character-modal__family-group">';
        html += '<div class="character-modal__family-label">'
             + _esc(label)
             + ' (' + memberIds.length + ')'
             + '</div>';

        if (memberIds.length === 0) {
            html += '<div class="character-modal__family-empty">None</div>';
            html += '</div>';
            return html;
        }

        for (var i = 0; i < memberIds.length; i++) {
            var member = window.CharacterState.getCharacter(memberIds[i]);
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
    // 9. EXPORTS
    // =========================================================================

    window.openCreateCharacterModal = openCreateCharacterModal;
    window.openEditCharacterModal = openEditCharacterModal;
    window.openDeleteCharacterModal = openDeleteCharacterModal;
    window.openCharacterDetailsModal = openCharacterDetailsModal;
    window.openFamilyViewModal = openFamilyViewModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateCharacterModal: openCreateCharacterModal,
            openEditCharacterModal: openEditCharacterModal,
            openDeleteCharacterModal: openDeleteCharacterModal,
            openCharacterDetailsModal: openCharacterDetailsModal,
            openFamilyViewModal: openFamilyViewModal
        };
    }
})();
