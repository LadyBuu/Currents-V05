/**
 * =============================================================================
 * STILL WATERS - ROLE MODALS (modals-roles.js)
 * =============================================================================
 *
 * LOCATION: js/core/modals/modals-roles.js
 *
 * All role-management UI modals. This is the presentation layer.
 *
 * Contract:
 *   - Reads via RoleQueries. Writes via RoleCommands.
 *   - Never mutates role or character state directly.
 *   - Never re-derives eligibility, salary, literacy, or skill rules.
 *     Those live in the command/query/constant layers.
 *   - No recursion guards. Modal handlers are synchronous event callbacks.
 *   - No timers. Handlers are attached in the modal's onOpen callback.
 *   - No fallback APIs. Required modules are checked at load time.
 *   - Icons come from Icons via _getIcon(). No inline Unicode symbols.
 *
 * DEPENDENCIES (must be loaded first):
 *   - modals-core.js        (openModal, closeTopModal)
 *   - formatting.js         (_escapeHtml)
 *   - ui.js                 (_showToast)
 *   - icons.js              (Icons)
 *   - role-constants.js     (RoleConstants)
 *   - role-state.js         (RoleState)
 *   - role-queries.js       (RoleQueries)
 *   - role-commands.js      (RoleCommands)
 *   - accessors.js          (getCharacterById, getCharacters)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',            'modals-core.js'],
        ['closeTopModal',        'modals-core.js'],
        ['_escapeHtml',          'formatting.js'],
        ['_showToast',           'ui.js'],
        ['RoleConstants',        'role-constants.js'],
        ['RoleState',            'role-state.js'],
        ['RoleQueries',          'role-queries.js'],
        ['RoleCommands',         'role-commands.js'],
        ['getCharacterById',     'accessors.js'],
        ['getCharacters',        'accessors.js']
    ];
    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-roles.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    var RC = window.RoleConstants;
    var RQ = window.RoleQueries;
    var RCMD = window.RoleCommands;

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _esc(v) {
        return window._escapeHtml(v == null ? '' : String(v));
    }

    function _icon(name) {
        if (!window.Icons || typeof window.Icons[name] !== 'string') {
            throw new Error('modals-roles.js: unknown icon "' + name + '".');
        }
        return window.Icons[name];
    }

    function _iconSpan(name) {
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' +
            _icon(name) + '</span>';
    }

    function _categoryLabel(categoryId) {
        var categories = window.RoleState.getCategories();
        var cat = categories[categoryId];
        return cat ? cat.name : RC.UNCATEGORIZED_NAME;
    }

    function _literacyLabel(level) {
        if (!level) return RC.LITERACY_LEVEL_NAMES.none;
        return RC.LITERACY_LEVEL_NAMES[level] || level;
    }

    function _displayName(character) {
        if (!character) return '';
        return ((character.name || '') + ' ' + (character.surname || '')).trim();
    }

    function _skillLabel(level) {
        return level + ' (' + window.SkillUtils.getSkillLevelName(level) + ')';
    }

    function _genderSymbol(gender) {
        // Textual, not iconic. Kept as short labels to avoid depending on
        // gender-specific SVG assets that may not exist.
        if (gender === 'male') return 'M';
        if (gender === 'female') return 'F';
        return '?';
    }

    // =========================================================================
    // 3. SHARED SMALL BUILDERS
    // =========================================================================

    function _buildCategoryOptions(selectedId) {
        var categories = window.RoleState.getCategories();
        var keys = Object.keys(categories).sort(function (a, b) {
            return categories[a].name.localeCompare(categories[b].name);
        });
        var html = '';
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var cat = categories[key];
            var sel = key === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(key) + '"' + sel + '>' +
                _esc(cat.name) + '</option>';
        }
        return html;
    }

    function _buildGenderOptions(selectedId) {
        var opts = [
            { id: 'both',   label: 'Both Genders' },
            { id: 'male',   label: 'Male Only' },
            { id: 'female', label: 'Female Only' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(opts[i].id) + '"' + sel + '>' +
                _esc(opts[i].label) + '</option>';
        }
        return html;
    }

    function _buildLiteracyOptions(selectedId) {
        var levels = RC.REQUIRABLE_LITERACY_LEVELS;
        var html = '<option value="">-- Select Level --</option>';
        for (var i = 0; i < levels.length; i++) {
            var lvl = levels[i];
            var sel = lvl === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(lvl) + '"' + sel + '>' +
                _esc(RC.LITERACY_LEVEL_NAMES[lvl]) + '</option>';
        }
        return html;
    }

    function _readFormValue(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _readFormChecked(id) {
        var el = document.getElementById(id);
        return el ? el.checked === true : false;
    }

    function _readFormNumber(id, fallback) {
        var raw = _readFormValue(id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    function _confirmThen(message, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, onConfirm);
        } else if (window.confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 4. CREATE ROLE MODAL
    // =========================================================================

    function openCreateRoleModal(onSuccess) {
        var categories = window.RoleState.getCategories();
        var firstCategory = Object.keys(categories).sort()[0] || RC.UNCATEGORIZED_ID;

        var content =
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role Name *</label>' +
                '<input type="text" id="newRoleName" placeholder="e.g. Blacksmith, Scribe, Alchemist" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Category</label>' +
                '<select id="newRoleCategory" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    _buildCategoryOptions(firstCategory) +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender Restriction</label>' +
                '<select id="newRoleGender" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    _buildGenderOptions('both') +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon Name</label>' +
                '<input type="text" id="newRoleIcon" value="CIRCLE" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '<small style="font-size:0.55rem;color:var(--dim);">Name of an icon registered in icons.js (e.g. HAMMER, BOOK).</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Salary (gold/year)</label>' +
                '<input type="number" id="newRoleSalary" min="' + RC.MIN_SALARY + '" max="' + RC.MAX_SALARY + '" value="' +
                    _esc(RC.BASE_SALARY_BY_CATEGORY[firstCategory] || RC.DEFAULT_SALARY) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '<small style="font-size:0.55rem;color:var(--dim);">0 means no salary. Can be overridden per character.</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="newRoleRequiresLiteracy">' +
                    '<span>Requires Literacy</span>' +
                '</label>' +
                '<div id="newRoleLiteracyContainer" style="margin-top:6px;display:none;">' +
                    '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Required Level</label>' +
                    '<select id="newRoleLiteracyLevel" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _buildLiteracyOptions('') +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Specializations (comma-separated)</label>' +
                '<input type="text" id="newRoleSpecs" placeholder="e.g. Surgery, Herbalism" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="newRoleNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
            '</div>';

        window.openModal({
            title: 'Create New Role',
            content: content,
            confirmText: 'Create Role',
            cancelText: 'Cancel',
            onOpen: function () {
                var nameInput = document.getElementById('newRoleName');
                if (nameInput) nameInput.focus();

                var checkbox = document.getElementById('newRoleRequiresLiteracy');
                var container = document.getElementById('newRoleLiteracyContainer');
                if (checkbox && container) {
                    checkbox.addEventListener('change', function () {
                        container.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var categorySelect = document.getElementById('newRoleCategory');
                var salaryInput = document.getElementById('newRoleSalary');
                if (categorySelect && salaryInput) {
                    categorySelect.addEventListener('change', function () {
                        var cat = this.value;
                        var suggested = RC.BASE_SALARY_BY_CATEGORY[cat];
                        if (typeof suggested === 'number') {
                            salaryInput.value = String(suggested);
                        }
                    });
                }
            },
            onConfirm: function () {
                var requires = _readFormChecked('newRoleRequiresLiteracy');
                var literacyLevel = requires ? _readFormValue('newRoleLiteracyLevel') : null;
                var specsRaw = _readFormValue('newRoleSpecs');
                var specializations = specsRaw
                    ? specsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
                    : [];

                var result = window.RoleCommands.createRole({
                    name: _readFormValue('newRoleName'),
                    category: _readFormValue('newRoleCategory'),
                    genderRestriction: _readFormValue('newRoleGender'),
                    icon: _readFormValue('newRoleIcon') || 'CIRCLE',
                    baseSalary: _readFormNumber('newRoleSalary', RC.DEFAULT_SALARY),
                    requiresLiteracy: requires,
                    literacyLevel: literacyLevel,
                    specializations: specializations,
                    notes: _readFormValue('newRoleNotes')
                });

                if (!result.success) {
                    window._showToast(result.reason || 'Failed to create role', 'error');
                    return false;
                }

                window._showToast('Role "' + result.role.name + '" created', 'success');
                window.closeTopModal();
                if (typeof onSuccess === 'function') onSuccess(result.role.id);
                return true;
            }
        });
    }

    // =========================================================================
    // 5. EDIT ROLE MODAL
    // =========================================================================

    function openEditRoleModal(roleId, onSuccess) {
        var role = window.RoleState.getRole(roleId);
        if (!role) {
            window._showToast('Role not found', 'error');
            return;
        }

        // Draft state — DOM is a projection, not the source of truth.
        var draftSpecs = Array.isArray(role.specializations) ? role.specializations.slice() : [];

        function renderSpecsInto(container) {
            if (draftSpecs.length === 0) {
                container.innerHTML = '<span class="no-specs" style="font-size:0.65rem;color:var(--dim);">No specializations</span>';
                return;
            }
            var html = '';
            for (var i = 0; i < draftSpecs.length; i++) {
                html += '<span class="spec-item" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg3);padding:4px 8px;border-radius:16px;font-size:0.6rem;">' +
                    _esc(draftSpecs[i]) +
                    '<button type="button" class="remove-spec" data-index="' + i + '" style="background:none;border:none;cursor:pointer;color:var(--dim);">&times;</button>' +
                '</span>';
            }
            container.innerHTML = html;
        }

        var content =
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role Name</label>' +
                '<input type="text" id="editRoleName" value="' + _esc(role.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Category</label>' +
                '<select id="editRoleCategory" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    _buildCategoryOptions(role.category) +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender Restriction</label>' +
                '<select id="editRoleGender" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    _buildGenderOptions(role.genderRestriction) +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon Name</label>' +
                '<input type="text" id="editRoleIcon" value="' + _esc(role.icon || 'CIRCLE') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Salary (gold/year)</label>' +
                '<input type="number" id="editRoleSalary" min="' + RC.MIN_SALARY + '" max="' + RC.MAX_SALARY + '" value="' + _esc(role.baseSalary) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="editRoleRequiresLiteracy"' + (role.requiresLiteracy ? ' checked' : '') + '>' +
                    '<span>Requires Literacy</span>' +
                '</label>' +
                '<div id="editRoleLiteracyContainer" style="margin-top:6px;' + (role.requiresLiteracy ? '' : 'display:none;') + '">' +
                    '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Required Level</label>' +
                    '<select id="editRoleLiteracyLevel" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _buildLiteracyOptions(role.literacyLevel || '') +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Specializations</label>' +
                '<div id="editSpecsList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;"></div>' +
                '<div style="display:flex;gap:8px;">' +
                    '<input type="text" id="editNewSpec" placeholder="New specialization..." style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '<button type="button" id="editAddSpecBtn" class="btn small" style="padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Add</button>' +
                '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="editRoleNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' + _esc(role.notes || '') + '</textarea>' +
            '</div>';

        window.openModal({
            title: 'Edit Role: ' + role.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onOpen: function () {
                var nameInput = document.getElementById('editRoleName');
                if (nameInput) nameInput.focus();

                var checkbox = document.getElementById('editRoleRequiresLiteracy');
                var container = document.getElementById('editRoleLiteracyContainer');
                if (checkbox && container) {
                    checkbox.addEventListener('change', function () {
                        container.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var specsList = document.getElementById('editSpecsList');
                var newSpecInput = document.getElementById('editNewSpec');
                var addSpecBtn = document.getElementById('editAddSpecBtn');

                function refreshSpecs() {
                    renderSpecsInto(specsList);
                    var removeBtns = specsList.querySelectorAll('.remove-spec');
                    for (var i = 0; i < removeBtns.length; i++) {
                        (function (btn) {
                            btn.addEventListener('click', function () {
                                var idx = parseInt(btn.dataset.index, 10);
                                if (Number.isFinite(idx)) {
                                    draftSpecs.splice(idx, 1);
                                    refreshSpecs();
                                }
                            });
                        })(removeBtns[i]);
                    }
                }

                function addSpecFromInput() {
                    var value = newSpecInput.value.trim();
                    if (!value) return;
                    if (draftSpecs.indexOf(value) !== -1) {
                        window._showToast('Specialization already present', 'warning');
                        return;
                    }
                    draftSpecs.push(value);
                    newSpecInput.value = '';
                    refreshSpecs();
                    newSpecInput.focus();
                }

                if (addSpecBtn && newSpecInput && specsList) {
                    addSpecBtn.addEventListener('click', addSpecFromInput);
                    newSpecInput.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addSpecFromInput();
                        }
                    });
                    refreshSpecs();
                }
            },
            onConfirm: function () {
                var requires = _readFormChecked('editRoleRequiresLiteracy');
                var literacyLevel = requires ? _readFormValue('editRoleLiteracyLevel') : null;

                var result = window.RoleCommands.updateRole(roleId, {
                    name: _readFormValue('editRoleName'),
                    category: _readFormValue('editRoleCategory'),
                    genderRestriction: _readFormValue('editRoleGender'),
                    icon: _readFormValue('editRoleIcon') || 'CIRCLE',
                    baseSalary: _readFormNumber('editRoleSalary', role.baseSalary),
                    requiresLiteracy: requires,
                    literacyLevel: literacyLevel,
                    specializations: draftSpecs.slice(),
                    notes: _readFormValue('editRoleNotes')
                });

                if (!result.success) {
                    window._showToast(result.reason || 'Failed to update role', 'error');
                    return false;
                }

                window._showToast('Role "' + result.role.name + '" updated', 'success');
                window.closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. DELETE ROLE MODAL
    // =========================================================================

    function openDeleteRoleModal(roleId, onSuccess) {
        var role = window.RoleState.getRole(roleId);
        if (!role) {
            window._showToast('Role not found', 'error');
            return;
        }

        var holders = RQ.getCharactersWithRole(roleId);
        var holderCount = holders.length;

        var content =
            '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                '<strong>This action cannot be undone.</strong>' +
                '<div style="margin-top:8px;">Delete role <strong>' + _esc(role.name) + '</strong>?</div>' +
                (holderCount > 0
                    ? '<div style="margin-top:8px;">' + holderCount + ' character(s) currently hold this role.</div>'
                    : '') +
            '</div>' +
            (holderCount > 0
                ? '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                        '<input type="checkbox" id="deleteRemoveAssignments" checked>' +
                        '<span>Remove this role from all characters</span>' +
                    '</label>' +
                  '</div>'
                : '') +
            '<div style="padding:8px;background:rgba(200,68,68,0.1);border-radius:6px;font-size:0.55rem;color:#8a3020;">' +
                'The role record will be permanently removed from the role catalogue.' +
            '</div>';

        window.openModal({
            title: 'Delete Role: ' + role.name,
            content: content,
            confirmText: 'Delete Permanently',
            cancelText: 'Cancel',
            onConfirm: function () {
                var removeAssignments = holderCount > 0
                    ? _readFormChecked('deleteRemoveAssignments')
                    : false;

                var result = window.RoleCommands.deleteRole(roleId, {
                    removeAssignments: removeAssignments
                });

                if (!result.success) {
                    window._showToast(result.reason || 'Failed to delete role', 'error');
                    return false;
                }

                window._showToast('Role "' + role.name + '" deleted', 'info');
                window.closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 7. UNIFIED ASSIGNMENT MODAL (single + bulk)
    // =========================================================================
    //
    // One component, two modes. The difference is only whether multiple
    // characters can be selected. Everything else — eligibility filtering,
    // search, location filter, skill slider, notes — is shared.
    //
    // `mode` is 'single' or 'bulk'.

    function _openAssignModal(roleId, mode, onSuccess) {
        var role = window.RoleState.getRole(roleId);
        if (!role) {
            window._showToast('Role not found', 'error');
            return;
        }

        var selectedIds = [];
        var filters = {
            search: '',
            gender: 'all',
            locationId: 'all'
        };

        // Location lookup — ask RoleQueries which locations are occupied.
        // The resolver is a thin closure over the accessors layer.
        var locationIds = RQ.getOccupiedLocationIds(function (character) {
            return typeof window.getCurrentLocation === 'function'
                ? window.getCurrentLocation(character)
                : null;
        });

        var locationById = {};
        for (var i = 0; i < locationIds.length; i++) {
            locationById[locationIds[i]] = locationIds[i];
        }

        function currentEligible() {
            return RQ.getEligibleCharactersForRole(roleId, {
                search: filters.search,
                gender: filters.gender,
                locationId: filters.locationId,
                getLocation: function (character) {
                    return typeof window.getCurrentLocation === 'function'
                        ? window.getCurrentLocation(character)
                        : null;
                }
            });
        }

        function isSelected(id) {
            return selectedIds.indexOf(id) !== -1;
        }

        function renderCard(character) {
            var selected = isSelected(character.id);
            var age = typeof window.calculateAge === 'function'
                ? window.calculateAge(character.birthYear, false, null)
                : '?';
            var location = typeof window.getCurrentLocation === 'function'
                ? window.getCurrentLocation(character)
                : '';
            var roleCount = Array.isArray(character.professions)
                ? character.professions.length
                : 0;

            var checkbox = '';
            if (mode === 'bulk') {
                checkbox = '<input type="checkbox" class="assign-checkbox"' +
                    (selected ? ' checked' : '') + ' style="cursor:pointer;">';
            }

            return '<div class="assign-card" data-character-id="' + _esc(character.id) + '" style="' +
                    'padding:10px;margin-bottom:8px;' +
                    'background:' + (selected ? 'rgba(var(--accent-rgb),0.2)' : 'var(--bg3)') + ';' +
                    'border:1px solid ' + (selected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:6px;cursor:pointer;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        checkbox +
                        '<strong>' + _esc(_displayName(character)) + '</strong>' +
                        '<span style="font-size:0.6rem;color:var(--dim);">' +
                            _esc(_genderSymbol(character.gender)) + ' · ' + _esc(age) +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--accent);">' +
                        _esc(location || 'Unknown') + ' · ' + roleCount + ' role(s)' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        function renderList() {
            var eligible = currentEligible();
            var container = document.getElementById('assignList');
            if (!container) return;

            if (eligible.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">No eligible characters match your filters.</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < eligible.length; i++) {
                html += renderCard(eligible[i]);
            }
            container.innerHTML = html;

            var cards = container.querySelectorAll('.assign-card');
            for (var j = 0; j < cards.length; j++) {
                (function (card) {
                    card.addEventListener('click', function (e) {
                        var characterId = card.dataset.characterId;
                        if (mode === 'single') {
                            selectedIds = [characterId];
                            refreshSelectionStyles(container);
                            return;
                        }
                        if (e.target && e.target.classList &&
                            e.target.classList.contains('assign-checkbox')) {
                            toggleSelection(characterId, e.target.checked);
                        } else {
                            var cb = card.querySelector('.assign-checkbox');
                            var next = cb ? !cb.checked : true;
                            if (cb) cb.checked = next;
                            toggleSelection(characterId, next);
                        }
                        refreshSelectionStyles(container);
                    });
                })(cards[j]);
            }
        }

        function toggleSelection(characterId, add) {
            var idx = selectedIds.indexOf(characterId);
            if (add && idx === -1) selectedIds.push(characterId);
            if (!add && idx !== -1) selectedIds.splice(idx, 1);
            var counter = document.getElementById('assignSelectedCount');
            if (counter) counter.textContent = String(selectedIds.length);
        }

        function refreshSelectionStyles(container) {
            var cards = container.querySelectorAll('.assign-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                var selected = isSelected(card.dataset.characterId);
                card.style.background = selected ? 'rgba(var(--accent-rgb),0.2)' : 'var(--bg3)';
                card.style.borderColor = selected ? 'var(--accent)' : 'var(--border)';
            }
            var counter = document.getElementById('assignSelectedCount');
            if (counter) counter.textContent = String(selectedIds.length);
        }

        var heading = mode === 'bulk'
            ? 'Bulk Assign: ' + role.name
            : 'Assign ' + role.name;

        var literacyNotice = '';
        if (role.requiresLiteracy && role.literacyLevel) {
            literacyNotice =
                '<div style="padding:8px;background:rgba(200,112,64,0.15);border:1px solid var(--warn);border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                    'This role requires <strong>' + _esc(_literacyLabel(role.literacyLevel)) + '</strong>.' +
                '</div>';
        }

        var locationOptions = '<option value="all">All Locations</option>';
        for (var li = 0; li < locationIds.length; li++) {
            var locId = locationIds[li];
            locationOptions += '<option value="' + _esc(locId) + '">' + _esc(locId) + '</option>';
        }

        var content =
            '<div style="margin-bottom:16px;background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<strong>' + _esc(role.name) + '</strong>' +
                '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                    _esc(_categoryLabel(role.category)) +
                    (role.genderRestriction !== 'both' ? ' · Restricted: ' + _esc(role.genderRestriction) : '') +
                    ' · ' + (role.baseSalary > 0 ? 'Salary: ' + _esc(role.baseSalary) + '/yr' : 'No salary') +
                '</div>' +
            '</div>' +
            literacyNotice +
            '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
                '<select id="assignGender" style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.65rem;">' +
                    '<option value="all">All Genders</option>' +
                    '<option value="male">Male</option>' +
                    '<option value="female">Female</option>' +
                '</select>' +
                '<select id="assignLocation" style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.65rem;">' +
                    locationOptions +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<input type="text" id="assignSearch" placeholder="Search characters..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
            '</div>' +
            (mode === 'bulk'
                ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
                    '<button type="button" id="assignSelectAll" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select All</button>' +
                    '<button type="button" id="assignSelectNone" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select None</button>' +
                    '<span style="font-size:0.55rem;color:var(--dim);margin-left:auto;"><span id="assignSelectedCount">0</span> selected</span>' +
                  '</div>'
                : '') +
            '<div id="assignList" style="max-height:300px;overflow-y:auto;"></div>' +
            '<div class="form-group" style="margin-top:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Skill Level</label>' +
                '<input type="range" id="assignSkill" min="0" max="100" value="10" step="1" style="width:100%;">' +
                '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.6rem;">' +
                    '<span>0</span>' +
                    '<span id="assignSkillDisplay">' + _esc(_skillLabel(10)) + '</span>' +
                    '<span>100</span>' +
                '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="assignNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" placeholder="How was this role acquired?"></textarea>' +
            '</div>';

        window.openModal({
            title: heading,
            content: content,
            confirmText: mode === 'bulk' ? 'Assign to Selected' : 'Assign',
            cancelText: 'Cancel',
            onOpen: function () {
                var searchInput = document.getElementById('assignSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function () {
                        filters.search = this.value;
                        renderList();
                    });
                }

                var genderSelect = document.getElementById('assignGender');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function () {
                        filters.gender = this.value;
                        renderList();
                    });
                }

                var locationSelect = document.getElementById('assignLocation');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function () {
                        filters.locationId = this.value;
                        renderList();
                    });
                }

                var slider = document.getElementById('assignSkill');
                var display = document.getElementById('assignSkillDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function () {
                        var v = parseInt(this.value, 10) || 0;
                        display.textContent = _skillLabel(v);
                    });
                }

                if (mode === 'bulk') {
                    var selectAll = document.getElementById('assignSelectAll');
                    if (selectAll) {
                        selectAll.addEventListener('click', function () {
                            var eligible = currentEligible();
                            selectedIds = eligible.map(function (c) { return c.id; });
                            renderList();
                        });
                    }
                    var selectNone = document.getElementById('assignSelectNone');
                    if (selectNone) {
                        selectNone.addEventListener('click', function () {
                            selectedIds = [];
                            renderList();
                        });
                    }
                }

                renderList();
            },
            onConfirm: function () {
                if (selectedIds.length === 0) {
                    window._showToast('Select at least one character', 'error');
                    return false;
                }

                var skill = parseInt(_readFormValue('assignSkill'), 10);
                if (!Number.isFinite(skill)) skill = 0;
                var notes = _readFormValue('assignNotes');

                if (mode === 'single') {
                    var result = window.RoleCommands.assignRoleToCharacter(selectedIds[0], roleId, {
                        skillLevel: skill,
                        notes: notes
                    });
                    if (!result.success) {
                        window._showToast(result.reason || 'Failed to assign role', 'error');
                        return false;
                    }
                    var character = window.getCharacterById(selectedIds[0]);
                    window._showToast((_displayName(character) || 'Character') + ' assigned ' + role.name, 'success');
                } else {
                    var bulk = window.RoleCommands.bulkAssignRole(selectedIds, roleId, {
                        skillLevel: skill,
                        notes: notes
                    });
                    if (bulk.success === 0) {
                        window._showToast('No assignments succeeded', 'error');
                        return false;
                    }
                    window._showToast('Assigned ' + role.name + ' to ' + bulk.success + ' character(s)', 'success');
                    if (bulk.failed > 0) {
                        window._showToast(bulk.failed + ' assignment(s) failed', 'warning');
                    }
                }

                window.closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    function openAssignRoleModal(roleId, onSuccess) {
        _openAssignModal(roleId, 'single', onSuccess);
    }

    function openBulkAssignRoleModal(roleId, onSuccess) {
        _openAssignModal(roleId, 'bulk', onSuccess);
    }

    // =========================================================================
    // 8. VIEW CHARACTERS WITH ROLE
    // =========================================================================

    function openViewCharactersWithRoleModal(roleId) {
        var role = window.RoleState.getRole(roleId);
        if (!role) {
            window._showToast('Role not found', 'error');
            return;
        }

        var details = RQ.getCharactersWithRoleDetails(roleId);
        var html;

        if (details.length === 0) {
            html = '<div style="text-align:center;padding:40px;color:var(--dim);">No characters hold this role.</div>';
        } else {
            html = '<div style="max-height:400px;overflow-y:auto;">' +
                '<table style="width:100%;font-size:0.6rem;border-collapse:collapse;">' +
                    '<thead>' +
                        '<tr style="background:var(--bg2);">' +
                            '<th style="padding:6px;text-align:left;">Name</th>' +
                            '<th style="padding:6px;text-align:center;">Skill</th>' +
                            '<th style="padding:6px;text-align:center;">Tier</th>' +
                            '<th style="padding:6px;text-align:center;">Can Teach</th>' +
                            '<th style="padding:6px;text-align:left;">Specializations</th>' +
                            '<th style="padding:6px;text-align:center;">Primary</th>' +
                        '</tr>' +
                    '</thead><tbody>';

            for (var i = 0; i < details.length; i++) {
                var d = details[i];
                var name = _displayName(d.character);
                var specText = d.specializations.length > 0
                    ? d.specializations.slice(0, 3).map(_esc).join(', ') +
                      (d.specializations.length > 3 ? '…' : '')
                    : '';
                html += '<tr style="border-top:1px solid var(--border-light);">' +
                    '<td style="padding:4px 6px;">' + _esc(name) + '</td>' +
                    '<td style="padding:4px 6px;text-align:center;">' + _esc(d.skillLevel) + '</td>' +
                    '<td style="padding:4px 6px;text-align:center;">' + _esc(d.tierName) + '</td>' +
                    '<td style="padding:4px 6px;text-align:center;">' + (d.canTeach ? '✓' : '') + '</td>' +
                    '<td style="padding:4px 6px;">' + specText + '</td>' +
                    '<td style="padding:4px 6px;text-align:center;">' + (d.isPrimary ? '✓' : '') + '</td>' +
                '</tr>';
            }

            html += '</tbody></table></div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>' + _esc(role.name) + '</strong>' +
                '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                    details.length + ' character(s)' +
                '</div>' +
            '</div>' +
            html +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Characters with skill ' + window.SkillUtils.getTeachingThreshold() +
                '+ can teach this role.' +
            '</div>';

        window.openModal({
            title: 'Characters with ' + role.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {
                window.closeTopModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. EDIT ROLE SKILL MODAL
    // =========================================================================

    function openEditRoleSkillModal(roleId, characterId, onSuccess) {
        var role = window.RoleState.getRole(roleId);
        var character = window.getCharacterById(characterId);
        if (!role || !character) {
            window._showToast('Role or character not found', 'error');
            return;
        }

        var current = RQ.getSkillLevel(characterId, roleId);
        if (current === null) {
            window._showToast('Character does not hold this role', 'error');
            return;
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>' + _esc(_displayName(character)) + '</strong>' +
                '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                    _esc(role.name) + ' · Current: ' + _esc(_skillLabel(current)) +
                '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Skill Level</label>' +
                '<input type="range" id="editSkillSlider" min="0" max="100" value="' + _esc(current) + '" step="1" style="width:100%;">' +
                '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.6rem;">' +
                    '<span>0</span>' +
                    '<span id="editSkillDisplay">' + _esc(_skillLabel(current)) + '</span>' +
                    '<span>100</span>' +
                '</div>' +
            '</div>';

        window.openModal({
            title: 'Edit Skill: ' + _displayName(character) + ' (' + role.name + ')',
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onOpen: function () {
                var slider = document.getElementById('editSkillSlider');
                var display = document.getElementById('editSkillDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function () {
                        var v = parseInt(this.value, 10) || 0;
                        display.textContent = _skillLabel(v);
                    });
                }
            },
            onConfirm: function () {
                var value = parseInt(_readFormValue('editSkillSlider'), 10);
                if (!Number.isFinite(value)) value = 0;

                var result = window.RoleCommands.updateCharacterSkill(characterId, roleId, value);
                if (!result.success) {
                    window._showToast(result.reason || 'Failed to update skill', 'error');
                    return false;
                }

                window._showToast('Skill updated to ' + value, 'success');
                window.closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 10. LIST ROLES MODAL
    // =========================================================================

    function openListRolesModal(onSelect) {
        var content =
            '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
                '<input type="text" id="listRoleSearch" placeholder="Search roles..." style="flex:1;min-width:120px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                '<select id="listRoleCategory" style="padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                    '<option value="all">All Categories</option>' +
                    _buildCategoryOptions('') +
                '</select>' +
            '</div>' +
            '<div id="listRoleResults" style="max-height:400px;overflow-y:auto;"></div>' +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Select a role to continue.' +
            '</div>';

        function renderResults() {
            var search = _readFormValue('listRoleSearch');
            var category = _readFormValue('listRoleCategory');
            var container = document.getElementById('listRoleResults');
            if (!container) return;

            var roles = RQ.getRoles({
                search: search,
                category: category === 'all' ? null : category
            });

            if (roles.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--dim);">No roles match your filters.</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < roles.length; i++) {
                var r = roles[i];
                var stats = RQ.getRoleStatistics(r.id);
                html += '<div class="list-role-item" data-role-id="' + _esc(r.id) + '" style="' +
                        'display:flex;justify-content:space-between;align-items:center;' +
                        'padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:4px;cursor:pointer;">' +
                    '<div>' +
                        '<span>' + _esc(r.name) + '</span>' +
                        '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
                            _esc(_categoryLabel(r.category)) +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--accent);">' +
                        stats.totalCharacters + ' holder(s)' +
                    '</div>' +
                '</div>';
            }
            container.innerHTML = html;

            var items = container.querySelectorAll('.list-role-item');
            for (var j = 0; j < items.length; j++) {
                (function (item) {
                    item.addEventListener('click', function () {
                        var roleId = item.dataset.roleId;
                        var role = window.RoleState.getRole(roleId);
                        if (!role) return;
                        window.closeTopModal();
                        if (typeof onSelect === 'function') onSelect(role);
                    });
                })(items[j]);
            }
        }

        window.openModal({
            title: 'Select Role',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function () {
                var searchInput = document.getElementById('listRoleSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', renderResults);
                }
                var categorySelect = document.getElementById('listRoleCategory');
                if (categorySelect) {
                    categorySelect.addEventListener('change', renderResults);
                }
                renderResults();
            },
            onConfirm: function () {
                window.closeTopModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 11. CATEGORY MANAGER MODAL
    // =========================================================================

    function openCategoryManagerModal(onSuccess) {
        function renderManager() {
            var categories = window.RoleState.getCategories();
            var roles = window.RoleState.getAllRoles();

            var counts = {};
            for (var i = 0; i < roles.length; i++) {
                var c = roles[i].category || RC.UNCATEGORIZED_ID;
                counts[c] = (counts[c] || 0) + 1;
            }

            var keys = Object.keys(categories).sort(function (a, b) {
                return categories[a].name.localeCompare(categories[b].name);
            });

            var html = '';
            for (var j = 0; j < keys.length; j++) {
                var key = keys[j];
                var cat = categories[key];
                var isUncategorized = key === RC.UNCATEGORIZED_ID;
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg2);border-radius:4px;margin-bottom:4px;">' +
                    '<div>' +
                        '<strong>' + _esc(cat.name) + '</strong>' +
                        '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
                            (counts[key] || 0) + ' role(s)' +
                        '</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;">' +
                        (isUncategorized
                            ? ''
                            : '<button type="button" class="cat-edit" data-cat-id="' + _esc(key) + '" style="padding:2px 6px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Edit</button>' +
                              '<button type="button" class="cat-delete" data-cat-id="' + _esc(key) + '" style="padding:2px 6px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Delete</button>') +
                    '</div>' +
                '</div>';
            }

            return '<div style="margin-bottom:12px;">' +
                    '<button type="button" id="catAddBtn" style="padding:4px 12px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;font-size:0.6rem;">Add Category</button>' +
                '</div>' +
                '<div style="max-height:300px;overflow-y:auto;">' + html + '</div>' +
                '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                    'Uncategorized cannot be deleted.' +
                '</div>';
        }

        function openManagerModal() {
            var content = renderManager();

            window.openModal({
                title: 'Manage Categories',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onOpen: function () {
                    var addBtn = document.getElementById('catAddBtn');
                    if (addBtn) {
                        addBtn.addEventListener('click', function () {
                            var name = window.prompt('Category name:');
                            if (!name || !name.trim()) return;
                            var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                            if (!id) {
                                window._showToast('Invalid category name', 'error');
                                return;
                            }
                            var result = window.RoleCommands.addCategory(id, name.trim());
                            if (!result.success) {
                                window._showToast(result.reason || 'Failed to add category', 'error');
                                return;
                            }
                            window._showToast('Category added', 'success');
                            window.closeTopModal();
                            openManagerModal();
                        });
                    }

                    var editBtns = document.querySelectorAll('.cat-edit');
                    for (var i = 0; i < editBtns.length; i++) {
                        (function (btn) {
                            btn.addEventListener('click', function () {
                                var catId = btn.dataset.catId;
                                var categories = window.RoleState.getCategories();
                                var current = categories[catId];
                                if (!current) return;
                                var newName = window.prompt('Rename category:', current.name);
                                if (!newName || !newName.trim() || newName.trim() === current.name) return;
                                var result = window.RoleCommands.updateCategory(catId, { name: newName.trim() });
                                if (!result.success) {
                                    window._showToast(result.reason || 'Failed to update category', 'error');
                                    return;
                                }
                                window._showToast('Category updated', 'success');
                                window.closeTopModal();
                                openManagerModal();
                            });
                        })(editBtns[i]);
                    }

                    var deleteBtns = document.querySelectorAll('.cat-delete');
                    for (var j = 0; j < deleteBtns.length; j++) {
                        (function (btn) {
                            btn.addEventListener('click', function () {
                                var catId = btn.dataset.catId;
                                var categories = window.RoleState.getCategories();
                                var cat = categories[catId];
                                if (!cat) return;
                                var rolesInCat = window.RoleState.getAllRoles().filter(function (r) {
                                    return r.category === catId;
                                });
                                var msg = 'Delete category "' + cat.name + '"?';
                                if (rolesInCat.length > 0) {
                                    msg += '\n\n' + rolesInCat.length +
                                        ' role(s) will be reassigned to Uncategorized.';
                                }
                                _confirmThen(msg, function () {
                                    var result = window.RoleCommands.deleteCategory(catId);
                                    if (!result.success) {
                                        window._showToast(result.reason || 'Failed to delete category', 'error');
                                        return;
                                    }
                                    window._showToast('Category deleted', 'info');
                                    window.closeTopModal();
                                    openManagerModal();
                                });
                            });
                        })(deleteBtns[j]);
                    }
                },
                onConfirm: function () {
                    window.closeTopModal();
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }
            });
        }

        openManagerModal();
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.openCreateRoleModal = openCreateRoleModal;
    window.openEditRoleModal = openEditRoleModal;
    window.openDeleteRoleModal = openDeleteRoleModal;
    window.openAssignRoleModal = openAssignRoleModal;
    window.openBulkAssignRoleModal = openBulkAssignRoleModal;
    window.openViewCharactersWithRoleModal = openViewCharactersWithRoleModal;
    window.openEditRoleSkillModal = openEditRoleSkillModal;
    window.openListRolesModal = openListRolesModal;
    window.openCategoryManagerModal = openCategoryManagerModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateRoleModal: openCreateRoleModal,
            openEditRoleModal: openEditRoleModal,
            openDeleteRoleModal: openDeleteRoleModal,
            openAssignRoleModal: openAssignRoleModal,
            openBulkAssignRoleModal: openBulkAssignRoleModal,
            openViewCharactersWithRoleModal: openViewCharactersWithRoleModal,
            openEditRoleSkillModal: openEditRoleSkillModal,
            openListRolesModal: openListRolesModal,
            openCategoryManagerModal: openCategoryManagerModal
        };
    }
})();/**
 * =============================================================================
 * STILL WATERS - ROLES MODALS (modals-roles.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-roles.js
 * 
 * This file contains ALL role-specific UI modals.
 * This is the UI LAYER - it only handles rendering and user interaction.
 * All business logic is delegated to RoleCommands and RoleQueries.
 * 
 * ICON POLICY: NO EMOJIS - Use SVG icons from icons.js via _getIcon()
 * 
 * UPDATED: Removed SUGGESTED_ROLES references
 * UPDATED: Removed household/government role suggestions
 * UPDATED: Uses SkillUtils for skill level names
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - role-state.js (RoleState)
 *   - role-commands.js (RoleCommands)
 *   - role-queries.js (RoleQueries)
 *   - role-constants.js (BASE_SALARY_BY_CATEGORY, LITERACY_LEVEL_NAMES)
 *   - skill-utils.js (SkillUtils)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getPlaces)
 *   - constants.js (AGE_GROUPS, AGE_GROUPS_MAP)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 2. ICON HELPERS (using icons.js - NO EMOJIS)
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getIconHTML(name, size) {
        var icon = _getIcon(name);
        if (!size) size = '1em';
        if (icon) {
            return icon.replace(/width="[^"]*"/, 'width="' + size + '"').replace(/height="[^"]*"/, 'height="' + size + '"');
        }
        return '';
    }

    // =========================================================================
    // 3. AGE GROUPS FROM CONSTANTS.JS
    // =========================================================================

    function _getAgeGroups() {
        if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
            return window.AGE_GROUPS;
        }
        return ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    function _getAgeGroupLabel(group) {
        if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
            return window.AGE_GROUPS_MAP[group].label;
        }
        return group + ' years';
    }

    // =========================================================================
    // 4. SKILL UTILITIES
    // =========================================================================

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (typeof window._getSkillLevelName === 'function') {
            return window._getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (typeof window.ApprenticeshipQueries !== 'undefined' && window.ApprenticeshipQueries.getSkillLevelName) {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    // =========================================================================
    // 5. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        if (typeof window._getCharacterById === 'function') {
            return window._getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        if (typeof window._getCharacters === 'function') {
            return window._getCharacters();
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        if (typeof window._getCurrentLocation === 'function') {
            return window._getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        if (typeof window._getLocationTypeById === 'function') {
            return window._getLocationTypeById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        if (typeof window._getPlaces === 'function') {
            return window._getPlaces();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        if (typeof window._getPlaceById === 'function') {
            return window._getPlaceById(id);
        }
        return null;
    }

    // =========================================================================
    // 6. CHARACTER SELECTOR
    // =========================================================================

    function _openCharacterSelectorForRoles(title, onSelect, options) {
        options = options || {};

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: title || 'Select Character',
                targetId: options.targetId || null,
                onSelect: onSelect,
                filters: {
                    gender: options.gender || 'all',
                    status: options.status || 'all',
                    showDeceased: options.showDeceased || false,
                    location: options.locationFilter || 'all',
                    ageMin: options.ageMin || null,
                    ageMax: options.ageMax || null
                },
                preset: options.preset || null
            });
            return;
        }

        if (typeof window.openUnifiedCharacterSelector === 'function') {
            window.openUnifiedCharacterSelector({
                title: title || 'Select Character',
                targetId: options.targetId || null,
                onSelect: onSelect,
                filters: {
                    gender: options.gender || 'all',
                    status: options.status || 'all',
                    showDeceased: options.showDeceased || false,
                    location: options.locationFilter || 'all',
                    ageMin: options.ageMin || null,
                    ageMax: options.ageMax || null
                },
                preset: options.preset || null
            });
            return;
        }

        _showToast('Character selector not available', 'error');
    }

    // =========================================================================
    // 7. LOCATION DROPDOWN
    // =========================================================================

    function _getLocationOptions(selectedId, placeholderText, includeAll) {
        placeholderText = placeholderText || '-- Select a location --';
        includeAll = includeAll !== undefined ? includeAll : true;

        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
        }

        var places = _getPlaces();
        var html = '';
        if (placeholderText) {
            html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
        }
        if (includeAll) {
            html += '<option value="all">All Locations</option>';
        }
        for (var i = 0; i < places.length; i++) {
            var selected = (selectedId === places[i].id) ? 'selected' : '';
            var type = _getLocationTypeById(places[i].typeId);
            var icon = (type && type.icon) ? type.icon : '⌂';
            html += '<option value="' + places[i].id + '" ' + selected + '>' +
                icon + ' ' + _escapeHtml(places[i].displayName) +
                (type ? ' (' + _escapeHtml(type.displayName) + ')' : '') +
                '</option>';
        }
        html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>Unknown Location</option>';
        return html;
    }

    // =========================================================================
    // 8. ROLE COMMAND WRAPPERS
    // =========================================================================

    function _createRole(data) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.createRole(data);
        }
        if (typeof window.createRole === 'function') {
            return window.createRole(data);
        }
        if (typeof window._createRole === 'function') {
            return window._createRole(data);
        }
        _showToast('Create role not available', 'error');
        return null;
    }

    function _updateRole(roleId, updates) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateRole(roleId, updates);
        }
        if (typeof window.updateRole === 'function') {
            return window.updateRole(roleId, updates);
        }
        if (typeof window._updateRole === 'function') {
            return window._updateRole(roleId, updates);
        }
        _showToast('Update role not available', 'error');
        return null;
    }

    function _deleteRole(roleId, removeFromCharacters) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.deleteRole(roleId, removeFromCharacters);
        }
        if (typeof window.deleteRole === 'function') {
            return window.deleteRole(roleId, removeFromCharacters);
        }
        if (typeof window._deleteRole === 'function') {
            return window._deleteRole(roleId, removeFromCharacters);
        }
        _showToast('Delete role not available', 'error');
        return false;
    }

    function _assignRoleToCharacter(characterId, roleId, options) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.assignRoleToCharacter(characterId, roleId, options);
        }
        if (typeof window.assignRoleToCharacter === 'function') {
            return window.assignRoleToCharacter(characterId, roleId, options);
        }
        if (typeof window._assignRoleToCharacter === 'function') {
            return window._assignRoleToCharacter(characterId, roleId, options);
        }
        _showToast('Assign role not available', 'error');
        return { success: false };
    }

    function _updateCharacterSkill(characterId, roleId, skillLevel) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateCharacterSkill(characterId, roleId, skillLevel);
        }
        if (typeof window.updateCharacterSkill === 'function') {
            return window.updateCharacterSkill(characterId, roleId, skillLevel);
        }
        if (typeof window._updateCharacterSkill === 'function') {
            return window._updateCharacterSkill(characterId, roleId, skillLevel);
        }
        _showToast('Update skill not available', 'error');
        return { success: false };
    }

    function _bulkAssignRole(characterIds, roleId, options) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.bulkAssignRole(characterIds, roleId, options);
        }
        if (typeof window.bulkAssignRole === 'function') {
            return window.bulkAssignRole(characterIds, roleId, options);
        }
        if (typeof window._bulkAssignRole === 'function') {
            return window._bulkAssignRole(characterIds, roleId, options);
        }
        _showToast('Bulk assign not available', 'error');
        return { success: 0, failed: 0, errors: [] };
    }

    // =========================================================================
    // 9. ROLE QUERY WRAPPERS
    // =========================================================================

    function _getAllRoles() {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoles({});
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        if (typeof window._getRoles === 'function') {
            return window._getRoles();
        }
        return [];
    }

    function _getRole(id) {
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRole === 'function') {
            return window.getRole(id);
        }
        if (typeof window._getRoleById === 'function') {
            return window._getRoleById(id);
        }
        return null;
    }

    function _getRoleStatistics(roleId) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoleStatistics(roleId);
        }
        if (typeof window.getRoleStatistics === 'function') {
            return window.getRoleStatistics(roleId);
        }
        if (typeof window._getRoleStatistics === 'function') {
            return window._getRoleStatistics(roleId);
        }
        return {};
    }

    function _getCharactersWithRoleDetails(roleId, mastersOnly) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getCharactersWithRoleDetails(roleId, mastersOnly);
        }
        if (typeof window.getCharactersWithRoleDetails === 'function') {
            return window.getCharactersWithRoleDetails(roleId, mastersOnly);
        }
        if (typeof window._getCharactersWithRoleDetails === 'function') {
            return window._getCharactersWithRoleDetails(roleId, mastersOnly);
        }
        return [];
    }

    function _getCharactersWithRole(roleId, mastersOnly) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getCharactersWithRole(roleId, mastersOnly);
        }
        if (typeof window.getCharactersWithRole === 'function') {
            return window.getCharactersWithRole(roleId, mastersOnly);
        }
        if (typeof window._getCharactersWithRole === 'function') {
            return window._getCharactersWithRole(roleId, mastersOnly);
        }
        return [];
    }

    function _getRoleCategories() {
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getCategories();
        }
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        if (typeof window._getRoleCategories === 'function') {
            return window._getRoleCategories();
        }
        return {};
    }

    function _getRoleCategoryList() {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoleCategoryList();
        }
        if (typeof window.getRoleCategoryList === 'function') {
            return window.getRoleCategoryList();
        }
        if (typeof window._getRoleCategoryList === 'function') {
            return window._getRoleCategoryList();
        }
        return [];
    }

    // =========================================================================
    // 10. GET SALARY OPTIONS
    // =========================================================================

    function _getBaseSalaryByCategory(category) {
        return window.BASE_SALARY_BY_CATEGORY?.[category] || window.DEFAULT_SALARY || 10;
    }

    function _getLiteracyLevelOptions(selected) {
        var levels = [
            { id: '', label: 'None' },
            { id: 'basic', label: 'Basic Literacy' },
            { id: 'literate', label: 'Literate' },
            { id: 'educated', label: 'Educated' },
            { id: 'scholar', label: 'Scholar' }
        ];
        return levels.map(function(l) {
            var sel = (l.id === selected) ? 'selected' : '';
            return '<option value="' + l.id + '" ' + sel + '>' + _escapeHtml(l.label) + '</option>';
        }).join('');
    }

    // =========================================================================
    // 11. CREATE ROLE MODAL
    // =========================================================================

    function openCreateRoleModal(onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var categories = _getRoleCategories();
            var plusIcon = _getIcon('PLUS');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var categoryOptions = Object.keys(categories).map(function(key) {
                var cat = categories[key];
                return '<option value="' + key + '">' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
            }).join('');

            var literacyOptions = _getLiteracyLevelOptions('');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem; color: var(--dim);">' +
                'Create a new role. Roles define professions that characters can have.' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name *</label>' +
                '<input type="text" id="newRoleName" placeholder="e.g., Blacksmith, Scribe, Alchemist" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                '<select id="newRoleCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                categoryOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="newRoleGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="both">Both Genders</option>' +
                '<option value="male">Male Only</option>' +
                '<option value="female">Female Only</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon (monochrome)</label>' +
                '<input type="text" id="newRoleIcon" value="◉" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Single character (◉, ⌇, ⚔, ⌆)</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Base Salary (gold per year)</label>' +
                '<input type="number" id="newRoleSalary" value="10" min="0" max="200" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">0 means no salary. This can be overridden per character.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="newRoleRequiresLiteracy" style="cursor: pointer;">' +
                '<span>Requires Literacy</span>' +
                '</label>' +
                '<div id="newRoleLiteracyContainer" style="margin-top: 6px; display: none;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Required Literacy Level</label>' +
                '<select id="newRoleLiteracyLevel" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                literacyOptions +
                '</select>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Characters must have at least this literacy level to hold this role.</small>' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations (comma-separated)</label>' +
                '<input type="text" id="newRoleSpecs" placeholder="e.g., Surgery, Herbalism, Midwifery" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">These can be taught/learned during apprenticeship</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="newRoleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;"></textarea>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 8px;">' +
                infoIcon + ' Roles can be taught at educational institutions. Characters can have multiple roles.' +
                '</div>';

            _openModal({
                title: 'Create New Role',
                content: modalContent,
                confirmText: 'Create Role',
                cancelText: 'Cancel',
                onOpen: function() {
                    var checkbox = document.getElementById('newRoleRequiresLiteracy');
                    var container = document.getElementById('newRoleLiteracyContainer');
                    if (checkbox && container) {
                        checkbox.onchange = function() {
                            container.style.display = this.checked ? 'block' : 'none';
                        };
                    }
                    var nameInput = document.getElementById('newRoleName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    var categorySelect = document.getElementById('newRoleCategory');
                    var salaryInput = document.getElementById('newRoleSalary');
                    if (categorySelect && salaryInput) {
                        categorySelect.onchange = function() {
                            var baseSalary = _getBaseSalaryByCategory(this.value);
                            salaryInput.value = baseSalary;
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newRoleName').value.trim();
                    if (!name) {
                        _showToast('Role name is required', 'error');
                        return false;
                    }

                    var specsText = document.getElementById('newRoleSpecs').value;
                    var specializations = specsText ? specsText.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }) : [];

                    var requiresLiteracy = document.getElementById('newRoleRequiresLiteracy').checked;
                    var literacyLevel = requiresLiteracy ? document.getElementById('newRoleLiteracyLevel').value : null;

                    var result = _createRole({
                        name: name,
                        category: document.getElementById('newRoleCategory').value,
                        icon: document.getElementById('newRoleIcon').value || '◉',
                        specializations: specializations,
                        notes: document.getElementById('newRoleNotes').value || '',
                        genderRestriction: document.getElementById('newRoleGender').value,
                        baseSalary: parseInt(document.getElementById('newRoleSalary').value) || 0,
                        requiresLiteracy: requiresLiteracy,
                        literacyLevel: literacyLevel
                    });

                    if (result) {
                        var salaryMsg = result.baseSalary > 0 ? ' (Salary: ' + result.baseSalary + ' gold)' : '';
                        var literacyMsg = requiresLiteracy ? ' (Requires: ' + (window.LITERACY_LEVEL_NAMES?.[literacyLevel] || literacyLevel) + ')' : '';
                        _showToast('Role "' + name + '" created' + salaryMsg + literacyMsg, 'success');
                        if (onSuccess) onSuccess(result.id);
                        _closeTopModal();
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 12. EDIT ROLE MODAL
    // =========================================================================

    function openEditRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var categories = _getRoleCategories();
            var editIcon = _getIcon('EDIT');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var categoryOptions = Object.keys(categories).map(function(key) {
                var cat = categories[key];
                var selected = (role.category === key) ? 'selected' : '';
                return '<option value="' + key + '" ' + selected + '>' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
            }).join('');

            var literacyOptions = _getLiteracyLevelOptions(role.literacyLevel || '');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem; color: var(--dim);">' +
                'Editing role: <strong>' + _escapeHtml(role.name) + '</strong>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name</label>' +
                '<input type="text" id="editRoleName" value="' + _escapeHtml(role.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                '<select id="editRoleCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                categoryOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="editRoleGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="both" ' + (role.genderRestriction === 'both' ? 'selected' : '') + '>Both Genders</option>' +
                '<option value="male" ' + (role.genderRestriction === 'male' ? 'selected' : '') + '>Male Only</option>' +
                '<option value="female" ' + (role.genderRestriction === 'female' ? 'selected' : '') + '>Female Only</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                '<input type="text" id="editRoleIcon" value="' + (role.icon || '◉') + '" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Base Salary (gold per year)</label>' +
                '<input type="number" id="editRoleSalary" value="' + (role.baseSalary || 0) + '" min="0" max="200" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">0 means no salary. Can be overridden per character.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="editRoleRequiresLiteracy" ' + (role.requiresLiteracy ? 'checked' : '') + ' style="cursor: pointer;">' +
                '<span>Requires Literacy</span>' +
                '</label>' +
                '<div id="editRoleLiteracyContainer" style="margin-top: 6px; ' + (role.requiresLiteracy ? '' : 'display: none;') + '">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Required Literacy Level</label>' +
                '<select id="editRoleLiteracyLevel" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                literacyOptions +
                '</select>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Characters must have at least this literacy level to hold this role.</small>' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations</label>' +
                '<div id="specsList" class="specs-list" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">' +
                (role.specializations || []).map(function(spec, i) {
                    return '<span class="spec-item" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 8px; border-radius: 16px; font-size: 0.6rem;">' +
                        _escapeHtml(spec) +
                        '<button type="button" class="remove-spec" data-index="' + i + '" style="background: none; border: none; cursor: pointer; color: var(--dim);">✖</button>' +
                    '</span>';
                }).join('') || '<span class="no-specs" style="font-size: 0.65rem; color: var(--dim);">No specializations</span>' +
                '</div>' +
                '<div class="add-spec-row" style="display: flex; gap: 8px; margin-top: 4px;">' +
                '<input type="text" id="newSpec" placeholder="New specialization..." style="flex: 1; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<button type="button" id="addSpecBtn" class="btn small" style="padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">Add</button>' +
                '</div>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Specializations can be taught during apprenticeship</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editRoleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(role.notes || '') + '</textarea>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 8px;">' +
                infoIcon + ' Changes to salary and literacy requirements will apply to existing characters with this role.' +
                '</div>';

            _openModal({
                title: 'Edit Role: ' + role.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    var checkbox = document.getElementById('editRoleRequiresLiteracy');
                    var container = document.getElementById('editRoleLiteracyContainer');
                    if (checkbox && container) {
                        checkbox.onchange = function() {
                            container.style.display = this.checked ? 'block' : 'none';
                        };
                    }

                    var nameInput = document.getElementById('editRoleName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    var categorySelect = document.getElementById('editRoleCategory');
                    var salaryInput = document.getElementById('editRoleSalary');
                    if (categorySelect && salaryInput) {
                        categorySelect.onchange = function() {
                            var baseSalary = _getBaseSalaryByCategory(this.value);
                            salaryInput.value = baseSalary;
                        };
                    }

                    var addSpecBtn = document.getElementById('addSpecBtn');
                    var newSpecInput = document.getElementById('newSpec');
                    var specsList = document.getElementById('specsList');

                    if (addSpecBtn && newSpecInput && specsList) {
                        addSpecBtn.onclick = function() {
                            var spec = newSpecInput.value.trim();
                            if (!spec) return;

                            var noSpecsSpan = specsList.querySelector('.no-specs');
                            if (noSpecsSpan) noSpecsSpan.remove();

                            var index = specsList.querySelectorAll('.spec-item').length;
                            var item = document.createElement('span');
                            item.className = 'spec-item';
                            item.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 8px; border-radius: 16px; font-size: 0.6rem;';
                            item.innerHTML = _escapeHtml(spec) +
                                '<button type="button" class="remove-spec" data-index="' + index + '" style="background: none; border: none; cursor: pointer; color: var(--dim);">✖</button>';
                            specsList.appendChild(item);

                            item.querySelector('.remove-spec').addEventListener('click', function() {
                                item.remove();
                                if (specsList.querySelectorAll('.spec-item').length === 0) {
                                    specsList.innerHTML = '<span class="no-specs" style="font-size: 0.65rem; color: var(--dim);">No specializations</span>';
                                }
                            });

                            newSpecInput.value = '';
                        };

                        newSpecInput.addEventListener('keydown', function(e) {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addSpecBtn.click();
                            }
                        });
                    }

                    var removeBtns = specsList.querySelectorAll('.remove-spec');
                    for (var i = 0; i < removeBtns.length; i++) {
                        var btn = removeBtns[i];
                        btn.onclick = function() {
                            var item = this.closest('.spec-item');
                            if (item) item.remove();
                            if (specsList.querySelectorAll('.spec-item').length === 0) {
                                specsList.innerHTML = '<span class="no-specs" style="font-size: 0.65rem; color: var(--dim);">No specializations</span>';
                            }
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editRoleName').value.trim();
                    if (!name) {
                        _showToast('Role name is required', 'error');
                        return false;
                    }

                    var specItems = document.querySelectorAll('.spec-item');
                    var specializations = [];
                    for (var i = 0; i < specItems.length; i++) {
                        var text = specItems[i].childNodes[0]?.textContent?.trim();
                        if (text) specializations.push(text);
                    }

                    var requiresLiteracy = document.getElementById('editRoleRequiresLiteracy').checked;
                    var literacyLevel = requiresLiteracy ? document.getElementById('editRoleLiteracyLevel').value : null;

                    var updates = {
                        name: name,
                        category: document.getElementById('editRoleCategory').value,
                        genderRestriction: document.getElementById('editRoleGender').value,
                        icon: document.getElementById('editRoleIcon').value || '◉',
                        specializations: specializations,
                        notes: document.getElementById('editRoleNotes').value || '',
                        baseSalary: parseInt(document.getElementById('editRoleSalary').value) || 0,
                        requiresLiteracy: requiresLiteracy,
                        literacyLevel: literacyLevel
                    };

                    var result = _updateRole(roleId, updates);

                    if (result) {
                        var salaryMsg = result.baseSalary > 0 ? ' (Salary: ' + result.baseSalary + ' gold)' : '';
                        var literacyMsg = requiresLiteracy ? ' (Requires: ' + (window.LITERACY_LEVEL_NAMES?.[literacyLevel] || literacyLevel) + ')' : '';
                        _showToast('Role "' + name + '" updated' + salaryMsg + literacyMsg, 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 13. DELETE ROLE MODAL
    // =========================================================================

    function openDeleteRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var charactersWithRole = _getCharactersWithRole(roleId);
            var charCount = charactersWithRole.length;

            var warningIcon = _getIcon('WARNING');

            var warningMsg = charCount > 0 ?
                charCount + ' character(s) have this role.\n\nDeleting it will remove the role from those characters.\n\nThis action cannot be undone!' :
                'This action cannot be undone!';

            var modalContent =
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                '<strong>' + warningIcon + ' Warning: This action cannot be undone!</strong>' +
                '<div style="margin-top:8px;">You are about to delete the role "<strong>' + _escapeHtml(role.name) + '</strong>".</div>' +
                (charCount > 0 ? '<div style="margin-top:8px;">' + charCount + ' character(s) have this role</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;">' +
                '<input type="checkbox" id="deleteRemoveFromCharacters" ' + (charCount > 0 ? 'checked' : '') + '>' +
                '<span style="font-size:0.65rem;">Remove role from all characters</span>' +
                '</label>' +
                '<small style="font-size:0.5rem;color:var(--dim);">If unchecked, characters will keep the role in their data</small>' +
                '</div>' +

                '<div style="margin-top:12px;padding:8px;background:rgba(200,68,68,0.1);border-radius:6px;font-size:0.55rem;color:#8a3020;">' +
                'This action cannot be undone. The role will be permanently removed.' +
                '</div>';

            _openModal({
                title: 'Delete Role: ' + role.name,
                content: modalContent,
                confirmText: 'Delete Permanently',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var removeFromCharacters = document.getElementById('deleteRemoveFromCharacters')?.checked !== false;

                    var success = _deleteRole(roleId, removeFromCharacters);

                    if (success) {
                        _showToast('Deleted "' + role.name + '"', 'info');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to delete role', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 14. ASSIGN ROLE MODAL
    // =========================================================================

    function openAssignRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var allChars = _getCharacters();
            var selectedCharacterId = null;
            var selectedCharacterData = null;
            var searchTerm = '';
            var genderFilter = 'all';
            var locationFilter = 'all';

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var allLocations = new Set();
            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (!char.isDeceased) {
                    var loc = _getCurrentLocation(char);
                    if (loc && loc !== 'Unknown') allLocations.add(loc);
                }
            }
            var locationOptions = Array.from(allLocations).sort();

            function getEligibleCharacters() {
                var eligible = allChars.filter(function(c) {
                    if (c.isDeceased) return false;

                    if (role.genderRestriction === 'male' && c.gender !== 'male') return false;
                    if (role.genderRestriction === 'female' && c.gender !== 'female') return false;

                    var hasRole = c.professions && c.professions.some(function(p) { return p.id === roleId; });
                    return !hasRole;
                });

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    eligible = eligible.filter(function(c) {
                        return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                if (genderFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return c.gender === genderFilter; });
                }

                if (locationFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return _getCurrentLocation(c) === locationFilter; });
                }

                eligible.sort(function(a, b) { return (a.birthYear || 9999) - (b.birthYear || 9999); });

                return eligible;
            }

            function renderCharacterList() {
                var eligible = getEligibleCharacters();

                if (eligible.length === 0) {
                    return '<div class="empty-state" style="text-align:center; padding:20px; color:var(--dim);">No characters match your filters</div>';
                }

                return eligible.map(function(c) {
                    var age = _calculateAge(c.birthYear, false, null);
                    var isSelected = selectedCharacterId === c.id;
                    var genderIcon = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                    var location = _getCurrentLocation(c);
                    var currentSkills = c.professions?.length || 0;

                    var professionsStr = '';
                    if (c.professions && c.professions.length > 0) {
                        var profNames = c.professions.slice(0, 2).map(function(p) { return p.name; });
                        if (c.professions.length > 2) profNames.push('...');
                        professionsStr = '<span style="font-size: 0.55rem; color: var(--accent-dim); margin-left: 6px;">⌇ ' + profNames.join(', ') + '</span>';
                    }

                    return '<div class="character-card" data-character-id="' + c.id + '" style="' +
                        'padding: 10px; ' +
                        'margin-bottom: 8px; ' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg3)') + '; ' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + '; ' +
                        'border-radius: 6px; ' +
                        'cursor: pointer;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                        '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 6px;">' + genderIcon + ' ' + age + ' years</span>' +
                        professionsStr +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--accent);">' +
                        locationIcon + ' ' + _escapeHtml(location) + ' · ' + currentSkills + ' role(s)' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            function refreshCharacterList() {
                var container = document.getElementById('characterListContainer');
                if (container) container.innerHTML = renderCharacterList();

                document.querySelectorAll('.character-card').forEach(function(card) {
                    card.addEventListener('click', function() {
                        selectedCharacterId = this.dataset.characterId;
                        selectedCharacterData = _getCharacterById(selectedCharacterId);
                        refreshCharacterList();
                    });
                });
            }

            var literacyWarning = '';
            if (role.requiresLiteracy && role.literacyLevel) {
                var levelName = window.LITERACY_LEVEL_NAMES?.[role.literacyLevel] || role.literacyLevel;
                literacyWarning = '<div style="padding: 8px; background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 6px; margin-bottom: 12px; font-size: 0.6rem;">' +
                    'This role requires <strong>' + levelName + '</strong>. Characters without this literacy level will not be able to perform this role effectively.' +
                    '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<strong>Assign Role: ' + _escapeHtml(role.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                    'Select a character to receive this profession.' +
                    (role.genderRestriction !== 'both' ? ' (Restricted to: ' + role.genderRestriction + ')' : '') +
                    (role.baseSalary > 0 ? ' · Base Salary: ' + role.baseSalary + ' gold/year' : ' · No salary') +
                '</div>' +
                '</div>' +

                literacyWarning +

                '<div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">' +
                '<select id="genderFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="all">All Genders</option>' +
                '<option value="male">Male</option>' +
                '<option value="female">Female</option>' +
                '</select>' +

                '<select id="locationFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="all">' + locationIcon + ' All Locations</option>' +
                locationOptions.map(function(loc) { return '<option value="' + _escapeHtml(loc) + '">' + locationIcon + ' ' + _escapeHtml(loc) + '</option>'; }).join('') +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<input type="text" id="characterSearch" placeholder="' + _getIcon('SEARCH') + ' Search characters..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '</div>' +

                '<div id="characterListContainer" style="max-height: 300px; overflow-y: auto;">' +
                renderCharacterList() +
                '</div>' +

                '<div class="form-group" style="margin-top: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                '<input type="range" id="skillLevelSlider" min="0" max="100" value="10" step="1" style="width: 100%;">' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                '<span>0</span>' +
                '<span id="skillLevelDisplay">10 (Novice)</span>' +
                '<span>100</span>' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="How did they learn this role?"></textarea>' +
                '</div>';

            _openModal({
                title: 'Assign ' + role.name,
                content: modalContent,
                confirmText: 'Assign',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (!selectedCharacterId) {
                        _showToast('Please select a character', 'error');
                        return false;
                    }

                    var skill = parseInt(document.getElementById('skillLevelSlider').value);
                    var notes = document.getElementById('assignNotes')?.value || '';
                    var character = _getCharacterById(selectedCharacterId);

                    var result = _assignRoleToCharacter(selectedCharacterId, roleId, {
                        skillLevel: skill,
                        startYear: _getCurrentYear(),
                        notes: notes || 'Assigned ' + role.name
                    });

                    if (result && result.success) {
                        var salaryMsg = role.baseSalary > 0 ? ' (Salary: ' + role.baseSalary + ' gold/year)' : '';
                        _showToast((character?.name || 'Character') + ' now has ' + role.name + ' (' + skill + ')' + salaryMsg, 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to assign role: ' + (result?.reason || 'Unknown error'), 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var searchInput = document.getElementById('characterSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshCharacterList();
                    });
                }

                var genderSelect = document.getElementById('genderFilter');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function(e) {
                        genderFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var locationSelect = document.getElementById('locationFilter');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function(e) {
                        locationFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var skillSlider = document.getElementById('skillLevelSlider');
                var skillDisplay = document.getElementById('skillLevelDisplay');
                if (skillSlider && skillDisplay) {
                    skillSlider.addEventListener('input', function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    });
                }

                refreshCharacterList();
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 15. BULK ASSIGN ROLE MODAL
    // =========================================================================

    function openBulkAssignRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var allChars = _getCharacters();
            var selectedCharIds = [];
            var searchTerm = '';
            var genderFilter = 'all';
            var locationFilter = 'all';

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var allLocations = new Set();
            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (!char.isDeceased) {
                    var loc = _getCurrentLocation(char);
                    if (loc && loc !== 'Unknown') allLocations.add(loc);
                }
            }
            var locationOptions = Array.from(allLocations).sort();

            function getEligibleCharacters() {
                var eligible = allChars.filter(function(c) {
                    if (c.isDeceased) return false;

                    if (role.genderRestriction === 'male' && c.gender !== 'male') return false;
                    if (role.genderRestriction === 'female' && c.gender !== 'female') return false;

                    var hasRole = c.professions && c.professions.some(function(p) { return p.id === roleId; });
                    return !hasRole;
                });

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    eligible = eligible.filter(function(c) {
                        return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                if (genderFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return c.gender === genderFilter; });
                }

                if (locationFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return _getCurrentLocation(c) === locationFilter; });
                }

                eligible.sort(function(a, b) { return (a.birthYear || 9999) - (b.birthYear || 9999); });

                return eligible;
            }

            function renderCharacterList() {
                var eligible = getEligibleCharacters();

                if (eligible.length === 0) {
                    return '<div class="empty-state" style="text-align:center; padding:20px; color:var(--dim);">No characters match your filters</div>';
                }

                return eligible.map(function(c) {
                    var age = _calculateAge(c.birthYear, false, null);
                    var isSelected = selectedCharIds.indexOf(c.id) !== -1;
                    var genderIcon = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                    var location = _getCurrentLocation(c);
                    var currentSkills = c.professions?.length || 0;

                    return '<div class="character-card" data-character-id="' + c.id + '" style="' +
                        'padding: 10px; ' +
                        'margin-bottom: 8px; ' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg3)') + '; ' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + '; ' +
                        'border-radius: 6px; ' +
                        'cursor: pointer;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                        '<div style="display: flex; align-items: center; gap: 8px;">' +
                        '<input type="checkbox" class="char-checkbox" ' + (isSelected ? 'checked' : '') + ' style="cursor: pointer;">' +
                        '<strong>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                        '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 6px;">' + genderIcon + ' ' + age + ' years</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--accent);">' +
                        locationIcon + ' ' + _escapeHtml(location) + ' · ' + currentSkills + ' role(s)' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            function refreshCharacterList() {
                var container = document.getElementById('characterListContainer');
                if (container) container.innerHTML = renderCharacterList();

                document.querySelectorAll('.character-card').forEach(function(card) {
                    var checkbox = card.querySelector('.char-checkbox');
                    if (checkbox) {
                        checkbox.addEventListener('change', function(e) {
                            e.stopPropagation();
                            var charId = this.closest('.character-card').dataset.characterId;
                            var idx = selectedCharIds.indexOf(charId);
                            if (this.checked) {
                                if (idx === -1) selectedCharIds.push(charId);
                                card.style.background = 'rgba(var(--accent-rgb), 0.2)';
                                card.style.borderColor = 'var(--accent)';
                            } else {
                                if (idx !== -1) selectedCharIds.splice(idx, 1);
                                card.style.background = 'var(--bg3)';
                                card.style.borderColor = 'var(--border)';
                            }
                            var countEl = document.getElementById('bulkSelectedCount');
                            if (countEl) countEl.textContent = selectedCharIds.length;
                        });
                    }

                    card.addEventListener('click', function(e) {
                        if (e.target.type === 'checkbox') return;
                        var checkbox = this.querySelector('.char-checkbox');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            var event = new Event('change');
                            checkbox.dispatchEvent(event);
                        }
                    });
                });
            }

            var literacyWarning = '';
            if (role.requiresLiteracy && role.literacyLevel) {
                var levelName = window.LITERACY_LEVEL_NAMES?.[role.literacyLevel] || role.literacyLevel;
                literacyWarning = '<div style="padding: 8px; background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 6px; margin-bottom: 12px; font-size: 0.6rem;">' +
                    'This role requires <strong>' + levelName + '</strong>. Characters without this literacy level will not be able to perform this role effectively.' +
                    '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<strong>Bulk Assign: ' + _escapeHtml(role.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                    'Select multiple characters to assign this role.' +
                    (role.genderRestriction !== 'both' ? ' (Restricted to: ' + role.genderRestriction + ')' : '') +
                    (role.baseSalary > 0 ? ' · Base Salary: ' + role.baseSalary + ' gold/year' : ' · No salary') +
                '</div>' +
                '</div>' +

                literacyWarning +

                '<div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">' +
                '<select id="genderFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="all">All Genders</option>' +
                '<option value="male">Male</option>' +
                '<option value="female">Female</option>' +
                '</select>' +

                '<select id="locationFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="all">' + locationIcon + ' All Locations</option>' +
                locationOptions.map(function(loc) { return '<option value="' + _escapeHtml(loc) + '">' + locationIcon + ' ' + _escapeHtml(loc) + '</option>'; }).join('') +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<input type="text" id="characterSearch" placeholder="' + _getIcon('SEARCH') + ' Search characters..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '</div>' +

                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">' +
                '<button id="bulkSelectAllBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select All</button>' +
                '<button id="bulkSelectNoneBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Select None</button>' +
                '<span style="font-size: 0.55rem; color: var(--dim); margin-left: auto;"><span id="bulkSelectedCount">0</span> selected</span>' +
                '</div>' +

                '<div id="characterListContainer" style="max-height: 300px; overflow-y: auto;">' +
                renderCharacterList() +
                '</div>' +

                '<div class="form-group" style="margin-top: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                '<input type="range" id="skillLevelSlider" min="0" max="100" value="10" step="1" style="width: 100%;">' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                '<span>0</span>' +
                '<span id="skillLevelDisplay">10 (Novice)</span>' +
                '<span>100</span>' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="How did they learn this role?"></textarea>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 8px;">' +
                infoIcon + ' All selected characters will be assigned the same skill level and notes.' +
                '</div>';

            _openModal({
                title: 'Bulk Assign ' + role.name,
                content: modalContent,
                confirmText: 'Assign to Selected',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (selectedCharIds.length === 0) {
                        _showToast('Please select at least one character', 'error');
                        return false;
                    }

                    var skill = parseInt(document.getElementById('skillLevelSlider').value);
                    var notes = document.getElementById('assignNotes')?.value || '';

                    var results = _bulkAssignRole(selectedCharIds, roleId, {
                        skillLevel: skill,
                        startYear: _getCurrentYear(),
                        notes: notes || 'Assigned ' + role.name
                    });

                    if (results && results.success > 0) {
                        _showToast('Assigned ' + role.name + ' to ' + results.success + ' characters', 'success');
                        if (results.failed > 0) {
                            _showToast(results.failed + ' assignments failed', 'warning');
                        }
                        if (onSuccess) onSuccess(results);
                        _closeTopModal();
                    } else {
                        _showToast('Failed to assign role', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var searchInput = document.getElementById('characterSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshCharacterList();
                    });
                }

                var genderSelect = document.getElementById('genderFilter');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function(e) {
                        genderFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var locationSelect = document.getElementById('locationFilter');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function(e) {
                        locationFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var skillSlider = document.getElementById('skillLevelSlider');
                var skillDisplay = document.getElementById('skillLevelDisplay');
                if (skillSlider && skillDisplay) {
                    skillSlider.addEventListener('input', function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    });
                }

                var selectAllBtn = document.getElementById('bulkSelectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.char-checkbox');
                        checkboxes.forEach(function(cb) {
                            cb.checked = true;
                            var event = new Event('change');
                            cb.dispatchEvent(event);
                        });
                    };
                }

                var selectNoneBtn = document.getElementById('bulkSelectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.char-checkbox');
                        checkboxes.forEach(function(cb) {
                            cb.checked = false;
                            var event = new Event('change');
                            cb.dispatchEvent(event);
                        });
                    };
                }

                refreshCharacterList();
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 16. VIEW CHARACTERS WITH ROLE MODAL
    // =========================================================================

    function openViewCharactersWithRoleModal(roleId) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var charDetails = _getCharactersWithRoleDetails(roleId);
            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var charHtml = '';
            if (charDetails.length === 0) {
                charHtml = '<div style="text-align: center; padding: 40px; color: var(--dim);">No characters have this role</div>';
            } else {
                charHtml = '<div style="max-height: 400px; overflow-y: auto;">' +
                    '<table style="width: 100%; font-size: 0.6rem; border-collapse: collapse;">' +
                    '<thead>' +
                        '<tr style="background: var(--bg2);">' +
                            '<th style="padding: 6px; text-align: left;">Name</th>' +
                            '<th style="padding: 6px; text-align: center;">Skill</th>' +
                            '<th style="padding: 6px; text-align: center;">Tier</th>' +
                            '<th style="padding: 6px; text-align: center;">Can Teach</th>' +
                            '<th style="padding: 6px; text-align: left;">Specializations</th>' +
                            '<th style="padding: 6px; text-align: center;">Primary</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';

                for (var i = 0; i < charDetails.length; i++) {
                    var cd = charDetails[i];
                    var char = cd.character;

                    charHtml +=
                        '<tr style="border-top: 1px solid var(--border-light);">' +
                            '<td style="padding: 4px 6px;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</td>' +
                            '<td style="padding: 4px 6px; text-align: center;">' + cd.skillLevel + '</td>' +
                            '<td style="padding: 4px 6px; text-align: center;">' + cd.skillTier + '</td>' +
                            '<td style="padding: 4px 6px; text-align: center;">' + (cd.canTeach ? '✓' : '') + '</td>' +
                            '<td style="padding: 4px 6px;">' + (cd.specializations && cd.specializations.length > 0 ? cd.specializations.slice(0, 3).join(', ') + (cd.specializations.length > 3 ? '...' : '') : '') + '</td>' +
                            '<td style="padding: 4px 6px; text-align: center;">' + (cd.isPrimary ? '✓' : '') + '</td>' +
                        '</tr>';
                }

                charHtml += '</tbody></table></div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + personIcon + ' ' + _escapeHtml(role.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' + charDetails.length + ' characters have this role</div>' +
                '</div>' +
                charHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Characters with skill 51+ (Journeyman) can teach this role.' +
                '</div>';

            _openModal({
                title: 'Characters with ' + role.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 17. EDIT ROLE SKILL MODAL
    // =========================================================================

    function openEditRoleSkillModal(roleId, characterId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            var character = _getCharacterById(characterId);

            if (!role || !character) {
                _showToast('Role or character not found', 'error');
                return;
            }

            var currentSkill = 0;
            if (character.professions) {
                for (var i = 0; i < character.professions.length; i++) {
                    if (character.professions[i].id === roleId) {
                        currentSkill = character.professions[i].skillLevel || 0;
                        break;
                    }
                }
            }
            var skillLevel = currentSkill || 0;

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(role.name) + ' · Current skill: ' + skillLevel + ' (' + _getSkillLevelName(skillLevel) + ')</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                '<input type="range" id="skillSlider" min="0" max="100" value="' + skillLevel + '" step="1" style="width: 100%;">' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                '<span>0</span>' +
                '<span id="skillDisplay">' + skillLevel + ' (' + _getSkillLevelName(skillLevel) + ')</span>' +
                '<span>100</span>' +
                '</div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Skill level determines proficiency. 91+ = Master, 76+ = Expert, 51+ = Journeyman, 26+ = Apprentice.' +
                '</div>';

            _openModal({
                title: 'Edit Skill: ' + character.name + ' (' + role.name + ')',
                content: modalContent,
                confirmText: 'Save',
                cancelText: 'Cancel',
                onOpen: function() {
                    var slider = document.getElementById('skillSlider');
                    var display = document.getElementById('skillDisplay');
                    if (slider && display) {
                        slider.addEventListener('input', function() {
                            var val = parseInt(slider.value);
                            display.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                        });
                    }
                },
                onConfirm: function() {
                    var newSkill = parseInt(document.getElementById('skillSlider').value);
                    var result = _updateCharacterSkill(characterId, roleId, newSkill);

                    if (result && result.success) {
                        _showToast('Skill updated to ' + newSkill, 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to update skill', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 18. LIST ROLES MODAL
    // =========================================================================

    function openListRolesModal(onSelect) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var roles = _getAllRoles();
            var categories = _getRoleCategories();
            var searchTerm = '';
            var categoryFilter = 'all';

            var personIcon = _getIcon('PERSON');
            var searchIcon = _getIcon('SEARCH');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var categoryOptions = '<option value="all">All Categories</option>';
            for (var catId in categories) {
                if (categories.hasOwnProperty(catId)) {
                    var cat = categories[catId];
                    categoryOptions += '<option value="' + catId + '">' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
                }
            }

            function renderRoleList() {
                var filtered = roles.slice();

                if (categoryFilter !== 'all') {
                    filtered = filtered.filter(function(r) { return r.category === categoryFilter; });
                }

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    filtered = filtered.filter(function(r) {
                        return r.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (r.notes && r.notes.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });

                if (filtered.length === 0) {
                    return '<div style="text-align: center; padding: 40px; color: var(--dim);">No roles found</div>';
                }

                return filtered.map(function(r) {
                    var icon = r.icon || '◉';
                    var catName = categories[r.category] ? categories[r.category].name : 'Uncategorized';
                    var charCount = 0;
                    var characters = _getCharacters();
                    for (var i = 0; i < characters.length; i++) {
                        var c = characters[i];
                        if (c.professions && c.professions.some(function(p) { return p.id === r.id; })) {
                            charCount++;
                        }
                    }

                    return '<div class="role-item" data-role-id="' + r.id + '" style="' +
                        'display: flex; justify-content: space-between; align-items: center; ' +
                        'padding: 10px 12px; ' +
                        'background: var(--bg2); ' +
                        'border-radius: 6px; ' +
                        'margin-bottom: 4px; ' +
                        'cursor: pointer; ' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div>' +
                        '<span style="font-size: 0.85rem;">' + icon + ' <strong>' + _escapeHtml(r.name) + '</strong></span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(catName) + '</span>' +
                        (r.specializations && r.specializations.length > 0 ? ' <span style="font-size: 0.5rem; color: var(--accent);">(' + r.specializations.length + ' specs)</span>' : '') +
                        '</div>' +
                        '<div style="display: flex; align-items: center; gap: 8px;">' +
                        '<span style="font-size: 0.55rem; color: var(--dim);">' + personIcon + ' ' + charCount + '</span>' +
                        (onSelect ? '<button class="role-select-btn" data-role-id="' + r.id + '" style="padding: 2px 10px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">Select</button>' : '') +
                        '<button class="role-view-btn" data-role-id="' + r.id + '" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">View</button>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">' +
                '<input type="text" id="roleListSearch" placeholder="' + searchIcon + ' Search roles..." style="flex: 1; min-width: 80px; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                '<select id="roleListCategory" style="padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                categoryOptions +
                '</select>' +
                '</div>' +
                '<button id="roleListCreateBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">Create New Role</button>' +
                '</div>' +
                '<div id="roleListContainer" style="max-height: 400px; overflow-y: auto;">' +
                renderRoleList() +
                '</div>' +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Click "Select" to choose a role, or "View" to see details.' +
                '</div>';

            _openModal({
                title: 'All Roles',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

            setTimeout(function() {
                var searchInput = document.getElementById('roleListSearch');
                var categorySelect = document.getElementById('roleListCategory');
                var container = document.getElementById('roleListContainer');

                function filterRoles() {
                    searchTerm = searchInput ? searchInput.value : '';
                    categoryFilter = categorySelect ? categorySelect.value : 'all';
                    if (container) container.innerHTML = renderRoleList();
                    attachHandlers();
                }

                if (searchInput) {
                    searchInput.addEventListener('input', filterRoles);
                }

                if (categorySelect) {
                    categorySelect.addEventListener('change', filterRoles);
                }

                function attachHandlers() {
                    var selectBtns = container.querySelectorAll('.role-select-btn');
                    for (var i = 0; i < selectBtns.length; i++) {
                        (function(btn) {
                            btn.addEventListener('click', function(e) {
                                e.stopPropagation();
                                var roleId = this.dataset.roleId;
                                var role = _getRole(roleId);
                                if (role && onSelect) {
                                    _closeTopModal();
                                    _processingModal = false;
                                    onSelect(role);
                                }
                            });
                        })(selectBtns[i]);
                    }

                    var viewBtns = container.querySelectorAll('.role-view-btn');
                    for (var i = 0; i < viewBtns.length; i++) {
                        (function(btn) {
                            btn.addEventListener('click', function(e) {
                                e.stopPropagation();
                                var roleId = this.dataset.roleId;
                                _closeTopModal();
                                _processingModal = false;
                                openViewCharactersWithRoleModal(roleId);
                            });
                        })(viewBtns[i]);
                    }

                    var items = container.querySelectorAll('.role-item');
                    for (var i = 0; i < items.length; i++) {
                        (function(item) {
                            item.addEventListener('click', function(e) {
                                if (e.target.closest('button')) return;
                                var roleId = this.dataset.roleId;
                                var role = _getRole(roleId);
                                if (role && onSelect) {
                                    _closeTopModal();
                                    _processingModal = false;
                                    onSelect(role);
                                }
                            });
                            item.addEventListener('mouseenter', function() {
                                this.style.background = 'var(--bg3)';
                            });
                            item.addEventListener('mouseleave', function() {
                                this.style.background = 'var(--bg2)';
                            });
                        })(items[i]);
                    }
                }

                var createBtn = document.getElementById('roleListCreateBtn');
                if (createBtn) {
                    createBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openCreateRoleModal(function() {
                            setTimeout(function() {
                                openListRolesModal(onSelect);
                            }, 100);
                        });
                    };
                }

                attachHandlers();
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 19. CATEGORY MANAGER MODAL
    // =========================================================================

    function openCategoryManagerModal(onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var categories = _getRoleCategories();
            var infoIcon = _getIcon('CIRCLE_DOT');
            var editIcon = _getIcon('EDIT');
            var crossIcon = _getIcon('X_HEAVY');

            var categoryHtml = '';
            var catKeys = Object.keys(categories).sort();
            for (var i = 0; i < catKeys.length; i++) {
                var key = catKeys[i];
                var cat = categories[key];
                var roleCount = 0;
                var roles = _getAllRoles();
                for (var j = 0; j < roles.length; j++) {
                    if (roles[j].category === key) roleCount++;
                }

                categoryHtml +=
                    '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg2); border-radius: 4px; margin-bottom: 4px;">' +
                    '<div>' +
                    '<span style="font-size: 0.7rem;">' + (cat.icon || '⌇') + ' <strong>' + _escapeHtml(cat.name) + '</strong></span>' +
                    '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + roleCount + ' roles</span>' +
                    '</div>' +
                    '<div style="display: flex; gap: 4px;">' +
                    (key !== 'uncategorized' ? '<button class="cat-edit-btn" data-cat-id="' + key + '" style="padding: 2px 6px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">' + editIcon + '</button>' : '') +
                    (key !== 'uncategorized' ? '<button class="cat-delete-btn" data-cat-id="' + key + '" style="padding: 2px 6px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">' + crossIcon + '</button>' : '') +
                    '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">' +
                '<button id="catMgrAddBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">Add Category</button>' +
                '</div>' +
                '</div>' +
                '<div id="categoryList" style="max-height: 300px; overflow-y: auto;">' +
                categoryHtml +
                '</div>' +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Categories help organize roles. The "Uncategorized" category cannot be deleted.' +
                '</div>';

            _openModal({
                title: 'Manage Categories',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                    if (onSuccess) onSuccess();
                }
            });

            setTimeout(function() {
                var addBtn = document.getElementById('catMgrAddBtn');
                if (addBtn) {
                    addBtn.onclick = function() {
                        var name = prompt('Enter category name:');
                        if (name && name.trim()) {
                            var id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                            if (_getRoleCategories()[id]) {
                                _showToast('Category already exists', 'error');
                                return;
                            }
                            if (typeof window.addCategory === 'function') {
                                var result = window.addCategory(id, name.trim());
                                if (result) {
                                    _showToast('Category "' + name.trim() + '" created', 'success');
                                    _closeTopModal();
                                    _processingModal = false;
                                    openCategoryManagerModal(onSuccess);
                                }
                            } else if (typeof window._addCategory === 'function') {
                                var result = window._addCategory(id, name.trim());
                                if (result) {
                                    _showToast('Category "' + name.trim() + '" created', 'success');
                                    _closeTopModal();
                                    _processingModal = false;
                                    openCategoryManagerModal(onSuccess);
                                }
                            } else {
                                _showToast('Category manager not available', 'error');
                            }
                        }
                    };
                }

                var editBtns = document.querySelectorAll('.cat-edit-btn');
                for (var i = 0; i < editBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var catId = this.dataset.catId;
                            var cat = _getRoleCategories()[catId];
                            if (cat) {
                                var newName = prompt('Edit category name:', cat.name);
                                if (newName !== null && newName.trim()) {
                                    if (typeof window.updateCategory === 'function') {
                                        var result = window.updateCategory(catId, { name: newName.trim() });
                                        if (result) {
                                            _showToast('Category updated', 'success');
                                            _closeTopModal();
                                            _processingModal = false;
                                            openCategoryManagerModal(onSuccess);
                                        }
                                    } else if (typeof window._updateCategory === 'function') {
                                        var result = window._updateCategory(catId, { name: newName.trim() });
                                        if (result) {
                                            _showToast('Category updated', 'success');
                                            _closeTopModal();
                                            _processingModal = false;
                                            openCategoryManagerModal(onSuccess);
                                        }
                                    } else {
                                        _showToast('Category manager not available', 'error');
                                    }
                                }
                            }
                        });
                    })(editBtns[i]);
                }

                var deleteBtns = document.querySelectorAll('.cat-delete-btn');
                for (var i = 0; i < deleteBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var catId = this.dataset.catId;
                            var cat = _getRoleCategories()[catId];
                            if (cat) {
                                var rolesInCategory = _getAllRoles().filter(function(r) { return r.category === catId; });
                                var msg = 'Delete category "' + cat.name + '"?';
                                if (rolesInCategory.length > 0) {
                                    msg += '\n\n' + rolesInCategory.length + ' role(s) will be reassigned to "Uncategorized".';
                                }
                                if (confirm(msg)) {
                                    if (typeof window.deleteCategory === 'function') {
                                        var result = window.deleteCategory(catId);
                                        if (result) {
                                            _showToast('Category deleted', 'info');
                                            _closeTopModal();
                                            _processingModal = false;
                                            openCategoryManagerModal(onSuccess);
                                        }
                                    } else if (typeof window._deleteCategory === 'function') {
                                        var result = window._deleteCategory(catId);
                                        if (result) {
                                            _showToast('Category deleted', 'info');
                                            _closeTopModal();
                                            _processingModal = false;
                                            openCategoryManagerModal(onSuccess);
                                        }
                                    } else {
                                        _showToast('Category manager not available', 'error');
                                    }
                                }
                            }
                        });
                    })(deleteBtns[i]);
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 20. EXPORTS
    // =========================================================================

    window.openCreateRoleModal = openCreateRoleModal;
    window.openEditRoleModal = openEditRoleModal;
    window.openDeleteRoleModal = openDeleteRoleModal;
    window.openAssignRoleModal = openAssignRoleModal;
    window.openBulkAssignRoleModal = openBulkAssignRoleModal;
    window.openViewCharactersWithRoleModal = openViewCharactersWithRoleModal;
    window.openEditRoleSkillModal = openEditRoleSkillModal;
    window.openListRolesModal = openListRolesModal;
    window.openCategoryManagerModal = openCategoryManagerModal;

    // Legacy aliases
    window._openCreateRoleModal = openCreateRoleModal;
    window._openEditRoleModal = openEditRoleModal;
    window._openDeleteRoleModal = openDeleteRoleModal;
    window._openAssignRoleModal = openAssignRoleModal;
    window._openBulkAssignRoleModal = openBulkAssignRoleModal;
    window._openViewCharactersWithRoleModal = openViewCharactersWithRoleModal;
    window._openEditRoleSkillModal = openEditRoleSkillModal;
    window._openListRolesModal = openListRolesModal;
    window._openCategoryManagerModal = openCategoryManagerModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateRoleModal: openCreateRoleModal,
            openEditRoleModal: openEditRoleModal,
            openDeleteRoleModal: openDeleteRoleModal,
            openAssignRoleModal: openAssignRoleModal,
            openBulkAssignRoleModal: openBulkAssignRoleModal,
            openViewCharactersWithRoleModal: openViewCharactersWithRoleModal,
            openEditRoleSkillModal: openEditRoleSkillModal,
            openListRolesModal: openListRolesModal,
            openCategoryManagerModal: openCategoryManagerModal
        };
    }

})();
