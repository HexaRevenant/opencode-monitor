# Delta for documentation-verification-parity

## ADDED Requirements

### Requirement: GPU platform matrix is documented and parity-checked

The README (EN, ES, PT) MUST qualify GPU/VRAM claims per the platform matrix: NVIDIA on Linux/Windows via `nvidia-smi`; Linux AMD via amdgpu sysfs where supported; Intel i915 and Windows AMD SHALL note their limits (no busy signal; WMI `AdapterRAM` total only); macOS unified RAM. The verification suite MUST parity-check README GPU claims against this matrix, keeping `test/readme-parity.test.ts` green.

#### Scenario: Qualified claims pass

- GIVEN all localized READMEs state the platform matrix accurately
- WHEN `npm test` runs
- THEN the GPU parity check passes

#### Scenario: Overpromise fails parity

- GIVEN a localized README claims GPU data on an unsupported platform
- WHEN `npm test` runs
- THEN the parity check fails and identifies the affected section