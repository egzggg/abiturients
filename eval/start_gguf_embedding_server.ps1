param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('4b', '8b')]
    [string]$Model
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tools = Join-Path $root '.venv\tools\llama'
$server = Get-ChildItem -LiteralPath $tools -Recurse -Filter 'llama-server.exe' -File -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $server) {
    throw "llama-server.exe not found under $tools. Extract the official llama.cpp CUDA archives there."
}

if ($Model -eq '4b') {
    $filename = 'Qwen3-Embedding-4B-Q8_0.gguf'
    $directory = 'qwen3-embedding-4b-gguf'
    $alias = 'qwen3-embedding-4b-q8'
} else {
    $filename = 'Qwen3-Embedding-8B-Q4_K_M.gguf'
    $directory = 'qwen3-embedding-8b-gguf'
    $alias = 'qwen3-embedding-8b-q4'
}

$modelPath = Join-Path $root ".venv\models\$directory\$filename"
if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
    throw "Model file not found: $modelPath"
}

Write-Host "Starting $alias from $modelPath"
& $server -m $modelPath --embedding --pooling last -ngl 99 -c 4096 -b 512 -ub 512 --alias $alias --host 127.0.0.1 --port 8081
