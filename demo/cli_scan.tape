# Act 1, terminal: scan, filter, map — run from the repo root with GITHUB_TOKEN exported:
#   vhs demo/cli_scan.tape
Output demo/out/cli_scan.mp4
Set Shell bash
Set FontSize 15
Set Width 1280
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Type "./skill-atlas scan https://github.com/anthropics/defending-code-reference-harness"
Sleep 600ms
Enter
Sleep 7s
Type "./skill-atlas scan https://github.com/anthropics/defending-code-reference-harness --filter threat"
Sleep 600ms
Enter
Sleep 6s
Type "./skill-atlas map https://github.com/anthropics/defending-code-reference-harness"
Sleep 600ms
Enter
Sleep 7s
