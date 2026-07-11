/**
 * =============================================================================
 * STILL WATERS - EDUCATION MODALS (modals-education.js)
 * =============================================================================
 * 
 * This file contains ALL education UI modals.
 * This is the UI LAYER - it only handles rendering and user interaction.
 * All business logic is delegated to EducationCommands and EducationQueries.
 * 
 * ICON POLICY: NO EMOJIS - Use SVG icons from icons.js via _getIcon()
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - education-commands.js (EducationCommands)
 *   - education-queries.js (EducationQueries)
 *   - education-constants.js (EDUCATION_LEVELS, GENERAL_SUBJECTS, INSTITUTION_TYPES)
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
    // 2. ICON HELPERS (NO EMOJIS)
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
    // 3. AGE GROUPS FROM CONSTANTS.JS (NO EMOJIS)
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

    // NO EMOJI VERSION - returns empty string or icon from icons.js
    function _getAgeGroupIcon(group) {
        // Use icons from icons.js instead of emojis
        var iconMap = {
            '0-10': _getIcon('CIRCLE'),
            '11-20': _getIcon('CIRCLE_HALF_LEFT'),
            '21-30': _getIcon('CIRCLE_HALF_RIGHT'),
            '31-40': _getIcon('CIRCLE_QUARTER'),
            '41-50': _getIcon('CIRCLE_THREE_QUARTER'),
            '51-60': _getIcon('DIAMOND'),
            '61-70': _getIcon('DIAMOND_OUTLINE'),
            '71-80': _getIcon('SQUARE'),
            '81-90': _getIcon('SQUARE_OUTLINE'),
            '91+': _getIcon('STAR_4')
        };
        return iconMap[group] || _getIcon('CIRCLE_DOT');
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

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
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

    // =========================================================================
    // 5. LOCATION HELPER FUNCTIONS
    // =========================================================================

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getLocationTypeName(typeId) {
        if (typeof window.getLocationTypeName === 'function') {
            return window.getLocationTypeName(typeId);
        }
        var type = _getLocationTypeById(typeId);
        return type ? type.displayName : 'Unknown';
    }

    function _getRankById(id) {
        if (typeof window.getRankById === 'function') {
            return window.getRankById(id);
        }
        return null;
    }

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
    // 6. CHARACTER SELECTOR
    // =========================================================================

    function _openCharacterSelectorForEducation(title, onSelect, options) {
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
    // 7. EDUCATION HELPER FUNCTIONS
    // =========================================================================

    function _getInstitutionTypes() {
        if (typeof window.INSTITUTION_TYPES !== 'undefined') {
            return window.INSTITUTION_TYPES;
        }
        return {};
    }

    function _getAllSubjects() {
        if (typeof window.ALL_SUBJECTS !== 'undefined') {
            return window.ALL_SUBJECTS;
        }
        return {};
    }

    function _getEducationLevels() {
        if (typeof window.EDUCATION_LEVELS !== 'undefined') {
            return window.EDUCATION_LEVELS;
        }
        return {
            ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0, icon: '✗' },
            BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30, icon: '⌇' },
            LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60, icon: '⌇' },
            EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80, icon: '✓' },
            SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95, icon: '◉' }
        };
    }

    function _getEducationLevel(characterId) {
        if (typeof window.getEducationLevel === 'function') {
            return window.getEducationLevel(characterId);
        }
        return { id: 'illiterate', name: 'Illiterate' };
    }

    function _isLiterate(characterId) {
        if (typeof window.isLiterate === 'function') {
            return window.isLiterate(characterId);
        }
        return false;
    }

    // =========================================================================
    // 8. COMMAND WRAPPERS
    // =========================================================================

    function _createInstitution(name, typeId, locationId, options) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.createInstitution) {
            return window.EducationCommands.createInstitution(name, typeId, locationId, options);
        }
        if (typeof window.createEducationalInstitution === 'function') {
            return window.createEducationalInstitution(name, typeId, locationId, options);
        }
        _showToast('Create institution not available', 'error');
        return null;
    }

    function _updateInstitution(institutionId, updates) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.updateInstitution) {
            return window.EducationCommands.updateInstitution(institutionId, updates);
        }
        if (typeof window.updateEducationalInstitution === 'function') {
            return window.updateEducationalInstitution(institutionId, updates);
        }
        _showToast('Update institution not available', 'error');
        return false;
    }

    function _deleteInstitution(institutionId, cascade) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.deleteInstitution) {
            return window.EducationCommands.deleteInstitution(institutionId, cascade);
        }
        if (typeof window.deleteEducationalInstitution === 'function') {
            return window.deleteEducationalInstitution(institutionId, cascade);
        }
        _showToast('Delete institution not available', 'error');
        return false;
    }

    function _enrollStudent(institutionId, studentId, startYear) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.enrollStudent) {
            return window.EducationCommands.enrollStudent(institutionId, studentId, startYear);
        }
        if (typeof window.enrollStudent === 'function') {
            return window.enrollStudent(institutionId, studentId, startYear);
        }
        _showToast('Enroll student not available', 'error');
        return false;
    }

    function _withdrawStudent(institutionId, studentId, reason) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.withdrawStudent) {
            return window.EducationCommands.withdrawStudent(institutionId, studentId, reason);
        }
        if (typeof window.withdrawStudent === 'function') {
            return window.withdrawStudent(institutionId, studentId, reason);
        }
        _showToast('Withdraw student not available', 'error');
        return false;
    }

    function _graduateStudent(institutionId, studentId, graduationYear) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.graduateStudent) {
            return window.EducationCommands.graduateStudent(institutionId, studentId, graduationYear);
        }
        if (typeof window.graduateStudent === 'function') {
            return window.graduateStudent(institutionId, studentId, graduationYear);
        }
        _showToast('Graduate student not available', 'error');
        return false;
    }

    function _hireTeacher(institutionId, teacherId, subjectId, skill) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.hireTeacher) {
            return window.EducationCommands.hireTeacher(institutionId, teacherId, subjectId, skill);
        }
        if (typeof window.hireTeacher === 'function') {
            return window.hireTeacher(institutionId, teacherId, subjectId, skill);
        }
        _showToast('Hire teacher not available', 'error');
        return false;
    }

    function _fireTeacher(institutionId, teacherId, reason) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.fireTeacher) {
            return window.EducationCommands.fireTeacher(institutionId, teacherId, reason);
        }
        if (typeof window.fireTeacher === 'function') {
            return window.fireTeacher(institutionId, teacherId, reason);
        }
        _showToast('Fire teacher not available', 'error');
        return false;
    }

    function _setHeadmaster(institutionId, characterId, title, startYear) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.setHeadmaster) {
            return window.EducationCommands.setHeadmaster(institutionId, characterId, title, startYear);
        }
        if (typeof window.setHeadmaster === 'function') {
            return window.setHeadmaster(institutionId, characterId, title, startYear);
        }
        _showToast('Set headmaster not available', 'error');
        return false;
    }

    function _endHeadmasterTerm(institutionId, endYear, reason) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.endHeadmasterTerm) {
            return window.EducationCommands.endHeadmasterTerm(institutionId, endYear, reason);
        }
        if (typeof window.endHeadmasterTerm === 'function') {
            return window.endHeadmasterTerm(institutionId, endYear, reason);
        }
        _showToast('End headmaster term not available', 'error');
        return false;
    }

    function _updateReputation(institutionId, delta) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.updateReputation) {
            return window.EducationCommands.updateReputation(institutionId, delta);
        }
        if (typeof window.updateInstitutionReputation === 'function') {
            return window.updateInstitutionReputation(institutionId, delta);
        }
        return 0;
    }

    // =========================================================================
    // 9. QUERY WRAPPERS
    // =========================================================================

    function _getInstitution(id) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutionDetails) {
            return window.EducationQueries.getInstitutionDetails(id);
        }
        if (typeof window.getInstitutionDetails === 'function') {
            return window.getInstitutionDetails(id);
        }
        if (typeof window.getEducationalInstitution === 'function') {
            return window.getEducationalInstitution(id);
        }
        return null;
    }

    function _getAllInstitutions() {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutions) {
            return window.EducationQueries.getInstitutions({});
        }
        if (typeof window.getAllEducationalInstitutions === 'function') {
            return window.getAllEducationalInstitutions();
        }
        return [];
    }

    function _getInstitutionStudents(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutionStudents) {
            return window.EducationQueries.getInstitutionStudents(institutionId, true);
        }
        if (typeof window.getInstitutionStudents === 'function') {
            return window.getInstitutionStudents(institutionId, true);
        }
        return [];
    }

    function _getInstitutionTeachers(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutionTeachers) {
            return window.EducationQueries.getInstitutionTeachers(institutionId, true);
        }
        if (typeof window.getInstitutionTeachers === 'function') {
            return window.getInstitutionTeachers(institutionId, true);
        }
        return [];
    }

    function _getInstitutionGraduates(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutionGraduates) {
            return window.EducationQueries.getInstitutionGraduates(institutionId, true);
        }
        if (typeof window.getInstitutionGraduates === 'function') {
            return window.getInstitutionGraduates(institutionId, true);
        }
        return [];
    }

    function _getHeadmaster(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getHeadmaster) {
            return window.EducationQueries.getHeadmaster(institutionId);
        }
        if (typeof window.getHeadmaster === 'function') {
            return window.getHeadmaster(institutionId);
        }
        return null;
    }

    function _getHeadmasterHistory(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getHeadmasterHistory) {
            return window.EducationQueries.getHeadmasterHistory(institutionId);
        }
        if (typeof window.getHeadmasterHistory === 'function') {
            return window.getHeadmasterHistory(institutionId);
        }
        return [];
    }

    function _getInstitutionStatistics(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getInstitutionStatistics) {
            return window.EducationQueries.getInstitutionStatistics(institutionId);
        }
        if (typeof window.getInstitutionStatistics === 'function') {
            return window.getInstitutionStatistics(institutionId);
        }
        return {};
    }

    function _getLocationEducationSummary(locationId) {
        if (typeof window.EducationQueries !== 'undefined' && window.EducationQueries.getLocationEducationSummary) {
            return window.EducationQueries.getLocationEducationSummary(locationId, false);
        }
        if (typeof window.getLocationEducationSummary === 'function') {
            return window.getLocationEducationSummary(locationId, false);
        }
        return {};
    }

    function _getEligibleStudents(locationId, minAge, maxAge, institutionId) {
        if (typeof window.EducationLearning !== 'undefined' && window.EducationLearning.getEligibleStudents) {
            return window.EducationLearning.getEligibleStudents(locationId, minAge, maxAge, institutionId);
        }
        if (typeof window.getEligibleStudents === 'function') {
            return window.getEligibleStudents(locationId, minAge, maxAge, institutionId);
        }
        return [];
    }

    function _getStudentDemand(locationId) {
        if (typeof window.EducationLearning !== 'undefined' && window.EducationLearning.getStudentDemand) {
            return window.EducationLearning.getStudentDemand(locationId);
        }
        if (typeof window.getStudentDemand === 'function') {
            return window.getStudentDemand(locationId);
        }
        return {};
    }

    function _getInstitutionHistory(institutionId, limit, filterType) {
        if (typeof window.getInstitutionHistory === 'function') {
            return window.getInstitutionHistory(institutionId, filterType, limit);
        }
        return [];
    }

    function _getFormattedEducationHistory(institutionId, limit, filterType) {
        if (typeof window.getFormattedEducationHistory === 'function') {
            return window.getFormattedEducationHistory(institutionId, limit, filterType);
        }
        return '';
    }

    function _getInstitutionsNeedingTeachers(maxReputation, minStudents) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.getInstitutionsNeedingTeachers) {
            return window.EducationCommands.getInstitutionsNeedingTeachers(maxReputation, minStudents);
        }
        if (typeof window.getInstitutionsNeedingTeachers === 'function') {
            return window.getInstitutionsNeedingTeachers(maxReputation, minStudents);
        }
        return [];
    }

    // =========================================================================
    // 10. CREATE INSTITUTION MODAL
    // =========================================================================

    function openCreateInstitutionModal(onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institutionTypes = _getInstitutionTypes();
            var currentYear = _getCurrentYear();

            var locationId = null;
            if (typeof window.worldManager !== 'undefined' && window.worldManager.getSelectedLocation) {
                locationId = window.worldManager.getSelectedLocation();
            }

            var place = locationId ? _getPlaceById(locationId) : null;
            var locationName = place ? place.displayName : 'Unknown';

            var plusIcon = _getIcon('PLUS');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var typeOptions = Object.keys(institutionTypes).map(function(key) {
                var type = institutionTypes[key];
                var icon = type.icon || '⌂';
                return '<option value="' + key + '">' + icon + ' ' + _escapeHtml(type.name) + '</option>';
            }).join('');

            var locationOptions = _getLocationOptions(locationId, '-- Select a location --', true);

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                plusIcon + ' Create a new educational institution' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Institution Name *</label>' +
                '<input type="text" id="instName" placeholder="e.g., Oxford University, St. Mary\'s School" autofocus style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Institution Type</label>' +
                '<select id="instType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                '<select id="instLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                locationOptions +
                '</select>' +
                '<small style="font-size:0.55rem;color:var(--dim);">Current location: ' + _escapeHtml(locationName) + '</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Founded Year</label>' +
                '<input type="number" id="instFounded" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description (optional)</label>' +
                '<textarea id="instDesc" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="Brief description of the institution..."></textarea>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="instNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="Additional notes..."></textarea>' +
                '</div>';

            _openModal({
                title: plusIcon + ' Create Educational Institution',
                content: modalContent,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('instName').value.trim();
                    var typeId = document.getElementById('instType').value;
                    var locationId = document.getElementById('instLocation').value;
                    var foundedYear = parseInt(document.getElementById('instFounded').value);
                    var description = document.getElementById('instDesc').value;
                    var notes = document.getElementById('instNotes').value;

                    if (!name) {
                        _showToast('Please enter an institution name', 'error');
                        return false;
                    }

                    if (!locationId) {
                        _showToast('Please select a location', 'error');
                        return false;
                    }

                    if (isNaN(foundedYear) || foundedYear < 1) {
                        _showToast('Please enter a valid founded year', 'error');
                        return false;
                    }

                    var institution = _createInstitution(name, typeId, locationId, {
                        foundedYear: foundedYear,
                        description: description || null,
                        notes: notes || null
                    });

                    if (institution) {
                        _showToast('Institution "' + name + '" created', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(institution.id);
                    } else {
                        _showToast('Failed to create institution', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var nameInput = document.getElementById('instName');
                if (nameInput) nameInput.focus();
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 11. EDIT INSTITUTION MODAL
    // =========================================================================

    function openEditInstitutionModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var institutionTypes = _getInstitutionTypes();

            var editIcon = _getIcon('EDIT');

            var typeOptions = Object.keys(institutionTypes).map(function(key) {
                var type = institutionTypes[key];
                var icon = type.icon || '⌂';
                var selected = (key === inst.type) ? 'selected' : '';
                return '<option value="' + key + '" ' + selected + '>' + icon + ' ' + _escapeHtml(type.name) + '</option>';
            }).join('');

            var locationOptions = _getLocationOptions(inst.locationId, '-- Select a location --', true);

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                editIcon + ' Editing <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Institution Name</label>' +
                '<input type="text" id="editInstName" value="' + _escapeHtml(inst.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Institution Type</label>' +
                '<select id="editInstType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                '<select id="editInstLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                locationOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Founded Year</label>' +
                '<input type="number" id="editInstFounded" value="' + (inst.foundedYear || _getCurrentYear()) + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                '<textarea id="editInstDesc" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(inst.description || '') + '</textarea>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="editInstNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(inst.notes || '') + '</textarea>' +
                '</div>';

            _openModal({
                title: editIcon + ' Edit Institution: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editInstName').value.trim();
                    var typeId = document.getElementById('editInstType').value;
                    var locationId = document.getElementById('editInstLocation').value;
                    var foundedYear = parseInt(document.getElementById('editInstFounded').value);
                    var description = document.getElementById('editInstDesc').value;
                    var notes = document.getElementById('editInstNotes').value;

                    if (!name) {
                        _showToast('Please enter an institution name', 'error');
                        return false;
                    }

                    if (isNaN(foundedYear) || foundedYear < 1) {
                        _showToast('Please enter a valid founded year', 'error');
                        return false;
                    }

                    var updates = {
                        name: name,
                        type: typeId,
                        locationId: locationId,
                        foundedYear: foundedYear,
                        description: description || null,
                        notes: notes || null
                    };

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        _showToast('Institution updated', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update institution', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var nameInput = document.getElementById('editInstName');
                if (nameInput) nameInput.focus();
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 12. EDIT CURRICULUM MODAL
    // =========================================================================

    function openEditCurriculumModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentCurriculum = inst.curriculum || [];
            var roles = typeof window.getRoles === 'function' ? window.getRoles() : [];
            var allSubjects = _getAllSubjects();

            var gearIcon = _getIcon('GEAR');
            var crossIcon = _getIcon('X_HEAVY');

            // Build role options
            var roleOptions = roles.map(function(r) {
                var checked = currentCurriculum.some(function(c) {
                    return c.type === 'role' && c.id === r.id;
                });
                return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:0.6rem;">' +
                    '<input type="checkbox" class="curriculum-role-cb" value="' + r.id + '" ' + (checked ? 'checked' : '') + '>' +
                    '◉ ' + _escapeHtml(r.name) +
                    (r.specializations && r.specializations.length > 0 ?
                        ' <span style="color:var(--dim);font-size:0.5rem;">(' + r.specializations.slice(0, 3).join(', ') + (r.specializations.length > 3 ? '...' : '') + ')</span>' :
                        '') +
                    '</label>';
            }).join('');

            // Subject categories - NO EMOJIS
            var subjectCategories = {
                academic: { label: 'Academic Subjects', icon: '⌇' },
                science: { label: 'Sciences', icon: '⌇' },
                humanities: { label: 'Humanities', icon: '⌇' },
                social: { label: 'Social Sciences', icon: '⌇' },
                professional: { label: 'Professional Studies', icon: '⌇' },
                arts: { label: 'Arts', icon: '⌇' },
                legal: { label: 'Legal', icon: '⌇' },
                religious: { label: 'Religious', icon: '⌆' },
                language: { label: 'Languages', icon: '⌇' },
                military: { label: 'Military', icon: '⚔' },
                craft: { label: 'Craft', icon: '⌇' },
                commercial: { label: 'Commercial', icon: '⌇' }
            };

            var subjectHtml = '';
            var groupedSubjects = {};

            var allSubjectsKeys = Object.keys(allSubjects);
            for (var i = 0; i < allSubjectsKeys.length; i++) {
                var key = allSubjectsKeys[i];
                var subject = allSubjects[key];
                var category = subject.category || 'academic';
                if (!groupedSubjects[category]) {
                    groupedSubjects[category] = [];
                }
                groupedSubjects[category].push(subject);
            }

            var categoryOrder = ['academic', 'science', 'humanities', 'social', 'professional', 'arts', 'legal', 'religious', 'language', 'military', 'craft', 'commercial'];

            for (var ci = 0; ci < categoryOrder.length; ci++) {
                var cat = categoryOrder[ci];
                if (groupedSubjects[cat]) {
                    var catInfo = subjectCategories[cat] || { label: cat.charAt(0).toUpperCase() + cat.slice(1), icon: '⌇' };
                    subjectHtml += '<div style="margin-bottom:8px;">';
                    subjectHtml += '<div style="font-size:0.55rem;color:var(--accent);margin-bottom:4px;">' + catInfo.icon + ' ' + catInfo.label + '</div>';
                    subjectHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';

                    for (var si = 0; si < groupedSubjects[cat].length; si++) {
                        var s = groupedSubjects[cat][si];
                        var checked = currentCurriculum.some(function(c) {
                            return c.type === 'subject' && c.id === s.id;
                        });
                        subjectHtml += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.55rem;background:var(--bg2);padding:2px 8px;border-radius:12px;border:1px solid ' + (checked ? 'var(--accent)' : 'var(--border)') + ';">' +
                            '<input type="checkbox" class="curriculum-subject-cb" value="' + s.id + '" ' + (checked ? 'checked' : '') + '>' +
                            _escapeHtml(s.name) +
                            '</label>';
                    }

                    subjectHtml += '</div></div>';
                }
            }

            // Custom subjects
            var customSubjects = currentCurriculum.filter(function(c) {
                return c.type === 'custom';
            });
            var customSubjectsHtml = customSubjects.map(function(c, idx) {
                return '<div class="custom-subject-item" data-index="' + idx + '" style="display:flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:12px;border:1px solid var(--border);font-size:0.55rem;">' +
                    '<span>✎ ' + _escapeHtml(c.name) + '</span>' +
                    '<button class="remove-custom-subject-btn" data-index="' + idx + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.5rem;padding:0 2px;">' + crossIcon + '</button>' +
                    '</div>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                gearIcon + ' Editing curriculum for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + currentCurriculum.length + ' items currently in curriculum</div>' +
                '</div>' +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">◉ Roles (Professions)</div>' +
                '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:150px;overflow-y:auto;">' +
                roleOptions +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Select roles that this institution teaches</small>' +
                '</div>' +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Subjects (Academic Disciplines)</div>' +
                '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:250px;overflow-y:auto;">' +
                subjectHtml +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Select academic subjects taught at this institution</small>' +
                '</div>' +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">✎ Custom Subjects</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                '<input type="text" id="customSubjectInput" placeholder="Enter custom subject name..." style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                '<button id="addCustomSubjectBtn" class="btn small" style="padding:4px 12px;font-size:0.5rem;">+ Add</button>' +
                '</div>' +
                '<div id="customSubjectsContainer" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                (customSubjectsHtml || '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>') +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Add any subject not in the lists above</small>' +
                '</div>';

            _openModal({
                title: gearIcon + ' Edit Curriculum: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Curriculum',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newCurriculum = [];

                    var roleCheckboxes = document.querySelectorAll('.curriculum-role-cb:checked');
                    for (var i = 0; i < roleCheckboxes.length; i++) {
                        var roleId = roleCheckboxes[i].value;
                        var role = typeof window.getRoleById === 'function' ? window.getRoleById(roleId) : null;
                        if (role) {
                            newCurriculum.push({
                                type: 'role',
                                id: roleId,
                                name: role.name,
                                icon: '◉',
                                baseLearnRate: 10
                            });
                        }
                    }

                    var subjectCheckboxes = document.querySelectorAll('.curriculum-subject-cb:checked');
                    for (var i = 0; i < subjectCheckboxes.length; i++) {
                        var subjectId = subjectCheckboxes[i].value;
                        var subject = allSubjects[subjectId];
                        if (subject) {
                            newCurriculum.push({
                                type: 'subject',
                                id: subjectId,
                                name: subject.name,
                                icon: subject.icon || '⌇',
                                baseLearnRate: 10,
                                category: subject.category
                            });
                        }
                    }

                    var customItems = document.querySelectorAll('.custom-subject-item');
                    for (var i = 0; i < customItems.length; i++) {
                        var name = customItems[i].textContent.replace('✎', '').trim();
                        if (name) {
                            newCurriculum.push({
                                type: 'custom',
                                id: 'custom_' + Date.now() + '_' + i,
                                name: name,
                                icon: '✎',
                                baseLearnRate: 10,
                                isCustom: true
                            });
                        }
                    }

                    var taughtRoles = newCurriculum.filter(function(c) { return c.type === 'role'; }).map(function(c) { return c.id; });

                    var updates = {
                        curriculum: newCurriculum,
                        taughtRoles: taughtRoles,
                        isSpecialized: taughtRoles.length > 0
                    };

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        _showToast('Curriculum updated for ' + inst.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update curriculum', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var addBtn = document.getElementById('addCustomSubjectBtn');
                var input = document.getElementById('customSubjectInput');
                var container = document.getElementById('customSubjectsContainer');

                if (addBtn && input && container) {
                    var addCustomSubject = function() {
                        var name = input.value.trim();
                        if (!name) return;

                        var existing = container.querySelectorAll('.custom-subject-item');
                        for (var i = 0; i < existing.length; i++) {
                            if (existing[i].textContent.replace('✎', '').trim() === name) {
                                _showToast('Subject already exists', 'warning');
                                return;
                            }
                        }

                        var index = container.querySelectorAll('.custom-subject-item').length;
                        var item = document.createElement('div');
                        item.className = 'custom-subject-item';
                        item.dataset.index = index;
                        item.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:12px;border:1px solid var(--border);font-size:0.55rem;';
                        item.innerHTML = '<span>✎ ' + _escapeHtml(name) + '</span>' +
                            '<button class="remove-custom-subject-btn" data-index="' + index + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.5rem;padding:0 2px;">' + crossIcon + '</button>';

                        var emptyMsg = container.querySelector('span[style]');
                        if (emptyMsg && emptyMsg.textContent === 'No custom subjects added') {
                            container.innerHTML = '';
                        }

                        container.appendChild(item);
                        input.value = '';

                        item.querySelector('.remove-custom-subject-btn').addEventListener('click', function(e) {
                            e.stopPropagation();
                            var parent = this.closest('.custom-subject-item');
                            if (parent) parent.remove();
                            if (container.querySelectorAll('.custom-subject-item').length === 0) {
                                container.innerHTML = '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>';
                            }
                        });
                    };

                    addBtn.onclick = addCustomSubject;
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomSubject();
                        }
                    });

                    container.querySelectorAll('.remove-custom-subject-btn').forEach(function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var parent = this.closest('.custom-subject-item');
                            if (parent) parent.remove();
                            if (container.querySelectorAll('.custom-subject-item').length === 0) {
                                container.innerHTML = '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>';
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
    // 13. INSTITUTION DETAILS MODAL
    // =========================================================================

    function openInstitutionDetailsModal(institutionId, onRefresh) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institutionData = _getInstitution(institutionId);
            if (!institutionData) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institutionData.institution || institutionData;
            var students = institutionData.students || [];
            var teachers = institutionData.teachers || [];
            var graduates = institutionData.graduates || [];
            var headmaster = institutionData.headmaster || null;
            var stats = _getInstitutionStatistics(institutionId);

            var bookIcon = _getIcon('BOOK');
            var personIcon = _getIcon('PERSON');
            var gearIcon = _getIcon('GEAR');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var locationIcon = _getIcon('LOCATION');
            var starIcon = _getIcon('STAR_4');

            var place = _getPlaceById(inst.locationId);
            var locationName = place ? place.displayName : 'Unknown';
            var institutionTypes = _getInstitutionTypes();
            var institutionType = institutionTypes[inst.type] || { name: inst.type || 'Unknown' };

            // Students list - NO EMOJIS
            var studentsHtml = '';
            if (students.length === 0) {
                studentsHtml = '<div style="color:var(--dim);font-size:0.55rem;padding:4px;">No students enrolled</div>';
            } else {
                studentsHtml = students.map(function(s) {
                    var char = s.character || _getCharacterById(s.record.studentId);
                    var charName = char ? (char.name + ' ' + (char.surname || '')).trim() : 'Unknown';
                    var age = char ? _calculateAge(char.birthYear, false, null) : '?';
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + personIcon + ' ' + _escapeHtml(charName) + '</span>' +
                        '<span style="color:var(--dim);">Enrolled: ' + (s.record.enrollmentYear || '?') + ' · Age: ' + age + '</span>' +
                        '</div>';
                }).join('');
            }

            // Teachers list - NO EMOJIS
            var teachersHtml = '';
            if (teachers.length === 0) {
                teachersHtml = '<div style="color:var(--dim);font-size:0.55rem;padding:4px;">No teachers hired</div>';
            } else {
                teachersHtml = teachers.map(function(t) {
                    var char = t.character || _getCharacterById(t.record.teacherId);
                    var name = char ? char.name : t.record.teacherName;
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + personIcon + ' ' + _escapeHtml(name) + '</span>' +
                        '<span style="color:var(--dim);">' + _escapeHtml(t.record.subjectName) + ' · ' + (t.record.skill || 0) + '%</span>' +
                        '</div>';
                }).join('');
            }

            // Graduates list - NO EMOJIS
            var graduatesHtml = '';
            if (graduates.length === 0) {
                graduatesHtml = '<div style="color:var(--dim);font-size:0.55rem;padding:4px;">No graduates yet</div>';
            } else {
                graduatesHtml = graduates.map(function(g) {
                    var char = g.character || _getCharacterById(g.record.studentId);
                    var charName = char ? (char.name + ' ' + (char.surname || '')).trim() : 'Unknown';
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + starIcon + ' ' + _escapeHtml(charName) + '</span>' +
                        '<span style="color:var(--dim);">Graduated: ' + (g.record.graduationYear || '?') + '</span>' +
                        '</div>';
                }).join('');
            }

            // Curriculum
            var curriculumHtml = '';
            if (inst.curriculum && inst.curriculum.length > 0) {
                curriculumHtml = inst.curriculum.map(function(c) {
                    var icon = c.icon || (c.type === 'role' ? '◉' : (c.type === 'custom' ? '✎' : '⌇'));
                    return '<span style="background:var(--bg3);padding:2px 8px;border-radius:12px;font-size:0.55rem;border:1px solid var(--border);">' +
                        icon + ' ' + _escapeHtml(c.name) +
                        '</span>';
                }).join(' ');
            } else {
                curriculumHtml = '<span style="color:var(--dim);font-size:0.55rem;">No curriculum defined</span>';
            }

            // History
            var historyHtml = '';
            var historyFormatted = _getFormattedEducationHistory(institutionId, 10);
            if (historyFormatted) {
                historyHtml = '<div style="margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Recent History</div>' +
                    '<div style="max-height:120px;overflow-y:auto;">' + historyFormatted + '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div class="institution-details" style="max-width:600px;">' +
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                '<div>' +
                '<div style="font-size:1.1rem;font-weight:bold;">' + bookIcon + ' ' + _escapeHtml(inst.name) + '</div>' +
                '<div style="font-size:0.65rem;color:var(--dim);">' + locationIcon + ' ' + _escapeHtml(locationName) + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                '<span style="background:var(--accent-dim);padding:2px 8px;border-radius:12px;font-size:0.6rem;">' + _escapeHtml(institutionType.name) + '</span>' +
                (inst.isSpecialized ? '<span style="background:var(--accent-dim);padding:2px 8px;border-radius:12px;font-size:0.6rem;margin-left:4px;">◉ Specialized</span>' : '') +
                '</div>' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Founded: ' + (inst.foundedYear || 'Unknown') + ' · Reputation: ' + (stats.reputation || 50) + '</div>' +
                (inst.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + _escapeHtml(inst.description) + '</div>' : '') +
                '</div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                '<div style="font-size:1.2rem;font-weight:bold;color:var(--accent);">' + (stats.studentCount || 0) + '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">Students</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                '<div style="font-size:1.2rem;font-weight:bold;color:var(--accent);">' + (stats.teacherCount || 0) + '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">Teachers</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                '<div style="font-size:1.2rem;font-weight:bold;color:var(--accent);">' + (stats.graduateCount || 0) + '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">Graduates</div>' +
                '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Curriculum</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-height:30px;">' +
                curriculumHtml +
                '</div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Students (' + (stats.studentCount || 0) + ')</div>' +
                '<div style="max-height:120px;overflow-y:auto;font-size:0.55rem;">' + studentsHtml + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + gearIcon + ' Teachers (' + (stats.teacherCount || 0) + ')</div>' +
                '<div style="max-height:120px;overflow-y:auto;font-size:0.55rem;">' + teachersHtml + '</div>' +
                '</div>' +
                '</div>' +

                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + starIcon + ' Graduates (' + (stats.graduateCount || 0) + ')</div>' +
                '<div style="max-height:120px;overflow-y:auto;font-size:0.55rem;">' + graduatesHtml + '</div>' +
                '</div>' +

                (headmaster ?
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">◉ Headmaster</div>' +
                    '<div style="font-size:0.55rem;">' + personIcon + ' ' + _escapeHtml(headmaster.details.name) + ' · ' + _escapeHtml(headmaster.details.title || 'Headmaster') + ' (since ' + headmaster.details.startYear + ')</div>' +
                    '</div>' :
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;color:var(--dim);font-size:0.55rem;">◉ No headmaster appointed</div>'
                ) +

                historyHtml +

                '<div class="action-buttons" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:16px;">' +
                '<button id="editInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">✏️ Edit</button>' +
                '<button id="curriculumInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">⚙️ Curriculum</button>' +
                '<button id="enrollInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">👤 Enroll</button>' +
                '<button id="hireInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">+ Hire</button>' +
                '<button id="headmasterInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">◉ Headmaster</button>' +
                '<button id="deleteInstDetailsBtn" class="btn danger" style="padding:6px 12px;font-size:0.6rem;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">✗ Delete</button>' +
                '</div></div>';

            _openModal({
                title: bookIcon + ' Institution Details: ' + inst.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    if (onRefresh) onRefresh();
                }
            });

            setTimeout(function() {
                var editBtn = document.getElementById('editInstDetailsBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        _closeTopModal();
                        openEditInstitutionModal(institutionId, function() {
                            openInstitutionDetailsModal(institutionId, onRefresh);
                        });
                    };
                }

                var curriculumBtn = document.getElementById('curriculumInstDetailsBtn');
                if (curriculumBtn) {
                    curriculumBtn.onclick = function() {
                        _closeTopModal();
                        openEditCurriculumModal(institutionId, function() {
                            openInstitutionDetailsModal(institutionId, onRefresh);
                        });
                    };
                }

                var enrollBtn = document.getElementById('enrollInstDetailsBtn');
                if (enrollBtn) {
                    enrollBtn.onclick = function() {
                        _closeTopModal();
                        openEnrollStudentModal(institutionId, function() {
                            openInstitutionDetailsModal(institutionId, onRefresh);
                        });
                    };
                }

                var hireBtn = document.getElementById('hireInstDetailsBtn');
                if (hireBtn) {
                    hireBtn.onclick = function() {
                        _closeTopModal();
                        openHireTeacherModal(institutionId, function() {
                            openInstitutionDetailsModal(institutionId, onRefresh);
                        });
                    };
                }

                var headmasterBtn = document.getElementById('headmasterInstDetailsBtn');
                if (headmasterBtn) {
                    headmasterBtn.onclick = function() {
                        _closeTopModal();
                        openSetHeadmasterModal(institutionId, function() {
                            openInstitutionDetailsModal(institutionId, onRefresh);
                        });
                    };
                }

                var deleteBtn = document.getElementById('deleteInstDetailsBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        _closeTopModal();
                        openDeleteInstitutionModal(institutionId, function() {
                            if (onRefresh) onRefresh();
                        });
                    };
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 14. ENROLL STUDENT MODAL
    // =========================================================================

    function openEnrollStudentModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentYear = _getCurrentYear();

            var eligibleStudents = _getEligibleStudents(inst.locationId, 7, 16, institutionId);

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            if (eligibleStudents.length === 0) {
                _showToast('No eligible students available for enrollment', 'error');
                return;
            }

            var studentOptions = eligibleStudents.map(function(e) {
                var char = e.character;
                var age = e.age;
                var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
                return '<option value="' + char.id + '">' + personIcon + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' (' + age + 'y ' + genderSymbol + ')</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                'Enroll student in <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + infoIcon + ' ' + (inst.students ? inst.students.length : 0) + ' of ' + (inst.maxStudents || 30) + ' capacity</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Student</label>' +
                '<select id="enrollStudentSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                studentOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Enrollment Year</label>' +
                '<input type="number" id="enrollYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Notes (optional)</label>' +
                '<textarea id="enrollNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="e.g., Scholarship, Recommended by..."></textarea>' +
                '</div>';

            _openModal({
                title: 'Enroll Student',
                content: modalContent,
                confirmText: 'Enroll',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var studentId = document.getElementById('enrollStudentSelect').value;
                    var year = parseInt(document.getElementById('enrollYear').value);
                    var notes = document.getElementById('enrollNotes').value;

                    if (!studentId) {
                        _showToast('Please select a student', 'error');
                        return false;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _enrollStudent(institutionId, studentId, year);

                    if (result) {
                        var student = _getCharacterById(studentId);
                        _showToast((student ? student.name : 'Student') + ' enrolled', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to enroll student', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 15. HIRE TEACHER MODAL
    // =========================================================================

    function openHireTeacherModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var allChars = _getCharacters();
            var teacherIds = {};
            if (inst.teachers) {
                for (var i = 0; i < inst.teachers.length; i++) {
                    teacherIds[inst.teachers[i].teacherId] = true;
                }
            }

            var eligibleTeachers = [];
            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                if (c.isDeceased) continue;
                if (teacherIds[c.id]) continue;
                if (!c.professions || c.professions.length === 0) continue;
                eligibleTeachers.push(c);
            }

            var gearIcon = _getIcon('GEAR');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            if (eligibleTeachers.length === 0) {
                _showToast('No eligible teachers available', 'error');
                return;
            }

            var teacherOptions = eligibleTeachers.map(function(c) {
                var age = _calculateAge(c.birthYear, false, null);
                var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                var professionNames = (c.professions || []).map(function(p) { return p.name; }).join(', ');
                return '<option value="' + c.id + '" data-professions="' + _escapeHtml(professionNames) + '">' +
                    personIcon + ' ' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') +
                    ' (' + age + 'y ' + genderSymbol + ') - ' + _escapeHtml(professionNames) +
                    '</option>';
            }).join('');

            var curriculumItems = inst.curriculum || [];
            var subjectOptions = curriculumItems.map(function(item) {
                var icon = item.icon || (item.type === 'role' ? '◉' : '⌇');
                return '<option value="' + item.id + '">' + icon + ' ' + _escapeHtml(item.name) + ' (' + item.type + ')</option>';
            }).join('');

            if (!subjectOptions) {
                subjectOptions = '<option value="">No curriculum subjects available</option>';
            }

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                'Hire teacher for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + infoIcon + ' ' + (inst.teachers ? inst.teachers.length : 0) + ' teachers currently hired</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Teacher</label>' +
                '<select id="hireTeacherSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                teacherOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + gearIcon + ' Subject to Teach</label>' +
                '<select id="hireSubjectSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                subjectOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Skill Level (0-100)</label>' +
                '<input type="number" id="hireSkill" value="50" min="1" max="100" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>';

            _openModal({
                title: 'Hire Teacher',
                content: modalContent,
                confirmText: 'Hire',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var teacherId = document.getElementById('hireTeacherSelect').value;
                    var subjectId = document.getElementById('hireSubjectSelect').value;
                    var skill = parseInt(document.getElementById('hireSkill').value);

                    if (!teacherId) {
                        _showToast('Please select a teacher', 'error');
                        return false;
                    }

                    if (!subjectId) {
                        _showToast('Please select a subject', 'error');
                        return false;
                    }

                    if (isNaN(skill) || skill < 0 || skill > 100) {
                        _showToast('Please enter a valid skill level (1-100)', 'error');
                        return false;
                    }

                    var result = _hireTeacher(institutionId, teacherId, subjectId, skill);

                    if (result) {
                        var teacher = _getCharacterById(teacherId);
                        _showToast((teacher ? teacher.name : 'Teacher') + ' hired', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to hire teacher', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 16. SET HEADMASTER MODAL
    // =========================================================================

    function openSetHeadmasterModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentHeadmaster = institution.headmaster || null;
            var allChars = _getCharacters();
            var currentYear = _getCurrentYear();

            var eligible = [];
            var currentHeadmasterId = currentHeadmaster ? currentHeadmaster.details.characterId : null;

            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                if (c.isDeceased) continue;
                if (currentHeadmasterId && c.id === currentHeadmasterId) continue;
                eligible.push(c);
            }

            var crownIcon = _getIcon('CROWN');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var headmasterOptions = eligible.map(function(c) {
                var age = _calculateAge(c.birthYear, false, null);
                var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                var rank = c.activeRankId && typeof window.getRankById === 'function' ? window.getRankById(c.activeRankId) : null;
                var rankDisplay = rank ? rank.symbol + ' ' : '';
                return '<option value="' + c.id + '">' + rankDisplay + personIcon + ' ' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + ' (' + age + 'y ' + genderSymbol + ')</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                crownIcon + ' Appoint Headmaster for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                (currentHeadmaster ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current: ' + _escapeHtml(currentHeadmaster.details.name) + ' (' + _escapeHtml(currentHeadmaster.details.title || 'Headmaster') + ' since ' + currentHeadmaster.details.startYear + ')</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Headmaster</label>' +
                '<select id="headmasterSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<option value="">' + infoIcon + ' Select a character</option>' +
                headmasterOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Title</label>' +
                '<input type="text" id="headmasterTitle" value="Headmaster" placeholder="e.g., Dean, Rector, Principal" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="headmasterStartYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                (currentHeadmaster ?
                    '<div style="margin-top:12px;padding:12px;background:rgba(200,112,64,0.1);border-radius:6px;border:1px solid var(--warn);">' +
                    '<button id="endHeadmasterTermBtn" class="btn small danger" style="background:#8a5a20;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">✗ End Current Headmaster\'s Term</button>' +
                    '<span style="font-size:0.5rem;color:var(--dim);margin-left:8px;">This will end the current headmaster\'s term</span>' +
                    '</div>' :
                    ''
                );

            _openModal({
                title: crownIcon + ' Appoint Headmaster',
                content: modalContent,
                confirmText: 'Appoint',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var characterId = document.getElementById('headmasterSelect').value;
                    var title = document.getElementById('headmasterTitle').value.trim();
                    var startYear = parseInt(document.getElementById('headmasterStartYear').value);

                    if (!characterId) {
                        _showToast('Please select a headmaster', 'error');
                        return false;
                    }

                    if (!title) {
                        _showToast('Please enter a title', 'error');
                        return false;
                    }

                    if (isNaN(startYear) || startYear < 1) {
                        _showToast('Please enter a valid start year', 'error');
                        return false;
                    }

                    var result = _setHeadmaster(institutionId, characterId, title, startYear);

                    if (result) {
                        var character = _getCharacterById(characterId);
                        _showToast((character ? character.name : 'Character') + ' appointed as ' + title, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to appoint headmaster', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var endBtn = document.getElementById('endHeadmasterTermBtn');
                if (endBtn) {
                    endBtn.onclick = function() {
                        _confirmDialog('End the current headmaster\'s term?', 'End Term', function() {
                            var endYear = _getCurrentYear();
                            var result = _endHeadmasterTerm(institutionId, endYear, 'Term ended');
                            if (result) {
                                _showToast('Headmaster term ended', 'success');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast('Failed to end term', 'error');
                            }
                        });
                    };
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 17. DELETE INSTITUTION MODAL
    // =========================================================================

    function openDeleteInstitutionModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var students = institution.students || [];
            var teachers = institution.teachers || [];
            var graduates = institution.graduates || [];

            var warningIcon = _getIcon('WARNING');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                '<strong>' + warningIcon + ' Warning: This action cannot be undone!</strong>' +
                '<div style="margin-top:8px;">You are about to delete the institution "<strong>' + _escapeHtml(inst.name) + '</strong>".</div>' +
                (students.length > 0 ? '<div style="margin-top:8px;">' + infoIcon + ' ' + students.length + ' students enrolled</div>' : '') +
                (teachers.length > 0 ? '<div style="margin-top:4px;">' + infoIcon + ' ' + teachers.length + ' teachers hired</div>' : '') +
                (graduates.length > 0 ? '<div style="margin-top:4px;">' + infoIcon + ' ' + graduates.length + ' graduates</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Type "<strong>' + _escapeHtml(inst.name) + '</strong>" to confirm</label>' +
                '<input type="text" id="confirmDeleteInstName" placeholder="Enter institution name" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;">' +
                '<input type="checkbox" id="deleteCascade">' +
                '<span style="font-size:0.65rem;">' + infoIcon + ' Also delete associated data (student records, teacher records)</span>' +
                '</label>' +
                '<small style="font-size:0.5rem;color:var(--dim);">If unchecked, student and teacher records will be preserved</small>' +
                '</div>' +

                '<div style="margin-top:12px;padding:8px;background:rgba(200,68,68,0.1);border-radius:6px;font-size:0.55rem;color:#8a3020;">' +
                'This action cannot be undone. The institution will be permanently removed.' +
                '</div>';

            _openModal({
                title: 'Delete Institution: ' + inst.name,
                content: modalContent,
                confirmText: 'Permanently Delete',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var confirmName = document.getElementById('confirmDeleteInstName').value.trim();
                    if (confirmName !== inst.name) {
                        _showToast('Institution name does not match', 'error');
                        return false;
                    }

                    var cascade = document.getElementById('deleteCascade').checked;
                    var success = _deleteInstitution(institutionId, cascade);

                    if (success) {
                        _showToast('Institution "' + inst.name + '" deleted', 'info');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete institution', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.openCreateInstitutionModal = openCreateInstitutionModal;
    window.openEditInstitutionModal = openEditInstitutionModal;
    window.openEditCurriculumModal = openEditCurriculumModal;
    window.openInstitutionDetailsModal = openInstitutionDetailsModal;
    window.openEnrollStudentModal = openEnrollStudentModal;
    window.openHireTeacherModal = openHireTeacherModal;
    window.openSetHeadmasterModal = openSetHeadmasterModal;
    window.openDeleteInstitutionModal = openDeleteInstitutionModal;

    // Helper functions for other modals
    window._getLocationTypeName = _getLocationTypeName;
    window._getRankById = _getRankById;
    window._getEducationLevels = _getEducationLevels;
    window._getIconHTML = _getIconHTML;
    window._getAgeGroups = _getAgeGroups;
    window._getAgeGroupLabel = _getAgeGroupLabel;
    window._getAgeGroupIcon = _getAgeGroupIcon;

    // Legacy aliases
    window._openCreateInstitutionModal = openCreateInstitutionModal;
    window._openEditInstitutionModal = openEditInstitutionModal;
    window._openEditCurriculumModal = openEditCurriculumModal;
    window._openInstitutionDetailsModal = openInstitutionDetailsModal;
    window._openEnrollStudentModal = openEnrollStudentModal;
    window._openHireTeacherModal = openHireTeacherModal;
    window._openSetHeadmasterModal = openSetHeadmasterModal;
    window._openDeleteInstitutionModal = openDeleteInstitutionModal;

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
            _getLocationTypeName: _getLocationTypeName,
            _getRankById: _getRankById,
            _getEducationLevels: _getEducationLevels,
            _getIconHTML: _getIconHTML,
            _getAgeGroups: _getAgeGroups,
            _getAgeGroupLabel: _getAgeGroupLabel,
            _getAgeGroupIcon: _getAgeGroupIcon
        };
    }

})();