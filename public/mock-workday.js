const screens = [
  "posting", "account", "my-information", "my-experience",
  "application-questions", "voluntary-disclosures", "self-identify", "review", "confirmation",
];
const stepKeys = ["account", "my-information", "my-experience", "application-questions", "voluntary-disclosures", "self-identify", "review"];

let loggedInEmail = "";
let workEntryCount = 0;
let educationEntryCount = 0;

init();

function init() {
  document.getElementById("apply-btn").addEventListener("click", () => showScreen("account"));

  document.getElementById("tab-create").addEventListener("click", () => switchTab("create"));
  document.getElementById("tab-signin").addEventListener("click", () => switchTab("signin"));
  document.getElementById("create-account-btn").addEventListener("click", onCreateAccount);
  document.getElementById("signin-btn").addEventListener("click", onSignIn);

  document.getElementById("mi-resume").addEventListener("change", onResumeChange);

  document.getElementById("add-work-entry").addEventListener("click", () => addWorkEntry());
  document.getElementById("add-education-entry").addEventListener("click", () => addEducationEntry());
  addWorkEntry();
  addEducationEntry();

  document.querySelectorAll(".continue-btn").forEach((btn) => {
    btn.addEventListener("click", () => onContinue(btn));
  });

  document.getElementById("submit-application-btn").addEventListener("click", onSubmit);

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("si-date").value = today;
}

function screenElementId(name) {
  return name === "confirmation" ? "confirmation-panel" : `screen-${name}`;
}

function showScreen(name) {
  for (const s of screens) {
    document.getElementById(screenElementId(s)).hidden = s !== name;
  }
  document.querySelectorAll("#step-tracker .step").forEach((el) => {
    const key = el.dataset.step;
    const nameIdx = stepKeys.indexOf(name);
    const keyIdx = stepKeys.indexOf(key);
    el.classList.toggle("active", key === name);
    el.classList.toggle("done", keyIdx !== -1 && nameIdx !== -1 && keyIdx < nameIdx);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}

function switchTab(tab) {
  document.getElementById("tab-create").classList.toggle("active", tab === "create");
  document.getElementById("tab-signin").classList.toggle("active", tab === "signin");
  document.getElementById("panel-create").hidden = tab !== "create";
  document.getElementById("panel-signin").hidden = tab !== "signin";
}

function onCreateAccount() {
  const email = document.getElementById("create-email").value.trim();
  const password = document.getElementById("create-password").value;
  const verify = document.getElementById("create-password-verify").value;
  const terms = document.getElementById("create-terms").checked;
  const errorEl = document.getElementById("account-error");

  if (!email || !password || password !== verify || !terms) {
    errorEl.textContent = !email || !password
      ? "Please fill in all required fields."
      : password !== verify
      ? "Passwords do not match."
      : "You must agree to the Terms of Use and Privacy Notice.";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";
  loggedInEmail = email;
  document.getElementById("mi-email").value = email;
  showScreen("my-information");
}

function onSignIn() {
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  const errorEl = document.getElementById("account-error");

  if (!email || !password) {
    errorEl.textContent = "Please fill in all required fields.";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";
  loggedInEmail = email;
  document.getElementById("mi-email").value = email;
  showScreen("my-information");
}

function onResumeChange() {
  const input = document.getElementById("mi-resume");
  const drop = document.getElementById("mi-resume-drop");
  const label = document.getElementById("mi-resume-drop-label");
  const file = input.files && input.files[0];
  if (file) {
    drop.classList.add("has-file");
    label.textContent = `Attached: ${file.name}`;
  } else {
    drop.classList.remove("has-file");
    label.textContent = "Attach your resume (PDF, DOCX, or TXT)";
  }
}

function workEntryTemplate() {
  const el = document.createElement("div");
  el.className = "entry-card work-entry";
  el.innerHTML = `
    <button type="button" class="remove-entry">Remove</button>
    <div class="entry-title">Work Experience</div>
    <div class="row-2">
      <div class="field"><label>Job Title<span class="required">*</span><input type="text" data-field="job-title" /></label></div>
      <div class="field"><label>Company<span class="required">*</span><input type="text" data-field="company" /></label></div>
    </div>
    <div class="field"><label>Location<input type="text" data-field="location" /></label></div>
    <div class="row-2">
      <div class="field"><label>Start Date<span class="required">*</span><input type="text" data-field="start-date" placeholder="e.g. June 2021" /></label></div>
      <div class="field"><label>End Date<input type="text" data-field="end-date" placeholder="e.g. May 2023" /></label></div>
    </div>
    <label class="checkbox-row"><input type="checkbox" data-field="current" /><span>I currently work here</span></label>
    <div class="field"><label>Role Description<textarea data-field="description"></textarea></label></div>
  `;
  return el;
}

function educationEntryTemplate() {
  const el = document.createElement("div");
  el.className = "entry-card education-entry";
  el.innerHTML = `
    <button type="button" class="remove-entry">Remove</button>
    <div class="entry-title">Education</div>
    <div class="field"><label>School<span class="required">*</span><input type="text" data-field="school" /></label></div>
    <div class="row-2">
      <div class="field"><label>Degree<input type="text" data-field="degree" /></label></div>
      <div class="field"><label>Field of Study<input type="text" data-field="field-of-study" /></label></div>
    </div>
    <div class="field"><label>Graduation Date<input type="text" data-field="graduation-date" placeholder="e.g. 2018" /></label></div>
  `;
  return el;
}

function addWorkEntry() {
  workEntryCount++;
  const el = workEntryTemplate();
  el.querySelector(".remove-entry").addEventListener("click", () => el.remove());
  document.getElementById("work-entries").appendChild(el);
}

function addEducationEntry() {
  educationEntryCount++;
  const el = educationEntryTemplate();
  el.querySelector(".remove-entry").addEventListener("click", () => el.remove());
  document.getElementById("education-entries").appendChild(el);
}

function onContinue(btn) {
  const next = btn.dataset.next;
  const currentScreen = btn.closest("section").id.replace("screen-", "");

  if (!validateScreen(currentScreen)) return;
  if (next === "review") renderReview();
  showScreen(next);
}

function validateScreen(screen) {
  const errorId = `${screen}-error`;
  const errorEl = document.getElementById(errorId);
  let ok = true;

  if (screen === "my-information") {
    ok = ["mi-first-name", "mi-last-name", "mi-address1", "mi-city", "mi-country", "mi-phone"]
      .every((id) => document.getElementById(id).value.trim());
    const hasResume = document.getElementById("mi-resume").files.length > 0;
    ok = ok && hasResume;
  } else if (screen === "my-experience") {
    const firstWork = document.querySelector(".work-entry");
    const firstEdu = document.querySelector(".education-entry");
    ok = firstWork.querySelector('[data-field="job-title"]').value.trim()
      && firstWork.querySelector('[data-field="company"]').value.trim()
      && firstEdu.querySelector('[data-field="school"]').value.trim();
  } else if (screen === "application-questions") {
    ok = document.getElementById("aq-work-auth").value && document.getElementById("aq-sponsorship").value;
  } else if (screen === "self-identify") {
    const disabilitySelected = document.querySelector('input[name="disability"]:checked');
    ok = Boolean(disabilitySelected) && document.getElementById("si-name").value.trim();
  }

  if (errorEl) errorEl.style.display = ok ? "none" : "block";
  return ok;
}

function collectEntries(selector) {
  return Array.from(document.querySelectorAll(selector)).map((card) => {
    const data = {};
    card.querySelectorAll("[data-field]").forEach((input) => {
      data[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
    });
    return data;
  });
}

function buildSummaryHTML() {
  const work = collectEntries(".work-entry");
  const education = collectEntries(".education-entry");
  const disability = document.querySelector('input[name="disability"]:checked');

  const row = (label, value) => (value ? `<div class="review-row"><strong>${label}:</strong> ${escapeHtml(String(value))}</div>` : "");

  let html = "";
  html += `<div class="review-section"><h3>Account</h3>${row("Email", loggedInEmail)}</div>`;

  html += `<div class="review-section"><h3>My Information</h3>`;
  html += row("Name", `${document.getElementById("mi-first-name").value} ${document.getElementById("mi-last-name").value}`);
  html += row("Address", `${document.getElementById("mi-address1").value}, ${document.getElementById("mi-city").value} ${document.getElementById("mi-state").value} ${document.getElementById("mi-postal").value}`);
  html += row("Country", document.getElementById("mi-country").value);
  html += row("Phone", `${document.getElementById("mi-phone-type").value}: ${document.getElementById("mi-phone").value}`);
  html += row("Email", document.getElementById("mi-email").value);
  html += row("LinkedIn", document.getElementById("mi-linkedin").value);
  html += row("Source", document.getElementById("mi-source").value);
  const resumeFile = document.getElementById("mi-resume").files[0];
  html += row("Resume", resumeFile ? resumeFile.name : "");
  html += `</div>`;

  html += `<div class="review-section"><h3>Work Experience</h3>`;
  work.forEach((w, i) => {
    if (!w["job-title"] && !w["company"]) return;
    html += row(`Position ${i + 1}`, `${w["job-title"]} at ${w["company"]}${w["location"] ? ` (${w["location"]})` : ""}`);
    html += row("Dates", `${w["start-date"]} – ${w["current"] ? "Present" : w["end-date"] || ""}`);
    html += row("Description", w["description"]);
  });
  html += `</div>`;

  html += `<div class="review-section"><h3>Education</h3>`;
  education.forEach((e) => {
    if (!e["school"]) return;
    html += row("School", e["school"]);
    html += row("Degree", [e["degree"], e["field-of-study"]].filter(Boolean).join(", "));
    html += row("Graduation", e["graduation-date"]);
  });
  html += row("Skills", document.getElementById("exp-skills").value);
  html += `</div>`;

  html += `<div class="review-section"><h3>Application Questions</h3>`;
  html += row("Legally eligible to work", document.getElementById("aq-work-auth").value);
  html += row("Requires sponsorship", document.getElementById("aq-sponsorship").value);
  html += row("Desired salary", document.getElementById("aq-salary").value);
  html += row("Earliest start date", document.getElementById("aq-start-date").value);
  html += row("Additional note", document.getElementById("aq-cover-letter").value);
  html += `</div>`;

  html += `<div class="review-section"><h3>Voluntary Disclosures</h3>`;
  html += row("Gender", document.getElementById("vd-gender").value);
  html += row("Race/Ethnicity", document.getElementById("vd-ethnicity").value);
  html += row("Veteran status", document.getElementById("vd-veteran").value);
  html += `</div>`;

  html += `<div class="review-section"><h3>Self Identification</h3>`;
  html += row("Disability status", disability ? disability.value : "");
  html += row("Signature", document.getElementById("si-name").value);
  html += row("Date", document.getElementById("si-date").value);
  html += `</div>`;

  return html;
}

function renderReview() {
  document.getElementById("review-content").innerHTML = buildSummaryHTML();
}

function onSubmit() {
  document.getElementById("applicant-summary").innerHTML = buildSummaryHTML();
  showScreen("confirmation");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
