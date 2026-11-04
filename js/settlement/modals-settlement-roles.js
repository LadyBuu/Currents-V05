/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ROLES MODALS
 * js/settlement/modals-settlement-roles.js
 * =============================================================================
 *
 * ROLE-RELATED SETTLEMENT MODALS.
 *
 * This file contains the role, apprenticeship, and education modals:
 *
 *   - openRolesModal            : role distribution in a settlement
 *   - openApprenticeshipsModal  : apprenticeship density and masters
 *   - openEducationModal        : literacy stats and schools
 *
 * It is a UI module. It:
 *   - reads through query modules and ViewModels
 *   - does not call commands (these modals are read-only)
 *   - uses the core modal shell for presentation
 *   - does not read canonical settlement state directly
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not fabricate domain values
 *   - does not use recursion guards
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard).
 *
 * Modal infrastructure:
 *
 *   This module uses the CORE modals, not a ModalsCore namespace:
 *     - window.openModal(options) -> { element, close }
 *     - window.showToast(message, type)
 *
 *   `titleHtml` and `contentHtml` are the accepted option keys.
 *   `title` and `content` are silently ignored by the core.
 *
 *   The content container for any future event delegation is
 *   `result.element`. These modals are read-only, so no event wiring is
 *   currently attached.
 *
 * Data sources:
 *
 *   SETTLEMENT-SCOPED AGGREGATES.
 *
 *   The three modals read settlement-scoped views of role and
 *   apprenticeship data through SettlementQueries:
 *
 *     SettlementQueries.getSettlementRoleStats(locationId)
 *       Role-skill tier distribution over the settlement subtree.
 *       Returns:
 *         {
 *           locationId, totalProfessions, uniqueRoles, characterCount,
 *           roleIds, countsByTier, byCategory, topRoles,
 *           mastersByRole, apprenticesByRole, canTeachByRole,
 *           primaryByRole
 *         }
 *       Returns null for a missing settlement.
 *
 *     SettlementQueries.getSettlementApprenticeshipDensity(locationId)
 *       Active apprenticeship relationship counts over the settlement
 *       subtree. Returns:
 *         {
 *           locationId, totalMasters, totalApprentices,
 *           masterToApprenticeRatio, topRoles, topMasters
 *         }
 *       Returns null for a missing settlement.
 *
 *   Education stats are owned by SettlementEducationQueries (unchanged
 *   in this revision; the education modal is untouched by the roles
 *   rewrite except that it now reads a named helper
 *   _getSettlementEducationQueries for symmetry with the other two).
 *
 *   Prior revisions of openRolesModal and openApprenticeshipsModal
 *   called RoleQueries.getSettlementRoleStats and
 *   RoleQueries.getSettlementApprenticeshipDensity. Neither method
 *   exists on RoleQueries (role-queries.js exports the world-wide
 *   getRoleStatistics / getRoleStatisticsBatch; it does not export
 *   settlement-scoped aggregates). Both modals therefore threw
 *   "Role data not available." on every invocation. The settlement-
 *   scoped aggregates now live on SettlementQueries and the modals
 *   read them there.
 *
 *   The RoleQueries dependency is retained because openRolesModal
 *   still uses RoleQueries.getRoleById to resolve display names for
 *   category-role rows. That is a world-wide role lookup; the
 *   settlement-scoped aggregate carries the ids, and the role catalogue
 *   carries the names.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - openRolesModal now reads
 *       SettlementQueries.getSettlementRoleStats(locationId) instead of
 *       the phantom RoleQueries.getSettlementRoleStats. The phantom
 *       never existed; every invocation threw "Role data not
 *       available." Fixed.
 *     - openRolesModal renders topRoles directly from the aggregate.
 *       The aggregate's `topRoles` already carries `name` and
 *       `percentage`; the modal no longer re-derives percentages
 *       from count / totalProfessions. Output shape unchanged.
 *     - openRolesModal renders category breakdown directly from the
 *       aggregate's `byCategory`. The aggregate already carries each
 *       category's role list with names and counts; the modal no
 *       longer calls RoleQueries.getRoleById per role to fill in
 *       names.
 *     - openApprenticeshipsModal now reads
 *       SettlementQueries.getSettlementApprenticeshipDensity(locationId)
 *       instead of the phantom
 *       RoleQueries.getSettlementApprenticeshipDensity. Fixed.
 *     - openApprenticeshipsModal renders topMasters directly from the
 *       aggregate's `topMasters` (with masterName already resolved).
 *       The modal no longer calls getCharacterById per master.
 *     - Both modals format the master:apprentice ratio from the
 *       aggregate's `masterToApprenticeRatio` (already rounded to one
 *       decimal). The modal does not divide inline.
 *     - Added _getSettlementQueries helper for symmetry with the
 *       already-present _getPlaceQueries / _getEducationQueries /
 *       _getRoleQueries helpers.
 *     - Header Data sources section rewritten to describe the
 *       settlement-scoped aggregates.
 *     - openEducationModal unchanged.
 *   Previous revisions:
 *     - _getRoleQueries().getSettlementRoleStats and
 *       _getRoleQueries().getSettlementApprenticeshipDensity were the
 *       data sources. Both are phantom (never existed on
 *       role-queries.js). Both modals were dead code.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries()   { return window.SettlementQueries; }
    function _getPlaceQueries()        { return window.PlaceQueries; }
    function _getEducationQueries()    { return window.SettlementEducationQueries; }
    function _getRoleQueries()         { return window.RoleQueries; }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _placeName(locationId) {
        var place = _getPlaceQueries().getPlaceById(locationId);
        return place ? place.displayName : null;
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtRatio(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(String(value)) + ':1';
    }

    function _openModal(options) {
        var result = window.openModal(options);
        if (!result) return null;
        if (result.element && result.element.nodeType === 1) return result.element;
        return null;
    }

    function _toast(message, type) {
        window.showToast(message, type);
    }

    // =========================================================================
    // 3. ROLES MODAL
    // =========================================================================

    function openRolesModal(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var stats;
        try {
            stats = _getSettlementQueries().getSettlementRoleStats(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('openRolesModal: role stats unavailable', err);
            }
            _toast('Role data not available.', 'error');
            return;
        }

        if (!stats) {
            _toast('Role data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="roles-view">';

        if (stats.totalProfessions === 0) {
            content += '<div class="roles-view__empty">' +
                'No professions found in this settlement.' +
                '</div>';
        } else {
            content += '<div class="roles-view__header">';
            content += '<span>' + _fmtNumber(stats.totalProfessions) +
                ' professions</span>';
            content += '<span>' + _fmtNumber(stats.uniqueRoles) +
                ' unique roles</span>';
            content += '</div>';

            if (stats.byCategory) {
                var categoryIds = Object.keys(stats.byCategory);
                if (categoryIds.length > 0) {
                    categoryIds.sort(function (a, b) {
                        return (stats.byCategory[b].count || 0) -
                            (stats.byCategory[a].count || 0);
                    });

                    content += '<section class="roles-view__section">';
                    content += '<h3>By Category</h3>';
                    content += '<ul class="roles-view__list">';

                    for (var i = 0; i < categoryIds.length; i++) {
                        var catId = categoryIds[i];
                        var cat = stats.byCategory[catId];
                        var catCount = (typeof cat.count === 'number') ? cat.count : 0;
                        var pct = stats.totalProfessions > 0
                            ? Math.round((catCount / stats.totalProfessions) * 100)
                            : 0;
                        var catLabel = _categoryLabel(cat, catId);

                        content += '<li class="roles-view__item">';
                        content += '<span class="roles-view__name">' +
                            _escapeHtml(catLabel) + '</span>';
                        content += '<span class="roles-view__bar">' +
                            '<span class="roles-view__bar-fill" style="width:' +
                            pct + '%"></span></span>';
                        content += '<span class="roles-view__count">' +
                            _fmtNumber(catCount) + '</span>';
                        content += '</li>';
                    }

                    content += '</ul>';
                    content += '</section>';
                }
            }

            if (Array.isArray(stats.topRoles) && stats.topRoles.length > 0) {
                content += '<section class="roles-view__section">';
                content += '<h3>Top Roles</h3>';
                content += '<ul class="roles-view__list">';

                for (var j = 0; j < stats.topRoles.length; j++) {
                    var role = stats.topRoles[j];
                    if (!role) continue;
                    var share = (typeof role.percentage === 'number')
                        ? role.percentage
                        : 0;
                    var roleName = role.name || role.id || 'Unnamed';
                    var roleCount = (typeof role.count === 'number')
                        ? role.count
                        : 0;

                    content += '<li class="roles-view__item">';
                    content += '<span class="roles-view__name">' +
                        _escapeHtml(roleName) + '</span>';
                    content += '<span class="roles-view__bar">' +
                        '<span class="roles-view__bar-fill" style="width:' +
                        share + '%"></span></span>';
                    content += '<span class="roles-view__count">' +
                        _fmtNumber(roleCount) + ' (' + _escapeHtml(String(share)) + '%)' +
                        '</span>';
                    content += '</li>';
                }

                content += '</ul>';
                content += '</section>';
            }
        }

        content += '</div>';

        _openModal({
            titleHtml: 'Roles: ' + _escapeHtml(_placeName(locationId) || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });
    }

    /**
     * Resolves the display label for a category entry in the aggregate's
     * byCategory map. The aggregate already puts the resolved category
     * name on the first role entry (from RoleState.getCategories). If
     * the category is empty of roles, fall back to the category id.
     */
    function _categoryLabel(cat, catId) {
        if (cat && Array.isArray(cat.roles) && cat.roles.length > 0) {
            var first = cat.roles[0];
            if (first && typeof first.categoryName === 'string' &&
                first.categoryName.length > 0) {
                return first.categoryName;
            }
        }
        return catId || 'Uncategorized';
    }

    // =========================================================================
    // 4. APPRENTICESHIPS MODAL
    // =========================================================================

    function openApprenticeshipsModal(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var density;
        try {
            density = _getSettlementQueries().getSettlementApprenticeshipDensity(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('openApprenticeshipsModal: data unavailable', err);
            }
            _toast('Apprenticeship data not available.', 'error');
            return;
        }

        if (!density) {
            _toast('Apprenticeship data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="apprenticeship-view">';

        content += '<div class="apprenticeship-view__stats">';
        content += '<div class="apprenticeship-view__stat">';
        content += '<div class="apprenticeship-view__label">Masters</div>';
        content += '<div class="apprenticeship-view__value">' +
            _fmtNumber(density.totalMasters) + '</div>';
        content += '</div>';
        content += '<div class="apprenticeship-view__stat">';
        content += '<div class="apprenticeship-view__label">Apprentices</div>';
        content += '<div class="apprenticeship-view__value">' +
            _fmtNumber(density.totalApprentices) + '</div>';
        content += '</div>';
        content += '<div class="apprenticeship-view__stat">';
        content += '<div class="apprenticeship-view__label">Ratio (Master:Apprentice)</div>';
        content += '<div class="apprenticeship-view__value">' +
            _fmtRatio(density.masterToApprenticeRatio) + '</div>';
        content += '</div>';
        content += '</div>';

        if (Array.isArray(density.topRoles) && density.topRoles.length > 0) {
            content += '<section class="apprenticeship-view__section">';
            content += '<h3>Apprentices by Role</h3>';
            content += '<ul class="apprenticeship-view__list">';

            for (var i = 0; i < density.topRoles.length; i++) {
                var role = density.topRoles[i];
                if (!role) continue;
                content += '<li class="apprenticeship-view__item">';
                content += '<span class="apprenticeship-view__name">' +
                    _escapeHtml(role.roleName || role.roleId || 'Unknown') +
                    '</span>';
                content += '<span class="apprenticeship-view__count">' +
                    _fmtNumber(role.count) + '</span>';
                content += '</li>';
            }

            content += '</ul>';
            content += '</section>';
        }

        if (Array.isArray(density.topMasters) && density.topMasters.length > 0) {
            content += '<section class="apprenticeship-view__section">';
            content += '<h3>Top Masters</h3>';
            content += '<ul class="apprenticeship-view__list">';

            for (var j = 0; j < density.topMasters.length; j++) {
                var master = density.topMasters[j];
                if (!master) continue;
                content += '<li class="apprenticeship-view__item">';
                content += '<span class="apprenticeship-view__name">' +
                    _escapeHtml(master.masterName || master.masterId || 'Unknown') +
                    '</span>';
                content += '<span class="apprenticeship-view__count">' +
                    _fmtNumber(master.apprenticeCount) + ' apprentice(s)' +
                    '</span>';
                content += '</li>';
            }

            content += '</ul>';
            content += '</section>';
        }

        content += '</div>';

        _openModal({
            titleHtml: 'Apprenticeships: ' + _escapeHtml(_placeName(locationId) || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 5. EDUCATION MODAL
    // =========================================================================

    function openEducationModal(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var stats;
        var capacity;
        var schools;
        try {
            stats = _getEducationQueries().getLiteracyStats(locationId);
            capacity = _getEducationQueries().getEducationCapacity(locationId);
            schools = _getEducationQueries().getSchools(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('openEducationModal: data unavailable', err);
            }
            _toast('Education data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="education-view">';

        if (!stats) {
            content += '<div class="education-view__empty">' +
                'No education data available.</div>';
        } else {
            content += '<div class="education-view__stats">';
            content += '<div class="education-view__stat">';
            content += '<div class="education-view__label">Schools</div>';
            content += '<div class="education-view__value">' +
                _fmtNumber(stats.schoolCount) + '</div>';
            content += '</div>';
            content += '<div class="education-view__stat">';
            content += '<div class="education-view__label">Literacy Rate</div>';
            content += '<div class="education-view__value">' +
                _fmtNumber(stats.literacyRate) + '%</div>';
            content += '</div>';
            content += '<div class="education-view__stat">';
            content += '<div class="education-view__label">Literate Population</div>';
            content += '<div class="education-view__value">' +
                _fmtNumber(stats.literateCount) + ' / ' +
                _fmtNumber(stats.totalPopulation) +
                '</div>';
            content += '</div>';
            content += '</div>';

            if (stats.educationLevels) {
                content += '<section class="education-view__section">';
                content += '<h3>Education Levels</h3>';
                content += '<ul class="education-view__list">';
                var levels = window.SettlementEducationDefinitions.EDUCATION_LEVELS;
                var totalPop = stats.totalPopulation || 1;
                for (var i = 0; i < levels.length; i++) {
                    var level = levels[i];
                    var count = stats.educationLevels[level.id] || 0;
                    var pct = Math.round((count / totalPop) * 100);
                    content += '<li class="education-view__item">';
                    content += '<span class="education-view__name">' +
                        _escapeHtml(level.name) + '</span>';
                    content += '<span class="education-view__bar">' +
                        '<span class="education-view__bar-fill" style="width:' +
                        pct + '%"></span></span>';
                    content += '<span class="education-view__count">' +
                        _fmtNumber(count) + '</span>';
                    content += '</li>';
                }
                content += '</ul>';
                content += '</section>';
            }

            if (capacity) {
                content += '<section class="education-view__section">';
                content += '<h3>Capacity</h3>';
                content += '<div class="education-view__field">';
                content += '<span class="education-view__field-label">Total Students</span>';
                content += '<span class="education-view__field-value">' +
                    _fmtNumber(capacity.totalStudents) + '</span>';
                content += '</div>';
                content += '<div class="education-view__field">';
                content += '<span class="education-view__field-label">Total Teachers</span>';
                content += '<span class="education-view__field-value">' +
                    _fmtNumber(capacity.totalTeachers) + '</span>';
                content += '</div>';
                if (typeof capacity.studentTeacherRatio === 'number') {
                    content += '<div class="education-view__field">';
                    content += '<span class="education-view__field-label">Student:Teacher Ratio</span>';
                    content += '<span class="education-view__field-value">' +
                        _fmtNumber(capacity.studentTeacherRatio) + ':1</span>';
                    content += '</div>';
                }
                content += '</section>';
            }

            if (Array.isArray(schools) && schools.length > 0) {
                content += '<section class="education-view__section">';
                content += '<h3>Schools</h3>';
                content += '<ul class="education-view__list">';
                for (var j = 0; j < schools.length; j++) {
                    var school = schools[j];
                    content += '<li class="education-view__item">';
                    content += '<span class="education-view__name">' +
                        _escapeHtml(school.name) + '</span>';
                    content += '<span class="education-view__meta">' +
                        'cost ' + _fmtNumber(school.cost) +
                        ' · maintenance ' + _fmtNumber(school.maintenance) +
                        '</span>';
                    content += '</li>';
                }
                content += '</ul>';
                content += '</section>';
            }
        }

        content += '</div>';

        _openModal({
            titleHtml: 'Education: ' + _escapeHtml(_placeName(locationId) || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementRolesModals = Object.freeze({
        openRolesModal: openRolesModal,
        openApprenticeshipsModal: openApprenticeshipsModal,
        openEducationModal: openEducationModal
    });

    // Legacy aliases for callers that still use the old names.
    window.openSettlementRolesModal = openRolesModal;
    window.openSettlementApprenticeshipsModal = openApprenticeshipsModal;
    window.openSettlementEducationModal = openEducationModal;

})();
