/**
 * =============================================================================
 * HOUSEHOLD ANALYTICS TAB
 * =============================================================================
 * 
 * UPDATED: Full integration with HouseholdState, HouseholdCommands,
 *          HouseholdQueries, HouseholdEconomy, HouseholdAssignment,
 *          and HouseholdServant
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
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') return window._showToast(msg, type);
        if (typeof window.showToast === 'function') return window.showToast(msg, type);
        console.log('[' + (type || 'info') + '] ' + msg);
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _formatNumber(num) {
        if (typeof window.formatNumber === 'function') return window.formatNumber(num);
        if (num === undefined || num === null) return '0';
        return num.toLocaleString();
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        return null;
    }

    // =========================================================================
    // 2. STATE, COMMANDS, QUERIES, ECONOMY, ASSIGNMENT, SERVANT
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _economy = window.HouseholdEconomy;
    var _assignment = window.HouseholdAssignment;
    var _servant = window.HouseholdServant;

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
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(characterId);
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') return window.getCharacters();
        return [];
    }

    function _getHouseholdMembers(householdId) {
        return _state ? _state.getHouseholdMembersWithCharacters(householdId) : [];
    }

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getHouseholdHead(householdId) {
        return _state ? _state.getHouseholdHead(householdId) : null;
    }

    function _getHouseholdWealth(householdId) {
        return _economy ? _economy.getHouseholdWealth(householdId) : 0;
    }

    function _getHouseholdDebt(householdId) {
        return _economy ? _economy.getHouseholdDebt(householdId) : 0;
    }

    function _getHouseholdResources(householdId) {
        return _economy ? _economy.getHouseholdResources(householdId) : { food: 0, goods: 0, livestock: 0 };
    }

    function _getHouseholdEconomicTier(householdId) {
        if (_economy) {
            var wealth = _economy.getHouseholdWealth(householdId);
            return _economy.getEconomicTier(wealth);
        }
        return { id: 'moderate', name: 'Moderate', icon: '⌂' };
    }

    function _getHouseholdReputation(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.reputation || 50) : 50;
    }

    function _getHouseholdPowerScore(householdId) {
        if (typeof window.updateHouseholdPowerScore === 'function') {
            return window.updateHouseholdPowerScore(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.powerScore || 0) : 0;
    }

    function _getHouseholdVendettas(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.vendettas || []) : [];
    }

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
        return null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getHouseholdHeirs(householdId, deceasedId, options) {
        return _assignment ? _assignment.getHouseholdHeirs(householdId, deceasedId, options) : [];
    }

    function _getHouseholdLineage(householdId) {
        return _queries ? _queries.getLineage(householdId) : [];
    }

    function _getHouseholdSuccession(householdId) {
        return _queries ? _queries.getSuccession(householdId) : [];
    }

    function _getHouseholdEducationStats(householdId) {
        if (typeof window.getHouseholdEducationStats === 'function') {
            return window.getHouseholdEducationStats(householdId);
        }
        return null;
    }

    function _getHouseholdHealthScore(householdId) {
        if (typeof window.getHouseholdHealthScore === 'function') {
            return window.getHouseholdHealthScore(householdId);
        }
        return null;
    }

    function _getHouseholdSnapshot(householdId, year) {
        if (typeof window.getHouseholdSnapshot === 'function') {
            return window.getHouseholdSnapshot(householdId, year);
        }
        return null;
    }

    function _getHouseholdNamePeriods(householdId) {
        return _state ? _state.getHouseholdNamePeriods(householdId) : [];
    }

    function _getHouseholdNamePeriodForYear(householdId, year) {
        return _state ? _state.getHouseholdNamePeriodForYear(householdId, year) : null;
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

    function _renderMemberStats(members, familyMembers, staffMembers) {
        var html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">';

        // Family Members
        html += '<div>';
        html += '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">⟡ Family (' + familyMembers.length + ')</div>';
        html += '<div style="max-height: 200px; overflow-y: auto;">';
        if (familyMembers.length > 0) {
            var displayFamily = familyMembers.slice(0, 5);
            for (var i = 0; i < displayFamily.length; i++) {
                var m = displayFamily[i];
                var char = m.character;
                if (!char) continue;
                var age = _calculateAge(char.birthYear, false, null);
                var rank = _getActiveRankDisplay(char);
                html += '<div style="display: flex; justify-content: space-between; padding: 4px 0;">' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                    '<span style="font-size: 0.6rem; color: var(--dim);">' + age + ' yrs</span>' +
                    (rank ? '<span style="font-size: 0.55rem; color: var(--accent);">⟡ ' + _escapeHtml(rank) + '</span>' : '') +
                    '</div>';
            }
            if (familyMembers.length > 5) {
                html += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 4px;">⟡ +' + (familyMembers.length - 5) + ' more</div>';
            }
        } else {
            html += '<div style="color: var(--dim); text-align: center; padding: 12px;">⟡ No family members</div>';
        }
        html += '</div></div>';

        // Staff Members
        html += '<div>';
        html += '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">⟡ Staff (' + staffMembers.length + ')</div>';
        html += '<div style="max-height: 200px; overflow-y: auto;">';
        if (staffMembers.length > 0) {
            var displayStaff = staffMembers.slice(0, 5);
            for (var i = 0; i < displayStaff.length; i++) {
                var m = displayStaff[i];
                var char = m.character;
                if (!char) continue;
                html += '<div style="display: flex; justify-content: space-between; padding: 4px 0;">' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">⟡ ' + _escapeHtml(m.role || 'Staff') + '</span>' +
                    '</div>';
            }
            if (staffMembers.length > 5) {
                html += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 4px;">⟡ +' + (staffMembers.length - 5) + ' more</div>';
            }
        } else {
            html += '<div style="color: var(--dim); text-align: center; padding: 12px;">⟡ No staff members</div>';
        }
        html += '</div></div>';

        html += '</div>';

        // Member breakdown
        if (familyMembers.length + staffMembers.length > 0) {
            var total = familyMembers.length + staffMembers.length;
            var familyPct = Math.round((familyMembers.length / total) * 100);
            var staffPct = Math.round((staffMembers.length / total) * 100);
            html += '<div style="margin-top: 12px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--dim);">' +
                '<span>⟡ Family / Staff Ratio:</span>' +
                '<span>' + familyPct + '% / ' + staffPct + '%</span></div>' +
                '<div style="background: var(--bg3); border-radius: 4px; height: 6px; margin-top: 4px; overflow: hidden;">' +
                '<div style="width: ' + familyPct + '%; height: 100%; background: var(--accent);"></div>' +
                '<div style="width: ' + staffPct + '%; height: 100%; background: var(--accent-dim); margin-left: ' + familyPct + '%;"></div></div></div>';
        }

        return html;
    }

    function _renderDepartments(departments, household) {
        if (!departments || departments.length === 0) {
            return '<div style="color: var(--dim); text-align: center; padding: 20px;">⌂ No departments established</div>';
        }

        var html = '';
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

            html += '<div style="background: var(--bg3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
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

        return '<div>' + html + '</div>';
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

    function _renderWealthStanding(wealth, powerScore, highestRank, tier) {
        var wealthLevel = wealth >= 500 ? 'Royal' : wealth >= 200 ? 'Noble' : wealth >= 100 ? 'Wealthy' : wealth >= 50 ? 'Prosperous' : wealth >= 20 ? 'Moderate' : 'Poor';
        var wealthIcon = wealth >= 500 ? '♡' : wealth >= 200 ? '♡' : wealth >= 100 ? '⟡' : wealth >= 50 ? '⟡' : '✗';
        var wealthColor = wealth >= 500 ? 'gold' : wealth >= 200 ? 'var(--accent)' : wealth >= 100 ? '#4caf50' : wealth >= 50 ? '#2196f3' : '#ff9800';

        return '<div style="text-align: center;">' +
            '<div style="margin-bottom: 12px;">' +
            '<span style="font-size: 1.5rem;">' + wealthIcon + '</span>' +
            '<div style="font-weight: bold; color: ' + wealthColor + ';">' + wealthLevel + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim);">Tier: ' + _escapeHtml(tier.name) + '</div></div>' +
            '<div style="display: flex; justify-content: space-between; margin-top: 12px;">' +
            '<div style="font-size: 0.6rem; color: var(--dim);">⟡ Power Score:</div>' +
            '<div style="font-size: 0.6rem;">' + powerScore + '/100</div></div>' +
            '<div style="background: var(--bg3); border-radius: 4px; height: 6px; margin: 8px 0; overflow: hidden;">' +
            '<div style="width: ' + Math.min(100, powerScore) + '%; height: 100%; background: ' + (powerScore >= 70 ? '#4caf50' : powerScore >= 40 ? '#ff9800' : '#f44336') + '; border-radius: 4px;"></div></div>' +
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

        var enrollmentColor = enrollmentRate < 30 ? '#f44336' : enrollmentRate < 60 ? '#ff9800' : '#4caf50';
        var literacyColor = literacyRate < 30 ? '#f44336' : literacyRate < 60 ? '#ff9800' : '#4caf50';

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

    function _renderSuccession(householdId, head) {
        if (!head) {
            return '<div style="color: var(--dim); text-align: center; padding: 20px;">No head of household - succession not applicable</div>';
        }

        var heirs = _getHouseholdHeirs(householdId, head.id, {
            includeExternal: true,
            maxAge: 60,
            minAge: 16
        });

        if (heirs.length === 0) {
            return '<div style="color: var(--warn); text-align: center; padding: 20px;">No eligible heirs found</div>';
        }

        var html = '';
        for (var i = 0; i < Math.min(5, heirs.length); i++) {
            var h = heirs[i];
            html += '<div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-light); ' + (i === 0 ? 'background: var(--accent-dim); border-radius: 6px; margin-bottom: 4px;' : '') + '">' +
                '<div style="width: 30px; font-size: 0.7rem; ' + (i === 0 ? 'color: var(--accent); font-weight: bold;' : '') + '">#' + (i + 1) + '</div>' +
                '<div style="flex: 1;">' +
                '<div style="font-size: 0.7rem; font-weight: ' + (i === 0 ? 'bold' : 'normal') + ';">' + _escapeHtml(h.name) + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">⟡ ' + (h.relation || 'Member') + ' • Age ' + (h.age || '?') +
                (h.isQualified ? ' <span style="color: #4caf50; margin-left: 6px;">✓ Qualified</span>' : '') +
                '</div></div></div>';
        }
        if (heirs.length > 5) {
            html += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding: 8px;">⟡ +' + (heirs.length - 5) + ' more in line</div>';
        }

        return html;
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
            var familyMembers = members.filter(function(m) { return m.type === 'family'; });
            var staffMembers = members.filter(function(m) { return m.type === 'staff'; });
            var departments = _getDepartments(householdId);
            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getHouseholdEconomicTier(householdId);
            var resources = _getHouseholdResources(householdId);
            var reputation = _getHouseholdReputation(householdId);
            var powerScore = _getHouseholdPowerScore(householdId);
            var head = _getHouseholdHead(householdId);
            var highestRank = head ? _getActiveRankDisplay(head) : null;
            var educationStats = _getHouseholdEducationStats(householdId);
            var healthScore = _getHouseholdHealthScore(householdId);
            var vendettas = _getHouseholdVendettas(householdId);

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
            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">⟡</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + _formatNumber(wealth) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Wealth (Gold)</div>' +
                (debt > 0 ? '<div style="font-size: 0.55rem; color: var(--warn);">Debt: ' + _formatNumber(debt) + '</div>' : '') +
                '</div>';
            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">♡</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + powerScore + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Power Score</div></div>';
            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">♡</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + reputation + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Reputation</div>' +
                '<div style="background: var(--bg3); border-radius: 4px; height: 4px; margin-top: 6px; overflow: hidden;">' +
                '<div style="width: ' + reputation + '%; height: 100%; background: ' + (reputation >= 70 ? '#4caf50' : reputation >= 40 ? '#ff9800' : '#f44336') + '; border-radius: 4px;"></div></div></div>';
            html += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem;">' + (tier ? tier.icon : '⟡') + '</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + (tier ? tier.name : 'Unknown') + '</div>' +
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
                _renderMemberStats(members, familyMembers, staffMembers) +
                '</div>';

            // Department Analytics
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⌂</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Department Analytics</h3></div>' +
                _renderDepartments(departments, household) +
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
                _renderWealthStanding(wealth, powerScore, highestRank, tier) +
                '</div>';

            // Education
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Education</h3></div>' +
                _renderEducation(educationStats) +
                '</div>';

            // Succession
            html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                '<span style="font-size: 1rem;">⟡</span>' +
                '<h3 style="margin: 0; font-size: 0.85rem;">Succession Line</h3></div>' +
                _renderSuccession(householdId, head) +
                '</div>';

            // Vendettas
            if (vendettas && vendettas.length > 0) {
                var activeVendettas = vendettas.filter(function(v) { return !v.resolved; });
                html += '<div style="background: var(--bg2); border-radius: 8px; padding: 16px;">' +
                    '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">' +
                    '<span style="font-size: 1rem;">⚔</span>' +
                    '<h3 style="margin: 0; font-size: 0.85rem;">Conflicts (' + activeVendettas.length + ' active)</h3></div>';
                var displayVendettas = activeVendettas.slice(0, 5);
                for (var i = 0; i < displayVendettas.length; i++) {
                    var v = displayVendettas[i];
                    html += '<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
                        '<span style="font-size: 0.6rem;">vs ' + _escapeHtml(v.targetName || 'Unknown') + '</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim);">since ' + v.declaredYear + '</span></div>';
                }
                if (activeVendettas.length > 5) {
                    html += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (activeVendettas.length - 5) + ' more</div>';
                }
                html += '</div>';
            }

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

})();