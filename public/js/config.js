document.addEventListener('DOMContentLoaded', function() {
    let shifts = [];
    const shiftModal = new bootstrap.Modal(document.getElementById('shift-modal'));
    
    // Initialize the configuration page
    function initConfigPage() {
        loadConfig();
        
        // Set up event listeners
        document.getElementById('config-form').addEventListener('submit', saveConfig);
        document.getElementById('add-shift-btn').addEventListener('click', openAddShiftModal);
        document.getElementById('save-shift-btn').addEventListener('click', saveShift);
    }
    
    // Load the current configuration from the server
    function loadConfig() {
        fetch('/config')
            .then(response => response.json())
            .then(config => {
                // Set the timezone dropdown
                if (config.timezone) {
                    document.getElementById('timezone').value = config.timezone;
                }
                
                // Load shifts if they exist
                shifts = config.shifts || [];
                renderShifts();
            })
            .catch(error => {
                console.error('Error loading configuration:', error);
                alert('Failed to load configuration. Please try refreshing the page.');
            });
    }
    
    // Render the shifts table
    function renderShifts() {
        const tableBody = document.getElementById('shifts-table-body');
        tableBody.innerHTML = '';
        
        shifts.forEach((shift, index) => {
            // Calculate shift duration
            const startTime = timeStringToMinutes(shift.startTime);
            let endTime = timeStringToMinutes(shift.endTime);
            
            // Handle overnight shifts
            if (endTime < startTime) {
                endTime += 24 * 60; // Add 24 hours in minutes
            }
            
            const durationMinutes = endTime - startTime;
            const hours = Math.floor(durationMinutes / 60);
            const minutes = durationMinutes % 60;
            const duration = `${hours}h ${minutes.toString().padStart(2, '0')}m`;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${shift.name}</td>
                <td>${shift.startTime}</td>
                <td>${shift.endTime}</td>
                <td>${duration}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-shift" data-index="${index}">
                        Edit
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-shift" data-index="${index}">
                        Delete
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add event listeners to the edit and delete buttons
        document.querySelectorAll('.edit-shift').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                openEditShiftModal(index);
            });
        });
        
        document.querySelectorAll('.delete-shift').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                deleteShift(index);
            });
        });
    }
    
    // Convert time string (HH:MM) to minutes since midnight
    function timeStringToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    // Open the modal to add a new shift
    function openAddShiftModal() {
        document.getElementById('shift-modal-label').textContent = 'Add New Shift';
        document.getElementById('shift-form').reset();
        document.getElementById('shift-index').value = -1;
        shiftModal.show();
    }
    
    // Open the modal to edit an existing shift
    function openEditShiftModal(index) {
        const shift = shifts[index];
        document.getElementById('shift-modal-label').textContent = 'Edit Shift';
        document.getElementById('shift-name').value = shift.name;
        document.getElementById('shift-start').value = shift.startTime;
        document.getElementById('shift-end').value = shift.endTime;
        document.getElementById('shift-index').value = index;
        shiftModal.show();
    }
    
    // Save a new or edited shift
    function saveShift() {
        const shiftIndex = parseInt(document.getElementById('shift-index').value);
        const shiftName = document.getElementById('shift-name').value;
        const startTime = document.getElementById('shift-start').value;
        const endTime = document.getElementById('shift-end').value;
        
        if (!shiftName || !startTime || !endTime) {
            alert('Please fill in all fields.');
            return;
        }
        
        const shiftData = {
            name: shiftName,
            startTime: startTime,
            endTime: endTime
        };
        
        if (shiftIndex === -1) {
            // Add new shift
            shifts.push(shiftData);
        } else {
            // Update existing shift
            shifts[shiftIndex] = shiftData;
        }
        
        renderShifts();
        shiftModal.hide();
        
        // Show temporary save notification
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = 'Shift saved. Don\'t forget to save the configuration!';
        setTimeout(() => {
            saveStatus.textContent = '';
        }, 3000);
    }
    
    // Delete a shift
    function deleteShift(index) {
        if (confirm('Are you sure you want to delete this shift?')) {
            shifts.splice(index, 1);
            renderShifts();
            
            // Show temporary delete notification
            const saveStatus = document.getElementById('save-status');
            saveStatus.textContent = 'Shift deleted. Don\'t forget to save the configuration!';
            setTimeout(() => {
                saveStatus.textContent = '';
            }, 3000);
        }
    }
    
    // Save the entire configuration to the server
    function saveConfig(event) {
        event.preventDefault();
        
        const timezone = document.getElementById('timezone').value;
        
        const config = {
            timezone: timezone,
            shifts: shifts
        };
        
        fetch('/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(result => {
            const saveStatus = document.getElementById('save-status');
            saveStatus.textContent = 'Configuration saved successfully!';
            setTimeout(() => {
                saveStatus.textContent = '';
            }, 3000);
        })
        .catch(error => {
            console.error('Error saving configuration:', error);
            alert('Failed to save configuration. Please try again.');
        });
    }
    
    // Initialize the page when the document is loaded
    initConfigPage();
});