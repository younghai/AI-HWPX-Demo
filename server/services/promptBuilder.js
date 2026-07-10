export function buildDocFieldLines(meta, docFields) {
  const values = (docFields && typeof docFields === 'object') ? docFields : {}
  return meta.fields
    .map((f) => {
      const value = String(values[f.key] || '').trim()
      return value ? `${f.label}: ${value}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function buildPrompt({ effectiveText, hasUploadedTemplate, title, docLabel, companyName, goal, notes, fallbackToc, templateBodySlots, guidance, docFieldLines }) {
  const typeBlock = [
    guidance ? `문서 유형 지침: ${guidance}` : '',
    docFieldLines || ''
  ].filter(Boolean).join('\n')
  // v3 P1: 템플릿 본문 슬롯 수가 감지되면 해당 섹션 수만큼 필수 반환
  const sectionCountGuide = templateBodySlots && templateBodySlots > 0
    ? `업로드한 템플릿에는 약 ${templateBodySlots}개의 본문 단락 슬롯이 있습니다. 이를 고려해 섹션을 충분히(최소 5개 이상) 구성하되, 각 섹션의 body 에는 3~5개의 완결된 문장(마침표로 구분)을 포함하세요.`
    : `섹션은 5개 이상 구성하고, 각 섹션 body 에는 3~5개의 완결된 문장(마침표로 구분)을 포함하세요.`

  const sharedDiagramSpec = `${sectionCountGuide}

다이어그램 data 형식:
- flowchart: data = ["단계1", "단계2", "단계3"] (최대 5개)
- timeline: data = [{"label": "이벤트명", "date": "2024.01"}, ...] (최대 6개)
- comparison: data = [{"label": "항목", "a": "현재값", "b": "개선값", "header_a": "현재", "header_b": "개선"}, ...] (최대 5개)
문서 내용에 가장 적합한 타입의 다이어그램을 1~2개 생성하세요. 불필요하면 빈 배열 []로 두세요.

⚠️ 중요 규칙:
- 모든 섹션의 body 는 반드시 내용을 채워라. 빈 body 금지.
- 섹션 간 본문을 중복·재사용하지 마라. 각 섹션은 독립적인 내용이어야 한다.
- 마침표로 끝나는 완결 문장만 포함. 미완성 조각 금지.

응답은 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요:
{
  "summary": "문서 전체 요약 (1~2문장)",
  "sections": [
    {"heading": "섹션 제목", "body": "해당 섹션 본문 내용 (3~5문장, 마침표 구분)"}
  ],
  "diagrams": [
    {"_diagram": true, "afterSection": "해당 섹션 제목", "type": "flowchart|timeline|comparison", "title": "다이어그램 제목", "data": []}
  ]
}`

  if (hasUploadedTemplate) {
    return `당신은 한국어 공식 문서 작성 전문가입니다.

아래는 사용자가 업로드한 원본 템플릿 문서에서 추출한 텍스트입니다:
---
${effectiveText}
---

위 원본 템플릿의 구조(제목, 목차, 섹션 순서, 문체)를 최대한 유지하면서, "${title}" 제목의 새로운 ${docLabel}를 작성해 주세요.
원본 템플릿에 있는 섹션 제목과 구조를 그대로 따르되, 본문 내용만 새로 작성하세요.

회사명: ${companyName}
${typeBlock}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

${sharedDiagramSpec}`
  }

  return `당신은 한국어 공식 문서 작성 전문가입니다.

아래 조건에 맞는 "${title}" 제목의 ${docLabel}를 작성해 주세요.

회사명: ${companyName}
${typeBlock}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

아래 목차 구조에 맞춰 각 섹션의 본문을 작성하세요:
${fallbackToc.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${sharedDiagramSpec}`
}
