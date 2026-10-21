param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path $root){throw 'Preserve existing signed-fixture work; choose a new run directory'}
$tools=@{}
# .NET rather than Get-FileHash: that cmdlet is a script function in Windows PowerShell's Utility module, which an
# inherited PowerShell 7 module path leaves unloadable, as on a hosted runner
function Get-Sha256([string]$file){$sha=[Security.Cryptography.SHA256]::Create();try{-join ($sha.ComputeHash([IO.File]::ReadAllBytes($file))|ForEach-Object{$_.ToString('x2')})}finally{$sha.Dispose()}}
foreach($toolName in @('cl.exe','mt.exe','makecat.exe')){$tools[$toolName]=(Get-Command $toolName -ErrorAction Stop).Source}
$extractor=Get-Item (Join-Path (Split-Path $tools['mt.exe']) 'pktextract.exe')
New-Item -ItemType Directory $root | Out-Null
Set-Location $root
$commands=New-Object System.Collections.Generic.List[object]
function Invoke-FixtureTool([string]$executable,[string[]]$toolArgs){
 $previousAction=$ErrorActionPreference
 $ErrorActionPreference='Continue'
 try {$toolOutput=& $executable @toolArgs 2>&1; $code=$LASTEXITCODE}
 finally {$ErrorActionPreference=$previousAction}
 $commands.Add(@{executable=$executable;arguments=$toolArgs;code=$code;output=($toolOutput -join "`n")})
 $commands | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 "$root\commands.json"
 if($code -ne 0){throw "Fixture tool failed: $executable ($code)"}
 return ($toolOutput -join "`n")
}
$name='apack.fixture.publisher.a'+[guid]::NewGuid().ToString('N')
Add-Type -AssemblyName System.Security
$certificate=$null
$key=$null
try {
 $key=[System.Security.Cryptography.RSACng]::new(2048)
 $request=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new("CN=$name",$key,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $usages=[System.Security.Cryptography.OidCollection]::new()
 $usages.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3')) | Out-Null
 $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usages,$false))
 $certificate=$request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-1),[DateTimeOffset]::Now.AddDays(1))
 [IO.File]::WriteAllBytes("$root\fixture.cer",$certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
 Copy-Item $extractor.FullName "$root\pktextract.exe"
 $tokenOutput=Invoke-FixtureTool "$root\pktextract.exe" @('fixture.cer','-quiet','-nologo')
 $tokens=[regex]::Matches($tokenOutput,'(?i)\b[0-9a-f]{16}\b')
 if($tokens.Count -ne 1){throw "Expected one public key token: $tokenOutput"}
 $token=$tokens[0].Value.ToLowerInvariant()
 $entries=New-Object System.Collections.Generic.List[object]
 foreach($part in @(@{folder='v1';version='1.0.0.0';value=11},@{folder='v2';version='1.0.1.0';value=22},@{folder='policy';version='1.0.0.0';value=$null})){
  $directory=New-Item -ItemType Directory "$root\$($part.folder)"
  Set-Location $directory.FullName
  $policy=$part.folder -eq 'policy'
  $assemblyName=if($policy){'policy.1.0.'+$name}else{$name}
  $assemblyType=if($policy){'win32-policy'}else{'win32'}
  $body=if($policy){"<dependency><dependentAssembly><assemblyIdentity type=`"win32`" name=`"$name`" processorArchitecture=`"amd64`" publicKeyToken=`"$token`"/><bindingRedirect oldVersion=`"1.0.0.0`" newVersion=`"1.0.1.0`"/></dependentAssembly></dependency>"}else{'<file name="apack_policy_value.dll"/>'}
  if(!$policy){
   "__declspec(dllexport) int native_value(void){return $($part.value);}" | Set-Content -Encoding ASCII value.c
   Invoke-FixtureTool $tools['cl.exe'] @('/nologo','/MT','/LD','value.c','/Fovalue.obj','/link','/MANIFEST:NO','/OUT:apack_policy_value.dll') | Out-Null
  }
  $manifest="$assemblyName.manifest"
  "<?xml version=`"1.0`"?><assembly xmlns=`"urn:schemas-microsoft-com:asm.v1`" manifestVersion=`"1.0`"><assemblyIdentity type=`"$assemblyType`" name=`"$assemblyName`" version=`"$($part.version)`" processorArchitecture=`"amd64`" publicKeyToken=`"$token`"/>$body</assembly>" | Set-Content -Encoding UTF8 $manifest
  Invoke-FixtureTool $tools['mt.exe'] @('-nologo','-manifest',$manifest,'-hashupdate','-makecdfs') | Out-Null
  $cdf=@(Get-ChildItem -Filter *.cdf)
  if($cdf.Count -ne 1){throw 'Expected one generated catalog definition'}
  Invoke-FixtureTool $tools['makecat.exe'] @($cdf[0].Name) | Out-Null
  $catalog=@(Get-ChildItem -Filter *.cat)
  if($catalog.Count -ne 1){throw 'Expected one generated catalog'}
  $signed=[System.Security.Cryptography.Pkcs.SignedCms]::new()
  $signed.Decode([IO.File]::ReadAllBytes($catalog[0].FullName))
  $content=[Convert]::ToBase64String($signed.ContentInfo.Content)
  $signer=[System.Security.Cryptography.Pkcs.CmsSigner]::new($certificate)
  $signer.DigestAlgorithm=[System.Security.Cryptography.Oid]::new('2.16.840.1.101.3.4.2.1')
  $signer.IncludeOption=[System.Security.Cryptography.X509Certificates.X509IncludeOption]::EndCertOnly
  $signed.ComputeSignature($signer,$true)
  $encoded=$signed.Encode()
  $verified=[System.Security.Cryptography.Pkcs.SignedCms]::new()
  $verified.Decode($encoded)
  $verified.CheckSignature($true)
  if($verified.SignerInfos.Count -ne 1 -or [Convert]::ToBase64String($verified.ContentInfo.Content) -ne $content){throw 'Catalog signing changed content or signer count'}
  [IO.File]::WriteAllBytes($catalog[0].FullName,$encoded)
  $identity="$assemblyName,version=`"$($part.version)`",processorArchitecture=`"amd64`",publicKeyToken=`"$token`",type=`"$assemblyType`""
  $entries.Add(@{folder=$part.folder;identity=$identity;manifest=(Join-Path $directory.FullName $manifest);catalog=$catalog[0].FullName;catalogSha256=(Get-Sha256 $catalog[0].FullName)})
 }
 @{status='prepared-only';name=$name;token=$token;certificateThumbprint=$certificate.Thumbprint;entries=$entries;tools=$tools;extractor=$extractor.FullName} | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 "$root\prepared.json"
} finally {
 if($certificate){$certificate.Dispose()}
 if($key){$key.Dispose()}
 'Disposed process-owned signing handles; no private key file or certificate enrollment was used.' | Set-Content "$root\certificate-cleanup.txt"
}
Get-Content "$root\prepared.json"
