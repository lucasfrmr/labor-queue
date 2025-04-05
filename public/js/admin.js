document.addEventListener("DOMContentLoaded", function () {
  let allUserData = {};
  let shifts = [];
  let appConfig = {};
  let currentShiftFilter = "all";

  // Debug function to log DOM element status
  function debugElement(id, message) {
    const element = document.getElementById(id);
    console.log(`${message || 'Element'} ${id}: ${element ? 'Found' : 'NOT FOUND'}`);
    return element;
  }

  // Add this at the beginning to debug key elements
  console.log("Admin page loaded. Checking for key elements:");
  debugElement("userList", "User list table body");
  debugElement("usersTable", "Users table");
  debugElement("shift-select", "Shift select dropdown");

  function formatMinutesToHours(minutes) {
    if (minutes >= 0) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      // Handle negative minutes correctly
      const absoluteMinutes = Math.abs(minutes);
      const hours = Math.floor(absoluteMinutes / 60);
      const mins = absoluteMinutes % 60;
      return `-${hours}h ${mins}m`;
    }
  }

  // Function to update the current time display
  function updateCurrentTime() {
    const currentTimeElement = document.getElementById("current-time");
    if (!currentTimeElement) return;

    try {
      const now = new Date();
      const options = { 
        timeZone: appConfig.timezone || "America/Chicago",
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit'
      };
      currentTimeElement.textContent = now.toLocaleString("en-US", options);

      // Update current shift and time till end of shift
      updateCurrentShiftInfo(now, currentShiftFilter);
    } catch (error) {
      console.error("Error updating time:", error);
      currentTimeElement.textContent = new Date().toLocaleString();
    }
  }

  // Determine which shift is currently active
  function updateCurrentShiftInfo(now, specificShiftName = null) {
    if (!shifts || shifts.length === 0) return;

    const currentShiftElem = document.getElementById("current-shift");
    const timeTillEndElem = document.getElementById("time-till-end");

    if (!currentShiftElem || !timeTillEndElem) return;

    // If a specific shift is provided, just show info for that shift
    if (specificShiftName && specificShiftName !== "all") {
      const selectedShift = shifts.find(shift => shift.name === specificShiftName);
      
      if (selectedShift) {
        currentShiftElem.textContent = selectedShift.name;
        
        // Calculate time till end for the selected shift based on current time
        const [startHour, startMinute] = selectedShift.startTime.split(':').map(Number);
        const [endHour, endMinute] = selectedShift.endTime.split(':').map(Number);
        
        // Get current time in the configured timezone
        const options = { timeZone: appConfig.timezone || "America/Chicago" };
        const formatter = new Intl.DateTimeFormat('en-US', { 
          hour: 'numeric', 
          minute: 'numeric', 
          hour12: false,
          timeZone: appConfig.timezone || "America/Chicago"
        });
        const timeString = formatter.format(now);
        const [currentHours, minutes] = timeString.split(':').map(Number);
        const currentTimeMinutes = currentHours * 60 + minutes;
        
        const startMinutes = startHour * 60 + startMinute;
        let endMinutes = endHour * 60 + endMinute;
        
        // Handle overnight shifts
        if (endMinutes < startMinutes) {
          endMinutes += 1440; // Add 24 hours in minutes
        }
        
        let timeTillEnd;
        
        // Determine if current time is within the shift
        if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
          // We are currently in this shift
          timeTillEnd = endMinutes - currentTimeMinutes;
        } else if (currentTimeMinutes < startMinutes) {
          // Shift hasn't started yet
          timeTillEnd = endMinutes - startMinutes; // Total shift duration
          timeTillEndElem.classList.add("text-warning");
          currentShiftElem.textContent += " (starts in " + formatMinutesToHours(startMinutes - currentTimeMinutes) + ")";
        } else {
          // Shift has ended
          timeTillEnd = (startMinutes + 1440) - currentTimeMinutes + (endMinutes - startMinutes);
          timeTillEndElem.classList.add("text-secondary");
          currentShiftElem.textContent += " (next shift)";
        }
        
        const shiftHours = Math.floor(timeTillEnd / 60);
        const shiftMins = timeTillEnd % 60;
        timeTillEndElem.textContent = `${shiftHours}h ${shiftMins}m`;
        return;
      }
    }
    
    // If we get here, either no specific shift was requested or the requested shift wasn't found
    // Reset any styling classes
    timeTillEndElem.classList.remove("text-warning", "text-secondary");
    
    // Get current hours and minutes in the specified timezone
    const options = { timeZone: appConfig.timezone || "America/Chicago" };
    const formatter = new Intl.DateTimeFormat('en-US', { 
      hour: 'numeric', 
      minute: 'numeric', 
      hour12: false,
      timeZone: appConfig.timezone || "America/Chicago"
    });
    const timeString = formatter.format(now);
    const [currentHours, currentMinutes] = timeString.split(':').map(Number);
    const currentTimeMinutes = currentHours * 60 + currentMinutes;

    let currentShift = null;
    let timeTillEnd = 0;

    for (const shift of shifts) {
      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour, endMinute] = shift.endTime.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      let endMinutes = endHour * 60 + endMinute;
      
      // Handle overnight shifts
      if (endMinutes < startMinutes) {
        endMinutes += 1440; // Add 24 hours in minutes
        
        // For overnight shifts, check if current time is after start time or before end time
        if (currentTimeMinutes >= startMinutes || currentTimeMinutes < (endHour * 60 + endMinute)) {
          currentShift = shift;
          // Calculate time till end
          if (currentTimeMinutes >= startMinutes) {
            timeTillEnd = endMinutes - currentTimeMinutes;
          } else {
            timeTillEnd = (endHour * 60 + endMinute) - currentTimeMinutes;
          }
          break;
        }
      } else {
        // Regular shift
        if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
          currentShift = shift;
          timeTillEnd = endMinutes - currentTimeMinutes;
          break;
        }
      }
    }

    if (currentShift) {
      currentShiftElem.textContent = currentShift.name;
      
      const shiftHours = Math.floor(timeTillEnd / 60);
      const shiftMins = timeTillEnd % 60;
      timeTillEndElem.textContent = `${shiftHours}h ${shiftMins}m`;
    } else {
      currentShiftElem.textContent = "None";
      timeTillEndElem.textContent = "-";
    }
  }

  // Fetch configuration data
  function fetchConfig() {
    fetch("/config")
      .then((response) => response.json())
      .then((data) => {
        appConfig = data;
        shifts = data.shifts || [];
        
        // Populate shift selectors
        populateShiftSelectors();
        
        // Start the timer to update current time
        setInterval(updateCurrentTime, 1000);
        updateCurrentTime();
      })
      .catch((error) => {
        console.error("Error loading configuration:", error);
        // If config fails to load, still set up the time update
        setInterval(updateCurrentTime, 1000);
        updateCurrentTime();
      });
  }

  // Populate all shift selectors in the UI
  function populateShiftSelectors() {
    const shiftSelect = document.getElementById("shift-select");
    const newUserShift = document.getElementById("newUserShift");
    const updateUserShift = document.getElementById("updateUserShift");
    
    // Clear existing options except the "All Shifts" option
    if (shiftSelect) {
      while (shiftSelect.options.length > 1) {
        shiftSelect.remove(1);
      }
      
      // Add shift options to the filter dropdown
      shifts.forEach(shift => {
        const option = document.createElement("option");
        option.value = shift.name;
        option.textContent = shift.name;
        shiftSelect.appendChild(option);
      });
    }
    
    // Add shifts to the new user modal
    if (newUserShift) {
      while (newUserShift.options.length > 1) {
        newUserShift.remove(1);
      }
      
      shifts.forEach(shift => {
        const option = document.createElement("option");
        option.value = shift.name;
        option.textContent = shift.name;
        newUserShift.appendChild(option);
      });
    }
    
    // Add shifts to the update user modal
    if (updateUserShift) {
      while (updateUserShift.options.length > 1) {
        updateUserShift.remove(1);
      }
      
      shifts.forEach(shift => {
        const option = document.createElement("option");
        option.value = shift.name;
        option.textContent = shift.name;
        updateUserShift.appendChild(option);
      });
    }
  }

  function fetchAndPopulateUsers() {
    console.log("Fetching user data...");
    fetch("/userdata")
      .then((response) => {
        console.log("Response received:", response.status, response.statusText);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((users) => {
        console.log("Users data received:", users);
        if (!Array.isArray(users)) {
          console.error("Expected array of users but got:", typeof users, users);
          alert("Error: Received invalid user data format from server");
          return;
        }
        
        if (users.length === 0) {
          console.log("No users found in the database");
        }
        
        allUserData = {};
        const userList = document.getElementById("userList");
        
        if (!userList) {
          console.error("Could not find userList element in the DOM");
          return;
        }
        
        console.log("Clearing and populating userList");
        userList.innerHTML = "";

        users.forEach((user, index) => {
          // Store users by their $loki ID instead of _id
          allUserData[user.$loki] = user;
          console.log(`Processing user ${index + 1}/${users.length}:`, user.name);
          
          // Skip if filtering by shift and this user doesn't match
          if (currentShiftFilter !== "all" && user.shift !== currentShiftFilter) {
            console.log(`Skipping user ${user.name} due to shift filter`);
            return;
          }
          
          const formattedTime = formatMinutesToHours(user.totalMinutes);
          const hasJob = (job) => (user.jobsTrained?.includes(job) ? "✓" : "");

          const userRow = `<tr>
                        <td class="name">${user.name}</td>
                        <td class="shift">${user.shift || "-"}</td>
                        <td class="totaltime" data-sort="${
                          user.totalMinutes
                        }">${formattedTime}</td>
                        <td class="reach">${hasJob("reach")}</td>
                        <td class="op">${hasJob("OP")}</td>
                        <td class="clamp">${hasJob("clamp")}</td>
                        <td class="relo">${hasJob("relo")}</td>
                        <td class="hau2">${hasJob("hau2")}</td>
                        <td class="actions"><button class="btn btn-primary btn-sm" onclick="openUpdateModal('${
                          user.$loki
                        }')">Edit</button></td>
                    </tr>`;
          userList.innerHTML += userRow;
          console.log(`Added row for user: ${user.name}`);
        });

        console.log("Finished adding user rows, row count:", userList.children.length);

        // Initialize tablesort after the table is populated
        if (document.getElementById("usersTable")) {
          console.log("Initializing tablesort");
          try {
            // Reset any existing tablesort
            const table = document.getElementById("usersTable");
            if (table.tablesort) {
              console.log("Destroying existing tablesort");
              table.tablesort.destroy();
            }

            // Check if Tablesort is available
            if (typeof Tablesort === 'undefined') {
              console.error("Tablesort library not found!");
              return;
            }

            // Initialize new tablesort with number sorting
            new Tablesort(table, {
              descending: true,
            });
            console.log("Tablesort initialized successfully");
          } catch (err) {
            console.error("Error initializing tablesort:", err);
          }
        } else {
          console.error("Could not find usersTable element for tablesort");
        }
      })
      .catch((error) => {
        console.error("Error loading users:", error);
        const userList = document.getElementById("userList");
        if (userList) {
          userList.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Error loading user data: ${error.message}</td></tr>`;
        }
      });
  }

  // Function to populate the update user form
  function populateUserForm(userData) {
    console.log("userData:", userData); // This helps in debugging to see what data is being passed.
    const modal = document.getElementById("updateUserModal");
    modal.dataset.userId = userData.$loki; // Use $loki instead of _id

    const updateUserName = document.getElementById("updateUserName");
    const updateUserShift = document.getElementById("updateUserShift");
    const updateUserHours = document.getElementById("updateUserHours");
    const updateUserMinutes = document.getElementById("updateUserMinutes");
    const laborSharesTable = document.getElementById("laborSharesTableBody");
    const jobsTrainedCheckboxes = document.querySelectorAll(
      '#updateUserModal [name="jobsTrained"]'
    );

    // Check if essential elements are missing in the DOM.
    if (
      !updateUserName ||
      !updateUserHours ||
      !updateUserMinutes ||
      !laborSharesTable
    ) {
      console.error("One or more fields are missing in the form.");
      return; // Exit the function if elements are missing.
    }

    // Populate the name and calculate hours and minutes from totalMinutes.
    updateUserName.value = userData.name;
    updateUserHours.value = Math.floor(userData.totalMinutes / 60);
    updateUserMinutes.value = userData.totalMinutes % 60;
    
    // Set the shift if it exists
    if (updateUserShift) {
      updateUserShift.value = userData.shift || "";
    }

    // Check appropriate checkboxes for jobs trained.
    jobsTrainedCheckboxes.forEach((checkbox) => {
      checkbox.checked = userData.jobsTrained?.includes(checkbox.value) || false;
    });

    // Populate the labor shares table if the data is available and is an array.
    if (Array.isArray(userData.laborShares)) {
      laborSharesTable.innerHTML = ""; // Clear existing rows first.
      userData.laborShares.forEach((laborShare) => {
        const row = `<tr>
                <td>${laborShare.jobType}</td>
                <td>${formatMinutesToHours(laborShare.minutes)}</td>
                <td>${new Date(laborShare.timestamp).toLocaleString()}</td>
            </tr>`;
        laborSharesTable.innerHTML += row;
      });
    } else {
      console.error("Labor Shares data is missing or not an array");
      laborSharesTable.innerHTML =
        '<tr><td colspan="3">No labor share data available.</td></tr>';
    }
  }

  // Event listener for the new user form submission
  document
    .getElementById("newUserForm")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      const modalElement = document.getElementById("newUserModal");
      const modalInstance = bootstrap.Modal.getInstance(modalElement); // Retrieve the modal instance

      const formData = new FormData(event.target);
      const name = formData.get("name");
      const shift = formData.get("shift");
      const jobsTrained = Array.from(formData.getAll("jobsTrained"));
      const hoursToMinutes = parseInt(formData.get("modalUserHours") || 0) * 60; // Convert hours to minutes
      const minutes = parseInt(formData.get("modalUserMinutes") || 0);
      const totalMinutes = hoursToMinutes + minutes;

      const userData = {
        name: name,
        shift: shift,
        jobsTrained: jobsTrained,
        totalMinutes: totalMinutes,
      };

      fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("Success:", data);
          fetchAndPopulateUsers(); // Refresh user list after adding a new user
          modalInstance.hide(); // Hide the modal upon successful submission
        })
        .catch((error) => {
          console.error("Error:", error);
          modalInstance.hide(); // Ensure the modal is hidden even if there's an error
        });
    });

  function deleteUser() {
    const modalElement = document.getElementById("updateUserModal");
    const modalInstance = bootstrap.Modal.getInstance(modalElement); // Retrieve the modal instance

    const userId = modalElement.dataset.userId; // Retrieve the stored user ID
    console.log("Deleting user:", userId);

    fetch(`/users/${userId}`, { method: "DELETE" })
      .then((response) => response.json())
      .then((data) => {
        console.log("Delete Success:", data);
        modalInstance.hide(); // Use the instance to hide the modal
        fetchAndPopulateUsers(); // Refresh user list
      })
      .catch((error) => {
        console.error("Error deleting user:", error);
        modalInstance.hide(); // Ensure the modal is hidden even if there's an error
      });
  }

  function updateUser() {
    const modalElement = document.getElementById("updateUserModal");
    const modalInstance = bootstrap.Modal.getInstance(modalElement); // Retrieve the modal instance

    const userId = modalElement.dataset.userId; // Retrieve the stored user ID from the modal's dataset
    const originalUserData = allUserData[userId]; // Get the original user data

    // Collect form data
    const name = document.getElementById("updateUserName").value;
    const shift = document.getElementById("updateUserShift").value;
    const hours =
      parseInt(document.getElementById("updateUserHours").value, 10) || 0;
    const minutes =
      parseInt(document.getElementById("updateUserMinutes").value, 10) || 0;
    const totalMinutes = hours * 60 + minutes;
    const jobsTrained = Array.from(
      document.querySelectorAll('#updateUserModal [name="jobsTrained"]:checked')
    ).map((checkbox) => checkbox.value);

    // Calculate difference in minutes
    const originalMinutes = originalUserData.totalMinutes || 0;
    const minutesDifference = totalMinutes - originalMinutes;

    const userData = {
      name,
      shift,
      jobsTrained,
      totalMinutes,
    };

    // If the total minutes changed, add a labor share entry
    if (minutesDifference !== 0) {
      userData.laborShare = {
        jobType: "Edit",
        minutes: minutesDifference,
        timestamp: new Date().toISOString(),
      };
    }

    console.log("Updating user with ID:", userId);
    console.log("User data:", userData);

    // API call to update the user
    fetch(`/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Update Success:", data);
        modalInstance.hide();
        fetchAndPopulateUsers(); // Refresh user list
      })
      .catch((error) => {
        console.error("Error updating user:", error);
        alert("Failed to update user: " + error.message);
        modalInstance.hide(); // Hide the modal even if there is an error
      });
  }

  window.openUpdateModal = function (userId) {
    const userData = allUserData[userId];
    populateUserForm(userData);
    const modal = new bootstrap.Modal(
      document.getElementById("updateUserModal")
    );
    modal.show();
  };

  // Event handler for shift filter dropdown
  document.getElementById("shift-select")?.addEventListener("change", function() {
    currentShiftFilter = this.value;
    updateCurrentTime(); // This will now update the shift details based on selection
    fetchAndPopulateUsers();
  });

  // Add event listeners
  document
    .getElementById("deleteUserButton")
    .addEventListener("click", deleteUser);
  document
    .getElementById("updateUserButton")
    .addEventListener("click", updateUser);

  document
  .getElementById("backupUsersButton")
  .addEventListener("click", function () {
    fetch("/backup-users", { method: "POST" })
      .then((response) => response.text())
      .then((result) => {
        alert(result);
        loadBackupFiles(); // Refresh the backup files list
      })
      .catch((error) => console.error("Error backing up users:", error));
  });

  function loadBackupFiles() {
    fetch("/list-backups")
      .then((response) => response.json())
      .then((backups) => {
        const dropdown = document.getElementById("backupFilesDropdown");
        dropdown.innerHTML = "<option value=''>Select a backup...</option>";
        backups.forEach((backup) => {
          const option = document.createElement("option");
          option.value = backup.filename;
          option.textContent = `Backup from ${backup.timestamp}`;
          dropdown.appendChild(option);
        });
      });
  }

  document
    .getElementById("restoreUsersButton")
    .addEventListener("click", function () {
      const selectedFile = document.getElementById("backupFilesDropdown").value;
      console.log(selectedFile);
      if (!selectedFile) return alert("No backup selected.");

      if (
        confirm(
          "Are you sure you want to restore this backup? This will overwrite current data."
        )
      ) {
        // Perform the fetch request
        fetch(`/restore-users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: selectedFile }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok.");
            }
            return response.text();
          })
          .then((result) => {
            alert(result);
            fetchAndPopulateUsers(); // Refresh the user list
          })
          .catch((error) => {
            console.error("Error restoring users:", error);
            // Only show alert if there is an error
            alert(
              "Failed to restore users. Please check the console for more details."
            );
          });
      }
    });

  document
    .getElementById("deleteBackupButton")
    .addEventListener("click", function () {
      const selectedFile = document.getElementById("backupFilesDropdown").value;
      if (!selectedFile) return alert("No backup selected.");

      if (
        confirm(
          "Are you sure you want to delete this backup? This action cannot be undone."
        )
      ) {
        fetch("/delete-backup", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: selectedFile }),
        })
          .then((response) => response.text())
          .then((result) => {
            alert(result);
            // Refresh the dropdown list after deletion
            loadBackupFiles();
          })
          .catch((error) => console.error("Error deleting backup:", error));
      }
    });

  // Initialize
  console.log("Starting initialization");
  fetchConfig();
  loadBackupFiles();
  fetchAndPopulateUsers();
  console.log("Initialization completed");
});
