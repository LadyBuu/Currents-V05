/**
 * =============================================================================
 * STILL WATERS - EDUCATION MODALS (modals-education.js)
 * =============================================================================
 *
 * LOCATION: js/education/modals-education.js
 *
 * UI modals for education management. Reads via EducationQueries, writes via
 * EducationCommands, persists once per successful mutation batch, surfaces
 * command results to the user. No state, no policy, no toasts from Commands.
 *
 * CONTRACT
 *
 *   - Every modal reads via EducationQueries.
 *   - Every modal writes via EducationCommands and checks .success.
 *   - Every successful mutation batch calls EducationCommands.persist()
 *     once via _persistAndWarn; a persist failure produces a warning
 *     toast but does not roll back the in-memory write (the debounced
 *     save will retry).
 *   - Failures surface .reason via _showToast.
 *   - No direct EducationState access.
 *   - No layout that polls or stashes state on window.
 *
 * MODAL LIFECYCLE
 *
 *   Every modal uses onMount to bind its post-open handlers, and does NOT
 *   use setTimeout or module-level "already open" flags. The modal stack
 *   in modals-core.js enforces single-instance semantics.
 *
 * CLOSING ON SUCCESS (IMPORTANT)
 *
 *   Every onConfirm success path in this file does three things, in
 *   order:
 *
 *     1. Persist (_persistAndWarn(...)).
 *     2. Call _closeTopModal().
 *     3. Call onSuccess(...) if the caller supplied one.
 *     4. return true.
 *
 *   The explicit _closeTopModal() is deliberate. modals-core.js's
 *   contract says onConfirm returning false keeps the modal open and
 *   anything else closes it, but in practice a modal that returns
 *   undefined on the success path can be left open if the persistence
 *   toast or the onSuccess callback triggers a re-render that races
 *   the close decision. Calling closeTopModal explicitly makes the
 *   close deterministic and independent of that race. modals-
 *   apprenticeship.js uses the same pattern.
 *
 *   The trailing `return true;` follows modals-core.js's contract
 *   unambiguously — a truthy return means "close", a falsy return
 *   means "stay open". Prior revisions returned undefined on the
 *   success path (because the onSuccess call was the last statement),
 *   which is truthy-adjacent but not what the contract asks for.
 *
 * CROSS-DOMAIN
 *
 *   Role skill progression, character education fields, household
 *   wealth, and settlement wealth are written by the respective
 *   domains. The modals do not touch them directly; the commands do,
 *   and the modals only consume command results.
 *
 * DEPENDENCIES
 *
 *   - modals-core.js          (openModal, closeTopModal, confirmDialog)
 *   - formatting.js           (escapeHtml)
 *   - ui.js                   (_showToast / showToast)
 *   - icons.js                (Icons)
 *   - education-constants.js  (INSTITUTION_TYPES, SUBJECTS, ...)
 *   - education-queries.js    (EducationQueries)
 *   - education-commands.js   (EducationCommands)
 *   - accessors.js            (getPlaces, getCharacters, getCharacterById)
 *   - time.js                 (getCurrentYear, calculateAge)
 *   - role-state.js           (optional; for role name resolution)
 *   - religion-state.js       (optional; for religion name resolution)
 *   - selectors/modals-char-selector.js (optional; owner picker)
 *   - households/modals-household-selector.js (optional; owner picker)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Every onConfirm success path calls _closeTopModal() explicitly
 *       and returns true. Prior revisions returned undefined (via the
 *       last statement being the onSuccess call), which could leave
 *       the modal open if a persistence toast or the onSuccess
 *       callback triggered a race with the close decision. See
 *       CLOSING ON SUCCESS in the header.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY HELPERS
    // =========================================================================

    function _queries() {
        if (typeof window.EducationQueries === 'undefined') {
            throw new Error('modals-education.js requires EducationQueries');
        }
        return window.EducationQueries;
    }

    function _commands() {
        if (typeof window.EducationCommands === 'undefined') {
            throw new Error('modals-education.js requires EducationCommands');
        }
        return window.EducationCommands;
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        throw new Error('modals-education.js requires openModal (modals-core.js)');
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (window.confirm(message)) {
            if (onConfirm) onConfirm();
        }
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('modals-education.js requires getCurrentYear (time.js)');
        }
        return window.getCurrentYear();
    }

    function _getPlaces() {
        if (typeof window.getPlaces !== 'function') {
            throw new Error('modals-education.js requires getPlaces (accessors.js)');
        }
        return window.getPlaces();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') return [];
        return window.getCharacters();
    }

    function _calculateAge(birthYear) {
        if (typeof window.calculateAge !== 'function') return null;
        return window.calculateAge(birthYear, false, null);
    }

    function _getRoleById(roleId) {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(roleId);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(roleId);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getAllRoles === 'function') {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') return window.getRoles();
        return [];
    }

    function _getReligionById(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    }

    function _getAllReligions() {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions();
        }
        return [];
    }

    function _openCharacterSelector(title, onSelect, options) {
        options = options || {};
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector({
                title: title,
                targetId: options.targetId || null,
                onSelect: onSelect,
                filters: {
                    gender: options.gender || 'all',
                    status: options.status || 'all',
                    showDeceased: options.showDeceased === true,
                    location: options.locationFilter || 'all'
                }
            });
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

    function _openHouseholdSelector(title, onSelect) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector({
                title: title,
                targetId: null,
                onSelect: onSelect
            });
        }
        _showToast('Household selector not available', 'error');
        return null;
    }

    function _institutionTypes() {
        var TYPES = window.INSTITUTION_TYPES;
        if (!TYPES) throw new Error('modals-education.js requires INSTITUTION_TYPES');
        return TYPES;
    }

    function _subjectsById() {
        var S = window.SUBJECTS_BY_ID;
        if (!S) throw new Error('modals-education.js requires SUBJECTS_BY_ID');
        return S;
    }

    function _subjects() {
        var S = window.SUBJECTS;
        if (!S) throw new Error('modals-education.js requires SUBJECTS');
        return S;
    }

    function _roleCategories() {
        return window.ROLE_CATEGORIES || {};
    }

    // =========================================================================
    // 1. PERSISTENCE HELPER
    // =========================================================================

    function _persistAndWarn(successMessage) {
        var ok = _commands().persist();
        if (ok === false) {
            _showToast(
                'Change saved in memory, but disk save failed. It will retry.',
                'warning'
            );
            return false;
        }
        if (successMessage) {
            _showToast(successMessage, 'success');
        }
        return true;
    }

    // =========================================================================
    // 2. SHARED BUILDERS
    // =========================================================================

    function _buildTypeOptions(selectedId) {
        var types = _institutionTypes();
        var html = '';
        for (var k in types) {
            if (!Object.prototype.hasOwnProperty.call(types, k)) continue;
            var t = types[k];
            var selected = (t.id === selectedId) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(t.id) + '"' + selected + '>' +
                _escapeHtml(t.name) + '</option>';
        }
        return html;
    }

    function _buildPlaceOptions(selectedId) {
        var places = _getPlaces();
        var html = '<option value="">No location</option>';
        for (var i = 0; i < places.length; i++) {
            var sel = (places[i].id === selectedId) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(places[i].id) + '"' + sel + '>' +
                _escapeHtml(places[i].displayName) + '</option>';
        }
        return html;
    }

    function _buildReligionOptions(selectedId) {
        var religions = _getAllReligions();
        var html = '<option value="">None</option>';
        for (var i = 0; i < religions.length; i++) {
            var sel = (religions[i].id === selectedId) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(religions[i].id) + '"' + sel + '>' +
                _escapeHtml(religions[i].name) + '</option>';
        }
        return html;
    }

    function _readInput(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _readChecked(id) {
        var el = document.getElementById(id);
        return el ? el.checked === true : false;
    }

    function _readNumber(id, fallback) {
        var raw = _readInput(id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    // =========================================================================
    // 3. CREATE INSTITUTION MODAL
    // =========================================================================

    function openCreateInstitutionModal(onSuccess, defaultData) {
        defaultData = defaultData || {};

        var currentYear = _getCurrentYear();
        var types = _institutionTypes();
        var firstTypeId = Object.keys(types)[0] || 'town_school';
        var hasReligions = _getAllReligions().length > 0;

        var ownerState = {
            id: null,
            type: 'character'
        };

        var content =
            '<div style="max-height:520px;overflow-y:auto;padding:4px;">' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name *</label>' +
            '<input type="text" id="createInstName" value="' +
            _escapeHtml(defaultData.name || '') +
            '" placeholder="e.g., Oxford Academy" autofocus style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Type *</label>' +
            '<select id="createInstType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildTypeOptions(defaultData.typeId || firstTypeId) +
            '</select>' +
            '<small id="createInstTypeHint" style="font-size:0.5rem;color:var(--dim);"></small>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location *</label>' +
            '<select id="createInstLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildPlaceOptions(defaultData.locationId) +
            '</select>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Ownership</label>' +
            '<select id="createInstOwnership" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<option value="public">Public (Free)</option>' +
            '<option value="private">Private (Tuition)</option>' +
            (hasReligions ? '<option value="religious">Religious</option>' : '') +
            '</select>' +
            '</div>' +

            '<div id="createInstReligionSection" style="display:none;margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Religion</label>' +
            '<select id="createInstReligion" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;color:var(--text);">' +
            _buildReligionOptions(null) +
            '</select>' +
            '</div>' +

            '<div id="createInstOwnerSection" style="display:none;margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<div style="display:flex;gap:8px;margin-bottom:6px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
            '<input type="radio" name="createInstOwnerType" value="character" checked> Character</label>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
            '<input type="radio" name="createInstOwnerType" value="household"> Household</label>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<input type="text" id="createInstOwnerName" placeholder="Select owner..." readonly style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;color:var(--text);cursor:pointer;">' +
            '<button type="button" id="createInstSelectOwnerBtn" class="btn" style="padding:4px 10px;font-size:0.6rem;">Select</button>' +
            '<button type="button" id="createInstClearOwnerBtn" class="btn" style="padding:4px 10px;font-size:0.6rem;">Clear</button>' +
            '</div>' +
            '<small style="font-size:0.5rem;color:var(--dim);">Private institutions must have an owner</small>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="createInstDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _escapeHtml(defaultData.description || '') + '</textarea>' +
            '</div>' +

            '</div>';

        _openModal({
            titleHtml: _getIcon('GEAR') + ' Create Educational Institution',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var typeSel = modalEl.querySelector('#createInstType');
                var typeHint = modalEl.querySelector('#createInstTypeHint');
                var ownershipSel = modalEl.querySelector('#createInstOwnership');
                var religionSection = modalEl.querySelector('#createInstReligionSection');
                var ownerSection = modalEl.querySelector('#createInstOwnerSection');

                function updateTypeHint() {
                    var typesNow = _institutionTypes();
                    for (var kk in typesNow) {
                        if (!Object.prototype.hasOwnProperty.call(typesNow, kk)) continue;
                        if (typesNow[kk].id === typeSel.value) {
                            var tt = typesNow[kk];
                            typeHint.textContent =
                                'Capacity: ' + tt.maxStudents +
                                ' · Min pop: ' + tt.minPopulation +
                                ' · Tuition base: ' + tt.baseTuition +
                                ' · Reputation: ' + tt.baseReputation;
                            return;
                        }
                    }
                    typeHint.textContent = '';
                }

                function updateOwnershipSections() {
                    var v = ownershipSel.value;
                    religionSection.style.display =
                        (v === 'religious') ? 'block' : 'none';
                    ownerSection.style.display =
                        (v === 'private') ? 'block' : 'none';
                }

                typeSel.addEventListener('change', updateTypeHint);
                ownershipSel.addEventListener('change', updateOwnershipSections);
                updateTypeHint();
                updateOwnershipSections();

                var ownerNameInput = modalEl.querySelector('#createInstOwnerName');
                var selectBtn = modalEl.querySelector('#createInstSelectOwnerBtn');
                var clearBtn = modalEl.querySelector('#createInstClearOwnerBtn');

                selectBtn.addEventListener('click', function() {
                    var choice = modalEl.querySelector(
                        'input[name="createInstOwnerType"]:checked'
                    );
                    var type = choice ? choice.value : 'character';
                    if (type === 'character') {
                        _openCharacterSelector('Select Owner', function(character) {
                            if (!character) return;
                            ownerState.id = character.id;
                            ownerState.type = 'character';
                            ownerNameInput.value = character.name +
                                (character.surname ? ' ' + character.surname : '');
                        });
                    } else {
                        _openHouseholdSelector('Select Owner', function(household) {
                            if (!household) return;
                            ownerState.id = household.id;
                            ownerState.type = 'household';
                            ownerNameInput.value = household.name;
                        });
                    }
                });

                clearBtn.addEventListener('click', function() {
                    ownerState.id = null;
                    ownerState.type = 'character';
                    ownerNameInput.value = '';
                });
            },
            onConfirm: function(modalEl) {
                var name = modalEl.querySelector('#createInstName').value.trim();
                var typeId = modalEl.querySelector('#createInstType').value;
                var locationId = modalEl.querySelector('#createInstLocation').value;
                var ownership = modalEl.querySelector('#createInstOwnership').value;
                var description = modalEl.querySelector('#createInstDescription').value.trim();

                var religionId = null;
                if (ownership === 'religious') {
                    religionId = modalEl.querySelector('#createInstReligion').value || null;
                    if (!religionId) {
                        _showToast('Please select a religion', 'error');
                        return false;
                    }
                }

                var ownerId = null;
                var ownerType = null;
                if (ownership === 'private') {
                    ownerId = ownerState.id;
                    ownerType = ownerState.type;
                    if (!ownerId) {
                        _showToast('Please select an owner', 'error');
                        return false;
                    }
                }

                if (!name) {
                    _showToast('Name is required', 'error');
                    return false;
                }
                if (!locationId) {
                    _showToast('Location is required', 'error');
                    return false;
                }

                var result = _commands().createInstitution({
                    name: name,
                    typeId: typeId,
                    locationId: locationId,
                    ownershipType: ownership,
                    description: description,
                    foundedYear: currentYear,
                    religionId: religionId,
                    ownerId: ownerId,
                    ownerType: ownerType
                });
                if (!result.success) {
                    _showToast(result.reason || 'Failed to create institution', 'error');
                    return false;
                }

                _persistAndWarn('Institution created: ' + name);
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess(result.institutionId);
                return true;
            }
        });
    }

    // =========================================================================
    // 4. EDIT INSTITUTION MODAL
    // =========================================================================

    function openEditInstitutionModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;

        var content =
            '<div style="max-height:520px;overflow-y:auto;padding:4px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.6rem;color:var(--dim);">' +
            'Editing <strong>' + _escapeHtml(s.name) + '</strong>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name *</label>' +
            '<input type="text" id="editInstName" value="' +
            _escapeHtml(s.name) +
            '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Type</label>' +
            '<select id="editInstType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildTypeOptions(s.type) +
            '</select>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
            '<select id="editInstLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildPlaceOptions(s.locationId) +
            '</select>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="editInstDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _escapeHtml(details.description || '') + '</textarea>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Max Students</label>' +
            '<input type="number" id="editInstMaxStudents" value="' +
            s.maxStudents +
            '" min="1" max="5000" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '</div>';

        _openModal({
            titleHtml: _getIcon('EDIT') + ' Edit Institution: ' + _escapeHtml(s.name),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var name = modalEl.querySelector('#editInstName').value.trim();
                var type = modalEl.querySelector('#editInstType').value;
                var locationId = modalEl.querySelector('#editInstLocation').value || null;
                var description = modalEl.querySelector('#editInstDescription').value.trim();
                var maxStudents = parseInt(
                    modalEl.querySelector('#editInstMaxStudents').value, 10
                );

                if (!name) {
                    _showToast('Name is required', 'error');
                    return false;
                }
                if (isNaN(maxStudents) || maxStudents < 1) {
                    _showToast('Invalid capacity', 'error');
                    return false;
                }

                var result = _commands().updateInstitution(institutionId, {
                    name: name,
                    type: type,
                    locationId: locationId,
                    description: description,
                    maxStudents: maxStudents
                });
                if (!result.success) {
                    _showToast(result.reason || 'Failed to update', 'error');
                    return false;
                }

                _persistAndWarn('Institution updated');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 5. INSTITUTION DETAILS MODAL
    // =========================================================================

    function openInstitutionDetailsModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;

        var curriculumHtml = '';
        if (details.curriculum.length === 0) {
            curriculumHtml = '<span style="color:var(--dim);font-size:0.55rem;">No curriculum</span>';
        } else {
            curriculumHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
            for (var i = 0; i < details.curriculum.length; i++) {
                var item = details.curriculum[i];
                curriculumHtml += '<span style="background:var(--bg3);padding:2px 8px;border-radius:12px;font-size:0.5rem;border:1px solid var(--border);">' +
                    _escapeHtml(item.name) + '</span>';
            }
            curriculumHtml += '</div>';
        }

        var studentsHtml = '';
        if (details.students.length === 0) {
            studentsHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">No students enrolled</div>';
        } else {
            studentsHtml = '<div style="max-height:150px;overflow-y:auto;">';
            for (var i = 0; i < Math.min(details.students.length, 10); i++) {
                var st = details.students[i];
                studentsHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                    '<span>' + _escapeHtml(st.studentName || 'Unknown') + '</span>' +
                    '<span style="color:var(--dim);">' +
                    (st.age !== null ? st.age + 'y' : '?') +
                    ' · Enrolled ' +
                    (st.enrollmentYear !== null ? st.enrollmentYear : '?') +
                    '</span>' +
                    '</div>';
            }
            if (details.students.length > 10) {
                studentsHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">... and ' +
                    (details.students.length - 10) + ' more</div>';
            }
            studentsHtml += '</div>';
        }

        var teachersHtml = '';
        if (details.teachers.length === 0) {
            teachersHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">No teachers hired</div>';
        } else {
            teachersHtml = '<div style="max-height:150px;overflow-y:auto;">';
            for (var i = 0; i < Math.min(details.teachers.length, 10); i++) {
                var t = details.teachers[i];
                teachersHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                    '<span>' + _escapeHtml(t.teacherName || 'Unknown') +
                    ' <span style="color:var(--accent);font-size:0.5rem;">(' +
                    _escapeHtml(t.subjectName || '?') + ')</span></span>' +
                    '<span style="color:var(--dim);">' +
                    (t.hiredYear !== null ? t.hiredYear : '?') +
                    '</span>' +
                    '</div>';
            }
            if (details.teachers.length > 10) {
                teachersHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">... and ' +
                    (details.teachers.length - 10) + ' more</div>';
            }
            teachersHtml += '</div>';
        }

        var headmasterLine = details.headmaster
            ? _escapeHtml(details.headmaster.name || 'Unknown') + ' (' +
              _escapeHtml(details.headmaster.title || 'Headmaster') +
              ' since ' + (details.headmaster.startYear || '?') + ')'
            : '<span style="color:var(--dim);">None</span>';

        var content =
            '<div style="max-height:580px;overflow-y:auto;padding:4px;">' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--dim);">Institution</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' +
            _escapeHtml(s.name) + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _escapeHtml(s.typeName || 'Unknown') + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _escapeHtml(s.locationName) + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--dim);">Statistics</div>' +
            '<div style="font-size:0.75rem;">' +
            '<div>' + s.currentStudentCount + ' / ' + s.maxStudents + ' students</div>' +
            '<div>' + s.teacherCount + ' teachers</div>' +
            '<div>' + s.graduateCount + ' graduates</div>' +
            '<div>' + details.curriculum.length + ' curriculum items</div>' +
            '</div></div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--dim);">Ownership</div>' +
            '<div style="font-size:0.75rem;font-weight:bold;">' +
            _escapeHtml(s.ownershipType || 'public') + '</div>' +
            (s.ownerName
                ? '<div style="font-size:0.6rem;color:var(--dim);">Owner: ' +
                  _escapeHtml(s.ownerName) + '</div>'
                : '') +
            (s.religionName
                ? '<div style="font-size:0.6rem;color:#4a9e6a;">' +
                  _escapeHtml(s.religionName) + '</div>'
                : '') +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--dim);">Headmaster</div>' +
            '<div style="font-size:0.7rem;">' + headmasterLine + '</div>' +
            '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Curriculum</div>' +
            '<div style="background:var(--bg3);padding:8px;border-radius:6px;min-height:30px;">' +
            curriculumHtml + '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Students (' +
            details.students.length + ')</div>' + studentsHtml +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Teachers (' +
            details.teachers.length + ')</div>' + teachersHtml +
            '</div>' +
            '</div>' +

            (details.description
                ? '<div style="font-size:0.55rem;color:var(--dim);padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                  _escapeHtml(details.description) + '</div>'
                : '') +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button type="button" id="instEditBtn" class="btn primary" style="font-size:0.65rem;padding:4px 12px;">Edit</button>' +
            '<button type="button" id="instCurriculumBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Curriculum</button>' +
            '<button type="button" id="instEnrollBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Enroll</button>' +
            '<button type="button" id="instHireBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Hire Teacher</button>' +
            '<button type="button" id="instHeadmasterBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Headmaster</button>' +
            '<button type="button" id="instTuitionBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Tuition</button>' +
            '<button type="button" id="instOwnershipBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Ownership</button>' +
            '<button type="button" id="instGraduateBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Graduate</button>' +
            '<button type="button" id="instDeleteBtn" class="btn danger" style="font-size:0.65rem;padding:4px 12px;">Delete</button>' +
            '</div>' +

            '</div>';

        var modal = _openModal({
            titleHtml: 'Institution: ' + _escapeHtml(s.name),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function(modalEl) {
                function reopenDetails() {
                    openInstitutionDetailsModal(institutionId, onSuccess);
                }

                function bind(id, fn) {
                    var el = modalEl.querySelector('#' + id);
                    if (!el) return;
                    el.addEventListener('click', function() {
                        _closeTopModal();
                        fn();
                    });
                }

                bind('instEditBtn', function() {
                    openEditInstitutionModal(institutionId, reopenDetails);
                });
                bind('instCurriculumBtn', function() {
                    openEditCurriculumModal(institutionId, reopenDetails);
                });
                bind('instEnrollBtn', function() {
                    openEnrollStudentModal(institutionId, reopenDetails);
                });
                bind('instHireBtn', function() {
                    openHireTeacherModal(institutionId, reopenDetails);
                });
                bind('instHeadmasterBtn', function() {
                    openSetHeadmasterModal(institutionId, reopenDetails);
                });
                bind('instTuitionBtn', function() {
                    openTuitionManagementModal(institutionId, reopenDetails);
                });
                bind('instOwnershipBtn', function() {
                    openOwnershipManagementModal(institutionId, reopenDetails);
                });
                bind('instGraduateBtn', function() {
                    openGraduateStudentModal(institutionId, reopenDetails);
                });
                bind('instDeleteBtn', function() {
                    openDeleteInstitutionModal(institutionId, function() {
                        if (typeof onSuccess === 'function') onSuccess();
                    });
                });
            },
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 6. EDIT CURRICULUM MODAL
    // =========================================================================

    function openEditCurriculumModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var current = details.curriculum;
        var subjectsById = _subjectsById();
        var subjects = _subjects();
        var categories = _roleCategories();
        var specCat = s.specializationCategory;
        var allRoles = _getAllRoles();

        var rolePool = specCat
            ? allRoles.filter(function(r) { return r.category === specCat; })
            : allRoles;

        var checkedIds = {};
        for (var i = 0; i < current.length; i++) {
            checkedIds[current[i].id] = true;
        }

        var roleHtml = '';
        if (rolePool.length === 0) {
            roleHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">' +
                (specCat
                    ? 'No roles in category "' + _escapeHtml(specCat) + '"'
                    : 'No roles available') +
                '</div>';
        } else {
            for (var i = 0; i < rolePool.length; i++) {
                var r = rolePool[i];
                var chk = checkedIds[r.id] ? ' checked' : '';
                roleHtml += '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:0.6rem;">' +
                    '<input type="checkbox" class="curriculum-role-cb" value="' +
                    _escapeHtml(r.id) + '"' + chk + '>' +
                    _escapeHtml(r.name) +
                    (r.category
                        ? ' <span style="color:var(--dim);font-size:0.5rem;">(' +
                          _escapeHtml(r.category) + ')</span>'
                        : '') +
                    '</label>';
            }
        }

        var subjectGroups = {};
        for (var key in subjects) {
            if (!Object.prototype.hasOwnProperty.call(subjects, key)) continue;
            var sub = subjects[key];
            var cat = sub.category || 'other';
            if (!subjectGroups[cat]) subjectGroups[cat] = [];
            subjectGroups[cat].push(sub);
        }

        var subjectHtml = '';
        for (var cat in subjectGroups) {
            if (!Object.prototype.hasOwnProperty.call(subjectGroups, cat)) continue;
            var catInfo = categories[cat] || { name: cat };
            subjectHtml += '<div style="margin-bottom:8px;">';
            subjectHtml += '<div style="font-size:0.55rem;color:var(--accent);margin-bottom:4px;">' +
                _escapeHtml(catInfo.name || cat) + '</div>';
            subjectHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
            for (var i = 0; i < subjectGroups[cat].length; i++) {
                var sub = subjectGroups[cat][i];
                var chk = checkedIds[sub.id] ? ' checked' : '';
                var border = checkedIds[sub.id]
                    ? 'var(--accent)'
                    : 'var(--border)';
                subjectHtml += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.55rem;background:var(--bg2);padding:2px 8px;border-radius:12px;border:1px solid ' +
                    border + ';">' +
                    '<input type="checkbox" class="curriculum-subject-cb" value="' +
                    _escapeHtml(sub.id) + '"' + chk + '>' +
                    _escapeHtml(sub.name) +
                    '</label>';
            }
            subjectHtml += '</div></div>';
        }

        var custom = current.filter(function(c) {
            return c.type === 'custom' || c.isCustom;
        });
        var customHtml = '';
        for (var i = 0; i < custom.length; i++) {
            customHtml += _customSubjectChip(custom[i].name, custom[i].id);
        }
        if (!customHtml) {
            customHtml = '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects</span>';
        }

        var specWarning = '';
        if (specCat) {
            specWarning = '<div style="padding:8px;background:rgba(200,112,64,0.15);border:1px solid var(--warn);border-radius:6px;margin-bottom:12px;font-size:0.55rem;">' +
                'This institution is specialized in <strong>' +
                _escapeHtml(specCat) +
                '</strong>. Only roles in this category can be added.</div>';
        }

        var content =
            '<div style="margin-bottom:12px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            _getIcon('GEAR') + ' Editing curriculum for <strong>' +
            _escapeHtml(s.name) + '</strong>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            current.length + ' items currently</div>' +
            '</div>' +
            specWarning +

            '<div style="margin-bottom:16px;">' +
            '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Roles (Professions)</div>' +
            '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:150px;overflow-y:auto;">' +
            roleHtml + '</div></div>' +

            '<div style="margin-bottom:16px;">' +
            '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Subjects</div>' +
            '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:250px;overflow-y:auto;">' +
            subjectHtml + '</div></div>' +

            '<div style="margin-bottom:16px;">' +
            '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Custom Subjects</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
            '<input type="text" id="customSubjectInput" placeholder="Custom subject name..." style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
            '<button type="button" id="addCustomSubjectBtn" class="btn" style="padding:4px 12px;font-size:0.5rem;">Add</button>' +
            '</div>' +
            '<div id="customSubjectsContainer" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
            customHtml + '</div></div>';

        _openModal({
            titleHtml: _getIcon('GEAR') + ' Edit Curriculum',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var input = modalEl.querySelector('#customSubjectInput');
                var addBtn = modalEl.querySelector('#addCustomSubjectBtn');
                var container = modalEl.querySelector('#customSubjectsContainer');

                function isEmptyPlaceholder() {
                    var span = container.querySelector('span');
                    return span && span.textContent.indexOf('No custom') !== -1;
                }

                function wireRemove(chip) {
                    var removeBtn = chip.querySelector('.remove-custom-subject-btn');
                    if (!removeBtn) return;
                    removeBtn.addEventListener('click', function() {
                        chip.remove();
                        if (!container.querySelectorAll('.custom-subject-item').length) {
                            container.innerHTML =
                                '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects</span>';
                        }
                    });
                }

                function addCustom() {
                    var name = input.value.trim();
                    if (!name) return;
                    if (isEmptyPlaceholder()) container.innerHTML = '';
                    container.insertAdjacentHTML(
                        'beforeend',
                        _customSubjectChip(name, null)
                    );
                    var lastChip = container.lastElementChild;
                    if (lastChip) wireRemove(lastChip);
                    input.value = '';
                }

                addBtn.addEventListener('click', addCustom);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustom();
                    }
                });

                var existing = container.querySelectorAll('.custom-subject-item');
                for (var i = 0; i < existing.length; i++) {
                    wireRemove(existing[i]);
                }
            },
            onConfirm: function(modalEl) {
                var newCurriculum = [];

                var roleBoxes = modalEl.querySelectorAll('.curriculum-role-cb:checked');
                for (var i = 0; i < roleBoxes.length; i++) {
                    var roleId = roleBoxes[i].value;
                    var role = _getRoleById(roleId);
                    if (role) {
                        newCurriculum.push({
                            type: 'role',
                            id: roleId,
                            name: role.name,
                            icon: role.icon || null,
                            baseLearnRate: 10
                        });
                    }
                }

                var subBoxes = modalEl.querySelectorAll('.curriculum-subject-cb:checked');
                for (var i = 0; i < subBoxes.length; i++) {
                    var subId = subBoxes[i].value;
                    var sub = subjectsById[subId];
                    if (sub) {
                        newCurriculum.push({
                            type: 'subject',
                            id: sub.id,
                            name: sub.name,
                            icon: sub.icon || null,
                            category: sub.category || null,
                            baseLearnRate: sub.baseLearnRate || 10
                        });
                    }
                }

                var customItems = modalEl.querySelectorAll('.custom-subject-item');
                for (var i = 0; i < customItems.length; i++) {
                    var name = customItems[i].dataset.name;
                    var existingId = customItems[i].dataset.id;
                    if (!name) continue;

                    var customId = existingId && existingId.indexOf('custom_') === 0
                        ? existingId
                        : 'custom_' + Date.now() + '_' + i;

                    newCurriculum.push({
                        type: 'custom',
                        id: customId,
                        name: name,
                        icon: null,
                        baseLearnRate: 10,
                        isCustom: true
                    });
                }

                var taughtRoles = newCurriculum
                    .filter(function(c) { return c.type === 'role'; })
                    .map(function(c) { return c.id; });

                var result = _commands().updateInstitution(institutionId, {
                    curriculum: newCurriculum,
                    taughtRoles: taughtRoles
                });
                if (!result.success) {
                    _showToast(result.reason || 'Failed to update curriculum', 'error');
                    return false;
                }

                _persistAndWarn('Curriculum updated');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    function _customSubjectChip(name, existingId) {
        var idAttr = existingId
            ? ' data-id="' + _escapeHtml(existingId) + '"'
            : '';
        return '<div class="custom-subject-item" data-name="' + _escapeHtml(name) + '"' +
            idAttr + ' ' +
            'style="display:flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:12px;border:1px solid var(--border);font-size:0.55rem;">' +
            '<span>' + _escapeHtml(name) + '</span>' +
            '<button type="button" class="remove-custom-subject-btn" style="background:none;border:none;color:#b54a4a;cursor:pointer;font-size:0.5rem;padding:0 2px;">' +
            _getIcon('X_HEAVY') + '</button>' +
            '</div>';
    }

    // =========================================================================
    // 7. ENROLL STUDENT MODAL
    // =========================================================================

    function openEnrollStudentModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var year = _getCurrentYear();
        var eligible = _queries().getEligibleStudents(
            s.locationId, 5, 25, institutionId
        );

        if (eligible.length === 0) {
            _showToast('No eligible students available', 'error');
            return;
        }

        var studentOptions = '';
        for (var i = 0; i < eligible.length; i++) {
            var e = eligible[i];
            studentOptions += '<option value="' + _escapeHtml(e.characterId) + '">' +
                _escapeHtml(e.characterName) + ' (' + e.age + 'y)</option>';
        }

        var tuitionInfo = _commands().calculateTuition(institutionId, year);
        var tuitionLine = tuitionInfo.success
            ? (tuitionInfo.tuition === 0
                ? 'Free'
                : tuitionInfo.tuition + ' gold/year')
            : 'Not available';

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            'Enroll student in <strong>' + _escapeHtml(s.name) + '</strong>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            s.currentStudentCount + ' of ' + s.maxStudents + ' capacity</div>' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-top:4px;padding:4px 8px;background:var(--bg3);border-radius:4px;">Tuition: ' +
            _escapeHtml(tuitionLine) + '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Student</label>' +
            '<select id="enrollStudentSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            studentOptions + '</select></div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Enrollment Year</label>' +
            '<input type="number" id="enrollYear" value="' + year +
            '" min="1" max="' + (year + 5) +
            '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>';

        _openModal({
            titleHtml: 'Enroll Student',
            contentHtml: content,
            confirmText: 'Enroll',
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var studentId = modalEl.querySelector('#enrollStudentSelect').value;
                var enrollYear = parseInt(
                    modalEl.querySelector('#enrollYear').value, 10
                );
                if (!studentId) {
                    _showToast('Select a student', 'error');
                    return false;
                }
                if (isNaN(enrollYear) || enrollYear < 1) {
                    _showToast('Invalid year', 'error');
                    return false;
                }

                var result = _commands().enrollStudent(
                    institutionId, studentId, enrollYear
                );
                if (!result.success) {
                    _showToast(result.reason || 'Failed to enroll', 'error');
                    return false;
                }
                _persistAndWarn('Student enrolled');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 8. HIRE TEACHER MODAL
    // =========================================================================

    function openHireTeacherModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var teachers = details.teachers;
        var alreadyTeaching = {};
        for (var i = 0; i < teachers.length; i++) {
            alreadyTeaching[teachers[i].teacherId] = true;
        }

        var characters = _getCharacters();
        var eligible = [];
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (c.isDeceased) continue;
            if (alreadyTeaching[c.id]) continue;
            if (!c.professions || c.professions.length === 0) continue;
            eligible.push(c);
        }

        if (eligible.length === 0) {
            _showToast('No eligible teachers available', 'error');
            return;
        }

        var teacherOptions = '';
        for (var i = 0; i < eligible.length; i++) {
            var c = eligible[i];
            var age = _calculateAge(c.birthYear);
            var profNames = (c.professions || [])
                .map(function(p) { return p.name; })
                .join(', ');
            teacherOptions += '<option value="' + _escapeHtml(c.id) + '">' +
                _escapeHtml(c.name + ' ' + (c.surname || '')) +
                ' (' + (age !== null ? age : '?') + 'y) — ' +
                _escapeHtml(profNames) + '</option>';
        }

        var curriculum = details.curriculum;
        var subjectOptions = '';
        if (curriculum.length === 0) {
            subjectOptions = '<option value="">No curriculum subjects available</option>';
        } else {
            for (var i = 0; i < curriculum.length; i++) {
                var item = curriculum[i];
                subjectOptions += '<option value="' + _escapeHtml(item.id) + '">' +
                    _escapeHtml(item.name) + ' (' +
                    _escapeHtml(item.type) + ')</option>';
            }
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            'Hire teacher for <strong>' + _escapeHtml(s.name) + '</strong>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            teachers.length + ' teachers currently</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Teacher</label>' +
            '<select id="hireTeacherSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            teacherOptions + '</select></div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Subject</label>' +
            '<select id="hireSubjectSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            subjectOptions + '</select></div>';

        _openModal({
            titleHtml: 'Hire Teacher',
            contentHtml: content,
            confirmText: 'Hire',
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var teacherId = modalEl.querySelector('#hireTeacherSelect').value;
                var subjectId = modalEl.querySelector('#hireSubjectSelect').value;
                if (!teacherId) {
                    _showToast('Select a teacher', 'error');
                    return false;
                }
                if (!subjectId) {
                    _showToast('Select a subject', 'error');
                    return false;
                }

                var result = _commands().hireTeacher(
                    institutionId, teacherId, subjectId
                );
                if (!result.success) {
                    _showToast(result.reason || 'Failed to hire', 'error');
                    return false;
                }
                _persistAndWarn('Teacher hired');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. SET HEADMASTER MODAL
    // =========================================================================

    function openSetHeadmasterModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var current = details.headmaster;
        var year = _getCurrentYear();

        var characters = _getCharacters();
        var eligible = [];
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (c.isDeceased) continue;
            if (current && c.id === current.characterId) continue;
            eligible.push(c);
        }

        var options = '<option value="">— Select —</option>';
        for (var i = 0; i < eligible.length; i++) {
            var c = eligible[i];
            var age = _calculateAge(c.birthYear);
            options += '<option value="' + _escapeHtml(c.id) + '">' +
                _escapeHtml(c.name + ' ' + (c.surname || '')) +
                ' (' + (age !== null ? age : '?') + 'y)</option>';
        }

        var currentLine = current
            ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current: ' +
              _escapeHtml(current.name || 'Unknown') + ' (' +
              _escapeHtml(current.title || 'Headmaster') +
              ' since ' + (current.startYear || '?') + ')</div>'
            : '';

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            'Appoint headmaster for <strong>' + _escapeHtml(s.name) + '</strong>' +
            currentLine +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Headmaster</label>' +
            '<select id="headmasterSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            options + '</select></div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Title</label>' +
            '<input type="text" id="headmasterTitle" value="Headmaster" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
            '<input type="number" id="headmasterStartYear" value="' + year +
            '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            (current
                ? '<div style="margin-top:12px;padding:12px;background:rgba(200,112,64,0.1);border-radius:6px;border:1px solid var(--warn);">' +
                  '<button type="button" id="endHeadmasterTermBtn" class="btn small" style="background:#8a5a20;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">End Current Term</button>' +
                  '</div>'
                : '');

        _openModal({
            titleHtml: 'Appoint Headmaster',
            contentHtml: content,
            confirmText: 'Appoint',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var endBtn = modalEl.querySelector('#endHeadmasterTermBtn');
                if (!endBtn) return;
                endBtn.addEventListener('click', function() {
                    _confirmDialog(
                        'End the current headmaster\'s term?',
                        'End Term',
                        function() {
                            var r = _commands().endHeadmasterTerm(
                                institutionId,
                                _getCurrentYear(),
                                'Term ended'
                            );
                            if (!r.success) {
                                _showToast(r.reason || 'Failed', 'error');
                                return;
                            }
                            _persistAndWarn('Term ended');
                            _closeTopModal();
                            if (typeof onSuccess === 'function') onSuccess();
                        }
                    );
                });
            },
            onConfirm: function(modalEl) {
                var characterId = modalEl.querySelector('#headmasterSelect').value;
                var title = modalEl.querySelector('#headmasterTitle').value.trim() ||
                    'Headmaster';
                var startYear = parseInt(
                    modalEl.querySelector('#headmasterStartYear').value, 10
                );

                if (!characterId) {
                    _showToast('Select a headmaster', 'error');
                    return false;
                }
                if (isNaN(startYear) || startYear < 1) {
                    _showToast('Invalid year', 'error');
                    return false;
                }

                var result = _commands().setHeadmaster(
                    institutionId, characterId, title, startYear
                );
                if (!result.success) {
                    _showToast(result.reason || 'Failed to appoint', 'error');
                    return false;
                }
                _persistAndWarn('Headmaster appointed');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 10. GRADUATE STUDENT MODAL
    // =========================================================================

    function openGraduateStudentModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var enrolled = details.students.filter(function(st) {
            return !st.graduated;
        });
        if (enrolled.length === 0) {
            _showToast('No enrolled students', 'info');
            if (typeof onSuccess === 'function') onSuccess();
            return;
        }

        var year = _getCurrentYear();

        var studentOptions = '';
        for (var i = 0; i < enrolled.length; i++) {
            var st = enrolled[i];
            studentOptions += '<option value="' + _escapeHtml(st.studentId) + '">' +
                _escapeHtml(st.studentName || 'Unknown') +
                ' (' + (st.age !== null ? st.age + 'y' : '?') + ')</option>';
        }

        var taughtRoles = s.taughtRoleCount > 0 ? details.taughtRoles : [];
        var roleSelectHtml = '';
        if (taughtRoles.length > 1) {
            var roleOptions = '';
            for (var i = 0; i < taughtRoles.length; i++) {
                var roleId = taughtRoles[i];
                var role = _getRoleById(roleId);
                roleOptions += '<option value="' + _escapeHtml(roleId) + '">' +
                    _escapeHtml(role ? role.name : roleId) + '</option>';
            }
            roleSelectHtml =
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role to Grant</label>' +
                '<select id="graduateRoleSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                roleOptions +
                '</select>' +
                '<small style="font-size:0.5rem;color:var(--dim);">This institution teaches multiple roles. Choose which to grant.</small>' +
                '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            'Graduate a student from <strong>' + _escapeHtml(s.name) + '</strong>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Student</label>' +
            '<select id="graduateStudentSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            studentOptions + '</select></div>' +

            roleSelectHtml +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Graduation Year</label>' +
            '<input type="number" id="graduateYear" value="' + year +
            '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>';

        _openModal({
            titleHtml: 'Graduate Student',
            contentHtml: content,
            confirmText: 'Graduate',
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var studentId = modalEl.querySelector('#graduateStudentSelect').value;
                var gradYear = parseInt(
                    modalEl.querySelector('#graduateYear').value, 10
                );
                var roleSel = modalEl.querySelector('#graduateRoleSelect');
                var roleId = roleSel ? (roleSel.value || null) : null;

                if (!studentId) {
                    _showToast('Select a student', 'error');
                    return false;
                }
                if (isNaN(gradYear) || gradYear < 1) {
                    _showToast('Invalid year', 'error');
                    return false;
                }

                var result = _commands().graduateStudent(
                    institutionId, studentId, gradYear, roleId
                );
                if (!result.success) {
                    if (result.availableRoles) {
                        _showToast('Please choose a role to grant', 'error');
                    } else {
                        _showToast(result.reason || 'Failed to graduate', 'error');
                    }
                    return false;
                }
                _persistAndWarn('Student graduated');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 11. DELETE INSTITUTION MODAL
    // =========================================================================

    function openDeleteInstitutionModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var studentCount = details.students.length;
        var teacherCount = details.teachers.length;

        var cascadeNote = (studentCount > 0 || teacherCount > 0)
            ? '<div style="margin-top:8px;padding:8px;background:rgba(200,112,64,0.15);border-radius:4px;font-size:0.6rem;">' +
              'If cascade is unchecked, students and teachers are removed ' +
              'from the institution record without a withdrawal history ' +
              'entry on any character. Check cascade unless you know why.</div>'
            : '';

        var content =
            '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
            '<strong>' + _getIcon('WARNING') + ' This cannot be undone</strong>' +
            '<div style="margin-top:8px;">Delete <strong>' +
            _escapeHtml(s.name) + '</strong>?</div>' +
            (studentCount > 0
                ? '<div style="margin-top:4px;">' + studentCount +
                  ' students enrolled</div>'
                : '') +
            (teacherCount > 0
                ? '<div style="margin-top:4px;">' + teacherCount +
                  ' teachers hired</div>'
                : '') +
            cascadeNote +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Type "<strong>' +
            _escapeHtml(s.name) + '</strong>" to confirm</label>' +
            '<input type="text" id="confirmDeleteInstName" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;">' +
            '<input type="checkbox" id="deleteCascade"> Cascade delete associated records' +
            '</label>' +
            '</div>';

        _openModal({
            titleHtml: 'Delete Institution',
            contentHtml: content,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function(modalEl) {
                var confirmName = modalEl.querySelector('#confirmDeleteInstName')
                    .value.trim();
                if (confirmName !== s.name) {
                    _showToast('Name does not match', 'error');
                    return false;
                }
                var cascade = modalEl.querySelector('#deleteCascade').checked;

                var result = _commands().deleteInstitution(institutionId, cascade);
                if (!result.success) {
                    _showToast(result.reason || 'Failed to delete', 'error');
                    return false;
                }
                _persistAndWarn('Institution deleted');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 12. TUITION MANAGEMENT MODAL
    // =========================================================================

    function openTuitionManagementModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var isPublic = s.ownershipType === 'public';

        var tuitionInfo = _commands().calculateTuition(
            institutionId, _getCurrentYear()
        );
        var tuitionDisplay = isPublic
            ? 'Free (Public)'
            : (tuitionInfo.success
                ? (tuitionInfo.tuition + ' gold')
                : 'Unknown');

        var history = _commands().getTuitionHistory(institutionId, 10);
        var historyHtml = '';
        for (var i = 0; i < history.length; i++) {
            var h = history[i];
            historyHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                '<span>' + _escapeHtml(String(h.year)) + '</span>' +
                '<span>' + h.oldAmount + ' → ' + h.newAmount + '</span>' +
                '<span style="color:var(--dim);">' +
                _escapeHtml(h.reason || '') + '</span>' +
                '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            '<div style="font-size:0.7rem;"><strong>' +
            _escapeHtml(s.name) + '</strong></div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current: <strong>' +
            _escapeHtml(tuitionDisplay) + '</strong></div>' +
            (isPublic
                ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:2px;">Public schools are funded by settlement. Change ownership for a private school.</div>'
                : '') +
            '</div>' +

            (isPublic ? '' :
                '<div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Tuition (gold/year)</label>' +
                '<input type="number" id="tuitionBase" value="' +
                (s.baseTuition || 0) +
                '" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Manual Override</label>' +
                '<input type="number" id="tuitionOverride" min="0" max="200" placeholder="Leave empty for calculated" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;">' +
                '<input type="checkbox" id="tuitionWaive"> Waive tuition for all students</label>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                '<input type="text" id="tuitionReason" placeholder="e.g., Inflation, Scholarship" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                (historyHtml
                    ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
                      '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">History</div>' +
                      '<div style="max-height:150px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:6px;">' +
                      historyHtml + '</div>' +
                      '</div>'
                    : '') +
                '</div>'
            );

        _openModal({
            titleHtml: 'Tuition: ' + _escapeHtml(s.name),
            contentHtml: content,
            confirmText: isPublic ? 'Close' : 'Save',
            cancelText: isPublic ? '' : 'Cancel',
            onConfirm: function(modalEl) {
                if (isPublic) {
                    _closeTopModal();
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var base = parseInt(
                    modalEl.querySelector('#tuitionBase').value, 10
                ) || 0;
                var overrideEl = modalEl.querySelector('#tuitionOverride');
                var override = overrideEl ? overrideEl.value : '';
                var waive = modalEl.querySelector('#tuitionWaive').checked;
                var reason = modalEl.querySelector('#tuitionReason').value ||
                    'Manual update';

                var r1 = _commands().updateInstitution(institutionId, {
                    tuitionPerYear: base,
                    tuitionReason: reason
                });
                if (!r1.success) {
                    _showToast(r1.reason || 'Failed', 'error');
                    return false;
                }

                var overrideVal = override === '' ? null : parseInt(override, 10);
                var r2 = _commands().updateTuition(
                    institutionId, overrideVal, reason
                );
                if (!r2.success) {
                    _showToast(r2.reason || 'Failed', 'error');
                    return false;
                }

                var r3 = _commands().updateTuitionWaiver(
                    institutionId, waive, reason
                );
                if (!r3.success) {
                    _showToast(r3.reason || 'Failed', 'error');
                    return false;
                }

                _persistAndWarn('Tuition updated');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 13. OWNERSHIP MANAGEMENT MODAL
    // =========================================================================

    function openOwnershipManagementModal(institutionId, onSuccess) {
        var details = _queries().getInstitutionDetails(institutionId);
        if (!details) {
            _showToast('Institution not found', 'error');
            return;
        }

        var s = details.summary;
        var isPublic = s.ownershipType === 'public';
        var isPrivate = s.ownershipType === 'private';
        var isReligious = s.ownershipType === 'religious';
        var hasReligions = _getAllReligions().length > 0;

        var ownerState = {
            id: s.ownerId || null,
            type: s.ownerType || 'character'
        };

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            '<div style="font-size:0.7rem;"><strong>' +
            _escapeHtml(s.name) + '</strong></div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current: <strong>' +
            _escapeHtml(s.ownershipType || 'public') + '</strong></div>' +
            (s.ownerName
                ? '<div style="font-size:0.55rem;">Owner: ' +
                  _escapeHtml(s.ownerName) + '</div>'
                : '') +
            (s.religionName
                ? '<div style="font-size:0.55rem;color:#4a9e6a;">Religion: ' +
                  _escapeHtml(s.religionName) + '</div>'
                : '') +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Ownership Type</label>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
            '<input type="radio" name="mgmtOwnershipType" value="public"' +
            (isPublic ? ' checked' : '') + '> Public (free)</label>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
            '<input type="radio" name="mgmtOwnershipType" value="private"' +
            (isPrivate ? ' checked' : '') + '> Private (tuition)</label>' +
            (hasReligions
                ? '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
                  '<input type="radio" name="mgmtOwnershipType" value="religious"' +
                  (isReligious ? ' checked' : '') + '> Religious</label>'
                : '') +
            '</div></div>' +

            '<div id="mgmtReligionSection" style="' +
            (isReligious ? 'display:block;' : 'display:none;') +
            'margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Religion</label>' +
            '<select id="mgmtReligionSelect" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;color:var(--text);">' +
            _buildReligionOptions(s.religionId) +
            '</select></div>' +

            '<div id="mgmtOwnerSection" style="' +
            (isPrivate ? 'display:block;' : 'display:none;') +
            'margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<div style="display:flex;gap:8px;margin-bottom:6px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
            '<input type="radio" name="mgmtOwnerType" value="character"' +
            (ownerState.type === 'character' ? ' checked' : '') + '> Character</label>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
            '<input type="radio" name="mgmtOwnerType" value="household"' +
            (ownerState.type === 'household' ? ' checked' : '') + '> Household</label>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<input type="text" id="mgmtOwnerName" value="' +
            _escapeHtml(s.ownerName || '') +
            '" readonly style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;color:var(--text);cursor:pointer;">' +
            '<button type="button" id="mgmtSelectOwnerBtn" class="btn" style="padding:4px 10px;font-size:0.6rem;">Select</button>' +
            '</div></div>';

        _openModal({
            titleHtml: 'Ownership: ' + _escapeHtml(s.name),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onMount: function(modalEl) {
                var radios = modalEl.querySelectorAll('input[name="mgmtOwnershipType"]');
                var religionSection = modalEl.querySelector('#mgmtReligionSection');
                var ownerSection = modalEl.querySelector('#mgmtOwnerSection');

                function update() {
                    var v = null;
                    for (var i = 0; i < radios.length; i++) {
                        if (radios[i].checked) v = radios[i].value;
                    }
                    religionSection.style.display =
                        (v === 'religious') ? 'block' : 'none';
                    ownerSection.style.display =
                        (v === 'private') ? 'block' : 'none';
                }
                for (var i = 0; i < radios.length; i++) {
                    radios[i].addEventListener('change', update);
                }

                var ownerNameInput = modalEl.querySelector('#mgmtOwnerName');
                var selectBtn = modalEl.querySelector('#mgmtSelectOwnerBtn');

                selectBtn.addEventListener('click', function() {
                    var t = modalEl.querySelector(
                        'input[name="mgmtOwnerType"]:checked'
                    );
                    var type = t ? t.value : 'character';
                    if (type === 'character') {
                        _openCharacterSelector('Select Owner', function(c) {
                            if (!c) return;
                            ownerNameInput.value = c.name +
                                (c.surname ? ' ' + c.surname : '');
                            ownerState.id = c.id;
                            ownerState.type = 'character';
                        });
                    } else {
                        _openHouseholdSelector('Select Owner', function(h) {
                            if (!h) return;
                            ownerNameInput.value = h.name;
                            ownerState.id = h.id;
                            ownerState.type = 'household';
                        });
                    }
                });
            },
            onConfirm: function(modalEl) {
                var selected = null;
                var radios = modalEl.querySelectorAll('input[name="mgmtOwnershipType"]');
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) selected = radios[i].value;
                }
                if (!selected) {
                    _showToast('Choose ownership', 'error');
                    return false;
                }

                var ownerId = null;
                var ownerType = null;
                if (selected === 'private') {
                    ownerId = ownerState.id;
                    ownerType = ownerState.type;
                    if (!ownerId) {
                        _showToast('Select an owner', 'error');
                        return false;
                    }
                }

                var religionId = null;
                if (selected === 'religious') {
                    religionId = modalEl.querySelector('#mgmtReligionSelect').value;
                    if (!religionId) {
                        _showToast('Select a religion', 'error');
                        return false;
                    }
                }

                var result = _commands().setSchoolOwnership(
                    institutionId,
                    selected,
                    ownerId || religionId,
                    ownerType || (selected === 'religious' ? 'religion' : null)
                );
                if (!result.success) {
                    _showToast(result.reason || 'Failed', 'error');
                    return false;
                }

                _persistAndWarn('Ownership updated');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.openCreateInstitutionModal = openCreateInstitutionModal;
    window.openEditInstitutionModal = openEditInstitutionModal;
    window.openEditCurriculumModal = openEditCurriculumModal;
    window.openInstitutionDetailsModal = openInstitutionDetailsModal;
    window.openEnrollStudentModal = openEnrollStudentModal;
    window.openHireTeacherModal = openHireTeacherModal;
    window.openSetHeadmasterModal = openSetHeadmasterModal;
    window.openDeleteInstitutionModal = openDeleteInstitutionModal;
    window.openTuitionManagementModal = openTuitionManagementModal;
    window.openOwnershipManagementModal = openOwnershipManagementModal;
    window.openGraduateStudentModal = openGraduateStudentModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateInstitutionModal: openCreateInstitutionModal,
            openEditInstitutionModal: openEditInstitutionModal,
            openEditCurriculumModal: openEditCurriculumModal,
            openInstitutionDetailsModal: openInstitutionDetailsModal,
            openEnrollStudentModal: openEnrollStudentModal,
            openHireTeacherModal: openHireTeacherModal,
            openSetHeadmasterModal: openSetHeadmasterModal,
            openDeleteInstitutionModal: openDeleteInstitutionModal,
            openTuitionManagementModal: openTuitionManagementModal,
            openOwnershipManagementModal: openOwnershipManagementModal,
            openGraduateStudentModal: openGraduateStudentModal
        };
    }
})();
