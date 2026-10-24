$ErrorActionPreference = 'Stop'
try {
    Set-Location (Split-Path $PSScriptRoot -Parent)
    if (Test-Path '.env') { throw '既に.envがあります。変更する場合は.envを編集してください。' }
    Write-Host '自分専用のDiscord BotとMinecraftアカウントを設定します。'
    $owner = (Read-Host '操作する本人のDiscordユーザーID').Trim()
    if ($owner -notmatch '^[1-9][0-9]{16,19}$') { throw 'メンションではなく数字のユーザーIDを入力してください。' }
    $guild = (Read-Host 'DiscordサーバーID（空欄も可）').Trim()
    if ($guild -and $guild -notmatch '^[1-9][0-9]{16,19}$') { throw 'DiscordサーバーIDが正しくありません。' }
    Write-Host 'Minecraftのゲーマータグは起動後にWebから追加します。'
    $secret = Read-Host '自分のDiscord Botトークン（入力は非表示）' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if (-not $token -or $token -match '[\x22\x27\s]') { throw 'Discord Botトークンが正しくありません。' }
    $lines = @("DISCORD_OWNER_ID=$owner", "DISCORD_TOKEN='$token'", "DISCORD_GUILD_ID=$guild", 'MC_HOST=2b2e.org', 'MC_PORT=19132', 'MC_VERSION=1.26.51', 'DATA_DIR=./data', 'PORT=3000')
    [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines, (New-Object System.Text.UTF8Encoding($false)))
    $token = $null
    Write-Host '設定を保存しました。.envとdataフォルダーは人に渡さないでください。'
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
