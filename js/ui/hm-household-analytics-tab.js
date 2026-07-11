/**
 * =============================================================================
 * HOUSEHOLD ANALYTICS TAB UI
 * =============================================================================
 * 
 * UPDATED: Uses new HouseholdState/HouseholdCommands/HouseholdQueries system
 * 
 * DEPENDENCIES:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - household-economy.js (HouseholdEconomy)
 *   - modals-core.js (_escapeHtml, _showToast)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
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

    function _formatNumber(num) {
        if (typeof window.formatNumber === 'function') return window.formatNumber(num);
        if (num === undefined || num === null) return '0';
        return num.toLocaleString();
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

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    // =========================================================================
    // 2. STATE, COMMANDS, QUERIES, ECONOMY REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _economy = window.HouseholdEconomy;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') {
            return window.getActiveRankDisplay(character);
        }
        return null;
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

    // Household data
    function _getHouseholdMembers(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.members || []) : [];
    }

    function _getFamilyMembers(householdId) {
        return _queries ? _queries.getFamilyMembers(householdId) : [];
    }

    function _getStaffMembers(householdId) {
        return _queries ? _queries.getStaffMembers(householdId) : [];
    }

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getHouseholdWealth(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.wealth || 0) : 0;
    }

    function _getHouseholdDebt(householdId) {
        return _economy ? _economy.getHouseholdDebt(householdId) : 0;
    }

    function _getHouseholdEconomicTier(householdId) {
        return _economy ? _economy.getHouseholdEconomicTier(householdId) : null;
    }

    function _getHouseholdResources(householdId) {
        return _economy ? _economy.getHouseholdResources(householdId) : { food: 0, goods: 0, livestock: 0 };
    }

    function _getHouseholdReputation(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.reputation || 50) : 50;
    }

    function _getHouseholdVendettas(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.vendettas || []) : [];
    }

    function _getHouseholdEducationStats(householdId) {
        if (typeof window.getHouseholdEducationStats === 'function') {
            return window.getHouseholdEducationStats(householdId);
        }
        return null;
    }

    function _getHouseholdSuccession(householdId) {
        return _queries ? _queries.getSuccession(householdId) : [];
    }

    function _getHouseholdMemberBreakdown(householdId) {
        return _queries ? _queries.getMemberBreakdown(householdId) : null;
    }

    function _estimateHouseholdWealth(householdId) {
        if (typeof window.estimateHouseholdWealth === 'function') {
            return window.estimateHouseholdWealth(householdId);
        }
        var wealth = _getHouseholdWealth(householdId);
        return Math.min(100, Math.floor(wealth / 10));
    }

    function _getHouseholdHighestRank(householdId) {
        if (typeof window.getHouseholdHighestRank === 'function') {
            return window.getHouseholdHighestRank(householdId);
        }
        var members = _getHouseholdMembers(householdId);
        var highest = null;
        for (var i = 0; i < members.length; i++) {
            var char = members[i].character;
            if (!char) continue;
            var rank = _getActiveRankDisplay(char);
            if (rank && rank.priority !== undefined) {
                if (!highest || rank.priority < highest.priority) {
                    highest = rank;
                }
            }
        }
        return highest;
    }

    function _getHouseholdPowerScore(householdId) {
        if (typeof window.updateHouseholdPowerScore === 'function') {
            return window.updateHouseholdPowerScore(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.powerScore || 0) : 0;
    }

    function _getHouseholdLoyaltyModifier(householdId) {
        return _economy ? _economy.getHouseholdLoyaltyModifier(householdId) : 0;
    }

    function _getCrimeRiskModifier(householdId) {
        return _economy ? _economy.getCrimeRiskModifier(householdId) : 1;
    }

    function _getEducationIncomeBonus(householdId) {
        return _economy ? _economy.getEducationIncomeBonus(householdId) : 0;
    }

    function _getHouseholdHealthScore(householdId) {
        if (typeof window.getHouseholdHealthScore === 'function') {
            return window.getHouseholdHealthScore(householdId);
        }
        return null;
    }

    function _getHouseholdLineage(householdId) {
        return _queries ? _queries.getLineage(householdId) : [];
    }

    function _getMostCommonStaffRoles(limit) {
        if (typeof window.getMostCommonStaffRoles === 'function') {
            return window.getMostCommonStaffRoles(limit);
        }
        return [];
    }

    function _getHouseholdSnapshot(householdId, year) {
        if (typeof window.getHouseholdSnapshot === 'function') {
            return window.getHouseholdSnapshot(householdId, year);
        }
        return null;
    }

    function _getHouseholdNamePeriods(householdId) {
        if (typeof window.getHouseholdNamePeriods === 'function') {
            return window.getHouseholdNamePeriods(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.nameHistory || []) : [];
    }

    // =========================================================================
    // 5. STATE
    // =========================================================================

    var analyticsState = {
        viewYear: null,
        showHistorical: false,
        _isRendering: false
    };

    // =========================================================================
    // 6. SECTION RENDERERS
    // =========================================================================

    function _renderMemberStats(familyMembers, staffMembers, memberBreakdown, commonRoles) {
        var familyHtml = '';
        if (familyMembers.length > 0) {
            var displayMembers = familyMembers.slice(0, 5);
            familyHtml = displayMembers.map(function(m) {
                var age = _calculateAge(m.character.birthYear, false, null);
                var rankDisplay = _getActiveRankDisplay(m.character);
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0;">' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(m.characterName || m.character.name) + '</span>' +
                    '<span style="font-size: 0.6rem; color: var(--dim);">' + age + ' yrs</span>' +
                    (rankDisplay ? '<span style="font-size: 0.55rem; color: var(--accent);">⟡ ' + _escapeHtml(rankDisplay) + '</span>' : '') +
                    '</div>';
            }).join('');
            if (familyMembers.length > 5) {
                familyHtml += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 4px;">⟡ +' + (familyMembers.length - 5) + ' more</div>';
            }
        } else {
            familyHtml = '<div style="color: var(--dim); text-align: center; padding: 12px;">⟡ No family members</div>';
        }

        var staffHtml = '';
        if (staffMembers.length > 0) {
            var displayStaff = staffMembers.slice(0, 5);
            staffHtml = displayStaff.map(function(m) {
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0;">' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(m.characterName || m.character.name) + '</span>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">⟡ ' + _escapeHtml(m.role || 'Staff') + '</span>' +
                    '</div>';
            }).join('');
            if (staffMembers.length > 5) {
                staffHtml += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 4px;">⟡ +' + (staffMembers.length - 5) + ' more</div>';
            }
        } else {
            staffHtml = '<div style="color: var(--dim); text-align: center; padding: 12px;">⟡ No staff members</div>';
        }

        var commonRolesHtml = '';
        if (commonRoles.length > 0) {
            commonRolesHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">⟡ Most Common Staff Roles</div>' +
                '<div style="display: flex; flex-wrap: wrap; gap: 6px;">' +
                commonRoles.map(function(r) {
                    return '<span style="background: var(--bg3); padding: 2px 6px; border-radius: 12px; font-size: 0.55rem;">' + _escapeHtml(r.role) + ' (' + r.count + ')</span>';
                }).join('') +
                '</div></div>';
        }

        return '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">' +
            '<div><div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">⟡ Family (' + familyMembers.length + ')</div>' +
            '<div style="max-height: 200px; overflow-y: auto;">' + familyHtml + '</div></div>' +
            '<div><div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">⟡ Staff (' + staffMembers.length + ')</div>' +
            '<div style="max-height: 200px; overflow-y: auto;">' + staffHtml + '</div></div></div>' +
            (memberBreakdown ? '<div style="margin: 12px 0;"></div>' +
                '<div style="display: flex; justify-content: space-between;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">⟡ Family / Staff Ratio:</div>' +
                '<div style="font-size: 0.6rem;">' + Math.round(memberBreakdown.familyPercentage) + '% / ' + Math.round(memberBreakdown.staffPercentage) + '%</div></div>' : '') +
            commonRolesHtml;
    }

    function _renderDepartments(household, departments) {
        if (!departments || departments.length === 0) {
            return '<div style="color: var(--dim); text-align: center; padding: 20px;">⌂ No departments established</div>';
        }

        var deptHtml = '';
        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];
            var members = household.members ? household.members.filter(function(m) { return m.departmentId === dept.id; }) : [];
            var headChar = dept.headId ? _getCharacterById(dept.headId) : null;

            var deptIcon = '⌂';
            var deptNameLower = dept.name.toLowerCase();
            if (deptNameLower.indexOf('guard') !== -1 || deptNameLower.indexOf('militia') !== -1 || deptNameLower.indexOf('watch') !== -1) {
                deptIcon = '⚔';
            } else if (deptNameLower.indexOf('kitchen') !== -1 || deptNameLower.indexOf('cook') !== -1) {
                deptIcon = '⟡';
            } else if (deptNameLower.indexOf('stable') !== -1) {
                deptIcon = '⟡';
            } else if (deptNameLower.indexOf('account') !== -1 || deptNameLower.indexOf('treasury') !== -1) {
                deptIcon = '♡';
            }

            deptHtml += '<div style="background: var(--bg3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="display: flex; justify-content: space-between; margin-bottom: 8px;">' +
                '<span style="font-weight: bold; font-size: 0.7rem;">' + deptIcon + ' ' + _escapeHtml(dept.name) + '</span>' +
                '<span style="font-size: 0.6rem; color: var(--dim);">⟡ ' + members.length + ' members</span></div>' +
                (headChar ? '<div style="font-size: 0.6rem;">♡ Head: ' + _escapeHtml(headChar.name) + ' ' + _escapeHtml(headChar.surname || '') + '</div>' : '<div style="font-size: 0.6rem; color: var(--dim);">⌂ No head assigned</div>') +
                '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">' +
                members.slice(0, 3).map(function(m) {
                    var char = _getCharacterById(m.characterId);
                    return '<span style="background: var(--bg2); padding: 2px 6px; border-radius: 12px; font-size: 0.55rem;">' + (char ? _escapeHtml(char.name) : '?') + '</span>';
                }).join('') +
                (members.length > 3 ? '<span style="background: var(--bg2); padding: 2px 6px; border-radius: 12px; font-size: 0.55rem;">⟡ +' + (members.length - 3) + '</span>' : '') +
                '</div></div>';
        }

        return '<div>' + deptHtml + '</div>';
    }

    function _renderResources(resources) {
        var foodWeeks = Math.floor(resources.food / 12);
        var selfSufficiency = resources.food >= 100 ? '♡ Self-sufficient' : resources.food >= 50 ? '⟡ Stable' : '✗ Food insecure';
        var selfSufficiencyColor = resources.food >= 100 ? '#4caf50' : resources.food >= 50 ? '#ff9800' : '#f44336';

        return '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">' +
            '<div><div style="font-size: 1.2rem;">⟡</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + _formatNumber(resources.food) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">Food</div>' +
            '<div style="font-size: 0.55rem;">' + foodWeeks + ' weeks supply</div></div>' +
            '<div><div style="font-size: 1.2rem;">⟡</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + _formatNumber(resources.goods) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">Goods</div></div>' +
            '<div><div style="font-size: 1.2rem;">⟡</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + _formatNumber(resources.livestock) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">Livestock</div></div></div>' +
            '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light); text-align: center;">' +
            '<span style="font-size: 0.6rem; color: ' + selfSufficiencyColor + ';">' + selfSufficiency + '</span></div>';
    }

    function _renderWealthStanding(wealth, estimatedWealth, highestRank, loyaltyModifier, crimeRiskModifier, educationBonus) {
        var wealthLevel = wealth >= 500 ? 'Royal' : wealth >= 200 ? 'Noble' : wealth >= 100 ? 'Wealthy' : wealth >= 50 ? 'Prosperous' : wealth >= 20 ? 'Moderate' : 'Poor';
        var wealthIcon = wealth >= 500 ? '♡' : wealth >= 200 ? '♡' : wealth >= 100 ? '⟡' : wealth >= 50 ? '⟡' : '✗';
        var wealthColor = wealth >= 500 ? 'gold' : wealth >= 200 ? 'var(--accent)' : wealth >= 100 ? '#4caf50' : wealth >= 50 ? '#2196f3' : '#ff9800';

        var loyaltyDisplay = '';
        var loyaltyColor = 'var(--dim)';
        if (loyaltyModifier > 5) {
            loyaltyDisplay = '♡ +' + loyaltyModifier;
            loyaltyColor = '#4caf50';
        } else if (loyaltyModifier > 0) {
            loyaltyDisplay = '✓ +' + loyaltyModifier;
            loyaltyColor = '#4caf50';
        } else if (loyaltyModifier < -5) {
            loyaltyDisplay = '✗ ' + loyaltyModifier;
            loyaltyColor = '#f44336';
        } else if (loyaltyModifier < 0) {
            loyaltyDisplay = '⟡ ' + loyaltyModifier;
            loyaltyColor = '#ff9800';
        } else {
            loyaltyDisplay = '⟡ 0';
        }

        var crimeDisplay = '';
        var crimeColor = 'var(--dim)';
        if (crimeRiskModifier >= 2) {
            crimeDisplay = '✗ ' + crimeRiskModifier.toFixed(1) + 'x';
            crimeColor = '#f44336';
        } else if (crimeRiskModifier >= 1.5) {
            crimeDisplay = '⟡ ' + crimeRiskModifier.toFixed(1) + 'x';
            crimeColor = '#ff9800';
        } else if (crimeRiskModifier <= 0.5) {
            crimeDisplay = '♡ ' + crimeRiskModifier.toFixed(1) + 'x';
            crimeColor = '#4caf50';
        } else {
            crimeDisplay = '⟡ ' + crimeRiskModifier.toFixed(1) + 'x';
        }

        return '<div style="text-align: center;">' +
            '<div style="margin-bottom: 12px;">' +
            '<span style="font-size: 1.5rem;">' + wealthIcon + '</span>' +
            '<div style="font-weight: bold; color: ' + wealthColor + ';">' + wealthLevel + '</div></div>' +
            '<div style="display: flex; justify-content: space-between; margin-top: 12px;">' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⟡ Estimated Power Score:</div>' +
            '<div style="font-size: 0.6rem;">' + estimatedWealth + '/100</div></div>' +
            '<div style="background: var(--bg3); border-radius: 4px; height: 6px; margin: 8px 0; overflow: hidden;">' +
            '<div style="width: ' + Math.min(100, wealth / 10) + '%; height: 100%; background: ' + wealthColor + '; border-radius: 4px;"></div></div>' +
            '<div style="display: flex; justify-content: space-between; margin-top: 8px;">' +
            '<div style="font-size: 0.6rem; color: var(--dim);">♡ Loyalty Modifier:</div>' +
            '<div style="font-size: 0.6rem; color: ' + loyaltyColor + ';">' + loyaltyDisplay + '</div></div>' +
            '<div style="display: flex; justify-content: space-between;">' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⚔ Crime Risk:</div>' +
            '<div style="font-size: 0.6rem; color: ' + crimeColor + ';">' + crimeDisplay + '</div></div>' +
            '<div style="display: flex; justify-content: space-between;">' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⟡ Education Bonus:</div>' +
            '<div style="font-size: 0.6rem;">+' + Math.round(educationBonus * 100) + '% income</div></div>' +
            (highestRank ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">♡ Highest Rank:</div>' +
                '<div style="font-size: 0.6rem; font-weight: bold;">' + _escapeHtml(highestRank.name) + '</div></div>' : '') +
            '</div>';
    }

    function _renderEducation(educationStats) {
        if (!educationStats) {
            return '<div style="color: var(--dim); text-align: center; padding: 20px;">⟡ Education data unavailable</div>';
        }

        var enrollmentRate = Math.round(educationStats.enrollmentRate || 0);
        var literacyRate = Math.round(educationStats.literacyRate || 0);

        var enrollmentColor = '#4caf50';
        if (enrollmentRate < 30) enrollmentColor = '#f44336';
        else if (enrollmentRate < 60) enrollmentColor = '#ff9800';

        var literacyColor = '#4caf50';
        if (literacyRate < 30) literacyColor = '#f44336';
        else if (literacyRate < 60) literacyColor = '#ff9800';

        return '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">' +
            '<div style="text-align: center;">' +
            '<div style="font-size: 1.2rem; font-weight: bold;">' + (educationStats.totalChildren || 0) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⟡ School-age Children</div>' +
            '<div style="background: var(--bg3); border-radius: 4px; height: 4px; margin: 6px 0; overflow: hidden;">' +
            '<div style="width: ' + enrollmentRate + '%; height: 100%; background: ' + enrollmentColor + '; border-radius: 4px;"></div></div>' +
            '<div style="font-size: 0.55rem;">⟡ Enrolled: ' + (educationStats.enrolledCount || 0) + ' (' + enrollmentRate + '%)</div></div>' +
            '<div style="text-align: center;">' +
            '<div style="font-size: 1.2rem; font-weight: bold;">' + (educationStats.literateCount || 0) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⟡ Literate Children</div>' +
            '<div style="background: var(--bg3); border-radius: 4px; height: 4px; margin: 6px 0; overflow: hidden;">' +
            '<div style="width: ' + literacyRate + '%; height: 100%; background: ' + literacyColor + '; border-radius: 4px;"></div></div>' +
            '<div style="font-size: 0.55rem;">⟡ Literacy: ' + literacyRate + '%</div></div></div>' +
            (educationStats.educationLevels ? '<div style="margin: 12px 0;"></div>' +
                '<div><div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">⟡ Education Levels</div>' +
                '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; font-size: 0.55rem;">' +
                '<div>Illiterate: ' + (educationStats.educationLevels.illiterate || 0) + '</div>' +
                '<div>Basic: ' + (educationStats.educationLevels.basic || 0) + '</div>' +
                '<div>Literate: ' + (educationStats.educationLevels.literate || 0) + '</div>' +
                '<div>Educated: ' + (educationStats.educationLevels.educated || 0) + '</div>' +
                '<div>Scholar: ' + (educationStats.educationLevels.scholar || 0) + '</div></div></div>' : '');
    }

    function _renderReputation(reputation, vendettas, activeVendettas) {
        var repColor = reputation >= 70 ? '#4caf50' : reputation >= 40 ? '#ff9800' : '#f44336';
        var repIcon = reputation >= 70 ? '♡' : reputation >= 40 ? '⟡' : '✗';

        var vendettaHtml = '';
        if (activeVendettas > 0) {
            var activeList = vendettas.filter(function(v) { return !v.resolved; }).slice(0, 3);
            vendettaHtml = activeList.map(function(v) {
                return '<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<span>⚔</span>' +
                    '<span style="flex: 1; margin-left: 8px; font-size: 0.6rem;">vs ' + _escapeHtml(v.targetName || 'Unknown') + '</span>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">⟡ since ' + v.declaredYear + '</span></div>';
            }).join('');
            if (vendettas.filter(function(v) { return !v.resolved; }).length > 3) {
                vendettaHtml += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 4px;">⟡ +' + (vendettas.filter(function(v) { return !v.resolved; }).length - 3) + ' more</div>';
            }
        } else {
            vendettaHtml = '<div style="color: var(--dim); text-align: center; padding: 12px;">⟡ No active vendettas</div>';
        }

        return '<div style="text-align: center;">' +
            '<div style="display: inline-block;">' +
            '<div style="font-size: 2rem; font-weight: bold; color: ' + repColor + ';">' + reputation + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">/100</div>' +
            '<div style="font-size: 1.2rem;">' + repIcon + '</div></div>' +
            '<div style="margin-top: 16px;">' +
            '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">⚔ Active Vendettas (' + activeVendettas + ')</div>' +
            vendettaHtml +
            '</div></div>';
    }

    function _renderSuccession(succession, lineage) {
        if ((!succession || succession.length === 0) && (!lineage || lineage.length === 0)) {
            return '<div style="color: var(--dim); text-align: center; padding: 20px;">⟡ No succession data available</div>';
        }

        var successionHtml = '';
        if (succession && succession.length > 0) {
            for (var i = 0; i < Math.min(5, succession.length); i++) {
                var heir = succession[i];
                var heirChar = heir.character;
                successionHtml += '<div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-light); ' + (i === 0 ? 'background: var(--accent-dim); border-radius: 6px; margin-bottom: 4px;' : '') + '">' +
                    '<div style="width: 30px; font-size: 0.7rem; ' + (i === 0 ? 'color: var(--accent); font-weight: bold;' : '') + '">#' + (i + 1) + '</div>' +
                    '<div style="flex: 1;">' +
                    '<div style="font-size: 0.7rem; font-weight: ' + (i === 0 ? 'bold' : 'normal') + ';">' + _escapeHtml(heirChar ? heirChar.name : 'Unknown') + ' ' + _escapeHtml(heirChar ? heirChar.surname || '' : '') + '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">⟡ ' + (heir.relationship || 'Family') + ' • Age ' + (heir.age || '?') +
                    (heir.isQualified ? ' <span style="color: #4caf50; margin-left: 6px;">✓ Qualified</span>' : '') +
                    '</div></div></div>';
            }
            if (succession.length > 5) {
                successionHtml += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 8px;">⟡ +' + (succession.length - 5) + ' more in line</div>';
            }
        }

        var lineageHtml = '';
        if (lineage && lineage.length > 0 && lineage.length > 1) {
            var previousHeads = lineage.slice(0, 3);
            lineageHtml = '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">⟡ Previous Heads</div>' +
                previousHeads.map(function(entry) {
                    return '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.55rem;">' +
                        '<span>' + (entry.head ? _escapeHtml(entry.head.name) : 'Unknown') + '</span>' +
                        '<span style="color: var(--dim);">' + entry.startYear + ' - ' + (entry.endYear || 'Present') + '</span></div>';
                }).join('') +
                '</div>';
        }

        return '<div>' + successionHtml + lineageHtml + '</div>';
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdAnalyticsTab(householdId) {
        if (_rendering) return '';
        _rendering = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                return '<div class="empty-state">⌂ Household not found</div>';
            }

            var currentYear = _getCurrentYear();
            var viewYear = analyticsState.viewYear || currentYear;
            var isHistorical = viewYear !== currentYear;

            // Get household snapshot at view year
            var snapshot = null;
            var nameAtTime = household.name;
            var periodYear = null;
            var periodEnd = null;
            var periodIndex = -1;
            var isCurrentPeriod = true;
            var totalPeriods = 0;

            if (typeof window.getHouseholdSnapshot === 'function') {
                snapshot = window.getHouseholdSnapshot(householdId, viewYear);
                if (snapshot) {
                    nameAtTime = snapshot.nameAtTime || household.name;
                    periodYear = snapshot.periodYear;
                    periodEnd = snapshot.periodEnd;
                    periodIndex = snapshot.periodIndex;
                    isCurrentPeriod = snapshot.isCurrentPeriod !== false;
                }
            }

            var periods = _getHouseholdNamePeriods(householdId);
            totalPeriods = periods.length || 0;

            // Get data
            var members = _getHouseholdMembers(householdId);
            var familyMembers = _getFamilyMembers(householdId);
            var staffMembers = _getStaffMembers(householdId);
            var departments = _getDepartments(householdId);
            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var economicTier = _getHouseholdEconomicTier(householdId);
            var resources = _getHouseholdResources(householdId);
            var reputation = _getHouseholdReputation(householdId);
            var vendettas = _getHouseholdVendettas(householdId);
            var powerScore = _getHouseholdPowerScore(householdId);
            var educationStats = _getHouseholdEducationStats(householdId);
            var succession = _getHouseholdSuccession(householdId);
            var memberBreakdown = _getHouseholdMemberBreakdown(householdId);
            var estimatedWealth = _estimateHouseholdWealth(householdId);
            var highestRank = _getHouseholdHighestRank(householdId);
            var loyaltyModifier = _getHouseholdLoyaltyModifier(householdId);
            var crimeRiskModifier = _getCrimeRiskModifier(householdId);
            var educationBonus = _getEducationIncomeBonus(householdId);
            var healthScore = _getHouseholdHealthScore(householdId);
            var lineage = _getHouseholdLineage(householdId);
            var commonRoles = _getMostCommonStaffRoles(5);
            var activeVendettas = vendettas.filter(function(v) { return !v.resolved; }).length;

            var wealthTrend = wealth > 100 ? '♡ Rising' : wealth > 50 ? '⟡ Stable' : '✗ Declining';
            var wealthTrendColor = wealth > 100 ? '#4caf50' : wealth > 50 ? '#ff9800' : '#f44336';

            // Build name period indicator for header
            var periodIndicator = '';
            if (isHistorical) {
                var periodLabel = 'Viewing: ' + viewYear;
                if (nameAtTime !== household.name) {
                    periodLabel += ' (as "' + nameAtTime + '")';
                } else if (periodIndex > 0) {
                    periodLabel += ' (name period since ' + periodYear + ')';
                }
                periodIndicator = '<div style="font-size:0.65rem;color:var(--accent-dim);margin-top:4px;">' + periodLabel + '</div>';
            } else if (periodIndex > 0) {
                periodIndicator = '<div style="font-size:0.55rem;color:var(--accent-dim);margin-top:4px;">Current name period (since ' + periodYear + ')</div>';
            } else if (totalPeriods > 0) {
                periodIndicator = '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Original name (unchanged)</div>';
            }

            // =========================================================================
            // BUILD HTML
            // =========================================================================
            var html = '';

            // Header with name and period info
            html += '<div class="analytics-container" style="padding: 16px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">';
            html += '<div>';
            html += '<h2 style="margin:0;font-size:1.1rem;color:var(--accent);">' + _escapeHtml(nameAtTime) + '</h2>';
            html += periodIndicator;
            html += '<div style="font-size:0.6rem;color:var(--dim);margin-top:2px;">';
            html += 'Founded: ' + (household.foundedYear || 'Unknown');
            if (totalPeriods > 1) {
                html += ' · ' + totalPeriods + ' name periods';
            }
            if (isHistorical) {
                html += ' · <span style="color:var(--warn);">Historical View</span>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';

            // Year selector
            html += '<label style="font-size:0.6rem;color:var(--dim);display:flex;align-items:center;gap:4px;">';
            html += 'View Year:';
            html += '<input type="number" id="analyticsViewYear" value="' + viewYear + '" min="' + (household.foundedYear || 1000) + '" max="' + (currentYear + 5) + '" style="width:80px;padding:4px 6px;font-size:0.6rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;">';
            html += '</label>';
            html += '<button id="analyticsApplyYear" class="btn small" style="padding:2px 8px;font-size:0.55rem;">Apply</button>';
            if (isHistorical) {
                html += '<button id="analyticsResetYear" class="btn small" style="padding:2px 8px;font-size:0.55rem;">Reset to Current</button>';
            }
            html += '</div></div>';

            // Health Score
            if (healthScore) {
                html += '<div style="background: ' + (healthScore.score >= 70 ? 'rgba(76, 175, 80, 0.15)' : healthScore.score >= 40 ? 'rgba(255, 152, 0, 0.15)' : 'rgba(244, 67, 54, 0.15)') + '; border-radius: 8px; padding: 12px; margin-bottom: 20px; border-left: 3px solid ' + (healthScore.score >= 70 ? '#4caf50' : healthScore.score >= 40 ? '#ff9800' : '#f44336') + ';">';
                html += '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">';
                html += '<div>';
                html += '<span style="font-size: 0.7rem; color: var(--dim);">Overall Household Health</span>';
                html += '<div style="font-size: 1.1rem; font-weight: bold;">' + healthScore.score + '/100</div>';
                html += '</div>';
                html += '<div style="font-size: 0.8rem; font-weight: bold; color: ' + (healthScore.score >= 70 ? '#4caf50' : healthScore.score >= 40 ? '#ff9800' : '#f44336') + '">';
                html += healthScore.rating || (healthScore.score >= 80 ? '♡ Excellent' : healthScore.score >= 60 ? '✓ Good' : healthScore.score >= 40 ? '⟡ Average' : healthScore.score >= 20 ? '⚠ Poor' : '✗ Critical');
                html += '</div></div>';
                html += '<div style="background: var(--bg3); border-radius: 4px; height: 6px; margin-top: 8px; overflow: hidden;">';
                html += '<div style="width: ' + healthScore.score + '%; height: 100%; background: ' + (healthScore.score >= 70 ? '#4caf50' : healthScore.score >= 40 ? '#ff9800' : '#f44336') + '; border-radius: 4px;"></div>';
                html += '</div></div>';
            }

            // Header Stats
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px;">';
            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">';
            html += '<div style="font-size: 1.2rem;">⟡</div>';
            html += '<div style="font-size: 1.2rem; font-weight: bold;">' + _formatNumber(wealth) + '</div>';
            html += '<div style="font-size: 0.65rem; color: var(--dim);">Wealth (Gold)</div>';
            if (debt > 0) html += '<div style="font-size: 0.55rem; color: var(--warn);">Debt: ' + _formatNumber(debt) + '</div>';
            html += '<div style="font-size: 0.55rem; color: ' + wealthTrendColor + ';">' + wealthTrend + '</div></div>';

            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">';
            html += '<div style="font-size: 1.2rem;">♡</div>';
            html += '<div style="font-size: 1.2rem; font-weight: bold;">' + powerScore + '</div>';
            html += '<div style="font-size: 0.65rem; color: var(--dim);">Power Score</div>';
            html += '<div style="font-size: 0.55rem;">⟡ ' + estimatedWealth + '/100 est</div></div>';

            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">♡</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + reputation + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Reputation</div>' +
                '<div style="background: var(--bg3); border-radius: 4px; height: 4px; margin-top: 6px; overflow: hidden;">' +
                '<div style="width: ' + reputation + '%; height: 100%; background: ' + (reputation >= 70 ? '#4caf50' : reputation >= 40 ? '#ff9800' : '#f44336') + '; border-radius: 4px;"></div></div></div>';

            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">' + (economicTier ? economicTier.icon : '⟡') + '</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + (economicTier ? economicTier.name : 'Unknown') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Economic Tier</div></div></div>';

            // Two column layout
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';

            // Left column
            html += '<div style="display: flex; flex-direction: column; gap: 20px;">';

            // Member Statistics
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Member Statistics</h3>' +
                (isHistorical ? '<span style="font-size:0.5rem;color:var(--warn);margin-left:auto;">As of ' + viewYear + '</span>' : '') +
                '</div>' +
                _renderMemberStats(familyMembers, staffMembers, memberBreakdown, commonRoles) +
                '</div>';

            // Department Analytics
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⌂</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Department Analytics</h3></div>' +
                _renderDepartments(household, departments) +
                '</div>';

            // Resources
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Resources</h3></div>' +
                _renderResources(resources) +
                '</div>';

            html += '</div>'; // End left column

            // Right column
            html += '<div style="display: flex; flex-direction: column; gap: 20px;">';

            // Wealth & Standing
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">♡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Wealth & Standing</h3></div>' +
                _renderWealthStanding(wealth, estimatedWealth, highestRank, loyaltyModifier, crimeRiskModifier, educationBonus) +
                '</div>';

            // Education
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Education</h3></div>' +
                _renderEducation(educationStats) +
                '</div>';

            // Reputation & Vendettas
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⚔</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Reputation & Conflicts</h3></div>' +
                _renderReputation(reputation, vendettas, activeVendettas) +
                '</div>';

            // Succession
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Succession Line</h3></div>' +
                _renderSuccession(succession, lineage) +
                '</div>';

            html += '</div>'; // End right column
            html += '</div>'; // End two column layout

            // Historical note
            if (isHistorical) {
                html += '<div style="margin-top:20px;padding:12px;background:var(--bg3);border-radius:8px;border-left:3px solid var(--warn);font-size:0.55rem;color:var(--dim);">';
                html += '⚠ This is a historical view of the household as it existed in the year ' + viewYear + '. ';
                html += 'Some data may differ from the current state. ';
                html += 'Click "Reset to Current" to return to the present.';
                html += '</div>';
            }

            html += '</div>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. EVENT HANDLERS
    // =========================================================================

    function _attachAnalyticsHandlers(householdId) {
        var applyBtn = document.getElementById('analyticsApplyYear');
        var resetBtn = document.getElementById('analyticsResetYear');
        var yearInput = document.getElementById('analyticsViewYear');

        if (applyBtn && yearInput) {
            applyBtn.onclick = function() {
                var year = parseInt(yearInput.value);
                var currentYear = _getCurrentYear();
                var household = _getHousehold(householdId);

                if (isNaN(year) || year < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return;
                }

                if (household && household.foundedYear && year < household.foundedYear) {
                    _showToast('Year cannot be before household was founded (' + household.foundedYear + ')', 'error');
                    return;
                }

                if (year > currentYear + 5) {
                    _showToast('Year cannot be more than 5 years in the future', 'error');
                    return;
                }

                analyticsState.viewYear = year;
                _refreshAnalytics(householdId);
            };

            yearInput.onkeypress = function(e) {
                if (e.key === 'Enter') {
                    applyBtn.click();
                }
            };
        }

        if (resetBtn) {
            resetBtn.onclick = function() {
                analyticsState.viewYear = null;
                if (yearInput) yearInput.value = _getCurrentYear();
                _refreshAnalytics(householdId);
            };
        }
    }

    function _refreshAnalytics(householdId) {
        var container = document.getElementById('panelContent');
        if (!container) return;

        var html = renderHouseholdAnalyticsTab(householdId);
        container.innerHTML = html;
        _attachAnalyticsHandlers(householdId);
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderHouseholdAnalyticsTab = renderHouseholdAnalyticsTab;
    window.analyticsState = analyticsState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { renderHouseholdAnalyticsTab, analyticsState };
    }

})();