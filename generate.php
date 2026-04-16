<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only'], JSON_UNESCAPED_UNICODE);
    exit;
}

$title = trim((string) ($_POST['title'] ?? ''));
$toc = trim((string) ($_POST['toc'] ?? ''));

if ($title === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => '제목을 입력해 주세요.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$workspace = __DIR__;
$runtimeDir = $workspace . '/runtime';
$uploadsDir = $runtimeDir . '/uploads';
$generatedDir = $workspace . '/generated';

foreach ([$runtimeDir, $uploadsDir, $generatedDir] as $directory) {
    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => '실행 디렉터리를 만들지 못했습니다.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$sourceName = 'sample-template.hwpx';
$sourcePath = null;
$uploaded = $_FILES['source_file'] ?? null;

if ($uploaded && ($uploaded['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    if (($uploaded['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => '업로드 중 오류가 발생했습니다.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $originalName = basename((string) ($uploaded['name'] ?? 'uploaded.hwpx'));
    $extension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));

    if ($extension !== 'hwpx') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => '현재 데모는 .hwpx 파일만 지원합니다.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $sourceName = $originalName;
    $token = bin2hex(random_bytes(6));
    $safeName = preg_replace('/[^A-Za-z0-9._-]/', '-', $sourceName) ?: 'uploaded.hwpx';
    $sourcePath = $uploadsDir . '/' . $token . '-' . $safeName;

    if (!move_uploaded_file((string) $uploaded['tmp_name'], $sourcePath)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => '업로드 파일 저장에 실패했습니다.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$outputToken = bin2hex(random_bytes(6));
$outputPath = $generatedDir . '/' . $outputToken . '-generated.hwpx';

$commandParts = [
    'python3',
    $workspace . '/scripts/build_hwpx.py',
    '--template',
    'gonmun',
    '--output',
    $outputPath,
    '--title',
    $title,
    '--toc',
    $toc,
    '--source-document',
    $sourceName,
];

if ($sourcePath !== null) {
    $commandParts[] = '--template-file';
    $commandParts[] = $sourcePath;
}

$escapedParts = array_map('escapeshellarg', $commandParts);
$command = implode(' ', $escapedParts) . ' 2>&1';
$output = [];
$exitCode = 0;
exec($command, $output, $exitCode);

if ($sourcePath !== null && is_file($sourcePath)) {
    unlink($sourcePath);
}

if ($exitCode !== 0 || !is_file($outputPath)) {
    http_response_code(500);
    echo json_encode(
        [
            'ok' => false,
            'error' => '문서 생성에 실패했습니다.',
            'details' => implode("\n", $output),
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

echo json_encode(
    [
        'ok' => true,
        'downloadUrl' => '/generated/' . basename($outputPath),
        'fileName' => basename($outputPath),
        'sourceName' => $sourceName,
        'message' => '완성된 HWPX 파일이 생성되었습니다.',
    ],
    JSON_UNESCAPED_UNICODE
);
