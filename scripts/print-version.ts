#!/usr/bin/env bun
// print-version.ts — print package.json's "version" field to stdout.
//
// Resolves package.json via this script's own module location
// (import.meta.dir), not via require("./package.json") against the
// invoking shell's process cwd. On windows-latest CI, a `$(bun -e
// 'require("./package.json")')` subshell can see a malformed cwd (missing
// separator after the drive letter, e.g. D:a/epicd/epicd/package.json),
// causing MODULE_NOT_FOUND. Resolving from import.meta.dir sidesteps cwd
// entirely.
import { join } from "node:path";

const pkgPath = join(import.meta.dir, "..", "package.json");
const pkg = await Bun.file(pkgPath).json();
process.stdout.write(String(pkg.version));
