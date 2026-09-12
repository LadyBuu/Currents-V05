// js/economy/economy-details-tab.js
/**
 * =============================================================================
 * ECONOMY DETAILS TAB (js/tabs/govermnment-economy-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Provides a modular tab for viewing and editing economy details
 *          aggregated across an entire settlement hierarchy.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getPlaces, getCharacters)
 *   - settlement-state.js (SettlementState)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#039;';
            return m;
        });
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') return window.getIcon(name);
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getSettlementState() {
        return typeof window.SettlementState !== 'undefined' ? window.SettlementState : null;
    }

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        var state = _getSettlementState();
        if (state && typeof state.getSettlementData === 'function') {
            return state.getSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        var state = _getSettlementState();
        if (state && typeof state._updateSettlementData === 'function') {
            return state._updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _calculateAge(birthYear, deathYear, currentYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, false, deathYear, currentYear);
        }
        if (!birthYear) return null;
        var year = currentYear || _getCurrentYear();
        if (deathYear && deathYear < year) year = deathYear;
        return Math.max(0, year - birthYear);
    }

    function _getChildPlaces(placeId) {
        var allPlaces = _getPlaces();
        var children = [];
        for (var i = 0; i < allPlaces.length; i++) {
            if (allPlaces[i].parentId === placeId || allPlaces[i].parentPlaceId === placeId) {
                children.push(allPlaces[i]);
            }
        }
        return children;
    }

    function _getAllDescendantPlaceIds(placeId) {
        var result = [placeId];
        var children = _getChildPlaces(placeId);
        for (var i = 0; i < children.length; i++) {
            var descendantIds = _getAllDescendantPlaceIds(children[i].id);
            result = result.concat(descendantIds);
        }
        return result;
    }

    // =========================================================================
    // 2. AGGREGATED POPULATION CALCULATIONS
    // =========================================================================

    function _getSettlementPopulationForHierarchy(locationId) {
        var placeIds = _getAllDescendantPlaceIds(locationId);
        var characters = _getCharacters();
        
        var stats = {
            total: 0,
            living: 0,
            deceased: 0,
            adults: 0,
            children: 0,
            elderly: 0,
            literate: 0,
            totalWealth: 0,
            wealthCount: 0,
            byLocation: {}
        };

        // Initialize stats for each location
        for (var i = 0; i < placeIds.length; i++) {
            stats.byLocation[placeIds[i]] = {
                total: 0,
                living: 0,
                deceased: 0,
                adults: 0,
                children: 0,
                elderly: 0,
                literate: 0,
                totalWealth: 0,
                wealthCount: 0
            };
        }

        for (var c = 0; c < characters.length; c++) {
            var char = characters[c];
            var charLocation = char.currentLocationId || char.locationId;
            
            // Check if character belongs anywhere in this hierarchy
            var belongs = false;
            for (var p = 0; p < placeIds.length; p++) {
                if (charLocation === placeIds[p]) {
                    belongs = true;
                    break;
                }
            }
            if (!belongs) continue;

            var locStats = stats.byLocation[charLocation] || stats.byLocation[locationId];
            if (!locStats) {
                // Fallback to root location
                locStats = stats.byLocation[locationId];
                if (!locStats) continue;
            }

            stats.total++;
            locStats.total++;

            if (!char.isDeceased) {
                stats.living++;
                locStats.living++;
                
                var age = _calculateAge(char.birthYear, char.deathYear);
                if (age !== null) {
                    if (age < 18) {
                        stats.children++;
                        locStats.children++;
                    } else if (age >= 60) {
                        stats.elderly++;
                        locStats.elderly++;
                    } else {
                        stats.adults++;
                        locStats.adults++;
                    }
                }
                
                if (char.isLiterate) {
                    stats.literate++;
                    locStats.literate++;
                }
                
                if (char.wealth !== undefined && char.wealth !== null) {
                    stats.totalWealth += char.wealth;
                    stats.wealthCount++;
                    locStats.totalWealth += char.wealth;
                    locStats.wealthCount++;
                }
            } else {
                stats.deceased++;
                locStats.deceased++;
            }
        }

        // Calculate rates
        stats.literacyRate = stats.living > 0 ? Math.round((stats.literate / stats.living) * 100) : 0;
        stats.averageWealth = stats.wealthCount > 0 ? Math.round(stats.totalWealth / stats.wealthCount) : 0;

        // Calculate rates for each location
        for (var locId in stats.byLocation) {
            var loc = stats.byLocation[locId];
            loc.literacyRate = loc.living > 0 ? Math.round((loc.literate / loc.living) * 100) : 0;
            loc.averageWealth = loc.wealthCount > 0 ? Math.round(loc.totalWealth / loc.wealthCount) : 0;
        }

        return stats;
    }

    // =========================================================================
    // 3. AGGREGATED SETTLEMENT DATA
    // =========================================================================

    function _getAggregatedSettlementData(locationId) {
        var placeIds = _getAllDescendantPlaceIds(locationId);
        
        var aggregated = {
            prosperity: 0,
            crimeRate: 0,
            justiceSeverity: 'medium',
            hasWatch: false,
            watchSize: 0,
            governmentSalaryBudget: 0,
            salaryBudgetAllocated: 0,
            locationCount: 0,
            locationsWithData: 0
        };

        var prosperitySum = 0;
        var crimeSum = 0;
        var prosperityCount = 0;
        var crimeCount = 0;
        var justiceCounts = { lenient: 0, medium: 0, harsh: 0, extreme: 0 };
        var justiceCount = 0;

        for (var i = 0; i < placeIds.length; i++) {
            var data = _getSettlementData(placeIds[i]);
            if (!data) continue;
            
            aggregated.locationCount++;
            aggregated.locationsWithData++;

            // Prosperity (weighted average)
            if (data.prosperity !== undefined && data.prosperity !== null) {
                prosperitySum += data.prosperity;
                prosperityCount++;
            }

            // Crime rate (average)
            if (data.crimeRate !== undefined && data.crimeRate !== null) {
                crimeSum += data.crimeRate;
                crimeCount++;
            }

            // Justice severity (mode)
            if (data.justiceSeverity) {
                justiceCounts[data.justiceSeverity] = (justiceCounts[data.justiceSeverity] || 0) + 1;
                justiceCount++;
            }

            // Watch (OR - if any location has watch, the settlement has watch)
            if (data.hasWatch) {
                aggregated.hasWatch = true;
                aggregated.watchSize += (data.watchSize || 0);
            }

            // Salary budget (sum)
            if (data.governmentSalaryBudget) {
                aggregated.governmentSalaryBudget += data.governmentSalaryBudget;
            }
            if (data.salaryBudgetAllocated) {
                aggregated.salaryBudgetAllocated += data.salaryBudgetAllocated;
            }
        }

        // Calculate averages
        aggregated.prosperity = prosperityCount > 0 ? Math.round(prosperitySum / prosperityCount) : 0;
        aggregated.crimeRate = crimeCount > 0 ? Math.round((crimeSum / crimeCount) * 100) / 100 : 0;

        // Find mode for justice severity
        var maxJusticeCount = 0;
        var modeJustice = 'medium';
        for (var j in justiceCounts) {
            if (justiceCounts[j] > maxJusticeCount) {
                maxJusticeCount = justiceCounts[j];
                modeJustice = j;
            }
        }
        aggregated.justiceSeverity = justiceCount > 0 ? modeJustice : 'medium';

        return aggregated;
    }

    // =========================================================================
    // 4. RENDER FUNCTIONS
    // =========================================================================

    function _renderEconomyDetails(place) {
        if (!place) {
            return '<div class="eco-details-empty">Select a location to view economy details.</div>';
        }

        var population = _getSettlementPopulationForHierarchy(place.id);
        var settlementData = _getAggregatedSettlementData(place.id);
        var currentYear = _getCurrentYear();
        var childPlaces = _getChildPlaces(place.id);

        var html = '<div class="eco-details-container">';
        
        // Header
        html += '<div class="eco-details-header">';
        html += '<h3>' + _escapeHtml(place.displayName || place.name) + ' - Economy</h3>';
        html += '<div class="eco-details-actions">';
        html += '<button class="eco-btn eco-btn-edit" data-action="edit-economy">' + _getIcon('EDIT') + ' Edit</button>';
        html += '<button class="eco-btn eco-btn-refresh" data-action="refresh-economy">' + _getIcon('REFRESH') + ' Refresh</button>';
        html += '</div>';
        html += '</div>';

        // Location hierarchy info
        html += '<div class="eco-hierarchy-info">';
        html += '<span class="eco-hierarchy-label">Settlement includes:</span> ';
        html += '<span class="eco-hierarchy-count">' + (settlementData.locationCount || 0) + ' locations</span>';
        if (childPlaces.length > 0) {
            html += ' <span class="eco-hierarchy-children">(';
            var childNames = [];
            for (var c = 0; c < Math.min(childPlaces.length, 3); c++) {
                childNames.push(_escapeHtml(childPlaces[c].displayName || childPlaces[c].name));
            }
            html += childNames.join(', ');
            if (childPlaces.length > 3) {
                html += ' +' + (childPlaces.length - 3) + ' more';
            }
            html += ')</span>';
        }
        html += '</div>';

        // Economy stats grid
        html += '<div class="eco-stats-grid">';

        // Population
        html += '<div class="eco-stat-card">';
        html += '<div class="eco-stat-icon">' + _getIcon('PERSON') + '</div>';
        html += '<div class="eco-stat-content">';
        html += '<div class="eco-stat-value">' + population.living.toLocaleString() + '</div>';
        html += '<div class="eco-stat-label">Living Population</div>';
        html += '<div class="eco-stat-sub">Total: ' + population.total.toLocaleString() + ' | Deceased: ' + population.deceased.toLocaleString() + '</div>';
        html += '</div>';
        html += '</div>';

        // Age breakdown
        html += '<div class="eco-stat-card">';
        html += '<div class="eco-stat-icon">' + _getIcon('AGE_GROUPS') + '</div>';
        html += '<div class="eco-stat-content">';
        html += '<div class="eco-stat-value">' + population.adults.toLocaleString() + '</div>';
        html += '<div class="eco-stat-label">Adults (18-59)</div>';
        html += '<div class="eco-stat-sub">Children: ' + population.children.toLocaleString() + ' | Elderly: ' + population.elderly.toLocaleString() + '</div>';
        html += '</div>';
        html += '</div>';

        // Literacy
        html += '<div class="eco-stat-card">';
        html += '<div class="eco-stat-icon">' + _getIcon('BOOK') + '</div>';
        html += '<div class="eco-stat-content">';
        html += '<div class="eco-stat-value">' + population.literacyRate + '%</div>';
        html += '<div class="eco-stat-label">Literacy Rate</div>';
        html += '<div class="eco-stat-sub">' + population.literate.toLocaleString() + ' literate individuals</div>';
        html += '</div>';
        html += '</div>';

        // Wealth
        html += '<div class="eco-stat-card">';
        html += '<div class="eco-stat-icon">' + _getIcon('COIN') + '</div>';
        html += '<div class="eco-stat-content">';
        html += '<div class="eco-stat-value">' + population.averageWealth.toLocaleString() + '</div>';
        html += '<div class="eco-stat-label">Average Wealth (gold)</div>';
        html += '<div class="eco-stat-sub">Total wealth: ' + population.totalWealth.toLocaleString() + '</div>';
        html += '</div>';
        html += '</div>';

        html += '</div>'; // end eco-stats-grid

        // Settlement-specific economy data
        html += '<div class="eco-settlement-details">';
        html += '<h4>Settlement Economy (Aggregated)</h4>';

        // Prosperity
        var prosperity = settlementData.prosperity || 0;
        var prosperityLabel = 'Unknown';
        var prosperityColor = '#999';
        if (prosperity >= 80) { prosperityLabel = 'Booming'; prosperityColor = '#28a745'; }
        else if (prosperity >= 60) { prosperityLabel = 'Prosperous'; prosperityColor = '#5cb85c'; }
        else if (prosperity >= 40) { prosperityLabel = 'Stable'; prosperityColor = '#f0ad4e'; }
        else if (prosperity >= 20) { prosperityLabel = 'Declining'; prosperityColor = '#d9534f'; }
        else { prosperityLabel = 'Crisis'; prosperityColor = '#c9302c'; }

        html += '<div class="eco-prosperity">';
        html += '<div class="eco-prosperity-label">Prosperity (Average)</div>';
        html += '<div class="eco-prosperity-bar">';
        html += '<div class="eco-prosperity-fill" style="width:' + Math.min(100, prosperity) + '%; background:' + prosperityColor + ';"></div>';
        html += '</div>';
        html += '<div class="eco-prosperity-value">' + Math.round(prosperity) + '% - ' + prosperityLabel + '</div>';
        html += '</div>';

        // Crime rate
        var crimeRate = settlementData.crimeRate || 0;
        var crimeLabel = 'Low';
        var crimeColor = '#28a745';
        if (crimeRate > 0.5) { crimeLabel = 'Extreme'; crimeColor = '#c9302c'; }
        else if (crimeRate > 0.3) { crimeLabel = 'High'; crimeColor = '#d9534f'; }
        else if (crimeRate > 0.15) { crimeLabel = 'Moderate'; crimeColor = '#f0ad4e'; }
        else if (crimeRate > 0.05) { crimeLabel = 'Low'; crimeColor = '#5cb85c'; }

        html += '<div class="eco-crime">';
        html += '<div class="eco-crime-label">Crime Rate (Average)</div>';
        html += '<div class="eco-crime-value" style="color:' + crimeColor + ';">' + Math.round(crimeRate * 100) + '% - ' + crimeLabel + '</div>';
        html += '</div>';

        // Justice
        var justiceSeverity = settlementData.justiceSeverity || 'medium';
        var justiceLabel = 'Medium';
        if (justiceSeverity === 'lenient') justiceLabel = 'Lenient';
        else if (justiceSeverity === 'harsh') justiceLabel = 'Harsh';
        else if (justiceSeverity === 'extreme') justiceLabel = 'Extreme';

        html += '<div class="eco-justice">';
        html += '<div class="eco-justice-label">Justice Severity (Mode)</div>';
        html += '<div class="eco-justice-value">' + justiceLabel + '</div>';
        html += '</div>';

        // Watch
        var hasWatch = settlementData.hasWatch || false;
        var watchSize = settlementData.watchSize || 0;
        html += '<div class="eco-watch">';
        html += '<div class="eco-watch-label">Watch (Any Location)</div>';
        html += '<div class="eco-watch-value">';
        if (hasWatch) {
            html += 'Active <span class="eco-watch-size">(Total: ' + watchSize + ' members)</span>';
        } else {
            html += 'None';
        }
        html += '</div>';
        html += '</div>';

        // Government salary budget
        var salaryBudget = settlementData.governmentSalaryBudget || 0;
        var salaryAllocated = settlementData.salaryBudgetAllocated || 0;
        html += '<div class="eco-salary-budget">';
        html += '<div class="eco-salary-label">Government Salary Budget (Total)</div>';
        html += '<div class="eco-salary-value">' + salaryBudget.toLocaleString() + ' gold/year</div>';
        if (salaryAllocated > 0) {
            html += '<div class="eco-salary-sub">Allocated: ' + salaryAllocated.toLocaleString() + ' gold</div>';
        }
        html += '</div>';

        html += '</div>'; // end eco-settlement-details

        // Location breakdown
        if (settlementData.locationCount > 1) {
            html += '<div class="eco-location-breakdown">';
            html += '<h4>Location Breakdown</h4>';
            html += '<div class="eco-breakdown-grid">';
            
            var placeIds = _getAllDescendantPlaceIds(place.id);
            for (var i = 0; i < placeIds.length; i++) {
                var locPlace = _getPlaceById(placeIds[i]);
                if (!locPlace) continue;
                var locData = _getSettlementData(placeIds[i]);
                var locPop = population.byLocation[placeIds[i]];
                if (!locPop || locPop.total === 0) continue;
                
                html += '<div class="eco-breakdown-item">';
                html += '<div class="eco-breakdown-name">' + _escapeHtml(locPlace.displayName || locPlace.name) + '</div>';
                html += '<div class="eco-breakdown-stats">';
                html += '<span class="eco-breakdown-pop">' + locPop.living + ' living</span>';
                if (locData) {
                    html += ' <span class="eco-breakdown-prosperity">Prosperity: ' + Math.round(locData.prosperity || 0) + '%</span>';
                }
                html += '</div>';
                html += '</div>';
            }
            
            html += '</div>';
            html += '</div>';
        }

        html += '</div>'; // end eco-details-container

        return html;
    }

    // =========================================================================
    // 5. EDIT MODAL
    // =========================================================================

    function _openEditEconomyModal(placeId) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var aggregated = _getAggregatedSettlementData(placeId);
        var currentProsperity = aggregated.prosperity || 50;
        var currentCrimeRate = aggregated.crimeRate || 0.1;
        var currentJustice = aggregated.justiceSeverity || 'medium';
        var currentWatch = aggregated.hasWatch || false;
        var currentWatchSize = aggregated.watchSize || 0;
        var currentSalaryBudget = aggregated.governmentSalaryBudget || 0;

        var content = '<div class="eco-edit-form">';

        // Warning about aggregated editing
        content += '<div class="eco-edit-warning">';
        content += '<p><strong>Note:</strong> Changes will apply to the entire settlement hierarchy (' + 
                   _escapeHtml(place.displayName || place.name) + ' and all sub-locations).</p>';
        content += '</div>';

        // Prosperity
        content += '<div class="form-group">';
        content += '<label for="eco-prosperity-input">Prosperity (0-100)</label>';
        content += '<input type="range" id="eco-prosperity-input" class="form-range" min="0" max="100" value="' + Math.round(currentProsperity) + '">';
        content += '<span id="eco-prosperity-display" class="eco-range-display">' + Math.round(currentProsperity) + '%</span>';
        content += '</div>';

        // Crime Rate
        content += '<div class="form-group">';
        content += '<label for="eco-crime-input">Crime Rate (0-100%)</label>';
        content += '<input type="range" id="eco-crime-input" class="form-range" min="0" max="100" value="' + Math.round(currentCrimeRate * 100) + '">';
        content += '<span id="eco-crime-display" class="eco-range-display">' + Math.round(currentCrimeRate * 100) + '%</span>';
        content += '</div>';

        // Justice Severity
        content += '<div class="form-group">';
        content += '<label for="eco-justice-select">Justice Severity</label>';
        content += '<select id="eco-justice-select" class="form-control">';
        var justiceOptions = ['lenient', 'medium', 'harsh', 'extreme'];
        var justiceLabels = ['Lenient', 'Medium', 'Harsh', 'Extreme'];
        for (var i = 0; i < justiceOptions.length; i++) {
            var selected = (justiceOptions[i] === currentJustice) ? ' selected' : '';
            content += '<option value="' + justiceOptions[i] + '"' + selected + '>' + justiceLabels[i] + '</option>';
        }
        content += '</select>';
        content += '</div>';

        // Watch
        content += '<div class="form-group">';
        content += '<label>Watch</label>';
        content += '<div class="eco-watch-toggle">';
        content += '<label><input type="radio" name="eco-watch" value="active"' + (currentWatch ? ' checked' : '') + '> Active</label>';
        content += '<label><input type="radio" name="eco-watch" value="inactive"' + (!currentWatch ? ' checked' : '') + '> Inactive</label>';
        content += '</div>';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label for="eco-watch-size-input">Watch Size (Total)</label>';
        content += '<input type="number" id="eco-watch-size-input" class="form-control" min="0" max="1000" value="' + currentWatchSize + '">';
        content += '</div>';

        // Salary Budget
        content += '<div class="form-group">';
        content += '<label for="eco-salary-input">Government Salary Budget (gold/year)</label>';
        content += '<input type="number" id="eco-salary-input" class="form-control" min="0" step="10" value="' + Math.round(currentSalaryBudget) + '">';
        content += '</div>';

        content += '</div>';

        _openModal({
            title: 'Edit Economy for ' + (place.displayName || place.name) + ' Hierarchy',
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onOpen: function() {
                // Prosperity slider
                var prosperitySlider = document.getElementById('eco-prosperity-input');
                var prosperityDisplay = document.getElementById('eco-prosperity-display');
                if (prosperitySlider && prosperityDisplay) {
                    prosperitySlider.addEventListener('input', function() {
                        prosperityDisplay.textContent = this.value + '%';
                    });
                }

                // Crime slider
                var crimeSlider = document.getElementById('eco-crime-input');
                var crimeDisplay = document.getElementById('eco-crime-display');
                if (crimeSlider && crimeDisplay) {
                    crimeSlider.addEventListener('input', function() {
                        crimeDisplay.textContent = this.value + '%';
                    });
                }

                // Watch toggle
                var watchRadios = document.querySelectorAll('input[name="eco-watch"]');
                var watchSizeInput = document.getElementById('eco-watch-size-input');
                if (watchRadios && watchSizeInput) {
                    function updateWatchSize() {
                        var active = document.querySelector('input[name="eco-watch"]:checked');
                        if (active && active.value === 'active') {
                            watchSizeInput.disabled = false;
                            if (parseInt(watchSizeInput.value) < 1) {
                                watchSizeInput.value = 1;
                            }
                        } else {
                            watchSizeInput.disabled = true;
                            watchSizeInput.value = 0;
                        }
                    }
                    for (var r = 0; r < watchRadios.length; r++) {
                        watchRadios[r].addEventListener('change', updateWatchSize);
                    }
                    updateWatchSize();
                }
            },
            onConfirm: function() {
                var prosperitySlider = document.getElementById('eco-prosperity-input');
                var crimeSlider = document.getElementById('eco-crime-input');
                var justiceSelect = document.getElementById('eco-justice-select');
                var watchActive = document.querySelector('input[name="eco-watch"]:checked');
                var watchSizeInput = document.getElementById('eco-watch-size-input');
                var salaryInput = document.getElementById('eco-salary-input');

                var prosperity = prosperitySlider ? parseInt(prosperitySlider.value) : 50;
                var crimeRate = crimeSlider ? parseInt(crimeSlider.value) / 100 : 0.1;
                var justice = justiceSelect ? justiceSelect.value : 'medium';
                var hasWatch = watchActive ? watchActive.value === 'active' : false;
                var watchSize = watchSizeInput ? parseInt(watchSizeInput.value) || 0 : 0;
                var salaryBudget = salaryInput ? parseInt(salaryInput.value) || 0 : 0;

                if (hasWatch && watchSize < 1) {
                    _showToast('Watch size must be at least 1', 'error');
                    return;
                }

                // Apply to ALL locations in the hierarchy
                var placeIds = _getAllDescendantPlaceIds(placeId);
                var successCount = 0;
                var errorCount = 0;

                for (var i = 0; i < placeIds.length; i++) {
                    var updates = {
                        prosperity: Math.max(0, Math.min(100, prosperity)),
                        crimeRate: Math.max(0, Math.min(1, crimeRate)),
                        justiceSeverity: justice,
                        hasWatch: hasWatch,
                        watchSize: hasWatch ? watchSize : 0,
                        governmentSalaryBudget: Math.max(0, salaryBudget),
                        lastUpdated: _getCurrentYear()
                    };

                    var result = _updateSettlementData(placeIds[i], updates);
                    if (result) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                }

                _saveMasterData();

                // Invalidate caches
                if (typeof window.invalidateAccessorCaches === 'function') {
                    window.invalidateAccessorCaches();
                }
                if (typeof window.SettlementState !== 'undefined' && 
                    typeof window.SettlementState.invalidateCache === 'function') {
                    window.SettlementState.invalidateCache();
                }

                _showToast('Economy updated for ' + successCount + ' locations in ' + 
                          (place.displayName || place.name) + ' hierarchy', 'success');

                // Refresh the tab
                if (typeof window.refreshEconomyDetailsTab === 'function') {
                    window.refreshEconomyDetailsTab(placeId);
                }
            }
        });
    }

    // =========================================================================
    // 6. MAIN EXPORTED FUNCTIONS
    // =========================================================================

    /**
     * Renders the economy details tab for a specific location (aggregates all descendants)
     * @param {string} containerId - The ID of the container element
     * @param {string} locationId - The ID of the location to display
     */
    function renderEconomyDetailsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Economy details container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderEconomyDetails(place);
        container.dataset.locationId = locationId || '';

        // Set up event listeners
        var editBtn = container.querySelector('[data-action="edit-economy"]');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    _openEditEconomyModal(currentLocationId);
                } else {
                    _showToast('No location selected', 'warning');
                }
            });
        }

        var refreshBtn = container.querySelector('[data-action="refresh-economy"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    renderEconomyDetailsTab(containerId, currentLocationId);
                    _showToast('Economy data refreshed', 'info');
                }
            });
        }
    }

    /**
     * Refreshes the economy details tab
     * @param {string} locationId - The ID of the location to display
     */
    function refreshEconomyDetailsTab(locationId) {
        var container = document.querySelector('.eco-details-tab-container');
        if (!container) {
            var containers = document.querySelectorAll('.eco-details-tab-container, #economy-details-tab');
            if (containers.length > 0) {
                container = containers[0];
            }
        }
        if (container) {
            renderEconomyDetailsTab(container.id || 'economy-details-tab', locationId);
        }
    }

    /**
     * Gets the settlement hierarchy for a location
     * @param {string} locationId - The ID of the location
     * @returns {Array} Array of place IDs in the hierarchy
     */
    function getSettlementHierarchy(locationId) {
        return _getAllDescendantPlaceIds(locationId);
    }

    /**
     * Opens the edit economy modal programmatically
     * @param {string} locationId - The ID of the location to edit
     */
    function editEconomyForLocation(locationId) {
        _openEditEconomyModal(locationId);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.EconomyDetailsTab = {
        render: renderEconomyDetailsTab,
        refresh: refreshEconomyDetailsTab,
        edit: editEconomyForLocation,
        getHierarchy: getSettlementHierarchy,
        _renderDetails: _renderEconomyDetails,
        _openEditModal: _openEditEconomyModal,
        _getPopulation: _getSettlementPopulationForHierarchy,
        _getAggregatedData: _getAggregatedSettlementData,
        _getChildPlaces: _getChildPlaces,
        _getDescendantIds: _getAllDescendantPlaceIds
    };

    // Legacy aliases
    window.renderEconomyDetailsTab = renderEconomyDetailsTab;
    window.refreshEconomyDetailsTab = refreshEconomyDetailsTab;

})();