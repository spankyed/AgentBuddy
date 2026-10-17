param([Parameter(Mandatory=$true)][string]$Configuration)
$ErrorActionPreference = 'Stop'

# Preserve libuv IPC/stdio while assigning the suspended compiler to its own lifetime job.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class CompilerJobLauncher {
    [StructLayout(LayoutKind.Sequential)] struct Startup {
        public uint Size;
        public IntPtr Reserved, Desktop, Title;
        public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public ushort ShowWindow, ReservedBytes;
        public IntPtr ReservedTable, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
        public IntPtr Process, Thread;
        public uint ProcessId, ThreadId;
    }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveLimit;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr value, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting value, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
    static extern void GetStartupInfoW(out Startup startup);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcessW(string executable, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory,
        ref Startup startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool all, uint timeout);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

    static void Check(bool success, string operation) {
        if (!success) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }
    public static int Run(string executable, string command, string directory, uint parentPid) {
        IntPtr job = IntPtr.Zero, parent = IntPtr.Zero, environment = IntPtr.Zero, workerStdio = IntPtr.Zero;
        ProcessInfo child = new ProcessInfo();
        try {
            parent = OpenProcess(0x00100000, false, parentPid); // SYNCHRONIZE
            Check(parent != IntPtr.Zero, "Open parent process");
            job = CreateJobObjectW(IntPtr.Zero, null);
            Check(job != IntPtr.Zero, "Create compiler job");
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = 0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            int size = Marshal.SizeOf(typeof(ExtendedLimits));
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(limits, buffer, false);
                Check(SetInformationJobObject(job, 9, buffer, (uint)size), "Set compiler job limits");
            } finally { Marshal.FreeHGlobal(buffer); }

            Startup startup;
            GetStartupInfoW(out startup);
            if (startup.ReservedTable == IntPtr.Zero || startup.ReservedBytes < 4 ||
                Marshal.ReadInt32(startup.ReservedTable) != 5 || startup.ReservedBytes < 9 + 5 * IntPtr.Size)
                throw new Exception("Launcher requires inherited stdio, IPC and environment channels");
            IntPtr input = Marshal.ReadIntPtr(startup.ReservedTable, 9 + 4 * IntPtr.Size);
            Check(SetHandleInformation(input, 1, 0), "Keep environment channel private");
            using (var handle = new SafeFileHandle(input, false))
            using (var stream = new FileStream(handle, FileAccess.Read))
            using (var reader = new BinaryReader(stream)) {
                int length = reader.ReadInt32();
                if (length < 4 || (length % 2) != 0) throw new Exception("Invalid compiler environment length");
                byte[] bytes = reader.ReadBytes(length);
                if (bytes.Length != length) throw new Exception("Compiler environment transfer ended early");
                string block = new UnicodeEncoding(false, false, true).GetString(bytes);
                if (!block.EndsWith("\0\0")) throw new Exception("Invalid compiler environment block");
                string[] entries = block.Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
                Array.Sort(entries, StringComparer.OrdinalIgnoreCase);
                environment = Marshal.StringToHGlobalUni(String.Join("\0", entries) + "\0\0");
            }
            // Only stdio/IPC reach Node. The environment pipe remains owned by this launcher.
            workerStdio = Marshal.AllocHGlobal(8 + 4 * IntPtr.Size);
            Marshal.WriteInt32(workerStdio, 4);
            for (int i = 0; i < 4; i++) {
                Marshal.WriteByte(workerStdio, 4 + i, Marshal.ReadByte(startup.ReservedTable, 4 + i));
                Marshal.WriteIntPtr(workerStdio, 8 + i * IntPtr.Size,
                    Marshal.ReadIntPtr(startup.ReservedTable, 9 + i * IntPtr.Size));
            }
            startup.ReservedBytes = (ushort)(8 + 4 * IntPtr.Size);
            startup.ReservedTable = workerStdio;
            startup.Size = (uint)Marshal.SizeOf(typeof(Startup));
            // Suspended, Unicode environment, and no console window.
            Check(CreateProcessW(executable, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true,
                0x08000404, environment, directory, ref startup, out child), "Create suspended compiler");
            Check(AssignProcessToJobObject(job, child.Process), "Assign suspended compiler job");
            Check(ResumeThread(child.Thread) != UInt32.MaxValue, "Resume compiler");
            uint ended = WaitForMultipleObjects(2, new IntPtr[] { child.Process, parent }, false, UInt32.MaxValue);
            Check(ended <= 1, "Wait for compiler or parent");
            uint code = 1;
            if (ended == 0) Check(GetExitCodeProcess(child.Process, out code), "Read compiler exit code");
            Check(TerminateJobObject(job, 1), "Stop compiler descendants");
            Stopwatch deadline = Stopwatch.StartNew();
            for (;;) {
                Accounting accounting;
                Check(QueryInformationJobObject(job, 1, out accounting,
                    (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero), "Query compiler descendants");
                if (accounting.ActiveProcesses == 0) return (int)code;
                if (deadline.ElapsedMilliseconds >= 2000) throw new Exception("Compiler job still has active processes");
                Thread.Sleep(10);
            }
        } finally {
            // This also covers assignment failure before the suspended process joins the job.
            if (child.Process != IntPtr.Zero) { TerminateProcess(child.Process, 1); CloseHandle(child.Process); }
            if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (parent != IntPtr.Zero) CloseHandle(parent);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            if (workerStdio != IntPtr.Zero) Marshal.FreeHGlobal(workerStdio);
        }
    }
}
'@
try {
    $launch = Get-Content -LiteralPath $Configuration -Raw -Encoding UTF8 | ConvertFrom-Json
    exit ([CompilerJobLauncher]::Run($launch.executable, $launch.commandLine, $launch.cwd, $launch.parentPid))
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    exit 1
}
