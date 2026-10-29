/**
 * =============================================================================
 * STILL WATERS - ROLE UI LIST (role-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/role-ui-list.js
 *
 * Renders:
 *   - the role detail panel (view + edit)
 *   - the role list
 *   - a single role card
 *   - the master-filter toggle
 *
 * Contract:
 *   - Reads via RoleQueries. Writes via RoleCommands.
 *   - Never mutates role or character state directly.
 *   - Never scans every character to answer a role question. Uses
 *     RoleQueries statistics. Statistics is itself O(characters); it is
 *     called AT MOST ONCE per render pass (via getRoleStatisticsBatch),
 *     never once per role row.
 *   - Never hardcodes skill thresholds. Uses SkillUtils.
 *   - Never invents its own skill taxonomy, literacy vocabulary, or salary
 *     defaults. Uses SkillUtils and RoleConstants.
 *   - No recursion guards. Rendering is synchronous; there is no recursive
 *     graph to protect.
 *   - No timers. Handlers attach immediately after innerHTML is set.
 *   - No global document.querySelectorAll. All queries are scoped to the
 *     container passed in by the caller.
 *   - Does not sort arrays it does not own.
 *
 * STATISTICS BATCHING
 *
 *   RoleQueries.getRoleStatistics(roleId) costs O(characters × avg
 *   professions) per call. Calling it once per role row is
 *   O(roles × characters × avg professions) — quadratic in the worst
 *   case. To avoid that, every multi-role render in this file calls
 *   RoleQueries.getRoleStatisticsBatch([...roleIds]) exactly once, then
 *   reads the per-role entries from the returned map.
 *
 *   renderRoleCard accepts options.stats so a caller rendering N cards
 *   can share the batch with renderRoleList. Without options.stats,
 *   renderRoleCard falls back to a single getRoleStatistics call for
 *   the one role it renders, which is the correct cost for a
 *   standalone card.
 *
 *   renderRoleDetailPanel batches its stats call and its
 *   getCharactersWithRoleDetails call. The current RoleQueries API does
 *   not expose a combined query, so the detail panel makes two passes;
 *   the batch version at least makes the stats pass a single scan
 *   (instead of the two scans the pre-refactor version made — one for
 *   stats, one for detail).
 *
 * ICON LOOKUP
 *
 *   Icons come from window.Icons[name] via _icon (strict: throws on
 *   unknown name). Callers that pass role.icon use `role.icon ||
 *   'CIRCLE'` so an absent icon resolves to the CIRCLE fallback before
 *   _icon is called. _iconSpan does not silently fall back; a typo in
 *   a role's icon field surfaces as a render-time error rather than an
 *   empty span.
 *
 * MASTER FILTER LABEL
 *
 *   renderMasterFilterToggle's default label reads the Master tier
 *   name from SkillUtils. If SkillUtils is missing (should not happen
 *   under the documented load order, but the check costs nothing),
 *   the label falls back to the literal 'Masters'. Prior revisions
 *   called SU.getTier(...) unguarded and would throw on a SkillUtils
 *   load-order regression.
 *
 * DEPENDENCIES (must be loaded first):
 *   - formatting.js      (_escapeHtml)
 *   - ui.js              (_showToast)
 *   - icons.js           (Icons)
 *   - skill-utils.js     (SkillUtils)
 *   - role-constants.js  (RoleConstants)
 *   - role-state.js      (RoleState)
 *   - role-queries.js    (RoleQueries)
 *   - role-commands.js   (RoleCommands)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - renderRoleList now uses RoleQueries.getRoleStatisticsBatch once
 *       per render instead of calling getRoleStatistics once per role
 *       via the removed _createStatsCache. This changes the cost from
 *       O(roles × characters × avg professions) to O(characters × avg
 *       professions) per render. See STATISTICS BATCHING in the header.
 *     - renderRoleDetailPanel uses getRoleStatisticsBatch for its stats
 *       pass. It still makes a separate getCharactersWithRoleDetails
 *       call because RoleQueries does not expose a combined query; the
 *       two scans are unavoidable without an API change.
 *     - renderRoleCard accepts options.stats (per-role statistics
 *       object) so callers with a batch result can share it. Without
 *       options.stats, renderRoleCard still calls getRoleStatistics for
 *       its single role — that's the correct cost for one card.
 *     - renderMasterFilterToggle's default label now reads the Master
 *       tier name via a guarded _masterTierName helper that returns
 *       'Masters' when SkillUtils is missing, instead of calling
 *       SU.getTier(...).name unguarded. Prior revisions threw on a
 *       SkillUtils load-order regression.
 *     - Header STATISTICS BATCHING, ICON LOOKUP, and MASTER FILTER
 *       LABEL sections added.
 *     - No other behavioural change. Every rendered output is identical
 *       when the underlying data is identical; only the scan count and
 *       the missing-SkillUtils fallback differ.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['_escapeHtml',   'formatting.js'],
        ['_showToast',    'ui.js'],
        ['Icons',         'icons.js'],
        ['SkillUtils',    'skill-utils.js'],
        ['RoleConstants', 'role-constants.js'],
        ['RoleState',     'role-state.js'],
        ['RoleQueries',   'role-queries.js'],
        ['RoleCommands',  'role-commands.js']
    ];
    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'role-ui-list.js requires ' + REQUIRED[_i][1] +
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
        return window._escapeHtml(v == null ? '' : String(v));
    }

    function _icon(name) {
        if (!window.Icons || typeof window.Icons[name] !== 'string') {
            throw new Error('role-ui-list.js: unknown icon "' + name + '".');
        }
        return window.Icons[name];
    }

    function _iconSpan(name, size) {
        var svg = _icon(name);
        if (size) {
            svg = svg
                .replace(/width="[^"]*"/, 'width="' + size + '"')
                .replace(/height="[^"]*"/, 'height="' + size + '"');
        }
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' +
            svg + '</span>';
    }

    function _categoryName(categoryId) {
        var cats = RS.getCategories();
        var c = cats[categoryId];
        return c ? c.name : RC.UNCATEGORIZED_NAME;
    }

    function _literacyLabel(level) {
        if (!level) return RC.LITERACY_LEVEL_NAMES.none;
        return RC.LITERACY_LEVEL_NAMES[level] || level;
    }

    function _skillLabel(level) {
        return level + ' (' + SU.getSkillLevelName(level) + ')';
    }

    function _genderLabel(restriction) {
        if (restriction === 'male') return 'Male only';
        if (restriction === 'female') return 'Female only';
        return 'Both genders';
    }

    /**
     * Master-tier display name. Falls back to the literal 'Masters' when
     * SkillUtils is unavailable. See MASTER FILTER LABEL in the header.
     */
    function _masterTierName() {
        if (typeof SU !== 'undefined' &&
            typeof SU.getThresholds === 'function' &&
            typeof SU.getTier === 'function') {
            var t = SU.getThresholds();
            if (t && typeof t.MASTER === 'number') {
                var tier = SU.getTier(t.MASTER);
                if (tier && typeof tier.name === 'string' && tier.name.length > 0) {
                    return tier.name;
                }
            }
        }
        return 'Masters';
    }

    // =========================================================================
    // 3. SHARED BUILDERS
    // =========================================================================

    function _buildCategoryOptions(selectedId) {
        var cats = RS.getCategories();
        var keys = Object.keys(cats).sort(function (a, b) {
            return cats[a].name.localeCompare(cats[b].name);
        });
        var html = '';
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var sel = key === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(key) + '"' + sel + '>' +
                _esc(cats[key].name) + '</option>';
        }
        return html;
    }

    function _buildGenderOptions(selectedId) {
        var opts = [
            { id: 'both',   label: 'Both genders' },
            { id: 'male',   label: 'Male only' },
            { id: 'female', label: 'Female only' }
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

    function _readValue(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _readChecked(id) {
        var el = document.getElementById(id);
        return el ? el.checked === true : false;
    }

    function _readNumber(id, fallback) {
        var raw = _readValue(id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    // =========================================================================
    // 4. STATISTICS BATCH HELPER
    // =========================================================================
    //
    // Every multi-role render in this file funnels stats through this
    // helper. It calls RoleQueries.getRoleStatisticsBatch exactly once
    // for the full id set, then returns a per-id accessor. Callers that
    // already have the batch map (e.g. renderRoleCard with options.stats)
    // do not use this; they pass the map entry directly.
    //
    // See STATISTICS BATCHING in the header.

    function _statsBatchFor(roleIds) {
        var batch = RQ.getRoleStatisticsBatch(roleIds);
        return function (roleId) {
            var entry = batch[roleId];
            return entry !== undefined
                ? entry
                : RQ.getRoleStatistics(roleId);
        };
    }

    // =========================================================================
    // 5. SPECIALIZATIONS RENDERING
    // =========================================================================

    function _renderSpecializationsChips(specializations) {
        if (!Array.isArray(specializations) || specializations.length === 0) {
            return '<span style="font-size:0.7rem;color:var(--dim);">No specializations</span>';
        }
        var html = '';
        for (var i = 0; i < specializations.length; i++) {
            html += '<span class="spec-item" data-index="' + i + '" ' +
                    'style="display:inline-flex;align-items:center;gap:4px;' +
                    'background:var(--bg3);padding:4px 8px;border-radius:16px;font-size:0.6rem;">' +
                _esc(specializations[i]) +
                '<button type="button" class="remove-spec" data-index="' + i + '" ' +
                        'style="background:none;border:none;cursor:pointer;color:var(--dim);">&times;</button>' +
            '</span>';
        }
        return html;
    }

    // =========================================================================
    // 6. CHARACTERS-WITH-ROLE TABLE
    // =========================================================================
    //
    // Receives already-computed detail entries from RoleQueries. Does not
    // scan the character set here.

    function _renderCharactersWithRole(entries, totalCount) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return '<div style="padding:16px;color:var(--dim);font-size:0.65rem;text-align:center;">' +
                'No characters hold this role.' +
            '</div>';
        }

        var html =
            '<div style="margin:16px 0;">' +
                '<h4 style="margin:0 0 8px 0;font-size:0.75rem;">Characters with this role (' + totalCount + ')</h4>' +
                '<div style="max-height:250px;overflow-y:auto;background:var(--bg3);border-radius:8px;">' +
                    '<table style="width:100%;font-size:0.65rem;border-collapse:collapse;">' +
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

        var shown = Math.min(entries.length, 15);
        for (var i = 0; i < shown; i++) {
            var e = entries[i];
            var name = ((e.character.name || '') + ' ' + (e.character.surname || '')).trim();
            var specText = e.specializations.length > 0
                ? e.specializations.slice(0, 2).map(_esc).join(', ') +
                  (e.specializations.length > 2 ? '…' : '')
                : '';

            html += '<tr style="border-top:1px solid var(--border-light);">' +
                '<td style="padding:4px 6px;">' + _esc(name) + '</td>' +
                '<td style="padding:4px 6px;text-align:center;">' + _esc(e.skillLevel) + '</td>' +
                '<td style="padding:4px 6px;text-align:center;">' + _esc(e.tierName) + '</td>' +
                '<td style="padding:4px 6px;text-align:center;">' + (e.canTeach ? '&#10003;' : '') + '</td>' +
                '<td style="padding:4px 6px;">' + specText + '</td>' +
                '<td style="padding:4px 6px;text-align:center;">' + (e.isPrimary ? '&#10003;' : '') + '</td>' +
            '</tr>';
        }

        if (entries.length > shown) {
            html += '<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--dim);">' +
                '... and ' + (entries.length - shown) + ' more' +
            '</td></tr>';
        }

        html += '</tbody></table></div>' +
            '<small style="font-size:0.55rem;color:var(--dim);display:block;margin-top:6px;">' +
                'Characters with skill ' + SU.getTeachingThreshold() + '+ can teach this role.' +
            '</small>' +
        '</div>';

        return html;
    }

    // =========================================================================
    // 7. ROLE DETAIL PANEL
    // =========================================================================

    function renderRoleDetailPanel(containerId, roleId, onBack, onRefresh, options) {
        var container = document.getElementById(containerId);
        if (!container) return false;

        var role = RS.getRole(roleId);
        if (!role) {
            container.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);">Role not found.</div>';
            if (typeof onBack === 'function') onBack();
            return false;
        }

        options = options || {};
        var mastersOnly = options.mastersOnly === true;

        // Single batch call for stats. Detail entries are a separate scan
        // (RoleQueries does not expose a combined query). See
        // STATISTICS BATCHING in the header.
        var statsBatch = RQ.getRoleStatisticsBatch([roleId]);
        var stats = statsBatch[roleId] !== undefined
            ? statsBatch[roleId]
            : RQ.getRoleStatistics(roleId);

        var detailEntries = mastersOnly
            ? RQ.getCharactersWithRoleDetails(roleId, { mastersOnly: true })
            : RQ.getCharactersWithRoleDetails(roleId);

        // Draft specializations. DOM is a projection of this array.
        var draftSpecs = Array.isArray(role.specializations)
            ? role.specializations.slice()
            : [];

        var iconHtml = _iconSpan(role.icon || 'CIRCLE', '1.2em');

        container.innerHTML =
            '<div class="role-detail-panel">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
                    '<button type="button" id="roleDetailBackBtn" class="btn small" ' +
                            'style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.6rem;">' +
                        '&larr; Back' +
                    '</button>' +
                    '<h2 style="margin:0;font-size:1rem;display:flex;align-items:center;gap:6px;">' +
                        iconHtml + ' Edit Role: ' + _esc(role.name) +
                    '</h2>' +
                    '<button type="button" id="roleDetailDeleteBtn" class="btn danger" ' +
                            'style="background:#8a2020;color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.6rem;">' +
                        'Delete' +
                    '</button>' +
                '</div>' +

                '<form id="roleDetailForm">' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role Name</label>' +
                        '<input type="text" id="roleDetailName" value="' + _esc(role.name) + '" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Category</label>' +
                        '<select id="roleDetailCategory" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            _buildCategoryOptions(role.category) +
                        '</select>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender Restriction</label>' +
                        '<select id="roleDetailGender" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            _buildGenderOptions(role.genderRestriction) +
                        '</select>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon Name</label>' +
                        '<input type="text" id="roleDetailIcon" value="' + _esc(role.icon || 'CIRCLE') + '" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<small style="font-size:0.55rem;color:var(--dim);">Name of an icon registered in icons.js.</small>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Salary (gold/year)</label>' +
                        '<input type="number" id="roleDetailSalary" value="' + _esc(role.baseSalary) + '" ' +
                                'min="' + RC.MIN_SALARY + '" max="' + RC.MAX_SALARY + '" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<small style="font-size:0.55rem;color:var(--dim);">0 means no salary.</small>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                            '<input type="checkbox" id="roleDetailRequiresLiteracy"' +
                                    (role.requiresLiteracy ? ' checked' : '') + '>' +
                            '<span>Requires Literacy</span>' +
                        '</label>' +
                        '<div id="roleDetailLiteracyContainer" style="margin-top:6px;' +
                                (role.requiresLiteracy ? '' : 'display:none;') + '">' +
                            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Required Level</label>' +
                            '<select id="roleDetailLiteracyLevel" ' +
                                    'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                                _buildLiteracyOptions(role.literacyLevel || '') +
                            '</select>' +
                        '</div>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Specializations</label>' +
                        '<div id="roleDetailSpecsList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
                            _renderSpecializationsChips(draftSpecs) +
                        '</div>' +
                        '<div style="display:flex;gap:8px;">' +
                            '<input type="text" id="roleDetailNewSpec" placeholder="New specialization..." ' +
                                    'style="flex:1;padding:6px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<button type="button" id="roleDetailAddSpecBtn" ' +
                                    'style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.6rem;">Add</button>' +
                        '</div>' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                        '<textarea id="roleDetailNotes" rows="2" ' +
                                'style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            _esc(role.notes || '') +
                        '</textarea>' +
                    '</div>' +

                    '<div style="background:var(--bg3);padding:12px;border-radius:8px;margin:16px 0;">' +
                        '<h4 style="margin:0 0 8px 0;font-size:0.75rem;">Role Statistics</h4>' +
                        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;font-size:0.7rem;">' +
                            '<div>Characters: ' + stats.totalCharacters + '</div>' +
                            '<div>Specializations: ' + stats.totalSpecializations + '</div>' +
                            '<div>Average skill: ' + stats.averageSkill + '</div>' +
                            '<div>Untrained: ' + stats.countsByTier.untrained + '</div>' +
                            '<div>Novice: ' + stats.countsByTier.novice + '</div>' +
                            '<div>Apprentice: ' + stats.countsByTier.apprentice + '</div>' +
                            '<div>Journeyman: ' + stats.countsByTier.journeyman + '</div>' +
                            '<div>Expert: ' + stats.countsByTier.expert + '</div>' +
                            '<div>Master: ' + stats.countsByTier.master + '</div>' +
                            '<div>Can teach: ' + stats.canTeachCount + '</div>' +
                        '</div>' +
                    '</div>' +

                    _renderCharactersWithRole(detailEntries, stats.totalCharacters) +

                    '<div style="display:flex;gap:8px;margin-top:16px;">' +
                        '<button type="submit" ' +
                                'style="background:var(--accent);color:var(--bg);border:none;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:0.7rem;">Save Changes</button>' +
                        '<button type="button" id="roleDetailCancelBtn" ' +
                                'style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:6px 16px;cursor:pointer;font-size:0.7rem;">Cancel</button>' +
                    '</div>' +
                '</form>' +
            '</div>';

        _attachDetailPanelHandlers(container, role, draftSpecs, onBack, onRefresh, options);
        return true;
    }

    function _attachDetailPanelHandlers(container, role, draftSpecs, onBack, onRefresh, options) {
        var form = container.querySelector('#roleDetailForm');
        var backBtn = container.querySelector('#roleDetailBackBtn');
        var cancelBtn = container.querySelector('#roleDetailCancelBtn');
        var deleteBtn = container.querySelector('#roleDetailDeleteBtn');
        var addSpecBtn = container.querySelector('#roleDetailAddSpecBtn');
        var newSpecInput = container.querySelector('#roleDetailNewSpec');
        var specsList = container.querySelector('#roleDetailSpecsList');

        function rerenderPanel() {
            renderRoleDetailPanel(
                container.id,
                role.id,
                onBack,
                onRefresh,
                options
            );
        }

        function redrawSpecs() {
            specsList.innerHTML = _renderSpecializationsChips(draftSpecs);
            var removeBtns = specsList.querySelectorAll('.remove-spec');
            for (var i = 0; i < removeBtns.length; i++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var idx = parseInt(btn.dataset.index, 10);
                        if (!Number.isFinite(idx)) return;
                        draftSpecs.splice(idx, 1);
                        redrawSpecs();
                    });
                })(removeBtns[i]);
            }
        }

        if (backBtn) {
            backBtn.addEventListener('click', function () {
                if (typeof onBack === 'function') onBack();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                if (typeof onBack === 'function') onBack();
            });
        }

        if (addSpecBtn && newSpecInput && specsList) {
            addSpecBtn.addEventListener('click', function () {
                var value = newSpecInput.value.trim();
                if (!value) return;
                if (draftSpecs.indexOf(value) !== -1) {
                    window._showToast('Specialization already present', 'warning');
                    return;
                }
                draftSpecs.push(value);
                newSpecInput.value = '';
                redrawSpecs();
            });
            newSpecInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addSpecBtn.click();
                }
            });
            redrawSpecs();
        }

        // Literacy toggle
        var litCheck = container.querySelector('#roleDetailRequiresLiteracy');
        var litContainer = container.querySelector('#roleDetailLiteracyContainer');
        if (litCheck && litContainer) {
            litCheck.addEventListener('change', function () {
                litContainer.style.display = this.checked ? 'block' : 'none';
            });
        }

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();

                var requires = _readChecked('roleDetailRequiresLiteracy');
                var litLevel = requires ? _readValue('roleDetailLiteracyLevel') : null;

                var result = RCMD.updateRole(role.id, {
                    name: _readValue('roleDetailName'),
                    category: _readValue('roleDetailCategory'),
                    genderRestriction: _readValue('roleDetailGender'),
                    icon: _readValue('roleDetailIcon') || 'CIRCLE',
                    baseSalary: _readNumber('roleDetailSalary', role.baseSalary),
                    requiresLiteracy: requires,
                    literacyLevel: litLevel,
                    specializations: draftSpecs.slice(),
                    notes: _readValue('roleDetailNotes')
                });

                if (!result.success) {
                    window._showToast(result.reason || 'Failed to save role', 'error');
                    return;
                }

                window._showToast('Role "' + result.role.name + '" saved', 'success');
                if (typeof onRefresh === 'function') onRefresh();
                rerenderPanel();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                if (typeof window.openDeleteRoleModal === 'function') {
                    window.openDeleteRoleModal(role.id, function () {
                        if (typeof onRefresh === 'function') onRefresh();
                        if (typeof onBack === 'function') onBack();
                    });
                } else {
                    window._showToast('Delete modal not available', 'error');
                }
            });
        }
    }

    // =========================================================================
    // 8. ROLE LIST
    // =========================================================================

    function renderRoleList(containerId, options) {
        var container = document.getElementById(containerId);
        if (!container) return false;

        options = options || {};

        // Never sort a caller-owned array in place.
        var roles = (options.filteredRoles || RQ.getRoles({})).slice();
        var emptyMessage = options.emptyMessage || 'No roles found.';
        var showStats = options.showStats === true;
        var showActions = options.showActions !== false;
        var selectedId = options.selectedId || null;
        var rowClass = options.rowClass || 'role-row';

        if (roles.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                    _esc(emptyMessage) +
                '</div>';
            return true;
        }

        roles.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        // One statistics batch for the whole render. See STATISTICS
        // BATCHING in the header.
        var statsFor = null;
        if (showStats) {
            var roleIds = [];
            for (var si = 0; si < roles.length; si++) {
                if (roles[si] && roles[si].id) roleIds.push(roles[si].id);
            }
            statsFor = _statsBatchFor(roleIds);
        }

        var html = '<div style="display:flex;flex-direction:column;gap:4px;">';
        for (var i = 0; i < roles.length; i++) {
            var role = roles[i];
            var isSelected = selectedId === role.id;
            var stats = statsFor ? statsFor(role.id) : null;
            var holderCount = stats ? stats.totalCharacters : 0;

            var statsHtml = '';
            if (showStats && stats) {
                statsHtml =
                    '<div style="font-size:0.55rem;color:var(--dim);display:flex;gap:12px;margin-top:4px;">' +
                        '<span>Avg skill: ' + stats.averageSkill + '</span>' +
                        '<span>Masters: ' + stats.countsByTier.master + '</span>' +
                        '<span>Can teach: ' + stats.canTeachCount + '</span>' +
                    '</div>';
            }

            var actionsHtml = '';
            if (showActions) {
                actionsHtml =
                    '<button type="button" class="role-edit-btn" data-role-id="' + _esc(role.id) + '" ' +
                            'style="background:none;border:none;cursor:pointer;color:var(--accent);padding:2px 6px;">' +
                        _iconSpan('EDIT') +
                    '</button>' +
                    '<button type="button" class="role-delete-btn" data-role-id="' + _esc(role.id) + '" ' +
                            'style="background:none;border:none;cursor:pointer;color:var(--dim);padding:2px 6px;">' +
                        _iconSpan('X_HEAVY') +
                    '</button>';
            }

            html += '<div class="' + _esc(rowClass) + '" data-role-id="' + _esc(role.id) + '" ' +
                    'style="background:' + (isSelected ? 'rgba(var(--accent-rgb),0.15)' : 'var(--bg2)') + ';' +
                    'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:6px;padding:8px 12px;cursor:pointer;transition:background 0.15s;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                    '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:150px;">' +
                        _iconSpan(role.icon || 'CIRCLE', '1.1em') +
                        '<div>' +
                            '<strong>' + _esc(role.name) + '</strong>' +
                            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
                                _esc(_categoryName(role.category)) +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:12px;">' +
                        (showStats
                            ? '<span style="font-size:0.6rem;color:var(--accent);">' + holderCount + ' holder(s)</span>'
                            : '') +
                        actionsHtml +
                    '</div>' +
                '</div>' +
                statsHtml +
                (role.notes
                    ? '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' + _esc(role.notes) + '</div>'
                    : '') +
            '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        // Scoped queries only.
        var rows = container.querySelectorAll('.' + rowClass);
        for (var r = 0; r < rows.length; r++) {
            (function (row) {
                row.addEventListener('click', function (e) {
                    if (e.target.closest('button')) return;
                    if (typeof options.onSelect === 'function') {
                        options.onSelect(row.dataset.roleId);
                    }
                });
            })(rows[r]);
        }

        var editBtns = container.querySelectorAll('.role-edit-btn');
        for (var e2 = 0; e2 < editBtns.length; e2++) {
            (function (btn) {
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (typeof options.onEdit === 'function') {
                        options.onEdit(btn.dataset.roleId);
                    }
                });
            })(editBtns[e2]);
        }

        var deleteBtns = container.querySelectorAll('.role-delete-btn');
        for (var d2 = 0; d2 < deleteBtns.length; d2++) {
            (function (btn) {
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (typeof options.onDelete === 'function') {
                        options.onDelete(btn.dataset.roleId);
                    }
                });
            })(deleteBtns[d2]);
        }

        return true;
    }

    // =========================================================================
    // 9. ROLE CARD
    // =========================================================================

    /**
     * Renders a single role card.
     *
     * options.stats, if supplied, is the per-role statistics object from
     * RoleQueries.getRoleStatisticsBatch. Callers rendering N cards can
     * pay the batch cost once and pass each card its entry. Without
     * options.stats, renderRoleCard falls back to a single
     * getRoleStatistics call for its one role (correct cost for a
     * standalone card). See STATISTICS BATCHING in the header.
     */
    function renderRoleCard(role, options) {
        if (!role) return '';
        options = options || {};

        var showStats = options.showStats === true;
        var showActions = options.showActions !== false;

        var stats = options.stats !== undefined
            ? options.stats
            : (showStats ? RQ.getRoleStatistics(role.id) : null);
        var holderCount = stats ? stats.totalCharacters : 0;

        var statsHtml = '';
        if (showStats && stats) {
            statsHtml =
                '<div style="font-size:0.55rem;color:var(--dim);display:flex;gap:12px;margin-top:8px;">' +
                    '<span>Avg skill: ' + stats.averageSkill + '</span>' +
                    '<span>Masters: ' + stats.countsByTier.master + '</span>' +
                    '<span>Can teach: ' + stats.canTeachCount + '</span>' +
                '</div>';
        }

        var actionsHtml = '';
        if (showActions) {
            actionsHtml =
                '<button type="button" class="role-edit-btn" data-role-id="' + _esc(role.id) + '" ' +
                        'style="background:none;border:none;cursor:pointer;color:var(--accent);padding:2px 6px;">' +
                    _iconSpan('EDIT') +
                '</button>' +
                '<button type="button" class="role-delete-btn" data-role-id="' + _esc(role.id) + '" ' +
                        'style="background:none;border:none;cursor:pointer;color:var(--dim);padding:2px 6px;">' +
                    _iconSpan('X_HEAVY') +
                '</button>';
        }

        return '<div class="role-card" data-role-id="' + _esc(role.id) + '" ' +
                'style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;' +
                'padding:12px 16px;cursor:pointer;transition:background 0.15s;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
                '<div>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        _iconSpan(role.icon || 'CIRCLE', '1.2em') +
                        '<div>' +
                            '<strong>' + _esc(role.name) + '</strong>' +
                            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
                                _esc(_categoryName(role.category)) +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                    (role.notes
                        ? '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' + _esc(role.notes) + '</div>'
                        : '') +
                    statsHtml +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                    (showStats
                        ? '<span style="font-size:0.6rem;color:var(--accent);">' + holderCount + ' holder(s)</span>'
                        : '') +
                    actionsHtml +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 10. MASTER FILTER TOGGLE
    // =========================================================================
    //
    // The label matches what the filter actually does. If the caller wants
    // "Expert and above", it should pass labelText: 'Show Experts and Above'
    // and the query should use expertsAndUp. This renderer does not decide
    // semantics; it only displays them.
    //
    // The default label reads the Master tier name from SkillUtils via
    // _masterTierName, which falls back to 'Masters' if SkillUtils is
    // unavailable. See MASTER FILTER LABEL in the header.

    function renderMasterFilterToggle(containerId, mastersOnly, onChange, labelText) {
        var container = document.getElementById(containerId);
        if (!container) return false;

        var label = labelText || (
            'Show ' + _masterTierName() + 's only'
        );

        container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="roleMasterToggle"' +
                            (mastersOnly ? ' checked' : '') + ' style="cursor:pointer;">' +
                    '<span>' + _esc(label) + '</span>' +
                '</label>' +
            '</div>';

        var toggle = container.querySelector('#roleMasterToggle');
        if (toggle && typeof onChange === 'function') {
            toggle.addEventListener('change', function () {
                onChange(this.checked === true);
            });
        }
        return true;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.RoleUI = {
        renderRoleDetailPanel: renderRoleDetailPanel,
        renderRoleList: renderRoleList,
        renderRoleCard: renderRoleCard,
        renderMasterFilterToggle: renderMasterFilterToggle
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleUI;
    }
})();
