/**
 * =============================================================================
 * HOUSEHOLD ECONOMY (household-economy.js)
 * =============================================================================
 * 
 * PURPOSE: Business logic for household economy management. Pure logic,
 *          no UI. Uses HouseholdState for data access and HouseholdCommands
 *          for write operations.
 * 
 * UPDATED: Added salary and tuition tracking functions
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getCurrentYear)
 * 
 * EXPORTS:
 *   - ECONOMIC_TIERS - Wealth classification tiers
 *   - INCOME_SOURCES - Income source definitions
 *   - EXPENSE_CATEGORIES - Expense category definitions
 *   - ECONOMIC_EVENT_TYPES - Economic event definitions
 *   - initializeHouseholdEconomy() - Setup economy data
 *   - estimateInitialWealth() - Calculate starting wealth
 *   - getEconomicTier() - Get tier from wealth
 *   - getHouseholdEconomicTier() - Get household's tier
 *   - updateHouseholdWealth() - Modify wealth with reason
 *   - getHouseholdWealth() - Get wealth
 *   - getHouseholdDebt() - Get debt
 *   - modifyHouseholdDebt() - Modify debt
 *   - getHouseholdResources() - Get resources
 *   - updateHouseholdResources() - Modify resources
 *   - calculateAnnualIncome() - Calculate annual income (UPDATED with salaries)
 *   - calculateAnnualExpenses() - Calculate annual expenses (UPDATED with tuition)
 *   - computeNetAnnualChange() - Net change
 *   - processAnnualEconomy() - Annual processing cycle
 *   - consumeAnnualFood() - Food consumption
 *   - executeTrade() - Execute trade
 *   - getTradePartners() - Find trade partners
 *   - triggerEconomicEvent() - Trigger specific event
 *   - applyRandomEconomicEvent() - Random event
 *   - processInheritance() - Wealth inheritance
 *   - isBankrupt() - Check bankruptcy
 *   - handleBankruptcy() - Handle bankruptcy
 *   - receiveSalary() - NEW: Add salary to household
 *   - trackTuitionExpense() - NEW: Track tuition payment
 *   - getSalaryIncome() - NEW: Get salary income
 *   - getTuitionExpenses() - NEW: Get tuition expenses
 *   - resetAnnualSalaries() - NEW: Reset salary tracking for new year
 *   - resetAnnualTuition() - NEW: Reset tuition tracking for new year
 *   - getEducationIncomeBonus() - Education bonus
 *   - getCrimeRiskModifier() - Crime risk
 *   - getHouseholdLoyaltyModifier() - Loyalty modifier
 *   - contributeToSettlement() - Settlement contribution
 *   - isRuralLocation() / isUrbanLocation() - Location check
 *   - getHouseholdCraftspeople() - Get craftspeople
 *   - clearCache() - Clear cached calculations
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

    var _processingEconomy = false;
    var _processingTrade = false;

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var ECONOMIC_TIERS = {
        DESTITUTE: { id: 'destitute', name: 'Destitute', minWealth: 0, maxWealth: 10, icon: '⌇', description: 'Struggling to survive' },
        POOR: { id: 'poor', name: 'Poor', minWealth: 11, maxWealth: 30, icon: '⌇', description: 'Barely making ends meet' },
        MODERATE: { id: 'moderate', name: 'Moderate', minWealth: 31, maxWealth: 70, icon: '⌂', description: 'Comfortable but not wealthy' },
        PROSPEROUS: { id: 'prosperous', name: 'Prosperous', minWealth: 71, maxWealth: 120, icon: '◉', description: 'Well-off and secure' },
        WEALTHY: { id: 'wealthy', name: 'Wealthy', minWealth: 121, maxWealth: 200, icon: '◉', description: 'Considerable assets' },
        NOBLE: { id: 'noble', name: 'Noble', minWealth: 201, maxWealth: 500, icon: '◉', description: 'Nobility status' },
        VERY_NOBLE: { id: 'very_noble', name: 'Very Noble', minWealth: 501, maxWealth: 1000, icon: '⌂', description: 'High nobility' },
        ROYAL: { id: 'royal', name: 'Royal', minWealth: 1001, maxWealth: Number.MAX_SAFE_INTEGER, icon: '◉', description: 'Royal or Imperial wealth' }
    };

    var INCOME_SOURCES = {
        AGRICULTURE: { id: 'agriculture', name: 'Agriculture', icon: '⌇', baseIncome: 10 },
        LIVESTOCK: { id: 'livestock', name: 'Livestock', icon: '⌇', baseIncome: 8 },
        TRADE: { id: 'trade', name: 'Trade', icon: '⌇', baseIncome: 15 },
        CRAFTS: { id: 'crafts', name: 'Crafts', icon: '⌇', baseIncome: 12 },
        TAXES: { id: 'taxes', name: 'Taxes', icon: '⌇', baseIncome: 20 },
        RENT: { id: 'rent', name: 'Rent', icon: '⌂', baseIncome: 10 },
        TRIBUTE: { id: 'tribute', name: 'Tribute', icon: '◉', baseIncome: 25 },
        PATRONAGE: { id: 'patronage', name: 'Patronage', icon: '⌇', baseIncome: 5 },
        MILITARY: { id: 'military', name: 'Military Service', icon: '⚔', baseIncome: 15 },
        MINING: { id: 'mining', name: 'Mining', icon: '⌇', baseIncome: 18 }
    };

    var EXPENSE_CATEGORIES = {
        FOOD: { id: 'food', name: 'Food & Supplies', icon: '⌇', baseExpense: 8 },
        MAINTENANCE: { id: 'maintenance', name: 'Property Maintenance', icon: '⌇', baseExpense: 6 },
        TAXES: { id: 'taxes', name: 'Taxes Paid', icon: '⌇', baseExpense: 10 },
        STAFF: { id: 'staff', name: 'Staff Wages', icon: '⌇', baseExpense: 12 },
        LUXURY: { id: 'luxury', name: 'Luxury Goods', icon: '◉', baseExpense: 15 },
        DEBT: { id: 'debt', name: 'Debt Payments', icon: '⌇', baseExpense: 10 },
        TITHE: { id: 'tithe', name: 'Religious Tithe', icon: '⌆', baseExpense: 5 },
        MEDICAL: { id: 'medical', name: 'Medical Expenses', icon: '⌇', baseExpense: 8 },
        // NEW: Tuition expense category
        TUITION: { id: 'tuition', name: 'Education Tuition', icon: '⌇', baseExpense: 0 }
    };

    var ECONOMIC_EVENT_TYPES = [
        { id: 'good_harvest', name: 'Good Harvest', wealthModifier: 0.2, minDelta: 5, maxDelta: 20, icon: '⌇' },
        { id: 'poor_harvest', name: 'Poor Harvest', wealthModifier: -0.15, minDelta: -15, maxDelta: -5, icon: '⌇' },
        { id: 'market_boom', name: 'Market Boom', wealthModifier: 0.3, minDelta: 10, maxDelta: 30, icon: '⌇' },
        { id: 'market_crash', name: 'Market Crash', wealthModifier: -0.25, minDelta: -25, maxDelta: -10, icon: '⌇' },
        { id: 'theft', name: 'Theft', wealthModifier: -0.1, minDelta: -20, maxDelta: -5, icon: '◉' },
        { id: 'inheritance', name: 'Inheritance', wealthModifier: 0.5, minDelta: 20, maxDelta: 100, icon: '⌇' },
        { id: 'tax_increase', name: 'Tax Increase', wealthModifier: -0.05, minDelta: -15, maxDelta: -5, icon: '⌇' }
    ];

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

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
        return window.masterData?.data?.characters || [];
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
        return window.masterData?.data?.places || [];
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _pickRandom(array) {
        if (!array || array.length === 0) {
            return null;
        }
        return array[Math.floor(Math.random() * array.length)];
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getHousehold) {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getHouseholdEconomy(householdId) {
        var household = _getHousehold(householdId);
        if (!household) return null;
        if (!household.economy) {
            household.economy = {
                wealth: 0,
                debt: 0,
                resources: { food: 0, livestock: 0, goods: 0 },
                incomeSources: [],
                expenses: [],
                economicTierId: 'moderate',
                lastProcessedYear: _getCurrentYear(),
                salaryIncome: 0,
                salaryIncomeHistory: [],
                totalSalaries: 0,
                salaryIncomeThisYear: 0,
                tuitionExpenses: 0,
                tuitionExpensesHistory: [],
                tuitionExpensesThisYear: 0
            };
        }
        return household.economy;
    }

    // =========================================================================
    // 3. STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;

    // =========================================================================
    // 4. CACHE
    // =========================================================================

    var _cachedCalculations = {
        income: {},
        expenses: {},
        netChange: {},
        tier: {}
    };

    function _clearCache() {
        _cachedCalculations = {
            income: {},
            expenses: {},
            netChange: {},
            tier: {}
        };
    }

    if (window.HouseholdState && typeof window.HouseholdState.subscribe === 'function') {
        window.HouseholdState.subscribe(function(event) {
            if (event.type === 'change' || event.type === 'refresh') {
                _clearCache();
            }
        });
    }

    // =========================================================================
    // 5. INITIALIZATION
    // =========================================================================

    function initializeHouseholdEconomy(household) {
        if (!household) return null;

        if (!household.economy) {
            household.economy = {
                wealth: 0,
                debt: 0,
                resources: {
                    food: 0,
                    livestock: 0,
                    goods: 0
                },
                incomeSources: [],
                expenses: [],
                economicTierId: 'moderate',
                lastProcessedYear: _getCurrentYear(),
                salaryIncome: 0,
                salaryIncomeHistory: [],
                totalSalaries: 0,
                salaryIncomeThisYear: 0,
                tuitionExpenses: 0,
                tuitionExpensesHistory: [],
                tuitionExpensesThisYear: 0
            };
        }

        if (household.economy.wealth === 0) {
            household.economy.wealth = estimateInitialWealth(household);
        }

        return household;
    }

    function estimateInitialWealth(household) {
        if (!household) return 50;

        var wealth = 50;
        var memberCount = household.members ? household.members.length : 1;
        wealth += memberCount * 5;

        var head = _state ? _state.getHouseholdHead(household.id) : null;
        if (head && head.activeRankId) {
            var rank = typeof window.getRankById === 'function' ? window.getRankById(head.activeRankId) : null;
            if (rank) {
                var rankBonus = (6 - (rank.priority || 5)) * 20;
                wealth += rankBonus;
            }
        }

        var location = household.locationId ? _getPlaceById(household.locationId) : null;
        if (location) {
            var isUrban = isUrbanLocation(location.id);
            if (isUrban) wealth *= 1.5;
        }

        return Math.min(500, Math.max(10, Math.floor(wealth)));
    }

    // =========================================================================
    // 6. ECONOMIC TIER FUNCTIONS
    // =========================================================================

    function getEconomicTier(wealth) {
        for (var key in ECONOMIC_TIERS) {
            var tier = ECONOMIC_TIERS[key];
            if (wealth >= tier.minWealth && wealth <= tier.maxWealth) {
                return tier;
            }
        }
        return ECONOMIC_TIERS.MODERATE;
    }

    function getHouseholdEconomicTier(householdId) {
        if (_cachedCalculations.tier[householdId]) {
            return _cachedCalculations.tier[householdId];
        }

        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) {
            return ECONOMIC_TIERS.MODERATE;
        }

        var tier = getEconomicTier(household.economy.wealth);
        _cachedCalculations.tier[householdId] = tier;
        return tier;
    }

    // =========================================================================
    // 7. WEALTH MANAGEMENT
    // =========================================================================

    function getHouseholdWealth(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 0;
        return household.economy.wealth || 0;
    }

    function updateHouseholdWealth(householdId, delta, reason) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            if (!household || !household.economy) return 0;

            var oldWealth = household.economy.wealth;
            var newWealth = Math.max(0, oldWealth + delta);
            household.economy.wealth = newWealth;

            var oldTier = getEconomicTier(oldWealth);
            var newTier = getEconomicTier(newWealth);

            if (oldTier.id !== newTier.id) {
                household.economy.economicTierId = newTier.id;
                _logEvent('economy', 'Tier Change',
                    household.name + ' changed from ' + oldTier.name + ' to ' + newTier.name,
                    []);
            }

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            _cachedCalculations.tier[householdId] = null;

            return newWealth;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 8. DEBT MANAGEMENT
    // =========================================================================

    function getHouseholdDebt(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 0;
        return household.economy.debt || 0;
    }

    function modifyHouseholdDebt(householdId, delta) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            if (!household || !household.economy) return 0;

            var newDebt = Math.max(0, (household.economy.debt || 0) + delta);
            household.economy.debt = newDebt;

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            return newDebt;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 9. RESOURCE MANAGEMENT
    // =========================================================================

    function getHouseholdResources(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) {
            return { food: 0, livestock: 0, goods: 0 };
        }
        return household.economy.resources || { food: 0, livestock: 0, goods: 0 };
    }

    function updateHouseholdResources(householdId, resourceType, delta) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            if (!household || !household.economy || !household.economy.resources) return 0;

            var current = household.economy.resources[resourceType] || 0;
            var newValue = Math.max(0, current + delta);
            household.economy.resources[resourceType] = newValue;

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            return newValue;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 10. SALARY FUNCTIONS (NEW)
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (_processingEconomy) {
            return false;
        }
        _processingEconomy = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) return false;

            var economy = _getHouseholdEconomy(householdId);
            if (!economy) return false;

            var currentYear = year || _getCurrentYear();

            // Update salary income tracking
            economy.salaryIncome = (economy.salaryIncome || 0) + salary;
            economy.salaryIncomeThisYear = (economy.salaryIncomeThisYear || 0) + salary;
            economy.totalSalaries = (economy.totalSalaries || 0) + salary;

            // Record salary history
            if (!economy.salaryIncomeHistory) economy.salaryIncomeHistory = [];
            economy.salaryIncomeHistory.push({
                year: currentYear,
                characterId: characterId,
                roleId: roleId,
                amount: salary
            });

            // Keep history manageable
            if (economy.salaryIncomeHistory.length > 100) {
                economy.salaryIncomeHistory = economy.salaryIncomeHistory.slice(-100);
            }

            // Update household wealth
            updateHouseholdWealth(householdId, salary, 'Salary from ' + (roleId || 'Unknown role'));

            // Save
            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            _logEvent('economy', 'Salary Received',
                household.name + ' received ' + salary + ' gold salary for character ' + characterId,
                []);

            return true;

        } finally {
            _processingEconomy = false;
        }
    }

    function trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (_processingEconomy) {
            return false;
        }
        _processingEconomy = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) return false;

            var economy = _getHouseholdEconomy(householdId);
            if (!economy) return false;

            var currentYear = year || _getCurrentYear();

            // Update tuition tracking
            economy.tuitionExpenses = (economy.tuitionExpenses || 0) + tuition;
            economy.tuitionExpensesThisYear = (economy.tuitionExpensesThisYear || 0) + tuition;

            // Record tuition history
            if (!economy.tuitionExpensesHistory) economy.tuitionExpensesHistory = [];
            economy.tuitionExpensesHistory.push({
                year: currentYear,
                institutionId: institutionId,
                studentId: studentId,
                amount: tuition
            });

            // Keep history manageable
            if (economy.tuitionExpensesHistory.length > 100) {
                economy.tuitionExpensesHistory = economy.tuitionExpensesHistory.slice(-100);
            }

            // Save
            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            _logEvent('economy', 'Tuition Paid',
                household.name + ' paid ' + tuition + ' gold tuition to ' + institutionId + ' for student ' + studentId,
                []);

            return true;

        } finally {
            _processingEconomy = false;
        }
    }

    function getSalaryIncome(householdId, year) {
        var household = _getHousehold(householdId);
        if (!household) return 0;

        var economy = _getHouseholdEconomy(householdId);
        if (!economy) return 0;

        if (year) {
            var total = 0;
            if (economy.salaryIncomeHistory) {
                for (var i = 0; i < economy.salaryIncomeHistory.length; i++) {
                    if (economy.salaryIncomeHistory[i].year === year) {
                        total += economy.salaryIncomeHistory[i].amount;
                    }
                }
            }
            return total;
        }

        return economy.salaryIncomeThisYear || economy.salaryIncome || 0;
    }

    function getTotalSalariesReceived(householdId) {
        var household = _getHousehold(householdId);
        if (!household) return 0;

        var economy = _getHouseholdEconomy(householdId);
        if (!economy) return 0;

        return economy.totalSalaries || 0;
    }

    function getTuitionExpenses(householdId, year) {
        var household = _getHousehold(householdId);
        if (!household) return 0;

        var economy = _getHouseholdEconomy(householdId);
        if (!economy) return 0;

        if (year) {
            var total = 0;
            if (economy.tuitionExpensesHistory) {
                for (var i = 0; i < economy.tuitionExpensesHistory.length; i++) {
                    if (economy.tuitionExpensesHistory[i].year === year) {
                        total += economy.tuitionExpensesHistory[i].amount;
                    }
                }
            }
            return total;
        }

        return economy.tuitionExpensesThisYear || economy.tuitionExpenses || 0;
    }

    function resetAnnualSalaries(householdId) {
        var household = _getHousehold(householdId);
        if (!household) return false;

        var economy = _getHouseholdEconomy(householdId);
        if (!economy) return false;

        economy.salaryIncomeThisYear = 0;
        economy.salaryIncome = 0;

        if (_state && typeof _state.updateHousehold === 'function') {
            _state.updateHousehold(householdId, { economy: economy }, { recordHistory: false });
        }

        return true;
    }

    function resetAnnualTuition(householdId) {
        var household = _getHousehold(householdId);
        if (!household) return false;

        var economy = _getHouseholdEconomy(householdId);
        if (!economy) return false;

        economy.tuitionExpensesThisYear = 0;
        economy.tuitionExpenses = 0;

        if (_state && typeof _state.updateHousehold === 'function') {
            _state.updateHousehold(householdId, { economy: economy }, { recordHistory: false });
        }

        return true;
    }

    // =========================================================================
    // 11. INCOME & EXPENSE CALCULATIONS (UPDATED)
    // =========================================================================

    function calculateAnnualIncome(householdId) {
        if (_cachedCalculations.income[householdId] !== undefined) {
            return _cachedCalculations.income[householdId];
        }

        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 0;

        var income = 0;
        var characters = _getCharacters();
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        // Member professions
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                var character = charMap[member.characterId];
                if (character && character.professions && character.professions.length) {
                    var primaryProf = character.professions.find(function(p) { return p.primary; }) || character.professions[0];
                    var role = typeof window.getRoleById === 'function' ? window.getRoleById(primaryProf.id) : null;
                    if (role) {
                        if (role.category === 'combat') income += 15;
                        else if (role.category === 'craft') income += 12;
                        else if (role.category === 'trade') income += 20;
                        else if (role.category === 'agriculture') income += 8;
                        else if (role.category === 'academic') income += 10;
                        else if (role.category === 'admin') income += 18;
                        else income += 10;
                    } else {
                        income += 10;
                    }
                } else {
                    income += 5;
                }
            }
        }

        // Location modifier
        var location = household.locationId ? _getPlaceById(household.locationId) : null;
        if (location) {
            if (isUrbanLocation(location.id)) {
                income *= 1.3;
            } else {
                income *= 0.9;
            }
        }

        // ================================================================
        // NEW: Add salary income
        // ================================================================
        var salaryIncome = getSalaryIncome(householdId);
        income += salaryIncome;

        // Education bonus
        var educationBonus = getEducationIncomeBonus(householdId);
        income *= (1 + educationBonus);

        var result = Math.floor(income);
        _cachedCalculations.income[householdId] = result;
        return result;
    }

    function calculateAnnualExpenses(householdId) {
        if (_cachedCalculations.expenses[householdId] !== undefined) {
            return _cachedCalculations.expenses[householdId];
        }

        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 0;

        var expenses = 0;
        var memberCount = household.members ? household.members.length : 1;

        // Food
        expenses += memberCount * 8;

        // Maintenance
        expenses += 6;

        // Taxes based on wealth
        var wealth = household.economy.wealth || 0;
        var taxRate = 0.1;
        var tier = getEconomicTier(wealth);
        if (tier.id === 'wealthy' || tier.id === 'noble') taxRate = 0.15;
        if (tier.id === 'royal') taxRate = 0.2;
        expenses += Math.floor(wealth * taxRate);

        // Debt payments
        if (household.economy.debt > 0) {
            var debtPayment = Math.min(10, household.economy.debt * 0.1);
            expenses += debtPayment;
        }

        // ================================================================
        // NEW: Add tuition expenses
        // ================================================================
        var tuitionExpenses = getTuitionExpenses(householdId);
        expenses += tuitionExpenses;

        var result = Math.floor(expenses);
        _cachedCalculations.expenses[householdId] = result;
        return result;
    }

    function computeNetAnnualChange(householdId) {
        if (_cachedCalculations.netChange[householdId] !== undefined) {
            return _cachedCalculations.netChange[householdId];
        }

        var income = calculateAnnualIncome(householdId);
        var expenses = calculateAnnualExpenses(householdId);
        var result = income - expenses;
        _cachedCalculations.netChange[householdId] = result;
        return result;
    }

    // =========================================================================
    // 12. ANNUAL PROCESSING
    // =========================================================================

    function processAnnualEconomy(householdId) {
        if (_processingEconomy) {
            return { success: false, reason: 'Already processing' };
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            if (!household || !household.economy) {
                return { success: false, reason: 'Household not found' };
            }

            var currentYear = _getCurrentYear();
            var netChange = computeNetAnnualChange(householdId);

            var oldWealth = household.economy.wealth;
            household.economy.wealth = Math.max(0, household.economy.wealth + netChange);
            household.economy.lastProcessedYear = currentYear;

            // Apply random economic event
            var eventResult = applyRandomEconomicEvent(householdId);
            if (eventResult.event) {
                household.economy.wealth = Math.max(0, household.economy.wealth + eventResult.delta);
            }

            // Consume food
            consumeAnnualFood(householdId);

            // Check bankruptcy
            var bankrupt = false;
            if (isBankrupt(householdId)) {
                handleBankruptcy(householdId);
                bankrupt = true;
            }

            // Reset annual tracking for next year
            resetAnnualSalaries(householdId);
            resetAnnualTuition(householdId);

            // Save
            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            // Clear cache
            _cachedCalculations.income[householdId] = null;
            _cachedCalculations.expenses[householdId] = null;
            _cachedCalculations.netChange[householdId] = null;
            _cachedCalculations.tier[householdId] = null;

            return {
                success: true,
                householdId: householdId,
                householdName: household.name,
                oldWealth: oldWealth,
                newWealth: household.economy.wealth,
                netChange: netChange,
                event: eventResult.event,
                eventDelta: eventResult.delta,
                bankrupt: bankrupt,
                year: currentYear
            };
        } finally {
            _processingEconomy = false;
        }
    }

    function consumeAnnualFood(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy || !household.economy.resources) return false;

        var memberCount = household.members ? household.members.length : 1;
        var foodNeeded = memberCount * 10;

        if (household.economy.resources.food >= foodNeeded) {
            household.economy.resources.food -= foodNeeded;
            return true;
        } else {
            var deficit = foodNeeded - household.economy.resources.food;
            household.economy.resources.food = 0;
            var foodCost = Math.min(household.economy.wealth, deficit * 2);
            household.economy.wealth -= foodCost;
            return false;
        }
    }

    // =========================================================================
    // 13. TRADE SYSTEM
    // =========================================================================

    function executeTrade(sourceId, targetId, trade) {
        if (_processingTrade) {
            return false;
        }
        _processingTrade = true;

        try {
            var source = _state ? _state.getHousehold(sourceId) : null;
            var target = _state ? _state.getHousehold(targetId) : null;

            if (!source || !target) return false;
            if (!source.economy || !target.economy) return false;

            var sourceGives = trade.sourceGives || {};
            var targetGives = trade.targetGives || {};

            if (sourceGives.wealth && source.economy.wealth < sourceGives.wealth) return false;
            if (sourceGives.goods && (source.economy.resources?.goods || 0) < sourceGives.goods) return false;

            if (targetGives.wealth && target.economy.wealth < targetGives.wealth) return false;
            if (targetGives.goods && (target.economy.resources?.goods || 0) < targetGives.goods) return false;

            if (sourceGives.wealth) {
                source.economy.wealth -= sourceGives.wealth;
                target.economy.wealth += sourceGives.wealth;
            }
            if (targetGives.wealth) {
                target.economy.wealth -= targetGives.wealth;
                source.economy.wealth += targetGives.wealth;
            }
            if (sourceGives.goods) {
                source.economy.resources.goods = (source.economy.resources.goods || 0) - sourceGives.goods;
                target.economy.resources.goods = (target.economy.resources.goods || 0) + sourceGives.goods;
            }
            if (targetGives.goods) {
                target.economy.resources.goods = (target.economy.resources.goods || 0) - targetGives.goods;
                source.economy.resources.goods = (source.economy.resources.goods || 0) + targetGives.goods;
            }

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(sourceId, { economy: source.economy }, { recordHistory: false });
                _state.updateHousehold(targetId, { economy: target.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            _logEvent('economy', 'Trade Executed',
                source.name + ' traded with ' + target.name,
                []);

            return true;
        } finally {
            _processingTrade = false;
        }
    }

    function getTradePartners(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household) return [];

        var households = _state ? _state.getAllHouseholds() : [];
        var partners = [];

        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.id !== householdId && h.locationId === household.locationId) {
                partners.push(h);
            }
        }

        return partners;
    }

    // =========================================================================
    // 14. ECONOMIC EVENTS
    // =========================================================================

    function triggerEconomicEvent(householdId, eventTypeId) {
        var event = null;
        for (var i = 0; i < ECONOMIC_EVENT_TYPES.length; i++) {
            if (ECONOMIC_EVENT_TYPES[i].id === eventTypeId) {
                event = ECONOMIC_EVENT_TYPES[i];
                break;
            }
        }

        if (!event) return null;

        var delta = _randomInt(event.minDelta, event.maxDelta);
        var newWealth = updateHouseholdWealth(householdId, delta, event.name);

        _logEvent('economy', 'Economic Event',
            event.name + ' affected household',
            []);

        return {
            event: event,
            delta: delta,
            newWealth: newWealth
        };
    }

    function applyRandomEconomicEvent(householdId) {
        if (!_chance(0.3)) {
            return { event: null, delta: 0 };
        }

        var event = _pickRandom(ECONOMIC_EVENT_TYPES);
        if (!event) {
            return { event: null, delta: 0 };
        }

        var delta = _randomInt(event.minDelta, event.maxDelta);
        updateHouseholdWealth(householdId, delta, event.name);

        return { event: event, delta: delta };
    }

    // =========================================================================
    // 15. INHERITANCE & BANKRUPTCY
    // =========================================================================

    function processInheritance(householdId, heirId) {
        if (_processingEconomy) {
            return false;
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            var heir = _getCharacterById(heirId);

            if (!household || !heir) return false;

            if (household.economy) {
                var inheritanceWealth = household.economy.wealth;
                updateHouseholdWealth(householdId, -inheritanceWealth, 'Inheritance transfer out');

                if (heir.householdId) {
                    var heirHousehold = _state ? _state.getHousehold(heir.householdId) : null;
                    if (heirHousehold && heirHousehold.economy) {
                        updateHouseholdWealth(heirHousehold.id, inheritanceWealth, 'Inheritance from ' + household.name);
                    }
                }
            }

            _logEvent('economy', 'Inheritance Processed',
                heir.name + ' inherited from ' + household.name,
                []);

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    function isBankrupt(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return false;

        return household.economy.wealth <= 0 && household.economy.debt > 0;
    }

    function handleBankruptcy(householdId) {
        if (_processingEconomy) {
            return false;
        }
        _processingEconomy = true;

        try {
            var household = _state ? _state.getHousehold(householdId) : null;
            if (!household || !household.economy) return false;

            household.economy.wealth = 5;
            household.economy.debt = Math.max(0, household.economy.debt - 20);
            household.economy.economicTierId = 'destitute';

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
            } else {
                _saveMasterData();
            }

            _logEvent('economy', 'Bankruptcy',
                household.name + ' declared bankruptcy',
                []);

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 16. INTEGRATION FUNCTIONS
    // =========================================================================

    function getEducationIncomeBonus(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.members) return 0;

        var literateCount = 0;
        var educatedCount = 0;

        var characters = _getCharacters();
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        for (var i = 0; i < household.members.length; i++) {
            var character = charMap[household.members[i].characterId];
            if (character) {
                var isLiterate = character.isLiterate === true;
                if (isLiterate) literateCount++;

                var eduLevel = typeof window.getEducationLevel === 'function' ? window.getEducationLevel(character.id) : null;
                if (eduLevel && (eduLevel.id === 'educated' || eduLevel.id === 'scholar')) {
                    educatedCount++;
                }
            }
        }

        var bonus = 0;
        bonus += literateCount * 0.05;
        bonus += educatedCount * 0.1;

        return Math.min(0.5, bonus);
    }

    function getCrimeRiskModifier(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 1;

        var risk = 1;
        var tier = getEconomicTier(household.economy.wealth);

        if (tier.id === 'destitute') risk = 2.5;
        else if (tier.id === 'poor') risk = 1.8;
        else if (tier.id === 'moderate') risk = 1;
        else if (tier.id === 'wealthy') risk = 0.8;
        else if (tier.id === 'noble') risk = 0.5;
        else risk = 0.3;

        if (household.economy.debt > 50) risk *= 1.5;

        return Math.min(3, Math.max(0.3, risk));
    }

    function getHouseholdLoyaltyModifier(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return 0;

        var modifier = 0;
        var tier = getEconomicTier(household.economy.wealth);

        if (tier.id === 'destitute') modifier = -15;
        else if (tier.id === 'poor') modifier = -8;
        else if (tier.id === 'moderate') modifier = 0;
        else if (tier.id === 'wealthy') modifier = 5;
        else if (tier.id === 'noble') modifier = 10;
        else if (tier.id === 'royal') modifier = 15;

        if (household.economy.debt > 0) {
            modifier -= Math.min(10, household.economy.debt / 20);
        }

        return modifier;
    }

    function contributeToSettlement(householdId, amount) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.economy) return false;

        if (household.economy.wealth < amount) return false;

        household.economy.wealth -= amount;

        if (typeof window.modifySettlementTreasury === 'function' && household.locationId) {
            window.modifySettlementTreasury(household.locationId, amount);
        }

        if (_state && typeof _state.updateHousehold === 'function') {
            _state.updateHousehold(householdId, { economy: household.economy }, { recordHistory: false });
        } else {
            _saveMasterData();
        }

        _logEvent('economy', 'Settlement Contribution',
            household.name + ' contributed ' + amount + ' to settlement',
            []);

        return true;
    }

    // =========================================================================
    // 17. LOCATION HELPERS
    // =========================================================================

    function isRuralLocation(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) return true;

        var typeId = place.typeId;
        var type = _getLocationTypeById(typeId);

        return !type || type.priority > 3;
    }

    function isUrbanLocation(locationId) {
        return !isRuralLocation(locationId);
    }

    // =========================================================================
    // 18. HOUSEHOLD CRAFTSPEOPLE
    // =========================================================================

    function getHouseholdCraftspeople(householdId) {
        var household = _state ? _state.getHousehold(householdId) : null;
        if (!household || !household.members) return [];

        var characters = _getCharacters();
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        var craftspeople = [];
        for (var i = 0; i < household.members.length; i++) {
            var character = charMap[household.members[i].characterId];
            if (character && character.professions) {
                for (var j = 0; j < character.professions.length; j++) {
                    var role = typeof window.getRoleById === 'function' ? window.getRoleById(character.professions[j].id) : null;
                    if (role && role.category === 'craft') {
                        craftspeople.push(character);
                        break;
                    }
                }
            }
        }
        return craftspeople;
    }

    // =========================================================================
    // 19. CACHE MANAGEMENT
    // =========================================================================

    function clearCache() {
        _clearCache();
    }

    // =========================================================================
    // 20. EXPORTS
    // =========================================================================

    window.ECONOMIC_TIERS = ECONOMIC_TIERS;
    window.INCOME_SOURCES = INCOME_SOURCES;
    window.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
    window.ECONOMIC_EVENT_TYPES = ECONOMIC_EVENT_TYPES;

    window.HouseholdEconomy = {
        // Initialization
        initializeHouseholdEconomy: initializeHouseholdEconomy,
        estimateInitialWealth: estimateInitialWealth,

        // Tiers
        getEconomicTier: getEconomicTier,
        getHouseholdEconomicTier: getHouseholdEconomicTier,

        // Wealth
        getHouseholdWealth: getHouseholdWealth,
        updateHouseholdWealth: updateHouseholdWealth,

        // Debt
        getHouseholdDebt: getHouseholdDebt,
        modifyHouseholdDebt: modifyHouseholdDebt,

        // Resources
        getHouseholdResources: getHouseholdResources,
        updateHouseholdResources: updateHouseholdResources,

        // Income & Expenses (UPDATED)
        calculateAnnualIncome: calculateAnnualIncome,
        calculateAnnualExpenses: calculateAnnualExpenses,
        computeNetAnnualChange: computeNetAnnualChange,

        // Annual Processing
        processAnnualEconomy: processAnnualEconomy,
        consumeAnnualFood: consumeAnnualFood,

        // Trade
        executeTrade: executeTrade,
        getTradePartners: getTradePartners,

        // Events
        triggerEconomicEvent: triggerEconomicEvent,
        applyRandomEconomicEvent: applyRandomEconomicEvent,

        // Inheritance & Bankruptcy
        processInheritance: processInheritance,
        isBankrupt: isBankrupt,
        handleBankruptcy: handleBankruptcy,

        // NEW: Salary functions
        receiveSalary: receiveSalary,
        getSalaryIncome: getSalaryIncome,
        getTotalSalariesReceived: getTotalSalariesReceived,
        resetAnnualSalaries: resetAnnualSalaries,

        // NEW: Tuition functions
        trackTuitionExpense: trackTuitionExpense,
        getTuitionExpenses: getTuitionExpenses,
        resetAnnualTuition: resetAnnualTuition,

        // Integration
        getEducationIncomeBonus: getEducationIncomeBonus,
        getCrimeRiskModifier: getCrimeRiskModifier,
        getHouseholdLoyaltyModifier: getHouseholdLoyaltyModifier,
        contributeToSettlement: contributeToSettlement,

        // Location
        isRuralLocation: isRuralLocation,
        isUrbanLocation: isUrbanLocation,

        // Queries
        getHouseholdCraftspeople: getHouseholdCraftspeople,

        // Cache
        clearCache: clearCache
    };

    // Legacy aliases
    window.initializeHouseholdEconomy = initializeHouseholdEconomy;
    window.estimateInitialWealth = estimateInitialWealth;
    window.getEconomicTier = getEconomicTier;
    window.getHouseholdEconomicTier = getHouseholdEconomicTier;
    window.updateHouseholdWealth = updateHouseholdWealth;
    window.getHouseholdWealth = getHouseholdWealth;
    window.getHouseholdDebt = getHouseholdDebt;
    window.modifyHouseholdDebt = modifyHouseholdDebt;
    window.getHouseholdResources = getHouseholdResources;
    window.updateHouseholdResources = updateHouseholdResources;
    window.calculateAnnualIncome = calculateAnnualIncome;
    window.calculateAnnualExpenses = calculateAnnualExpenses;
    window.computeNetAnnualChange = computeNetAnnualChange;
    window.processAnnualEconomy = processAnnualEconomy;
    window.consumeAnnualFood = consumeAnnualFood;
    window.executeTrade = executeTrade;
    window.getTradePartners = getTradePartners;
    window.triggerEconomicEvent = triggerEconomicEvent;
    window.applyRandomEconomicEvent = applyRandomEconomicEvent;
    window.processInheritance = processInheritance;
    window.isBankrupt = isBankrupt;
    window.handleBankruptcy = handleBankruptcy;
    window.getEducationIncomeBonus = getEducationIncomeBonus;
    window.getCrimeRiskModifier = getCrimeRiskModifier;
    window.getHouseholdLoyaltyModifier = getHouseholdLoyaltyModifier;
    window.contributeToSettlement = contributeToSettlement;
    window.isRuralLocation = isRuralLocation;
    window.isUrbanLocation = isUrbanLocation;
    window.getHouseholdCraftspeople = getHouseholdCraftspeople;

    // NEW legacy aliases
    window.receiveSalary = receiveSalary;
    window.getSalaryIncome = getSalaryIncome;
    window.getTotalSalariesReceived = getTotalSalariesReceived;
    window.resetAnnualSalaries = resetAnnualSalaries;
    window.trackTuitionExpense = trackTuitionExpense;
    window.getTuitionExpenses = getTuitionExpenses;
    window.resetAnnualTuition = resetAnnualTuition;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ECONOMIC_TIERS: ECONOMIC_TIERS,
            INCOME_SOURCES: INCOME_SOURCES,
            EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
            ECONOMIC_EVENT_TYPES: ECONOMIC_EVENT_TYPES,
            initializeHouseholdEconomy: initializeHouseholdEconomy,
            estimateInitialWealth: estimateInitialWealth,
            getEconomicTier: getEconomicTier,
            getHouseholdEconomicTier: getHouseholdEconomicTier,
            getHouseholdWealth: getHouseholdWealth,
            updateHouseholdWealth: updateHouseholdWealth,
            getHouseholdDebt: getHouseholdDebt,
            modifyHouseholdDebt: modifyHouseholdDebt,
            getHouseholdResources: getHouseholdResources,
            updateHouseholdResources: updateHouseholdResources,
            calculateAnnualIncome: calculateAnnualIncome,
            calculateAnnualExpenses: calculateAnnualExpenses,
            computeNetAnnualChange: computeNetAnnualChange,
            processAnnualEconomy: processAnnualEconomy,
            consumeAnnualFood: consumeAnnualFood,
            executeTrade: executeTrade,
            getTradePartners: getTradePartners,
            triggerEconomicEvent: triggerEconomicEvent,
            applyRandomEconomicEvent: applyRandomEconomicEvent,
            processInheritance: processInheritance,
            isBankrupt: isBankrupt,
            handleBankruptcy: handleBankruptcy,
            getEducationIncomeBonus: getEducationIncomeBonus,
            getCrimeRiskModifier: getCrimeRiskModifier,
            getHouseholdLoyaltyModifier: getHouseholdLoyaltyModifier,
            contributeToSettlement: contributeToSettlement,
            isRuralLocation: isRuralLocation,
            isUrbanLocation: isUrbanLocation,
            getHouseholdCraftspeople: getHouseholdCraftspeople,
            clearCache: clearCache,
            receiveSalary: receiveSalary,
            getSalaryIncome: getSalaryIncome,
            getTotalSalariesReceived: getTotalSalariesReceived,
            resetAnnualSalaries: resetAnnualSalaries,
            trackTuitionExpense: trackTuitionExpense,
            getTuitionExpenses: getTuitionExpenses,
            resetAnnualTuition: resetAnnualTuition
        };
    }

})();