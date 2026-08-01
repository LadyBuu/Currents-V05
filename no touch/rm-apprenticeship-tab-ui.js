/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP MODALS (modals-apprenticeship.js)
 * =============================================================================
 * 
 * This file contains ALL apprenticeship-related UI modals:
 * - Create Apprenticeship
 * - Edit Apprenticeship
 * - Apprenticeship Details
 * - View Master Tree
 * - FIND MASTER BY LOCATION (NEW)
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - apprenticeship-system.js (all apprenticeship functions)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 *   - constants.js (AGE_GROUPS, AGE_GROUPS_MAP)
 *   - world.js (getCurrentLocation, getLocationTypeById)
 *   - households/ (Household management functions)
 * 
 * ICON POLICY: ALL icons from icons.js via _getIcon() - NO EMOJIS
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;
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
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
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
        return null;
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
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRoleById(id) {
        return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _getCurrentLocationId(character) {
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(character.id);
        }
        return null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getSettlementMastersByRole(locationId, roleId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementMastersByRole) {
            return SettlementQueries.getSettlementMastersByRole(locationId, roleId);
        }
        return [];
    }

    function _openCharacterSelector(options) {
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    // =========================================================================
    // 4. APPRENTICESHIP SYSTEM WRAPPERS
    // =========================================================================

    function _getMaster(charId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getMaster(charId);
        }
        if (typeof window.getMaster === 'function') {
            return window.getMaster(charId);
        }
        return null;
    }

    function _getApprentices(masterId, activeOnly) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getApprentices(masterId, activeOnly);
        }
        if (typeof window.getApprentices === 'function') {
            return window.getApprentices(masterId, activeOnly);
        }
        return [];
    }

    function _isApprentice(charId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.isApprentice(charId);
        }
        if (typeof window.isApprentice === 'function') {
            return window.isApprentice(charId);
        }
        return false;
    }

    function _isMaster(charId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.isMaster(charId);
        }
        if (typeof window.isMaster === 'function') {
            return window.isMaster(charId);
        }
        return false;
    }

    function _getSkillLevel(charId, roleId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getSkillLevel(charId, roleId);
        }
        if (typeof window.getSkillLevel === 'function') {
            return window.getSkillLevel(charId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getApprenticeshipRole(charId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getApprenticeshipRole(charId);
        }
        if (typeof window.getApprenticeshipRole === 'function') {
            return window.getApprenticeshipRole(charId);
        }
        return null;
    }

    function _getApprenticeship(masterId, apprenticeId) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getApprenticeship(masterId, apprenticeId);
        }
        if (typeof window.getApprenticeship === 'function') {
            return window.getApprenticeship(masterId, apprenticeId);
        }
        return null;
    }

    function _createApprenticeship(masterId, apprenticeId, options) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.createApprenticeship(masterId, apprenticeId, options);
        }
        if (typeof window.createApprenticeship === 'function') {
            return window.createApprenticeship(masterId, apprenticeId, options);
        }
        return null;
    }

    function _updateApprenticeship(masterId, apprenticeId, updates) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.updateApprenticeship(masterId, apprenticeId, updates);
        }
        if (typeof window.updateApprenticeship === 'function') {
            return window.updateApprenticeship(masterId, apprenticeId, updates);
        }
        return null;
    }

    function _progressApprenticeship(masterId, apprenticeId, amount) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.progressApprenticeship(masterId, apprenticeId, amount);
        }
        if (typeof window.progressApprenticeship === 'function') {
            return window.progressApprenticeship(masterId, apprenticeId, amount);
        }
        return null;
    }

    function _completeApprenticeship(masterId, apprenticeId, finalSkillLevel) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.completeApprenticeship(masterId, apprenticeId, finalSkillLevel);
        }
        if (typeof window.completeApprenticeship === 'function') {
            return window.completeApprenticeship(masterId, apprenticeId, finalSkillLevel);
        }
        return null;
    }

    function _terminateApprenticeship(masterId, apprenticeId, reason) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.terminateApprenticeship(masterId, apprenticeId, reason);
        }
        if (typeof window.terminateApprenticeship === 'function') {
            return window.terminateApprenticeship(masterId, apprenticeId, reason);
        }
        return null;
    }

    function _getTeachableSkills(masterId, minSkillLevel) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.getTeachableSkills(masterId, minSkillLevel);
        }
        if (typeof window.getTeachableSkills === 'function') {
            return window.getTeachableSkills(masterId, minSkillLevel);
        }
        return [];
    }

    function _findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        if (typeof window.findPotentialMasters === 'function') {
            return window.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        return [];
    }

    function _teachSkill(masterId, apprenticeId, method) {
        if (typeof window.ApprenticeshipSystem !== 'undefined') {
            return window.ApprenticeshipSystem.teachSkill(masterId, apprenticeId, method);
        }
        if (typeof window.teachSkill === 'function') {
            return window.teachSkill(masterId, apprenticeId, method);
        }
        return null;
    }

    // =========================================================================
    // 5. CREATE APPRENTICESHIP MODAL
    // =========================================================================

    function openCreateApprenticeshipModal(master, candidate, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            if (!master || !candidate) {
                _showToast('Master and candidate are required', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var masterAge = _calculateAge(master.birthYear, false, null);
            var candidateAge = _calculateAge(candidate.birthYear, false, null);

            var teachableSkills = _getTeachableSkills(master.id, 51);
            var masterLocation = _getCurrentLocation(master);
            var candidateLocation = _getCurrentLocation(candidate);

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            // Build skill options
            var skillOptions = '';
            if (teachableSkills && teachableSkills.length > 0) {
                for (var i = 0; i < teachableSkills.length; i++) {
                    var skill = teachableSkills[i];
                    var roleName = skill.name || skill.id;
                    skillOptions += '<option value="' + skill.id + '">' + _escapeHtml(roleName) + ' (Skill: ' + (skill.skillLevel || 0) + ')</option>';
                }
            } else {
                skillOptions += '<option value="">No teachable skills (master needs 51+ skill)</option>';
            }

            var content =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +

                // Master and candidate info
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent);">Master</div>' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + personIcon + ' ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + masterAge + ' years · ' + _escapeHtml(masterLocation) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent);">Candidate</div>' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + personIcon + ' ' + _escapeHtml(candidate.name) + ' ' + _escapeHtml(candidate.surname || '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + candidateAge + ' years · ' + _escapeHtml(candidateLocation) + '</div>' +
                '</div>' +
                '</div>' +

                // Form fields
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Profession to Learn</label>' +
                '<select id="appRoleSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                skillOptions +
                '</select>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="appStartYear" value="' + currentYear + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Initial Skill Level</label>' +
                '<input type="number" id="appInitialSkill" value="10" min="0" max="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Move Options</label>' +
                '<select id="appMoveOption" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '<option value="apprentice">Move Apprentice to Master\'s Location</option>' +
                '<option value="master">Move Master to Candidate\'s Location</option>' +
                '<option value="separate">Keep Separate Residences</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Assignment</label>' +
                '<select id="appHouseholdOption" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '<option value="master">Move Apprentice to Master\'s Household</option>' +
                '<option value="separate">Keep Independent Household</option>' +
                '<option value="none">No Household Change</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="appNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="Terms of apprenticeship..."></textarea>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Apprenticeship will be recorded. Skill progresses annually based on teaching sessions.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Apprenticeship: ' + master.name + ' → ' + candidate.name,
                content: content,
                confirmText: 'Create Apprenticeship',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var roleId = document.getElementById('appRoleSelect').value;
                    if (!roleId) {
                        _showToast('Please select a profession to learn', 'error');
                        return false;
                    }

                    var startYear = parseInt(document.getElementById('appStartYear').value);
                    if (isNaN(startYear)) {
                        _showToast('Invalid start year', 'error');
                        return false;
                    }

                    var initialSkill = parseInt(document.getElementById('appInitialSkill').value);
                    if (isNaN(initialSkill) || initialSkill < 0 || initialSkill > 100) {
                        _showToast('Skill level must be between 0 and 100', 'error');
                        return false;
                    }

                    var moveOption = document.getElementById('appMoveOption').value;
                    var householdOption = document.getElementById('appHouseholdOption').value;
                    var notes = document.getElementById('appNotes').value;

                    var result = _createApprenticeship(master.id, candidate.id, {
                        roleId: roleId,
                        startYear: startYear,
                        initialSkill: initialSkill,
                        notes: notes,
                        moveOption: moveOption,
                        householdOption: householdOption
                    });

                    if (result && result.success) {
                        _showToast('Apprenticeship created successfully!', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result);
                        return true;
                    } else {
                        _showToast('Failed to create apprenticeship: ' + (result?.reason || 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. EDIT APPRENTICESHIP MODAL
    // =========================================================================

    function openEditApprenticeshipModal(masterId, apprenticeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);
            var apprenticeship = _getApprenticeship(masterId, apprenticeId);

            if (!master || !apprentice || !apprenticeship) {
                _showToast('Apprenticeship not found', 'error');
                return;
            }

            var currentSkill = apprenticeship.metadata?.skillLevel || 0;
            var roleId = apprenticeship.metadata?.roleId || '';
            var role = roleId ? _getRoleById(roleId) : null;
            var notes = apprenticeship.metadata?.notes || '';
            var status = apprenticeship.status || 'ongoing';
            var startYear = apprenticeship.startYear || _getCurrentYear();

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent);">Master</div>' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + personIcon + ' ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent);">Apprentice</div>' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + personIcon + ' ' + _escapeHtml(apprentice.name) + ' ' + _escapeHtml(apprentice.surname || '') + '</div>' +
                '</div>' +
                '</div>' +

                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 0.65rem;">' +
                '<span>Current Skill: <strong>' + currentSkill + ' (' + _getSkillLevelName(currentSkill) + ')</strong></span>' +
                '<span>Status: <strong style="color: ' + (status === 'ongoing' ? 'var(--success)' : 'var(--warn)') + ';">' + status + '</strong></span>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Profession</label>' +
                '<input type="text" value="' + (role ? _escapeHtml(role.name) : 'Unknown') + '" disabled style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; color: var(--dim);">' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="editStartYear" value="' + startYear + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level</label>' +
                '<input type="number" id="editSkillLevel" value="' + currentSkill + '" min="0" max="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>' +
                '<select id="editStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '<option value="ongoing" ' + (status === 'ongoing' ? 'selected' : '') + '>Ongoing</option>' +
                '<option value="completed" ' + (status === 'completed' ? 'selected' : '') + '>Completed</option>' +
                '<option value="ended" ' + (status === 'ended' ? 'selected' : '') + '>Ended</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' + _escapeHtml(notes) + '</textarea>' +
                '</div>' +

                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">' +
                '<button id="progressSkillBtn" class="btn primary" style="font-size: 0.6rem; padding: 4px 12px;">+5 Skill</button>' +
                '<button id="completeBtn" class="btn success" style="font-size: 0.6rem; padding: 4px 12px;">Complete</button>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 8px;">' +
                infoIcon + ' Changing skill level manually or use +5 to progress. Completion grants the profession.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Apprenticeship: ' + apprentice.name,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var startYear = parseInt(document.getElementById('editStartYear').value);
                    var skillLevel = parseInt(document.getElementById('editSkillLevel').value);
                    var status = document.getElementById('editStatus').value;
                    var notes = document.getElementById('editNotes').value;

                    if (isNaN(startYear)) {
                        _showToast('Invalid start year', 'error');
                        return false;
                    }
                    if (isNaN(skillLevel) || skillLevel < 0 || skillLevel > 100) {
                        _showToast('Skill level must be between 0 and 100', 'error');
                        return false;
                    }

                    var result = _updateApprenticeship(masterId, apprenticeId, {
                        startYear: startYear,
                        skillLevel: skillLevel,
                        status: status,
                        notes: notes
                    });

                    if (result && result.success) {
                        _showToast('Apprenticeship updated', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result);
                        return true;
                    } else {
                        _showToast('Failed to update apprenticeship', 'error');
                        return false;
                    }
                }
            });

            // Attach button handlers
            setTimeout(function() {
                var progressBtn = document.getElementById('progressSkillBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function() {
                        var result = _progressApprenticeship(masterId, apprenticeId, 5);
                        if (result && result.success) {
                            _showToast('Skill progressed by 5', 'success');
                            var skillInput = document.getElementById('editSkillLevel');
                            if (skillInput) {
                                var newVal = parseInt(skillInput.value) + 5;
                                skillInput.value = Math.min(100, newVal);
                            }
                        } else {
                            _showToast('Failed to progress skill', 'error');
                        }
                    });
                }

                var completeBtn = document.getElementById('completeBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function() {
                        _confirmDialog(
                            'Complete this apprenticeship? The apprentice will be granted the profession.',
                            'Complete Apprenticeship',
                            function() {
                                var skillInput = document.getElementById('editSkillLevel');
                                var skill = skillInput ? parseInt(skillInput.value) : 50;
                                var result = _completeApprenticeship(masterId, apprenticeId, skill);
                                if (result && result.success) {
                                    _showToast('Apprenticeship completed!', 'success');
                                    _closeTopModal();
                                    if (onSuccess) onSuccess(result);
                                } else {
                                    _showToast('Failed to complete apprenticeship', 'error');
                                }
                            }
                        );
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. APPRENTICESHIP DETAILS MODAL
    // =========================================================================

    function openApprenticeshipDetailsModal(masterId, apprenticeId, onSave, onDelete) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);
            var apprenticeship = _getApprenticeship(masterId, apprenticeId);

            if (!master || !apprentice || !apprenticeship) {
                _showToast('Apprenticeship not found', 'error');
                return;
            }

            var skillLevel = apprenticeship.metadata?.skillLevel || 0;
            var roleId = apprenticeship.metadata?.roleId || '';
            var role = roleId ? _getRoleById(roleId) : null;
            var notes = apprenticeship.metadata?.notes || '';
            var status = apprenticeship.status || 'ongoing';
            var startYear = apprenticeship.startYear || _getCurrentYear();
            var endYear = apprenticeship.endYear || null;

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var statusColor = status === 'ongoing' ? 'var(--success)' :
                             status === 'completed' ? 'var(--accent)' : 'var(--danger)';

            var duration = endYear ? (endYear - startYear) : (_getCurrentYear() - startYear);

            var content =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +

                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + personIcon + ' ' + _escapeHtml(apprentice.name) + ' ' + _escapeHtml(apprentice.surname || '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Apprentice to ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</div>' +
                '</div>' +
                '<span style="font-size: 0.6rem; background: ' + statusColor + '; padding: 2px 10px; border-radius: 12px; color: white;">' + status.toUpperCase() + '</span>' +
                '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Profession</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + (role ? _escapeHtml(role.name) : 'Unknown') + '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Skill Level</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + skillLevel + ' (' + _getSkillLevelName(skillLevel) + ')</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Started</div>' +
                '<div style="font-size: 0.8rem;">' + startYear + '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Duration</div>' +
                '<div style="font-size: 0.8rem;">' + duration + ' years' + (endYear ? ' (ended ' + endYear + ')' : '') + '</div>' +
                '</div>' +
                '</div>' +

                (notes ? '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.6rem;">' +
                '<div style="color: var(--dim); font-size: 0.55rem;">Notes</div>' +
                _escapeHtml(notes) +
                '</div>' : '') +

                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">' +
                '<button id="editAppBtn" class="btn primary" style="font-size: 0.6rem; padding: 4px 12px;">Edit</button>' +
                '<button id="progressBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px;">+5 Skill</button>' +
                (status === 'ongoing' ? '<button id="completeAppBtn" class="btn success" style="font-size: 0.6rem; padding: 4px 12px;">Complete</button>' : '') +
                (status === 'ongoing' ? '<button id="terminateAppBtn" class="btn danger" style="font-size: 0.6rem; padding: 4px 12px;">Terminate</button>' : '') +
                '<button id="deleteAppBtn" class="btn danger" style="font-size: 0.6rem; padding: 4px 12px;">Delete</button>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 8px;">' +
                infoIcon + ' Skill 51+ = Journeyman (can teach). Skill 76+ = Expert. Skill 91+ = Master.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Apprenticeship Details',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var editBtn = document.getElementById('editAppBtn');
                if (editBtn) {
                    editBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openEditApprenticeshipModal(masterId, apprenticeId, function(result) {
                            if (onSave) onSave(result);
                        });
                    });
                }

                var progressBtn = document.getElementById('progressBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function() {
                        var result = _progressApprenticeship(masterId, apprenticeId, 5);
                        if (result && result.success) {
                            _showToast('Skill progressed by 5', 'success');
                            _closeTopModal();
                            openApprenticeshipDetailsModal(masterId, apprenticeId, onSave, onDelete);
                        } else {
                            _showToast('Failed to progress skill', 'error');
                        }
                    });
                }

                var completeBtn = document.getElementById('completeAppBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function() {
                        _confirmDialog(
                            'Complete this apprenticeship? The apprentice will be granted the profession.',
                            'Complete Apprenticeship',
                            function() {
                                var result = _completeApprenticeship(masterId, apprenticeId, skillLevel);
                                if (result && result.success) {
                                    _showToast('Apprenticeship completed!', 'success');
                                    _closeTopModal();
                                    if (onSave) onSave(result);
                                } else {
                                    _showToast('Failed to complete apprenticeship', 'error');
                                }
                            }
                        );
                    });
                }

                var terminateBtn = document.getElementById('terminateAppBtn');
                if (terminateBtn) {
                    terminateBtn.addEventListener('click', function() {
                        _confirmDialog(
                            'Terminate this apprenticeship? This cannot be undone.',
                            'Terminate Apprenticeship',
                            function() {
                                var result = _terminateApprenticeship(masterId, apprenticeId, 'Terminated by user');
                                if (result && result.success) {
                                    _showToast('Apprenticeship terminated', 'info');
                                    _closeTopModal();
                                    if (onSave) onSave(result);
                                } else {
                                    _showToast('Failed to terminate apprenticeship', 'error');
                                }
                            }
                        );
                    });
                }

                var deleteBtn = document.getElementById('deleteAppBtn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function() {
                        _confirmDialog(
                            'Delete this apprenticeship record? This cannot be undone.',
                            'Delete Apprenticeship',
                            function() {
                                if (onDelete) onDelete();
                                _closeTopModal();
                            }
                        );
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. VIEW MASTER TREE MODAL
    // =========================================================================

    function openViewMasterTreeModal(masterId, onRefresh) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var master = _getCharacterById(masterId);
            if (!master) {
                _showToast('Master not found', 'error');
                return;
            }

            var apprentices = _getApprentices(masterId, false);
            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +

                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="font-weight: bold; font-size: 0.9rem;">' + crownIcon + ' ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + apprentices.length + ' apprentices</div>' +
                '</div>';

            if (apprentices.length === 0) {
                content += '<div style="text-align: center; padding: 20px; color: var(--dim);">No apprentices</div>';
            } else {
                content += '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < apprentices.length; i++) {
                    var app = apprentices[i];
                    var appChar = typeof app === 'string' ? _getCharacterById(app) : app;
                    if (!appChar) continue;

                    var skill = _getSkillLevel(appChar.id, null) || 0;
                    var role = _getApprenticeshipRole(appChar.id);
                    var roleName = role ? (typeof role === 'string' ? role : role.name) : 'Unknown';
                    var status = app.status || 'ongoing';
                    var statusColor = status === 'ongoing' ? 'var(--success)' :
                                     status === 'completed' ? 'var(--accent)' : 'var(--danger)';

                    content +=
                        '<div class="apprentice-item" data-char-id="' + appChar.id + '" style="' +
                        'background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; ' +
                        'padding: 8px 12px; cursor: pointer; transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span>' + personIcon + ' ' + _escapeHtml(appChar.name) + ' ' + _escapeHtml(appChar.surname || '') + '</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(roleName) + '</span>' +
                        '</div>' +
                        '<div style="display: flex; gap: 8px; align-items: center;">' +
                        '<span style="font-size: 0.55rem;">Skill: ' + skill + '</span>' +
                        '<span style="font-size: 0.5rem; color: ' + statusColor + '; padding: 2px 6px; border-radius: 8px; background: ' + statusColor + '22;">' + status + '</span>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
                content += '</div>';
            }

            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Click an apprentice to view their details.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Master Tree: ' + master.name,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.apprentice-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var charId = this.dataset.charId;
                            var char = _getCharacterById(charId);
                            if (char) {
                                _closeTopModal();
                                var masterOf = _getMaster(charId);
                                if (masterOf) {
                                    var masterId = typeof masterOf === 'object' ? masterOf.id : masterOf;
                                    openApprenticeshipDetailsModal(masterId, charId, null, null);
                                }
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                            this.style.borderColor = 'var(--accent)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                            this.style.borderColor = 'var(--border)';
                        });
                    })(items[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. FIND MASTER BY LOCATION MODAL
    // =========================================================================

    function openFindMasterByLocationModal(locationId, roleId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var masters = _getSettlementMastersByRole(locationId, roleId);

            if (masters.length === 0) {
                var roleName = roleId ? ' for that role' : '';
                _showToast('No masters found in ' + place.displayName + roleName, 'info');
                _openingModal = false;
                return;
            }

            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');
            var locationIcon = _getIcon('LOCATION');

            var role = roleId ? _getRoleById(roleId) : null;
            var title = role ? 'Find ' + role.name + ' Masters' : 'Find Masters';

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + crownIcon + ' ' + _escapeHtml(title) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + locationIcon + ' ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + masters.length + ' masters available</div>' +
                '</div>';

            for (var i = 0; i < masters.length; i++) {
                var m = masters[i];
                var char = m.character;
                var age = _calculateAge(char.birthYear, false, null);

                var primaryProf = '';
                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        if (char.professions[j].primary) {
                            primaryProf = char.professions[j].name || '';
                            break;
                        }
                    }
                    if (!primaryProf && char.professions.length > 0) {
                        primaryProf = char.professions[0].name || '';
                    }
                }

                content +=
                    '<div class="master-item" data-char-id="' + char.id + '" style="' +
                    'background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; ' +
                    'padding: 10px 12px; margin-bottom: 6px; cursor: pointer; transition: all 0.1s;' +
                    '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                    '<div>' +
                    '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                    '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 8px;">' + age + ' years</span>' +
                    (primaryProf ? '<span style="font-size: 0.55rem; color: var(--accent); margin-left: 8px;">' + _escapeHtml(primaryProf) + '</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' +
                    personIcon + ' ' + m.apprenticeCount + ' apprentices' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }

            content += '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                'Click on a master to select them for apprenticeship.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: title + ' in ' + place.displayName,
                content: content,
                confirmText: 'Cancel',
                cancelText: '',
                onConfirm: function() {
                    _openingModal = false;
                }
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.master-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var charId = this.dataset.charId;
                            var char = _getCharacterById(charId);
                            if (char && onSuccess) {
                                _closeTopModal();
                                _openingModal = false;
                                onSuccess(char);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                            this.style.borderColor = 'var(--accent)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                            this.style.borderColor = 'var(--border)';
                        });
                    })(items[i]);
                }
            }, 100);

        } finally {
            // Don't reset _openingModal here - it's reset in the modal close handlers
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

})();