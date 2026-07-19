<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/known-environment.md
status: template — machinegegevens per project/machine invullen. De
        plugin-blind-spot-regels zijn verbatim overgenomen.
-->

# Known Environment

<!-- Vul in voor de machine waarop dit project draait: -->

- OS: Windows 11
- Shell: PowerShell (geen && operator, gebruik ; of separate lines)
- Node: [versie]
- Package manager: pnpm
- gh CLI: [versie + pad, bijv. 'C:\Program Files\GitHub CLI\gh.exe'] (authenticated als [account])
- Working dir: [C:\pad\naar\project]
- Git: configured

BELANGRIJK voor de agent/plugin:

Bij een claim 'tool X is not installed': run eerst via PowerShell
'[tool] --version' om te checken. De omgevingsdetectie heeft blind spots bij
Windows-PATH. Bij twijfel: gebruik het volledige pad.

NIET claimen dat tools ontbreken zonder eerst CLI-check.

gh pr create commando-template:

```
gh pr create --base [default-branch] --head <branch> --title <title> --body <body>
```
