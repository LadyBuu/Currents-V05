/**
 * =============================================================================
 * SETTLEMENT RELIGION TAB - UI for settlement religion management
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Religion tab.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    // Religion wrappers
    function _getAllReligions() {
        if (typeof ReligionState !== 'undefined' && ReligionState.getAllReligions) {
            return ReligionState.getAllReligions({ includeDeprecated: false });
        }
        return [];
    }

    function _getReligion(id) {
        if (typeof ReligionState !== 'undefined' && ReligionState.getReligion) {
            return ReligionState.getReligion(id);
        }
        return null;
    }

    function _getReligiousBreakdown(locationId) {
        if (typeof ReligionQueries !== 'undefined' && ReligionQueries.getReligiousBreakdown) {
            return ReligionQueries.getReligiousBreakdown(locationId);
        }
        return null;
    }

    function _getDominantReligion(locationId) {
        if (typeof ReligionQueries !== 'undefined' && ReligionQueries.getDominantReligion) {
            return ReligionQueries.getDominantReligion(locationId);
        }
        return null;
    }

    function _getPlacesOfWorshipByLocation(locationId) {
        if (typeof ReligionQueries !== 'undefined' && ReligionQueries.getPlacesOfWorshipByLocation) {
            return ReligionQueries.getPlacesOfWorshipByLocation(locationId);
        }
        return [];
    }

    function _getPlaceOfWorship(placeId) {
        if (typeof ReligionState !== 'undefined' && ReligionState.getPlaceOfWorship) {
            return ReligionState.getPlaceOfWorship(placeId);
        }
        return null;
    }

    function _createPlaceOfWorship(data) {
        if (typeof ReligionCommands !== 'undefined' && ReligionCommands.createPlaceOfWorship) {
            return ReligionCommands.createPlaceOfWorship(data);
        }
        return null;
    }

    function _updatePlaceOfWorship(placeId, updates) {
        if (typeof ReligionCommands !== 'undefined' && ReligionCommands.updatePlaceOfWorship) {
            return ReligionCommands.updatePlaceOfWorship(placeId, updates);
        }
        return null;
    }

    function _deletePlaceOfWorship(placeId) {
        if (typeof ReligionCommands !== 'undefined' && ReligionCommands.deletePlaceOfWorship) {
            return ReligionCommands.deletePlaceOfWorship(placeId);
        }
        return null;
    }

    function _addPlaceOfWorshipToSettlement(locationId, placeId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.addPlaceOfWorshipToSettlement) {
            return SettlementCommands.addPlaceOfWorshipToSettlement(locationId, placeId);
        }
        return null;
    }

    function _removePlaceOfWorshipFromSettlement(locationId, placeId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.removePlaceOfWorshipFromSettlement) {
            return SettlementCommands.removePlaceOfWorshipFromSettlement(locationId, placeId);
        }
        return null;
    }

    function _updateDominantReligion(locationId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateDominantReligion) {
            return SettlementCommands.updateDominantReligion(locationId);
        }
        return null;
    }

    function _calculateReligiousUnity(locationId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.calculateReligiousUnity) {
            return SettlementCommands.calculateReligiousUnity(locationId);
        }
        return 50;
    }

    function _collectTithes(placeId, year) {
        if (typeof ReligionCommands !== 'undefined' && ReligionCommands.collectTithes) {
            return ReligionCommands.collectTithes(placeId, year);
        }
        return null;
    }

    function _getLawTypeIcon(type) {
        if (typeof ReligionLaws !== 'undefined' && ReligionLaws.getLawTypeIcon) {
            return ReligionLaws.getLawTypeIcon(type);
        }
        return '◉';
    }

    function _getLawSeverityColor(severity) {
        if (typeof ReligionLaws !== 'undefined' && ReligionLaws.getLawSeverityColor) {
            return ReligionLaws.getLawSeverityColor(severity);
        }
        return 'var(--text-dim)';
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementReligion(containerId, locationId, summary) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
                    data = SettlementCrud.createSettlementData(locationId);
                }
            }

            if (!data) {
                container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            // Get religion data
            var religiousBreakdown = _getReligiousBreakdown(locationId);
            var dominantReligion = _getDominantReligion(locationId);
            var placesOfWorship = _getPlacesOfWorshipByLocation(locationId);
            var population = _getLocationPopulationCount(locationId);
            var religiousUnity = data.religiousUnity || 50;

            var CIRCLE = _icon('CIRCLE_DOT');
            var LOC = _icon('LOCATION');
            var PERSON = _icon('PERSON');
            var CROWN = _icon('CROWN');
            var COIN = _icon('COIN');
            var INFO = _icon('CIRCLE_DOT');
            var STAR = _icon('STAR_4');
            var SHIELD = _icon('SHIELD');
            var REFRESH = _icon('REFRESH');
            var TRASH = _icon('TRASH');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + CIRCLE + ' Religion in ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + placesOfWorship.length + ' places of worship · ' + population + ' population</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.65rem; color: var(--text);">Unity: <span style="color: ' + (religiousUnity >= 70 ? 'var(--success)' : religiousUnity >= 40 ? 'var(--accent)' : 'var(--danger)') + '; font-weight: bold;">' + religiousUnity + '%</span></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + (dominantReligion ? 'Dominant: ' + _escapeHtml(dominantReligion.name) : 'No dominant religion') + '</div>' +
                '</div>' +
                '</div>';

            // ACTION BUTTONS
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">' +
                '<button class="religion-action-btn" data-action="create-place" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + CIRCLE + ' Place of Worship</button>' +
                '<button class="religion-action-btn" data-action="refresh" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '</div>';

            // RELIGIOUS DEMOGRAPHICS
            if (religiousBreakdown && religiousBreakdown.byReligion) {
                var total = religiousBreakdown.total || 0;
                var religions = religiousBreakdown.byReligion || {};
                var religionIds = Object.keys(religions);

                if (religionIds.length > 0 || (religiousBreakdown.unaffiliated || 0) > 0) {
                    content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                        '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + CIRCLE + ' Religious Demographics</div>' +
                        '<div style="display: flex; flex-direction: column; gap: 3px;">';

                    var sorted = religionIds.sort(function(a, b) {
                        return (religions[b].count || 0) - (religions[a].count || 0);
                    });

                    var dominantId = dominantReligion ? dominantReligion.id : null;

                    for (var i = 0; i < sorted.length; i++) {
                        var id = sorted[i];
                        var r = religions[id];
                        var percentage = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        var barWidth = Math.max(2, percentage);
                        var isDominant = (id === dominantId);

                        content +=
                            '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.55rem; padding: 2px 4px; ' + (isDominant ? 'background: var(--accent-dim); border-radius: 4px;' : '') + '">' +
                            '<span style="min-width: 100px; color: ' + (isDominant ? 'var(--accent-light)' : 'var(--text)') + '; ' + (isDominant ? 'font-weight: bold;' : '') + '">' + _escapeHtml(r.name) + (isDominant ? ' ' + STAR : '') + '</span>' +
                            '<div style="flex: 1; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden;">' +
                            '<div style="width: ' + barWidth + '%; height: 100%; background: ' + (isDominant ? 'var(--accent)' : 'var(--bg4)') + '; border-radius: 4px;"></div>' +
                            '</div>' +
                            '<span style="min-width: 50px; text-align: right; color: var(--dim);">' + r.count + ' (' + percentage + '%)</span>' +
                            '</div>';
                    }

                    if (religiousBreakdown.unaffiliated > 0) {
                        var unaffiliatedPct = total > 0 ? Math.round((religiousBreakdown.unaffiliated / total) * 100) : 0;
                        content +=
                            '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.55rem; padding: 2px 4px; color: var(--dim);">' +
                            '<span style="min-width: 100px;">Unaffiliated</span>' +
                            '<div style="flex: 1; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden;">' +
                            '<div style="width: ' + Math.max(2, unaffiliatedPct) + '%; height: 100%; background: var(--bg4); border-radius: 4px;"></div>' +
                            '</div>' +
                            '<span style="min-width: 50px; text-align: right;">' + religiousBreakdown.unaffiliated + ' (' + unaffiliatedPct + '%)</span>' +
                            '</div>';
                    }

                    content += '</div></div>';
                }
            }

            // PLACES OF WORSHIP
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + LOC + ' Places of Worship (' + placesOfWorship.length + ')</div>';

            if (placesOfWorship.length === 0) {
                content += '<div style="text-align: center; padding: 16px; color: var(--dim); font-size: 0.6rem;">No places of worship in this settlement</div>';
            } else {
                for (var i = 0; i < placesOfWorship.length; i++) {
                    var pw = placesOfWorship[i];
                    var isActive = pw.isActive !== false;
                    var statusColor = isActive ? 'var(--success)' : 'var(--danger)';
                    var religion = pw.religionId ? _getReligion(pw.religionId) : null;
                    var religionName = religion ? religion.name : (pw.religionName || 'Unknown');
                    var headClergy = pw.headClergyId ? _getCharacterById(pw.headClergyId) : null;
                    var clergyCount = pw.clergy ? pw.clergy.length : 0;

                    content +=
                        '<div class="place-of-worship-item" data-place-id="' + pw.id + '" style="' +
                        'background: var(--bg); border: 1px solid var(--border); border-left: 3px solid ' + (isActive ? 'var(--success)' : 'var(--danger)') + ';' +
                        'border-radius: 6px; padding: 10px 14px; margin-bottom: 6px;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                        '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                        '<span style="font-size: 0.7rem; font-weight: bold; color: var(--text);">' + _escapeHtml(pw.name) + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--border); border-radius: 8px;">' + _escapeHtml(pw.type || 'temple') + '</span>' +
                        '<span style="font-size: 0.5rem; color: ' + statusColor + '; padding: 1px 6px; border: 1px solid ' + statusColor + '; border-radius: 8px;">' + (isActive ? 'Active' : 'Inactive') + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--accent); padding: 1px 6px; border: 1px solid var(--accent); border-radius: 8px;">' + _escapeHtml(religionName) + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' +
                        (headClergy ? 'Leader: ' + _escapeHtml(headClergy.name + (headClergy.surname ? ' ' + headClergy.surname : '')) : 'No leader') +
                        ' · Clergy: ' + clergyCount +
                        (pw.currentFollowers ? ' · Followers: ' + pw.currentFollowers : '') +
                        (pw.annualIncome ? ' · Tithes: ' + pw.annualIncome + 'g/yr' : '') +
                        '</div>' +
                        '</div>' +
                        '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="place-worship-detail-btn" data-place-id="' + pw.id + '" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + INFO + ' Details</button>' +
                        '<button class="place-worship-tithe-btn" data-place-id="' + pw.id + '" style="background: none; border: none; color: var(--success); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + COIN + ' Tithes</button>' +
                        '<button class="place-worship-delete-btn" data-place-id="' + pw.id + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + TRASH + ' Delete</button>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            content += '</div>';

            // RELIGIOUS LAWS SUMMARY
            if (dominantReligion) {
                var laws = [];
                if (typeof ReligionLaws !== 'undefined' && ReligionLaws.getLawsByReligion) {
                    laws = ReligionLaws.getLawsByReligion(dominantReligion.id);
                }
                if (laws && laws.length > 0) {
                    content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                        '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + SHIELD + ' Religious Laws (' + laws.length + ')</div>' +
                        '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';

                    for (var i = 0; i < Math.min(5, laws.length); i++) {
                        var law = laws[i];
                        var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;
                        var icon = _getLawTypeIcon(law.type);
                        var color = _getLawSeverityColor(law.severity);
                        content += '<span style="font-size: 0.5rem; background: var(--bg); padding: 2px 8px; border-radius: 12px; border-left: 2px solid ' + color + '; color: var(--text);">' +
                            icon + ' ' + _escapeHtml(law.name) +
                            (isEnforced ? ' ✓' : '') +
                            '</span>';
                    }

                    if (laws.length > 5) {
                        content += '<span style="font-size: 0.5rem; color: var(--dim);">+' + (laws.length - 5) + ' more</span>';
                    }

                    content += '</div></div>';
                }
            }

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Places of worship generate tithes based on followers. Religious unity affects settlement prosperity and crime rate.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var actionBtns = container.querySelectorAll('.religion-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'create-place':
                            _openCreatePlaceOfWorshipModal(locationId);
                            break;
                        case 'refresh':
                            renderSettlementReligion('tab-religion', locationId);
                            break;
                    }
                });
            })(actionBtns[i]);
        }

        var detailBtns = container.querySelectorAll('.place-worship-detail-btn');
        for (var i = 0; i < detailBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var placeId = this.dataset.placeId;
                    _openPlaceOfWorshipDetailsModal(placeId, locationId);
                });
            })(detailBtns[i]);
        }

        var titheBtns = container.querySelectorAll('.place-worship-tithe-btn');
        for (var i = 0; i < titheBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var placeId = this.dataset.placeId;
                    _collectTithesForPlace(placeId, locationId);
                });
            })(titheBtns[i]);
        }

        var deleteBtns = container.querySelectorAll('.place-worship-delete-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var placeId = this.dataset.placeId;
                    _deletePlaceOfWorship(placeId, locationId);
                });
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 7. CREATE PLACE OF WORSHIP MODAL
    // =========================================================================

    function _openCreatePlaceOfWorshipModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var religions = _getAllReligions();

            var religionOptions = '';
            if (religions.length === 0) {
                religionOptions += '<option value="">No religions available - create one first</option>';
            } else {
                for (var i = 0; i < religions.length; i++) {
                    religionOptions += '<option value="' + religions[i].id + '">' + _escapeHtml(religions[i].name) + '</option>';
                }
            }

            var typeOptions = '';
            var types = ['temple', 'church', 'shrine', 'mosque', 'synagogue', 'monastery', 'grove'];
            for (var i = 0; i < types.length; i++) {
                typeOptions += '<option value="' + types[i] + '">' + types[i].charAt(0).toUpperCase() + types[i].slice(1) + '</option>';
            }

            var INFO = _icon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Create Place of Worship</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Name</label>' +
                '<input type="text" id="pwName" placeholder="e.g., The Great Temple" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Religion</label>' +
                '<select id="pwReligion" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                religionOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Type</label>' +
                '<select id="pwType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">' +
                '<input type="checkbox" id="pwProducesIncome" checked style="width:16px;height:16px;">' +
                '<label style="font-size:0.65rem; color:var(--dim); cursor:pointer;">Produces Income (Tithes)</label>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Base Tithe (gold per follower per year)</label>' +
                '<input type="number" id="pwBaseTithe" value="2" min="0" step="0.5" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Places of worship generate tithes based on followers at this location. Higher base tithe = more income but may affect follower happiness.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Place of Worship',
                content: content,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('pwName').value.trim();
                    if (!name) {
                        _showToast('Name is required', 'error');
                        return false;
                    }

                    var religionId = document.getElementById('pwReligion').value;
                    if (!religionId) {
                        _showToast('Please select a religion', 'error');
                        return false;
                    }

                    var type = document.getElementById('pwType').value;
                    var producesIncome = document.getElementById('pwProducesIncome').checked;
                    var baseTithe = parseFloat(document.getElementById('pwBaseTithe').value) || 2;

                    var data = {
                        name: name,
                        religionId: religionId,
                        locationId: locationId,
                        type: type,
                        producesIncome: producesIncome,
                        baseTithe: baseTithe,
                        foundedYear: _getCurrentYear(),
                        isActive: true
                    };

                    var result = _createPlaceOfWorship(data);
                    if (result && result.success) {
                        var addResult = _addPlaceOfWorshipToSettlement(locationId, result.data.id);
                        if (addResult && addResult.success) {
                            _updateDominantReligion(locationId);
                            _calculateReligiousUnity(locationId);
                            _showToast('Place of worship created: ' + result.data.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementReligion('tab-religion', locationId);
                            return true;
                        } else {
                            _showToast('Created but failed to add to settlement', 'warning');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementReligion('tab-religion', locationId);
                            return true;
                        }
                    } else {
                        _showToast('Failed to create place of worship: ' + (result ? result.reason : 'Unknown error'), 'error');
                        _modalOpen = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening modal', 'error');
        }
    }

    // =========================================================================
    // 8. PLACE OF WORSHIP DETAILS MODAL
    // =========================================================================

    function _openPlaceOfWorshipDetailsModal(placeId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var pw = _getPlaceOfWorship(placeId);
            if (!pw) {
                _showToast('Place of worship not found', 'error');
                _modalOpen = false;
                return;
            }

            var place = _getPlaceById(locationId);
            var religion = pw.religionId ? _getReligion(pw.religionId) : null;
            var headClergy = pw.headClergyId ? _getCharacterById(pw.headClergyId) : null;
            var clergyList = [];
            if (pw.clergy) {
                for (var i = 0; i < pw.clergy.length; i++) {
                    var c = _getCharacterById(pw.clergy[i]);
                    if (c) clergyList.push(c);
                }
            }

            var INFO = _icon('CIRCLE_DOT');
            var PERSON = _icon('PERSON');
            var CROWN = _icon('CROWN');
            var COIN = _icon('COIN');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + _escapeHtml(pw.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(pw.type || 'temple') + ' · ' + (religion ? _escapeHtml(religion.name) : 'Unknown religion') + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem; margin-bottom: 16px;">' +
                '<div><span style="color: var(--dim);">Status:</span> <span style="color: var(--text);">' + (pw.isActive ? 'Active' : 'Inactive') + '</span></div>' +
                '<div><span style="color: var(--dim);">Founded:</span> <span style="color: var(--text);">' + (pw.foundedYear || 'Unknown') + '</span></div>' +
                '<div><span style="color: var(--dim);">Location:</span> <span style="color: var(--text);">' + _escapeHtml(pw.locationName || (place ? place.displayName : 'Unknown')) + '</span></div>' +
                '<div><span style="color: var(--dim);">Produces Income:</span> <span style="color: var(--text);">' + (pw.producesIncome ? 'Yes' : 'No') + '</span></div>' +
                '<div><span style="color: var(--dim);">Base Tithe:</span> <span style="color: var(--text);">' + (pw.baseTithe || 0) + 'g/follower/yr</span></div>' +
                '<div><span style="color: var(--dim);">Current Followers:</span> <span style="color: var(--text);">' + (pw.currentFollowers || 0) + '</span></div>' +
                '<div><span style="color: var(--dim);">Annual Income:</span> <span style="color: var(--text);">' + (pw.annualIncome || 0) + 'g</span></div>' +
                '<div><span style="color: var(--dim);">Wealth:</span> <span style="color: var(--text);">' + (pw.wealth || 0) + 'g</span></div>' +
                '</div>' +

                '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + CROWN + ' Leadership</div>' +
                '<button class="pw-set-leader-btn" data-place-id="' + pw.id + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">Set Leader</button>' +
                '</div>' +
                '<div style="font-size: 0.65rem; color: var(--text);">' +
                (headClergy ? _escapeHtml(headClergy.name + (headClergy.surname ? ' ' + headClergy.surname : '')) : 'No leader assigned') +
                '</div>' +
                '</div>' +

                '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + PERSON + ' Clergy (' + clergyList.length + ')</div>' +
                '<button class="pw-add-clergy-btn" data-place-id="' + pw.id + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">Add Clergy</button>' +
                '</div>';

            if (clergyList.length === 0) {
                content += '<div style="font-size: 0.55rem; color: var(--dim); padding: 4px 0;">No clergy assigned</div>';
            } else {
                for (var i = 0; i < clergyList.length; i++) {
                    var c = clergyList[i];
                    var isLeader = pw.headClergyId === c.id;
                    content += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span style="color: var(--text);">' + _escapeHtml(c.name + (c.surname ? ' ' + c.surname : '')) + (isLeader ? ' ' + CROWN : '') + '</span>' +
                        (isLeader ? '<span style="font-size: 0.5rem; color: var(--accent);">Leader</span>' : '') +
                        '</div>';
                }
            }

            content += '</div>' +

            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
            INFO + ' Tithes are collected annually. The head clergy can assign other clergy members.' +
            '</div>' +
            '</div>';

            _openModal({
                title: 'Place of Worship Details',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var setLeaderBtn = document.querySelector('.pw-set-leader-btn');
                if (setLeaderBtn) {
                    setLeaderBtn.addEventListener('click', function() {
                        var placeId = this.dataset.placeId;
                        _closeTopModal();
                        _modalOpen = false;
                        _openSetLeaderModal(placeId, locationId);
                    });
                }

                var addClergyBtn = document.querySelector('.pw-add-clergy-btn');
                if (addClergyBtn) {
                    addClergyBtn.addEventListener('click', function() {
                        var placeId = this.dataset.placeId;
                        _closeTopModal();
                        _modalOpen = false;
                        _openAddClergyModal(placeId, locationId);
                    });
                }
            }, 100);

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening details', 'error');
        }
    }

    // =========================================================================
    // 9. SET LEADER MODAL
    // =========================================================================

    function _openSetLeaderModal(placeId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var pw = _getPlaceOfWorship(placeId);
            if (!pw) {
                _showToast('Place of worship not found', 'error');
                _modalOpen = false;
                return;
            }

            if (typeof window.openCharacterSelector === 'function') {
                window.openCharacterSelector({
                    title: 'Select Head Clergy for ' + pw.name,
                    filters: {
                        status: 'all',
                        showDeceased: false,
                        location: locationId
                    },
                    onSelect: function(character) {
                        if (!character) {
                            _modalOpen = false;
                            return;
                        }

                        var result = _updatePlaceOfWorship(placeId, {
                            headClergyId: character.id
                        });

                        if (result && result.success) {
                            _showToast('Head clergy set: ' + character.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementReligion('tab-religion', locationId);
                        } else {
                            _showToast('Failed to set head clergy', 'error');
                            _modalOpen = false;
                        }
                    },
                    onCancel: function() {
                        _modalOpen = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _modalOpen = false;
            }

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening set leader modal', 'error');
        }
    }

    // =========================================================================
    // 10. ADD CLERGY MODAL
    // =========================================================================

    function _openAddClergyModal(placeId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var pw = _getPlaceOfWorship(placeId);
            if (!pw) {
                _showToast('Place of worship not found', 'error');
                _modalOpen = false;
                return;
            }

            if (typeof window.openCharacterSelector === 'function') {
                window.openCharacterSelector({
                    title: 'Add Clergy to ' + pw.name,
                    filters: {
                        status: 'all',
                        showDeceased: false,
                        location: locationId
                    },
                    onSelect: function(character) {
                        if (!character) {
                            _modalOpen = false;
                            return;
                        }

                        var clergy = pw.clergy || [];
                        if (clergy.indexOf(character.id) !== -1) {
                            _showToast(character.name + ' is already clergy', 'warning');
                            _modalOpen = false;
                            return;
                        }

                        clergy.push(character.id);
                        var result = _updatePlaceOfWorship(placeId, {
                            clergy: clergy
                        });

                        if (result && result.success) {
                            _showToast('Added ' + character.name + ' to clergy', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementReligion('tab-religion', locationId);
                        } else {
                            _showToast('Failed to add clergy', 'error');
                            _modalOpen = false;
                        }
                    },
                    onCancel: function() {
                        _modalOpen = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _modalOpen = false;
            }

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening add clergy modal', 'error');
        }
    }

    // =========================================================================
    // 11. COLLECT TITHES
    // =========================================================================

    function _collectTithesForPlace(placeId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var pw = _getPlaceOfWorship(placeId);
            if (!pw) {
                _showToast('Place of worship not found', 'error');
                _modalOpen = false;
                return;
            }

            if (!pw.producesIncome) {
                _showToast('This place does not produce income', 'warning');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Collect tithes from ' + pw.name + '?\n' +
                'Current followers: ' + (pw.currentFollowers || 0) + '\n' +
                'Annual income: ' + (pw.annualIncome || 0) + 'g',
                'Collect Tithes',
                function() {
                    var result = _collectTithes(placeId, _getCurrentYear());
                    if (result && result.success) {
                        _showToast('Collected ' + (result.data.collected || 0) + 'g in tithes', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementReligion('tab-religion', locationId);
                    } else {
                        _showToast('Failed to collect tithes: ' + (result ? result.reason : 'Unknown error'), 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error collecting tithes', 'error');
        }
    }

    // =========================================================================
    // 12. DELETE PLACE OF WORSHIP
    // =========================================================================

    function _deletePlaceOfWorship(placeId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var pw = _getPlaceOfWorship(placeId);
            if (!pw) {
                _showToast('Place of worship not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Delete ' + pw.name + '?\n\nThis will remove it from the settlement and delete all associated data.\nThis action cannot be undone.',
                'Delete Place of Worship',
                function() {
                    var removeResult = _removePlaceOfWorshipFromSettlement(locationId, placeId);
                    if (!removeResult || !removeResult.success) {
                        _showToast('Failed to remove from settlement', 'warning');
                    }

                    var result = _deletePlaceOfWorship(placeId);
                    if (result && result.success) {
                        _updateDominantReligion(locationId);
                        _calculateReligiousUnity(locationId);
                        _showToast('Place of worship deleted: ' + pw.name, 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementReligion('tab-religion', locationId);
                    } else {
                        _showToast('Failed to delete: ' + (result ? result.reason : 'Unknown error'), 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error deleting place of worship', 'error');
        }
    }

    // =========================================================================
    // 13. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('religion', renderSettlementReligion, true);
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.renderSettlementReligion = renderSettlementReligion;
    window._renderSettlementReligion = renderSettlementReligion;

})();