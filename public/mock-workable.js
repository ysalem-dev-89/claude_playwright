document.getElementById("apply-now-btn").addEventListener("click", () => {
  document.getElementById("application-form").hidden = false;
  document.getElementById("application-form").scrollIntoView({ behavior: "instant", block: "start" });
});

const resumeInput = document.getElementById("resume");
const resumeDrop = document.getElementById("resume-drop");
const resumeDropLabel = document.getElementById("resume-drop-label");

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

document.getElementById("submit-btn").addEventListener("click", () => {
  const required = ["full-name", "email", "phone", "work-auth", "sponsorship"];
  const missing = required.filter((id) => !document.getElementById(id).value.trim());
  const hasResume = resumeInput.files && resumeInput.files.length > 0;
  const errorEl = document.getElementById("validation-error");

  if (missing.length > 0 || !hasResume) {
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";

  const fieldLabels = {
    "full-name": "Full Name",
    email: "Email",
    phone: "Phone",
    "cover-letter": "Cover Letter",
    linkedin: "LinkedIn",
    portfolio: "Portfolio",
    "work-auth": "Legally Authorized",
    sponsorship: "Requires Sponsorship",
    "desired-salary": "Desired Salary",
    "referral-source": "Heard About Job Via",
    gender: "Gender",
    "race-ethnicity": "Race/Ethnicity",
    "veteran-status": "Veteran Status",
    "disability-status": "Disability Status",
  };

  const summaryEl = document.getElementById("applicant-summary");
  let html = "";
  for (const [id, label] of Object.entries(fieldLabels)) {
    const value = document.getElementById(id).value.trim();
    if (value) html += `<div><strong>${label}:</strong> ${escapeHtml(value)}</div>`;
  }
  const resumeFile = resumeInput.files[0];
  html += `<div><strong>Resume:</strong> ${escapeHtml(resumeFile.name)}</div>`;
  summaryEl.innerHTML = html;

  document.getElementById("job-posting").hidden = true;
  document.getElementById("application-form").hidden = true;
  document.getElementById("confirmation-panel").style.display = "block";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
