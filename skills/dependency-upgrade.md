# Skill: Dependency Upgrade (특히 rhwp / native binding 포함 패키지)

**When to use**: `package.json` 의 의존성 버전을 올리거나 새 패키지 추가 시. 특히:
- `@rhwp/core` — ADR-0001 참조
- `cairosvg`, `cairocffi` — 네이티브 cairo 의존
- wasm-bindgen 기반 패키지 일반

**Rule R2 (CLAUDE.md)**: 네이티브 바인딩 있는 deps 는 `^` 금지, **exact pin**.

## 단계

1. 업그레이드 제안 전에 ADR/lessons-learned 확인
   ```bash
   grep -r '<package-name>' v4/docs/
   ```

2. 임시 브랜치에서만 시도
   ```bash
   git checkout -b deps-bump-<package>-<version>
   npm install <package>@<version> --workspace v4/client
   ```

3. Full smoke + 브라우저 수동 테스트
   ```bash
   bash v3/skills/dev-server-restart.md  # (재시작 절차)
   bash v4/tools/smoke-test.sh
   # 브라우저 하드 리프레시 + 실제 업로드 → 생성 → 다운로드 → 한컴에서 열기
   ```

4. 성공 시
   - `package.json` 에 **exact pin** (`"<version>"` — `^`, `~` 금지)
   - `docs/adr/` 에 새 ADR 추가 또는 기존 ADR 업데이트
   - `docs/lessons-learned.md` 에 경험 기록

5. 실패 시
   - 롤백: `git checkout -- package.json && rm -rf v3/node_modules/@rhwp v4/client/node_modules/@rhwp && npm install`
   - `docs/lessons-learned.md` 에 실패 원인 기록 → 다음에 같은 시도 반복 금지

## 롤백 체크리스트 (rhwp 0.7.3 → 0.7.2 실패 케이스 기준)

- [ ] `package.json` 롤백
- [ ] `npm install` 로 이전 버전 재설치
- [ ] **모든 location** 에서 stale `@rhwp` 제거 (workspace 는 client OR 루트 양쪽에 있을 수 있음)
- [ ] Vite cache 삭제 (`rm -rf v3/*/node_modules/.vite`)
- [ ] dev 서버 재시작
- [ ] 브라우저 하드 리프레시
- [ ] `smoke-test.sh` PASS
- [ ] `docs/lessons-learned.md` 업데이트
