# Glossary

**overdue**: a todo that is not done and has a `dueDate` strictly before today's date in UTC. A todo due today is not overdue, and neither is one with no date or one marked done. "Today" is the UTC day on the server, not the caller's local day, so a caller west of UTC can see a todo as overdue in the evening of its due date.
