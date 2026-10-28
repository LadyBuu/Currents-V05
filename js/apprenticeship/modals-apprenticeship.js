/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP MODALS
 * js/apprenticeship/modals-apprenticeship.js
 * =============================================================================
 *
 * UI only:
 *   - Collect input
 *   - Render projections from ApprenticeshipQueries
 *   - Call ApprenticeshipCommands
 *   - Persist via ApprenticeshipCommands.persist()
 *   - Display results
 *
 * NO direct relationship.metadata access.
 * NO fallback dependencies.
 * NO policy decisions (thresholds come from Rules).
 * NO Math.random(). No timers. No global document.querySelectorAll.
 * All DOM queries are scoped to the modal's own subtree via onMount(modalEl).
 *
 * PERSISTENCE
 *
 *   ApprenticeshipCommands does not flush on every mutation. This module
 *   is the batch boundary: after a successful command, it calls
 *   ApprenticeshipCommands.persist() once. If the disk save fails, a
 *   warning toast is shown but the in-memory mutation stands — same
 *   policy as modals-roles.js (_persistAndWarn).
 *
 *   Every command handler that mutates state MUST follow this pattern:
 *
 *       var result = C.someCommand(...);
 *       if (!result.success) { _showToast(...); return false; }
 *       _persistAndWarn(successMessage);
 *       // proceed with UI updates
 *
 *   Missing _persistAndWarn means the user's action lives only in
 *   memory until the next markDataDirty-triggering action. That is a
 *   bug. All mutating handlers below call it.
 *
 * CONFIRMATION DIALOG CONTRACT
 *
 *   This module uses window.confirmDialog(message, title, onConfirm) —
 *   the three-argument signature from modals-core.js. Passing onConfirm
 *   as the second argument (which earlier revisions of this file did)
 *   sends the callback into the title slot and leaves the confirm
 *   callback undefined; the dialog appears and closes but the callback
 *   never fires. The _confirm wrapper below enforces the three-argument
 *   form.
 *
 * MODAL LIFECYCLE
 *
 *   Every modal uses onMount to bind its post-open handlers. onMount runs
 *   synchronously during openModal, so element lookups inside it are
 *   scoped to the modal element and cannot collide with another modal's
 *   IDs. Handlers are NOT bound after openModal returns — that would be
 *   the same latent pattern modals-education.js fixed by moving to
 *   onMount.
 *
 * ICON POLICY
 *
 *   Icons come from window.Icons[name] via _getIcon. The wrapper
 *   self-defines rather than depending on a window._getIcon global,
 *   which does not exist (icons.js exports window.getIcon, not
 *   window._getIcon).
 *
 * AGE CALCULATION
 *
 *   calculateAge(birthYear, isDeceased, deathYear). All calls pass the
 *   full character state so deceased characters render correctly.
 *
 * TERMINATE / CANCEL SIGNATURES
 *
 *   ApprenticeshipCommands.terminateApprenticeship(masterId, apprenticeId, roleId, reason)
 *   ApprenticeshipCommands.cancelApprenticeship(masterId, apprenticeId, roleId, reason)
 *
 *   roleId is required — a character may have concurrent apprenticeships
 *   with multiple masters for different roles.
 *
 * DEPENDENCIES (must be loaded first):
 *   - modals-core.js          (openModal, closeTopModal, confirmDialog)
 *   - formatting.js           (_escapeHtml)
 *   - ui.js                   (_showToast, confirmDialog)
 *   - icons.js                (Icons)
 *   - time.js                 (getCurrentYear, calculateAge)
 *   - accessors.js            (getCharacterById, getPlaceById, getCurrentLocation)
 *   - apprenticeship-constants.js  (APPRENTICESHIP_STAGES, TEACHING_CONSTANTS)
 *   - apprenticeship-queries.js    (ApprenticeshipQueries)
 *   - apprenticeship-commands.js   (ApprenticeshipCommands)
 *   - apprenticeship-rules.js      (ApprenticeshipRules)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',           'modals-core.js'],
        ['closeTopModal',       'modals-core.js'],
        ['confirmDialog',       'ui.js'],
        ['_escapeHtml',         'formatting.js'],
        ['_showToast',          'ui.js'],
        ['Icons',               'icons.js'],
        ['getCharacterById',    'accessors.js'],
        ['getPlaceById',        'accessors.js'],
        ['getCurrentLocation',  'accessors.js'],
        ['getCurrentYear',      'time.js'],
        ['calculateAge',        'time.js'],
        ['ApprenticeshipQueries',  'apprenticeship-queries.js'],
        ['ApprenticeshipCommands', 'apprenticeship-commands.js'],
        ['ApprenticeshipRules',    'apprenticeship-rules.js'],
        ['TEACHING_CONSTANTS',     'apprenticeship-constants.js'],
        ['APPRENTICESHIP_STAGES',  'apprenticeship-constants.js'],
        ['APPRENTICESHIP_STATUS',  'apprenticeship-constants.js']
    ];

    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-apprenticeship.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    // Shorthands after dependency check.
    var Q = window.ApprenticeshipQueries;
    var C = window.ApprenticeshipCommands;
    var R = window.ApprenticeshipRules;
    var TEACH = window.TEACHING_CONSTANTS;
    var STATUS = window.APPRENTICESHIP_STATUS;

    // =========================================================================
    // 2. DOMAIN WRAPPERS
    // =========================================================================

    function _getCharacterById(id)          { return window.getCharacterById(id); }
    function _getPlaceById(id)              { return window.getPlaceById(id); }
    function _getCurrentLocation(c)         { return window.getCurrentLocation(c); }
    function _getCurrentYear()              { return window.getCurrentYear(); }
    function _escapeHtml(s)                 { return window._escapeHtml(s); }
    function _openModal(o)                  { return window.openModal(o); }
    function _closeTopModal()               { return window.closeTopModal(); }
    function _showToast(m, t)               { return window._showToast(m, t); }

    /**
     * Returns trusted SVG markup for a named icon. icons.js exports
     * window.Icons[name]; there is no window._getIcon. The wrapper
     * self-defines so this module has one clear dependency (Icons) rather
     * than two.
     *
     * Unknown names return the CIRCLE fallback so a typo produces a
     * visible placeholder rather than throwing mid-render. If even CIRCLE
     * is missing, the icons.js dependency check at load has already
     * failed, so this cannot return '' in practice — but it returns ''
     * defensively rather than throwing inside a render pass.
     */
    function _getIcon(name) {
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        if (window.Icons && typeof window.Icons.CIRCLE === 'string') {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    /**
     * Three-argument confirm wrapper.
     *
     * modals-core.js::confirmDialog(message, title, onConfirm) takes THREE
     * arguments. The two-argument form (message, onConfirm) sends the
     * callback into the title slot and leaves the confirm callback
     * undefined — the dialog appears and closes but the callback never
     * runs. This is the bug that shipped in the previous revision of
     * this file.
     */
    function _confirm(message, onConfirm) {
        return window.confirmDialog(message, 'Confirm', onConfirm);
    }

    function _ageOf(character) {
        if (!character) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    // =========================================================================
    // 3. PERSISTENCE HELPER
    // =========================================================================
    //
    // Runs ApprenticeshipCommands.persist() and toasts a warning if the
    // disk write failed. The in-memory write is already done; this only
    // reports whether it reached storage. Never rolls back.
    //
    // Mirrors modals-roles.js's _persistAndWarn. See PERSISTENCE in the
    // module header for the rationale.

    function _persistAndWarn(successMessage) {
        var persistResult = C.persist();
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

    // =========================================================================
    // 4. PRESENTATION HELPERS
    // =========================================================================

    function _personLine(char) {
        if (!char) return 'Unknown';
        var name = ((char.name || '') + ' ' + (char.surname || '')).trim();
        return _getIcon('PERSON') + ' ' + _escapeHtml(name);
    }

    function _statusBadge(status) {
        var color;
        if (status === STATUS.ONGOING)        color = 'var(--success, #2d7a3e)';
        else if (status === STATUS.COMPLETED) color = 'var(--accent, #4a6fa5)';
        else                                   color = 'var(--danger, #8a2020)';
        return '<span style="font-size:0.55rem;background:' + color +
               ';padding:2px 8px;border-radius:10px;color:white;">' +
               _escapeHtml(String(status || '').toUpperCase()) + '</span>';
    }

    function _displayName(char) {
        if (!char) return '';
        return ((char.name || '') + ' ' + (char.surname || '')).trim();
    }

    // =========================================================================
    // 5. CREATE MODAL
    // =========================================================================

    function openCreateApprenticeshipModal(master, candidate, onSuccess) {
        if (!master || !candidate) {
            _showToast('Master and candidate are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var masterAge = _ageOf(master);
        var candidateAge = _ageOf(candidate);

        var teachable = Q.getTeachableSkills(master.id);
        var skillOptions = '';
        if (teachable.length === 0) {
            skillOptions =
                '<option value="">No teachable skills (master needs ' +
                TEACH.MIN_MASTER_SKILL + '+ skill)</option>';
        } else {
            for (var i = 0; i < teachable.length; i++) {
                var s = teachable[i];
                skillOptions += '<option value="' + _escapeHtml(s.id) + '">' +
                    _escapeHtml(s.name) + ' (Skill: ' + s.skillLevel + ')</option>';
            }
        }

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
              '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.55rem;color:var(--accent);">Master</div>' +
                '<div style="font-weight:bold;font-size:0.9rem;">' + _personLine(master) + '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                  (masterAge != null ? masterAge + ' years' : '') +
                  ' · ' + _escapeHtml(_getCurrentLocation(master) || 'Unknown') +
                '</div>' +
              '</div>' +
              '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.55rem;color:var(--accent);">Candidate</div>' +
                '<div style="font-weight:bold;font-size:0.9rem;">' + _personLine(candidate) + '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                  (candidateAge != null ? candidateAge + ' years' : '') +
                  ' · ' + _escapeHtml(_getCurrentLocation(candidate) || 'Unknown') +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
              '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Profession to Learn</label>' +
              '<select id="appRoleSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                skillOptions +
              '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
              '<div class="form-group">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="appStartYear" value="' + currentYear + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
              '</div>' +
              '<div class="form-group">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Initial Skill (0-100)</label>' +
                '<input type="number" id="appInitialSkill" value="' + TEACH.DEFAULT_INITIAL_SKILL + '" min="0" max="100" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
              '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
              '<textarea id="appNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;" placeholder="Terms of apprenticeship..."></textarea>' +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
              _getIcon('CIRCLE_DOT') + ' Master must have skill ' + TEACH.MIN_MASTER_SKILL + '+ in the chosen profession.' +
            '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Create Apprenticeship: ' + _escapeHtml(master.name) + ' → ' + _escapeHtml(candidate.name),
            contentHtml: content,
            confirmText: 'Create Apprenticeship',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var roleId = modalEl.querySelector('#appRoleSelect').value;
                if (!roleId) { _showToast('Please select a profession', 'error'); return false; }

                var startYear = parseInt(modalEl.querySelector('#appStartYear').value, 10);
                if (!isFinite(startYear)) { _showToast('Invalid start year', 'error'); return false; }

                var initialSkill = parseInt(modalEl.querySelector('#appInitialSkill').value, 10);
                if (!R.isSkillInRange(initialSkill)) {
                    _showToast('Skill must be 0-100', 'error'); return false;
                }

                var notes = modalEl.querySelector('#appNotes').value;

                var result = C.createApprenticeship({
                    masterId: master.id,
                    apprenticeId: candidate.id,
                    roleId: roleId,
                    startYear: startYear,
                    initialSkill: initialSkill,
                    notes: notes
                });

                if (result.success) {
                    _persistAndWarn('Apprenticeship created');
                    _closeTopModal();
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }
                _showToast('Failed: ' + (result.reason || result.code), 'error');
                return false;
            }
        });
    }

    // =========================================================================
    // 6. EDIT MODAL
    // =========================================================================

    function openEditApprenticeshipModal(masterId, apprenticeId, roleId, onSuccess) {
        if (!roleId) {
            _showToast('roleId is required', 'error');
            return;
        }

        var details = Q.getApprenticeshipDetails(masterId, apprenticeId, roleId);
        if (!details) { _showToast('Apprenticeship not found', 'error'); return; }

        var canComplete = R.canComplete({
            status: details.status,
            skillLevel: details.skillLevel
        });

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="font-weight:bold;">' + _escapeHtml(details.apprenticeName) + '</div>' +
              '<div style="font-size:0.6rem;color:var(--dim);">' +
                'Apprentice to ' + _escapeHtml(details.masterName) +
                ' · ' + _escapeHtml(details.roleName) +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
              '<div class="form-group">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="editStartYear" value="' +
                  (details.startYear != null ? details.startYear : '') +
                  '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
              '</div>' +
              '<div class="form-group">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Skill Level (0-100)</label>' +
                '<input type="number" id="editSkillLevel" value="' + details.skillLevel + '" min="0" max="100" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
              '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
              '<textarea id="editNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                _escapeHtml(details.notes) +
              '</textarea>' +
            '</div>' +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button type="button" id="progressSkillBtn" class="btn primary" style="font-size:0.6rem;padding:4px 12px;">+' +
                TEACH.DEFAULT_PROGRESS_GAIN + ' Skill</button>' +
              (canComplete.valid
                ? '<button type="button" id="completeBtn" class="btn success" style="font-size:0.6rem;padding:4px 12px;">Complete</button>'
                : '<button type="button" class="btn" disabled style="font-size:0.6rem;padding:4px 12px;opacity:0.5;" title="' +
                    _escapeHtml(canComplete.reason || '') + '">Complete</button>') +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);margin-top:12px;">' +
              'Completion requires skill ' + TEACH.COMPLETION_SKILL + '+.' +
            '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Edit Apprenticeship',
            contentHtml: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                // Quick-action: progress
                var progressBtn = modalEl.querySelector('#progressSkillBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function () {
                        var result = C.progressApprenticeship(
                            masterId, apprenticeId, TEACH.DEFAULT_PROGRESS_GAIN
                        );
                        if (result.success) {
                            _persistAndWarn(null);
                            _showToast('Progressed by ' + result.data.gained, 'success');
                            var input = modalEl.querySelector('#editSkillLevel');
                            if (input) input.value = result.data.newSkill;
                        } else {
                            _showToast('Failed: ' + (result.reason || result.code), 'error');
                        }
                    });
                }

                // Quick-action: complete
                var completeBtn = modalEl.querySelector('#completeBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function () {
                        _confirm('Complete this apprenticeship?', function () {
                            var result = C.completeApprenticeship(masterId, apprenticeId, roleId);
                            if (result.success) {
                                _persistAndWarn('Apprenticeship completed');
                                _closeTopModal();
                                if (typeof onSuccess === 'function') onSuccess(result.data);
                            } else {
                                _showToast('Failed: ' + (result.reason || result.code), 'error');
                            }
                        });
                    });
                }
            },
            onConfirm: function (modalEl) {
                var skillLevel = parseInt(modalEl.querySelector('#editSkillLevel').value, 10);
                if (!R.isSkillInRange(skillLevel)) {
                    _showToast('Skill must be 0-100', 'error'); return false;
                }

                var notes = modalEl.querySelector('#editNotes').value;

                var result = C.updateApprenticeship(masterId, apprenticeId, {
                    roleId: roleId,
                    skillLevel: skillLevel,
                    notes: notes
                });

                if (result.success) {
                    _persistAndWarn('Apprenticeship updated');
                    _closeTopModal();
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }
                _showToast('Failed: ' + (result.reason || result.code), 'error');
                return false;
            }
        });
    }

    // =========================================================================
    // 7. DETAILS MODAL
    // =========================================================================

    function openApprenticeshipDetailsModal(masterId, apprenticeId, roleId, onClose) {
        if (!roleId) {
            _showToast('roleId is required', 'error');
            return;
        }

        var details = Q.getApprenticeshipDetails(masterId, apprenticeId, roleId);
        if (!details) { _showToast('Apprenticeship not found', 'error'); return; }

        var canComplete = R.canComplete({
            status: details.status,
            skillLevel: details.skillLevel
        });

        var isOngoing = details.status === STATUS.ONGOING;

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                  '<div style="font-weight:bold;">' + _escapeHtml(details.apprenticeName) + '</div>' +
                  '<div style="font-size:0.6rem;color:var(--dim);">Apprentice to ' +
                    _escapeHtml(details.masterName) + '</div>' +
                '</div>' +
                _statusBadge(details.status) +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
              '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Profession</div>' +
                '<div style="font-size:0.8rem;font-weight:bold;">' + _escapeHtml(details.roleName) + '</div>' +
              '</div>' +
              '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Skill</div>' +
                '<div style="font-size:0.8rem;font-weight:bold;">' + details.skillLevel +
                  ' <span style="color:var(--accent);">(' + _escapeHtml(details.stage.name) + ')</span></div>' +
              '</div>' +
              '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Started</div>' +
                '<div style="font-size:0.8rem;">' +
                  (details.startYear != null ? details.startYear : '—') +
                '</div>' +
              '</div>' +
              '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Duration</div>' +
                '<div style="font-size:0.8rem;">' +
                  (details.durationYears != null ? details.durationYears + ' years' : '—') +
                '</div>' +
              '</div>' +
            '</div>' +

            (details.notes
              ? '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                  '<div style="color:var(--dim);font-size:0.55rem;">Notes</div>' +
                  _escapeHtml(details.notes) +
                '</div>'
              : '') +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button type="button" id="editAppBtn" class="btn primary" style="font-size:0.6rem;padding:4px 12px;">Edit</button>' +
              (isOngoing
                ? '<button type="button" id="progressBtn" class="btn" style="font-size:0.6rem;padding:4px 12px;">+' +
                    TEACH.DEFAULT_PROGRESS_GAIN + ' Skill</button>'
                : '') +
              (isOngoing && canComplete.valid
                ? '<button type="button" id="completeAppBtn" class="btn success" style="font-size:0.6rem;padding:4px 12px;">Complete</button>'
                : '') +
              (isOngoing
                ? '<button type="button" id="terminateAppBtn" class="btn danger" style="font-size:0.6rem;padding:4px 12px;">Terminate</button>'
                : '') +
            '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Apprenticeship Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function (modalEl) {
                // Edit
                var editBtn = modalEl.querySelector('#editAppBtn');
                if (editBtn) {
                    editBtn.addEventListener('click', function () {
                        _closeTopModal();
                        openEditApprenticeshipModal(
                            masterId, apprenticeId, roleId,
                            function (data) {
                                if (typeof onClose === 'function') onClose(data);
                            }
                        );
                    });
                }

                // Progress
                var progressBtn = modalEl.querySelector('#progressBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function () {
                        var result = C.progressApprenticeship(
                            masterId, apprenticeId, TEACH.DEFAULT_PROGRESS_GAIN
                        );
                        if (result.success) {
                            _persistAndWarn(null);
                            _showToast('Progressed by ' + result.data.gained, 'success');
                            _closeTopModal();
                            openApprenticeshipDetailsModal(
                                masterId, apprenticeId, roleId, onClose
                            );
                        } else {
                            _showToast('Failed: ' + (result.reason || result.code), 'error');
                        }
                    });
                }

                // Complete
                var completeBtn = modalEl.querySelector('#completeAppBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function () {
                        _confirm('Complete this apprenticeship?', function () {
                            var result = C.completeApprenticeship(
                                masterId, apprenticeId, roleId
                            );
                            if (result.success) {
                                _persistAndWarn('Completed');
                                _closeTopModal();
                                if (typeof onClose === 'function') onClose(result.data);
                            } else {
                                _showToast('Failed: ' + (result.reason || result.code), 'error');
                            }
                        });
                    });
                }

                // Terminate — requires roleId
                var terminateBtn = modalEl.querySelector('#terminateAppBtn');
                if (terminateBtn) {
                    terminateBtn.addEventListener('click', function () {
                        _confirm('Terminate this apprenticeship?', function () {
                            var result = C.terminateApprenticeship(
                                masterId, apprenticeId, roleId, 'Terminated by user'
                            );
                            if (result.success) {
                                _persistAndWarn(null);
                                _showToast('Terminated', 'info');
                                _closeTopModal();
                                if (typeof onClose === 'function') onClose(result.data);
                            } else {
                                _showToast('Failed: ' + (result.reason || result.code), 'error');
                            }
                        });
                    });
                }
            },
            onConfirm: function () {
                if (typeof onClose === 'function') onClose();
            }
        });
    }

    // =========================================================================
    // 8. MASTER TREE MODAL
    // =========================================================================

    function openViewMasterTreeModal(masterId, onClose) {
        var master = _getCharacterById(masterId);
        if (!master) { _showToast('Master not found', 'error'); return; }

        var apprentices = Q.getApprentices(masterId, false);

        var content = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';
        content +=
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="font-weight:bold;">' + _getIcon('CROWN') + ' ' +
                _escapeHtml(_displayName(master)) + '</div>' +
              '<div style="font-size:0.6rem;color:var(--dim);">' +
                apprentices.length + ' apprentice(s)</div>' +
            '</div>';

        if (apprentices.length === 0) {
            content += '<div style="text-align:center;padding:20px;color:var(--dim);">No apprentices</div>';
        } else {
            content += '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < apprentices.length; i++) {
                var a = apprentices[i];
                content +=
                    '<div class="apprentice-item" data-master-id="' + _escapeHtml(masterId) +
                    '" data-apprentice-id="' + _escapeHtml(a.apprenticeId) +
                    '" data-role-id="' + _escapeHtml(a.roleId || '') +
                    '" style="background:var(--bg3);border:1px solid var(--border);' +
                    'border-radius:6px;padding:8px 12px;cursor:pointer;">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<div>' +
                          '<span>' + _escapeHtml(a.apprenticeName) + '</span>' +
                          '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
                            _escapeHtml(a.roleName) + '</span>' +
                        '</div>' +
                        '<div style="display:flex;gap:8px;align-items:center;">' +
                          '<span style="font-size:0.55rem;">Skill: ' + a.skillLevel + '</span>' +
                          _statusBadge(a.status) +
                        '</div>' +
                      '</div>' +
                    '</div>';
            }
            content += '</div>';
        }
        content += '</div>';

        _openModal({
            titleHtml: 'Master Tree: ' + _escapeHtml(master.name),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function (modalEl) {
                // Scoped to the modal element — no global querySelectorAll.
                var items = modalEl.querySelectorAll('.apprentice-item');
                for (var j = 0; j < items.length; j++) {
                    (function (el) {
                        el.addEventListener('click', function () {
                            var masterIdAttr = el.dataset.masterId;
                            var apprenticeIdAttr = el.dataset.apprenticeId;
                            var roleIdAttr = el.dataset.roleId;
                            _closeTopModal();
                            openApprenticeshipDetailsModal(
                                masterIdAttr,
                                apprenticeIdAttr,
                                roleIdAttr,
                                onClose
                            );
                        });
                    })(items[j]);
                }
            },
            onConfirm: function () { if (typeof onClose === 'function') onClose(); }
        });
    }

    // =========================================================================
    // 9. FIND MASTER BY LOCATION MODAL
    // =========================================================================

    function openFindMasterByLocationModal(locationId, roleId, onSelect) {
        var place = _getPlaceById(locationId);
        if (!place) { _showToast('Location not found', 'error'); return; }

        var masters = Q.findPotentialMasters(
            roleId, locationId, TEACH.MIN_MASTER_SKILL
        );
        if (!masters || masters.length === 0) {
            _showToast('No masters found in ' + place.displayName, 'info');
            return;
        }

        var content = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';
        content +=
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="font-size:0.65rem;color:var(--dim);">' +
                _getIcon('LOCATION') + ' ' + _escapeHtml(place.displayName) +
              '</div>' +
              '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                masters.length + ' master(s) available</div>' +
            '</div>';

        for (var i = 0; i < masters.length; i++) {
            var m = masters[i];
            var char = m.character;
            if (!char) continue;
            var age = _ageOf(char);

            content +=
                '<div class="master-item" data-char-id="' + _escapeHtml(char.id) + '" ' +
                'style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;' +
                'padding:10px 12px;margin-bottom:6px;cursor:pointer;">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<div>' +
                      '<strong>' + _escapeHtml(_displayName(char)) + '</strong>' +
                      '<span style="font-size:0.6rem;color:var(--dim);margin-left:8px;">' +
                        (age != null ? age + ' years' : '') + '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                      _getIcon('PERSON') + ' ' + (m.apprenticeCount || 0) + ' apprentice(s)' +
                    '</div>' +
                  '</div>' +
                '</div>';
        }
        content += '</div>';

        _openModal({
            titleHtml: 'Find Masters',
            contentHtml: content,
            confirmText: 'Cancel',
            cancelText: '',
            onMount: function (modalEl) {
                // Scoped to the modal element — no global querySelectorAll.
                var items = modalEl.querySelectorAll('.master-item');
                for (var j = 0; j < items.length; j++) {
                    (function (el) {
                        el.addEventListener('click', function () {
                            var charId = el.dataset.charId;
                            var char = _getCharacterById(charId);
                            if (char && typeof onSelect === 'function') {
                                _closeTopModal();
                                onSelect(char);
                            }
                        });
                    })(items[j]);
                }
            },
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openCreateApprenticeshipModal   = openCreateApprenticeshipModal;
    window.openEditApprenticeshipModal     = openEditApprenticeshipModal;
    window.openApprenticeshipDetailsModal  = openApprenticeshipDetailsModal;
    window.openViewMasterTreeModal         = openViewMasterTreeModal;
    window.openFindMasterByLocationModal   = openFindMasterByLocationModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateApprenticeshipModal: openCreateApprenticeshipModal,
            openEditApprenticeshipModal: openEditApprenticeshipModal,
            openApprenticeshipDetailsModal: openApprenticeshipDetailsModal,
            openViewMasterTreeModal: openViewMasterTreeModal,
            openFindMasterByLocationModal: openFindMasterByLocationModal
        };
    }
})();
