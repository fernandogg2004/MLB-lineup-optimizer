Shared report format for all auditors (referenced by each agent definition).

Write the report to `docs/audits/<agent-id>-round<N>.md` ONLY IF your tools allow writing;
otherwise return it as your final message. One table row per finding, then details.

| ID | Severity | Location | Finding | Blocks release? | Confidence |
|---|---|---|---|---|---|

For every finding give: evidence (file:line, command output, counterexample), why it matters,
proposed correction, a test or check that would verify the fix. Severities: Critical, High,
Medium, Low, Informational. Do not report style preferences as High. Do not trust summaries in
docs or commit messages: verify against code, tests, outputs and the running application.
Try to falsify the project's claims. If you find nothing material in an area, say what you checked.
