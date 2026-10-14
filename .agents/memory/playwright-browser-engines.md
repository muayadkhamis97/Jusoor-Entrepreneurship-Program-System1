---
name: Playwright browser engines on Nix
description: Environment limitation encountered when running Playwright Firefox and WebKit binaries in this workspace.
---

Fresh workspace checkouts may lack the downloaded Firefox and WebKit executables, so browser tests can fail before exercising application code. When installed, the Playwright-downloaded Ubuntu 24 WebKit build may still not launch in this Nix-based workspace because it expects Ubuntu ABI libraries such as `libjpeg.so.8` and `libatomic.so.1`. Nix's `libjpeg.so.62` is not a compatible substitute. The Nix-packaged WebKit binary is not automatically interchangeable with the browser protocol version expected by the project's Playwright driver. Firefox has been runnable in this environment when its executable is installed.

**Why:** Replacing the browser's missing JPEG library with the Nix version failed its `LIBJPEG_8.0` symbol check, and the available Nix WebKit binary closed when driven by the project's Playwright version.

**How to apply:** Check that required browser executables are installed before interpreting browser-test failures. Run WebKit tests in a runner with matching Ubuntu dependencies or locate a compatible WebKit/Playwright pair. Do not report WebKit coverage as passing based only on downloading its browser binary.
