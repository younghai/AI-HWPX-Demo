import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

// 저장소 경로의 단일 출처 (SPEC-P3-a). 과거 v3Root/v4Root/repoRoot 세 이름으로
// 파일마다 재계산되던 repo 루트와, 서비스(hwpxBuilder)에서 export 되어 레이어를
// 역전시키던 generatedDirectory 를 여기로 모은다.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(__dirname, '..', '..')
export const scriptsDir = path.join(repoRoot, 'scripts')
// 생성된 HWPX 가 서빙되는 공개 디렉토리(/generated 정적 마운트 + 이력 목록).
export const generatedDirectory = path.join(repoRoot, 'generated')
// 업로드 원본·중간 JSON 용 비공개 작업 디렉토리(절대 서빙되지 않음).
export const workDirectory = path.join(repoRoot, '.work')

// 프로젝트 venv 가 있으면 그 파이썬을, 없으면 시스템 python3 를 쓴다.
// (빌더는 venv-인식이었지만 validator 는 'python3' 하드코딩 — 같은 저장소의
// 워커를 서로 다른 인터프리터로 실행하던 드리프트의 해소점.)
const venvPython = path.join(repoRoot, '.venv', 'bin', 'python3')
export const pythonCmd = existsSync(venvPython) ? venvPython : 'python3'
