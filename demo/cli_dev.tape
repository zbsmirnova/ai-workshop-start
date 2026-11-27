# Act 2, terminal: how the project is built — spec-first, QA scripts, PRs, CI.
#   vhs demo/cli_dev.tape   (needs gh authenticated)
Output demo/out/cli_dev.mp4
Set Shell bash
Set FontSize 15
Set Width 1280
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type "export GH_REPO=$(git config --get remote.origin.url | sed 's#.*github.com[:/]##;s#\.git$##') && clear"
Enter
Show

Type "ls spec/ qa/ && head -4 AGENTS.md"
Sleep 500ms
Enter
Sleep 5s
Type "ls .claude/skills/ memory/"
Sleep 500ms
Enter
Sleep 4s
Type "gh pr list --state merged --limit 8"
Sleep 500ms
Enter
Sleep 6s
Type "gh run list --limit 5"
Sleep 500ms
Enter
Sleep 6s
