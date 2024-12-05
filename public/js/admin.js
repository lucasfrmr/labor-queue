document.addEventListener("DOMContentLoaded", function () {
  let allUserData = {};

  function formatMinutesToHours(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function fetchAndPopulateUsers() {
    fetch("/userdata")
      .then((response) => response.json())
      .then((users) => {
        allUserData = {};
        const userList = document.getElementById("userList");
        userList.innerHTML = "";

        users.forEach((user) => {
          allUserData[user._id] = user;
          const formattedTime = formatMinutesToHours(user.totalMinutes);

          const userRow = `<tr>
                        <td>${user.name}</td>
                        <td>${formattedTime}</td>
                        <td><button class="btn btn-primary" onclick="openUpdateModal('${user._id}')">Edit</button></td>
                    </tr>`;
          userList.innerHTML += userRow;
        });
        console.log(users);
      })
      .catch((error) => console.error("Error loading users:", error));
  }

  // Function to populate the update user form
  function populateUserForm(userData) {
    console.log("userData:", userData); // This helps in debugging to see what data is being passed.
    const modal = document.getElementById("updateUserModal");
    modal.dataset.userId = userData._id;

    const updateUserName = document.getElementById("updateUserName");
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

    // Check appropriate checkboxes for jobs trained.
    jobsTrainedCheckboxes.forEach((checkbox) => {
      checkbox.checked = userData.jobsTrained.includes(checkbox.value);
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
      const jobsTrained = Array.from(formData.getAll("jobsTrained"));
      const hoursToMinutes = parseInt(formData.get("modalUserHours") || 0) * 60; // Convert hours to minutes
      const minutes = parseInt(formData.get("modalUserMinutes") || 0);
      const totalMinutes = hoursToMinutes + minutes;

      const userData = {
        name: name,
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
          window.location.reload(); // Optionally reload the page to reflect changes
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
        window.location.reload(); // Optionally reload the page to reflect changes
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

    // Collect form data
    const name = document.getElementById("updateUserName").value;
    const hours =
      parseInt(document.getElementById("updateUserHours").value, 10) || 0;
    const minutes =
      parseInt(document.getElementById("updateUserMinutes").value, 10) || 0;
    const totalMinutes = hours * 60 + minutes;
    const jobsTrained = Array.from(
      document.querySelectorAll('#updateUserModal [name="jobsTrained"]:checked')
    ).map((checkbox) => checkbox.value);

    const userData = {
      name,
      jobsTrained,
      totalMinutes,
    };

    // API call to update the user
    fetch(`/users/${userId}`, {
      method: "PUT", // Assuming the server expects a PUT request for updates
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Update Success:", data);
        modalInstance.hide(); // Correct way to hide the modal using Bootstrap 5
        fetchAndPopulateUsers(); // Refresh user list
      })
      .catch((error) => {
        console.error("Error updating user:", error);
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

  document
    .getElementById("deleteUserButton")
    .addEventListener("click", deleteUser); // Add event listener for the delete button
  document
    .getElementById("updateUserButton")
    .addEventListener("click", updateUser); // Add event listener for the delete button

  // Initial fetch to populate users
  fetchAndPopulateUsers();
});

document
  .getElementById("backupUsersButton")
  .addEventListener("click", function () {
    fetch("/backup-users", { method: "POST" })
      .then((response) => response.text())
      .then((result) => {
        alert(result);
        window.location.reload(); // Reload the page after backing up
      })
      .catch((error) => console.error("Error backing up users:", error));
  });

document.addEventListener("DOMContentLoaded", function () {
  fetch("/list-backups")
    .then((response) => response.json())
    .then((backups) => {
      const dropdown = document.getElementById("backupFilesDropdown");
      backups.forEach((backup) => {
        const option = document.createElement("option");
        option.value = backup.filename;
        option.textContent = `Backup from ${backup.timestamp}`;
        dropdown.appendChild(option);
      });
    });

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
            // Reload the page after the alert and successful restore
            window.location.reload();
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

  // document.getElementById('restoreUsersButton').addEventListener('click', function() {
  //     const selectedFile = document.getElementById('backupFilesDropdown').value;
  //     console.log(selectedFile);
  //     if (!selectedFile) return alert('No backup selected.');

  //     if (confirm("Are you sure you want to restore this backup? This will overwrite current data.")) {
  //         fetch(`/restore-users`, {
  //             method: 'POST',
  //             headers: { 'Content-Type': 'application/json' },
  //             body: JSON.stringify({ filename: selectedFile })
  //         })
  //         .then(response => response.text())
  //         .then(result => alert(result))
  //         .catch(error => console.error('Error restoring users:', error));
  //     }
  //     // reload the page after restoring the data
  //     window.location.reload();
  // });
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
          document
            .getElementById("backupFilesDropdown")
            .querySelector(`option[value="${selectedFile}"]`)
            .remove();
        })
        .catch((error) => console.error("Error deleting backup:", error));
    }
  });

// document.getElementById('restoreUsersButton').addEventListener('click', function() {
//     if (confirm("Are you sure you want to restore user data? This will overwrite current data.")) {
//         fetch('/restore-users', { method: 'POST' })
//             .then(response => response.text())
//             .then(result => alert(result))
//             .catch(error => console.error('Error restoring users:', error));
//     }
//     // reload the page after restoring the data
//     window.location.reload();
// });
