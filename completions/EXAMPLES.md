# Zsh Completion Examples

This document demonstrates how the zsh completion script works for the epicd CLI.

## How It Works

When you press TAB in zsh, the completion system:

1. Captures the current command line buffer (`$BUFFER`)
2. Captures the cursor position (`$CURSOR`)
3. Calls the `_epicd` completion function
4. The function runs: `epicd completion __complete "$BUFFER" "$CURSOR"`
5. Parses the newline-separated completions
6. Presents them using `_describe`

## Example Scenarios

### Top-Level Commands

**Input:**
```bash
epicd <TAB>
```

**What happens internally:**
- Buffer: `"epicd "`
- Cursor: `8` (position after the space)
- CLI returns: `task\ndoc\nboard\nconfig\ncompletion`
- Zsh shows: `task  doc  board  config  completion`

### Subcommands

**Input:**
```bash
epicd task <TAB>
```

**What happens internally:**
- Buffer: `"epicd task "`
- Cursor: `13`
- CLI returns: `create\nedit\nview\nlist\nsearch\narchive`
- Zsh shows: `create  edit  view  list  search  archive`

### Flags

**Input:**
```bash
epicd task create --<TAB>
```

**What happens internally:**
- Buffer: `"epicd task create --"`
- Cursor: `22`
- CLI returns: `--title\n--description\n--priority\n--status\n--assignee\n--labels`
- Zsh shows: `--title  --description  --priority  --status  --assignee  --labels`

### Dynamic Task ID Completion

**Input:**
```bash
epicd task edit <TAB>
```

**What happens internally:**
- Buffer: `"epicd task edit "`
- Cursor: `18`
- CLI scans backlog directory for tasks
- CLI returns: `task-1\ntask-2\ntask-308\ntask-308.01\n...`
- Zsh shows: `task-1  task-2  task-308  task-308.01  ...`

### Flag Value Completion

**Input:**
```bash
epicd task edit task-308 --status <TAB>
```

**What happens internally:**
- Buffer: `"epicd task edit task-308 --status "`
- Cursor: `37`
- CLI recognizes `--status` flag
- CLI returns: `To Do\nIn Progress\nDone`
- Zsh shows: `To Do  In Progress  Done`

### Partial Completion

**Input:**
```bash
epicd task cr<TAB>
```

**What happens internally:**
- Buffer: `"epicd task cr"`
- Cursor: `15`
- Partial word: `"cr"`
- CLI filters subcommands starting with "cr"
- CLI returns: `create`
- Zsh completes to: `epicd task create`

## Testing the Completion

### Manual Testing

1. Load the completion:
   ```bash
   source completions/_epicd
   ```

2. Try various completions:
   ```bash
   epicd <TAB>
   epicd task <TAB>
   epicd task create --<TAB>
   ```

### Testing Without Zsh

You can test the backend directly:

```bash
# Test top-level commands
epicd completion __complete "epicd " 8

# Test subcommands
epicd completion __complete "epicd task " 13

# Test with partial input
epicd completion __complete "epicd ta" 10

# Test flag completion
epicd completion __complete "epicd task create --" 22
```

## Advanced Features

### Context-Aware Completion

The completion system understands context:

```bash
# After --status flag, only show valid statuses
epicd task create --status <TAB>
# Shows: To Do, In Progress, Done

# After --priority flag, only show valid priorities
epicd task create --priority <TAB>
# Shows: high, medium, low

# For task ID arguments, show actual task IDs
epicd task edit <TAB>
# Shows: task-1, task-2, task-308, ...
```

### Multi-Word Arguments

Zsh handles multi-word arguments automatically:

```bash
epicd task create --title "My Task" --status <TAB>
# Correctly identifies we're completing after --status
```

### Error Handling

If the CLI fails or returns no completions:

```bash
epicd nonexistent <TAB>
# No completions shown, no error message
# The shell stays responsive
```

This is handled by:
- `2>/dev/null` - suppresses error output
- `return 1` - tells zsh no completions available
- Graceful fallback to default file/directory completion

## Performance

The completion system is designed to be fast:

- Completions are generated on-demand
- Results are not cached (always current)
- CLI execution is optimized for quick response
- Typical completion time: < 100ms

For large backlogs with many tasks, you may notice a slight delay when completing task IDs, but the system remains responsive.

## Debugging

If completions aren't working:

1. Check the function is loaded:
   ```bash
   which _epicd
   # Should output the function definition
   ```

2. Test the backend directly:
   ```bash
   epicd completion __complete "epicd " 8
   # Should output: task, doc, board, config, completion
   ```

3. Enable zsh completion debugging:
   ```bash
   zstyle ':completion:*' verbose yes
   zstyle ':completion:*' format 'Completing %d'
   ```

4. Check for errors:
   ```bash
   # Remove 2>/dev/null temporarily to see errors
   _epicd() {
       local completions=(${(f)"$(epicd completion __complete "$BUFFER" "$CURSOR")"})
       _describe 'epicd commands' completions
   }
   ```
