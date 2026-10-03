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
 *   - Display results
 *
 * NO direct relationship.metadata access.
 * NO fallback dependencies.
 * NO policy decisions (thresholds come from Rules).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CORE DEPENDENCIES (fail loudly)
    // =========================================================================

    function _dep(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-apprenticeship: missing ' + name);
        }
        return fn;
    }

    var _openModal       = function (o) { return _dep('openModal', window.openModal)(o); };
    var _closeTopModal   = function ()   { return _dep('closeTopModal', window.closeTopModal)(); };
    var _escapeHtml      = function (s)  { return _dep('_escapeHtml', window._escapeHtml)(s); };
    var _showToast       = function (m,t){ return _dep('_showToast', window._showToast)(m,t); };
    var _getIcon         = function (n)  { return _dep('_getIcon', window._getIcon)(n); };
    var _confirmDialog   = function (m,t,cb) { return _dep('_confirmDialog', window._confirmDialog)(m,t,cb); };

    // =========================================================================
    // 2. DOMAIN DEPENDENCIES (fail loudly)
    // =========================================================================

    function _getCharacterById(id) { return _dep('getCharacterById', window.getCharacterById)(id); }
    function _getCurrentLocation(c) {
        return _dep('getCurrentLocation', window.getCurrentLocation)(c);
    }
    function _getCurrentYear() {
        return _dep('getCurrentYearSafe', window.getCurrentYearSafe)();
    }
    function _calculateAge(b, d, y) {
        return _dep('calculateAge', window.calculateAge)(b, d, y);
    }
    function _getPlaceById(id) { return _dep('getPlaceById', window.getPlaceById)(id); }

    // =========================================================================
    // 3. QUERY / COMMAND SHORTHANDS
    // =========================================================================

    var Q = window.ApprenticeshipQueries;
    var C = window.ApprenticeshipCommands;
    var R = window.ApprenticeshipRules;
    var STAGES = window.APPRENTICESHIP_STAGES;

    // =========================================================================
    // 4. HELPERS
    // =========================================================================

    function _personLine(char) {
        if (!char) return 'Unknown';
        var name = char.name + ' ' + (char.surname || '');
        return _getIcon('PERSON') + ' ' + _escapeHtml(name.trim());
    }

    function _statusBadge(status) {
        var color = status === 'ongoing'   ? 'var(--success)'
                  : status === 'completed' ? 'var(--accent)'
                  : 'var(--danger)';
        return '<span style="font-size:0.55rem;background:' + color +
               ';padding:2px 8px;border-radius:10px;color:white;">' +
               _escapeHtml(status.toUpperCase()) + '</span>';
    }

    // =========================================================================
    // 5. CREATE
    // =========================================================================

    function openCreateApprenticeshipModal(master, candidate, onSuccess) {
        if (!master || !candidate) {
            _showToast('Master and candidate are required', 'error');
            return;
        }

        var currentYear = _getCurrentYear();
        var masterAge = _calculateAge(master.birthYear, false, null);
        var candidateAge = _calculateAge(candidate.birthYear, false, null);

        var teachable = Q.getTeachableSkills(master.id);
        var skillOptions = '';
        if (teachable.length === 0) {
            skillOptions = '<option value="">No teachable skills (master needs 51+ skill)</option>';
        } else {
            for (var i = 0; i < teachable.length; i++) {
                var s = teachable[i];
                skillOptions += '<option value="' + s.id + '">' +
                    _escapeHtml(s.name) + ' (Skill: ' + s.skillLevel + ')</option>';
            }
        }

        var minSkill = window.TEACHING_CONSTANTS.MIN_MASTER_SKILL;

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
              '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.55rem;color:var(--accent);">Master</div>' +
                '<div style="font-weight:bold;font-size:0.9rem;">' + _personLine(master) + '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' + masterAge + ' years · ' +
                  _escapeHtml(_getCurrentLocation(master)) + '</div>' +
              '</div>' +
              '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.55rem;color:var(--accent);">Candidate</div>' +
                '<div style="font-weight:bold;font-size:0.9rem;">' + _personLine(candidate) + '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' + candidateAge + ' years · ' +
                  _escapeHtml(_getCurrentLocation(candidate)) + '</div>' +
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
                '<input type="number" id="appInitialSkill" value="' + window.TEACHING_CONSTANTS.DEFAULT_INITIAL_SKILL + '" min="0" max="100" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
              '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
              '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
              '<textarea id="appNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;" placeholder="Terms of apprenticeship..."></textarea>' +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
              _getIcon('CIRCLE_DOT') + ' Master must have skill ' + minSkill + '+ in the chosen profession.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Create Apprenticeship: ' + master.name + ' → ' + candidate.name,
            content: content,
            confirmText: 'Create Apprenticeship',
            cancelText: 'Cancel',
            onConfirm: function () {
                var roleId = document.getElementById('appRoleSelect').value;
                if (!roleId) { _showToast('Please select a profession', 'error'); return false; }

                var startYear = parseInt(document.getElementById('appStartYear').value, 10);
                if (!isFinite(startYear)) { _showToast('Invalid start year', 'error'); return false; }

                var initialSkill = parseInt(document.getElementById('appInitialSkill').value, 10);
                if (!R.isSkillInRange(initialSkill)) {
                    _showToast('Skill must be 0-100', 'error'); return false;
                }

                var notes = document.getElementById('appNotes').value;

                var result = C.createApprenticeship({
                    masterId: master.id,
                    apprenticeId: candidate.id,
                    roleId: roleId,
                    startYear: startYear,
                    initialSkill: initialSkill,
                    notes: notes
                });

                if (result.success) {
                    _showToast('Apprenticeship created', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                }
                _showToast('Failed: ' + result.reason, 'error');
                return false;
            }
        });
    }

    // =========================================================================
    // 6. EDIT
    // =========================================================================

    function openEditApprenticeshipModal(masterId, apprenticeId, roleId, onSuccess) {
        var details = Q.getApprenticeshipDetails(masterId, apprenticeId, roleId);
        if (!details) { _showToast('Apprenticeship not found', 'error'); return; }

        var canComplete = R.canComplete({ status: details.status, skillLevel: details.skillLevel });

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="font-weight:bold;">' + _escapeHtml(details.apprenticeName) + '</div>' +
              '<div style="font-size:0.6rem;color:var(--dim);">' +
                'Apprentice to ' + _escapeHtml(details.masterName) + ' · ' + _escapeHtml(details.roleName) +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
              '<div class="form-group">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="editStartYear" value="' + (details.startYear || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
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
              '<button id="progressSkillBtn" class="btn primary" style="font-size:0.6rem;padding:4px 12px;">+5 Skill</button>' +
              (canComplete.valid
                ? '<button id="completeBtn" class="btn success" style="font-size:0.6rem;padding:4px 12px;">Complete</button>'
                : '<button class="btn" disabled style="font-size:0.6rem;padding:4px 12px;opacity:0.5;" title="' +
                    _escapeHtml(canComplete.reason || '') + '">Complete</button>') +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);margin-top:12px;">' +
              'Completion requires skill ' + window.TEACHING_CONSTANTS.COMPLETION_SKILL + '+.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Edit Apprenticeship',
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function () {
                var startYear = parseInt(document.getElementById('editStartYear').value, 10);
                if (!isFinite(startYear)) { _showToast('Invalid start year', 'error'); return false; }

                var skillLevel = parseInt(document.getElementById('editSkillLevel').value, 10);
                if (!R.isSkillInRange(skillLevel)) {
                    _showToast('Skill must be 0-100', 'error'); return false;
                }

                var notes = document.getElementById('editNotes').value;

                var result = C.updateApprenticeship(masterId, apprenticeId, {
                    roleId: details.roleId,
                    startYear: startYear,
                    skillLevel: skillLevel,
                    notes: notes
                });

                if (result.success) {
                    _showToast('Apprenticeship updated', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                }
                _showToast('Failed: ' + result.reason, 'error');
                return false;
            }
        });

        // Bind quick-action buttons (DOM is synchronous with our openModal)
        var progressBtn = document.getElementById('progressSkillBtn');
        if (progressBtn) {
            progressBtn.addEventListener('click', function () {
                var result = C.progressApprenticeship(masterId, apprenticeId, 5);
                if (result.success) {
                    _showToast('Progressed by ' + result.data.gained, 'success');
                    var input = document.getElementById('editSkillLevel');
                    if (input) input.value = result.data.newSkill;
                } else {
                    _showToast('Failed: ' + result.reason, 'error');
                }
            });
        }

        var completeBtn = document.getElementById('completeBtn');
        if (completeBtn) {
            completeBtn.addEventListener('click', function () {
                _confirmDialog(
                    'Complete this apprenticeship?',
                    'Complete Apprenticeship',
                    function () {
                        var result = C.completeApprenticeship(masterId, apprenticeId, details.roleId);
                        if (result.success) {
                            _showToast('Apprenticeship completed', 'success');
                            _closeTopModal();
                            if (onSuccess) onSuccess(result.data);
                        } else {
                            _showToast('Failed: ' + result.reason, 'error');
                        }
                    }
                );
            });
        }
    }

    // =========================================================================
    // 7. DETAILS
    // =========================================================================

    function openApprenticeshipDetailsModal(masterId, apprenticeId, roleId, onClose) {
        var details = Q.getApprenticeshipDetails(masterId, apprenticeId, roleId);
        if (!details) { _showToast('Apprenticeship not found', 'error'); return; }

        var canComplete = R.canComplete({ status: details.status, skillLevel: details.skillLevel });

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
                '<div style="font-size:0.8rem;">' + (details.startYear != null ? details.startYear : '—') + '</div>' +
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
              '<button id="editAppBtn" class="btn primary" style="font-size:0.6rem;padding:4px 12px;">Edit</button>' +
              '<button id="progressBtn" class="btn" style="font-size:0.6rem;padding:4px 12px;">+5 Skill</button>' +
              (details.status === 'ongoing' && canComplete.valid
                ? '<button id="completeAppBtn" class="btn success" style="font-size:0.6rem;padding:4px 12px;">Complete</button>'
                : '') +
              (details.status === 'ongoing'
                ? '<button id="terminateAppBtn" class="btn danger" style="font-size:0.6rem;padding:4px 12px;">Terminate</button>'
                : '') +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Apprenticeship Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {
                if (onClose) onClose();
            }
        });

        var editBtn = document.getElementById('editAppBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                _closeTopModal();
                openEditApprenticeshipModal(masterId, apprenticeId, details.roleId, onClose);
            });
        }

        var progressBtn = document.getElementById('progressBtn');
        if (progressBtn) {
            progressBtn.addEventListener('click', function () {
                var result = C.progressApprenticeship(masterId, apprenticeId, 5);
                if (result.success) {
                    _showToast('Progressed by ' + result.data.gained, 'success');
                    _closeTopModal();
                    openApprenticeshipDetailsModal(masterId, apprenticeId, details.roleId, onClose);
                } else {
                    _showToast('Failed: ' + result.reason, 'error');
                }
            });
        }

        var completeBtn = document.getElementById('completeAppBtn');
        if (completeBtn) {
            completeBtn.addEventListener('click', function () {
                _confirmDialog(
                    'Complete this apprenticeship?',
                    'Complete Apprenticeship',
                    function () {
                        var result = C.completeApprenticeship(masterId, apprenticeId, details.roleId);
                        if (result.success) {
                            _showToast('Completed', 'success');
                            _closeTopModal();
                            if (onClose) onClose(result.data);
                        } else {
                            _showToast('Failed: ' + result.reason, 'error');
                        }
                    }
                );
            });
        }

        var terminateBtn = document.getElementById('terminateAppBtn');
        if (terminateBtn) {
            terminateBtn.addEventListener('click', function () {
                _confirmDialog(
                    'Terminate this apprenticeship?',
                    'Terminate Apprenticeship',
                    function () {
                        var result = C.terminateApprenticeship(masterId, apprenticeId, 'Terminated by user');
                        if (result.success) {
                            _showToast('Terminated', 'info');
                            _closeTopModal();
                            if (onClose) onClose(result.data);
                        } else {
                            _showToast('Failed: ' + result.reason, 'error');
                        }
                    }
                );
            });
        }
    }

    // =========================================================================
    // 8. MASTER TREE
    // =========================================================================

    function openViewMasterTreeModal(masterId, onClose) {
        var master = _getCharacterById(masterId);
        if (!master) { _showToast('Master not found', 'error'); return; }

        var apprentices = Q.getApprentices(masterId, false);

        var content = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';
        content +=
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
              '<div style="font-weight:bold;">' + _getIcon('CROWN') + ' ' +
                _escapeHtml((master.name + ' ' + (master.surname || '')).trim()) + '</div>' +
              '<div style="font-size:0.6rem;color:var(--dim);">' + apprentices.length + ' apprentices</div>' +
            '</div>';

        if (apprentices.length === 0) {
            content += '<div style="text-align:center;padding:20px;color:var(--dim);">No apprentices</div>';
        } else {
            content += '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < apprentices.length; i++) {
                var a = apprentices[i];
                content +=
                    '<div class="apprentice-item" data-master-id="' + masterId +
                    '" data-apprentice-id="' + a.apprenticeId +
                    '" data-role-id="' + a.roleId +
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
            title: 'Master Tree: ' + master.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { if (onClose) onClose(); }
        });

        var items = document.querySelectorAll('.apprentice-item');
        for (var j = 0; j < items.length; j++) {
            (function (el) {
                el.addEventListener('click', function () {
                    _closeTopModal();
                    openApprenticeshipDetailsModal(
                        this.dataset.masterId,
                        this.dataset.apprenticeId,
                        this.dataset.roleId,
                        onClose
                    );
                });
            })(items[j]);
        }
    }

    // =========================================================================
    // 9. FIND MASTER BY LOCATION
    // =========================================================================

    function openFindMasterByLocationModal(locationId, roleId, onSelect) {
        var place = _getPlaceById(locationId);
        if (!place) { _showToast('Location not found', 'error'); return; }

        var masters = Q.findPotentialMasters(roleId, locationId, window.TEACHING_CONSTANTS.MIN_MASTER_SKILL);
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
                masters.length + ' masters available</div>' +
            '</div>';

        for (var i = 0; i < masters.length; i++) {
            var m = masters[i];
            var char = m.character;
            if (!char) continue;
            var age = _calculateAge(char.birthYear, false, null);

            content +=
                '<div class="master-item" data-char-id="' + char.id + '" ' +
                'style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;' +
                'padding:10px 12px;margin-bottom:6px;cursor:pointer;">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<div>' +
                      '<strong>' + _escapeHtml((char.name + ' ' + (char.surname || '')).trim()) + '</strong>' +
                      '<span style="font-size:0.6rem;color:var(--dim);margin-left:8px;">' +
                        (age != null ? age + ' years' : '') + '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                      _getIcon('PERSON') + ' ' + (m.apprenticeCount || 0) + ' apprentices' +
                    '</div>' +
                  '</div>' +
                '</div>';
        }
        content += '</div>';

        _openModal({
            title: 'Find Masters',
            content: content,
            confirmText: 'Cancel',
            cancelText: '',
            onConfirm: function () {}
        });

        var items = document.querySelectorAll('.master-item');
        for (var j = 0; j < items.length; j++) {
            (function (el) {
                el.addEventListener('click', function () {
                    var charId = this.dataset.charId;
                    var char = _getCharacterById(charId);
                    if (char && onSelect) {
                        _closeTopModal();
                        onSelect(char);
                    }
                });
            })(items[j]);
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openCreateApprenticeshipModal = openCreateApprenticeshipModal;
    window.openEditApprenticeshipModal = openEditApprenticeshipModal;
    window.openApprenticeshipDetailsModal = openApprenticeshipDetailsModal;
    window.openViewMasterTreeModal = openViewMasterTreeModal;
    window.openFindMasterByLocationModal = openFindMasterByLocationModal;

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
