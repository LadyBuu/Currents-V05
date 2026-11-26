(function () {
    'use strict';

    var SCOPE = 'events';
    var TAB_ID = 'social';
    var TYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var SOCIAL_TYPES = [
        TYPES.FRIENDSHIP || 'friendship',
        TYPES.RIVALRY || 'rivalry',
        TYPES.ENMITY || 'enmity'
    ];

    function esc(value) {
        var text = value == null ? '' : String(value);
        return typeof window.escapeHtml === 'function'
            ? window.escapeHtml(text)
            : text.replace(/[&<>"']/g, function (char) {
                return {
                    '&': '&amp;', '<': '&lt;', '>': '&gt;',
                    '"': '&quot;', "'": '&#39;'
                }[char];
            });
    }

    function chars() {
        var list = typeof window.getCharacters === 'function'
            ? window.getCharacters()
            : (window.CharacterQueries &&
               typeof window.CharacterQueries.getAllCharacters === 'function'
                ? window.CharacterQueries.getAllCharacters()
                : []);
        return Array.isArray(list) ? list.filter(function (character) {
            return character && character.id && character.isDeleted !== true;
        }) : [];
    }

    function characterName(character) {
        if (!character) return '';
        return [character.name, character.surname].filter(Boolean).join(' ') ||
            character.fullName || character.id || '';
    }

    function characterById(id) {
        if (window.getCharacterById) return window.getCharacterById(id);
        var list = chars();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(id)) return list[i];
        }
        return null;
    }

    function characterLocation(character) {
        return character && (
            character.currentLocationId ||
            character.locationId ||
            character.placeId ||
            character.location
        );
    }

    function locationIds(locationId) {
        var ids = {};
        if (!locationId) return ids;
        ids[locationId] = true;
        var queries = window.LocationQueries;
        if (queries && typeof queries.getAllSubLocationIds === 'function') {
            try {
                var descendants = queries.getAllSubLocationIds(locationId);
                if (Array.isArray(descendants)) {
                    descendants.forEach(function (id) {
                        if (id) ids[id] = true;
                    });
                }
            } catch (error) {
                // Exact-location filtering remains available if expansion fails.
            }
        }
        return ids;
    }

    function locationLabel(place) {
        return place && (place.name || place.displayName || place.id || place.placeId) || '';
    }

    function getSocialRecords(locationId) {
        if (!window.EventsQueries ||
            typeof window.EventsQueries.getSocialEvents !== 'function') {
            return { available: false, reason: 'EventsQueries.getSocialEvents is unavailable.' };
        }
        var result = window.EventsQueries.getSocialEvents(locationId || null);
        if (!result || result.available !== true) return result || {
            available: false,
            reason: 'Social relationship query returned no result.'
        };
        return result;
    }

    function activeSocial(locationId) {
        var result = getSocialRecords(locationId);
        if (!result || result.available !== true) return result;
        return {
            available: true,
            records: (result.records || []).filter(function (record) {
                return record && record.status === 'ongoing' &&
                    SOCIAL_TYPES.indexOf(record.type) !== -1;
            })
        };
    }

    function refresh() {
        if (window.TabManager && window.TabManager.renderActive) {
            window.TabManager.renderActive(SCOPE);
        }
    }

    function toast(message, type) {
        if (window.showToast) window.showToast(message, type || 'info');
        else if (window._showToast) window._showToast(message, type || 'info');
    }

    function openPair(characterA, characterB, type) {
        if (!window.openRelationshipModal) {
            toast('Relationship creation modal is unavailable.', 'error');
            return;
        }
        window.openRelationshipModal(characterA, characterB, refresh, {
            defaultType: type,
            allowedTypes: SOCIAL_TYPES.slice()
        });
    }

    function optionMarkup(character, selectedId) {
        var selected = String(character.id) === String(selectedId) ? ' selected' : '';
        return '<option value="' + esc(character.id) + '"' + selected + '>' +
            esc(characterName(character)) + '</option>';
    }

    function populateCharacterB(container, pool, selectedId) {
        var pickerB = container.querySelector('[data-social-b]');
        var pickerA = container.querySelector('[data-social-a]');
        if (!pickerB || !pickerA) return;

        var characterAId = pickerA.value;
        var available = pool.filter(function (character) {
            return !characterAId || String(character.id) !== String(characterAId);
        });
        var keepSelected = available.some(function (character) {
            return String(character.id) === String(selectedId);
        }) ? selectedId : '';

        pickerB.innerHTML = '<option value="">Character B</option>' +
            available.map(function (character) {
                return optionMarkup(character, keepSelected);
            }).join('');
        pickerB.disabled = available.length === 0;
    }

    function render(container, context) {
        if (!container) return;

        var scopedId = context && context.locationId || '';
        container.__socialContextLocation = scopedId;
        var hasStoredLocation = Object.prototype.hasOwnProperty.call(container, '__socialLocation');
        var selectedLocation = hasStoredLocation ? container.__socialLocation : scopedId;
        var limitToLocation = container.__socialLimit === true;
        var places = typeof window.getPlaces === 'function' ? window.getPlaces() || [] : [];
        var selectedIds = locationIds(selectedLocation);
        var allCharacters = chars();
        var pool = allCharacters.filter(function (character) {
            if (!limitToLocation || !selectedLocation) return true;
            return selectedIds[characterLocation(character)] === true;
        });

        var locationOptions = '<option value="">Choose location</option>' +
            places.map(function (place) {
                var id = place && (place.id || place.placeId);
                if (!id) return '';
                return '<option value="' + esc(id) + '"' +
                    (String(id) === String(selectedLocation) ? ' selected' : '') +
                    '>' + esc(locationLabel(place)) + '</option>';
            }).join('');

        var queryResult = activeSocial(limitToLocation ? selectedLocation : null);
        var records = queryResult && queryResult.available ? queryResult.records : [];
        var labels = {
            friendship: 'Friendship',
            rivalry: 'Rivalry',
            enmity: 'Enmity'
        };

        var html = '<section class="events-social">' +
            '<div class="events-social__bar">' +
                '<label><input type="checkbox" data-social-limit ' +
                    (limitToLocation ? 'checked' : '') + '> Limit to location</label>' +
                '<select data-social-location ' + (limitToLocation ? '' : 'disabled') +
                    ' aria-label="Social location filter">' + locationOptions + '</select>' +
                '<select data-social-a aria-label="Character A">' +
                    '<option value="">Character A</option>' +
                    pool.map(function (character) { return optionMarkup(character, ''); }).join('') +
                '</select>' +
                '<select data-social-b aria-label="Character B">' +
                    '<option value="">Character B</option>' +
                    pool.map(function (character) { return optionMarkup(character, ''); }).join('') +
                '</select>' +
                '<select data-social-type aria-label="Relationship type">' +
                    '<option value="friendship">Friendship</option>' +
                    '<option value="rivalry">Rivalry</option>' +
                    '<option value="enmity">Enmity</option>' +
                '</select>' +
                '<button type="button" data-social-action="create">Create relationship</button>' +
                '<button type="button" data-social-action="random">Random pair</button>' +
                '<button type="button" data-social-action="refresh">Refresh</button>' +
            '</div>' +
            '<p class="events-social__muted">' +
                (queryResult && queryResult.available
                    ? records.length + ' active social relationship(s)'
                    : esc(queryResult && queryResult.reason || 'Social records are unavailable.')) +
            '</p>' +
            '<div>' +
                (records.length ? records.map(function (record) {
                    return '<article class="events-social__row">' +
                        '<strong>' + esc(labels[record.type] || record.type) + '</strong> · ' +
                        esc(characterName(characterById(record.participantA)) || record.participantA) +
                        ' ↔ ' +
                        esc(characterName(characterById(record.participantB)) || record.participantB) +
                        (record.startYear != null ? ' · since ' + esc(record.startYear) : '') +
                    '</article>';
                }).join('') : '<p class="events-social__muted">No active social relationships match this view.</p>') +
            '</div>' +
        '</section>';

        container.innerHTML = html;
        populateCharacterB(container, pool, '');

        if (container.__socialWired) return;
        container.__socialWired = true;

        container.addEventListener('change', function (event) {
            var target = event.target;
            if (target.matches('[data-social-a]')) {
                var currentB = container.querySelector('[data-social-b]');
                populateCharacterB(container, poolForCurrentView(container), currentB && currentB.value);
                return;
            }
            if (target.matches('[data-social-limit]')) {
                container.__socialLimit = target.checked;
                if (target.checked && !container.__socialLocation) {
                    container.__socialLocation = container.__socialContextLocation || '';
                }
                refresh();
                return;
            }
            if (target.matches('[data-social-location]')) {
                container.__socialLocation = target.value;
                refresh();
            }
        });

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-social-action]');
            if (!button) return;
            if (button.dataset.socialAction === 'refresh') {
                refresh();
                return;
            }

            var available = poolForCurrentView(container);
            if (available.length < 2) {
                toast('At least two characters are required in the selected scope.', 'warning');
                return;
            }

            var characterA;
            var characterB;
            var type;

            if (button.dataset.socialAction === 'random') {
                var first = Math.floor(Math.random() * available.length);
                var second = Math.floor(Math.random() * (available.length - 1));
                if (second >= first) second++;
                characterA = available[first];
                characterB = available[second];
                type = SOCIAL_TYPES[Math.floor(Math.random() * SOCIAL_TYPES.length)];
            } else {
                var idA = container.querySelector('[data-social-a]').value;
                var idB = container.querySelector('[data-social-b]').value;
                characterA = available.find(function (character) {
                    return String(character.id) === String(idA);
                });
                characterB = available.find(function (character) {
                    return String(character.id) === String(idB);
                });
                type = container.querySelector('[data-social-type]').value;
                if (!characterA || !characterB || characterA.id === characterB.id) {
                    toast('Choose two different characters.', 'warning');
                    return;
                }
            }
            openPair(characterA, characterB, type);
        });
    }

    function poolForCurrentView(container) {
        var selected = container.__socialLocation || '';
        var restricted = container.__socialLimit === true && !!selected;
        var ids = locationIds(selected);
        return chars().filter(function (character) {
            return !restricted || ids[characterLocation(character)] === true;
        });
    }

    if (window.TabManager && window.TabManager.register) {
        window.TabManager.register(SCOPE, TAB_ID, render);
    }

    window.EventsSocialTab = {
        id: TAB_ID,
        render: render
    };
})();