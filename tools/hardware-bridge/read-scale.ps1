param(
    [Parameter(Mandatory = $true)]
    [string]$PortName,
    [int]$BaudRate = 9600,
    [ValidateSet(7,8)]
    [int]$DataBits = 8,
    [ValidateSet("none","odd","even","mark","space")]
    [string]$Parity = "none",
    [ValidateSet(1,1.5,2)]
    [double]$StopBits = 1,
    [string]$Command = "",
    [int]$ReadTimeoutMs = 2500,
    [int]$SettleMs = 300
)

$ErrorActionPreference = "Stop"

if ($PortName -notmatch '^COM[0-9]+$') {
    throw "Invalid serial port name"
}

$serial = $null

try {
    $parityValue = [System.IO.Ports.Parity]::$Parity

    $stopBitsValue = switch ($StopBits) {
        1 { [System.IO.Ports.StopBits]::One }
        1.5 { [System.IO.Ports.StopBits]::OnePointFive }
        2 { [System.IO.Ports.StopBits]::Two }
        default { throw "Invalid stop bits" }
    }

    $serial = New-Object System.IO.Ports.SerialPort(
        $PortName,
        $BaudRate,
        $parityValue,
        $DataBits,
        $stopBitsValue
    )

    $serial.Handshake = [System.IO.Ports.Handshake]::None
    $serial.ReadTimeout = 250
    $serial.WriteTimeout = 1000
    $serial.NewLine = ([char]13).ToString() + ([char]10).ToString()

    $serial.Open()

    if ($Command -ne "") {
        $serial.Write($Command)
    }

    if ($SettleMs -gt 0) {
        Start-Sleep -Milliseconds $SettleMs
    }

    $deadline = [DateTime]::UtcNow.AddMilliseconds($ReadTimeoutMs)
    $buffer = ""

    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $chunk = $serial.ReadExisting()

            if ($chunk) {
                $buffer += $chunk
                $lines = $buffer -split "[\r\n]+"
                $candidate = $lines |
                    Where-Object { $_.Trim().Length -gt 0 } |
                    Select-Object -Last 1

                if ($candidate) {
                    $candidate.Trim()
                    exit 0
                }
            }
        }
        catch {
        }

        Start-Sleep -Milliseconds 50
    }

    $candidate = ($buffer -split "[\r\n]+") |
        Where-Object { $_.Trim().Length -gt 0 } |
        Select-Object -Last 1

    if ($candidate) {
        $candidate.Trim()
        exit 0
    }

    throw "No scale data received before timeout"
}
finally {
    if ($null -ne $serial) {
        try {
            if ($serial.IsOpen) {
                $serial.Close()
            }
        }
        catch {}

        $serial.Dispose()
    }
}
