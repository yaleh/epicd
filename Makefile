install-user:
	bash scripts/install/install.sh --scope user

install-project:
	bash scripts/install/install.sh --scope project

uninstall-user:
	bash scripts/install/uninstall.sh --scope user

uninstall-project:
	bash scripts/install/uninstall.sh --scope project

validate:
	@find plugin/skills -name "SKILL.md" | sed 's|plugin/skills/||; s|/SKILL.md||' | sort > /tmp/epicd-skills.txt; \
	python3 -c "import json; d=json.load(open('plugin/.claude-plugin/plugin.json')); [print(c.replace('./skills/','').replace('/SKILL.md','')) for c in d['commands']]" | sort > /tmp/epicd-commands.txt; \
	MISSING=$$(comm -23 /tmp/epicd-skills.txt /tmp/epicd-commands.txt); \
	DEAD=$$(comm -13 /tmp/epicd-skills.txt /tmp/epicd-commands.txt); \
	if [ -n "$$MISSING" ] || [ -n "$$DEAD" ]; then \
		[ -n "$$MISSING" ] && echo "MISSING from plugin.json commands:" && echo "$$MISSING"; \
		[ -n "$$DEAD" ] && echo "DEAD entries in plugin.json (no SKILL.md):" && echo "$$DEAD"; \
		rm -f /tmp/epicd-skills.txt /tmp/epicd-commands.txt; \
		exit 1; \
	fi; \
	COUNT=$$(wc -l < /tmp/epicd-skills.txt | tr -d ' '); \
	rm -f /tmp/epicd-skills.txt /tmp/epicd-commands.txt; \
	echo "OK: all $$COUNT skills covered in plugin.json"

validate-no-status:
	@if grep -rn "^status:" .epicd/tasks/ 2>/dev/null | grep -q .; then \
		echo "ERROR: task files must not persist status: field"; \
		grep -rn "^status:" .epicd/tasks/; \
		exit 1; \
	fi
	@echo "OK: no status: field in task frontmatter"
