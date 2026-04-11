// Feedback & Bug Reporting Utilities
// Opens pre-filled GitHub issue pages for bug reports and feature requests.

const GITHUB_REPO = 'TheConflux-Core/conflux-home';

/**
 * Opens a pre-filled GitHub bug report issue in a new tab.
 * Collects environment info (platform, user agent) automatically.
 */
export function openBugReport() {
  const platform = navigator.platform || 'Unknown';
  const userAgent = navigator.userAgent;

  const template = `### Describe the bug
[Clear description]

### Steps to reproduce
1. 
2. 
3. 

### Expected behavior

### Actual behavior

### Environment
- Platform: ${platform}
- Version: 0.1.0
- User Agent: ${userAgent}

### Additional context
`;

  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: '[Bug] ',
    labels: 'bug',
  });

  const url = `https://github.com/${GITHUB_REPO}/issues/new?${params}`;
  window.open(url, '_blank');
}

/**
 * Opens the GitHub feature request issue form in a new tab.
 */
export function openFeatureRequest() {
  const url = `https://github.com/${GITHUB_REPO}/issues/new?template=feature_request.yml`;
  window.open(url, '_blank');
}
