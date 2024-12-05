// Main functionality on document ready
document.addEventListener("DOMContentLoaded", function () {
  // Add checkbox for filtering users with recent labor shares
  // const excludeCheckbox = document.getElementById('excludeRecentLaborShares');
  // excludeCheckbox.addEventListener('change', fetchAndDisplayData);

  fetchAndDisplayData(); // Initial data fetch and display

  function fetchAndDisplayData() {
    fetch("/userdata")
      .then((response) => response.json())
      .then((data) => {
        const currentTime = new Date();
        const twelveHoursAgo = new Date(
          currentTime.getTime() - 12 * 60 * 60 * 1000
        );

        const jobTabs = {
          Dock: null, // Assuming 'Dock' tab includes all users
          Op: "OP",
          Clamp: "clamp",
          Reach: "reach",
          Relo: "relo",
          HAU2: "hau2",
        };

        Object.entries(jobTabs).forEach(([tab, jobType]) => {
          const tableBody = document.querySelector(
            `#sortableTable${tab} .list`
          );
          tableBody.innerHTML = ""; // Clear existing rows

          let filteredData = data.filter((item) => {
            // if (excludeCheckbox.checked) {
            //     return (!jobType || item.jobsTrained.includes(jobType)) &&
            //            !item.laborShares.some(share => new Date(share.timestamp) > twelveHoursAgo);
            // }
            return !jobType || item.jobsTrained.includes(jobType);
          });

          let sortedData = filteredData.sort(
            (a, b) => parseInt(a.totalMinutes) - parseInt(b.totalMinutes)
          );

          sortedData.forEach((item) => {
            const rowElement = document.createElement("tr");
            rowElement.setAttribute("data-user-key", item.name); // Ensure each row has this attribute
            const formattedMinutes = formatMinutesToHours(item.totalMinutes);
            rowElement.innerHTML = `
                        <td class="name">${item.name}</td>
                        <td class="minutes">${formattedMinutes}</td>
                        <td>
                            <button class="btn btn-primary btn-sm add-to-queue-btn">Add to Queue</button>
                        </td>
                    `;

            tableBody.appendChild(rowElement);

            const addButton = rowElement.querySelector(".add-to-queue-btn");
            addButton.addEventListener("click", function () {
              addToQueue(item, tab);
            });
          });
        });
      })
      .catch((error) => console.error("Error:", error));
  }

  // Function to add a user to the queue
  function addToQueue(item, jobType) {
    const queueTableBody = document.querySelector("#queueTableBody");
    const formattedTotalTime = formatMinutesToHours(item.totalMinutes);
    const minutesTillEndOfShift = calculateTimeTillEndOfShift();
    const formattedTimeTillShiftEnds = formatMinutesToHours(
      minutesTillEndOfShift
    );

    const rowElement = document.createElement("tr");
    rowElement.innerHTML = `
            <td>${item.name}</td>
            <td>${formattedTimeTillShiftEnds}</td>
            <td>${jobType}</td>
            <td>
                <!-- Include remove button if needed in the future -->
            </td>
        `;
    queueTableBody.appendChild(rowElement);

    // Remove user from all tables
    document
      .querySelectorAll(`tr[data-user-key="${item.name}"]`)
      .forEach((el) => el.remove());
  }

  // Additional handlers and utility functions
  document
    .getElementById("resetQueueButton")
    .addEventListener("click", function () {
      window.location.reload(); // Refreshes the page
    });

  document
    .getElementById("submitQueueButton")
    .addEventListener("click", function () {
      const queueTableBody = document.querySelector("#queueTableBody");
      const users = [];

      queueTableBody.querySelectorAll("tr").forEach((row) => {
        const name = row.cells[0].textContent; // Assuming the first cell contains the name
        const jobType = row.cells[2].textContent; // Assuming the third cell contains the job type
        let minutesTillEndOfShift = calculateTimeTillEndOfShift(); // Calculate remaining minutes

        console.log(
          `Time till end of shift for ${name}: ${formatMinutesToHours(
            minutesTillEndOfShift
          )}`
        ); // Logging the time till end of shift
        users.push({
          name: name,
          jobType: jobType,
          minutesTillEndOfShift: minutesTillEndOfShift,
          timestamp: new Date().toISOString(), // Include a timestamp for tracking
        });
      });

      // Now send this data to the server
      fetch("/submit-queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(users),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }
          return response.json();
        })
        .then((data) => {
          console.log("Queue submitted:", data);
          alert("Queue successfully submitted!");
          queueTableBody.innerHTML = ""; // Clear the queue table after submission
        })
        .catch((error) => {
          console.error("Error submitting queue:", error);
          alert("Failed to submit queue. Check console for more details.");
        });
    });
});

function formatMinutesToHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function calculateTimeTillEndOfShift() {
  let now = new Date();
  let target = new Date();
  target.setHours(6, 30, 0, 0); // Set the target time to 06:30 AM

  // If the current time is already past 06:30 AM today, set the target for the next day
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  let timeDifferenceMs = target - now;
  let minutesTillEndOfShift = Math.floor(timeDifferenceMs / (1000 * 60)); // Convert milliseconds to minutes
  return minutesTillEndOfShift;
}

function updateCountdown(userName) {
  const timeCell = document.getElementById(`time-${userName}`);
  if (!timeCell) return; // In case the row has been removed

  let minutesTillEndOfShift = calculateTimeTillEndOfShift();
  timeCell.textContent = formatMinutesToHours(minutesTillEndOfShift);

  setTimeout(() => updateCountdown(userName), 60000); // Update every minute
}
