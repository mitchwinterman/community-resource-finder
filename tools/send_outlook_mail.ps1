param(
    [Parameter(Mandatory = $true)]
    [string]$MessagePath,

    [string]$FromEmail
)

$ErrorActionPreference = "Stop"

function Write-JsonResult {
    param(
        [bool]$Ok,
        [string]$Error = "",
        [string]$TransportMessageId = ""
    )

    @{
        ok = $Ok
        error = $Error
        transportMessageId = $TransportMessageId
    } | ConvertTo-Json -Compress
}

try {
    if (-not (Test-Path -LiteralPath $MessagePath -PathType Leaf)) {
        throw "Message file not found: $MessagePath"
    }

    $raw = Get-Content -LiteralPath $MessagePath -Raw -Encoding UTF8
    $message = $raw | ConvertFrom-Json

    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $mail = $outlook.CreateItem(0)

    if ($FromEmail) {
        foreach ($account in $namespace.Accounts) {
            if ($account.SmtpAddress -and $account.SmtpAddress.ToLowerInvariant() -eq $FromEmail.ToLowerInvariant()) {
                $mail.SendUsingAccount = $account
                break
            }
        }
    }

    $mail.To = [string]$message.to
    $mail.Subject = [string]$message.subject

    if ($message.html) {
        $mail.HTMLBody = [string]$message.html
    } else {
        $mail.Body = [string]$message.text
    }

    $mail.Save()
    $entryId = ""
    try {
        $entryId = [string]$mail.EntryID
    } catch {
        $entryId = ""
    }

    $mail.Send()

    Write-Output (Write-JsonResult -Ok $true -TransportMessageId $entryId)
    exit 0
} catch {
    $message = $_.Exception.Message
    Write-Output (Write-JsonResult -Ok $false -Error $message)
    exit 1
}
