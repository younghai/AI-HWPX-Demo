const examples = {
  minutes: {
    label: "Minutes",
    sourceName: "meeting-template.hwpx",
    title: "Weekly Operations Meeting Minutes",
    toc: ["Meeting Overview", "Key Discussion Points", "Decisions Made", "Action Items", "Upcoming Schedule"],
    narrative: "Automatically structures team status updates, decisions, and action items by assignee.",
  },
  "business-plan": {
    label: "Business Plan",
    sourceName: "business-plan-template.hwpx",
    title: "AI Document Automation Service — Business Plan",
    toc: ["Business Background", "Market Opportunity", "Service Structure", "Revenue Model", "Roadmap"],
    narrative: "Formats business purpose, market analysis, service structure, and monetization strategy into a clean business plan.",
  },
  proposal: {
    label: "Proposal",
    sourceName: "proposal-template.hwpx",
    title: "Public Document Automation Platform — Proposal",
    toc: ["Proposal Overview", "Core Features", "Implementation Approach", "Operational Support", "Expected Outcomes"],
    narrative: "Quickly generates a structured proposal including objectives, scope, implementation plan, and operations.",
  },
  rfp: {
    label: "RFP",
    sourceName: "rfp-template.hwpx",
    title: "AI-Powered HWPX Document Generation — RFP",
    toc: ["Project Overview", "Scope of Work", "Technical Requirements", "Evaluation Criteria", "Submission Guidelines"],
    narrative: "Substitutes content into an RFP format centered on requirements and evaluation criteria while preserving the source document style.",
  },
};

const state = {
  selectedExample: "minutes",
  sourceName: examples.minutes.sourceName,
  title: examples.minutes.title,
  toc: [...examples.minutes.toc],
  sourceFile: null,
  fileSizeLabel: "71 KB",
  lastGeneratedFile: "",
};

// ── Form elements ──
const sourceInput   = document.querySelector("#source-file");
const sourceNameEl  = document.querySelector("#source-name");
const titleInput    = document.querySelector("#doc-title");
const tocInput      = document.querySelector("#doc-toc");
const runButton     = document.querySelector("#run-demo");
const runStatus     = document.querySelector("#run-status");
const downloadLink  = document.querySelector("#download-link");
const exampleButtons = Array.from(document.querySelectorAll("[data-example]"));
const chips         = Array.from(document.querySelectorAll("[data-chip]"));
const aiButton      = document.querySelector("#ai-fill");
const demoButton    = document.querySelector("#demo-fill");

// ── Full-width document preview ──
const fpKind    = document.querySelector("#fp-kind");
const fpDate    = document.querySelector("#fp-date");
const fpSource  = document.querySelector("#fp-source");
const fpTitle   = document.querySelector("#fp-title");
const fpToc     = document.querySelector("#fp-toc");
const fpBody    = document.querySelector("#fp-body");
const fpFooter  = document.querySelector("#fp-footer");

const formatSize = (bytes) => {
  if (!bytes) return "71 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const parseToc = (raw) =>
  raw.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 5);

const defaultTocFromTitle = (title) => {
  const seed = title.trim() || "HWPX Document Automation";
  return [
    `${seed} — Background`,
    "Source Document Style Analysis",
    "Content Substitution & Outline Generation",
    "Review & Approval Process",
    "Distribution Schedule & Operations",
  ];
};

const nowLabel = () =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

const sentenceForSection = (label, index, title) => {
  const templates = [
    `Outlines the core context and background behind ${title}, aligned with the original document structure.`,
    `The "${label}" section is rewritten in summary form while preserving the original table and paragraph styles.`,
    `AI drafts the body content for "${label}" and a human reviewer completes the final check.`,
    `Reflects the approval checkpoints and review checklist for "${label}" in the document format.`,
    `Packages the completed draft including "${label}" back into an .hwpx file ready for distribution.`,
  ];
  return templates[index] || `Auto-generates content for "${label}" to fit the document structure.`;
};

const render = () => {
  const title = titleInput.value.trim() || state.title;
  const toc = parseToc(tocInput.value);
  const normalizedToc = toc.length ? toc : defaultTocFromTitle(title);
  const source = state.sourceName;
  const currentExample = examples[state.selectedExample] || examples.minutes;

  // Full-width document preview
  fpKind.textContent   = currentExample.label;
  fpDate.textContent   = nowLabel();
  fpSource.textContent = `Source template: ${source}`;
  fpTitle.textContent  = title;

  // Table of contents
  fpToc.innerHTML = "";
  normalizedToc.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    fpToc.appendChild(li);
  });

  // Body sections
  fpBody.innerHTML = "";
  normalizedToc.forEach((item, index) => {
    const section = document.createElement("div");
    section.className = "doc-body-section";
    section.innerHTML = `
      <p class="doc-body-section-title">${item}</p>
      <p class="doc-body-section-content">${sentenceForSection(item, index, title)}</p>
    `;
    fpBody.appendChild(section);
  });

  // Footer
  fpFooter.textContent = state.lastGeneratedFile
    ? `Last generated: ${state.lastGeneratedFile}`
    : "Preview only — click Generate to create the actual .hwpx file.";

  // Chip / example button sync
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", normalizedToc.includes(chip.dataset.chip));
  });
  exampleButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.example === state.selectedExample);
  });
};

const fillForm = ({ sourceName: nextSource, title, toc }) => {
  state.sourceName = nextSource;
  state.title = title;
  state.toc = toc;
  sourceNameEl.textContent = nextSource;
  titleInput.value = title;
  tocInput.value = toc.join("\n");
  render();
};

const applyExample = (key) => {
  const example = examples[key];
  if (!example) return;
  state.selectedExample = key;
  state.sourceFile = null;
  state.fileSizeLabel = "71 KB";
  state.lastGeneratedFile = "";
  sourceInput.value = "";
  fillForm({ sourceName: example.sourceName, title: example.title, toc: [...example.toc] });
  runStatus.textContent = `"${example.label}" example loaded. Click Generate to create the full document.`;
  downloadLink.classList.add("is-hidden");
};

sourceInput?.addEventListener("change", (event) => {
  const [file] = event.target.files ?? [];
  if (!file) { state.sourceFile = null; return; }
  state.sourceFile = file;
  state.sourceName = file.name;
  state.fileSizeLabel = formatSize(file.size);
  state.lastGeneratedFile = "";
  sourceNameEl.textContent = file.name;
  runStatus.textContent = `${file.name} is ready. Click Generate to create the actual HWPX file.`;
  downloadLink.classList.add("is-hidden");
  render();
});

titleInput?.addEventListener("input", render);
tocInput?.addEventListener("input", render);

aiButton?.addEventListener("click", () => {
  tocInput.value = defaultTocFromTitle(titleInput.value.trim() || state.title).join("\n");
  render();
});

exampleButtons.forEach((btn) => btn.addEventListener("click", () => applyExample(btn.dataset.example)));
demoButton?.addEventListener("click", () => applyExample("proposal"));

runButton?.addEventListener("click", async () => {
  const title = titleInput.value.trim() || state.title;
  const parsedToc = parseToc(tocInput.value);
  const normalizedToc = parsedToc.length ? parsedToc : defaultTocFromTitle(title);
  const formData = new FormData();
  formData.append("title", title);
  formData.append("toc", normalizedToc.join("\n"));
  if (state.sourceFile) formData.append("source_file", state.sourceFile);

  runButton.disabled = true;
  runButton.textContent = "Generating…";
  downloadLink.classList.add("is-hidden");
  runStatus.textContent = "Analyzing source structure and generating the HWPX file…";

  try {
    const response = await fetch("/generate.php", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Document generation failed.");
    }
    state.lastGeneratedFile = payload.fileName || "generated.hwpx";
    downloadLink.href = payload.downloadUrl;
    downloadLink.setAttribute("download", state.lastGeneratedFile);
    downloadLink.classList.remove("is-hidden");
    runStatus.textContent = `${payload.message} Your file based on ${payload.sourceName} is ready to download.`;
    render();
  } catch (error) {
    runStatus.textContent = error.message;
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Generate";
  }
});

fillForm({
  sourceName: state.sourceName,
  title: "AI-Powered HWPX Document Generation Service",
  toc: state.toc,
});
