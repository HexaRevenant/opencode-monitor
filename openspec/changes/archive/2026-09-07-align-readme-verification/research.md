# SDD Research Artifact

```yaml
schema: gentle-ai.sdd-research/v1
revision: 2
outcome: done
change: align-readme-verification
research_request: repository documentation only
questions:
  - Validate the proposed Portuguese README verification corrections against authoritative local repository sources.
  - Validate the Portuguese Windows metrics helper wording against the current implementation and documentation.
admission:
  capability: gentle-ai.sdd-research-capability/v1
  declared_grants:
    documentation:
      - scope: repository-local
        access: read-only
    open-web: []
  selected_class: documentation
  admitted: true
  reason: Explicit documentation grant authorized for repository-local read-only evidence; open-web excluded.
sources:
  - id: readme-portuguese
    class: documentation
    title: Portuguese README sections
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/README.md
    accessed_at: 2026-09-07
    excerpt: "README.md:276 says Windows network speed uses GetIfTable2 through Koffi and only describes PowerShell as the fallback; README.md:356-362 lists only npm test, npm run typecheck, and npm run build."
  - id: package-scripts
    class: documentation
    title: Package verification scripts
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/package.json
    accessed_at: 2026-09-07
    excerpt: "package.json:22-29 defines npm run verify-installation and npm run install-plugin alongside npm test, npm run typecheck, and npm run build."
  - id: installation-verifier
    class: documentation
    title: OpenCode installation verification helper
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/scripts/plugin-installation.ts
    accessed_at: 2026-09-07
    excerpt: "plugin-installation.ts:46-96 checks the OpenCode cache, package name and expected version, dist/tui.js, and stale entries without deleting them; the CLI exits nonzero when verification fails at lines 110-121."
  - id: installation-helper
    class: documentation
    title: Global plugin installation helper
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/scripts/install-plugin.ts
    accessed_at: 2026-09-07
    excerpt: "install-plugin.ts:14-41 verifies before installation, invokes opencode plugin -g <package>@<version> --force when needed, and verifies again afterward."
  - id: windows-metrics-client
    class: documentation
    title: Windows persistent metrics client
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/src/metrics.ts
    accessed_at: 2026-09-07
    excerpt: "metrics.ts:417-443 uses the persistent Node helper as the Bun-on-Windows primary reader and falls back to the bounded reader; metrics.ts:482-484 preserves the outer timeout around the network sample."
  - id: windows-metrics-helper
    class: documentation
    title: Windows metrics helper process
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/src/windows-metrics-helper.ts
    accessed_at: 2026-09-07
    excerpt: "windows-metrics-helper.ts:23-34 serves newline-delimited requests in a Node process and reads native Windows network counters for each request."
  - id: windows-network-fallback
    class: documentation
    title: Windows network native and PowerShell readers
    publisher: opencode-monitor repository
    URL: file:///home/hexa/datos/Documentos/GitHub/opencode-monitor/src/metrics.ts
    accessed_at: 2026-09-07
    excerpt: "metrics.ts:219-230 defines the bounded PowerShell Get-NetAdapterStatistics fallback; metrics.ts:425-429 selects the helper under Bun and the native reader otherwise."
validated_claims:
  - id: claim-1
    statement: The Portuguese verification block is missing npm run install-plugin and npm run verify-installation from the repository's defined verification flow.
    source_ids: [readme-portuguese, package-scripts]
  - id: claim-2
    statement: npm run install-plugin is an active global installation flow with preflight and post-install verification, while npm run verify-installation is a read-only cache and artifact verification command.
    source_ids: [installation-verifier, installation-helper]
  - id: claim-3
    statement: The current Portuguese Windows wording omits the persistent Node helper used on the Bun Windows path before the bounded PowerShell fallback.
    source_ids: [readme-portuguese, windows-metrics-client, windows-metrics-helper, windows-network-fallback]
  - id: claim-4
    statement: The focused correction can remain documentation-only because the commands and runtime behavior already exist in package.json and source files.
    source_ids: [package-scripts, installation-verifier, installation-helper, windows-metrics-client, windows-metrics-helper, windows-network-fallback]
contradictions: []
uncertainty:
  - The research validates repository facts and does not decide whether the related Portuguese wording drift must be included in the final proposal.
freshness: Current on-disk repository files accessed 2026-09-07; no external sources used.
product_choices:
  - No product choices were made during research; proposal decisions remain pending with the orchestrator.
recovery:
  retained_intent: Correct the focused Portuguese README verification and Windows metrics wording without changing product files.
  canonical_scope:
    - Portuguese verification command parity.
    - Portuguese Windows network helper wording.
    - No README or product-file edits during research.
  required_action: Preserve the canonical scope; confirm pending product decisions before proposal admission.
```

Evidence is limited to repository-local documentation and authoritative local source files. Open-web sources were not used.
