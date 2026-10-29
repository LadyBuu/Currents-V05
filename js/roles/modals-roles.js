/**
 * =============================================================================
 * STILL WATERS - ROLE MODALS (modals-roles.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/modals-roles.js
 *
 * All role-management UI modals. This is the presentation layer.
 *
 * Contract:
 *   - Reads via RoleQueries. Writes via RoleCommands.
 *   - Never mutates role or character state directly.
 *   - Never re-derives eligibility, salary, literacy, or skill rules.
 *     Those live in the command/query/constant layers.
 *   - No recursion guards. Modal handlers are synchronous event callbacks.
 *   - No timers. Handlers are attached in the modal's onMount callback.
 *   - No fallback APIs. Required modules are checked at load time.
 *   - Icons come from Icons via Icons[name]. No inline Unicode glyphs.
 *   - NO EMOJIS anywhere in this file.
 *
 * MODAL LIFECYCLE
 *
 *   Every modal uses onMount (from modals-core.js) to attach handlers.
 *   onMount runs synchronously during openModal, before the caller
 *   regains control, so there is no setTimeout-based binding. Element
 *   lookups inside onMount and onConfirm are scoped to the modal element
 *   (modalEl.querySelector(...)), not to document. This prevents
 *   cross-modal ID collisions when a modal opens over another.
 *
 * PERSISTENCE
 *
 *   Every write modal calls RoleCommands.persist() exactly once, after a
 *   successful command. RoleState writes masterData.data.roles and
 *   masterData.data.roleCategories on every mutation and marks the data
 *   dirty; persist() is the FLUSH. A persist failure is reported via
 *   toast but does not roll back the in-memory write.
 *
 * BULK ASSIGNMENT RESULT SHAPE
 *
 *   RoleCommands.bulkAssignRole returns
 *   { success: boolean, assignedCount, failedCount, errors }.
 *
 *   success is true iff every requested character was assigned without
 *   error. assignedCount is the number of successes. This modal reads
 *   assignedCount for the success message and failedCount for the
 *   partial-failure warning. It does NOT read .success for the "did
 *   anything succeed" check; assignedCount === 0 is that check.
 *
 * CROSS-MODAL CONFIRM
 *
 *   _confirmThen wraps window.confirmDialog(message, title, onConfirm) —
 *   the three-argument signature from modals-core.js. Passing onConfirm
 *   as the second argument (which some callers had done) sends the
 *   callback into the title slot and leaves the confirm callback
 *   undefined; the dialog appears and closes but the callback never
 *   fires. The three-argument form is correct.
 *
 * LOCATION RESOLUTION
 *
 *   _getCurrentLocationOrNull resolves a character's current place id
 *   through world.js. Prior revisions required window.getCurrentLocation,
 *   which accessors.js does not export; the location filter in the assign
 *   modal was effectively dead. See LOCATION RESOLUTION in REFACTOR
 *   HISTORY.
 *
 *   world.js exports:
 *     getCurrentPlace(character)      → place record | null
 *     getCurrentLocationId(character) → string | null
 *
 *   _getCurrentLocationOrNull prefers getCurrentPlace (returns the place
 *   id); falls back to getCurrentLocationId (returns the id directly);
 *   returns null when neither is available. A null return from the
 *   resolver causes RoleQueries.getOccupiedLocationIds and
 *   getEligibleCharactersForRole to skip location filtering for that
 *   character, which is the correct degradation when the resolver
 *   cannot resolve a location.
 *
 * CATEGORY SOURCE
 *
 *   RS.getCategories() throws if RoleState.init() has not been called.
 *   Every modal builder that renders a category dropdown reads through
 *   _getCategoriesOrEmpty(), which returns {} on a thrown call. In a
 *   normal load order this is unreachable (role UI mounts after role
 *   bootstrap); it exists so that an unusual load order yields an empty
 *   dropdown, not a failed modal open.
 *
 * ICON POLICY
 *
 *   _icon is STRICT: throws on unknown names. This is deliberate — an
 *   unknown icon name is a data error that should surface at render,
 *   not as a silent empty span. (modals-role-select.js::_iconOr falls
 *   back to CIRCLE; that is a different module with a different
 *   tolerance policy, documented there.)
 *
 * DEPENDENCIES (must be loaded first):
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (_showToast / showToast)
 *   - icons.js              (Icons)
 *   - skill-utils.js        (SkillUtils)
 *   - role-constants.js     (RoleConstants)
 *   - role-state.js         (RoleState)
 *   - role-queries.js       (RoleQueries)
 *   - role-commands.js      (RoleCommands)
 *   - accessors.js          (getCharacterById, getCharacters)
 *   - time.js               (getCurrentYear, calculateAge)
 *   - world.js              (getCurrentPlace / getCurrentLocationId —
 *                            used by _getCurrentLocationOrNull)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentLocationOrNull rewritten to use world.js
 *       (getCurrentPlace / getCurrentLocationId) instead of the
 *       non-existent window.getCurrentLocation. Prior revisions returned
 *       null unconditionally, so the assign-modal location filter was
 *       dead. See LOCATION RESOLUTION in the header.
 *     - All category-dropdown builders route through
 *       _getCategoriesOrEmpty(), which returns {} if
 *       RoleState.getCategories() throws (not yet initialised). Prior
 *       revisions called RS.getCategories() directly and would fail the
 *       modal open if role state was not yet initialised.
 *     - openViewCharactersWithRoleModal now uses
 *       RoleQueries.getRoleStatisticsBatch([roleId]) for the stats half
 *       of its two-scan pattern. The detail half still requires a
 *       separate getCharactersWithRoleDetails call (RoleQueries does not
 *       expose a combined query). See STATISTICS BATCHING in
 *       role-ui-list.js for the same tradeoff.
 *     - openCategoryManagerModal no longer uses window.prompt for
 *       add/rename. Both flows now render an inline text input inside
 *       the modal. window.prompt is synchronous, blocking, and
 *       inconsistent with every other role modal. The delete flow still
 *       uses _confirmThen (the confirmation text is short enough that
 *       window.confirmDialog's dialog is correct).
 *     - Header LOCATION RESOLUTION, CATEGORY SOURCE, and ICON POLICY
 *       sections added.
 *     - No other behavioural change. Every modal's rendered output is
 *       identical when the underlying data and load order are identical.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',         'modals-core.js'],
        ['closeTopModal',     'modals-core.js'],
        ['escapeHtml',        'formatting.js'],
        ['Icons',             'icons.js'],
        ['SkillUtils',        'skill-utils.js'],
        ['RoleConstants',     'role-constants.js'],
        ['RoleState',         'role-state.js'],
        ['RoleQueries',       'role-queries.js'],
        ['RoleCommands',      'role-commands.js'],
        ['getCharacterById',  'accessors.js'],
        ['getCharacters',     'accessors.js']
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
    var RS = window.RoleState;
    var RQ = window.RoleQueries;
    var RCMD = window.RoleCommands;
    var SU = window.SkillUtils;

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v == null ? '' : String(v));
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _categoryLabel(categoryId) {
        var categories = _getCategoriesOrEmpty();
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
        return level + ' (' + SU.getSkillLevelName(level) + ')';
    }

    function _genderLabel(gender) {
        if (gender === 'male') return 'M';
        if (gender === 'female') return 'F';
        return '?';
    }

    /**
     * Resolves a character's current place id via world.js.
     *
     * Order:
     *   1. world.getCurrentPlace(character) → place.id
     *   2. world.getCurrentLocationId(character) → string
     *   3. null
     *
     * See LOCATION RESOLUTION in the header. A null return means the
     * caller's location filter degrades to "no location filter for this
     * character" — that's the documented RoleQueries behaviour.
     */
    function _getCurrentLocationOrNull(character) {
        if (!character) return null;
        if (typeof window.getCurrentPlace === 'function') {
            var place = window.getCurrentPlace(character);
            if (place && typeof place.id === 'string' && place.id.length > 0) {
                return place.id;
            }
        }
        if (typeof window.getCurrentLocationId === 'function') {
            var id = window.getCurrentLocationId(character);
            if (typeof id === 'string' && id.length > 0) return id;
        }
        return null;
    }

    function _calculateAgeOrNull(birthYear) {
        if (typeof window.calculateAge !== 'function') return null;
        return window.calculateAge(birthYear, false, null);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('modals-roles.js requires getCurrentYear (time.js)');
        }
        return window.getCurrentYear();
    }

    /**
     * Safe category read. Returns {} when RoleState has not yet been
     * initialised. See CATEGORY SOURCE in the header.
     */
    function _getCategoriesOrEmpty() {
        try {
            if (RS && typeof RS.getCategories === 'function') {
                return RS.getCategories();
            }
        } catch (e) {
            // RoleState.getCategories throws if init() hasn't run. Return
            // an empty map so the modal renders with no category options
            // rather than failing to open.
        }
        return {};
    }

    /**
     * Runs RoleCommands.persist() and toasts a warning if the disk write
     * failed. The in-memory write is already done; this only reports
     * whether it reached storage. Never rolls back.
     */
    function _persistAndWarn(successMessage) {
        var persistResult = RCMD.persist();
        if (!persistResult.success) {
            _showToast(
                'Change saved in memory, but disk save failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
            return false;
        }
        if (successMessage) {
            _showToast(successMessage, 'success');
        }
        return true;
    }

    function _readInput(modalEl, id) {
        var el = modalEl.querySelector('#' + id);
        return el ? el.value : '';
    }

    function _readChecked(modalEl, id) {
        var el = modalEl.querySelector('#' + id);
        return el ? el.checked === true : false;
    }

    function _readNumber(modalEl, id, fallback) {
        var raw = _readInput(modalEl, id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * Confirm dialog wrapper.
     *
     * modals-core.js::confirmDialog(message, title, onConfirm) takes THREE
     * arguments. The old two-argument form passed onConfirm as the title
     * and left the confirm callback undefined — the dialog appeared and
     * closed, but the callback never ran.
     */
    function _confirmThen(message, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'Confirm', onConfirm);
        } else if (window.confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 3. SHARED BUILDERS
    // =========================================================================

    function _buildCategoryOptions(selectedId) {
        var categories = _getCategoriesOrEmpty();
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

    // =========================================================================
    // 4. CREATE ROLE MODAL
    // =========================================================================

    function openCreateRoleModal(onSuccess) {
        var categories = _getCategoriesOrEmpty();
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
            titleHtml: 'Create New Role',
            contentHtml: content,
            confirmText: 'Create Role',
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                var nameInput = modalEl.querySelector('#newRoleName');
                if (nameInput) nameInput.focus();

                var checkbox = modalEl.querySelector('#newRoleRequiresLiteracy');
                var container = modalEl.querySelector('#newRoleLiteracyContainer');
                if (checkbox && container) {
                    checkbox.addEventListener('change', function () {
                        container.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var categorySelect = modalEl.querySelector('#newRoleCategory');
                var salaryInput = modalEl.querySelector('#newRoleSalary');
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
            onConfirm: function (modalEl) {
                var requires = _readChecked(modalEl, 'newRoleRequiresLiteracy');
                var literacyLevel = requires ? _readInput(modalEl, 'newRoleLiteracyLevel') : null;
                var specsRaw = _readInput(modalEl, 'newRoleSpecs');
                var specializations = specsRaw
                    ? specsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
                    : [];

                var result = RCMD.createRole({
                    name: _readInput(modalEl, 'newRoleName'),
                    category: _readInput(modalEl, 'newRoleCategory'),
                    genderRestriction: _readInput(modalEl, 'newRoleGender'),
                    icon: _readInput(modalEl, 'newRoleIcon') || 'CIRCLE',
                    baseSalary: _readNumber(modalEl, 'newRoleSalary', RC.DEFAULT_SALARY),
                    requiresLiteracy: requires,
                    literacyLevel: literacyLevel,
                    specializations: specializations,
                    notes: _readInput(modalEl, 'newRoleNotes')
                });

                if (!result.success) {
                    _showToast(result.reason || 'Failed to create role', 'error');
                    return false;
                }

                _persistAndWarn('Role "' + result.role.name + '" created');
                if (typeof onSuccess === 'function') onSuccess(result.role.id);
            }
        });
    }

    // =========================================================================
    // 5. EDIT ROLE MODAL
    // =========================================================================

    function openEditRoleModal(roleId, onSuccess) {
        var role = RS.getRole(roleId);
        if (!role) {
            _showToast('Role not found', 'error');
            return;
        }

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
                    '<button type="button" class="remove-spec" data-index="' + i + '" style="background:none;border:none;cursor:pointer;color:var(--dim);">' + _icon('X') + '</button>' +
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
            titleHtml: 'Edit Role: ' + _esc(role.name),
            contentHtml: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                var nameInput = modalEl.querySelector('#editRoleName');
                if (nameInput) nameInput.focus();

                var checkbox = modalEl.querySelector('#editRoleRequiresLiteracy');
                var container = modalEl.querySelector('#editRoleLiteracyContainer');
                if (checkbox && container) {
                    checkbox.addEventListener('change', function () {
                        container.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var specsList = modalEl.querySelector('#editSpecsList');
                var newSpecInput = modalEl.querySelector('#editNewSpec');
                var addSpecBtn = modalEl.querySelector('#editAddSpecBtn');

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
                        _showToast('Specialization already present', 'warning');
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
            onConfirm: function (modalEl) {
                var requires = _readChecked(modalEl, 'editRoleRequiresLiteracy');
                var literacyLevel = requires ? _readInput(modalEl, 'editRoleLiteracyLevel') : null;

                var result = RCMD.updateRole(roleId, {
                    name: _readInput(modalEl, 'editRoleName'),
                    category: _readInput(modalEl, 'editRoleCategory'),
                    genderRestriction: _readInput(modalEl, 'editRoleGender'),
                    icon: _readInput(modalEl, 'editRoleIcon') || 'CIRCLE',
                    baseSalary: _readNumber(modalEl, 'editRoleSalary', role.baseSalary),
                    requiresLiteracy: requires,
                    literacyLevel: literacyLevel,
                    specializations: draftSpecs.slice(),
                    notes: _readInput(modalEl, 'editRoleNotes')
                });

                if (!result.success) {
                    _showToast(result.reason || 'Failed to update role', 'error');
                    return false;
                }

                _persistAndWarn('Role "' + result.role.name + '" updated');
                if (typeof onSuccess === 'function') onSuccess();
            }
        });
    }

    // =========================================================================
    // 6. DELETE ROLE MODAL
    // =========================================================================

    function openDeleteRoleModal(roleId, onSuccess) {
        var role = RS.getRole(roleId);
        if (!role) {
            _showToast('Role not found', 'error');
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
                'The role record will be permanently removed from the role catalogue. ' +
                'Any apprenticeships pointing at this role will be terminated.' +
            '</div>';

        window.openModal({
            titleHtml: 'Delete Role: ' + _esc(role.name),
            contentHtml: content,
            confirmText: 'Delete Permanently',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var removeAssignments = holderCount > 0
                    ? _readChecked(modalEl, 'deleteRemoveAssignments')
                    : false;

                var result = RCMD.deleteRole(roleId, {
                    removeAssignments: removeAssignments
                });

                if (!result.success) {
                    _showToast(result.reason || 'Failed to delete role', 'error');
                    return false;
                }

                _persistAndWarn('Role "' + role.name + '" deleted');
                if (typeof onSuccess === 'function') onSuccess();
            }
        });
    }

    // =========================================================================
    // 7. UNIFIED ASSIGNMENT MODAL (single + bulk)
    // =========================================================================

    function _openAssignModal(roleId, mode, onSuccess) {
        var role = RS.getRole(roleId);
        if (!role) {
            _showToast('Role not found', 'error');
            return;
        }

        var selectedIds = [];
        var filters = {
            search: '',
            gender: 'all',
            locationId: 'all'
        };

        var locationIds = RQ.getOccupiedLocationIds(function (character) {
            return _getCurrentLocationOrNull(character);
        });

        function currentEligible() {
            return RQ.getEligibleCharactersForRole(roleId, {
                search: filters.search,
                gender: filters.gender,
                locationId: filters.locationId,
                getLocation: function (character) {
                    return _getCurrentLocationOrNull(character);
                }
            });
        }

        function isSelected(id) {
            return selectedIds.indexOf(id) !== -1;
        }

        function renderCard(character) {
            var selected = isSelected(character.id);
            var age = _calculateAgeOrNull(character.birthYear);
            var location = _getCurrentLocationOrNull(character);
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
                            _esc(_genderLabel(character.gender)) + ' · ' +
                            (age != null ? _esc(age) : '?') +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--accent);">' +
                        _esc(location || 'Unknown') + ' · ' + roleCount + ' role(s)' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        function renderList(modalEl) {
            var eligible = currentEligible();
            var container = modalEl.querySelector('#assignList');
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
                            refreshSelectionStyles(modalEl);
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
                        refreshSelectionStyles(modalEl);
                    });
                })(cards[j]);
            }
        }

        function toggleSelection(characterId, add) {
            var idx = selectedIds.indexOf(characterId);
            if (add && idx === -1) selectedIds.push(characterId);
            if (!add && idx !== -1) selectedIds.splice(idx, 1);
        }

        function refreshSelectionStyles(modalEl) {
            var cards = modalEl.querySelectorAll('.assign-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                var selected = isSelected(card.dataset.characterId);
                card.style.background = selected ? 'rgba(var(--accent-rgb),0.2)' : 'var(--bg3)';
                card.style.borderColor = selected ? 'var(--accent)' : 'var(--border)';
            }
            var counter = modalEl.querySelector('#assignSelectedCount');
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
            titleHtml: heading,
            contentHtml: content,
            confirmText: mode === 'bulk' ? 'Assign to Selected' : 'Assign',
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                var searchInput = modalEl.querySelector('#assignSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function () {
                        filters.search = this.value;
                        renderList(modalEl);
                    });
                }

                var genderSelect = modalEl.querySelector('#assignGender');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function () {
                        filters.gender = this.value;
                        renderList(modalEl);
                    });
                }

                var locationSelect = modalEl.querySelector('#assignLocation');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function () {
                        filters.locationId = this.value;
                        renderList(modalEl);
                    });
                }

                var slider = modalEl.querySelector('#assignSkill');
                var display = modalEl.querySelector('#assignSkillDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function () {
                        var v = parseInt(this.value, 10) || 0;
                        display.textContent = _skillLabel(v);
                    });
                }

                if (mode === 'bulk') {
                    var selectAll = modalEl.querySelector('#assignSelectAll');
                    if (selectAll) {
                        selectAll.addEventListener('click', function () {
                            var eligible = currentEligible();
                            selectedIds = eligible.map(function (c) { return c.id; });
                            renderList(modalEl);
                            refreshSelectionStyles(modalEl);
                        });
                    }
                    var selectNone = modalEl.querySelector('#assignSelectNone');
                    if (selectNone) {
                        selectNone.addEventListener('click', function () {
                            selectedIds = [];
                            renderList(modalEl);
                            refreshSelectionStyles(modalEl);
                        });
                    }
                }

                renderList(modalEl);
            },
            onConfirm: function (modalEl) {
                if (selectedIds.length === 0) {
                    _showToast('Select at least one character', 'error');
                    return false;
                }

                var skill = parseInt(_readInput(modalEl, 'assignSkill'), 10);
                if (!Number.isFinite(skill)) skill = 0;
                var notes = _readInput(modalEl, 'assignNotes');

                if (mode === 'single') {
                    var result = RCMD.assignRoleToCharacter(selectedIds[0], roleId, {
                        skillLevel: skill,
                        notes: notes
                    });
                    if (!result.success) {
                        _showToast(result.reason || 'Failed to assign role', 'error');
                        return false;
                    }
                    var character = window.getCharacterById(selectedIds[0]);
                    _persistAndWarn((_displayName(character) || 'Character') +
                        ' assigned ' + role.name);
                } else {
                    var bulk = RCMD.bulkAssignRole(selectedIds, roleId, {
                        skillLevel: skill,
                        notes: notes
                    });

                    // bulkAssignRole returns
                    //   { success: boolean, assignedCount, failedCount, errors }
                    // assignedCount === 0 is the "nothing succeeded" check.
                    // bulk.success tells us whether every assignment
                    // succeeded; we use assignedCount for the toast because
                    // it tells the user how many actually landed.
                    if (bulk.assignedCount === 0) {
                        _showToast('No assignments succeeded', 'error');
                        return false;
                    }
                    var msg = 'Assigned ' + role.name + ' to ' +
                        bulk.assignedCount + ' character(s)';
                    if (bulk.failedCount > 0) {
                        msg += '; ' + bulk.failedCount + ' failed';
                    }
                    _persistAndWarn(msg);
                }

                if (typeof onSuccess === 'function') onSuccess();
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
        var role = RS.getRole(roleId);
        if (!role) {
            _showToast('Role not found', 'error');
            return;
        }

        var details = RQ.getCharactersWithRoleDetails(roleId);

        // One batch call for the stats half. See STATISTICS BATCHING in
        // role-ui-list.js for the same reasoning.
        var statsBatch = RQ.getRoleStatisticsBatch([roleId]);
        var stats = statsBatch[roleId] !== undefined
            ? statsBatch[roleId]
            : RQ.getRoleStatistics(roleId);

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
                    '<td style="padding:4px 6px;text-align:center;">' + (d.canTeach ? _icon('CHECK_SIMPLE') : '') + '</td>' +
                    '<td style="padding:4px 6px;">' + specText + '</td>' +
                    '<td style="padding:4px 6px;text-align:center;">' + (d.isPrimary ? _icon('CHECK_SIMPLE') : '') + '</td>' +
                '</tr>';
            }

            html += '</tbody></table></div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>' + _esc(role.name) + '</strong>' +
                '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                    details.length + ' character(s)' +
                    (stats.averageSkill > 0
                        ? ' · Avg skill: ' + stats.averageSkill
                        : '') +
                '</div>' +
            '</div>' +
            html +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Characters with skill ' + SU.getTeachingThreshold() +
                '+ can teach this role.' +
            '</div>';

        window.openModal({
            titleHtml: 'Characters with ' + _esc(role.name),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 9. EDIT ROLE SKILL MODAL
    // =========================================================================

    function openEditRoleSkillModal(roleId, characterId, onSuccess) {
        var role = RS.getRole(roleId);
        var character = window.getCharacterById(characterId);
        if (!role || !character) {
            _showToast('Role or character not found', 'error');
            return;
        }

        var current = RQ.getSkillLevel(characterId, roleId);
        if (current === null) {
            _showToast('Character does not hold this role', 'error');
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
            titleHtml: 'Edit Skill: ' + _esc(_displayName(character)) +
                ' (' + _esc(role.name) + ')',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                var slider = modalEl.querySelector('#editSkillSlider');
                var display = modalEl.querySelector('#editSkillDisplay');
                if (slider && display) {
                    slider.addEventListener('input', function () {
                        var v = parseInt(this.value, 10) || 0;
                        display.textContent = _skillLabel(v);
                    });
                }
            },
            onConfirm: function (modalEl) {
                var value = parseInt(_readInput(modalEl, 'editSkillSlider'), 10);
                if (!Number.isFinite(value)) value = 0;

                var result = RCMD.updateCharacterSkill(characterId, roleId, value);
                if (!result.success) {
                    _showToast(result.reason || 'Failed to update skill', 'error');
                    return false;
                }

                _persistAndWarn('Skill updated to ' + value);
                if (typeof onSuccess === 'function') onSuccess();
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

        window.openModal({
            titleHtml: 'Select Role',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function (modalEl) {
                var searchInput = modalEl.querySelector('#listRoleSearch');
                var categorySelect = modalEl.querySelector('#listRoleCategory');
                var container = modalEl.querySelector('#listRoleResults');

                function renderResults() {
                    var search = searchInput ? searchInput.value : '';
                    var category = categorySelect ? categorySelect.value : 'all';
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
                                var role = RS.getRole(roleId);
                                if (!role) return;
                                window.closeTopModal();
                                if (typeof onSelect === 'function') onSelect(role);
                            });
                        })(items[j]);
                    }
                }

                if (searchInput) {
                    searchInput.addEventListener('input', renderResults);
                }
                if (categorySelect) {
                    categorySelect.addEventListener('change', renderResults);
                }
                renderResults();
            }
        });
    }

    // =========================================================================
    // 11. CATEGORY MANAGER MODAL
    // =========================================================================

    function openCategoryManagerModal(onSuccess) {
        // Inline sub-state for the add/rename form. Replaces the previous
        // window.prompt calls, which were synchronous and inconsistent with
        // the rest of the role modal surface.
        var formState = {
            mode: null,     // null | 'add' | 'rename'
            catId: null,    // rename target only
            currentName: ''
        };

        function buildManagerHtml() {
            var categories = _getCategoriesOrEmpty();
            var roles = RS.getAllRoles();

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

            var formHtml = '';
            if (formState.mode === 'add') {
                formHtml =
                    '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                        '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">New Category Name</label>' +
                        '<input type="text" id="catInlineName" value="" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;">' +
                        '<div style="display:flex;gap:6px;margin-top:6px;">' +
                            '<button type="button" id="catInlineSave" style="padding:4px 10px;font-size:0.6rem;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;">Add</button>' +
                            '<button type="button" id="catInlineCancel" style="padding:4px 10px;font-size:0.6rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Cancel</button>' +
                        '</div>' +
                    '</div>';
            } else if (formState.mode === 'rename') {
                formHtml =
                    '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                        '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Rename Category</label>' +
                        '<input type="text" id="catInlineName" value="' + _esc(formState.currentName) + '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;">' +
                        '<div style="display:flex;gap:6px;margin-top:6px;">' +
                            '<button type="button" id="catInlineSave" style="padding:4px 10px;font-size:0.6rem;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;">Save</button>' +
                            '<button type="button" id="catInlineCancel" style="padding:4px 10px;font-size:0.6rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Cancel</button>' +
                        '</div>' +
                    '</div>';
            }

            return '<div style="margin-bottom:12px;">' +
                    '<button type="button" id="catAddBtn" style="padding:4px 12px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;font-size:0.6rem;">Add Category</button>' +
                '</div>' +
                formHtml +
                '<div style="max-height:300px;overflow-y:auto;">' + html + '</div>' +
                '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                    'Uncategorized cannot be deleted.' +
                '</div>';
        }

        function openManagerModal() {
            var content = buildManagerHtml();

            window.openModal({
                titleHtml: 'Manage Categories',
                contentHtml: content,
                confirmText: 'Close',
                cancelText: '',
                onMount: function (modalEl) {
                    function wireInlineForm() {
                        var input = modalEl.querySelector('#catInlineName');
                        var saveBtn = modalEl.querySelector('#catInlineSave');
                        var cancelBtn = modalEl.querySelector('#catInlineCancel');
                        if (input) input.focus();

                        if (cancelBtn) {
                            cancelBtn.addEventListener('click', function () {
                                formState.mode = null;
                                formState.catId = null;
                                formState.currentName = '';
                                window.closeTopModal();
                                openManagerModal();
                            });
                        }

                        if (saveBtn) {
                            saveBtn.addEventListener('click', function () {
                                var value = input ? input.value.trim() : '';
                                if (!value) {
                                    _showToast('Name is required', 'error');
                                    return;
                                }

                                if (formState.mode === 'add') {
                                    var id = value.toLowerCase()
                                        .replace(/[^a-z0-9]+/g, '_')
                                        .replace(/^_+|_+$/g, '');
                                    if (!id) {
                                        _showToast('Invalid category name', 'error');
                                        return;
                                    }
                                    var result = RCMD.addCategory(id, value);
                                    if (!result.success) {
                                        _showToast(result.reason || 'Failed to add category', 'error');
                                        return;
                                    }
                                    _persistAndWarn('Category added');
                                } else if (formState.mode === 'rename') {
                                    var catId = formState.catId;
                                    if (!catId) return;
                                    var rresult = RCMD.updateCategory(catId, { name: value });
                                    if (!rresult.success) {
                                        _showToast(rresult.reason || 'Failed to update category', 'error');
                                        return;
                                    }
                                    _persistAndWarn('Category updated');
                                }

                                formState.mode = null;
                                formState.catId = null;
                                formState.currentName = '';
                                window.closeTopModal();
                                openManagerModal();
                            });
                        }
                    }

                    wireInlineForm();

                    var addBtn = modalEl.querySelector('#catAddBtn');
                    if (addBtn) {
                        addBtn.addEventListener('click', function () {
                            formState.mode = 'add';
                            formState.catId = null;
                            formState.currentName = '';
                            window.closeTopModal();
                            openManagerModal();
                        });
                    }

                    var editBtns = modalEl.querySelectorAll('.cat-edit');
                    for (var i = 0; i < editBtns.length; i++) {
                        (function (btn) {
                            btn.addEventListener('click', function () {
                                var catId = btn.dataset.catId;
                                var categories = _getCategoriesOrEmpty();
                                var current = categories[catId];
                                if (!current) return;
                                formState.mode = 'rename';
                                formState.catId = catId;
                                formState.currentName = current.name;
                                window.closeTopModal();
                                openManagerModal();
                            });
                        })(editBtns[i]);
                    }

                    var deleteBtns = modalEl.querySelectorAll('.cat-delete');
                    for (var j = 0; j < deleteBtns.length; j++) {
                        (function (btn) {
                            btn.addEventListener('click', function () {
                                var catId = btn.dataset.catId;
                                var categories = _getCategoriesOrEmpty();
                                var cat = categories[catId];
                                if (!cat) return;
                                var rolesInCat = RS.getAllRoles().filter(function (r) {
                                    return r.category === catId;
                                });
                                var msg = 'Delete category "' + cat.name + '"?';
                                if (rolesInCat.length > 0) {
                                    msg += ' ' + rolesInCat.length +
                                        ' role(s) will be reassigned to Uncategorized.';
                                }
                                _confirmThen(msg, function () {
                                    var result = RCMD.deleteCategory(catId);
                                    if (!result.success) {
                                        _showToast(result.reason || 'Failed to delete category', 'error');
                                        return;
                                    }
                                    _persistAndWarn('Category deleted');
                                    window.closeTopModal();
                                    openManagerModal();
                                });
                            });
                        })(deleteBtns[j]);
                    }
                },
                onConfirm: function () {
                    if (typeof onSuccess === 'function') onSuccess();
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
})();
