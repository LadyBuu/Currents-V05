/**
 * =============================================================================
 * NAME SYSTEM - Legacy Wrapper
 * =============================================================================
 * 
 * This file maintains backward compatibility with the old nameGeneratorCore.js
 * All functions delegate to the new NameState, NameQueries, and NameCommands.
 * 
 * DEPRECATED: Use NameQueries and NameCommands directly instead.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DELEGATE TO NEW SYSTEM
    // =========================================================================

    // Core helpers (delegated)
    window.getBaseNameForPatronymic = function(character) {
        return typeof NameQueries._getBaseNameForPatronymic === 'function' ?
            NameQueries._getBaseNameForPatronymic(character) : '';
    };

    window.capitalizeFirstLetter = function(str) {
        return typeof NameQueries._capitalizeFirstLetter === 'function' ?
            NameQueries._capitalizeFirstLetter(str) : '';
    };

    window.getCharacterGender = function(character) {
        return typeof NameQueries._getCharacterGender === 'function' ?
            NameQueries._getCharacterGender(character) : 'neutral';
    };

    window.getCharacterCurrentLocationId = function(character) {
        // Use world.js function if available
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(character);
        }
        return null;
    };

    window.getCharacterCountryId = function(character) {
        return typeof NameQueries.getCharacterCountryId === 'function' ?
            NameQueries.getCharacterCountryId(character) : null;
    };

    window.getCountryIdFromPlace = function(placeId) {
        var place = typeof window.getPlaceById === 'function' ? window.getPlaceById(placeId) : null;
        if (!place) return null;
        return typeof NameQueries.getCharacterCountryId === 'function' ?
            NameQueries.getCharacterCountryId({ currentLocationId: placeId }) : null;
    };

    window.getCharacterLocationName = function(character) {
        if (!character) return '';
        if (character.currentLocation) return character.currentLocation;
        var locationId = window.getCharacterCurrentLocationId(character);
        if (locationId) {
            var place = typeof window.getPlaceById === 'function' ? window.getPlaceById(locationId) : null;
            if (place) return place.displayName;
        }
        return '';
    };

    // Family surname generation
    window.generateFamilySurname = function(father, mother, rules) {
        return typeof NameQueries.generateFamilySurname === 'function' ?
            NameQueries.generateFamilySurname(father, mother, rules) : '';
    };

    window._splitSurname = function(surname) {
        return typeof NameQueries._splitSurname === 'function' ?
            NameQueries._splitSurname(surname) : [];
    };

    window._getSurnamePart = function(character, position) {
        if (!character) return '';
        return typeof NameQueries._getSurnamePart === 'function' ?
            NameQueries._getSurnamePart(character.surname, position) : '';
    };

    // Patronymic generation
    window.generatePatronymicSurnameFromRules = function(parent, childGender, rules) {
        return typeof NameQueries.generatePatronymicSurname === 'function' ?
            NameQueries.generatePatronymicSurname(parent, childGender, rules) : '';
    };

    // Chain generation
    window.generateChainSurnameFromRules = function(character, rules) {
        return typeof NameQueries.generateChainSurname === 'function' ?
            NameQueries.generateChainSurname(character, rules) : '';
    };

    window._getAncestorNamesForChain = function(character, order, depth, source) {
        // Not directly available - use generateChainSurname
        return [];
    };

    // Unified generation
    window.generateSurnameFromRules = function(mother, father, childGender, rules) {
        return typeof NameQueries.generateSurnameFromRules === 'function' ?
            NameQueries.generateSurnameFromRules(mother, father, childGender, rules) : '';
    };

    window._getConnectorValue = function(connectorType, customConnector) {
        return typeof NameQueries._getConnector === 'function' ?
            NameQueries._getConnector(connectorType, customConnector) : ' ';
    };

    // Ancestor retrieval
    window.getAncestorFirstName = function(character, type) {
        var data = typeof NameQueries.getAncestorData === 'function' ?
            NameQueries.getAncestorData(character, type) : null;
        return data ? data.firstName : '';
    };

    window.getAncestorSurname = function(character, type) {
        var data = typeof NameQueries.getAncestorData === 'function' ?
            NameQueries.getAncestorData(character, type) : null;
        return data ? data.surname : '';
    };

    window.getAncestorChain = function(character, maxDepth) {
        // Build chain from ancestor data
        if (!character) return [];
        var chain = [];
        var types = ['father', 'mother', 'paternal_grandfather', 'paternal_grandmother',
                     'maternal_grandfather', 'maternal_grandmother'];

        for (var i = 0; i < Math.min(types.length, maxDepth * 2); i++) {
            var type = types[i % types.length];
            var data = typeof NameQueries.getAncestorData === 'function' ?
                NameQueries.getAncestorData(character, type) : null;
            if (data) {
                chain.push({
                    id: type,
                    name: type.charAt(0).toUpperCase() + type.slice(1),
                    firstName: data.firstName,
                    surname: data.surname,
                    gender: 'unknown',
                    depth: Math.floor(i / 2) + 1,
                    characterId: data.id
                });
            }
        }
        return chain;
    };

    // Name list access
    window.getRandomNameFromCountry = function(countryId, gender) {
        return typeof NameQueries.getRandomName === 'function' ?
            NameQueries.getRandomName(countryId, gender) : null;
    };

    window.getRandomSurnameFromCountry = function(countryId) {
        return typeof NameQueries.getRandomSurname === 'function' ?
            NameQueries.getRandomSurname(countryId) : '';
    };

    // Location-based surname rules
    window.getCountrySurnameRules = function(countryId) {
        return typeof NameQueries.getCountrySurnameRules === 'function' ?
            NameQueries.getCountrySurnameRules(countryId) : null;
    };

    window.determineNewbornSurname = function(mother, father, countryId) {
        return typeof NameQueries.determineNewbornSurname === 'function' ?
            NameQueries.determineNewbornSurname(mother, father, countryId) : null;
    };

    // Surname history
    window.getSurnameHistory = function(character) {
        if (!character) return null;
        return typeof NameQueries.getSurnameHistory === 'function' ?
            NameQueries.getSurnameHistory(character.id) : null;
    };

    window.getBirthSurname = function(character) {
        if (!character) return '';
        return typeof NameQueries.getBirthSurname === 'function' ?
            NameQueries.getBirthSurname(character.id) : '';
    };

    window.getCurrentSurname = function(character) {
        if (!character) return '';
        return typeof NameQueries.getCurrentSurname === 'function' ?
            NameQueries.getCurrentSurname(character.id) : '';
    };

    window.getSurnameChanges = function(character) {
        if (!character) return [];
        return typeof NameQueries.getSurnameChanges === 'function' ?
            NameQueries.getSurnameChanges(character.id) : [];
    };

    window.recordSurnameChange = function(character, newSurname, year, reason, options) {
        return typeof NameCommands.recordSurnameChange === 'function' ?
            NameCommands.recordSurnameChange(character, newSurname, year, reason, options) : null;
    };

    window.recordBirthSurname = function(character, birthSurname) {
        return typeof NameCommands.recordBirthSurname === 'function' ?
            NameCommands.recordBirthSurname(character, birthSurname) : null;
    };

    window.revertLastSurnameChange = function(character) {
        return typeof NameCommands.revertLastSurnameChange === 'function' ?
            NameCommands.revertLastSurnameChange(character) : null;
    };

    // Marriage surnames
    window.getMarriageSurnameRule = function(countryId) {
        return 'wife_takes_husband';
    };

    window.calculateMarriageSurnames = function(person, spouse, rule, year) {
        return typeof NameCommands._calculateMarriageSurnames === 'function' ?
            NameCommands._calculateMarriageSurnames(person, spouse, rule, year) :
            { newSurname: person.surname || '', spouseNewSurname: spouse.surname || '' };
    };

    window.applyMarriageSurnames = function(person, spouse, rule, year, notes) {
        return typeof NameCommands.applyMarriageSurnames === 'function' ?
            NameCommands.applyMarriageSurnames(person, spouse, rule, year, notes) : null;
    };



})();