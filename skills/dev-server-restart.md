# Skill: Dev Server Restart (fresh state)

**When to use**: `package.json` 수정, `vite.config.js` 수정, node_modules 재설치, Vite/rhwp WASM 관련 이슈, "이상한 캐시 문제" 체감 시.

**왜 존재하는지**: Vite dev 서버는 HMR 로 코드 변경을 반영하지만, **의존성 변경은 반영 안 함**. 메모리의 모듈 그래프가 stale 이 된다. 브라우저도 WASM / JS 파일을 캐시한다. 이 조합으로 `*Vite import requires a callable*` 같은 난해한 에러가 재현된다.

## 단계

1. 기존 프로세스 모두 종료
   ```bash
   pkill -f 'vite' ; pkill -f 'v4/server/index.js' ; pkill -f 'concurrently'
   sleep 1
   lsof -nP -i:5188 -i:8788
   # 출력 비어 있어야 함
   ```

2. Vite cache 삭제 (양쪽 location)
   ```bash
   rm -rf v4/client/node_modules/.vite v3/node_modules/.vite
   ```

3. 필요 시 node_modules 재설치
   ```bash
   cd v4 && npm install
   ```

4. dev 서버 재기동
   ```bash
   cd v4 && npm run dev
   ```

5. 브라우저 하드 리프레시
   - Mac: `Cmd + Shift + R`
   - DevTools 열고 Network 탭 → **Disable cache** 체크

6. Smoke test 로 확인
   ```bash
   bash v4/tools/smoke-test.sh
   ```

## 절대 하지 말 것

- 서버 안 내리고 `npm install` → 기존 프로세스가 stale 모듈 유지
- 한쪽 cache 만 지우기 → workspace 는 양쪽에 잠재적 cache
- 브라우저 리프레시 안 하고 "고쳐졌을 것" 추측 → WASM 은 HTTP 캐시에 그대로 박혀 있음
