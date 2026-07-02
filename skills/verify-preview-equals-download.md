# Skill: Verify Preview = Download

**When to use**: 초안 생성 / HWPX 빌드 / `apply_smart_replacements` / `normalize_toc` / `_normalize_paragraph` 관련 코드를 수정한 직후. 또는 "AI 내용 반영 안 된다" 같은 사용자 리포트 대응 시.

**완료 선언 전에 반드시 돌릴 것** (CLAUDE.md R1).

## 단계

1. dev 서버 돌고 있는지 확인
   ```bash
   lsof -nP -i:5188 -i:8788 | head
   # 없으면: cd v4 && npm run dev
   ```

2. smoke-test 실행
   ```bash
   bash v4/tools/smoke-test.sh
   ```

3. 실패 항목 진단
   - **단계 5 wasm magic 불일치** → Vite cache stale. `rm -rf v4/client/node_modules/.vite v3/node_modules/.vite` + dev 서버 재시작
   - **단계 6 markers missing** → Python `apply_smart_replacements` / `normalize_toc` 회귀. `docs/adr/0003-ai-content-integrity.md` invariant 위반 여부 확인
   - **health/providers 실패** → 서버 부팅 실패. `/tmp/omc-dev.log` 확인

4. 수동 추가 검증 (edge case)
   ```bash
   # AI가 1 섹션, 1 문장만 주는 시나리오
   curl -X POST http://127.0.0.1:8788/api/export-hwpx \
     -F "title=EDGE_1" \
     -F "toc=섹션A" \
     -F 'sections=[{"heading":"섹션A","body":"OneSentence."}]' \
     -F 'diagrams=[]' \
     -F "sourceMode=hwpx-template" \
     -F "sourceFile=@templates/gonmun.hwpx" | jq -r .downloadUrl | xargs -I {} curl http://127.0.0.1:8788{} -o /tmp/edge1.hwpx

   python3 v4/tools/verify-hwpx-markers.py /tmp/edge1.hwpx OneSentence
   # 결과: 정확히 1회. 중복 있으면 pad 버그 회귀
   ```

## Failure Mode 체크리스트

- [ ] 마커가 **정확히 1회씩** 등장 (중복 0)
- [ ] `추가 섹션 N` 같은 pad 헤딩 0개
- [ ] `원본 서식에 맞게 기술합니다` 같은 generic fallback 0개
- [ ] AI 가 준 body 없으면 해당 섹션은 빈 상태 (placeholder 누수 0)
- [ ] 제목 단락에 `폰트 HY헤드라인M, 크기 18` 같은 템플릿 보일러플레이트 0개
