$s = Get-Content 'd:\Projects\KSMN Kanakku-book\src\pages\QuickAddPage.tsx' -Raw
Write-Output ('Length: ' + $s.Length)
Write-Output ('CRLF count: ' + ([regex]::Matches($s, [char]13 + [char]10).Count))