/**
 * =============================================================================
 * MAIN ANNUAL PROCESSING - Complete year update
 * =============================================================================
 */

function processFullAnnualUpdate(year) {
    var results = {
        year: year,
        timestamp: Date.now(),
        residence: null,
        characters: null,
        households: null,
        // ... other systems
    };

    // 1. Process residence updates
    if (typeof window.processAnnualResidenceUpdate === 'function') {
        try {
            results.residence = window.processAnnualResidenceUpdate(year, { silent: true });
        } catch (e) {
            // Handle error
        }
    }

    // 2. Process character aging (if exists)
    if (typeof window.processAnnualCharacterUpdate === 'function') {
        try {
            results.characters = window.processAnnualCharacterUpdate(year);
        } catch (e) {
            // Handle error
        }
    }

    // 3. Process household updates (if exists)
    if (typeof window.processAnnualHouseholdUpdate === 'function') {
        try {
            results.households = window.processAnnualHouseholdUpdate(year);
        } catch (e) {
            // Handle error
        }
    }

    // 4. Save all changes
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }

    // 5. Show summary notification
    var messages = [];
    if (results.residence && results.residence.vacancy) {
        var v = results.residence.vacancy;
        if (v.becameVacant && v.becameVacant.length > 0) {
            messages.push(v.becameVacant.length + ' residences became vacant');
        }
        if (v.becameOccupied && v.becameOccupied.length > 0) {
            messages.push(v.becameOccupied.length + ' residences became occupied');
        }
    }
    if (results.residence && results.residence.condition && results.residence.condition.updated) {
        var updated = results.residence.condition.updated.length;
        if (updated > 0) {
            messages.push(updated + ' residences changed condition');
        }
    }

    if (messages.length > 0 && typeof window.showToast === 'function') {
        window.showToast('Year ' + year + ' Update: ' + messages.join(' · '), 'info');
    }

    return results;
}

// Expose the combined function
window.processFullAnnualUpdate = processFullAnnualUpdate;
