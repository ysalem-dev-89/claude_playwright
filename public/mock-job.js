const form = document.getElementById("application-form");
const resumeInput = document.getElementById("resume");
const resumeDrop = document.getElementById("resume-drop");
const resumeDropLabel = document.getElementById("resume-drop-label");
const validationError = document.getElementById("validation-error");

resumeInput.addEventListener("change", () => {
  const file = resumeInput.files && resumeInput.files[0];
  if (file) {
    resumeDrop.classList.add("has-file");
    resumeDropLabel.textContent = `Attached: ${file.name}`;
  } else {
    resumeDrop.classList.remove("has-file");
    resumeDropLabel.textContent = "Attach your resume (PDF, DOCX, or TXT)";
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const required = ["first_name", "last_name", "email", "phone", "work_authorization", "sponsorship"];
  const missing = required.filter((id) => !document.getElementById(id).value.trim());
  const hasResume = resumeInput.files && resumeInput.files.length > 0;

  if (missing.length > 0 || !hasResume) {
    validationError.style.display = "block";
    return;
  }
  validationError.style.display = "none";

  const values = Object.fromEntries(
    Array.from(form.elements)
      .filter((el) => el.name && el.type !== "file")
      .map((el) => [el.name, el.value])
  );
  values.resume = resumeInput.files[0].name;

  const summaryEl = document.getElementById("applicant-summary");
  summaryEl.innerHTML = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `<div><strong>${labelFor(key)}:</strong> ${escapeHtml(value)}</div>`)
    .join("");

  form.style.display = "none";
  document.getElementById("confirmation-panel").style.display = "block";
});

function labelFor(key) {
  const labels = {
    first_name: "First Name",
    last_name: "Last Name",
    email: "Email",
    phone: "Phone",
    location: "Location",
    resume: "Resume",
    cover_letter: "Cover Letter",
    linkedin: "LinkedIn",
    portfolio: "Portfolio",
    github: "GitHub",
    work_authorization: "Work Authorized (US)",
    sponsorship: "Requires Sponsorship",
    desired_salary: "Desired Salary",
    start_date: "Start Date",
    referral_source: "Heard About Job Via",
    gender: "Gender",
    race_ethnicity: "Race/Ethnicity",
    veteran_status: "Veteran Status",
    disability_status: "Disability Status",
  };
  return labels[key] || key;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
