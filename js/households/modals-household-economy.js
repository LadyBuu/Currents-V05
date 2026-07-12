/**
 * =============================================================================
 * HOUSEHOLD ECONOMY MODALS (modals-household-economy.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for household economy management (wealth, resources,
 *          income, expenses, economic events, trade, annual processing).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-economy.js (HouseholdEconomy)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingEconomyModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
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

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getHousehold) {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getAllHouseholds() {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getAllHouseholds) {
            return window.HouseholdState.getAllHouseholds();
        }
        return [];
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
    }

    // Economy wrappers - use window.HouseholdEconomy if available, else fallback
    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdWealth) {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? household.wealth || 0 : 0;
    }

    function _getHouseholdDebt(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdDebt) {
            return window.HouseholdEconomy.getHouseholdDebt(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.economy ? household.economy.debt || 0 : 0) : 0;
    }

    function _getHouseholdResources(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdResources) {
            return window.HouseholdEconomy.getHouseholdResources(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.economy ? household.economy.resources || { food: 0, livestock: 0, goods: 0 } : { food: 0, livestock: 0, goods: 0 }) : { food: 0, livestock: 0, goods: 0 };
    }

    function _getHouseholdEconomicTier(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdEconomicTier) {
            return window.HouseholdEconomy.getHouseholdEconomicTier(householdId);
        }
        return { id: 'moderate', name: 'Moderate', icon: '⌂' };
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdWealth) {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        return 0;
    }

    function _modifyHouseholdDebt(householdId, delta) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.modifyHouseholdDebt) {
            return window.HouseholdEconomy.modifyHouseholdDebt(householdId, delta);
        }
        return 0;
    }

    function _updateHouseholdResources(householdId, resourceType, delta) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdResources) {
            return window.HouseholdEconomy.updateHouseholdResources(householdId, resourceType, delta);
        }
        return 0;
    }

    function _calculateAnnualIncome(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.calculateAnnualIncome) {
            return window.HouseholdEconomy.calculateAnnualIncome(householdId);
        }
        return 0;
    }

    function _calculateAnnualExpenses(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.calculateAnnualExpenses) {
            return window.HouseholdEconomy.calculateAnnualExpenses(householdId);
        }
        return 0;
    }

    function _computeNetAnnualChange(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.computeNetAnnualChange) {
            return window.HouseholdEconomy.computeNetAnnualChange(householdId);
        }
        return 0;
    }

    function _processAnnualEconomy(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.processAnnualEconomy) {
            return window.HouseholdEconomy.processAnnualEconomy(householdId);
        }
        return { success: false };
    }

    function _triggerEconomicEvent(householdId, eventTypeId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.triggerEconomicEvent) {
            return window.HouseholdEconomy.triggerEconomicEvent(householdId, eventTypeId);
        }
        return null;
    }

    function _getTradePartners(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTradePartners) {
            return window.HouseholdEconomy.getTradePartners(householdId);
        }
        return [];
    }

    function _executeTrade(sourceId, targetId, trade) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.executeTrade) {
            return window.HouseholdEconomy.executeTrade(sourceId, targetId, trade);
        }
        return false;
    }

    function _getEconomicEventTypes() {
        if (window.ECONOMIC_EVENT_TYPES && Array.isArray(window.ECONOMIC_EVENT_TYPES)) {
            return window.ECONOMIC_EVENT_TYPES;
        }
        return [];
    }

    function _getEconomicTiers() {
        if (window.ECONOMIC_TIERS) {
            return window.ECONOMIC_TIERS;
        }
        return {};
    }

    function _isUrbanLocation(locationId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.isUrbanLocation) {
            return window.HouseholdEconomy.isUrbanLocation(locationId);
        }
        return false;
    }

    // =========================================================================
    // 5. HOUSEHOLD WEALTH MODAL
    // =========================================================================

    function openHouseholdWealthModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getHouseholdEconomicTier(householdId);

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Wealth</span><br><span style="font-size: 1.1rem; font-weight: bold;">' + wealth + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Debt</span><br><span style="font-size: 1.1rem; font-weight: bold; color: ' + (debt > 0 ? '#c87040' : 'var(--text)') + ';">' + debt + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Economic Tier</span><br><span style="font-size: 0.9rem;">' + _escapeHtml(tier.name) + '</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Net Worth</span><br><span style="font-size: 0.9rem;">' + (wealth - debt) + ' gold</span></div>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Modify Wealth</label>' +
                '<div style="display: flex; gap: 8px;">' +
                '<input type="number" id="wealthDelta" value="0" style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<input type="text" id="wealthReason" placeholder="Reason" style="flex: 2; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="display: flex; gap: 4px; margin-top: 4px;">' +
                '<button id="wealthAddBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Add</button>' +
                '<button id="wealthSubtractBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Subtract</button>' +
                '<button id="wealthSetBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Set</button>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Modify Debt</label>' +
                '<div style="display: flex; gap: 8px;">' +
                '<input type="number" id="debtDelta" value="0" style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="display: flex; gap: 4px; margin-top: 4px;">' +
                '<button id="debtAddBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Add Debt</button>' +
                '<button id="debtSubtractBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Pay Debt</button>' +
                '</div>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Wealth: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            // Event handlers
            setTimeout(function() {
                var wealthDelta = document.getElementById('wealthDelta');
                var wealthReason = document.getElementById('wealthReason');

                function getWealthDelta() {
                    return parseInt(wealthDelta ? wealthDelta.value : 0) || 0;
                }

                function getWealthReason() {
                    return wealthReason ? wealthReason.value.trim() : 'Modified';
                }

                var addBtn = document.getElementById('wealthAddBtn');
                if (addBtn) {
                    addBtn.onclick = function() {
                        var delta = Math.abs(getWealthDelta());
                        if (delta === 0) {
                            _showToast('Please enter a value', 'warning');
                            return;
                        }
                        var newWealth = _updateHouseholdWealth(householdId, delta, 'Added: ' + getWealthReason());
                        _showToast('Wealth increased by ' + delta + ' (now ' + newWealth + ')', 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var subBtn = document.getElementById('wealthSubtractBtn');
                if (subBtn) {
                    subBtn.onclick = function() {
                        var delta = Math.abs(getWealthDelta());
                        if (delta === 0) {
                            _showToast('Please enter a value', 'warning');
                            return;
                        }
                        var newWealth = _updateHouseholdWealth(householdId, -delta, 'Subtracted: ' + getWealthReason());
                        _showToast('Wealth decreased by ' + delta + ' (now ' + newWealth + ')', 'info');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var setBtn = document.getElementById('wealthSetBtn');
                if (setBtn) {
                    setBtn.onclick = function() {
                        var delta = getWealthDelta();
                        if (delta < 0) {
                            _showToast('Please enter a non-negative value', 'error');
                            return;
                        }
                        var currentWealth = _getHouseholdWealth(householdId);
                        var diff = delta - currentWealth;
                        var newWealth = _updateHouseholdWealth(householdId, diff, 'Set to ' + delta + ': ' + getWealthReason());
                        _showToast('Wealth set to ' + newWealth, 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var debtAddBtn = document.getElementById('debtAddBtn');
                if (debtAddBtn) {
                    debtAddBtn.onclick = function() {
                        var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                        if (delta <= 0) {
                            _showToast('Please enter a positive value', 'warning');
                            return;
                        }
                        var newDebt = _modifyHouseholdDebt(householdId, delta);
                        _showToast('Debt increased by ' + delta + ' (now ' + newDebt + ')', 'info');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var debtSubBtn = document.getElementById('debtSubtractBtn');
                if (debtSubBtn) {
                    debtSubBtn.onclick = function() {
                        var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                        if (delta <= 0) {
                            _showToast('Please enter a positive value', 'warning');
                            return;
                        }
                        var currentDebt = _getHouseholdDebt(householdId);
                        var newDebt = _modifyHouseholdDebt(householdId, -Math.min(delta, currentDebt));
                        var paid = currentDebt - newDebt;
                        _showToast('Paid ' + paid + ' debt (now ' + newDebt + ')', 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening wealth modal', 'error');
        }
    }

    // =========================================================================
    // 6. HOUSEHOLD RESOURCES MODAL
    // =========================================================================

    function openHouseholdResourcesModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var resources = _getHouseholdResources(householdId);
            var resourceTypes = ['food', 'livestock', 'goods'];
            var resourceLabels = {
                food: 'Food',
                livestock: 'Livestock',
                goods: 'Goods'
            };

            var resourcesHtml = '';
            for (var i = 0; i < resourceTypes.length; i++) {
                var type = resourceTypes[i];
                var value = resources[type] || 0;
                resourcesHtml +=
                    '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg2); border-radius: 6px; margin-bottom: 4px;">' +
                    '<span style="font-size: 0.7rem;">' + resourceLabels[type] + '</span>' +
                    '<div style="display: flex; align-items: center; gap: 8px;">' +
                    '<span style="font-size: 1rem; font-weight: bold;">' + value + '</span>' +
                    '<div style="display: flex; gap: 2px;">' +
                    '<button class="resource-add-btn btn small" data-type="' + type + '" style="padding: 1px 6px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">+</button>' +
                    '<button class="resource-sub-btn btn small" data-type="' + type + '" style="padding: 1px 6px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">-</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }

            resourcesHtml +=
                '<div style="margin-top: 8px;">' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                '<input type="number" id="resourceDeltaInput" value="1" style="width: 60px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '<button id="resourceAddAllBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Add to All</button>' +
                '</div>' +
                '</div>';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Resources</div>' +
                '</div>' +
                resourcesHtml +
                '</div>';

            _openModal({
                title: 'Resources: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            // Event handlers
            setTimeout(function() {
                var resourceDelta = document.getElementById('resourceDeltaInput');

                function getDelta() {
                    return parseInt(resourceDelta ? resourceDelta.value : 1) || 1;
                }

                var addBtns = document.querySelectorAll('.resource-add-btn');
                addBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var type = this.dataset.type;
                        var delta = getDelta();
                        var newValue = _updateHouseholdResources(householdId, type, delta);
                        _showToast(type + ' increased by ' + delta + ' (now ' + newValue + ')', 'success');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                });

                var subBtns = document.querySelectorAll('.resource-sub-btn');
                subBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var type = this.dataset.type;
                        var delta = getDelta();
                        var current = resources[type] || 0;
                        var actualDelta = Math.min(delta, current);
                        var newValue = _updateHouseholdResources(householdId, type, -actualDelta);
                        _showToast(type + ' decreased by ' + actualDelta + ' (now ' + newValue + ')', 'info');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                });

                var addAllBtn = document.getElementById('resourceAddAllBtn');
                if (addAllBtn) {
                    addAllBtn.onclick = function() {
                        var delta = getDelta();
                        var types = ['food', 'livestock', 'goods'];
                        for (var i = 0; i < types.length; i++) {
                            _updateHouseholdResources(householdId, types[i], delta);
                        }
                        _showToast('All resources increased by ' + delta, 'success');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                }

            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening resources modal', 'error');
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD INCOME MODAL
    // =========================================================================

    function openHouseholdIncomeModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var annualIncome = _calculateAnnualIncome(householdId);
            var incomeSources = window.INCOME_SOURCES || {};

            var breakdown = [];
            var total = 0;
            var memberCount = household.members ? household.members.length : 1;

            for (var key in incomeSources) {
                var source = incomeSources[key];
                var amount = source.baseIncome || 0;
                if (source.id === 'taxes' || source.id === 'tribute') {
                    amount = Math.floor(amount * (1 + (memberCount - 1) * 0.05));
                }
                if (_isUrbanLocation(household.locationId)) {
                    if (source.id === 'trade' || source.id === 'crafts') {
                        amount = Math.floor(amount * 1.3);
                    }
                }
                total += amount;
                breakdown.push({
                    source: source,
                    amount: amount
                });
            }

            if (breakdown.length === 0) {
                breakdown.push({
                    source: { id: 'base', name: 'Base Income', icon: '⌇' },
                    amount: 50
                });
                total = 50;
            }

            var breakdownHtml = breakdown.map(function(b) {
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span>' + _escapeHtml(b.source.name) + '</span>' +
                    '<span>' + b.amount + ' gold</span>' +
                    '</div>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Annual Income</span><br><span style="font-size: 1.1rem; font-weight: bold; color: #4a9e6a;">' + annualIncome + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Total Sources</span><br><span style="font-size: 0.9rem;">' + breakdown.length + '</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Income Sources</div>' +
                '<div style="background: var(--bg2); border-radius: 6px; padding: 8px;">' +
                breakdownHtml +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Based on household size, location, and member professions</div>' +
                '</div>';

            _openModal({
                title: 'Income: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening income modal', 'error');
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD EXPENSES MODAL
    // =========================================================================

    function openHouseholdExpensesModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var annualExpenses = _calculateAnnualExpenses(householdId);
            var expenseCategories = window.EXPENSE_CATEGORIES || {};
            var wealth = _getHouseholdWealth(householdId);

            var breakdown = [];
            var total = 0;
            var memberCount = household.members ? household.members.length : 1;

            for (var key in expenseCategories) {
                var category = expenseCategories[key];
                var amount = category.baseExpense || 0;
                if (category.id === 'food') {
                    amount = amount * memberCount;
                }
                if (category.id === 'staff') {
                    var staffCount = 0;
                    if (household.members) {
                        for (var i = 0; i < household.members.length; i++) {
                            if (household.members[i].type === 'staff') staffCount++;
                        }
                    }
                    amount = amount * Math.max(1, staffCount);
                }
                if (category.id === 'luxury' && wealth > 100) {
                    amount = amount * (1 + (wealth - 100) / 200);
                }
                total += amount;
                breakdown.push({
                    category: category,
                    amount: Math.floor(amount)
                });
            }

            var debt = _getHouseholdDebt(householdId);
            if (debt > 0) {
                var debtPayment = Math.min(10, debt * 0.1);
                total += debtPayment;
                breakdown.push({
                    category: { id: 'debt', name: 'Debt Payments', icon: '⌇' },
                    amount: Math.floor(debtPayment)
                });
            }

            var breakdownHtml = breakdown.map(function(b) {
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span>' + _escapeHtml(b.category.name) + '</span>' +
                    '<span>' + b.amount + ' gold</span>' +
                    '</div>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Annual Expenses</span><br><span style="font-size: 1.1rem; font-weight: bold; color: #c87040;">' + annualExpenses + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Net Change</span><br><span style="font-size: 1.1rem; font-weight: bold; color: ' + (annualExpenses > 0 ? '#c87040' : '#4a9e6a') + ';">' + (annualExpenses > 0 ? '-' : '+') + Math.abs(annualExpenses) + ' gold</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Expense Categories</div>' +
                '<div style="background: var(--bg2); border-radius: 6px; padding: 8px;">' +
                breakdownHtml +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Based on household size, staff count, wealth, and debt</div>' +
                '</div>';

            _openModal({
                title: 'Expenses: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening expenses modal', 'error');
        }
    }

    // =========================================================================
    // 9. HOUSEHOLD ANNUAL PROCESSING MODAL
    // =========================================================================

    function openHouseholdAnnualProcessingModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var annualIncome = _calculateAnnualIncome(householdId);
            var annualExpenses = _calculateAnnualExpenses(householdId);
            var netChange = annualIncome - annualExpenses;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">' +
                '<div><span style="color: var(--dim); font-size: 0.55rem;">Current Wealth</span><br><span style="font-size: 0.9rem;">' + wealth + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.55rem;">Income</span><br><span style="font-size: 0.9rem; color: #4a9e6a;">+' + annualIncome + ' gold</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.55rem;">Expenses</span><br><span style="font-size: 0.9rem; color: #c87040;">-' + annualExpenses + ' gold</span></div>' +
                '</div>' +
                '<div style="text-align: center; margin-top: 8px; padding: 6px; background: var(--bg); border-radius: 4px;">' +
                '<span style="font-size: 0.8rem; font-weight: bold; color: ' + (netChange >= 0 ? '#4a9e6a' : '#c87040') + ';">' +
                'Net Change: ' + (netChange >= 0 ? '+' : '') + netChange + ' gold' +
                '</span>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' +
                'New Wealth: ' + (wealth + netChange) + ' gold' +
                (debt > 0 ? ' · Debt: ' + debt + ' gold' : '') +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--warn);">Processing will apply annual income and expenses to the household.</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">This also consumes food based on member count.</div>' +
                '</div>';

            _openModal({
                title: 'Process Annual Economy: ' + household.name,
                content: modalContent,
                confirmText: 'Process Year',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var result = _processAnnualEconomy(householdId);

                    if (result && result.success) {
                        var msg = 'Annual processing complete. Wealth: ' + result.oldWealth + ' → ' + result.newWealth;
                        if (result.event) {
                            msg += ' · Event: ' + result.event.name + ' (' + (result.eventDelta > 0 ? '+' : '') + result.eventDelta + ')';
                        }
                        if (result.bankrupt) {
                            msg += ' · BANKRUPTCY!';
                        }
                        _showToast(msg, result.bankrupt ? 'error' : 'success');
                        _closeTopModal();
                        _processingEconomyModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to process annual economy', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening annual processing modal', 'error');
        }
    }

    // =========================================================================
    // 10. HOUSEHOLD ECONOMIC EVENTS MODAL
    // =========================================================================

    function openHouseholdEconomicEventsModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var eventTypes = _getEconomicEventTypes();

            var eventsHtml = eventTypes.map(function(e) {
                return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg2); border-radius: 4px; margin-bottom: 4px; border-left: 3px solid ' + (e.wealthModifier > 0 ? '#4a9e6a' : '#c87040') + ';">' +
                    '<div>' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(e.name) + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 8px;">' + (e.wealthModifier > 0 ? '+' : '') + (e.wealthModifier * 100) + '% · ' + e.minDelta + ' to ' + e.maxDelta + '</span>' +
                    '</div>' +
                    '<button class="event-trigger-btn btn small" data-event-id="' + e.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Trigger</button>' +
                    '</div>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Trigger an economic event for this household</div>' +
                '</div>' +
                '<div style="max-height: 300px; overflow-y: auto;">' +
                eventsHtml +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Economic Events: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            setTimeout(function() {
                var triggerBtns = document.querySelectorAll('.event-trigger-btn');
                triggerBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var eventId = this.dataset.eventId;
                        var result = _triggerEconomicEvent(householdId, eventId);

                        if (result) {
                            _showToast('Event triggered: ' + result.event.name + ' (' + (result.delta > 0 ? '+' : '') + result.delta + ' wealth)', 'info');
                            _closeTopModal();
                            _processingEconomyModal = false;
                            if (onSuccess) {
                                onSuccess(result);
                            }
                        } else {
                            _showToast('Failed to trigger event', 'error');
                        }
                    };
                });
            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening economic events modal', 'error');
        }
    }

    // =========================================================================
    // 11. HOUSEHOLD TRADE MODAL
    // =========================================================================

    function openHouseholdTradeModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var partners = _getTradePartners(householdId);
            var wealth = _getHouseholdWealth(householdId);
            var resources = _getHouseholdResources(householdId);

            if (partners.length === 0) {
                _showToast('No trade partners available in this location', 'info');
                _processingEconomyModal = false;
                return;
            }

            var partnerOptions = partners.map(function(p) {
                return '<option value="' + p.id + '">' + _escapeHtml(p.name) + ' (' + (p.members ? p.members.length : 0) + ' members)</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.6rem;">' +
                '<div><span style="color: var(--dim);">Wealth</span><br>' + wealth + ' gold</div>' +
                '<div><span style="color: var(--dim);">Food</span><br>' + (resources.food || 0) + '</div>' +
                '<div><span style="color: var(--dim);">Goods</span><br>' + (resources.goods || 0) + '</div>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Trade Partner</label>' +
                '<select id="tradePartnerSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">Select a partner</option>' +
                partnerOptions +
                '</select>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Give</label>' +
                '<input type="number" id="tradeGiveWealth" placeholder="Wealth" value="0" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '<input type="number" id="tradeGiveGoods" placeholder="Goods" value="0" style="width: 100%; margin-top: 4px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Receive</label>' +
                '<input type="number" id="tradeReceiveWealth" placeholder="Wealth" value="0" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '<input type="number" id="tradeReceiveGoods" placeholder="Goods" value="0" style="width: 100%; margin-top: 4px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 8px;">Trade will be executed if both parties have sufficient resources.</div>' +
                '</div>';

            _openModal({
                title: 'Trade: ' + household.name,
                content: modalContent,
                confirmText: 'Execute Trade',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var partnerId = document.getElementById('tradePartnerSelect').value;
                    var giveWealth = parseInt(document.getElementById('tradeGiveWealth').value) || 0;
                    var giveGoods = parseInt(document.getElementById('tradeGiveGoods').value) || 0;
                    var receiveWealth = parseInt(document.getElementById('tradeReceiveWealth').value) || 0;
                    var receiveGoods = parseInt(document.getElementById('tradeReceiveGoods').value) || 0;

                    if (!partnerId) {
                        _showToast('Please select a trade partner', 'error');
                        return false;
                    }

                    if (giveWealth === 0 && giveGoods === 0 && receiveWealth === 0 && receiveGoods === 0) {
                        _showToast('Please specify at least one item to trade', 'error');
                        return false;
                    }

                    var trade = {
                        sourceGives: { wealth: giveWealth, goods: giveGoods },
                        targetGives: { wealth: receiveWealth, goods: receiveGoods },
                        sourceGets: { wealth: receiveWealth, goods: receiveGoods },
                        targetGets: { wealth: giveWealth, goods: giveGoods }
                    };

                    var result = _executeTrade(householdId, partnerId, trade);

                    if (result) {
                        _showToast('Trade executed successfully', 'success');
                        _closeTopModal();
                        _processingEconomyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to execute trade', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening trade modal', 'error');
        }
    }

    // =========================================================================
    // 12. HOUSEHOLD ECONOMIC SUMMARY MODAL
    // =========================================================================

    function openHouseholdEconomicSummaryModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getHouseholdEconomicTier(householdId);
            var resources = _getHouseholdResources(householdId);
            var annualIncome = _calculateAnnualIncome(householdId);
            var annualExpenses = _calculateAnnualExpenses(householdId);
            var netChange = annualIncome - annualExpenses;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Economic Summary</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Wealth</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + wealth + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (debt > 0 ? '#c87040' : 'var(--text)') + ';">' + debt + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Tier</div>' +
                '<div style="font-size: 0.9rem;">' + _escapeHtml(tier.name) + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Food</div>' +
                '<div style="font-size: 0.9rem;">' + (resources.food || 0) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Livestock</div>' +
                '<div style="font-size: 0.9rem;">' + (resources.livestock || 0) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Goods</div>' +
                '<div style="font-size: 0.9rem;">' + (resources.goods || 0) + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Annual Income</div>' +
                '<div style="font-size: 0.9rem; color: #4a9e6a;">+' + annualIncome + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Annual Expenses</div>' +
                '<div style="font-size: 0.9rem; color: #c87040;">-' + annualExpenses + ' gold</div>' +
                '</div>' +
                '</div>' +
                '<div style="text-align: center; padding: 8px; background: var(--bg); border-radius: 4px;">' +
                '<span style="font-size: 0.8rem; font-weight: bold; color: ' + (netChange >= 0 ? '#4a9e6a' : '#c87040') + ';">' +
                'Net Annual Change: ' + (netChange >= 0 ? '+' : '') + netChange + ' gold' +
                '</span>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Economic Summary: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening economic summary', 'error');
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.openHouseholdWealthModal = openHouseholdWealthModal;
    window.openHouseholdResourcesModal = openHouseholdResourcesModal;
    window.openHouseholdIncomeModal = openHouseholdIncomeModal;
    window.openHouseholdExpensesModal = openHouseholdExpensesModal;
    window.openHouseholdEconomicEventsModal = openHouseholdEconomicEventsModal;
    window.openHouseholdTradeModal = openHouseholdTradeModal;
    window.openHouseholdAnnualProcessingModal = openHouseholdAnnualProcessingModal;
    window.openHouseholdEconomicSummaryModal = openHouseholdEconomicSummaryModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openHouseholdWealthModal: openHouseholdWealthModal,
            openHouseholdResourcesModal: openHouseholdResourcesModal,
            openHouseholdIncomeModal: openHouseholdIncomeModal,
            openHouseholdExpensesModal: openHouseholdExpensesModal,
            openHouseholdEconomicEventsModal: openHouseholdEconomicEventsModal,
            openHouseholdTradeModal: openHouseholdTradeModal,
            openHouseholdAnnualProcessingModal: openHouseholdAnnualProcessingModal,
            openHouseholdEconomicSummaryModal: openHouseholdEconomicSummaryModal
        };
    }

})();