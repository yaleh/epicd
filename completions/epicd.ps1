# PowerShell completion script for epicd CLI
#
# NOTE: This script is embedded in the epicd binary and installed automatically
# via 'epicd completion install --shell pwsh'. This file serves as reference documentation.
#
# Installation:
#   - Recommended: epicd completion install --shell pwsh
#   - Manual: Save this script and source it from your $PROFILE.CurrentUserAllHosts
#
# Requirements:
#   - PowerShell 7+ recommended

$__epicdCompletionScriptBlock = {
	param($wordToComplete, $commandAst, $cursorPosition)

	$line = $commandAst.ToString()
	# Preserve trailing whitespace context because CommandAst text omits it.
	if ($cursorPosition -gt $line.Length) {
		$line = $line.PadRight($cursorPosition)
	}

	# Cursor position is already an endpoint offset for completion APIs.
	$point = [Math]::Min([Math]::Max($cursorPosition, 0), $line.Length)

	try {
		$completions = @(epicd completion __complete "$line" "$point" 2>$null)
		foreach ($completion in $completions) {
			if ($completion) {
				$completionText = "$completion "
				[System.Management.Automation.CompletionResult]::new(
					$completionText,
					$completion,
					[System.Management.Automation.CompletionResultType]::ParameterValue,
					$completion
				)
			}
		}
	} catch {
		return
	}
}

Register-ArgumentCompleter -Native -CommandName @("epicd", "epicd.exe") -ScriptBlock $__epicdCompletionScriptBlock
