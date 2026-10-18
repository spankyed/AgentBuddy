# Add-Type launches csc.exe before the worker job exists. Own that bootstrap as well.
# Emit only the P/Invoke declarations so establishing ownership never starts another compiler.
$assembly = [AppDomain]::CurrentDomain.DefineDynamicAssembly(
  (New-Object Reflection.AssemblyName('ApackCompilerHelperJob')), [Reflection.Emit.AssemblyBuilderAccess]::Run)
$native = $assembly.DefineDynamicModule('Native').DefineType('ApackCompilerHelperJobNative', 'Public, Abstract, Sealed')
$imports = @(
  @{ Name = 'CreateJobObjectW'; Result = [IntPtr]; Args = [Type[]]@([IntPtr], [string]) },
  @{ Name = 'SetInformationJobObject'; Result = [bool]; Args = [Type[]]@([IntPtr], [int], [IntPtr], [uint32]) },
  @{ Name = 'AssignProcessToJobObject'; Result = [bool]; Args = [Type[]]@([IntPtr], [IntPtr]) },
  @{ Name = 'CloseHandle'; Result = [bool]; Args = [Type[]]@([IntPtr]) }
)
foreach ($import in $imports) {
  $method = $native.DefinePInvokeMethod($import.Name, 'kernel32.dll',
    [Reflection.MethodAttributes]'Public, Static, PinvokeImpl', [Reflection.CallingConventions]::Standard,
    $import.Result, $import.Args, [Runtime.InteropServices.CallingConvention]::Winapi,
    [Runtime.InteropServices.CharSet]::Unicode)
  $method.SetImplementationFlags([Reflection.MethodImplAttributes]::PreserveSig)
}
$api = $native.CreateType()
$job = $api::CreateJobObjectW([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw 'Cannot create compiler helper job' }
$assigned = $false
$limits = [IntPtr]::Zero
try {
  # JOBOBJECT_EXTENDED_LIMIT_INFORMATION: BasicLimitInformation.LimitFlags is at byte 16.
  $size = if ([IntPtr]::Size -eq 8) { 144 } else { 112 }
  $limits = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
  [Runtime.InteropServices.Marshal]::Copy((New-Object byte[] $size), 0, $limits, $size)
  [Runtime.InteropServices.Marshal]::WriteInt32($limits, 16, 0x2000) # KILL_ON_JOB_CLOSE; no breakaway.
  if (!$api::SetInformationJobObject($job, 9, $limits, $size)) { throw 'Cannot set compiler helper job limits' }
  if (!$api::AssignProcessToJobObject($job, [IntPtr](-1))) { throw 'Cannot assign compiler helper job' }
  $assigned = $true
  # Non-inheritable handle: process teardown closes it and stops all remaining descendants.
  # Do not close it during normal script cleanup: the helper itself is a job member.
  $script:ApackCompilerHelperJob = $job
} finally {
  if ($limits -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($limits) }
  if (!$assigned) { $null = $api::CloseHandle($job) }
}
