    function _buildIdentityBlock(summary, errors) {
        return _safe('identity', function () {
            // 1. Prefer the projection's own resolved names.
            var religionName = (typeof summary.religionName === 'string'
                && summary.religionName.length > 0)
                ? summary.religionName : null;

            var cultureName = (typeof summary.cultureName === 'string'
                && summary.cultureName.length > 0)
                ? summary.cultureName : null;

            // 2. Fallback: only if the projection did NOT carry the name.
            // Wrapped individually so a cycling query cannot take down
            // the whole identity block.
            if (_hasId(summary.religionId) && !religionName
                && window.ReligionQueries
                && typeof window.ReligionQueries.getReligion === 'function') {
                try {
                    var rel = window.ReligionQueries.getReligion(summary.religionId);
                    if (rel && typeof rel.name === 'string' && rel.name.length > 0) {
                        religionName = rel.name;
                    }
                } catch (e) { /* non-fatal */ }
            }

            if (_hasId(summary.cultureId) && !cultureName
                && window.CultureQueries
                && typeof window.CultureQueries.getCultureById === 'function') {
                try {
                    var cul = window.CultureQueries.getCultureById(summary.cultureId);
                    if (cul && typeof cul.name === 'string' && cul.name.length > 0) {
                        cultureName = cul.name;
                    }
                } catch (e) { /* non-fatal */ }
            }

            return {
                id: summary.id,
                firstName: summary.name || '',
                surname: summary.surname || '',
                fullName: summary.fullName || summary.name || '',
                surnameSource: _isMissing(summary.surnameSource)
                    ? null : summary.surnameSource,
                epithet: summary.epithet || '',
                gender: summary.gender || 'unknown',
                genderLabel: (typeof window.getGenderLabel === 'function')
                    ? window.getGenderLabel(summary.gender)
                    : (summary.gender || 'Unknown'),
                traits: Array.isArray(summary.traits) ? summary.traits.slice() : [],
                religionId: summary.religionId || null,
                religionName: religionName,
                cultureId: summary.cultureId || null,
                cultureName: cultureName
            };
        }, errors);
    }

    function _resolveBirthplaceBlock(summary) {
        if (!summary || !summary.birthplaceId) {
            return { placeId: null, placeName: null };
        }
        var placeName = null;
        try {
            // resolvePlaceName returns the raw ID if the place isn't found.
            // We explicitly check if the resolution succeeded, but we still
            // store the ID so the field doesn't disappear.
            placeName = resolvePlaceName(summary.birthplaceId);
        } catch (e) {
            placeName = summary.birthplaceId;
        }
        return {
            placeId: summary.birthplaceId,
            placeName: placeName || summary.birthplaceId
        };
    }
