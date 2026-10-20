$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'compiler-helper-job.ps1')
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$targetPid = [int]$payload.pid
if ($targetPid -le 0) { throw 'A positive process id is required' }
$environment = $null
if ($payload.environment) {
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ApackPeProcess {
  [DllImport("kernel32.dll", SetLastError=true)] static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(SafeProcessHandle process, int kind, [Out] byte[] info, int size, out int returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(SafeProcessHandle process, IntPtr address, [Out] byte[] bytes, UIntPtr count, out UIntPtr read);
  static byte[] Query(SafeProcessHandle process, int kind, int size) {
    var bytes=new byte[size]; int returned;
    int status=NtQueryInformationProcess(process,kind,bytes,size,out returned);
    if(status != 0 || returned != size) throw new InvalidOperationException("Cannot query process parameters: "+status);
    return bytes;
  }
  static byte[] Read(SafeProcessHandle process,long address,int count) {
    var bytes=new byte[count]; UIntPtr read;
    if(address<=0 || !ReadProcessMemory(process,new IntPtr(address),bytes,(UIntPtr)count,out read) || read.ToUInt64()!=(ulong)count)
      throw new InvalidOperationException("Cannot read process parameters");
    return bytes;
  }
  // PEB and RTL_USER_PROCESS_PARAMETERS layouts differ between native and WOW64 targets.
  static long Pointer(byte[] bytes,int offset,int width) { return width==8 ? BitConverter.ToInt64(bytes,offset) : BitConverter.ToUInt32(bytes,offset); }
  static string PathValue(SafeProcessHandle process,long block) {
    var text=new StringBuilder();
    for(int offset=0;offset<1024*1024;) {
      long address=checked(block+offset); int count=(int)Math.Min(4096-address%4096,1024*1024-offset);
      text.Append(Encoding.Unicode.GetString(Read(process,address,count))); offset+=count;
      string value=text.ToString(); int end=value.IndexOf("\0\0",StringComparison.Ordinal);
      if(end<0) continue;
      foreach(string entry in value.Substring(0,end).Split('\0'))
        if(entry.StartsWith("PATH=",StringComparison.OrdinalIgnoreCase)) return entry.Substring(5);
      return null;
    }
    throw new InvalidOperationException("Process environment exceeds inspection limit");
  }
  public static string ReadPath(int pid) {
    using(var process=OpenProcess(0x410,false,pid)) {
      if(process.IsInvalid) throw new InvalidOperationException("Cannot open process for inspection");
      int width=IntPtr.Size; long peb=0;
      if(width==8) { peb=Pointer(Query(process,26,8),0,8); if(peb!=0) width=4; }
      if(peb==0) peb=Pointer(Query(process,0,6*IntPtr.Size),IntPtr.Size,IntPtr.Size);
      long parameters=Pointer(Read(process,peb+(width==8?0x20:0x10),width),0,width);
      long location=parameters+(width==8?0x80:0x48);
      long environment=Pointer(Read(process,location,width),0,width);
      string first=PathValue(process,environment);
      string second=PathValue(process,environment);
      if(environment!=Pointer(Read(process,location,width),0,width) || first!=second)
        throw new InvalidOperationException("Process environment changed during inspection");
      return first;
    }
  }
}
'@
  $value = [ApackPeProcess]::ReadPath($targetPid)
  $environment = @{}
  if ($null -ne $value) { $environment['PATH'] = $value }
}
$target = [Diagnostics.Process]::GetProcessById($targetPid)
try { $libraries = @($target.Modules | ForEach-Object { $_.FileName }) }
finally { $target.Dispose() }
$session = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager')
try {
  $known = $session.OpenSubKey('KnownDLLs')
  try { $dlls = @($known.GetValueNames() | ForEach-Object { $known.GetValue($_) } | Where-Object { $_ -is [string] -and $_ -match '\.dll$' }) }
  finally { $known.Dispose() }
  $options = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options')
  try { $devOverride = $null -ne $options -and $options.GetValue('DevOverrideEnable', 0) -eq 1 }
  finally { if ($null -ne $options) { $options.Dispose() } }
  $json = @{ libraries = $libraries; safeSearch = ($session.GetValue('SafeDllSearchMode', 1) -ne 0); devOverride = $devOverride; knownDlls = $dlls; environment = $environment } | ConvertTo-Json -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  [Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
} finally { $session.Dispose() }
