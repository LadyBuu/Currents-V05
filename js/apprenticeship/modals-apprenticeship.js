/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP MODALS (modals-apprenticeship.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-apprenticeship.js
 * 
 * This file contains ALL apprenticeship UI modals.
 * This is the UI LAYER - it only handles rendering and user interaction.
 * All business logic is delegated to ApprenticeshipCommands and ApprenticeshipQueries.
 * 
 * UPDATED:
 * - NO TRUST SYSTEM - completely removed all trust-related code
 * - NO emojis - uses SVG icons from icons.js
 * - Uses unified character selector from modals-char-select.js
 * - Uses AGE_GROUPS from constants.js
 * - Uses ApprenticeshipCommands and ApprenticeshipQueries
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
    // 4. DEPENDENCY WRAPPERS
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
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
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

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') {
            return window.getActiveRankDisplay(character);
        }
        return null;
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    // =========================================================================
    // 5. CHARACTER SELECTOR
    // =========================================================================

    function _openCharacterSelectorForApprenticeship(title, onSelect, options) {
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
    // 6. LOCATION DROPDOWN
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
    // 7. APPRENTICESHIP HELPERS (Using ApprenticeshipQueries)
    // =========================================================================

    function _getMaster(characterId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getMaster(characterId);
        }
        if (typeof window.getMaster === 'function') {
            return window.getMaster(characterId);
        }
        return null;
    }

    function _getApprentices(masterId, activeOnly) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getApprentices(masterId, activeOnly);
        }
        if (typeof window.getApprentices === 'function') {
            return window.getApprentices(masterId, activeOnly);
        }
        return [];
    }

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevel(characterId, roleId);
        }
        if (typeof window.getSkillLevel === 'function') {
            return window.getSkillLevel(characterId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
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

    function _getApprenticeshipStage(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getApprenticeshipStage(characterId, roleId);
        }
        if (typeof window.getApprenticeshipStage === 'function') {
            return window.getApprenticeshipStage(characterId, roleId);
        }
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    function _getApprenticeshipProgress(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getApprenticeshipProgress(characterId, roleId);
        }
        if (typeof window.getApprenticeshipProgress === 'function') {
            return window.getApprenticeshipProgress(characterId, roleId);
        }
        return 0;
    }

    function _getApprenticeshipRole(characterId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getApprenticeshipRole(characterId);
        }
        if (typeof window.getApprenticeshipRole === 'function') {
            return window.getApprenticeshipRole(characterId);
        }
        return null;
    }

    function _findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        if (typeof window.findPotentialMasters === 'function') {
            return window.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        return [];
    }

    function _canTeach(characterId, roleId, minSkillLevel) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.canTeach(characterId, roleId, minSkillLevel);
        }
        if (typeof window.canTeach === 'function') {
            return window.canTeach(characterId, roleId, minSkillLevel);
        }
        return false;
    }

    function _getTeachableSkills(characterId, minSkillLevel) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getTeachableSkills(characterId, minSkillLevel);
        }
        if (typeof window.getTeachableSkills === 'function') {
            return window.getTeachableSkills(characterId, minSkillLevel);
        }
        return [];
    }

    // =========================================================================
    // 8. APPRENTICESHIP COMMAND WRAPPERS
    // =========================================================================

    function _createApprenticeship(masterId, apprenticeId, options) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.createApprenticeship(masterId, apprenticeId, options);
        }
        if (typeof window.createApprenticeship === 'function') {
            return window.createApprenticeship(masterId, apprenticeId, options);
        }
        _showToast('Create apprenticeship not available', 'error');
        return null;
    }

    function _updateApprenticeship(masterId, apprenticeId, updates) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.updateApprenticeship(masterId, apprenticeId, updates);
        }
        if (typeof window.updateApprenticeship === 'function') {
            return window.updateApprenticeship(masterId, apprenticeId, updates);
        }
        _showToast('Update apprenticeship not available', 'error');
        return false;
    }

    function _progressApprenticeship(masterId, apprenticeId, amount) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.progressApprenticeship(masterId, apprenticeId, amount);
        }
        if (typeof window.progressApprenticeship === 'function') {
            return window.progressApprenticeship(masterId, apprenticeId, amount);
        }
        _showToast('Progress apprenticeship not available', 'error');
        return null;
    }

    function _completeApprenticeship(masterId, apprenticeId, finalSkillLevel) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.completeApprenticeship(masterId, apprenticeId, finalSkillLevel);
        }
        if (typeof window.completeApprenticeship === 'function') {
            return window.completeApprenticeship(masterId, apprenticeId, finalSkillLevel);
        }
        _showToast('Complete apprenticeship not available', 'error');
        return false;
    }

    function _endApprenticeship(masterId, apprenticeId, options) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.endApprenticeship(masterId, apprenticeId, options);
        }
        if (typeof window.endApprenticeship === 'function') {
            return window.endApprenticeship(masterId, apprenticeId, options);
        }
        _showToast('End apprenticeship not available', 'error');
        return false;
    }

    function _setSkillLevel(masterId, apprenticeId, level) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.setSkillLevel(masterId, apprenticeId, level);
        }
        if (typeof window.setSkillLevel === 'function') {
            return window.setSkillLevel(masterId, apprenticeId, level);
        }
        _showToast('Set skill level not available', 'error');
        return false;
    }

    // =========================================================================
    // 9. HOUSEHOLD HELPERS (NO TRUST)
    // =========================================================================

    function _getAllHouseholds() {
        if (typeof window.getAllHouseholds === 'function') {
            return window.getAllHouseholds();
        }
        return window.masterData?.data?.households || [];
    }

    function _getHousehold(id) {
        if (typeof window.getHousehold === 'function') {
            return window.getHousehold(id);
        }
        if (!id) return null;
        var households = _getAllHouseholds();
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === id) return households[i];
        }
        return null;
    }

    function _findCharacterHousehold(characterId) {
        if (typeof window.findCharacterHousehold === 'function') {
            return window.findCharacterHousehold(characterId);
        }
        var households = _getAllHouseholds();
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].characterId === characterId) {
                        return h;
                    }
                }
            }
        }
        return null;
    }

    function _removeHouseholdMember(householdId, characterId) {
        if (typeof window.removeHouseholdMember === 'function') {
            return window.removeHouseholdMember(householdId, characterId);
        }
        return false;
    }

    function _addHouseholdMember(householdId, characterId, type, options) {
        if (typeof window.addHouseholdMember === 'function') {
            return window.addHouseholdMember(householdId, characterId, type, options);
        }
        return false;
    }

    function _recordMove(character, year, locationId, note) {
        if (typeof window.recordMove === 'function') {
            return window.recordMove(character, year, locationId, note);
        }
        return false;
    }

    function _getLocationIdByName(locationName) {
        if (typeof window.getLocationIdByName === 'function') {
            return window.getLocationIdByName(locationName);
        }
        var places = _getPlaces();
        for (var i = 0; i < places.length; i++) {
            if (places[i].displayName === locationName) return places[i].id;
        }
        return null;
    }

    function _findHouseholdByLocation(locationName) {
        if (typeof window.findHouseholdByLocation === 'function') {
            return window.findHouseholdByLocation(locationName);
        }
        var households = _getAllHouseholds();
        var locationId = _getLocationIdByName(locationName);
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.locationName === locationName || h.locationId === locationId) {
                return h;
            }
        }
        return null;
    }

    // =========================================================================
    // 10. CREATE APPRENTICESHIP MODAL
    // =========================================================================

    function openCreateApprenticeshipModal(master, candidate, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            if (!master || !candidate) {
                _showToast('Invalid master or candidate', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var candidateAge = _calculateAge(candidate.birthYear, false, null);
            var masterLocation = _getCurrentLocation(master);
            var candidateLocation = _getCurrentLocation(candidate);
            var sameLocation = masterLocation === candidateLocation;

            var masterProfessions = _getTeachableSkills(master.id, 51);

            var defaultProfessionId = null;
            for (var i = 0; i < masterProfessions.length; i++) {
                if (masterProfessions[i].primary) {
                    defaultProfessionId = masterProfessions[i].role.id;
                    break;
                }
            }
            if (!defaultProfessionId && masterProfessions.length > 0) {
                defaultProfessionId = masterProfessions[0].role.id;
            }

            var suggestedAge = Math.max(0, candidateAge);
            var suggestedYear = candidate.birthYear ? candidate.birthYear + suggestedAge : currentYear;

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var warningIcon = _getIcon('WARNING');
            var locationIcon = _getIcon('LOCATION');
            var householdIcon = _getIcon('HOUSEHOLD');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var masterIcon = _getIcon('CROWN');

            var moveOptionsHtml = '';
            if (!sameLocation) {
                moveOptionsHtml = '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Move Options</label>' +
                    '<select id="apprenticeMoveChoice" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                        '<option value="apprentice">' + householdIcon + ' Move Apprentice to ' + _escapeHtml(masterLocation) + '</option>' +
                        '<option value="master">' + householdIcon + ' Move Master to ' + _escapeHtml(candidateLocation) + '</option>' +
                        '<option value="separate">' + infoIcon + ' Keep separate residences</option>' +
                    '</select>' +
                    '<small style="font-size: 0.55rem; color: var(--dim);">Traditionally, the apprentice moves to the master\'s location.</small>' +
                '</div>';
            } else {
                moveOptionsHtml = '<input type="hidden" id="apprenticeMoveChoice" value="separate">';
            }

            var professionsHtml = '';
            if (masterProfessions.length > 0) {
                var profNames = [];
                for (var i = 0; i < masterProfessions.length; i++) {
                    profNames.push(masterProfessions[i].role.name + ' (' + _getSkillLevelName(masterProfessions[i].skillLevel) + ')');
                }
                professionsHtml = '<br>' + infoIcon + ' Professions: ' + profNames.join(', ');
            } else {
                professionsHtml = '<br><span style="color: var(--warn);">' + warningIcon + ' No professions</span>';
            }

            var modalContent = '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="margin-bottom: 8px;">' +
                    '<strong>' + masterIcon + ' Master: ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</strong><br>' +
                    locationIcon + ' Location: ' + _escapeHtml(masterLocation) +
                    professionsHtml +
                '</div>' +
                '<div style="margin-bottom: 8px;">' +
                    '<strong>' + personIcon + ' Candidate: ' + _escapeHtml(candidate.name) + ' ' + _escapeHtml(candidate.surname || '') + '</strong><br>' +
                    locationIcon + ' Location: ' + _escapeHtml(candidateLocation) + '<br>' +
                    infoIcon + ' Age: ' + candidateAge + ' years (born ' + candidate.birthYear + ')' +
                '</div>' +
                (!sameLocation ? '<div style="margin-top: 8px; padding: 6px; background: rgba(200, 112, 64, 0.15); border-radius: 6px; font-size: 0.65rem; color: var(--warn);">' + warningIcon + ' Different locations! One will need to move.</div>' : '<div style="margin-top: 8px; color: var(--success);">' + checkIcon + ' Both in same location</div>') +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Profession to Learn</label>' +
                '<select id="apprenticeProfession" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">';

            for (var i = 0; i < masterProfessions.length; i++) {
                var p = masterProfessions[i];
                modalContent += '<option value="' + p.role.id + '" ' + (p.role.id === defaultProfessionId ? 'selected' : '') + '>' +
                    p.role.name + ' (' + _getSkillLevelName(p.skillLevel) + ')' + (p.primary ? ' ★' : '') +
                '</option>';
            }
            if (masterProfessions.length === 0) {
                modalContent += '<option value="">No professions available</option>';
            }

            modalContent += '</select>' +
            '</div>' +

            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Apprentice Age at Start</label>' +
                    '<input type="number" id="apprenticeStartAge" value="' + suggestedAge + '" min="0" max="150" step="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                    '<input type="number" id="apprenticeStartYear" value="' + suggestedYear + '" min="' + candidate.birthYear + '" max="' + (currentYear + 10) + '" step="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Initial Skill Level (0-100)</label>' +
                '<input type="range" id="initialSkillLevel" min="0" max="100" value="10" step="1" style="width: 100%;">' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                    '<span>0</span>' +
                    '<span id="initialSkillDisplay">10 (Novice)</span>' +
                    '<span>100</span>' +
                '</div>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Starting skill level. Will increase automatically over time.</small>' +
            '</div>' +

            moveOptionsHtml +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Assignment</label>' +
                '<select id="apprenticeHouseholdChoice" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                    '<option value="master">' + householdIcon + ' Move apprentice to master\'s household</option>' +
                    '<option value="separate">' + infoIcon + ' Keep independent household</option>' +
                    '<option value="none">' + infoIcon + ' No household change</option>' +
                '</select>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Where will the apprentice live during training?</small>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="apprenticeNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);" placeholder="e.g., Family arrangement, Guild requirement..."></textarea>' +
            '</div>' +

            '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">' +
                infoIcon + ' The apprentice will gain the master\'s profession and begin their training. Skill increases automatically each year.' +
                (!sameLocation ? ' ' + infoIcon + ' If the apprentice moves, they will also be transferred to any household at the master\'s location.' : '') +
            '</div>';

            _openModal({
                title: 'Create Apprenticeship',
                content: modalContent,
                confirmText: 'Create Apprenticeship',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var professionId = document.getElementById('apprenticeProfession') ? document.getElementById('apprenticeProfession').value : null;
                    if (!professionId && masterProfessions.length > 0) {
                        _showToast('Please select a profession', 'error');
                        return;
                    }

                    var startAge = parseInt(document.getElementById('apprenticeStartAge') ? document.getElementById('apprenticeStartAge').value : 0);
                    var startYear = parseInt(document.getElementById('apprenticeStartYear') ? document.getElementById('apprenticeStartYear').value : 0);
                    var moveChoice = document.getElementById('apprenticeMoveChoice') ? document.getElementById('apprenticeMoveChoice').value : null;
                    var householdChoice = document.getElementById('apprenticeHouseholdChoice') ? document.getElementById('apprenticeHouseholdChoice').value : 'master';
                    var notes = document.getElementById('apprenticeNotes') ? document.getElementById('apprenticeNotes').value : null;
                    var initialSkill = parseInt(document.getElementById('initialSkillLevel') ? document.getElementById('initialSkillLevel').value : 10);

                    if (isNaN(startAge)) startAge = 0;
                    startAge = Math.max(0, startAge);

                    if (isNaN(startYear)) startYear = candidate.birthYear + startAge;

                    if (startYear < candidate.birthYear) {
                        _showToast('Start year cannot be before candidate\'s birth year (' + candidate.birthYear + ')', 'error');
                        return;
                    }

                    // Handle move
                    if (moveChoice && moveChoice !== 'separate') {
                        var places = _getPlaces();
                        if (moveChoice === 'apprentice') {
                            var targetPlace = null;
                            for (var i = 0; i < places.length; i++) {
                                if (places[i].displayName === masterLocation) {
                                    targetPlace = places[i];
                                    break;
                                }
                            }
                            if (targetPlace) {
                                _recordMove(candidate, startYear, targetPlace.id, 'Moved to become apprentice to ' + master.name);

                                if (householdChoice === 'master') {
                                    var sourceHousehold = _findCharacterHousehold(candidate.id);
                                    var targetHousehold = _findHouseholdByLocation(masterLocation);

                                    if (sourceHousehold && targetHousehold && sourceHousehold.id !== targetHousehold.id) {
                                        _removeHouseholdMember(sourceHousehold.id, candidate.id);
                                        _addHouseholdMember(targetHousehold.id, candidate.id, 'staff', {
                                            role: 'Apprentice to ' + master.name,
                                            joinedYear: startYear,
                                            notes: 'Apprenticeship under ' + master.name + (notes ? ': ' + notes : '')
                                        });
                                        _showToast(candidate.name + ' transferred to household at ' + masterLocation, 'info');
                                    } else if (!sourceHousehold && targetHousehold) {
                                        _addHouseholdMember(targetHousehold.id, candidate.id, 'staff', {
                                            role: 'Apprentice to ' + master.name,
                                            joinedYear: startYear,
                                            notes: 'Apprenticeship under ' + master.name
                                        });
                                        _showToast(candidate.name + ' added to household at ' + masterLocation, 'info');
                                    }
                                }
                            }
                        } else if (moveChoice === 'master') {
                            var targetPlace = null;
                            for (var i = 0; i < places.length; i++) {
                                if (places[i].displayName === candidateLocation) {
                                    targetPlace = places[i];
                                    break;
                                }
                            }
                            if (targetPlace) {
                                _recordMove(master, startYear, targetPlace.id, 'Moved to become master of ' + candidate.name);
                            }
                        }
                    } else if (householdChoice === 'master' && !moveChoice) {
                        var sourceHousehold = _findCharacterHousehold(candidate.id);
                        var targetHousehold = _findCharacterHousehold(master.id);

                        if (sourceHousehold && targetHousehold && sourceHousehold.id !== targetHousehold.id) {
                            _removeHouseholdMember(sourceHousehold.id, candidate.id);
                            _addHouseholdMember(targetHousehold.id, candidate.id, 'staff', {
                                role: 'Apprentice to ' + master.name,
                                joinedYear: startYear,
                                notes: 'Apprenticeship under ' + master.name + ' (same location)'
                            });
                            _showToast(candidate.name + ' transferred to ' + master.name + '\'s household', 'info');
                        }
                    }

                    var result = _createApprenticeship(master.id, candidate.id, {
                        roleId: professionId,
                        startYear: startYear,
                        initialSkill: initialSkill,
                        notes: notes || 'Apprenticeship created'
                    });

                    if (result) {
                        _showToast(candidate.name + ' is now apprenticed to ' + master.name, 'success');
                        if (onSuccess) onSuccess(result);
                        _closeTopModal();
                    } else {
                        _showToast('Failed to create apprenticeship', 'error');
                    }
                }
            });

            setTimeout(function() {
                var ageInput = document.getElementById('apprenticeStartAge');
                var yearInput = document.getElementById('apprenticeStartYear');
                var skillSlider = document.getElementById('initialSkillLevel');
                var skillDisplay = document.getElementById('initialSkillDisplay');

                if (skillSlider && skillDisplay) {
                    skillSlider.addEventListener('input', function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    });
                }

                if (ageInput && yearInput && candidate.birthYear) {
                    ageInput.addEventListener('input', function() {
                        var age = parseInt(ageInput.value);
                        if (!isNaN(age) && age >= 0) {
                            yearInput.value = candidate.birthYear + age;
                        }
                    });

                    yearInput.addEventListener('input', function() {
                        var year = parseInt(yearInput.value);
                        if (!isNaN(year)) {
                            var newAge = year - candidate.birthYear;
                            if (newAge >= 0) {
                                ageInput.value = newAge;
                            }
                        }
                    });
                }
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 11. EDIT APPRENTICESHIP MODAL
    // =========================================================================

    function openEditApprenticeshipModal(masterId, apprenticeId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);
            var currentYear = _getCurrentYear();

            if (!master || !apprentice) {
                _showToast('Character not found', 'error');
                return;
            }

            var apprenticeship = _getApprenticeship(masterId, apprenticeId);
            if (!apprenticeship) {
                _showToast('No apprenticeship found', 'error');
                return;
            }

            var metadata = apprenticeship.metadata || {};
            var startYear = apprenticeship.startYear || currentYear;
            var skillLevel = metadata.skillLevel || 0;
            var notes = metadata.notes || '';
            var roleId = metadata.roleId || '';
            var role = roleId ? _getRoleById(roleId) : null;
            var status = apprenticeship.status || 'ongoing';

            var masterProfessions = _getTeachableSkills(master.id, 51);
            var skillName = _getSkillLevelName(skillLevel);

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var masterIcon = _getIcon('CROWN');
            var editIcon = _getIcon('EDIT');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var statusActiveIcon = _getIcon('STATUS_ACTIVE');
            var statusEndedIcon = _getIcon('STATUS_ENDED');
            var xHeavyIcon = _getIcon('X_HEAVY');

            var modalContent = '<div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + masterIcon + ' Master: ' + _escapeHtml(master.name) + '</strong></div>' +
                '<div><strong>' + personIcon + ' Apprentice: ' + _escapeHtml(apprentice.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                    infoIcon + ' Current Skill: ' + skillLevel + ' (' + skillName + ')' +
                '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Since ' + startYear + '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Profession</label>' +
                '<select id="editApprenticeProfession" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">';

            for (var i = 0; i < masterProfessions.length; i++) {
                var p = masterProfessions[i];
                modalContent += '<option value="' + p.role.id + '" ' + (p.role.id === roleId ? 'selected' : '') + '>' +
                    _escapeHtml(p.role.name) + ' (' + _getSkillLevelName(p.skillLevel) + ')' + (p.primary ? ' ★' : '') +
                '</option>';
            }
            if (masterProfessions.length === 0) {
                modalContent += '<option value="">No professions available</option>';
            }

            modalContent += '</select>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="editApprenticeStartYear" value="' + startYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                '<input type="range" id="editApprenticeSkillLevel" min="0" max="100" value="' + skillLevel + '" step="1" style="width: 100%;">' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                    '<span>0</span>' +
                    '<span id="skillLevelDisplay">' + skillLevel + ' (' + skillName + ')</span>' +
                    '<span>100</span>' +
                '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>' +
                '<select id="editApprenticeStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                    '<option value="ongoing" ' + (status === 'ongoing' ? 'selected' : '') + '>' + statusActiveIcon + ' Active</option>' +
                    '<option value="ended" ' + (status === 'ended' ? 'selected' : '') + '>' + statusEndedIcon + ' Terminated</option>' +
                    '<option value="completed" ' + (status === 'completed' ? 'selected' : '') + '>' + checkIcon + ' Completed</option>' +
                '</select>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editApprenticeNotes" rows="3" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' + _escapeHtml(notes) + '</textarea>' +
            '</div>';

            if (status === 'ongoing') {
                modalContent += '<div class="action-buttons" style="display: flex; gap: 8px; margin-top: 12px;">' +
                    '<button id="progressSkillBtn" class="btn small" style="background: var(--accent-dim); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text);">Progress Skill (+5)</button>' +
                    '<button id="completeApprenticeshipBtn" class="btn small" style="background: #4a9060; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Complete</button>' +
                '</div>';
            }

            _openModal({
                title: 'Edit Apprenticeship: ' + apprentice.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newRoleId = document.getElementById('editApprenticeProfession') ? document.getElementById('editApprenticeProfession').value : null;
                    var newStartYear = parseInt(document.getElementById('editApprenticeStartYear') ? document.getElementById('editApprenticeStartYear').value : 0);
                    var newStatus = document.getElementById('editApprenticeStatus') ? document.getElementById('editApprenticeStatus').value : 'ongoing';
                    var newSkillLevel = parseInt(document.getElementById('editApprenticeSkillLevel') ? document.getElementById('editApprenticeSkillLevel').value : 0);
                    var newNotes = document.getElementById('editApprenticeNotes') ? document.getElementById('editApprenticeNotes').value : '';

                    if (isNaN(newStartYear)) {
                        _showToast('Invalid start year', 'error');
                        return;
                    }

                    var updates = {
                        startYear: newStartYear,
                        roleId: newRoleId || null,
                        notes: newNotes,
                        status: newStatus,
                        skillLevel: newSkillLevel
                    };

                    var success = _updateApprenticeship(masterId, apprenticeId, updates);

                    if (success) {
                        _showToast('Updated apprenticeship for ' + apprentice.name, 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to update apprenticeship', 'error');
                    }
                }
            });

            setTimeout(function() {
                var skillSlider = document.getElementById('editApprenticeSkillLevel');
                var skillDisplay = document.getElementById('skillLevelDisplay');

                if (skillSlider && skillDisplay) {
                    var updateSkillDisplay = function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    };
                    skillSlider.addEventListener('input', updateSkillDisplay);
                }

                var progressBtn = document.getElementById('progressSkillBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function() {
                        var result = _progressApprenticeship(masterId, apprenticeId, 5);
                        if (result && result.success) {
                            _showToast(apprentice.name + ' progressed to ' + result.newStage + ' (' + result.newLevel + ')', 'success');
                            _closeTopModal();
                            if (onSuccess) onSuccess();
                        } else {
                            _showToast('Failed to progress skill', 'error');
                        }
                    });
                }

                var completeBtn = document.getElementById('completeApprenticeshipBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function() {
                        var role = _getRoleById(roleId);
                        _confirmDialog('Complete ' + apprentice.name + '\'s apprenticeship?\n\nThis will mark them as a fully trained ' + (role ? role.name : 'professional') + '.', 'Complete Apprenticeship', function() {
                            var success = _completeApprenticeship(masterId, apprenticeId);
                            if (success) {
                                _showToast(apprentice.name + ' completed their apprenticeship!', 'success');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast('Failed to complete apprenticeship', 'error');
                            }
                        });
                    });
                }
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 12. APPRENTICESHIP DETAILS MODAL
    // =========================================================================

    function openApprenticeshipDetailsModal(masterId, apprenticeId, onSave, onDelete) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            if (!master || !apprentice) {
                _showToast('Character not found', 'error');
                return;
            }

            var apprenticeship = _getApprenticeship(masterId, apprenticeId);
            if (!apprenticeship) {
                _showToast('No apprenticeship found', 'error');
                return;
            }

            var metadata = apprenticeship.metadata || {};
            var startYear = apprenticeship.startYear || '?';
            var currentYear = _getCurrentYear();
            var duration = startYear !== '?' ? currentYear - startYear : '?';
            var skillLevel = metadata.skillLevel || 0;
            var notes = metadata.notes || '';
            var roleId = metadata.roleId || '';
            var role = roleId ? _getRoleById(roleId) : null;
            var specializationsTaught = metadata.specializationsTaught || [];
            var status = apprenticeship.status || 'ongoing';

            var skillIcon = _getIcon('CIRCLE_DOT');
            var skillName = _getSkillLevelName(skillLevel);

            var statusBadge = '';
            var statusActiveIcon = _getIcon('STATUS_ACTIVE');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var xHeavyIcon = _getIcon('X_HEAVY');

            if (status === 'ongoing') statusBadge = '<span style="background: #4a9060; padding: 2px 8px; border-radius: 12px; font-size: 0.6rem; color: white;">' + statusActiveIcon + ' Active</span>';
            else if (status === 'completed') statusBadge = '<span style="background: #c8a844; padding: 2px 8px; border-radius: 12px; font-size: 0.6rem; color: white;">' + checkIcon + ' Completed</span>';
            else statusBadge = '<span style="background: #8a3020; padding: 2px 8px; border-radius: 12px; font-size: 0.6rem; color: white;">' + xHeavyIcon + ' Terminated</span>';

            var personIcon = _getIcon('PERSON');
            var masterIcon = _getIcon('CROWN');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var locationIcon = _getIcon('LOCATION');
            var editIcon = _getIcon('EDIT');
            var circleDotIcon = _getIcon('CIRCLE_DOT');

            var modalContent = '<div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + masterIcon + ' Master: ' + _escapeHtml(master.name) + '</strong></div>' +
                '<div><strong>' + personIcon + ' Apprentice: ' + _escapeHtml(apprentice.name) + '</strong></div>' +
                '<div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">' +
                    '<div>' + infoIcon + ' Profession: ' + (role ? _escapeHtml(role.name) : 'Unknown') + '</div>' +
                    statusBadge +
                '</div>' +
                '<div style="margin-top: 4px;">' +
                    skillIcon + ' Skill Level: ' + skillLevel + ' (' + skillName + ')' +
                '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<div class="info-value" style="font-size: 0.7rem;">' + startYear + '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Duration</label>' +
                '<div class="info-value" style="font-size: 0.7rem;">' + duration + ' years</div>' +
            '</div>';

            if (apprenticeship.endYear) {
                modalContent += '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                    '<div class="info-value" style="font-size: 0.7rem;">' + apprenticeship.endYear + '</div>' +
                '</div>';
            }

            if (specializationsTaught.length > 0) {
                var specsHtml = '';
                for (var i = 0; i < specializationsTaught.length; i++) {
                    specsHtml += '<span style="background: var(--bg3); padding: 2px 8px; border-radius: 12px; font-size: 0.7rem;">' + _escapeHtml(specializationsTaught[i]) + '</span>';
                }
                modalContent += '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations Taught</label>' +
                    '<div class="specs-list" style="display: flex; flex-wrap: wrap; gap: 4px;">' + specsHtml + '</div>' +
                '</div>';
            }

            modalContent += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="apprenticeshipDetailsNotes" rows="3" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px;">' + _escapeHtml(notes) + '</textarea>' +
            '</div>' +

            '<div class="action-buttons" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">' +
                '<button id="editApprenticeshipBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Edit Apprenticeship</button>';

            if (status === 'ongoing') {
                modalContent += '<button id="progressSkillDetailsBtn" class="btn" style="background: var(--accent-dim); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; color: var(--text);">Progress Skill (+5)</button>' +
                    '<button id="completeApprenticeshipDetailsBtn" class="btn" style="background: #4a9060; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Complete</button>' +
                    '<button id="terminateApprenticeshipBtn" class="btn danger" style="background: #8a3020; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Terminate</button>';
            }

            modalContent += '</div>';

            _openModal({
                title: 'Apprenticeship: ' + apprentice.name,
                content: modalContent,
                confirmText: 'Save Notes',
                cancelText: 'Close',
                onConfirm: function() {
                    var newNotes = document.getElementById('apprenticeshipDetailsNotes') ? document.getElementById('apprenticeshipDetailsNotes').value : null;
                    if (newNotes !== null) {
                        _updateApprenticeship(masterId, apprenticeId, { notes: newNotes });
                        _showToast('Notes saved', 'success');
                        if (onSave) onSave();
                    }
                }
            });

            setTimeout(function() {
                var editBtn = document.getElementById('editApprenticeshipBtn');
                if (editBtn) {
                    editBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openEditApprenticeshipModal(masterId, apprenticeId, function() {
                            if (onSave) onSave();
                        });
                    });
                }

                var progressBtn = document.getElementById('progressSkillDetailsBtn');
                if (progressBtn) {
                    progressBtn.addEventListener('click', function() {
                        var result = _progressApprenticeship(masterId, apprenticeId, 5);
                        if (result && result.success) {
                            _showToast(apprentice.name + ' progressed to ' + result.newStage + ' (' + result.newLevel + ')', 'success');
                            _closeTopModal();
                            if (onSave) onSave();
                        } else {
                            _showToast('Failed to progress skill', 'error');
                        }
                    });
                }

                var completeBtn = document.getElementById('completeApprenticeshipDetailsBtn');
                if (completeBtn) {
                    completeBtn.addEventListener('click', function() {
                        var role = _getRoleById(metadata.roleId);
                        _confirmDialog('Complete ' + apprentice.name + '\'s apprenticeship?\n\nThis will mark them as a fully trained ' + (role ? role.name : 'professional') + '.', 'Complete Apprenticeship', function() {
                            var success = _completeApprenticeship(masterId, apprenticeId);
                            if (success) {
                                _showToast(apprentice.name + ' completed their apprenticeship!', 'success');
                                _closeTopModal();
                                if (onSave) onSave();
                            } else {
                                _showToast('Failed to complete apprenticeship', 'error');
                            }
                        });
                    });
                }

                var terminateBtn = document.getElementById('terminateApprenticeshipBtn');
                if (terminateBtn) {
                    terminateBtn.addEventListener('click', function() {
                        _confirmDialog('Remove ' + apprentice.name + ' from ' + master.name + '\'s apprenticeship?\n\nThis will end the training relationship.', 'Confirm Termination', function() {
                            var success = _endApprenticeship(masterId, apprenticeId, { reason: 'Terminated by user' });
                            if (success) {
                                var masterHousehold = _findCharacterHousehold(masterId);
                                var apprenticeHousehold = _findCharacterHousehold(apprenticeId);

                                if (apprenticeHousehold && masterHousehold && apprenticeHousehold.id === masterHousehold.id) {
                                    _removeHouseholdMember(masterHousehold.id, apprenticeId);
                                    _showToast(apprentice.name + ' removed from ' + master.name + '\'s household', 'info');
                                }

                                _showToast('Apprenticeship terminated for ' + apprentice.name, 'info');
                                _closeTopModal();
                                if (onDelete) onDelete();
                            } else {
                                _showToast('Failed to terminate apprenticeship', 'error');
                            }
                        });
                    });
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 13. VIEW MASTER TREE MODAL
    // =========================================================================

    function openViewMasterTreeModal(masterId, onRefresh) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var master = _getCharacterById(masterId);
            if (!master) {
                _showToast('Master not found', 'error');
                return;
            }

            var apprentices = _getApprentices(masterId, false);
            var personIcon = _getIcon('PERSON');
            var masterIcon = _getIcon('CROWN');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var locationIcon = _getIcon('LOCATION');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var xIcon = _getIcon('X_HEAVY');

            function renderTree(apps, level) {
                level = level || 0;
                if (!apps || apps.length === 0) return '';

                var indent = level * 24;
                var html = '';
                for (var i = 0; i < apps.length; i++) {
                    var app = apps[i];
                    var skillIcon = _getIcon('CIRCLE_DOT');
                    var statusIcon = app.status === 'completed' ? checkIcon : (app.status === 'ended' ? xIcon : infoIcon);

                    html += '<div style="margin-left: ' + indent + 'px; margin-bottom: 8px;">' +
                        '<div class="tree-node" data-apprentice-id="' + app.character.id + '" style="' +
                            'background: var(--bg3);' +
                            'border-left: 2px solid ' + (app.status === 'completed' ? '#4a9060' : (app.status === 'ended' ? '#8a3020' : 'var(--accent)')) + ';' +
                            'border-radius: 4px;' +
                            'padding: 6px 10px;' +
                            'margin-bottom: 4px;' +
                            'cursor: pointer;' +
                            'transition: all 0.1s;' +
                        '">' +
                            '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                                '<div>' +
                                    '<strong>' + _escapeHtml(app.character.name) + ' ' + _escapeHtml(app.character.surname || '') + '</strong>' +
                                    '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + skillIcon + ' ' + app.skillLevel + '</span>' +
                                    '<span style="font-size: 0.55rem; color: var(--accent); margin-left: 8px;">' + (app.roleName || 'Unknown') + '</span>' +
                                    '<span style="font-size: 0.55rem; color: ' + (app.status === 'completed' ? '#4a9060' : 'var(--dim)') + ';">' + statusIcon + ' ' + app.status + '</span>' +
                                '</div>' +
                                '<div style="font-size: 0.55rem; color: var(--dim);">' +
                                    locationIcon + ' ' + _escapeHtml(_getCurrentLocation(app.character)) + ' · Started: ' + app.startYear +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }
                return html;
            }

            var totalApprentices = 0;

            function countApps(apps) {
                var count = apps.length;
                return count;
            }
            totalApprentices = countApps(apprentices);

            var modalContent = '<div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + masterIcon + ' ' + _escapeHtml(master.name) + ' ' + _escapeHtml(master.surname || '') + '</strong></div>' +
                '<div>' + locationIcon + ' ' + _escapeHtml(_getCurrentLocation(master)) + '</div>' +
                '<div>' + infoIcon + ' Apprentices: ' + totalApprentices + ' total</div>' +
            '</div>' +

            '<div id="masterTreeContainer" style="max-height: 500px; overflow-y: auto;">' +
                (apprentices.length === 0 ? '<div style="text-align: center; padding: 40px; color: var(--dim);">' + infoIcon + ' No apprentices found</div>' : renderTree(apprentices)) +
            '</div>' +

            '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Click on any apprentice to view their details' +
            '</div>';

            _openModal({
                title: 'Apprentice Tree: ' + master.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: ''
            });

            setTimeout(function() {
                var nodes = document.querySelectorAll('.tree-node');
                for (var i = 0; i < nodes.length; i++) {
                    var node = nodes[i];
                    node.addEventListener('click', function() {
                        var apprenticeId = this.dataset.apprenticeId;
                        var apprentice = _getCharacterById(apprenticeId);
                        if (apprentice) {
                            _closeTopModal();
                            if (typeof window.openCharacterDetailsModal === 'function') {
                                window.openCharacterDetailsModal(apprenticeId, function() {
                                    if (onRefresh) onRefresh();
                                });
                            } else {
                                _showToast('Selected: ' + apprentice.name, 'info');
                            }
                        }
                    });
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 14. FIND MASTER MODAL (NEW)
    // =========================================================================

    function openFindMasterModal(characterId, roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return;
            }

            var role = roleId ? _getRoleById(roleId) : null;
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var location = _getCurrentLocation(character);
            var locationId = _getLocationIdByName(location);

            var masters = _findPotentialMasters(roleId, locationId, 51);

            if (masters.length === 0) {
                _showToast('No potential masters found for ' + role.name, 'info');
                return;
            }

            var personIcon = _getIcon('PERSON');
            var masterIcon = _getIcon('CROWN');
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var searchIcon = _getIcon('SEARCH');

            var mastersHtml = masters.map(function(m) {
                var age = _calculateAge(m.character.birthYear, false, null);
                var rank = _getActiveRankDisplay(m.character);
                var rankDisplay = rank ? rank.display + ' ' : '';
                var sameLocation = m.sameLocation ? ' <span style="color: var(--success); font-size: 0.5rem;">(Same Location)</span>' : '';

                return '<div class="master-item" data-master-id="' + m.character.id + '" style="' +
                    'background: var(--bg3);' +
                    'border: 1px solid var(--border);' +
                    'border-radius: 8px;' +
                    'padding: 10px 12px;' +
                    'margin-bottom: 8px;' +
                    'cursor: pointer;' +
                    'transition: all 0.2s;' +
                '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                        '<div>' +
                            '<strong>' + rankDisplay + _escapeHtml(m.character.name) + ' ' + _escapeHtml(m.character.surname || '') + '</strong>' +
                            '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + age + ' years</span>' +
                            sameLocation +
                        '</div>' +
                        '<div style="text-align: right;">' +
                            '<div style="font-size: 0.65rem; color: var(--accent);">' + m.skillTier + ' (' + m.skillLevel + ')</div>' +
                            '<div style="font-size: 0.5rem; color: var(--dim);">' + m.apprenticeCount + ' apprentices</div>' +
                            '<div style="font-size: 0.5rem; color: var(--dim);">Score: ' + Math.round(m.score || 0) + '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');

            var modalContent = '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + searchIcon + ' Finding Master for ' + _escapeHtml(character.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                    'Role: ' + _escapeHtml(role.name) + ' · Location: ' + _escapeHtml(location) +
                '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + masters.length + ' potential masters found</div>' +
            '</div>' +

            '<div id="mastersList" style="max-height: 400px; overflow-y: auto;">' +
                mastersHtml +
            '</div>' +

            '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Click on a master to select them' +
            '</div>';

            _openModal({
                title: 'Find Master for ' + role.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                document.querySelectorAll('.master-item').forEach(function(item) {
                    item.addEventListener('click', function() {
                        var masterId = this.dataset.masterId;
                        var master = _getCharacterById(masterId);
                        if (master && onSuccess) {
                            _closeTopModal();
                            onSuccess(master);
                        }
                    });

                    item.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--accent-dim)';
                        this.style.borderColor = 'var(--accent)';
                    });

                    item.addEventListener('mouseleave', function() {
                        this.style.background = 'var(--bg3)';
                        this.style.borderColor = 'var(--border)';
                    });
                });
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.openCreateApprenticeshipModal = openCreateApprenticeshipModal;
    window.openEditApprenticeshipModal = openEditApprenticeshipModal;
    window.openApprenticeshipDetailsModal = openApprenticeshipDetailsModal;
    window.openViewMasterTreeModal = openViewMasterTreeModal;
    window.openFindMasterModal = openFindMasterModal;

    // Legacy aliases
    window._openCreateApprenticeshipModal = openCreateApprenticeshipModal;
    window._openEditApprenticeshipModal = openEditApprenticeshipModal;
    window._openApprenticeshipDetailsModal = openApprenticeshipDetailsModal;
    window._openViewMasterTreeModal = openViewMasterTreeModal;
    window._openFindMasterModal = openFindMasterModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateApprenticeshipModal: openCreateApprenticeshipModal,
            openEditApprenticeshipModal: openEditApprenticeshipModal,
            openApprenticeshipDetailsModal: openApprenticeshipDetailsModal,
            openViewMasterTreeModal: openViewMasterTreeModal,
            openFindMasterModal: openFindMasterModal
        };
    }

})();