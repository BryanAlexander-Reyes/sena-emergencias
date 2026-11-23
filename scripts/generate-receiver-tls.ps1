# ============================================================================
# Certificado TLS autofirmado del receptor LAN (SOLO desarrollo/prueba).
#
# Genera receiver/tls/receptor.pfx (servidor Node) y receiver/tls/receptor.cer
# (para instalar en el teléfono Android y en el navegador del PC). Actualiza
# en .env únicamente TELEMETRY_TLS_PFX, TELEMETRY_TLS_PASSPHRASE y
# TELEMETRY_BASE_URL. Nunca imprime la contraseña ni otras variables.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-receiver-tls.ps1
#   (opcional) -Ip 192.168.40.12 -IpAlternativa 192.168.137.1
#
# No es un certificado público: no sirve para producción ni para una APK
# distribuida fuera de esta LAN. No despliega ningún servicio.
# ============================================================================

param(
  [string]$Ip = '192.168.40.12',
  [string]$IpAlternativa = '192.168.137.1',
  # Opcional: instala la confianza en el usuario actual de Windows (pide
  # confirmación). Sin este switch, instalar receiver.cer manualmente cuando
  # se quiera usar el navegador del PC contra el receptor HTTPS.
  [switch]$InstalarConfianza
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'receiver\tls'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# SAN con las IP de la LAN (Wi-Fi y hotspot) y loopback. EKU servidor.
# El receptor se consume por IP, no por nombre DNS.
$san = "2.5.29.17={text}IP Address=$Ip&IP Address=$IpAlternativa&IP Address=127.0.0.1"
$cert = New-SelfSignedCertificate `
  -Subject 'CN=SENA Receptor LAN' `
  -FriendlyName 'SENA Receptor LAN (desarrollo)' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -Provider 'Microsoft Enhanced RSA and AES Cryptographic Provider' `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1') `
  -NotAfter (Get-Date).AddYears(2)

# Contraseña aleatoria del PFX: se guarda en .env, nunca se imprime.
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pass = [Convert]::ToBase64String($bytes)
$secure = ConvertTo-SecureString -String $pass -AsPlainText -Force

$pfxPath = Join-Path $dir 'receptor.pfx'
$cerPath = Join-Path $dir 'receptor.cer'
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

# Copia PEM de la CA para pruebas Node (NODE_EXTRA_CA_CERTS) y otros clientes
# que no aceptan DER. El .cer DER sigue siendo el archivo para el teléfono.
$raw = [System.IO.File]::ReadAllBytes($cerPath)
$pem = "-----BEGIN CERTIFICATE-----`r`n" +
  [Convert]::ToBase64String($raw, [Base64FormattingOptions]::InsertLineBreaks) +
  "`r`n-----END CERTIFICATE-----`r`n"
[System.IO.File]::WriteAllText((Join-Path $dir 'receptor-ca.pem'), $pem)

# Confianza solo para el usuario actual de Windows (navegador del PC),
# únicamente si se pide explícitamente. El teléfono debe instalar
# receptor.cer manualmente como CA de usuario.
if ($InstalarConfianza) {
  try {
    Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    Write-Host '[tls] Confianza instalada para el usuario actual de Windows.'
  } catch {
    Write-Host '[tls] AVISO: no se instalo la confianza en Windows; instalar receiver/tls/receptor.cer manualmente.'
  }
}

# El certificado ya está exportado: se retira del almacén personal.
Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey

# Actualiza SOLO las tres claves del receptor en .env (sin imprimir valores).
$envPath = Join-Path $root '.env'
$lineas = @()
if (Test-Path $envPath) { $lineas = @(Get-Content $envPath) }
$objetivos = [ordered]@{
  'TELEMETRY_TLS_PFX'        = 'receiver/tls/receptor.pfx'
  'TELEMETRY_TLS_PASSPHRASE' = $pass
  'TELEMETRY_BASE_URL'       = "https://${Ip}:3000"
}
$vistas = @{}
$nuevas = foreach ($linea in $lineas) {
  $m = [regex]::Match($linea, '^\s*(TELEMETRY_TLS_PFX|TELEMETRY_TLS_PASSPHRASE|TELEMETRY_BASE_URL)\s*=')
  if ($m.Success) {
    $clave = $m.Groups[1].Value
    $vistas[$clave] = $true
    "$clave=$($objetivos[$clave])"
  } else {
    $linea
  }
}
foreach ($clave in $objetivos.Keys) {
  if (-not $vistas.ContainsKey($clave)) { $nuevas += "$clave=$($objetivos[$clave])" }
}
[System.IO.File]::WriteAllLines($envPath, $nuevas)

Write-Host "[tls] Certificado generado: receiver/tls/receptor.pfx y receiver/tls/receptor.cer"
Write-Host "[tls] .env actualizado: TELEMETRY_TLS_PFX, TELEMETRY_TLS_PASSPHRASE, TELEMETRY_BASE_URL=https://${Ip}:3000"
Write-Host "[tls] Telefono: instalar receiver/tls/receptor.cer como certificado de CA (Ajustes > Seguridad)."
