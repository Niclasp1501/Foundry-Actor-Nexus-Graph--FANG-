# Agent Notes

## Versioning

Use this module version format for stable releases:

```text
<foundry-major>.<YYMM>.<patch>
```

Rules:

- `<foundry-major>` is the primary Foundry VTT major version the release targets, for example `14`.
- `<YYMM>` is the release year and month, for example `2605` for May 2026.
- `<patch>` starts at `1` each new month and increments for every additional stable release in the same month.
- Tags must use the module version with a `v` prefix, for example `v14.2605.1`.
- Do not decrease versions. The next version after the old `14.0.21` line should use the new format, for example `14.2605.1`.

Examples:

```text
14.2605.1
14.2605.2
14.2606.1
15.2607.1
```

Beta releases should derive from the current stable base version:

```text
14.2605.2-beta.<run>
```

The persistent beta install link remains the `beta-latest` GitHub prerelease manifest.
