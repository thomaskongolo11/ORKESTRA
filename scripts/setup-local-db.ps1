# ORKESTRA - Configuration de la base PostgreSQL locale (Windows / PowerShell)
#
# Ce script :
#   1. crée (ou met à jour) l'utilisateur PostgreSQL "orkestra" ;
#   2. crée les bases "orkestra" et "orkestra_test" si elles n'existent pas ;
#   3. écrit DATABASE_URL et TEST_DATABASE_URL dans .env ;
#   4. applique les migrations Prisma sur les deux bases ;
#   5. lance les tests.
#
# Utilisation, depuis la racine du projet :
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-db.ps1
#
# Les mots de passe sont saisis de façon masquée et ne sont jamais affichés.

$ErrorActionPreference = "Stop"

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }

# Se placer à la racine du projet (dossier parent de /scripts)
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "package.json")) { throw "Lance ce script depuis le projet ORKESTRA." }

Step "Recherche de psql"
$psqlItem = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1
if (-not $psqlItem) { throw "psql.exe introuvable. PostgreSQL est-il installé dans C:\Program Files\PostgreSQL ?" }
$psql = $psqlItem.FullName
Write-Host "psql : $psql"

Step "Mots de passe"
$pgPassword = Read-Secret "Mot de passe de l'utilisateur postgres (choisi à l'installation)"
do {
  $orkPassword = Read-Secret "Mot de passe à donner à l'utilisateur orkestra (lettres et chiffres, 8 caractères minimum)"
  $valid = $orkPassword -match '^[A-Za-z0-9]{8,}$'
  if (-not $valid) { Write-Host "Utilise uniquement des lettres et des chiffres, 8 caractères minimum." -ForegroundColor Yellow }
} while (-not $valid)

$env:PGPASSWORD = $pgPassword
try {
  function Invoke-Psql([string]$sql) {
    # Windows PowerShell transforme la sortie d'erreur d'un programme en exception
    # quand ErrorActionPreference vaut Stop : on vérifie plutôt le code de retour.
    $ErrorActionPreference = "Continue"
    $out = & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -tA -c $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Erreur PostgreSQL : $out" }
    return ($out | Out-String).Trim()
  }

  Step "Connexion à PostgreSQL"
  Invoke-Psql "SELECT 1;" | Out-Null
  Write-Host "Connexion réussie."

  Step "Utilisateur orkestra"
  if ((Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname = 'orkestra';") -eq "1") {
    Invoke-Psql "ALTER ROLE orkestra WITH LOGIN CREATEDB PASSWORD '$orkPassword';" | Out-Null
    Write-Host "Utilisateur existant : mot de passe mis à jour."
  } else {
    Invoke-Psql "CREATE ROLE orkestra WITH LOGIN CREATEDB PASSWORD '$orkPassword';" | Out-Null
    Write-Host "Utilisateur créé."
  }

  Step "Bases de données"
  foreach ($db in @("orkestra", "orkestra_test")) {
    if ((Invoke-Psql "SELECT 1 FROM pg_database WHERE datname = '$db';") -eq "1") {
      Write-Host "$db : existe déjà."
    } else {
      Invoke-Psql "CREATE DATABASE $db OWNER orkestra;" | Out-Null
      Write-Host "$db : créée."
    }
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $pgPassword = $null
}

Step "Fichier .env"
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Write-Host ".env créé à partir de .env.example." }
$devUrl  = "postgresql://orkestra:$orkPassword@localhost:5432/orkestra?schema=public"
$testUrl = "postgresql://orkestra:$orkPassword@localhost:5432/orkestra_test?schema=public"
$lines = Get-Content ".env"
$hasDev = $false; $hasTest = $false
$lines = foreach ($line in $lines) {
  if ($line -match '^DATABASE_URL=') { $hasDev = $true; "DATABASE_URL=`"$devUrl`"" }
  elseif ($line -match '^TEST_DATABASE_URL=') { $hasTest = $true; "TEST_DATABASE_URL=`"$testUrl`"" }
  else { $line }
}
if (-not $hasDev)  { $lines += "DATABASE_URL=`"$devUrl`"" }
if (-not $hasTest) { $lines += "TEST_DATABASE_URL=`"$testUrl`"" }
[IO.File]::WriteAllLines((Join-Path (Get-Location) ".env"), $lines)
Write-Host ".env mis à jour (DATABASE_URL et TEST_DATABASE_URL)."

Step "Migrations : base de développement"
pnpm db:migrate:deploy
if ($LASTEXITCODE -ne 0) { throw "Échec des migrations sur la base orkestra." }

Step "Migrations : base de test"
$env:DATABASE_URL = $testUrl
try {
  pnpm db:migrate:deploy
  if ($LASTEXITCODE -ne 0) { throw "Échec des migrations sur la base orkestra_test." }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

Step "Tests"
pnpm test
if ($LASTEXITCODE -ne 0) { throw "Des tests ont échoué." }

Write-Host ""
Write-Host "Terminé : base configurée, migrations appliquées, tests réussis." -ForegroundColor Green
