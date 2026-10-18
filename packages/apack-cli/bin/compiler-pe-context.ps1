$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'compiler-helper-job.ps1')

function Read-Manifest([byte[]]$bytes) {
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $stream = New-Object System.IO.MemoryStream(,$bytes)
  $reader = [System.Xml.XmlReader]::Create($stream, $settings)
  try {
    $document = New-Object System.Xml.XmlDocument
    $document.XmlResolver = $null
    $document.Load($reader)
    return $document
  } finally { $reader.Dispose(); $stream.Dispose() }
}

try {
  $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $preference = [Microsoft.Win32.Registry]::GetValue('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\SideBySide', 'PreferExternalManifest', 0)
  $external = $payload.resource -eq 1 -and $null -ne $payload.external -and (($preference -is [int] -and $preference -eq 1) -or $payload.manifests.Count -eq 0)
  $documents = if ($external) { @($payload.external) } else { @($payload.manifests) }
  $bindings = @($payload.inputs | Where-Object { $_.file -eq $payload.configuration -and $_.kind -eq 'file' }).Count -ne 0
  foreach ($encoded in $documents) {
    $document = Read-Manifest ([Convert]::FromBase64String($encoded))
    if ($document.SelectNodes('//*[local-name()="dependency" or local-name()="file"]').Count -ne 0) { $bindings = $true }
  }
  if (!$bindings) {
    $result = @{ image = $payload.image; inputs = @($payload.inputs); redirections = @() }
  } else {
    Add-Type -ReferencedAssemblies System.dll,System.Core.dll,System.Xml.dll -TypeDefinition @'
using System;
using System.IO;
using System.Xml;
using System.Text;
using System.Collections.Generic;
using System.ComponentModel;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class ApackPeActivationContext {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct ContextSpec {
    public uint Size, Flags;
    [MarshalAs(UnmanagedType.LPWStr)] public string Source;
    public ushort Architecture, Language;
    [MarshalAs(UnmanagedType.LPWStr)] public string AssemblyDirectory;
    public IntPtr Resource;
    [MarshalAs(UnmanagedType.LPWStr)] public string Application;
    public IntPtr Module;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct ContextInfo {
    public uint Flags, Format, Assemblies, ManifestType, ManifestChars, ConfigType, ConfigChars, DirectoryType, DirectoryChars;
    [MarshalAs(UnmanagedType.LPWStr)] public string Manifest;
    [MarshalAs(UnmanagedType.LPWStr)] public string Config;
    [MarshalAs(UnmanagedType.LPWStr)] public string Directory;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct AssemblyInfo {
    public uint Flags, IdentityLength, ManifestType, ManifestLength;
    public long ManifestTime;
    public uint PolicyType, PolicyLength;
    public long PolicyTime;
    public uint Satellite, ManifestMajor, ManifestMinor, PolicyMajor, PolicyMinor, DirectoryLength;
    [MarshalAs(UnmanagedType.LPWStr)] public string Identity;
    [MarshalAs(UnmanagedType.LPWStr)] public string Manifest;
    [MarshalAs(UnmanagedType.LPWStr)] public string Policy;
    [MarshalAs(UnmanagedType.LPWStr)] public string Directory;
    public uint Files;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateActCtxW(ref ContextSpec spec);
  [DllImport("kernel32.dll")] static extern void ReleaseActCtx(IntPtr context);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ActivateActCtx(IntPtr context, out UIntPtr cookie);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DeactivateActCtx(uint flags, UIntPtr cookie);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryActCtxW(uint flags, IntPtr context, IntPtr index, uint kind, IntPtr buffer, UIntPtr length, out UIntPtr needed);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryExW(string name, IntPtr reserved, uint flags);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr FindResourceW(IntPtr module, IntPtr name, IntPtr type);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint SizeofResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr resource);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("psapi.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetMappedFileNameW(IntPtr process, IntPtr address, StringBuilder name, uint size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFileAttributesW(string file);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFileW(string file, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint size, uint flags);

  static string DosPath(string file) {
    if (file.StartsWith(@"\??\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + file.Substring(8);
    if (file.StartsWith(@"\??\")) return file.Substring(4);
    if (file.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + file.Substring(8);
    if (file.StartsWith(@"\\?\")) return file.Substring(4);
    return file;
  }
  static string NativePath(string file) {
    if (file.StartsWith(@"\\?\")) return file;
    return file.StartsWith(@"\\") ? @"\\?\UNC\" + file.Substring(2) : @"\\?\" + file;
  }
  static FileStream ReadFile(string file) {
    SafeFileHandle handle = CreateFileW(NativePath(file), 0x80000000, 7, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
    return new FileStream(handle, FileAccess.Read);
  }
  sealed class InputInfo {
    public string file { get; set; }
    public string kind { get; set; }
    public string hash { get; set; }
  }
  static InputInfo Input(string file) {
    uint attributes = GetFileAttributesW(NativePath(file));
    if (attributes == uint.MaxValue) {
      int error = Marshal.GetLastWin32Error();
      if (error != 2 && error != 3) throw new Win32Exception(error);
      return new InputInfo { file = file, kind = "missing", hash = null };
    }
    if ((attributes & 16) != 0) return new InputInfo { file = file, kind = "directory", hash = null };
    using (FileStream stream = ReadFile(file)) using (SHA256 hash = SHA256.Create())
      return new InputInfo { file = file, kind = "file", hash = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant() };
  }
  static XmlDocument ReadXml(Stream stream) {
    XmlReaderSettings settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
    using (XmlReader reader = XmlReader.Create(stream, settings)) {
      XmlDocument document = new XmlDocument { XmlResolver = null };
      document.Load(reader); return document;
    }
  }
  static XmlDocument ReadResource(string image, int resourceId) {
    IntPtr module = LoadLibraryExW(NativePath(image), IntPtr.Zero, 0x60);
    if (module == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      IntPtr resource = FindResourceW(module, new IntPtr(resourceId), new IntPtr(24));
      if (resource == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint size = SizeofResource(module, resource);
      IntPtr bytes = LockResource(LoadResource(module, resource));
      if (bytes == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      byte[] data = new byte[checked((int)size)]; Marshal.Copy(bytes, data, 0, data.Length);
      using (MemoryStream stream = new MemoryStream(data)) return ReadXml(stream);
    } finally { FreeLibrary(module); }
  }
  static XmlDocument ReadManifest(string file, int resourceId) {
    using (FileStream stream = ReadFile(file)) {
      if (stream.ReadByte() == 'M' && stream.ReadByte() == 'Z') return ReadResource(file, resourceId);
      stream.Position = 0;
      return ReadXml(stream);
    }
  }
  static T Query<T>(IntPtr context, IntPtr index, uint kind) where T : struct {
    UIntPtr needed;
    bool found = QueryActCtxW(0, context, index, kind, IntPtr.Zero, UIntPtr.Zero, out needed);
    if (!found && Marshal.GetLastWin32Error() != 122) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr buffer = Marshal.AllocHGlobal(checked((int)needed.ToUInt64()));
    try {
      if (!QueryActCtxW(0, context, index, kind, buffer, needed, out needed)) throw new Win32Exception(Marshal.GetLastWin32Error());
      return (T)Marshal.PtrToStructure(buffer, typeof(T));
    } finally { Marshal.FreeHGlobal(buffer); }
  }
  static string MapFile(string name) {
    // Resource mappings neither call DllMain nor load the image's imports.
    IntPtr module = LoadLibraryExW(name, IntPtr.Zero, 0x60);
    if (module == IntPtr.Zero) {
      int error = Marshal.GetLastWin32Error();
      if (error == 2 || error == 3 || error == 126 || error == 193) return null;
      throw new Win32Exception(error);
    }
    try {
      StringBuilder mapped = new StringBuilder(32768);
      uint size = GetMappedFileNameW(GetCurrentProcess(), new IntPtr(module.ToInt64() & ~3L), mapped, (uint)mapped.Capacity);
      if (size == 0 || size >= mapped.Capacity) throw new Win32Exception(size == 0 ? Marshal.GetLastWin32Error() : 122);
      using (SafeFileHandle handle = CreateFileW(@"\\?\GLOBALROOT" + mapped, 0, 7, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
        StringBuilder final = new StringBuilder(32768);
        size = GetFinalPathNameByHandleW(handle, final, (uint)final.Capacity, 0);
        if (size == 0 || size >= final.Capacity) throw new Win32Exception(size == 0 ? Marshal.GetLastWin32Error() : 122);
        return DosPath(final.ToString());
      }
    } finally { FreeLibrary(module); }
  }
  static List<List<string>> ReadPrivateCandidates(string image, string configuration, XmlDocument manifest) {
    string directory = Path.GetDirectoryName(image);
    List<string> roots = new List<string> { directory };
    if (File.Exists(configuration)) using (FileStream stream = ReadFile(configuration)) {
      XmlDocument config = ReadXml(stream);
      foreach (XmlNode probing in config.SelectNodes("//*[local-name()='probing' and namespace-uri()='urn:schemas-microsoft-com:asm.v1']")) {
        foreach (string relative in probing.Attributes["privatePath"].Value.Split(';')) {
          string root = Path.GetFullPath(Path.Combine(directory, relative));
          if (root.StartsWith(directory.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) roots.Add(root);
        }
      }
    }
    List<List<string>> result = new List<List<string>>();
    foreach (XmlNode dependency in manifest.SelectNodes("/*[local-name()='assembly']/*[local-name()='dependency']/*[local-name()='dependentAssembly']/*[local-name()='assemblyIdentity']")) {
      string name = dependency.Attributes["name"].Value;
      string language = dependency.Attributes["language"] == null ? "" : dependency.Attributes["language"].Value;
      if (Path.GetFileName(name) != name || (language != "" && language != "*")) continue;
      List<string> candidates = new List<string>();
      foreach (string root in roots) foreach (string parent in new string[] { root, Path.Combine(root, name) }) {
        candidates.Add(Path.Combine(parent, name + ".dll"));
        candidates.Add(Path.Combine(parent, name + ".manifest"));
      }
      result.Add(candidates);
    }
    return result;
  }
  public static object Read(string image, string application, int resourceId, bool external, string configuration) {
    var candidates = ReadPrivateCandidates(image, configuration, ReadManifest(external ? image + ".manifest" : image, resourceId));
    ContextSpec spec = new ContextSpec();
    spec.Size = (uint)Marshal.SizeOf(typeof(ContextSpec));
    spec.Source = NativePath(external ? image + ".manifest" : image);
    spec.Flags = external ? 0x24u : 0x2cu;
    spec.Resource = external ? IntPtr.Zero : new IntPtr(resourceId);
    spec.AssemblyDirectory = NativePath(image.Substring(0, image.LastIndexOf('\\') + 1)); spec.Application = application;
    IntPtr context = CreateActCtxW(ref spec);
    if (context == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr index = Marshal.AllocHGlobal(4);
    UIntPtr cookie = UIntPtr.Zero; bool active = false;
    try {
      // Discover relevant private prefixes first; shared assemblies never probe these local paths.
      Dictionary<string, InputInfo> probes = new Dictionary<string, InputInfo>(StringComparer.OrdinalIgnoreCase);
      ContextInfo initial = Query<ContextInfo>(context, IntPtr.Zero, 2);
      for (uint assembly = 1; assembly <= initial.Assemblies; assembly++) {
        Marshal.WriteInt32(index, unchecked((int)assembly));
        string selected = DosPath(Query<AssemblyInfo>(context, index, 3).Manifest);
        foreach (var paths in candidates) {
          int found = paths.FindIndex(file => String.Equals(file, selected, StringComparison.OrdinalIgnoreCase));
          for (int candidate = 0; candidate <= found; candidate++) probes[paths[candidate]] = Input(paths[candidate]);
        }
      }
      if (probes.Count != 0) {
        // Bind after capturing the namespace; refuse if it changes before inspection finishes.
        IntPtr next = CreateActCtxW(ref spec);
        if (next == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
        ReleaseActCtx(context); context = next;
      }
      ContextInfo detail = Query<ContextInfo>(context, IntPtr.Zero, 2);
      Dictionary<string, InputInfo> inputs = new Dictionary<string, InputInfo>(StringComparer.OrdinalIgnoreCase);
      HashSet<string> names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      if (!String.IsNullOrEmpty(detail.Config)) inputs[DosPath(detail.Config)] = Input(DosPath(detail.Config));
      for (uint assembly = 1; assembly <= detail.Assemblies; assembly++) {
        Marshal.WriteInt32(index, unchecked((int)assembly));
        AssemblyInfo item = Query<AssemblyInfo>(context, index, 3);
        string manifest = DosPath(item.Manifest);
        inputs[manifest] = Input(manifest);
        if (!String.IsNullOrEmpty(item.Policy)) inputs[DosPath(item.Policy)] = Input(DosPath(item.Policy));
        // The first roster entry is the requested image; dependent assemblies use resource 1.
        XmlDocument document = ReadManifest(manifest, assembly == 1 ? resourceId : 1);
        foreach (XmlNode file in document.SelectNodes("//*[local-name()='file' and namespace-uri()='urn:schemas-microsoft-com:asm.v1']")) {
          string name = file.Attributes["name"].Value;
          if (name.Length != 0) names.Add(name);
        }
      }
      if (!ActivateActCtx(context, out cookie)) throw new Win32Exception(Marshal.GetLastWin32Error());
      active = true;
      List<object> redirections = new List<object>();
      foreach (string name in names) redirections.Add(new { name = name, file = MapFile(name) });
      foreach (InputInfo before in probes.Values) {
        InputInfo after = Input(before.file), selected;
        if (before.kind != after.kind || before.hash != after.hash
          || (inputs.TryGetValue(before.file, out selected) && (before.kind != selected.kind || before.hash != selected.hash)))
          throw new Win32Exception(1237);
        inputs[before.file] = before;
      }
      return new { inputs = new List<InputInfo>(inputs.Values).ToArray(), redirections = redirections.ToArray() };
    } finally {
      if (active) DeactivateActCtx(0, cookie);
      Marshal.FreeHGlobal(index); ReleaseActCtx(context);
    }
  }
}
'@
    $context = [ApackPeActivationContext]::Read($payload.image, $payload.application, $payload.resource, $external, $payload.configuration)
    $known = @{}
    foreach ($inputFile in $payload.inputs) { $known[$inputFile.file] = $inputFile }
    foreach ($inputFile in $context.inputs) {
      if ($known.ContainsKey($inputFile.file)) {
        if ($known[$inputFile.file].kind -ne $inputFile.kind -or $known[$inputFile.file].hash -ne $inputFile.hash) { throw (New-Object System.ComponentModel.Win32Exception(1237)) }
      } else { $known[$inputFile.file] = $inputFile }
    }
    $result = @{ image = $payload.image; inputs = @($known.Values); redirections = @($context.redirections) }
  }
} catch {
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  $result = @{ error = $(if ($failure -is [System.ComponentModel.Win32Exception]) { $failure.NativeErrorCode } else { 13 }) }
}
$json = $result | ConvertTo-Json -Depth 7 -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$output = [Console]::OpenStandardOutput()
$output.Write($bytes, 0, $bytes.Length)
