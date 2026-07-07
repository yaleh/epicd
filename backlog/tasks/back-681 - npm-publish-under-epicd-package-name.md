---
id: BACK-681
title: npm publish under epicd package name
status: Draft
assignee: []
created_date: '2026-07-07 10:16'
labels: []
dependencies: []
priority: medium
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
package.json 이 name: epicd 로 변경(BACK-600.1)되었지만 npm registry에는 아직 backlog.md@1.47.1 만 존재. npm i -g epicd 가 404 실패. BACK-680 검증 중 발견. 다음 릴리스 태그 시 release.yml 이 package.json name 을 그대로 읽으므로 epicd 로 publish 될 예정이지만, 그 전까지는 npm i -g backlog.md 가 유일한 install 경로.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
