---
name: Playwright browser engines on Nix
description: Environment limitation encountered when running Playwright Firefox and WebKit binaries in this workspace.
---

Fresh workspace checkouts may lack the downloaded Firefox and WebKit executables, so browser tests can fail before exercising application code. Playwright Firefox 157 runs here after installing the GTK, Pango, Cairo, GLib, DBus, ALSA, and X11 runtime libraries through Nix. When installed, the Playwright-downloaded Ubuntu 24 WebKit build may still not launch in this Nix-based workspace because it expects Ubuntu ABI libraries such as `libjpeg.so.8` and `libatomic.so.1`. Nix's `libjpeg.so.62` is not a compatible substitute. The Nix-packaged WebKit binary is not automatically interchangeable with the browser protocol version expected by the project's Playwright driver.

**Why:** Firefox failed to launch until its Nix runtime libraries were installed. Replacing WebKit's missing JPEG library with the Nix version failed its `LIBJPEG_8.0` symbol check, and the available Nix WebKit binary closed when driven by the project's Playwright version.

**How to apply:** Check that required browser executables are installed before interpreting browser-test failures. Use Nix runtime libraries to run downloaded Firefox here. Run WebKit tests in a runner with matching Ubuntu dependencies or locate a compatible WebKit/Playwright pair. Do not report WebKit coverage as passing based only on downloading its browser binary.
