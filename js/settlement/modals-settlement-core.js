/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT CORE MODALS
 * js/settlement/modals-settlement-core.js
 * =============================================================================
 *
 * CORE SETTLEMENT MODALS.
 *
 * This file contains the core settlement UI modals:
 *
 *   - openSettlementDetailsModal   : summary + entry points
 *   - openManageFeaturesModal      : add / remove / demolish features
 *   - openUpgradeSettlementModal   : view rank status and upgrade
 *   - openSpecializationModal      : set or clear specialization
 *   - openStateEnterpriseModal     : view (read-only) state enterprises
 *   - openEmploymentModal          : view employment
 *   - openBudgetModal              : view budget
 *
 * It is a UI module. It:
 *   - reads through SettlementViewModels and query modules
 *   - calls commands for mutations
 *   - uses the core modal shell for presentation
 *   - does not create settlement records
 *   - does not mutate canonical settlement data directly
 *   - does not persist
 *   - does not fabricate domain values
 *   - does not use recursion guards
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §12 (Command
 * Contract), §15 (ViewModel Contract), §16 (UI Contract), §29 (Command
 * Transaction Example), §32 (Completion Standard).
 *
 * Modal infrastructure:
 *
 *   This module uses the CORE modals, not a ModalsCore namespace:
 *     - window.openModal(options) -> { element, close }
 *     - window.closeTopModal()
 *     - window.showToast(message, type)
 *     - window.confirmDialog(message, title, onConfirm)
 *
 *   openModal is expected to return { element, close } per modals-core.js.
 *   The content container is `result.element`. Event wiring is attached to
 *   that container; it is not attached to document.body and no global
 *   document selectors are used.
 *
 *   `titleHtml` and `contentHtml` are the accepted option keys on the core
 *   openModal. It does NOT read `title` / `content`; those options are
 *   silently ignored by the core and must not be used here.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getViewModels()       { return window.SettlementViewModels; }
    function _getSettlementQueries(){ return window.SettlementQueries; }
    function _getPlaceQueries()     { return window.PlaceQueries; }
    function _getFeatureQueries()   { return window.SettlementFeatureQueries; }
    function _getFeatureCommands()  { return window.SettlementFeatureCommands; }
    function _getRankCommands()     { return window.SettlementRankCommands; }
    function _getRankRules()        { return window.SettlementRankRules; }
    function _getSpecializationCommands() { return window.SettlementSpecializationCommands; }
    function _getRoleQueries()      { return window.RoleQueries; }
    function _getEmploymentQueries(){ return window.SettlementEmploymentQueries; }
    function _getEconomyQueries()   { return window.SettlementEconomyQueries; }

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

    /**
     * Opens a modal via the core modal shell.
     *
     * modals-core.js returns { element, close }. The element is the modal
     * shell; the content container is the element itself for the purposes
     * of event delegation (openModal attaches listeners to the modal
     * element, and our wiring attaches to the same element).
     *
     * Returns the modal element, or null if openModal returned an
     * unexpected shape.
     */
    function _openModal(options) {
        var result = window.openModal(options);
        if (!result) return null;
        if (result.element && result.element.nodeType === 1) return result.element;
        return null;
    }

    function _closeTopModal() {
        window.closeTopModal();
    }

    function _toast(message, type) {
        window.showToast(message, type);
    }

    function _confirm(message, title, onConfirm) {
        window.confirmDialog(message, title, onConfirm);
    }

    // =========================================================================
    // 3. DETAILS MODAL
    // =========================================================================

    function openSettlementDetailsModal(locationId) {
        var details = _getViewModels().buildSettlementDetails(locationId);
        if (!details) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var summary = details.summary;
        var name = summary.name || '(unnamed location)';

        var content = '';
        content += '<div class="settlement-details">';

        content += '<div class="settlement-details__row">';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Rank</div>';
        content += '<div class="settlement-details__value">' +
            (summary.rank ? _escapeHtml(summary.rank.name) : _unknown()) + '</div>';
        content += '</div>';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Population</div>';
        content += '<div class="settlement-details__value">' + _fmtNumber(summary.population) + '</div>';
        content += '</div>';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Prosperity</div>';
        content += '<div class="settlement-details__value">' +
            (summary.prosperity ? _escapeHtml(summary.prosperity.value) + ' — ' +
                _escapeHtml(summary.prosperity.band.name) : _unknown()) + '</div>';
        content += '</div>';
        content += '</div>';

        content += '<div class="settlement-details__row">';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Wealth</div>';
        content += '<div class="settlement-details__value">' + _fmtNumber(summary.wealth) + '</div>';
        content += '</div>';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Debt</div>';
        content += '<div class="settlement-details__value">' + _fmtNumber(summary.totalDebt) + '</div>';
        content += '</div>';
        content += '<div class="settlement-details__field">';
        content += '<div class="settlement-details__label">Features</div>';
        content += '<div class="settlement-details__value">' + _fmtNumber(summary.featureCount) + '</div>';
        content += '</div>';
        content += '</div>';

        content += '<div class="settlement-details__actions">';
        content += '<button type="button" data-action="manage-features">Manage Features</button>';
        content += '<button type="button" data-action="upgrade">Upgrade</button>';
        content += '<button type="button" data-action="specialization">Specialization</button>';
        content += '<button type="button" data-action="budget">Budget</button>';
        content += '<button type="button" data-action="employment">Employment</button>';
        content += '<button type="button" data-action="state-enterprises">State Enterprises</button>';
        content += '</div>';

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Settlement Details: ' + _escapeHtml(name),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });

        if (!container) return;

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (!button) return;
            var action = button.dataset.action;

            if (action === 'manage-features') {
                _closeTopModal();
                openManageFeaturesModal(locationId);
            } else if (action === 'upgrade') {
                _closeTopModal();
                openUpgradeSettlementModal(locationId);
            } else if (action === 'specialization') {
                _closeTopModal();
                openSpecializationModal(locationId);
            } else if (action === 'budget') {
                _closeTopModal();
                openBudgetModal(locationId);
            } else if (action === 'employment') {
                _closeTopModal();
                openEmploymentModal(locationId);
            } else if (action === 'state-enterprises') {
                _closeTopModal();
                openStateEnterpriseModal(locationId);
            }
        });
    }

    // =========================================================================
    // 4. MANAGE FEATURES MODAL
    // =========================================================================

    function openManageFeaturesModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var built = _getFeatureQueries().getSettlementFeatures(locationId) || [];
        var available = _getFeatureQueries().getAvailablePublicFeatures(locationId) || [];

        var content = '';
        content += '<div class="feature-manager">';

        content += '<section class="feature-manager__section">';
        content += '<h3>Built Features (' + built.length + ')</h3>';
        if (built.length === 0) {
            content += '<div class="feature-manager__empty">No public features built yet.</div>';
        } else {
            content += '<ul class="feature-manager__list">';
            for (var i = 0; i < built.length; i++) {
                var f = built[i];
                content += '<li class="feature-manager__item" data-feature-id="' + _escapeHtml(f.id) + '">';
                content += '<span class="feature-manager__name">' + _escapeHtml(f.name) + '</span>';
                content += '<span class="feature-manager__meta">' +
                    'maintenance ' + _escapeHtml(f.maintenance) + '</span>';
                content += '<span class="feature-manager__actions">';
                content += '<button type="button" data-action="remove-feature" data-feature-id="' + _escapeHtml(f.id) + '">Remove (refund)</button>';
                content += '<button type="button" data-action="demolish-feature" data-feature-id="' + _escapeHtml(f.id) + '">Demolish</button>';
                content += '</span>';
                content += '</li>';
            }
            content += '</ul>';
        }
        content += '</section>';

        content += '<section class="feature-manager__section">';
        content += '<h3>Available Features (' + available.length + ')</h3>';
        if (available.length === 0) {
            content += '<div class="feature-manager__empty">All public features have been built.</div>';
        } else {
            content += '<ul class="feature-manager__list">';
            for (var j = 0; j < available.length; j++) {
                var a = available[j];
                content += '<li class="feature-manager__item">';
                content += '<span class="feature-manager__name">' + _escapeHtml(a.name) + '</span>';
                content += '<span class="feature-manager__meta">' +
                    'cost ' + _escapeHtml(a.cost) +
                    ' · maintenance ' + _escapeHtml(a.maintenance) +
                    '</span>';
                content += '<span class="feature-manager__actions">';
                content += '<button type="button" data-action="build-feature" data-feature-id="' + _escapeHtml(a.id) + '">Build</button>';
                content += '</span>';
                content += '</li>';
            }
            content += '</ul>';
        }
        content += '</section>';

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Manage Features: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });

        if (!container) return;

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (!button) return;
            var action = button.dataset.action;
            var featureId = button.dataset.featureId;

            if (action === 'build-feature') {
                _confirmBuild(locationId, featureId, function () {
                    _closeTopModal();
                    openManageFeaturesModal(locationId);
                });
            } else if (action === 'remove-feature') {
                _confirmRemove(locationId, featureId, function () {
                    _closeTopModal();
                    openManageFeaturesModal(locationId);
                });
            } else if (action === 'demolish-feature') {
                _confirmDemolish(locationId, featureId, function () {
                    _closeTopModal();
                    openManageFeaturesModal(locationId);
                });
            }
        });
    }

    function _confirmBuild(locationId, featureId, onDone) {
        var feature = _getFeatureQueries().getFeatureById(featureId);
        if (!feature) {
            _toast('Feature not found.', 'error');
            return;
        }
        _confirm(
            'Build "' + feature.name + '" for ' + feature.cost + ' gold? ' +
            'Building may create debt if the settlement cannot afford it.',
            'Build Feature',
            function () {
                var result = _getFeatureCommands().buildFeature(locationId, featureId);
                if (result.success) {
                    _toast('Built ' + feature.name + '.', 'success');
                    if (onDone) onDone();
                } else {
                    _toast('Could not build feature: ' + result.code, 'error');
                }
            }
        );
    }

    function _confirmRemove(locationId, featureId, onDone) {
        var feature = _getFeatureQueries().getFeatureById(featureId);
        if (!feature) {
            _toast('Feature not found.', 'error');
            return;
        }
        _confirm(
            'Remove "' + feature.name + '"? Full cost (' + feature.cost + ' gold) is refunded.',
            'Remove Feature',
            function () {
                var result = _getFeatureCommands().removeFeature(locationId, featureId);
                if (result.success) {
                    _toast('Removed ' + feature.name + '.', 'success');
                    if (onDone) onDone();
                } else {
                    _toast('Could not remove feature: ' + result.code, 'error');
                }
            }
        );
    }

    function _confirmDemolish(locationId, featureId, onDone) {
        var feature = _getFeatureQueries().getFeatureById(featureId);
        if (!feature) {
            _toast('Feature not found.', 'error');
            return;
        }
        _confirm(
            'Demolish "' + feature.name + '"? This action is permanent and gives no refund.',
            'Demolish Feature',
            function () {
                var result = _getFeatureCommands().demolishFeature(locationId, featureId);
                if (result.success) {
                    _toast('Demolished ' + feature.name + '.', 'info');
                    if (onDone) onDone();
                } else {
                    _toast('Could not demolish feature: ' + result.code, 'error');
                }
            }
        );
    }

    // =========================================================================
    // 5. UPGRADE MODAL
    // =========================================================================

    function openUpgradeSettlementModal(locationId) {
        var view = _getViewModels().buildRankView(locationId);
        if (!view) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var content = '';
        content += '<div class="upgrade-view">';

        content += '<div class="upgrade-view__row">';
        content += '<div class="upgrade-view__field">';
        content += '<div class="upgrade-view__label">Current Rank</div>';
        content += '<div class="upgrade-view__value">' +
            (view.currentRank ? _escapeHtml(view.currentRank.name) : _unknown()) + '</div>';
        content += '</div>';
        content += '<div class="upgrade-view__field">';
        content += '<div class="upgrade-view__label">Population</div>';
        content += '<div class="upgrade-view__value">' + _fmtNumber(view.population) + '</div>';
        content += '</div>';
        content += '</div>';

        if (view.nextRank) {
            content += '<div class="upgrade-view__row">';
            content += '<div class="upgrade-view__field">';
            content += '<div class="upgrade-view__label">Next Rank</div>';
            content += '<div class="upgrade-view__value">' + _escapeHtml(view.nextRank.name) + '</div>';
            content += '</div>';
            content += '<div class="upgrade-view__field">';
            content += '<div class="upgrade-view__label">Required Population</div>';
            content += '<div class="upgrade-view__value">' + _fmtNumber(view.nextRank.minPopulation) + '</div>';
            content += '</div>';
            content += '</div>';

            if (!view.upgradeEligible) {
                content += '<ul class="upgrade-view__reasons">';
                for (var i = 0; i < view.upgradeReasons.length; i++) {
                    content += '<li>' + _escapeHtml(_describeUpgradeReason(view.upgradeReasons[i])) + '</li>';
                }
                content += '</ul>';
            } else {
                content += '<div class="upgrade-view__ready">Ready to upgrade.</div>';
            }
        } else {
            content += '<div class="upgrade-view__max">Already at the maximum rank.</div>';
        }

        content += '</div>';

        var canUpgrade = view.upgradeEligible === true && view.nextRank;

        _openModal({
            titleHtml: 'Upgrade Settlement',
            contentHtml: content,
            confirmText: canUpgrade ? 'Upgrade' : 'Close',
            cancelText: canUpgrade ? 'Cancel' : '',
            size: 'medium',
            onConfirm: function () {
                if (!canUpgrade) return true;
                _confirm(
                    'Upgrade to ' + view.nextRank.name + '?',
                    'Confirm Upgrade',
                    function () {
                        var result = _getRankCommands().upgradeSettlementRank(locationId);
                        if (result.success) {
                            _toast('Upgraded to ' + result.toRankName + '.', 'success');
                            _closeTopModal();
                        } else {
                            _toast('Upgrade failed: ' + result.code, 'error');
                        }
                    }
                );
                return true;
            }
        });
    }

    function _describeUpgradeReason(reason) {
        if (!reason) return '';
        if (reason.code === 'INSUFFICIENT_POPULATION') {
            return 'Need ' + (reason.deficit || 0) + ' more people.';
        }
        if (reason.code === 'INSUFFICIENT_PROSPERITY') {
            return 'Prosperity must be at least ' + reason.required + '.';
        }
        if (reason.code === 'ALREADY_MAX_RANK') return 'Already at maximum rank.';
        if (reason.code === 'UNKNOWN_CURRENT_RANK') return 'Current rank is not recognized.';
        return reason.code;
    }

    // =========================================================================
    // 6. SPECIALIZATION MODAL
    // =========================================================================

    function openSpecializationModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var roles = _getRoleQueries().getAllSpecializationRoles
            ? _getRoleQueries().getAllSpecializationRoles()
            : [];
        var current = summary.specializationRoleId;

        var content = '';
        content += '<div class="specialization-view">';

        content += '<div class="specialization-view__current">';
        content += '<div class="specialization-view__label">Current</div>';
        content += '<div class="specialization-view__value">' +
            (current ? _escapeHtml(current) : 'None') + '</div>';
        content += '</div>';

        content += '<ul class="specialization-view__list">';
        for (var i = 0; i < roles.length; i++) {
            var role = roles[i];
            var isCurrent = role.id === current;
            content += '<li class="specialization-view__item' + (isCurrent ? ' is-current' : '') + '">';
            content += '<span class="specialization-view__name">' + _escapeHtml(role.name) + '</span>';
            content += '<button type="button" data-action="set-specialization" data-role-id="' + _escapeHtml(role.id) + '">' +
                (isCurrent ? 'Current' : 'Set') + '</button>';
            content += '</li>';
        }
        content += '</ul>';

        if (current) {
            content += '<div class="specialization-view__clear">';
            content += '<button type="button" data-action="clear-specialization">Clear Specialization</button>';
            content += '</div>';
        }

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Specialization: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });

        if (!container) return;

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (!button) return;
            var action = button.dataset.action;

            if (action === 'set-specialization') {
                var roleId = button.dataset.roleId;
                var result = _getSpecializationCommands().setSpecialization(locationId, roleId);
                if (result.success) {
                    _toast('Specialization updated.', 'success');
                    _closeTopModal();
                    openSpecializationModal(locationId);
                } else {
                    _toast('Could not set specialization: ' + result.code, 'error');
                }
            } else if (action === 'clear-specialization') {
                var clearResult = _getSpecializationCommands().clearSpecialization(locationId);
                if (clearResult.success) {
                    _toast('Specialization cleared.', 'info');
                    _closeTopModal();
                    openSpecializationModal(locationId);
                } else {
                    _toast('Could not clear specialization: ' + clearResult.code, 'error');
                }
            }
        });
    }

    // =========================================================================
    // 7. STATE ENTERPRISE MODAL (read-only; owned by Industry)
    // =========================================================================

    function openStateEnterpriseModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        // Enterprises are owned by Industry. This modal only displays
        // them. Per §19, no add/remove commands are exposed here.
        var enterprises = [];
        if (window.IndustryQueries
            && typeof window.IndustryQueries.getEnterprisesBySettlement === 'function') {
            enterprises = window.IndustryQueries.getEnterprisesBySettlement(locationId) || [];
        }

        var content = '';
        content += '<div class="state-enterprises">';

        if (enterprises.length === 0) {
            content += '<div class="state-enterprises__empty">No state enterprises in this settlement.</div>';
        } else {
            content += '<ul class="state-enterprises__list">';
            for (var i = 0; i < enterprises.length; i++) {
                var e = enterprises[i];
                content += '<li class="state-enterprises__item">';
                content += '<span class="state-enterprises__name">' + _escapeHtml(e.name) + '</span>';
                content += '<span class="state-enterprises__meta">' +
                    'profit ' + _escapeHtml(e.annualProfit) +
                    ' · workers ' + _escapeHtml(e.workerCount) +
                    '</span>';
                content += '</li>';
            }
            content += '</ul>';
        }

        content += '</div>';

        _openModal({
            titleHtml: 'State Enterprises: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 8. EMPLOYMENT MODAL
    // =========================================================================

    function openEmploymentModal(locationId) {
        var view = _getViewModels().buildEmploymentView(locationId);
        if (!view) {
            _toast('Employment data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="employment-view">';
        content += _field('Working-Age Population', view.workingAgePopulation);
        content += _field('Total Employed', view.totalEmployed);
        content += _field('State Employed', view.stateEmployed);
        content += _field('Public Employed', view.publicEmployed);
        content += _field('Private Employed', view.privateEmployed);
        content += _field('Unemployed', view.unemployed);
        content += _field('Employment Rate', view.employmentRate + '%');
        content += _field('Average Wage', view.averageWage);
        content += _field('Total Wages', view.totalWages);
        content += '</div>';

        _openModal({
            titleHtml: 'Employment: ' + _escapeHtml(view.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 9. BUDGET MODAL
    // =========================================================================

    function openBudgetModal(locationId) {
        var view = _getViewModels().buildBudgetView(locationId);
        if (!view) {
            _toast('Budget data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="budget-view">';

        content += '<section class="budget-view__section">';
        content += '<h3>Income</h3>';
        content += _field('Taxes', view.income.taxes);
        content += _field('Trade', view.income.trade);
        content += _field('Industry', view.income.industry);
        content += _field('State Enterprises', view.income.stateEnterprises);
        content += _field('Public Enterprises', view.income.publicEnterprises);
        content += _field('Total', view.income.total, true);
        content += '</section>';

        content += '<section class="budget-view__section">';
        content += '<h3>Expenses</h3>';
        content += _field('Maintenance', view.expenses.maintenance);
        content += _field('Wages', view.expenses.wages);
        content += _field('Military', view.expenses.military);
        content += _field('Infrastructure', view.expenses.infrastructure);
        content += _field('Education', view.expenses.education);
        content += _field('Government Salaries', view.expenses.governmentSalaries);
        content += _field('Total', view.expenses.total, true);
        content += '</section>';

        content += '<section class="budget-view__section">';
        content += '<h3>Surplus</h3>';
        content += _field('Annual Surplus', view.surplus, true);
        content += _field('Wealth', view.wealth);
        content += _field('Total Debt', view.totalDebt);
        content += '</section>';

        content += '</div>';

        _openModal({
            titleHtml: 'Budget: ' + _escapeHtml(view.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });
    }

    function _field(label, value, emphasized) {
        var cls = 'field-row' + (emphasized ? ' field-row--emphasized' : '');
        var display;
        if (typeof value === 'number') {
            display = _fmtNumber(value);
        } else if (value === null || value === undefined) {
            display = _unknown();
        } else {
            display = _escapeHtml(value);
        }
        return '<div class="' + cls + '">' +
            '<span class="field-row__label">' + _escapeHtml(label) + '</span>' +
            '<span class="field-row__value">' + display + '</span>' +
            '</div>';
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.SettlementModals = Object.freeze({
        openSettlementDetailsModal: openSettlementDetailsModal,
        openManageFeaturesModal: openManageFeaturesModal,
        openUpgradeSettlementModal: openUpgradeSettlementModal,
        openSpecializationModal: openSpecializationModal,
        openStateEnterpriseModal: openStateEnterpriseModal,
        openEmploymentModal: openEmploymentModal,
        openBudgetModal: openBudgetModal
    });

    // Legacy aliases for callers that still use the old names.
    window.openSettlementDetailsModal = openSettlementDetailsModal;
    window.openManageFeaturesModal = openManageFeaturesModal;
    window.openUpgradeSettlementModal = openUpgradeSettlementModal;
    window.openSettlementSpecializationModal = openSpecializationModal;
    window.openStateEnterpriseManagementModal = openStateEnterpriseModal;
    window.openEmploymentManagementModal = openEmploymentModal;
    window.openSettlementBudgetModal = openBudgetModal;

})();
