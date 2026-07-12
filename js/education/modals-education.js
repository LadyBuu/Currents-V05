    // =========================================================================
    // 18. EDIT CURRICULUM MODAL (UPDATED with role filtering)
    // =========================================================================

    function openEditCurriculumModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentCurriculum = inst.curriculum || [];
            var specializationCategory = inst.specializationCategory || null;
            var allRoles = _getAllRoles();
            var allSubjects = _getAllSubjects();

            var gearIcon = _getIcon('GEAR');
            var crossIcon = _getIcon('X_HEAVY');

            // ================================================================
            // Filter roles by specialization category
            // ================================================================
            var filteredRoles = allRoles;
            if (specializationCategory) {
                filteredRoles = allRoles.filter(function(r) {
                    return r.category === specializationCategory;
                });
            }

            // Build role options
            var roleOptions = filteredRoles.map(function(r) {
                var checked = currentCurriculum.some(function(c) {
                    return c.type === 'role' && c.id === r.id;
                });
                var icon = r.icon || '◉';
                return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:0.6rem;">' +
                    '<input type="checkbox" class="curriculum-role-cb" value="' + r.id + '" ' + (checked ? 'checked' : '') + '>' +
                    icon + ' ' + _escapeHtml(r.name) +
                    (r.category ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + r.category + ')</span>' : '') +
                    '</label>';
            }).join('');

            if (filteredRoles.length === 0) {
                roleOptions = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">' +
                    (specializationCategory ? 'No roles found in category "' + specializationCategory + '"' : 'No roles available') +
                    '</div>';
            }

            // Subject categories
            var subjectCategories = {
                academic: { label: 'Academic Subjects', icon: '⌇' },
                science: { label: 'Sciences', icon: '⌇' },
                humanities: { label: 'Humanities', icon: '⌇' },
                social: { label: 'Social Sciences', icon: '⌇' },
                professional: { label: 'Professional Studies', icon: '⌇' },
                arts: { label: 'Arts', icon: '⌇' },
                legal: { label: 'Legal', icon: '⌇' },
                religious: { label: 'Religious', icon: '⌆' },
                language: { label: 'Languages', icon: '⌇' },
                military: { label: 'Military', icon: '⚔' },
                craft: { label: 'Craft', icon: '⌇' },
                commercial: { label: 'Commercial', icon: '⌇' }
            };

            var subjectHtml = '';
            var groupedSubjects = {};

            var allSubjectsKeys = Object.keys(allSubjects);
            for (var i = 0; i < allSubjectsKeys.length; i++) {
                var key = allSubjectsKeys[i];
                var subject = allSubjects[key];
                var category = subject.category || 'academic';
                if (!groupedSubjects[category]) {
                    groupedSubjects[category] = [];
                }
                groupedSubjects[category].push(subject);
            }

            var categoryOrder = ['academic', 'science', 'humanities', 'social', 'professional', 'arts', 'legal', 'religious', 'language', 'military', 'craft', 'commercial'];

            for (var ci = 0; ci < categoryOrder.length; ci++) {
                var cat = categoryOrder[ci];
                if (groupedSubjects[cat]) {
                    var catInfo = subjectCategories[cat] || { label: cat.charAt(0).toUpperCase() + cat.slice(1), icon: '⌇' };
                    subjectHtml += '<div style="margin-bottom:8px;">';
                    subjectHtml += '<div style="font-size:0.55rem;color:var(--accent);margin-bottom:4px;">' + catInfo.icon + ' ' + catInfo.label + '</div>';
                    subjectHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';

                    for (var si = 0; si < groupedSubjects[cat].length; si++) {
                        var s = groupedSubjects[cat][si];
                        var checked = currentCurriculum.some(function(c) {
                            return c.type === 'subject' && c.id === s.id;
                        });
                        subjectHtml += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.55rem;background:var(--bg2);padding:2px 8px;border-radius:12px;border:1px solid ' + (checked ? 'var(--accent)' : 'var(--border)') + ';">' +
                            '<input type="checkbox" class="curriculum-subject-cb" value="' + s.id + '" ' + (checked ? 'checked' : '') + '>' +
                            _escapeHtml(s.name) +
                            '</label>';
                    }

                    subjectHtml += '</div></div>';
                }
            }

            // Custom subjects
            var customSubjects = currentCurriculum.filter(function(c) {
                return c.type === 'custom';
            });
            var customSubjectsHtml = customSubjects.map(function(c, idx) {
                return '<div class="custom-subject-item" data-index="' + idx + '" style="display:flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:12px;border:1px solid var(--border);font-size:0.55rem;">' +
                    '<span>✎ ' + _escapeHtml(c.name) + '</span>' +
                    '<button class="remove-custom-subject-btn" data-index="' + idx + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.5rem;padding:0 2px;">' + crossIcon + '</button>' +
                    '</div>';
            }).join('');

            // Show warning if specialization category is set
            var specializationWarning = '';
            if (specializationCategory) {
                specializationWarning = '<div style="padding:8px;background:rgba(200,112,64,0.15);border:1px solid var(--warn);border-radius:6px;margin-bottom:12px;font-size:0.55rem;">' +
                    'This institution is specialized in <strong>' + specializationCategory + '</strong>. Only roles from this category can be added to the curriculum.' +
                    '</div>';
            }

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                gearIcon + ' Editing curriculum for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + currentCurriculum.length + ' items currently in curriculum</div>' +
                (specializationCategory ? '<div style="font-size:0.6rem;color:var(--accent);margin-top:4px;">Specialized: ' + specializationCategory + '</div>' : '') +
                '</div>' +

                specializationWarning +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">◉ Roles (Professions)</div>' +
                '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:150px;overflow-y:auto;">' +
                roleOptions +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Select roles that this institution teaches</small>' +
                '</div>' +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Subjects (Academic Disciplines)</div>' +
                '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--border);max-height:250px;overflow-y:auto;">' +
                subjectHtml +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Select academic subjects taught at this institution</small>' +
                '</div>' +

                '<div style="margin-bottom:16px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">✎ Custom Subjects</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                '<input type="text" id="customSubjectInput" placeholder="Enter custom subject name..." style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                '<button id="addCustomSubjectBtn" class="btn small" style="padding:4px 12px;font-size:0.5rem;">Add</button>' +
                '</div>' +
                '<div id="customSubjectsContainer" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                (customSubjectsHtml || '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>') +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Add any subject not in the lists above</small>' +
                '</div>';

            _openModal({
                title: gearIcon + ' Edit Curriculum: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Curriculum',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newCurriculum = [];

                    var roleCheckboxes = document.querySelectorAll('.curriculum-role-cb:checked');
                    for (var i = 0; i < roleCheckboxes.length; i++) {
                        var roleId = roleCheckboxes[i].value;
                        var role = _getRoleById(roleId);
                        if (role) {
                            newCurriculum.push({
                                type: 'role',
                                id: roleId,
                                name: role.name,
                                icon: role.icon || '◉',
                                baseLearnRate: 10
                            });
                        }
                    }

                    var subjectCheckboxes = document.querySelectorAll('.curriculum-subject-cb:checked');
                    for (var i = 0; i < subjectCheckboxes.length; i++) {
                        var subjectId = subjectCheckboxes[i].value;
                        var subject = allSubjects[subjectId];
                        if (subject) {
                            newCurriculum.push({
                                type: 'subject',
                                id: subjectId,
                                name: subject.name,
                                icon: subject.icon || '⌇',
                                baseLearnRate: 10,
                                category: subject.category
                            });
                        }
                    }

                    var customItems = document.querySelectorAll('.custom-subject-item');
                    for (var i = 0; i < customItems.length; i++) {
                        var name = customItems[i].textContent.replace('✎', '').trim();
                        if (name) {
                            newCurriculum.push({
                                type: 'custom',
                                id: 'custom_' + Date.now() + '_' + i,
                                name: name,
                                icon: '✎',
                                baseLearnRate: 10,
                                isCustom: true
                            });
                        }
                    }

                    var taughtRoles = newCurriculum.filter(function(c) { return c.type === 'role'; }).map(function(c) { return c.id; });

                    var updates = {
                        curriculum: newCurriculum,
                        taughtRoles: taughtRoles,
                        isSpecialized: !!specializationCategory && taughtRoles.length > 0
                    };

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        _showToast('Curriculum updated for ' + inst.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update curriculum', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var addBtn = document.getElementById('addCustomSubjectBtn');
                var input = document.getElementById('customSubjectInput');
                var container = document.getElementById('customSubjectsContainer');

                if (addBtn && input && container) {
                    var addCustomSubject = function() {
                        var name = input.value.trim();
                        if (!name) return;

                        var existing = container.querySelectorAll('.custom-subject-item');
                        for (var i = 0; i < existing.length; i++) {
                            if (existing[i].textContent.replace('✎', '').trim() === name) {
                                _showToast('Subject already exists', 'warning');
                                return;
                            }
                        }

                        var index = container.querySelectorAll('.custom-subject-item').length;
                        var item = document.createElement('div');
                        item.className = 'custom-subject-item';
                        item.dataset.index = index;
                        item.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:12px;border:1px solid var(--border);font-size:0.55rem;';
                        item.innerHTML = '<span>✎ ' + _escapeHtml(name) + '</span>' +
                            '<button class="remove-custom-subject-btn" data-index="' + index + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.5rem;padding:0 2px;">' + crossIcon + '</button>';

                        var emptyMsg = container.querySelector('span[style]');
                        if (emptyMsg && emptyMsg.textContent === 'No custom subjects added') {
                            container.innerHTML = '';
                        }

                        container.appendChild(item);
                        input.value = '';

                        item.querySelector('.remove-custom-subject-btn').addEventListener('click', function(e) {
                            e.stopPropagation();
                            var parent = this.closest('.custom-subject-item');
                            if (parent) parent.remove();
                            if (container.querySelectorAll('.custom-subject-item').length === 0) {
                                container.innerHTML = '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>';
                            }
                        });
                    };

                    addBtn.onclick = addCustomSubject;
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomSubject();
                        }
                    });

                    container.querySelectorAll('.remove-custom-subject-btn').forEach(function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var parent = this.closest('.custom-subject-item');
                            if (parent) parent.remove();
                            if (container.querySelectorAll('.custom-subject-item').length === 0) {
                                container.innerHTML = '<span style="color:var(--dim);font-size:0.5rem;padding:4px;">No custom subjects added</span>';
                            }
                        });
                    });
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 19. ENROLL STUDENT MODAL (unchanged, works with updated data)
    // =========================================================================

    function openEnrollStudentModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentYear = _getCurrentYear();
            var isPublic = inst.ownershipType === 'public';

            var tuitionResult = _calculateTuition(institutionId, currentYear);
            var tuitionInfo = isPublic ? 'Free (Public school)' :
                (inst.waiveTuition ? 'Free (Tuition waived)' :
                (tuitionResult.success ? tuitionResult.tuition + ' gold/year' : 'Not available'));

            var eligibleStudents = _getEligibleStudents(inst.locationId, 7, 16, institutionId);

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            if (eligibleStudents.length === 0) {
                _showToast('No eligible students available for enrollment', 'error');
                return;
            }

            var studentOptions = eligibleStudents.map(function(e) {
                var char = e.character;
                var age = e.age;
                var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
                return '<option value="' + char.id + '">' + personIcon + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' (' + age + 'y ' + genderSymbol + ')</option>';
            }).join('');

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                'Enroll student in <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + infoIcon + ' ' + (inst.students ? inst.students.length : 0) + ' of ' + (inst.maxStudents || 30) + ' capacity</div>' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-top:4px;padding:4px 8px;background:var(--bg3);border-radius:4px;">' +
                'Tuition: ' + tuitionInfo +
                (isPublic ? ' (Funded by settlement)' : '') +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Student</label>' +
                '<select id="enrollStudentSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                studentOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Enrollment Year</label>' +
                '<input type="number" id="enrollYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + infoIcon + ' Notes (optional)</label>' +
                '<textarea id="enrollNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" placeholder="e.g., Scholarship, Recommended by..."></textarea>' +
                '</div>';

            _openModal({
                title: 'Enroll Student',
                content: modalContent,
                confirmText: 'Enroll',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var studentId = document.getElementById('enrollStudentSelect').value;
                    var year = parseInt(document.getElementById('enrollYear').value);
                    var notes = document.getElementById('enrollNotes').value;

                    if (!studentId) {
                        _showToast('Please select a student', 'error');
                        return false;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _enrollStudent(institutionId, studentId, year);

                    if (result) {
                        var student = _getCharacterById(studentId);
                        var tuitionMsg = isPublic ? ' (Free - Public)' : (inst.waiveTuition ? ' (Tuition waived)' : '');
                        _showToast((student ? student.name : 'Student') + ' enrolled' + tuitionMsg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to enroll student', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 20. HIRE TEACHER MODAL (UPDATED - NO SKILL)
    // =========================================================================

    function openHireTeacherModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var allChars = _getCharacters();
            var teacherIds = {};
            if (inst.teachers) {
                for (var i = 0; i < inst.teachers.length; i++) {
                    teacherIds[inst.teachers[i].teacherId] = true;
                }
            }

            var eligibleTeachers = [];
            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                if (c.isDeceased) continue;
                if (teacherIds[c.id]) continue;
                if (!c.professions || c.professions.length === 0) continue;
                eligibleTeachers.push(c);
            }

            var gearIcon = _getIcon('GEAR');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            if (eligibleTeachers.length === 0) {
                _showToast('No eligible teachers available', 'error');
                return;
            }

            var teacherOptions = eligibleTeachers.map(function(c) {
                var age = _calculateAge(c.birthYear, false, null);
                var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                var professionNames = (c.professions || []).map(function(p) { return p.name; }).join(', ');
                return '<option value="' + c.id + '" data-professions="' + _escapeHtml(professionNames) + '">' +
                    personIcon + ' ' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') +
                    ' (' + age + 'y ' + genderSymbol + ') - ' + _escapeHtml(professionNames) +
                    '</option>';
            }).join('');

            var curriculumItems = inst.curriculum || [];
            var subjectOptions = curriculumItems.map(function(item) {
                var icon = item.icon || (item.type === 'role' ? '◉' : '⌇');
                return '<option value="' + item.id + '">' + icon + ' ' + _escapeHtml(item.name) + ' (' + item.type + ')</option>';
            }).join('');

            if (!subjectOptions) {
                subjectOptions = '<option value="">No curriculum subjects available</option>';
            }

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                'Hire teacher for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + infoIcon + ' ' + (inst.teachers ? inst.teachers.length : 0) + ' teachers currently hired</div>' +
                '<div style="font-size:0.55rem;color:var(--accent);margin-top:4px;">No skill check required - teachers are hired based on their profession</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Teacher</label>' +
                '<select id="hireTeacherSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                teacherOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + gearIcon + ' Subject to Teach</label>' +
                '<select id="hireSubjectSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                subjectOptions +
                '</select>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                infoIcon + ' If the subject is a role, the teacher must have that profession. No skill level requirement.' +
                '</div>';

            _openModal({
                title: 'Hire Teacher',
                content: modalContent,
                confirmText: 'Hire',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var teacherId = document.getElementById('hireTeacherSelect').value;
                    var subjectId = document.getElementById('hireSubjectSelect').value;

                    if (!teacherId) {
                        _showToast('Please select a teacher', 'error');
                        return false;
                    }

                    if (!subjectId) {
                        _showToast('Please select a subject', 'error');
                        return false;
                    }

                    // No skill parameter - removed
                    var result = _hireTeacher(institutionId, teacherId, subjectId);

                    if (result) {
                        var teacher = _getCharacterById(teacherId);
                        _showToast((teacher ? teacher.name : 'Teacher') + ' hired', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to hire teacher', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 21. SET HEADMASTER MODAL (unchanged)
    // =========================================================================

    function openSetHeadmasterModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentHeadmaster = institution.headmaster || null;
            var allChars = _getCharacters();
            var currentYear = _getCurrentYear();

            var eligible = [];
            var currentHeadmasterId = currentHeadmaster ? currentHeadmaster.details.characterId : null;

            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                if (c.isDeceased) continue;
                if (currentHeadmasterId && c.id === currentHeadmasterId) continue;
                eligible.push(c);
            }

            var crownIcon = _getIcon('CROWN');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var headmasterOptions = eligible.map(function(c) {
                var age = _calculateAge(c.birthYear, false, null);
                var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                var rank = c.activeRankId && typeof window.getRankById === 'function' ? window.getRankById(c.activeRankId) : null;
                var rankDisplay = rank ? rank.symbol + ' ' : '';
                return '<option value="' + c.id + '">' + rankDisplay + personIcon + ' ' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + ' (' + age + 'y ' + genderSymbol + ')</option>';
            }).join('');

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                crownIcon + ' Appoint Headmaster for <strong>' + _escapeHtml(inst.name) + '</strong>' +
                (currentHeadmaster ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current: ' + _escapeHtml(currentHeadmaster.details.name) + ' (' + _escapeHtml(currentHeadmaster.details.title || 'Headmaster') + ' since ' + currentHeadmaster.details.startYear + ')</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Select Headmaster</label>' +
                '<select id="headmasterSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<option value="">' + infoIcon + ' Select a character</option>' +
                headmasterOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Title</label>' +
                '<input type="text" id="headmasterTitle" value="Headmaster" placeholder="e.g., Dean, Rector, Principal" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="headmasterStartYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                (currentHeadmaster ?
                    '<div style="margin-top:12px;padding:12px;background:rgba(200,112,64,0.1);border-radius:6px;border:1px solid var(--warn);">' +
                    '<button id="endHeadmasterTermBtn" class="btn small danger" style="background:#8a5a20;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">End Current Headmaster\'s Term</button>' +
                    '<span style="font-size:0.5rem;color:var(--dim);margin-left:8px;">This will end the current headmaster\'s term</span>' +
                    '</div>' :
                    ''
                );

            _openModal({
                title: crownIcon + ' Appoint Headmaster',
                content: modalContent,
                confirmText: 'Appoint',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var characterId = document.getElementById('headmasterSelect').value;
                    var title = document.getElementById('headmasterTitle').value.trim();
                    var startYear = parseInt(document.getElementById('headmasterStartYear').value);

                    if (!characterId) {
                        _showToast('Please select a headmaster', 'error');
                        return false;
                    }

                    if (!title) {
                        _showToast('Please enter a title', 'error');
                        return false;
                    }

                    if (isNaN(startYear) || startYear < 1) {
                        _showToast('Please enter a valid start year', 'error');
                        return false;
                    }

                    var result = _setHeadmaster(institutionId, characterId, title, startYear);

                    if (result) {
                        var character = _getCharacterById(characterId);
                        _showToast((character ? character.name : 'Character') + ' appointed as ' + title, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to appoint headmaster', 'error');
                    }
                    return true;
                }
            });

            setTimeout(function() {
                var endBtn = document.getElementById('endHeadmasterTermBtn');
                if (endBtn) {
                    endBtn.onclick = function() {
                        _confirmDialog('End the current headmaster\'s term?', 'End Term', function() {
                            var endYear = _getCurrentYear();
                            var result = _endHeadmasterTerm(institutionId, endYear, 'Term ended');
                            if (result) {
                                _showToast('Headmaster term ended', 'success');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast('Failed to end term', 'error');
                            }
                        });
                    };
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 22. DELETE INSTITUTION MODAL (unchanged)
    // =========================================================================

    function openDeleteInstitutionModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var students = institution.students || [];
            var teachers = institution.teachers || [];
            var graduates = institution.graduates || [];

            var warningIcon = _getIcon('WARNING');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent = 
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                '<strong>' + warningIcon + ' Warning: This action cannot be undone!</strong>' +
                '<div style="margin-top:8px;">You are about to delete the institution "<strong>' + _escapeHtml(inst.name) + '</strong>".</div>' +
                (students.length > 0 ? '<div style="margin-top:8px;">' + infoIcon + ' ' + students.length + ' students enrolled</div>' : '') +
                (teachers.length > 0 ? '<div style="margin-top:4px;">' + infoIcon + ' ' + teachers.length + ' teachers hired</div>' : '') +
                (graduates.length > 0 ? '<div style="margin-top:4px;">' + infoIcon + ' ' + graduates.length + ' graduates</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Type "<strong>' + _escapeHtml(inst.name) + '</strong>" to confirm</label>' +
                '<input type="text" id="confirmDeleteInstName" placeholder="Enter institution name" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;">' +
                '<input type="checkbox" id="deleteCascade">' +
                '<span style="font-size:0.65rem;">' + infoIcon + ' Also delete associated data (student records, teacher records)</span>' +
                '</label>' +
                '<small style="font-size:0.5rem;color:var(--dim);">If unchecked, student and teacher records will be preserved</small>' +
                '</div>' +

                '<div style="margin-top:12px;padding:8px;background:rgba(200,68,68,0.1);border-radius:6px;font-size:0.55rem;color:#8a3020;">' +
                'This action cannot be undone. The institution will be permanently removed.' +
                '</div>';

            _openModal({
                title: 'Delete Institution: ' + inst.name,
                content: modalContent,
                confirmText: 'Permanently Delete',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var confirmName = document.getElementById('confirmDeleteInstName').value.trim();
                    if (confirmName !== inst.name) {
                        _showToast('Institution name does not match', 'error');
                        return false;
                    }

                    var cascade = document.getElementById('deleteCascade').checked;
                    var success = _deleteInstitution(institutionId, cascade);

                    if (success) {
                        _showToast('Institution "' + inst.name + '" deleted', 'info');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete institution', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 23. TUITION MANAGEMENT MODAL (unchanged)
    // =========================================================================

    function openTuitionManagementModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var currentYear = _getCurrentYear();
            var isPublic = inst.ownershipType === 'public';

            var tuitionResult = _calculateTuition(institutionId, currentYear);
            var currentTuition = isPublic ? 'Free (Public)' :
                (inst.waiveTuition ? 'Waived' :
                (inst.customTuition !== null ? inst.customTuition + ' gold (Manual)' :
                (tuitionResult.success ? tuitionResult.tuition + ' gold' : 'Unknown')));

            var tuitionHistory = _getTuitionHistory(institutionId, 10);
            var historyHtml = '';
            if (tuitionHistory && tuitionHistory.length > 0) {
                historyHtml = tuitionHistory.map(function(h) {
                    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.55rem;">' +
                        '<span>' + h.year + '</span>' +
                        '<span>' + h.oldAmount + ' → ' + h.newAmount + '</span>' +
                        '<span style="color:var(--dim);font-size:0.5rem;">' + _escapeHtml(h.reason || '') + '</span>' +
                        '</div>';
                }).join('');
            }

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="font-size:0.7rem;"><strong>' + _escapeHtml(inst.name) + '</strong></div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current tuition: <strong>' + currentTuition + '</strong></div>' +
                (isPublic ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:2px;">This is a public school. Tuition is always free.</div>' :
                (inst.waiveTuition ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:2px;">Tuition is currently waived for all students</div>' : '')) +
                '</div>' +

                (isPublic ?
                    '<div style="padding:12px;background:var(--bg3);border-radius:6px;text-align:center;color:var(--dim);font-size:0.6rem;">' +
                    'Public schools are funded by the settlement. Tuition is always free (0 gold).' +
                    '<br><small>To charge tuition, change ownership to Private in the Ownership management modal.</small>' +
                    '</div>' :
                    '<div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Base Tuition (gold/year)</label>' +
                    '<input type="number" id="tuitionBase" value="' + (inst.tuitionPerYear || 0) + '" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Base tuition before modifiers. Changes will be recorded in history.</small>' +
                    '</div>' +

                    '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Manual Override</label>' +
                    '<input type="number" id="tuitionOverride" placeholder="Leave empty for calculated" min="0" max="200" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);" value="' + (inst.customTuition !== null ? inst.customTuition : '') + '">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Set a fixed amount. Leave empty to use calculated value.</small>' +
                    '</div>' +

                    '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="tuitionWaive" ' + (inst.waiveTuition ? 'checked' : '') + '>' +
                    '<span>Waive tuition for all students</span>' +
                    '</label>' +
                    '</div>' +

                    '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason for Change</label>' +
                    '<input type="text" id="tuitionReason" placeholder="e.g., Inflation, Scholarship program..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '</div>' +

                    (historyHtml ?
                        '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Tuition History</div>' +
                        '<div style="max-height:150px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:6px;">' +
                        historyHtml +
                        '</div>' +
                        '</div>' : ''
                    ) +

                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                    'Changes to tuition will affect all future enrollments. Existing students\' tuition history is preserved.' +
                    '</div>' +
                    '</div>'
                );

            _openModal({
                title: 'Tuition Management: ' + inst.name,
                content: modalContent,
                confirmText: isPublic ? 'Close' : 'Save Tuition Settings',
                cancelText: isPublic ? '' : 'Cancel',
                onConfirm: function() {
                    if (isPublic) {
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) onSuccess();
                        return true;
                    }

                    var baseTuition = parseInt(document.getElementById('tuitionBase').value) || 0;
                    var overrideValue = document.getElementById('tuitionOverride').value;
                    var waiveTuition = document.getElementById('tuitionWaive').checked;
                    var reason = document.getElementById('tuitionReason').value || 'Manual update';

                    var updates = {
                        tuitionPerYear: baseTuition,
                        waiveTuition: waiveTuition,
                        tuitionReason: reason
                    };

                    if (overrideValue !== null && overrideValue !== '') {
                        var customVal = parseInt(overrideValue);
                        if (!isNaN(customVal)) {
                            updates.customTuition = customVal;
                        }
                    } else {
                        updates.customTuition = null;
                    }

                    // Update base tuition
                    if (inst.tuitionPerYear !== baseTuition) {
                        if (!inst.tuitionHistory) inst.tuitionHistory = [];
                        inst.tuitionHistory.push({
                            year: currentYear,
                            oldAmount: inst.tuitionPerYear || 0,
                            newAmount: baseTuition,
                            reason: reason
                        });
                        if (inst.tuitionHistory.length > 20) {
                            inst.tuitionHistory = inst.tuitionHistory.slice(-20);
                        }
                    }

                    var result = _updateInstitution(institutionId, updates);

                    if (result) {
                        var msg = 'Tuition updated: ';
                        msg += waiveTuition ? 'Waived' : (baseTuition + ' gold/year');
                        if (updates.customTuition !== null) {
                            msg += ' (Manual override: ' + updates.customTuition + ')';
                        }
                        _showToast(msg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update tuition', 'error');
                    }
                    return true;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening tuition management modal', 'error');
        }
    }

    // =========================================================================
    // 24. OWNERSHIP MANAGEMENT MODAL (unchanged)
    // =========================================================================

    function openOwnershipManagementModal(institutionId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return;
            }

            var inst = institution.institution || institution;
            var isPublic = inst.ownershipType === 'public';
            var isPrivate = inst.ownershipType === 'private';

            var infoIcon = _getIcon('CIRCLE_DOT');

            var fundingDisplay = 'N/A';
            var profitDisplay = 'N/A';
            if (isPublic) {
                var fundingResult = _calculatePublicSchoolFunding(institutionId, _getCurrentYear());
                if (fundingResult && fundingResult.success) {
                    fundingDisplay = fundingResult.funding + ' gold/year (' + fundingResult.studentCount + ' students)';
                }
            }
            if (isPrivate) {
                var profitResult = _calculatePrivateSchoolProfit(institutionId, _getCurrentYear());
                if (profitResult && profitResult.success) {
                    profitDisplay = profitResult.profit + ' gold/year (Income: ' + profitResult.income + ', Expenses: ' + profitResult.expenses + ')';
                }
            }

            var modalContent = 
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="font-size:0.7rem;"><strong>' + _escapeHtml(inst.name) + '</strong></div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">Current ownership: <strong>' + (isPublic ? 'Public' : 'Private') + '</strong></div>' +
                (isPrivate ? '<div style="font-size:0.55rem;color:var(--accent);">Owner: ' + _escapeHtml(inst.ownerName || 'None') + '</div>' : '') +
                '</div>' +

                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">Financial Impact</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.55rem;">' +
                '<div><span style="color:var(--dim);">Type:</span> ' + (isPublic ? 'Public (Government funded)' : 'Private (Tuition funded)') + '</div>' +
                '<div><span style="color:var(--dim);">' + (isPublic ? 'Funding:' : 'Profit:') + '</span> ' + (isPublic ? fundingDisplay : profitDisplay) + '</div>' +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Change Ownership</label>' +
                '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="radio" name="mgmtOwnershipType" id="mgmtInstOwnershipPublic" value="public" ' + (isPublic ? 'checked' : '') + ' style="cursor:pointer;">' +
                '<span>Public (Free tuition, government funded)</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;cursor:pointer;">' +
                '<input type="radio" name="mgmtOwnershipType" id="mgmtInstOwnershipPrivate" value="private" ' + (isPrivate ? 'checked' : '') + ' style="cursor:pointer;">' +
                '<span>Private (Tuition funded, owner receives profit)</span>' +
                '</label>' +
                '</div>' +
                '</div>' +

                '<div id="mgmtInstOwnerSection" style="' + (isPrivate ? 'display:block;' : 'display:none;') + 'margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
                '<input type="radio" name="mgmtOwnerType" id="mgmtInstOwnerCharacter" value="character" ' + (inst.ownerType === 'character' ? 'checked' : '') + ' style="cursor:pointer;">' +
                '<span>Character</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.6rem;cursor:pointer;">' +
                '<input type="radio" name="mgmtOwnerType" id="mgmtInstOwnerHousehold" value="household" ' + (inst.ownerType === 'household' ? 'checked' : '') + ' style="cursor:pointer;">' +
                '<span>Household</span>' +
                '</label>' +
                '</div>' +
                '<div style="display:flex;gap:8px;">' +
                '<input type="text" id="mgmtInstOwnerName" value="' + _escapeHtml(inst.ownerName || '') + '" readonly style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;color:var(--text);cursor:pointer;">' +
                '<input type="hidden" id="mgmtInstOwnerId" value="' + (inst.ownerId || '') + '">' +
                '<button id="mgmtInstSelectOwnerBtn" class="btn small" style="padding:4px 10px;font-size:0.6rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Select</button>' +
                '<button id="mgmtInstClearOwnerBtn" class="btn small" style="padding:4px 10px;font-size:0.6rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
                '</div>' +
                '<small style="font-size:0.5rem;color:var(--dim);">Private schools must have an owner who receives the profit.</small>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:8px;">' +
                infoIcon + ' Changing ownership type will affect tuition and funding. Public schools are free. Private schools charge tuition and send profit to the owner.' +
                '</div>';

            _openModal({
                title: 'Ownership Management: ' + inst.name,
                content: modalContent,
                confirmText: 'Save Ownership Settings',
                cancelText: 'Cancel',
                onOpen: function() {
                    var publicRadio = document.getElementById('mgmtInstOwnershipPublic');
                    var privateRadio = document.getElementById('mgmtInstOwnershipPrivate');
                    var ownerSection = document.getElementById('mgmtInstOwnerSection');

                    function updateMgmtOwnershipUI() {
                        var isPublic = publicRadio.checked;
                        ownerSection.style.display = isPublic ? 'none' : 'block';
                    }

                    if (publicRadio) publicRadio.onchange = updateMgmtOwnershipUI;
                    if (privateRadio) privateRadio.onchange = updateMgmtOwnershipUI;

                    var selectOwnerBtn = document.getElementById('mgmtInstSelectOwnerBtn');
                    var clearOwnerBtn = document.getElementById('mgmtInstClearOwnerBtn');
                    var ownerNameInput = document.getElementById('mgmtInstOwnerName');
                    var ownerIdInput = document.getElementById('mgmtInstOwnerId');

                    if (selectOwnerBtn) {
                        selectOwnerBtn.onclick = function() {
                            var ownerType = document.querySelector('input[name="mgmtOwnerType"]:checked');
                            var type = ownerType ? ownerType.value : 'character';

                            if (type === 'character') {
                                _openCharacterSelectorForEducation(
                                    'Select School Owner',
                                    function(character) {
                                        if (character) {
                                            ownerNameInput.value = character.name + ' ' + (character.surname || '');
                                            ownerIdInput.value = character.id;
                                            _showToast('Selected: ' + character.name, 'success');
                                        }
                                    },
                                    { showDeceased: false }
                                );
                            } else {
                                _openHouseholdSelectorForEducation(
                                    'Select School Owner',
                                    function(household) {
                                        if (household) {
                                            ownerNameInput.value = household.name;
                                            ownerIdInput.value = household.id;
                                            _showToast('Selected: ' + household.name, 'success');
                                        }
                                    }
                                );
                            }
                        };
                    }

                    if (clearOwnerBtn) {
                        clearOwnerBtn.onclick = function() {
                            ownerNameInput.value = '';
                            ownerIdInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var ownershipType = document.querySelector('input[name="mgmtOwnershipType"]:checked');
                    var ownership = ownershipType ? ownershipType.value : 'public';

                    var ownerId = document.getElementById('mgmtInstOwnerId').value;
                    var ownerName = document.getElementById('mgmtInstOwnerName').value;
                    var ownerType = document.querySelector('input[name="mgmtOwnerType"]:checked');
                    var ownerTypeValue = ownerType ? ownerType.value : 'character';

                    if (ownership === 'private' && !ownerId) {
                        _showToast('Private schools must have an owner', 'error');
                        return false;
                    }

                    var result = _setSchoolOwnership(institutionId, ownership, ownerId || null, ownerTypeValue || null);

                    if (result && result.success) {
                        var msg = 'School ownership updated to ' + ownership;
                        if (ownership === 'private') {
                            msg += ' (Owner: ' + (ownerName || 'Unknown') + ')';
                        } else {
                            msg += ' - Free tuition enabled';
                        }
                        _showToast(msg, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast(result ? result.reason : 'Failed to update ownership', 'error');
                    }
                    return true;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening ownership management modal', 'error');
        }
    }

    // =========================================================================
    // 25. EXPORTS
    // =========================================================================

    window.openCreateInstitutionModal = openCreateInstitutionModal;
    window.openEditInstitutionModal = openEditInstitutionModal;
    window.openEditCurriculumModal = openEditCurriculumModal;
    window.openInstitutionDetailsModal = openInstitutionDetailsModal;
    window.openEnrollStudentModal = openEnrollStudentModal;
    window.openHireTeacherModal = openHireTeacherModal;
    window.openSetHeadmasterModal = openSetHeadmasterModal;
    window.openDeleteInstitutionModal = openDeleteInstitutionModal;
    window.openTuitionManagementModal = openTuitionManagementModal;
    window.openOwnershipManagementModal = openOwnershipManagementModal;
    window.openGraduateStudentModal = openGraduateStudentModal;

    // Helper functions for other modals
    window._getLocationTypeName = _getLocationTypeName;
    window._getEducationLevels = _getEducationLevels;
    window._getIconHTML = _getIconHTML;
    window._getAgeGroups = _getAgeGroups;
    window._getAgeGroupLabel = _getAgeGroupLabel;
    window._getAgeGroupIcon = _getAgeGroupIcon;

    // Legacy aliases
    window._openCreateInstitutionModal = openCreateInstitutionModal;
    window._openEditInstitutionModal = openEditInstitutionModal;
    window._openEditCurriculumModal = openEditCurriculumModal;
    window._openInstitutionDetailsModal = openInstitutionDetailsModal;
    window._openEnrollStudentModal = openEnrollStudentModal;
    window._openHireTeacherModal = openHireTeacherModal;
    window._openSetHeadmasterModal = openSetHeadmasterModal;
    window._openDeleteInstitutionModal = openDeleteInstitutionModal;
    window._openTuitionManagementModal = openTuitionManagementModal;
    window._openOwnershipManagementModal = openOwnershipManagementModal;
    window._openGraduateStudentModal = openGraduateStudentModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateInstitutionModal: openCreateInstitutionModal,
            openEditInstitutionModal: openEditInstitutionModal,
            openEditCurriculumModal: openEditCurriculumModal,
            openInstitutionDetailsModal: openInstitutionDetailsModal,
            openEnrollStudentModal: openEnrollStudentModal,
            openHireTeacherModal: openHireTeacherModal,
            openSetHeadmasterModal: openSetHeadmasterModal,
            openDeleteInstitutionModal: openDeleteInstitutionModal,
            openTuitionManagementModal: openTuitionManagementModal,
            openOwnershipManagementModal: openOwnershipManagementModal,
            openGraduateStudentModal: openGraduateStudentModal,
            _getLocationTypeName: _getLocationTypeName,
            _getEducationLevels: _getEducationLevels,
            _getIconHTML: _getIconHTML,
            _getAgeGroups: _getAgeGroups,
            _getAgeGroupLabel: _getAgeGroupLabel,
            _getAgeGroupIcon: _getAgeGroupIcon
        };
    }

})();