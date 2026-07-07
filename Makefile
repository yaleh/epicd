validate-no-status:
	@if grep -rn "^status:" backlog/tasks/ 2>/dev/null | grep -q .; then \
		echo "ERROR: task files must not persist status: field"; \
		grep -rn "^status:" backlog/tasks/; \
		exit 1; \
	fi
	@echo "OK: no status: field in task frontmatter"
