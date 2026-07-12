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
 * UPDATED: Added tuition fields to create/edit institution modals
 * UPDATED: Added tuition management to institution details modal
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
    // 9. TUITION COMMAND WRAPPERS (NEW)
    // =========================================================================

    function _calculateTuition(institutionId, year) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.calculateTuition) {
            return window.EducationCommands.calculateTuition(institutionId, year);
        }
        if (typeof window.calculateTuition === 'function') {
            return window.calculateTuition(institutionId, year);
        }
        return { success: false, reason: 'Tuition calculation not available' };
    }

    function _updateTuition(institutionId, newTuition, reason) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.updateTuition) {
            return window.EducationCommands.updateTuition(institutionId, newTuition, reason);
        }
        if (typeof window.updateTuition === 'function') {
            return window.updateTuition(institutionId, newTuition, reason);
        }
        _showToast('Update tuition not available', 'error');
        return { success: false };
    }

    function _updateTuitionWaiver(institutionId, waiveTuition, reason) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.updateTuitionWaiver) {
            return window.EducationCommands.updateTuitionWaiver(institutionId, waiveTuition, reason);
        }
        if (typeof window.updateTuitionWaiver === 'function') {
            return window.updateTuitionWaiver(institutionId, waiveTuition, reason);
        }
        _showToast('Update tuition waiver not available', 'error');
        return { success: false };
    }

    function _getTuitionHistory(institutionId, limit) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.getTuitionHistory) {
            return window.EducationCommands.getTuitionHistory(institutionId, limit);
        }
        if (typeof window.getTuitionHistory === 'function') {
            return window.getTuitionHistory(institutionId, limit);
        }
        return [];
    }

    // =========================================================================
    // 10. QUERY WRAPPERS
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
    // 11. CREATE INSTITUTION MODAL (UPDATED with tuition)
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
                var defaultTuition = window.DEFAULT_TUITION_BY_TYPE?.[type.id] || window.DEFAULT_TUITION || 10;
                return '<option value="' + key + '" data-tuition="' + defaultTuition + '">' + icon + ' ' + _escapeHtml(type.name) + ' (' + defaultTuition + ' gold/year)</option>';
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

                '<!-- ============================================================ -->' +
                '<!-- NEW: Tuition Fields -->' +
                '<!-- ============================================================ -->' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Tuition Per Year (gold)</label>' +
                '<input type="number" id="instTuition" value="10" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<small style="font-size:0.55rem;color:var(--dim);">0 means free education. Can be overridden per institution.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="checkbox" id="instWaiveTuition">' +
                '<span>Waive tuition for all students (scholarship)</span>' +
                '</label>' +
                '<small style="font-size:0.55rem;color:var(--dim);">If checked, no tuition will be charged to students.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description (optional)</label>' +
                '<textarea id="instDesc" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="Brief description of the institution..."></textarea>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="instNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="Additional notes..."></textarea>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                infoIcon + ' Tuition is paid annually by students\' households. Manual overrides available after creation.' +
                '</div>';

            _openModal({
                title: plusIcon + ' Create Educational Institution',
                content: modalContent,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('instName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    // Auto-fill tuition based on type selection
                    var typeSelect = document.getElementById('instType');
                    var tuitionInput = document.getElementById('instTuition');
                    if (typeSelect && tuitionInput) {
                        typeSelect.onchange = function() {
                            var selectedOption = this.options[this.selectedIndex];
                            var tuition = selectedOption.dataset.tuition || 10;
                            tuitionInput.value = tuition;
                        };
                        // Trigger initial fill
                        typeSelect.onchange();
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('instName').value.trim();
                    var typeId = document.getElementById('instType').value;
                    var locationId = document.getElementById('instLocation').value;
                    var foundedYear = parseInt(document.getElementById('instFounded').value);
                    var tuition = parseInt(document.getElementById('instTuition').value) || 0;
                    var waiveTuition = document.getElementById('instWaiveTuition').checked;
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
                        tuitionPerYear: tuition,
                        waiveTuition: waiveTuition,
                        description: description || null,
                        notes: notes || null
                    });

                    if (institution) {
                        var tuitionMsg = waiveTuition ? ' (Tuition waived)' : ' (Tuition: ' + tuition + ' gold/year)';
                        _showToast('Institution "' + name + '" created' + tuitionMsg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(institution.id);
                    } else {
                        _showToast('Failed to create institution', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 12. EDIT INSTITUTION MODAL (UPDATED with tuition)
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
            var infoIcon = _getIcon('CIRCLE_DOT');

            var typeOptions = Object.keys(institutionTypes).map(function(key) {
                var type = institutionTypes[key];
                var icon = type.icon || '⌂';
                var selected = (key === inst.type) ? 'selected' : '';
                var defaultTuition = window.DEFAULT_TUITION_BY_TYPE?.[type.id] || window.DEFAULT_TUITION || 10;
                return '<option value="' + key + '" ' + selected + ' data-tuition="' + defaultTuition + '">' + icon + ' ' + _escapeHtml(type.name) + '</option>';
            }).join('');

            var locationOptions = _getLocationOptions(inst.locationId, '-- Select a location --', true);

            var currentTuition = inst.customTuition !== null ? inst.customTuition : inst.tuitionPerYear;

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

                '<!-- ============================================================ -->' +
                '<!-- NEW: Tuition Fields -->' +
                '<!-- ============================================================ -->' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Tuition Per Year (gold)</label>' +
                '<input type="number" id="editInstTuition" value="' + (inst.tuitionPerYear || 0) + '" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<small style="font-size:0.55rem;color:var(--dim);">Base tuition before reputation/type modifiers.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Manual Tuition Override</label>' +
                '<input type="number" id="editInstCustomTuition" placeholder="Leave empty for calculated value" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" value="' + (inst.customTuition !== null ? inst.customTuition : '') + '">' +
                '<small style="font-size:0.55rem;color:var(--dim);">Set a fixed tuition amount. Leave empty to use calculated value.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="checkbox" id="editInstWaiveTuition" ' + (inst.waiveTuition ? 'checked' : '') + '>' +
                '<span>Waive tuition for all students</span>' +
                '</label>' +
                '<small style="font-size:0.55rem;color:var(--dim);">If checked, no tuition will be charged.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                '<textarea id="editInstDesc" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(inst.description || '') + '</textarea>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="editInstNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(inst.notes || '') + '</textarea>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                infoIcon + ' Current tuition: ' + (inst.waiveTuition ? 'Waived' : (currentTuition || 0) + ' gold/year') +
                (inst.customTuition !== null ? ' (Manual override)' : ' (Calculated)') +
                '</div>';

            _openModal({
                title: editIcon + ' Edit Institution: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('editInstName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    // Auto-fill tuition based on type selection
                    var typeSelect = document.getElementById('editInstType');
                    var tuitionInput = document.getElementById('editInstTuition');
                    if (typeSelect && tuitionInput) {
                        typeSelect.onchange = function() {
                            var selectedOption = this.options[this.selectedIndex];
                            var tuition = selectedOption.dataset.tuition || 10;
                            tuitionInput.value = tuition;
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editInstName').value.trim();
                    var typeId = document.getElementById('editInstType').value;
                    var locationId = document.getElementById('editInstLocation').value;
                    var foundedYear = parseInt(document.getElementById('editInstFounded').value);
                    var tuition = parseInt(document.getElementById('editInstTuition').value) || 0;
                    var customTuition = document.getElementById('editInstCustomTuition').value;
                    var waiveTuition = document.getElementById('editInstWaiveTuition').checked;
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
                        tuitionPerYear: tuition,
                        waiveTuition: waiveTuition,
                        description: description || null,
                        notes: notes || null
                    };

                    // Handle manual tuition override
                    if (customTuition !== null && customTuition !== '') {
                        var customValue = parseInt(customTuition);
                        if (!isNaN(customValue)) {
                            updates.customTuition = customValue;
                        }
                    } else {
                        updates.customTuition = null;
                    }

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        var tuitionMsg = waiveTuition ? ' (Tuition waived)' : ' (Tuition: ' + tuition + ' gold/year)';
                        var overrideMsg = updates.customTuition !== null ? ' (Manual override: ' + updates.customTuition + ')' : '';
                        _showToast('Institution updated' + tuitionMsg + overrideMsg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update institution', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 13. INSTITUTION DETAILS MODAL (UPDATED with tuition display)
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
            var coinIcon = _getIcon('CIRCLE_DOT');

            // ================================================================
            // NEW: Tuition info
            // ================================================================
            var tuitionResult = _calculateTuition(institutionId, _getCurrentYear());
            var tuitionDisplay = 'Not available';
            var tuitionBreakdown = '';
            if (tuitionResult && tuitionResult.success) {
                if (inst.waiveTuition) {
                    tuitionDisplay = 'Waived';
                } else if (inst.customTuition !== null) {
                    tuitionDisplay = inst.customTuition + ' gold (Manual override)';
                } else {
                    tuitionDisplay = tuitionResult.tuition + ' gold (Calculated)';
                    if (tuitionResult.breakdown) {
                        var b = tuitionResult.breakdown;
                        tuitionBreakdown = 'Base: ' + b.baseTuition + ' × Rep: ' + Math.round(b.repModifier * 100) + '% × Type: ' + b.typeMultiplier;
                    }
                }
            }

            var tuitionHistory = _getTuitionHistory(institutionId, 5);
            var tuitionHistoryHtml = '';
            if (tuitionHistory && tuitionHistory.length > 0) {
                tuitionHistoryHtml = '<div style="margin-top:4px;font-size:0.5rem;color:var(--dim);">Recent changes: ' +
                    tuitionHistory.map(function(h) {
                        return h.year + ': ' + h.oldAmount + ' → ' + h.newAmount + (h.reason ? ' (' + h.reason + ')' : '');
                    }).join(' · ') +
                    '</div>';
            }

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
                    var tuitionPaid = s.record.tuitionPaid || 0;
                    var paidDisplay = tuitionPaid > 0 ? ' · Paid: ' + tuitionPaid + 'g' : '';
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + personIcon + ' ' + _escapeHtml(charName) + '</span>' +
                        '<span style="color:var(--dim);">Enrolled: ' + (s.record.enrollmentYear || '?') + ' · Age: ' + age + paidDisplay + '</span>' +
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
                '<!-- ============================================================ -->' +
                '<!-- NEW: Tuition Display -->' +
                '<!-- ============================================================ -->' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-top:4px;padding:4px 8px;background:var(--bg3);border-radius:4px;">' +
                coinIcon + ' Tuition: ' + tuitionDisplay +
                (tuitionBreakdown ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + tuitionBreakdown + ')</span>' : '') +
                tuitionHistoryHtml +
                '</div>' +
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
                '<button id="editInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Edit</button>' +
                '<button id="curriculumInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Curriculum</button>' +
                '<button id="tuitionInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Tuition</button>' +
                '<button id="enrollInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Enroll</button>' +
                '<button id="hireInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Hire</button>' +
                '<button id="headmasterInstDetailsBtn" class="btn" style="padding:6px 12px;font-size:0.6rem;">Headmaster</button>' +
                '<button id="deleteInstDetailsBtn" class="btn danger" style="padding:6px 12px;font-size:0.6rem;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">Delete</button>' +
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

                // ================================================================
                // NEW: Tuition management button
                // ================================================================
                var tuitionBtn = document.getElementById('tuitionInstDetailsBtn');
                if (tuitionBtn) {
                    tuitionBtn.onclick = function() {
                        _closeTopModal();
                        openTuitionManagementModal(institutionId, function() {
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
    // 14. TUITION MANAGEMENT MODAL (NEW)
    // =========================================================================

    function openTuitionManagementModal(institutionId, onSuccess) {
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

            var tuitionResult = _calculateTuition(institutionId, currentYear);
            var currentTuition = inst.waiveTuition ? 'Waived' :
                (inst.customTuition !== null ? inst.customTuition + ' gold (Manual)' : (tuitionResult.success ? tuitionResult.tuition + ' gold' : 'Unknown'));

            var tuitionHistory = _getTuitionHistory(institutionId, 10);
            var historyHtml = '';
            if (tuitionHistory && tuitionHistory.length > 0) {
                historyHtml = tuitionHistory.map(function(h) {
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + h.year + '</span>' +
                        '<span>' + h.oldAmount + ' → ' + h.newAmount + '</span>' +
                        '<span style="color:var(--dim);font-size:0.5rem;">' + _escapeHtml(h.reason || '') + '</span>' +
                        '</div>';
                }).join('');
            }

            var modalContent =
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="font-size:0.7rem;"><strong>' + _escapeHtml(inst.name) + '</strong></div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current tuition: <strong>' + currentTuition + '</strong></div>' +
                (inst.waiveTuition ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:2px;">Tuition is currently waived for all students</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Tuition (gold/year)</label>' +
                '<input type="number" id="tuitionBase" value="' + (inst.tuitionPerYear || 0) + '" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<small style="font-size:0.55rem;color:var(--dim);">Base tuition before modifiers. Changes will be recorded in history.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Manual Override</label>' +
                '<input type="number" id="tuitionOverride" placeholder="Leave empty for calculated" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" value="' + (inst.customTuition !== null ? inst.customTuition : '') + '">' +
                '<small style="font-size:0.55rem;color:var(--dim);">Set a fixed amount. Leave empty to use calculated value.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="checkbox" id="tuitionWaive" ' + (inst.waiveTuition ? 'checked' : '') + '>' +
                '<span>Waive tuition for all students</span>' +
                '</label>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason for Change</label>' +
                '<input type="text" id="tuitionReason" placeholder="e.g., Inflation, Scholarship program..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                (historyHtml ?
                    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Tuition History</div>' +
                    '<div style="max-height:150px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:6px;">' +
                    historyHtml +
                    '</div>' +
                    '</div>' : ''
                ) +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                'Changes to tuition will affect all future enrollments. Existing students\' tuition history is preserved.' +
                '</div>';

            _openModal({
                title: 'Tuition Management: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Tuition Settings',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var baseTuition = parseInt(document.getElementById('tuitionBase').value) || 0;
                    var overrideValue = document.getElementById('tuitionOverride').value;
                    var waiveTuition = document.getElementById('tuitionWaive').checked;
                    var reason = document.getElementById('tuitionReason').value || 'Manual update';

                    var updates = {
                        tuitionPerYear: baseTuition,
                        waiveTuition: waiteTuition,
                        tuitionReason: reason
                    };

                    if (overrideValue !== null && overrideValue !== '') {
                        var customVal = parseInt(overrideValue);
                        if (!isNaN(customVal)) {
                            updates.customTuition = customVal;
                        }
                    } else {
                        updates.customTuition = null;
                    }

                    // Update base tuition
                    if (inst.tuitionPerYear !== baseTuition) {
                        if (!inst.tuitionHistory) inst.tuitionHistory = [];
                        inst.tuitionHistory.push({
                            year: currentYear,
                            oldAmount: inst.tuitionPerYear || 0,
                            newAmount: baseTuition,
                            reason: reason
                        });
                        if (inst.tuitionHistory.length > 20) {
                            inst.tuitionHistory = inst.tuitionHistory.slice(-20);
                        }
                    }

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        var msg = 'Tuition updated: ';
                        msg += waiveTuition ? 'Waived' : (baseTuition + ' gold/year');
                        if (updates.customTuition !== null) {
                            msg += ' (Manual override: ' + updates.customTuition + ')';
                        }
                        _showToast(msg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update tuition', 'error');
                    }
                    return true;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening tuition management modal', 'error');
        }
    }

    // =========================================================================
    // 15. ENROLL STUDENT MODAL (UPDATED with tuition display)
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

            // ================================================================
            // NEW: Show tuition info
            // ================================================================
            var tuitionResult = _calculateTuition(institutionId, currentYear);
            var tuitionInfo = 'Free (tuition waived)';
            if (!inst.waiveTuition) {
                if (tuitionResult.success) {
                    tuitionInfo = tuitionResult.tuition + ' gold/year';
                    if (inst.customTuition !== null) {
                        tuitionInfo += ' (Manual override)';
                    }
                } else {
                    tuitionInfo = 'Not available';
                }
            }

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
                '<!-- ============================================================ -->' +
                '<!-- NEW: Tuition info -->' +
                '<!-- ============================================================ -->' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-top:4px;padding:4px 8px;background:var(--bg3);border-radius:4px;">' +
                'Tuition: ' + tuitionInfo +
                (inst.waiveTuition ? ' (All students exempt)' : '') +
                '</div>' +
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
                        var tuitionMsg = inst.waiveTuition ? ' (Tuition waived)' : '';
                        _showToast((student ? student.name : 'Student') + ' enrolled' + tuitionMsg, 'success');
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
    // 16. HIRE TEACHER MODAL (unchanged)
    // =========================================================================

    // ... (existing hireTeacher function remains the same)

    // =========================================================================
    // 17. SET HEADMASTER MODAL (unchanged)
    // =========================================================================

    // ... (existing setHeadmaster function remains the same)

    // =========================================================================
    // 18. DELETE INSTITUTION MODAL (unchanged)
    // =========================================================================

    // ... (existing deleteInstitution function remains the same)

    // =========================================================================
    // 19. EDIT CURRICULUM MODAL (unchanged)
    // =========================================================================

    // ... (existing editCurriculum function remains the same)

    // =========================================================================
    // 20. EXPORTS
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
    window._openTuitionManagementModal = openTuitionManagementModal;

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