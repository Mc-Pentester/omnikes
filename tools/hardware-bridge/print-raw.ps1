param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@

[byte[]]$data = [System.IO.File]::ReadAllBytes($FilePath)
[IntPtr]$handle = [IntPtr]::Zero

if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)) {
  throw "OpenPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = "OmniKes ESC/POS"
  $doc.pDataType = "RAW"

  if ([RawPrinter]::StartDocPrinter($handle, 1, $doc) -eq 0) {
    throw "StartDocPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }

  try {
    if (-not [RawPrinter]::StartPagePrinter($handle)) {
      throw "StartPagePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    try {
      [int]$written = 0
      if (-not [RawPrinter]::WritePrinter($handle, $data, $data.Length, [ref]$written)) {
        throw "WritePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
      }
      if ($written -ne $data.Length) {
        throw "Incomplete print write: $written/$($data.Length) bytes"
      }
    } finally {
      [RawPrinter]::EndPagePrinter($handle) | Out-Null
    }
  } finally {
    [RawPrinter]::EndDocPrinter($handle) | Out-Null
  }
} finally {
  [RawPrinter]::ClosePrinter($handle) | Out-Null
}
