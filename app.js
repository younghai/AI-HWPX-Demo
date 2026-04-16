const examples = {
  minutes: {
    label: "회의록",
    sourceName: "meeting-template.hwpx",
    title: "주간 운영 회의록",
    toc: ["회의 개요", "주요 논의 사항", "결정 사항", "후속 액션", "공유 일정"],
    narrative: "팀별 현황과 의사결정 내역을 정리하고 담당자별 액션 아이템을 자동으로 구조화합니다.",
  },
  "business-plan": {
    label: "사업계획서",
    sourceName: "business-plan-template.hwpx",
    title: "신규 AI 문서 자동화 서비스 사업계획서",
    toc: ["사업 배경", "시장 기회", "서비스 구성", "수익 모델", "추진 일정"],
    narrative: "사업 목적과 시장성, 서비스 구조, 수익화 전략을 한글 양식에 맞는 사업계획서 형식으로 정돈합니다.",
  },
  proposal: {
    label: "제안서",
    sourceName: "proposal-template.hwpx",
    title: "공공 문서 자동화 플랫폼 구축 제안서",
    toc: ["제안 개요", "핵심 기능", "구축 방식", "운영 지원", "예상 효과"],
    narrative: "제안 목적과 제공 범위, 구축 방식, 운영 계획을 포함한 정형 제안서 구조를 빠르게 생성합니다.",
  },
  rfp: {
    label: "RFP",
    sourceName: "rfp-template.hwpx",
    title: "AI 기반 HWPX 문서 생성 서비스 제안요청서",
    toc: ["사업 개요", "과업 범위", "기술 요건", "평가 기준", "제출 안내"],
    narrative: "발주 문서 스타일을 유지하면서 요구사항과 평가 기준 중심의 RFP 형식으로 내용을 치환합니다.",
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

const sourceInput = document.querySelector("#source-file");
const sourceName = document.querySelector("#source-name");
const titleInput = document.querySelector("#doc-title");
const tocInput = document.querySelector("#doc-toc");
const summaryTitle = document.querySelector("#summary-title");
const summaryMeta = document.querySelector("#summary-meta");
const summarySections = document.querySelector("#summary-sections");
const summaryNarrative = document.querySelector("#summary-narrative");
const analysisTemplate = document.querySelector("#analysis-template");
const analysisSize = document.querySelector("#analysis-size");
const analysisScope = document.querySelector("#analysis-scope");
const stageAnalysis = document.querySelector("#stage-analysis");
const stageOutline = document.querySelector("#stage-outline");
const stageBuild = document.querySelector("#stage-build");
const runButton = document.querySelector("#run-demo");
const runStatus = document.querySelector("#run-status");
const downloadLink = document.querySelector("#download-link");
const exampleButtons = Array.from(document.querySelectorAll("[data-example]"));
const previewKind = document.querySelector("#preview-kind");
const previewDate = document.querySelector("#preview-date");
const previewTitle = document.querySelector("#preview-title");
const previewSource = document.querySelector("#preview-source");
const previewOutline = document.querySelector("#preview-outline");
const previewBody = document.querySelector("#preview-body");
const previewFooter = document.querySelector("#preview-footer");
const chips = Array.from(document.querySelectorAll("[data-chip]"));
const aiButton = document.querySelector("#ai-fill");
const demoButton = document.querySelector("#demo-fill");

const formatSize = (bytes) => {
  if (!bytes) {
    return "71 KB";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const parseToc = (raw) =>
  raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

const defaultTocFromTitle = (title) => {
  const seed = title.trim() || "HWPX 문서 자동화";

  return [
    `${seed} 배경`,
    "원본 문서 스타일 분석",
    "내용 치환 및 목차 생성",
    "검토와 승인 절차",
    "배포 일정 및 운영",
  ];
};

const nowLabel = () =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

const sentenceForSection = (label, index, title) => {
  const templates = [
    `${title}의 핵심 맥락과 작성 배경을 원본 서식 흐름에 맞춰 정리합니다.`,
    `${label} 항목은 기존 양식의 표와 문단 스타일을 유지한 채 요약 중심으로 재작성됩니다.`,
    `AI가 ${label} 관련 본문 초안을 구성하고 사람이 마지막 검토를 진행합니다.`,
    `${label}에 포함될 승인 포인트와 검토 체크리스트를 문서 형식에 맞게 반영합니다.`,
    `${label} 단계까지 포함한 완성본을 HWPX로 다시 묶어 바로 배포 가능한 형태로 만듭니다.`,
  ];

  return templates[index] || `${label} 내용을 문서 구조에 맞게 자동 생성합니다.`;
};

const fillForm = ({ sourceName: nextSource, title, toc }) => {
  state.sourceName = nextSource;
  state.title = title;
  state.toc = toc;

  sourceName.textContent = nextSource;
  titleInput.value = title;
  tocInput.value = toc.join("\n");
  render();
};

const applyExample = (key) => {
  const example = examples[key];
  if (!example) {
    return;
  }

  state.selectedExample = key;
  state.sourceFile = null;
  state.fileSizeLabel = "71 KB";
  state.lastGeneratedFile = "";
  sourceInput.value = "";

  fillForm({
    sourceName: example.sourceName,
    title: example.title,
    toc: [...example.toc],
  });

  runStatus.textContent = `${example.label} 예시를 불러왔습니다. 실행하면 이 유형의 완성본을 생성합니다.`;
  downloadLink.classList.add("is-hidden");
};

const render = () => {
  const title = titleInput.value.trim() || state.title;
  const toc = parseToc(tocInput.value);
  const normalizedToc = toc.length ? toc : defaultTocFromTitle(title);
  const source = state.sourceName;
  const fileExtension = source.split(".").pop()?.toLowerCase();
  const detectedTemplate = fileExtension === "hwp" ? "legacy-hwp" : "gonmun";
  const currentExample = examples[state.selectedExample] || examples.minutes;

  summaryTitle.textContent = title;
  summaryMeta.textContent = `${source} 구조를 유지하고 ${normalizedToc.length}개 섹션으로 다시 작성합니다.`;
  summaryNarrative.textContent = currentExample.narrative;
  analysisTemplate.textContent = detectedTemplate;
  analysisSize.textContent = state.fileSizeLabel || "71 KB";
  analysisScope.textContent = `${23 + normalizedToc.length} text nodes`;
  stageAnalysis.textContent = `${source}에서 템플릿 타입을 감지하고, 문단 구조를 유지할 텍스트 치환 구간을 계산했습니다.`;
  stageOutline.textContent = `${normalizedToc.length}개 섹션 기준으로 제목, 요약, 첨부 일정 제목까지 함께 생성합니다.`;
  stageBuild.textContent = `build -> unpack -> pack 흐름으로 ${detectedTemplate} 스타일 초안을 다시 .hwpx로 묶습니다.`;

  summarySections.innerHTML = "";
  normalizedToc.forEach((item, index) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${item}</strong>`;
    summarySections.appendChild(li);
  });

  previewKind.textContent = currentExample.label;
  previewDate.textContent = nowLabel();
  previewTitle.textContent = title;
  previewSource.textContent = `원본 양식: ${source}`;

  previewOutline.innerHTML = "";
  previewBody.innerHTML = "";
  normalizedToc.forEach((item, index) => {
    const outlineItem = document.createElement("li");
    outlineItem.textContent = item;
    previewOutline.appendChild(outlineItem);

    const paragraph = document.createElement("div");
    paragraph.className = "document-paragraph";
    paragraph.innerHTML = `<strong>${item}</strong><p>${sentenceForSection(item, index, title)}</p>`;
    previewBody.appendChild(paragraph);
  });

  previewFooter.textContent = state.lastGeneratedFile
    ? `최근 생성 파일: ${state.lastGeneratedFile}`
    : "실행 전에는 입력값 기준으로 결과물 미리보기만 표시됩니다.";

  chips.forEach((chip) => {
    chip.classList.toggle("is-active", normalizedToc.includes(chip.dataset.chip));
  });

  exampleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.example === state.selectedExample);
  });
};

sourceInput?.addEventListener("change", (event) => {
  const [file] = event.target.files ?? [];
  if (!file) {
    state.sourceFile = null;
    return;
  }

  state.sourceFile = file;
  state.sourceName = file.name;
  state.fileSizeLabel = formatSize(file.size);
  state.lastGeneratedFile = "";
  sourceName.textContent = file.name;
  runStatus.textContent = `${file.name} 업로드 준비가 끝났습니다. 실행을 누르면 실제 HWPX를 생성합니다.`;
  downloadLink.classList.add("is-hidden");
  render();
});

titleInput?.addEventListener("input", render);
tocInput?.addEventListener("input", render);

aiButton?.addEventListener("click", () => {
  const title = titleInput.value.trim() || state.title;
  tocInput.value = defaultTocFromTitle(title).join("\n");
  render();
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyExample(button.dataset.example);
  });
});

demoButton?.addEventListener("click", () => {
  applyExample("proposal");
});

runButton?.addEventListener("click", async () => {
  const title = titleInput.value.trim() || state.title;
  const parsedToc = parseToc(tocInput.value);
  const normalizedToc = parsedToc.length ? parsedToc : defaultTocFromTitle(title);
  const formData = new FormData();

  formData.append("title", title);
  formData.append("toc", normalizedToc.join("\n"));

  if (state.sourceFile) {
    formData.append("source_file", state.sourceFile);
  }

  runButton.disabled = true;
  runButton.textContent = "생성 중...";
  downloadLink.classList.add("is-hidden");
  runStatus.textContent = "원본 구조를 분석하고 실제 HWPX 파일을 생성하고 있습니다.";

  try {
    const response = await fetch("/generate.php", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || payload.details || "문서 생성에 실패했습니다.");
    }

    state.lastGeneratedFile = payload.fileName || "generated.hwpx";
    downloadLink.href = payload.downloadUrl;
    downloadLink.setAttribute("download", state.lastGeneratedFile);
    downloadLink.classList.remove("is-hidden");
    runStatus.textContent = `${payload.message} ${payload.sourceName} 기준 결과를 바로 내려받을 수 있습니다.`;
    render();
  } catch (error) {
    runStatus.textContent = error.message;
  } finally {
    runButton.disabled = false;
    runButton.textContent = "실행";
  }
});

fillForm({
  sourceName: state.sourceName,
  title: "AI 기반 한글 문서 자동생성 서비스",
  toc: state.toc,
});
