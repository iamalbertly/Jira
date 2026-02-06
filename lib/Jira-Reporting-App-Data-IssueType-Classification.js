/**
 * Issue type classification for current-sprint and reporting.
 * SSOT for story/work-item/subtask and feature/support buckets. Used by lib/currentSprint.js.
 */

function normalizeIssueTypeName(issue) {
  return (issue?.fields?.issuetype?.name || '').toLowerCase();
}

export function isStoryIssue(issue) {
  const type = normalizeIssueTypeName(issue);
  return type.includes('story');
}

export function isWorkItemIssue(issue) {
  const type = normalizeIssueTypeName(issue);
  if (!type) return false;
  if (type.includes('sub-task') || type.includes('subtask')) return false;
  return true;
}

export function classifyIssueTypeForSplit(issue) {
  const type = normalizeIssueTypeName(issue);
  if (!type) return 'support';
  if (type.includes('bug') || type.includes('support') || type.includes('ops') || type.includes('operation')) {
    return 'support';
  }
  if (type.includes('task') || type.includes('chore') || type.includes('maintenance')) {
    return 'support';
  }
  if (type.includes('story') || type.includes('feature') || type.includes('improvement')) {
    return 'feature';
  }
  return 'support';
}

export function isSubtaskIssue(issue) {
  const type = normalizeIssueTypeName(issue);
  return type.includes('sub-task') || type.includes('subtask');
}
