document.addEventListener("DOMContentLoaded", () => {
  const excludeCheckbox = document.getElementById("excludeRecentLaborShares");
  excludeCheckbox.addEventListener("change", fetchAndDisplayData);

  // Mapping of job types to the corresponding table body IDs and filter keys.
  const jobTabs = {
    dock: { tableId: "#dockList", filter: null }, // "dock" shows all users
    reach: { tableId: "#reachList", filter: "reach" },
    op: { tableId: "#opList", filter: "OP" },
    clamp: { tableId: "#clampList", filter: "clamp" },
    hau2: { tableId: "#hau2List", filter: "hau2" },
    relo: { tableId: "#reloList", filter: "relo" },
  };

  // Initial data load
  fetchAndDisplayData();

  function fetchAndDisplayData() {
    fetch("/userdata")
      .then((response) => response.json())
      .then((data) => {
        const currentTime = new Date();
        const twelveHoursAgo = new Date(
          currentTime.getTime() - 12 * 60 * 60 * 1000
        );

        // Loop through each job type tab
        Object.entries(jobTabs).forEach(([tab, { tableId, filter }]) => {
          const tableBody = document.querySelector(tableId);
          tableBody.innerHTML = ""; // Clear existing rows

          // Filter users based on job type and, optionally, recent labor shares
          let filteredData = data.filter((item) => {
            const passesJobFilter =
              !filter || item.jobsTrained.includes(filter);
            const passesRecentShare =
              !excludeCheckbox.checked ||
              !item.laborShares.some(
                (share) => new Date(share.timestamp) > twelveHoursAgo
              );
            return passesJobFilter && passesRecentShare;
          });

          // Sort users by total minutes (ascending)
          filteredData.sort(
            (a, b) => parseInt(a.totalMinutes) - parseInt(b.totalMinutes)
          );

          // Create table rows for each user
          filteredData.forEach((item) => {
            const row = document.createElement("tr");
            row.setAttribute("data-user-key", item.name);
            row.innerHTML = `
              <td class="name">${item.name}</td>
              <td class="minutes">${formatMinutesToHours(
                item.totalMinutes
              )}</td>
              <td>
                <button class="btn btn-primary btn-sm add-to-queue-btn">Add to Queue</button>
              </td>
            `;
            tableBody.appendChild(row);

            // Add event listener for "Add to Queue" button
            row
              .querySelector(".add-to-queue-btn")
              .addEventListener("click", () => {
                addToQueue(item, tab);
              });
          });
        });
      })
      .catch((error) => console.error("Error fetching user data:", error));
  }

  function addToQueue(item, jobType) {
    const queueTableBody = document.getElementById("queueTableBody");
    const minutesTillEOS = calculateTimeTillEndOfShift();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${formatMinutesToHours(minutesTillEOS)}</td>
      <td>${jobType}</td>
      <td>
        <button class="btn btn-danger btn-sm remove-from-queue-btn">Remove</button>
      </td>
    `;
    queueTableBody.appendChild(row);

    // Remove the user from all labor lists so they can’t be added twice
    document
      .querySelectorAll(`tr[data-user-key="${item.name}"]`)
      .forEach((el) => el.remove());

    // Add functionality to remove the user from the queue
    row
      .querySelector(".remove-from-queue-btn")
      .addEventListener("click", () => {
        row.remove();
        // Optionally, re-fetch data to put the user back into the available lists
        fetchAndDisplayData();
      });
  }

  // Queue reset handler
  document.getElementById("resetQueueButton").addEventListener("click", () => {
    window.location.reload();
  });

  // Queue submission handler
  document.getElementById("submitQueueButton").addEventListener("click", () => {
    const queueRows = document.querySelectorAll("#queueTableBody tr");
    const users = [];
    queueRows.forEach((row) => {
      const name = row.cells[0].textContent;
      const jobType = row.cells[2].textContent;
      users.push({
        name,
        jobType,
        minutesTillEndOfShift: calculateTimeTillEndOfShift(),
        timestamp: new Date().toISOString(),
      });
    });

    fetch("/submit-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(users),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => {
        alert("Queue successfully submitted!");
        document.getElementById("queueTableBody").innerHTML = "";
      })
      .catch((error) => {
        console.error("Error submitting queue:", error);
        alert("Failed to submit queue.");
      });
  });
});

// Utility functions
function formatMinutesToHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function calculateTimeTillEndOfShift() {
  const now = new Date();
  const target = new Date();
  target.setHours(6, 30, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  const diffMs = target - now;
  return Math.floor(diffMs / (1000 * 60));
}
