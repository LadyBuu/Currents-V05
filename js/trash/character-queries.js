(function() {
    'use strict';

    function findCharacterByName(name, surname) {
        if (!name || typeof name !== 'string') return null;
        var chars = window.getCharacters();
        var nameLower = name.toLowerCase();
        var surnameLower = (surname === undefined || surname === null)
            ? null : String(surname).toLowerCase();

        for (var i = 0; i < chars.length; i++) {
            var c = chars[i];
            if (c.name && c.name.toLowerCase() === nameLower) {
                if (surnameLower === null) return c;
                if (c.surname && c.surname.toLowerCase() === surnameLower) return c;
            }
        }
        return null;
    }

    function findCharacterByFullName(fullName) {
        if (!fullName || typeof fullName !== 'string') return null;
        var trimmed = fullName.trim();
        if (trimmed.length === 0) return null;
        var lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace === -1) return findCharacterByName(trimmed);
        return findCharacterByName(
            trimmed.substring(0, lastSpace),
            trimmed.substring(lastSpace + 1)
        );
    }

    function getLivingCharacters() {
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            if (!chars[i].isDeceased) result.push(chars[i]);
        }
        return result;
    }

    function getDeceasedCharacters() {
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            if (chars[i].isDeceased) result.push(chars[i]);
        }
        return result;
    }

    function getCharactersByGender(gender) {
        if (!gender) return [];
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            if (chars[i].gender === gender) result.push(chars[i]);
        }
        return result;
    }

    function getCharactersByRole(roleId) {
        if (!roleId) return [];
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (!Array.isArray(char.professions)) continue;
            for (var j = 0; j < char.professions.length; j++) {
                if (char.professions[j].id === roleId) {
                    result.push(char);
                    break;
                }
            }
        }
        return result;
    }

    function getCharactersByLocation(locationId) {
        if (!locationId) return [];
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (char.isDeceased) continue;
            var locId = (typeof window.getCurrentLocationId === 'function')
                ? window.getCurrentLocationId(char)
                : (char.currentLocationId || null);
            if (locId === locationId) result.push(char);
        }
        return result;
    }

    function getCharactersByAgeRange(minAge, maxAge, asOfYear) {
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (char.isDeceased) continue;
            var age = (typeof window.calculateAge === 'function')
                ? window.calculateAge(char.birthYear, false, null, asOfYear)
                : null;
            if (age === null) continue;
            if (age >= minAge && age <= maxAge) result.push(char);
        }
        return result;
    }

    function getCharactersByProfession(roleId, minSkill) {
        minSkill = minSkill || 0;
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (char.isDeceased) continue;
            if (!Array.isArray(char.professions)) continue;
            for (var j = 0; j < char.professions.length; j++) {
                var prof = char.professions[j];
                if (prof.id === roleId && (prof.skillLevel || 0) >= minSkill) {
                    result.push(char);
                    break;
                }
            }
        }
        return result;
    }

    function getCharactersByBirthDecade(decade) {
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (typeof char.birthYear !== 'number') continue;
            if (Math.floor(char.birthYear / 10) * 10 === decade) result.push(char);
        }
        return result;
    }

    function getCharactersBornInYearRange(startYear, endYear) {
        var chars = window.getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (typeof char.birthYear !== 'number') continue;
            if (char.birthYear >= startYear && char.birthYear <= endYear) {
                result.push(char);
            }
        }
        return result;
    }

    window.findCharacterByName = findCharacterByName;
    window.findCharacterByFullName = findCharacterByFullName;
    window.getLivingCharacters = getLivingCharacters;
    window.getDeceasedCharacters = getDeceasedCharacters;
    window.getCharactersByGender = getCharactersByGender;
    window.getCharactersByRole = getCharactersByRole;
    window.getCharactersByLocation = getCharactersByLocation;
    window.getCharactersByAgeRange = getCharactersByAgeRange;
    window.getCharactersByProfession = getCharactersByProfession;
    window.getCharactersByBirthDecade = getCharactersByBirthDecade;
    window.getCharactersBornInYearRange = getCharactersBornInYearRange;
})();
